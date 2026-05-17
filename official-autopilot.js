class OfficialAutopilot {
  constructor(options = {}) {
    this.maxAutoResolveSteps = options.maxAutoResolveSteps || 1000;
    this.maxActionsPerTurn = options.maxActionsPerTurn || 20;
  }

  opponent(playerId) {
    return playerId === 'p1' ? 'p2' : 'p1';
  }

  cardType(g, card) {
    if (!card) return '';
    if (typeof g.getCardTypeText === 'function') return g.getCardTypeText(card);
    return String(card.type || card.cardType || '').toLowerCase();
  }

  isDigimon(g, card) {
    return typeof g.isDigimonLike === 'function'
      ? g.isDigimonLike(card)
      : this.cardType(g, card).includes('digimon');
  }

  isTamer(g, card) {
    return typeof g.isTamerLike === 'function'
      ? g.isTamerLike(card)
      : this.cardType(g, card).includes('tamer');
  }

  isOption(g, card) {
    return typeof g.isOptionLike === 'function'
      ? g.isOptionLike(card)
      : this.cardType(g, card).includes('option');
  }

  level(g, card) {
    return typeof g.getLv === 'function' ? g.getLv(card) : (Number(card?.level) || 0);
  }

  dp(g, card) {
    return typeof g.getDp === 'function' ? g.getDp(card) : (Number(card?.dp) || 0);
  }

  playCost(g, card) {
    return typeof g.getPrintedPlayCost === 'function' ? g.getPrintedPlayCost(card) : (Number(card?.playCost) || 0);
  }

  digivolveCost(g, card) {
    const raw = typeof g.getPrintedDigivolveCost === 'function' ? g.getPrintedDigivolveCost(card) : (Number(card?.digivolveCost) || 0);
    return typeof g.parseSpecialDigivolutionCost === 'function' ? g.parseSpecialDigivolutionCost(card, raw) : raw;
  }

  keywords(g, card) {
    return typeof g.getKeywords === 'function' ? (g.getKeywords(card) || {}) : {};
  }

  canPay(g, playerId, cost) {
    return typeof g.canPay === 'function' ? g.canPay(playerId, cost) : true;
  }

  wouldPassTurn(g, playerId, cost) {
    const delta = playerId === 'p1' ? -cost : cost;
    const projected = Number(g.memory || 0) + delta;
    return playerId === 'p1' ? projected < 0 : projected > 0;
  }

  hasWork(g) {
    return !!(g.hasPendingResolution?.() || g.counterTiming?.isActive || g.pendingEndPhase || g.effectQueue?.length);
  }

  chooseTotalWithinLimit(cards, metric, limit) {
    const ranked = [...cards].sort((a, b) => {
      const av = metric === 'dp' ? (Number(a.dp) || 0) : (Number(a.playCost) || 0);
      const bv = metric === 'dp' ? (Number(b.dp) || 0) : (Number(b.playCost) || 0);
      return bv - av;
    });
    let sum = 0;
    const out = [];
    for (const card of ranked) {
      const value = metric === 'dp' ? (Number(card.dp) || 0) : (Number(card.playCost) || 0);
      if (value >= 0 && sum + value <= limit) {
        out.push(card.instanceId);
        sum += value;
      }
    }
    return out;
  }

  rankChoiceCards(g, playerId, cards) {
    const own = playerId;
    return [...cards].sort((a, b) => this.cardValue(g, own, b) - this.cardValue(g, own, a));
  }

  autoResolve(g) {
    const events = [];
    let step = 0;
    for (; step < this.maxAutoResolveSteps; step++) {
      if (g.pendingEffectSelection) {
        const p = g.pendingEffectSelection.playerId;
        const effects = g.pendingEffectSelection.effects || [];
        if (!effects.length) {
          g.pendingEffectSelection = null;
          continue;
        }
        events.push(`confirm:${effects[0].sourceName || 'effect'}`);
        g.resolveManualEffect(p, 0, true);
        continue;
      }

      if (g.pendingReveal && !g.pendingReveal.resolved) {
        const p = g.pendingReveal.playerId;
        const payload = [];
        const used = new Set();
        for (const slot of g.pendingReveal.selections || []) {
          const legal = (g.pendingReveal.revealedCards || []).filter(c => !used.has(c.instanceId) && g.cardMatchesTarget(c, slot.target));
          const ranked = this.rankChoiceCards(g, p, legal);
          const maxCount = slot.count === 'all' ? ranked.length : Number(slot.count || 1);
          const take = ranked.slice(0, maxCount).map(c => c.instanceId);
          take.forEach(id => used.add(id));
          payload.push(take);
        }
        events.push(`reveal:${payload.flat().length}`);
        g.resolveRevealSelection(p, payload);
        continue;
      }

      if (g.pendingTarget) {
        const p = g.pendingTarget.playerId;
        const candidates = Array.isArray(g.pendingTarget.candidates) ? g.pendingTarget.candidates : [];
        const ranked = this.rankTargetsForAction(g, p, candidates, g.pendingTarget.actionType || '');
        events.push(`target:${g.pendingTarget.actionType || '?'}:${ranked.length}`);
        g.submitTarget(p, ranked[0]?.instanceId || null);
        continue;
      }

      if (g.pendingChoice) {
        const p = g.pendingChoice.playerId;
        const mode = g.pendingChoice.mode || g.pendingChoice.choiceType;
        const cards = ['PLACE_SOURCE_ATTACH_TARGET', 'STRUCTURED_ZONE_CHOICE'].includes(mode)
          ? (g.pendingChoice.cards || [])
          : (g.getPendingChoiceV3Cards ? g.getPendingChoiceV3Cards(g.pendingChoice) : (g.pendingChoice.cards || []));
        const ranked = this.rankChoiceCards(g, p, cards);
        let payload = ranked[0]?.instanceId || null;
        if (mode && String(mode).includes('TOTAL')) {
          const metric = String(mode).includes('DP') || g.pendingChoice.totalMetric === 'dp' ? 'dp' : 'playCost';
          const limit = Number(g.pendingChoice.totalLimit ?? g.pendingChoice.totalDp ?? g.pendingChoice.totalPlayCost ?? 999999);
          payload = this.chooseTotalWithinLimit(ranked, metric, limit);
        } else if (mode === 'MODAL_EFFECT_CHOICE') {
          payload = (g.pendingChoice.cards || [])[0]?.instanceId || (g.pendingChoice.cards || [])[0]?.id || null;
        } else if (mode === 'STRUCTURED_ZONE_CHOICE') {
          payload = ranked.slice(0, 1).map(c => c.instanceId || c.id).filter(Boolean);
        }
        events.push(`choice:${mode || '?'}:${Array.isArray(payload) ? payload.length : (payload ? 1 : 0)}`);
        g.submitChoice(p, payload);
        continue;
      }

      if (g.pendingTrashRevive) {
        const p = g.pendingTrashRevive.playerId;
        const candidates = g.pendingTrashRevive.cards || g.pendingTrashRevive.candidates || [];
        const ranked = this.rankChoiceCards(g, p, candidates);
        events.push('trashRevive');
        g.submitTrashRevive(p, ranked[0]?.instanceId || null);
        continue;
      }

      if (g.pendingProtection) {
        const p = g.pendingProtection.playerId;
        const card = g.pendingProtection.card || g.pendingProtection.target || null;
        const shouldProtect = !!card && this.cardValue(g, p, card) >= 75;
        events.push(`protection:${shouldProtect}`);
        g.submitProtectionChoice(p, shouldProtect);
        continue;
      }

      if (g.counterTiming?.isActive) {
        const defender = g.counterTiming.defenderId;
        const stepName = g.counterTiming.step;
        if (stepName === 'COUNTER') {
          events.push('counter:pass');
          g.resolveCounter(defender, 'PASS', null);
          continue;
        }
        if (stepName === 'WAIT_COUNTER_EFFECT') {
          events.push('counter:advance');
          if (!g.advanceCounterTimingIfReady()) break;
          continue;
        }
        if (stepName === 'BLOCKER') {
          const blocker = this.chooseBlocker(g, defender);
          if (blocker) {
            events.push(`blocker:${blocker.name}`);
            g.performBlock(defender, blocker.instanceId);
          } else {
            events.push('blocker:skip');
            g.skipBlock(defender);
          }
          continue;
        }
        if (stepName === 'DAMAGE_STEP' && g.effectQueue.length === 0) {
          events.push('damage:execute');
          g.executePendingAttack();
          continue;
        }
        if (stepName === 'WHEN_ATTACKING' && !g.hasPendingResolution()) {
          events.push('attackTiming:toCounter');
          g.counterTiming.step = 'COUNTER';
          continue;
        }
      }

      if (g.pendingEndPhase) {
        if (!g.continuePendingEndPhase()) break;
        continue;
      }
      if (g.effectQueue.length > 0) {
        g.resolveEffect();
        continue;
      }
      break;
    }
    if (step >= this.maxAutoResolveSteps) events.push('autoResolve:max');
    return events;
  }

  chooseBlocker(g, defender) {
    const pending = g.counterTiming?.pendingAttack;
    if (!pending) return null;
    const candidates = typeof g.getLegalBlockers === 'function'
      ? g.getLegalBlockers(defender)
      : (g.zones[defender]?.battleArea || []).filter(c => this.keywords(g, c).blocker && !c.isSuspended);
    if (!candidates.length) return null;
    const attacker = (g.zones[pending.attackerId]?.battleArea || []).find(c => c.instanceId === pending.attackerInstanceId);
    const attackerThreat = this.cardValue(g, pending.attackerId, attacker);
    const defenderSecurity = g.zones[defender]?.security?.length || 0;
    if (pending.targetType === 'player' && defenderSecurity <= 1) {
      return candidates.sort((a, b) => this.cardValue(g, defender, a) - this.cardValue(g, defender, b))[0];
    }
    if (attackerThreat >= 100) {
      return candidates.sort((a, b) => this.cardValue(g, defender, a) - this.cardValue(g, defender, b))[0];
    }
    return null;
  }

  rankTargetsForAction(g, playerId, candidates, actionType) {
    const destructive = /DELETE|BOUNCE|RETURN|DE-?DIGIVOLVE|DP|SUSPEND|TRASH/i.test(String(actionType || ''));
    return [...candidates].sort((a, b) => {
      const av = this.cardValue(g, playerId, a);
      const bv = this.cardValue(g, playerId, b);
      return destructive ? bv - av : av - bv;
    });
  }

  cardValue(g, playerId, card) {
    if (!card) return 0;
    const lv = this.level(g, card);
    const dp = this.dp(g, card);
    const kw = this.keywords(g, card);
    let score = 0;
    if (this.isDigimon(g, card)) score += 15 + lv * 14 + Math.min(25, dp / 1000);
    if (this.isTamer(g, card)) score += 45;
    if (this.isOption(g, card)) score += 20;
    if (Array.isArray(card.stack)) score += Math.min(25, card.stack.length * 5);
    if (kw.blocker) score += 12;
    if (kw.jamming) score += 8;
    if (kw.piercing) score += 8;
    if (kw.rush) score += 10;
    if (kw.blitz) score += 10;
    if (kw.securityAttackPlus || kw.securityAttack) score += 12;
    if (card.isSuspended) score -= 4;
    if (card.playedThisTurn) score -= 8;
    return score;
  }

  canDeclarePlayerAttack(g, playerId, attacker) {
    if (!this.isDigimon(g, attacker)) return false;
    if (attacker.isSuspended) return false;
    if (attacker.playedThisTurn && !this.keywords(g, attacker).rush) return false;
    if (typeof g.canSuspendCard === 'function' && !g.canSuspendCard(playerId, attacker, { reason: 'attack declaration', silent: true })) return false;
    const gate = g.canDeclareAttackAgainst(playerId, attacker, 'player');
    return gate === true || gate?.ok === true;
  }

  canDeclareDigimonAttack(g, playerId, attacker, target) {
    if (!this.isDigimon(g, attacker) || !this.isDigimon(g, target)) return false;
    if (attacker.isSuspended) return false;
    if (attacker.playedThisTurn && !this.keywords(g, attacker).rush) return false;
    if (typeof g.canSuspendCard === 'function' && !g.canSuspendCard(playerId, attacker, { reason: 'attack declaration', silent: true })) return false;
    const attackGate = g.canDeclareAttackAgainst(playerId, attacker, 'digimon');
    if (!(attackGate === true || attackGate?.ok === true)) return false;
    const targetGate = g.canAttackTargetDigimon(playerId, attacker, this.opponent(playerId), target);
    return targetGate === true || targetGate?.ok === true;
  }

  enumerateAttackActions(g, playerId, context = {}) {
    const actions = [];
    const opponent = this.opponent(playerId);
    const own = g.zones[playerId]?.battleArea || [];
    const opp = g.zones[opponent]?.battleArea || [];
    const oppSecurity = g.zones[opponent]?.security?.length || 0;
    const attacked = context.attackedInstances || new Set();
    for (const attacker of own) {
      if (attacked.has(attacker.instanceId)) continue;
      if (this.canDeclarePlayerAttack(g, playerId, attacker)) {
        const pressure = oppSecurity <= 0 ? 10000 : 180 - oppSecurity * 20;
        actions.push({
          type: 'attack-player',
          label: `Attack: ${attacker.name} attacks player`,
          attackerInstanceId: attacker.instanceId,
          score: pressure + this.cardValue(g, playerId, attacker),
          execute: () => g.declareAttack(playerId, attacker.instanceId, 'player', null)
        });
      }
      for (const target of opp) {
        if (!this.canDeclareDigimonAttack(g, playerId, attacker, target)) continue;
        const battleGood = this.dp(g, attacker) >= this.dp(g, target) || this.keywords(g, attacker).retaliation;
        const score = (battleGood ? 120 : 30) + this.cardValue(g, opponent, target) - this.cardValue(g, playerId, attacker) * 0.35;
        actions.push({
          type: 'attack-digimon',
          label: `Attack: ${attacker.name} attacks ${target.name}`,
          attackerInstanceId: attacker.instanceId,
          score,
          execute: () => g.declareAttack(playerId, attacker.instanceId, 'digimon', target.instanceId)
        });
      }
    }
    return actions.sort((a, b) => b.score - a.score);
  }

  canNormalDigivolve(g, playerId, handCard, baseCard) {
    if (!this.isDigimon(g, handCard)) return false;
    if (!baseCard || !this.isDigimon(g, baseCard) && !this.isTamer(g, baseCard)) return false;
    if (typeof g.standardDigivolutionRequirementsMet === 'function' && !g.standardDigivolutionRequirementsMet(baseCard, handCard, {})) return false;
    const cost = this.digivolveCost(g, handCard);
    return this.canPay(g, playerId, cost);
  }

  canNormalPlay(g, playerId, handCard) {
    if (this.isOption(g, handCard)) return typeof g.canUseOptionCard === 'function' && g.canUseOptionCard(playerId, handCard, { from: 'hand' }) && this.canPay(g, playerId, this.playCost(g, handCard));
    if (typeof g.canGenericPlayCard === 'function' && !g.canGenericPlayCard(handCard, { from: 'hand' }, playerId)) return false;
    if (this.cardType(g, handCard).includes('digi-egg')) return false;
    return this.canPay(g, playerId, this.playCost(g, handCard));
  }

  enumerateMainActions(g, playerId) {
    if (g.isMemoryOnOpponentSide?.(playerId)) return [];
    const zone = g.zones[playerId] || {};
    const hand = zone.hand || [];
    const bases = [...(zone.breedingArea || []), ...(zone.battleArea || [])];
    const actions = [];

    for (const handCard of hand) {
      for (const base of bases) {
        if (!this.canNormalDigivolve(g, playerId, handCard, base)) continue;
        const cost = this.digivolveCost(g, handCard);
        const intoLv = this.level(g, handCard);
        const inBreeding = (zone.breedingArea || []).some(c => c.instanceId === base.instanceId);
        actions.push({
          type: 'digivolve',
          label: `Main: digivolve ${base.name} into ${handCard.name}`,
          score: 260 + intoLv * 30 - cost * 8 + (inBreeding ? 20 : 0) + (this.wouldPassTurn(g, playerId, cost) ? -20 : 25),
          execute: () => g.playOrEvolve(playerId, handCard, 'hand', base.instanceId, false)
        });
      }

      if (!this.canNormalPlay(g, playerId, handCard)) continue;
      const cost = this.playCost(g, handCard);
      const ownDigimon = (zone.battleArea || []).filter(c => this.isDigimon(g, c)).length + (zone.breedingArea || []).filter(c => this.isDigimon(g, c)).length;
      const typeBonus = this.isTamer(g, handCard) ? 95 : this.isOption(g, handCard) ? 60 : 70;
      const curveBonus = this.isDigimon(g, handCard) && this.level(g, handCard) <= 3 && ownDigimon === 0 ? 120 : 0;
      actions.push({
        type: this.isOption(g, handCard) ? 'option' : 'play',
        label: `Main: play/use ${handCard.name}`,
        score: typeBonus + curveBonus + this.cardValue(g, playerId, handCard) - cost * 10 + (this.wouldPassTurn(g, playerId, cost) ? -35 : 20),
        execute: () => g.playOrEvolve(playerId, handCard, 'hand', null, false)
      });
    }

    return actions.sort((a, b) => b.score - a.score);
  }

  enumerateBreedingActions(g, playerId) {
    if (g.turnPlayer !== playerId || g.phase !== 'HATCH' || g.hasActionedInHatch) return [];
    const zone = g.zones[playerId] || {};
    if ((zone.breedingArea || []).length === 0 && (zone.eggDeck || []).length > 0) {
      return [{
        type: 'hatch',
        label: 'Breeding: hatch 1 Digi-Egg',
        score: 100,
        execute: () => g.hatchEgg(playerId)
      }];
    }
    const top = (zone.breedingArea || [])[0];
    if (top && this.level(g, top) >= 3) {
      return [{
        type: 'move-breeding',
        label: `Breeding: move ${top.name} to battle area`,
        score: 90 + this.cardValue(g, playerId, top),
        execute: () => g.moveBreedingToBattle(playerId)
      }];
    }
    return [];
  }

  chooseBest(actions, predicate = () => true) {
    return actions.filter(predicate).sort((a, b) => b.score - a.score)[0] || null;
  }

  takeTurn(g, playerId, turnNo) {
    const startLog = g.actionLogs.length;
    const decisions = [];
    if (g.turnPlayer !== playerId) return { turnNo, player: playerId, skipped: true };

    if (g.phase !== 'MAIN' && g.phase !== 'HATCH') g.enterMainPhase(playerId);
    this.autoResolve(g);

    const breeding = this.chooseBest(this.enumerateBreedingActions(g, playerId));
    if (breeding && !this.hasWork(g)) {
      breeding.execute();
      decisions.push(breeding.label);
      this.autoResolve(g);
    } else if (g.phase === 'HATCH') {
      g.enterMainPhase(playerId);
      this.autoResolve(g);
    }

    let actionCount = 0;
    const turnContext = { attackedInstances: new Set() };
    while (!g.gameOver && !this.hasWork(g) && actionCount++ < this.maxActionsPerTurn) {
      const lethal = this.chooseBest(this.enumerateAttackActions(g, playerId, turnContext), a => a.type === 'attack-player' && (g.zones[this.opponent(playerId)]?.security?.length || 0) <= 0);
      if (lethal) {
        lethal.execute();
        if (lethal.attackerInstanceId) turnContext.attackedInstances.add(lethal.attackerInstanceId);
        decisions.push(lethal.label);
        this.autoResolve(g);
        continue;
      }

      const main = this.chooseBest(this.enumerateMainActions(g, playerId));
      if (main && main.score >= 65) {
        main.execute();
        decisions.push(main.label);
        this.autoResolve(g);
        continue;
      }

      const attack = this.chooseBest(this.enumerateAttackActions(g, playerId, turnContext));
      if (attack && attack.score >= 80) {
        attack.execute();
        if (attack.attackerInstanceId) turnContext.attackedInstances.add(attack.attackerInstanceId);
        decisions.push(attack.label);
        this.autoResolve(g);
        continue;
      }

      break;
    }

    if (!g.gameOver && !this.hasWork(g)) {
      decisions.push('End: pass turn');
      g.passTurn();
      this.autoResolve(g);
    }

    const summary = g.getDebugSummary();
    return {
      turnNo,
      player: playerId,
      decisions,
      memory: summary.memory,
      nextPlayer: summary.turnPlayer,
      phase: summary.phase,
      pending: summary.pending,
      zones: summary.zones,
      logs: g.actionLogs.slice(startLog)
    };
  }
}

function createOfficialAutopilot(options = {}) {
  return new OfficialAutopilot(options);
}

module.exports = { OfficialAutopilot, createOfficialAutopilot };
