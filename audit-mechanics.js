


function auditDeDigivolveReminderTrashSecurityLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/De-?Digivolve/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    let hasFakeTrashSecurity = false;
    let hasDedigivolve = false;
    mechanics.forEach((mech, mi) => {
      const actions = Array.isArray(mech.actions) ? mech.actions : [];
      const mechanicHasDedigivolve = actions.some(action => ['DE_DIGIVOLVE', 'DEDIGIVOLVE'].includes(String(action?.type || '').toUpperCase()));
      if (mechanicHasDedigivolve) hasDedigivolve = true;
      actions.forEach((action, ai) => {
        if (!action) return;
        if (String(action.type || '').toUpperCase() === 'TRASH_SECURITY_STACK' && mechanicHasDedigivolve) {
          const targetText = JSON.stringify(action.target || {});
          const printedSecurityTrash = /trash[^.。!?]*(?:opponent['’]?s\s+)?security\s+stack|security\s+stack[^.。!?]*trash/i.test(text);
          const looksLikeReminderTrash = !printedSecurityTrash || /digimon/i.test(String(action.target?.cardType || targetText || ''));
          if (looksLikeReminderTrash) {
            hasFakeTrashSecurity = true;
            issues.semanticIssues.deDigivolveReminderTrashSecurityLeak.push({
              id: card.id,
              name: card.name,
              mechanicIndex: mi,
              actionIndex: ai,
              reason: 'Printed De-Digivolve reminder text must not be encoded as TRASH_SECURITY_STACK in the same De-Digivolve mechanic; only explicit security-trash text may use it.'
            });
          }
        }
      });
    });
    if (hasFakeTrashSecurity && !hasDedigivolve) {
      issues.semanticIssues.deDigivolveReminderTrashSecurityLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed De-Digivolve text has fake security-trash encoding and is missing DE_DIGIVOLVE.'
      });
    }
  }
}

function auditActivationLockEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    if (!/(?:can[’']?t|cannot|don[’']t|do not) activate[^.]*\[(?:When Digivolving|When Attacking|On Play|Security)\]/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    let hasPlaceholderActivationKeyword = /NO_WHEN_DIGIVOLVING|cannot activate when digivolving|can't activate effects/i.test(blob);
    mechanics.forEach(mech => (Array.isArray(mech.actions) ? mech.actions : []).forEach(action => {
      const keyword = String(action?.keyword || action?.buff?.keyword || action?.text || '');
      if (action?.type === 'GRANT_KEYWORD' && /activate|NO_WHEN_DIGIVOLVING/i.test(keyword)) hasPlaceholderActivationKeyword = true;
    }));
    if (hasPlaceholderActivationKeyword) {
      issues.semanticIssues.activationLockEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed activation-lock text must use CANT_ACTIVATE_EFFECT, not placeholder keywords or generic text.' });
    }
    if (!/CANT_ACTIVATE_EFFECT/.test(blob)) {
      issues.semanticIssues.activationLockEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed activation-lock text is missing CANT_ACTIVATE_EFFECT.' });
    }
    if (/played, until your opponent|cards? with the \[Beast\].*are played|trait are played/i.test(text) && !/OWN_CARD_PLAYED/.test(blob)) {
      issues.semanticIssues.activationLockEncodingLeak.push({ id: card.id, name: card.name, reason: 'Played-card activation-lock trigger should listen to OWN_CARD_PLAYED / EVENT_CONTEXT.playedCard.' });
    }
    if (/Tamer cards are placed in this Digimon/i.test(text) && !/SOURCE_PLACED/.test(blob)) {
      issues.semanticIssues.activationLockEncodingLeak.push({ id: card.id, name: card.name, reason: 'Source-placed Tamer activation lock should listen to SOURCE_PLACED.' });
    }
  }
}

function auditSecuritySuppressionEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const lower = text.toLowerCase();
    const mentionsCheckedSecuritySuppression = /security[^.。!?]*(?:effects?\s+on\s+)?(?:option\s+cards?|cards?)\s+checked\s+by\s+this\s+digimon[^.。!?]*(?:don['’]?t|do\s+not|can['’]?t|cannot|can\s*not)\s+activate/.test(lower)
      || /(?:option\s+cards?|cards?)\s+checked\s+by\s+this\s+digimon[^.。!?]*(?:don['’]?t|do\s+not|can['’]?t|cannot|can\s*not)\s+activate/.test(lower);
    if (!mentionsCheckedSecuritySuppression) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/CANT_ACTIVATE_EFFECT/.test(blob)) {
      issues.semanticIssues.securitySuppressionEncodingLeak.push({ id: card.id, name: card.name, reason: 'Checked-security suppression must be encoded with CANT_ACTIVATE_EFFECT on the attacker/host.' });
    }
    if (/option\s+cards?\s+checked\s+by\s+this\s+digimon/i.test(text) && !/affectsSecurityCardTypes[^\]]*option|securityCheckScope/.test(blob)) {
      issues.semanticIssues.securitySuppressionEncodingLeak.push({ id: card.id, name: card.name, reason: 'Option-only checked-security suppression should carry explicit option/card scope metadata.' });
    }
    if (/effects?\s+on\s+cards\s+checked\s+by\s+this\s+digimon/i.test(text) && /RagnaLoardmon/i.test(text)) {
      if (!/"isInherited"\s*:\s*true/.test(blob) || !/RagnaLoardmon/.test(blob) || !/affectsSecurityCardTypes[^\]]*any/.test(blob)) {
        issues.semanticIssues.securitySuppressionEncodingLeak.push({ id: card.id, name: card.name, reason: 'Inherited all-card checked-security suppression should bind to the RagnaLoardmon host and apply to any checked card type.' });
      }
    }
    if (/Raid|Piercing/i.test(text) && /"type"\s*:\s*"MOVE"[\s\S]{0,140}highest_dp|"type"\s*:\s*"DP_MOD"[\s\S]{0,140}"value"\s*:\s*0/.test(blob)) {
      issues.semanticIssues.securitySuppressionEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed Raid/Piercing reminder text must not be encoded as MOVE or zero-DP placeholder mechanics.' });
    }
  }
}


function auditSuppressOnPlayEncodingLeak(cards, issues) {
  const playTypes = new Set(['PLAY_FROM_HAND','PLAY_FROM_TRASH','PLAY_FROM_HAND_OR_SOURCE','PLAY_FROM_HAND_OR_TRASH','PLAY_FROM_HAND_OR_TRASH_OR_SOURCE','PLAY_FROM_SOURCE','PLAY_FROM_SECURITY']);
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    const lower = text.toLowerCase();
    const hasSameEffectSuppression = /\[on play\][^.。!?]*(?:effects?)?[^.。!?]*(?:don't|don[’']t|do not) activate/.test(lower)
      && /played (?:with|by) this effect|played with this effect|played by this effect|tamers played by this effect|digimon played with this effect/.test(lower);
    const hasStaticTamerLock = /opponent'?s tamers? \[on play\] effects? (?:don[’']t|don't|do not) activate/.test(lower);
    if (!hasSameEffectSuppression && !hasStaticTamerLock) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    if (hasSameEffectSuppression) {
      const playActions = [];
      mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
        if (action && playTypes.has(action.type) && String(mech.trigger || '').toUpperCase() !== 'ALL_TURNS') playActions.push({ mech, action, mi, ai });
      }));
      if (playActions.length === 0) {
        // Granted On Deletion templates may place the play action inside GRANT_TRIGGER_EFFECT.actions.
        const nestedHasSuppressedPlay = JSON.stringify(mechanics).includes('"suppressOnPlay"');
        if (!nestedHasSuppressedPlay) issues.semanticIssues.suppressOnPlayEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed same-effect On Play suppression has no suppressed play action.' });
      }
      for (const row of playActions) {
        if (row.action.suppressOnPlay !== true && row.action.noOnPlay !== true) {
          issues.semanticIssues.suppressOnPlayEncodingLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: row.mi,
            actionIndex: row.ai,
            reason: 'Printed “On Play effects on cards played with/by this effect don’t activate” must set suppressOnPlay:true on the play action.'
          });
        }
      }
      mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
        if (action && action.type === 'CANT_ACTIVATE_EFFECT' && /played (?:with|by) this effect/i.test(JSON.stringify(action))) {
          issues.semanticIssues.suppressOnPlayEncodingLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: mi,
            actionIndex: ai,
            reason: 'Same-effect On Play suppression should be attached to the play action, not modeled as a later generic CANT_ACTIVATE_EFFECT.'
          });
        }
      }));
    }
    if (hasStaticTamerLock) {
      const blob = JSON.stringify(mechanics);
      if (!/CANT_ACTIVATE_EFFECT/.test(blob) || !/ON_PLAY/.test(blob) || !/tamer/i.test(blob)) {
        issues.semanticIssues.suppressOnPlayEncodingLeak.push({ id: card.id, name: card.name, reason: 'Static opponent Tamer On Play lock should use CANT_ACTIVATE_EFFECT targeting opponent Tamers with timing ON_PLAY.' });
      }
      if (/round10gResolved/.test(blob) || (blob.match(/"type"\s*:\s*"DRAW"/g) || []).length > 1) {
        issues.semanticIssues.suppressOnPlayEncodingLeak.push({ id: card.id, name: card.name, reason: 'Static opponent Tamer On Play lock should not be corrupted into repeated DRAW placeholder mechanics.' });
      }
    }
  }
}


function auditCantBeDeletedEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    if (!/(?:can['’]?t be deleted|effects? can['’]?t delete|opponent['’]s effects can['’]?t delete|their effects can['’]?t delete)/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (/effects? can['’]?t delete|opponent['’]s effects can['’]?t delete|their effects can['’]?t delete/i.test(text) && !/CANT_BE_DELETED/.test(blob)) {
      issues.semanticIssues.cantBeDeletedEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: "Printed effects-can't-delete protection should use CANT_BE_DELETED with byEffect/opponentEffectsOnly scope."
      });
    }
    mechanics.forEach((mech, mi) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
        if (!action || action.type !== 'PREVENT_LEAVE_PLAY') return;
        const replacementWindow = ['WOULD_BE_DELETED', 'WOULD_LEAVE_BATTLE_AREA'].includes(String(mech.trigger || '').toUpperCase());
        const costedReplacement = !!(action.cost || mech.cost);
        if (replacementWindow || costedReplacement) return;
        issues.semanticIssues.cantBeDeletedEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: "Printed can't-be-deleted status should use CANT_BE_DELETED with battle/effect scope, not broad PREVENT_LEAVE_PLAY."
        });
      });
    });
  }
}

function auditCantBeReturnedEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    if (!/can['’]?t be returned to (?:the )?(?:hand|hands|deck|decks)|effects? can['’]?t return/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/CANT_BE_RETURNED/.test(blob)) {
      issues.semanticIssues.cantBeReturnedEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: "Printed can't-be-returned status should use CANT_BE_RETURNED, not broad leave-play/status placeholders."
      });
    }
    mechanics.forEach((mech, mi) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
        if (!action || !['PREVENT_LEAVE_PLAY','STUN'].includes(action.type)) return;
        issues.semanticIssues.cantBeReturnedEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: "Printed can't-be-returned status should not be approximated with PREVENT_LEAVE_PLAY or STUN."
        });
      });
    });
  }
}

function auditSourceScopedOpponentEffectImmunityLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    const sourceScoped = /opponent'?s\s+digimon'?s\s+effects?|effects?\s+of\s+(?:your\s+opponent'?s|their)\s+digimon/i.test(text);
    if (!sourceScoped) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    const hasUnaffected = /UNAFFECTED_BY_OPPONENT_EFFECTS/.test(blob);
    if (!hasUnaffected) {
      issues.semanticIssues.sourceScopedOpponentEffectImmunityLeak.push({
        id: card.id,
        name: card.name,
        reason: "Printed opponent Digimon-effect immunity should use UNAFFECTED_BY_OPPONENT_EFFECTS, not be omitted or approximated."
      });
    }
    mechanics.forEach((mech, mi) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
        const actionText = JSON.stringify(action || {});
        if (action && action.type === 'GRANT_KEYWORD' && /immune|unaffected/i.test(String(action.buff?.keyword || action.keyword || action.text || ''))) {
          issues.semanticIssues.sourceScopedOpponentEffectImmunityLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: mi,
            actionIndex: ai,
            reason: "Printed opponent-effect immunity should not be encoded as a GRANT_KEYWORD placeholder."
          });
        }
        if (action && action.type === 'UNAFFECTED_BY_OPPONENT_EFFECTS' && !/sourceEffectType|opponent'?s\s+digimon|their\s+digimon|digimon'?s\s+effects/i.test(actionText)) {
          issues.semanticIssues.sourceScopedOpponentEffectImmunityLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: mi,
            actionIndex: ai,
            reason: "Source-scoped immunity must preserve that only opponent Digimon effects are blocked."
          });
        }
      });
    });
  }
}


function auditOpponentEffectImmunityEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    const mentionsOpponentImmunity = /(?:isn['’]?t|aren['’]?t|unaffected|immune|can't be affected|cannot be affected|not affected)[^.。!?]{0,120}(?:opponent|opponent['’]?s|their)[^.。!?]{0,80}(?:effects?|Digimon effects?|Tamer effects?|Option cards?)/i.test(text)
      || /(?:opponent|opponent['’]?s|their)[^.。!?]{0,80}(?:effects?|Digimon effects?|Tamer effects?|Option cards?)[^.。!?]{0,120}(?:don['’]?t|do not|can['’]?t|cannot|isn['’]?t|aren['’]?t)[^.。!?]{0,60}(?:affect|affected)/i.test(text);
    if (!mentionsOpponentImmunity) continue;
    // <Progress> reminder text is implemented as a keyword runtime layer: while
    // attacking, opponent effects don't affect this Digimon. Do not require a
    // separate static UNAFFECTED action for printed keyword reminder text.
    if (/＜\s*Progress\s*＞|<\s*Progress\s*>/i.test(text)) continue;
    // Replacement effects that say a Digimon "doesn't leave" are handled by
    // PREVENT_LEAVE_PLAY, not by general opponent-effect immunity.
    if (/would\s+leave\s+the\s+battle\s+area[^.。!?]*opponent['’]?s\s+effect[^.。!?]*(?:doesn['’]?t|does not)\s+leave/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/UNAFFECTED_BY_OPPONENT_EFFECTS/.test(blob)) {
      issues.semanticIssues.opponentEffectImmunityEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: "Printed opponent-effect immunity should use UNAFFECTED_BY_OPPONENT_EFFECTS, not be omitted or approximated."
      });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      const actionText = JSON.stringify(action || {});
      const keyword = String(action?.keyword || action?.buff?.keyword || action?.text || '');
      if (action?.type === 'GRANT_KEYWORD' && /immune|unaffected|opponent['’]?s effects|opponent['’]?s option|ignoring opponent/i.test(keyword + ' ' + actionText)) {
        issues.semanticIssues.opponentEffectImmunityEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: "Printed opponent-effect immunity must not be encoded as GRANT_KEYWORD placeholder text."
        });
      }
      if (/opponent['’]?s Option cards?/i.test(text) && action?.type === 'UNAFFECTED_BY_OPPONENT_EFFECTS') {
        if (!/option/i.test(actionText)) {
          issues.semanticIssues.opponentEffectImmunityEncodingLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: mi,
            actionIndex: ai,
            reason: "Option-card immunity must preserve Option-card source scope on UNAFFECTED_BY_OPPONENT_EFFECTS."
          });
        }
      }
    }));
  }
}


function auditUnsuspendedAttackPermissionEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/attack[^.。!?]*unsuspended[^.。!?]*Digimon/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (/with no digivolution cards/i.test(text)) {
      if (!/CAN_ATTACK_UNSUSPENDED/.test(blob) || !/maxSourceCount"\s*:\s*0/.test(blob)) {
        issues.semanticIssues.unsuspendedAttackPermissionEncodingLeak.push({
          id: card.id,
          name: card.name,
          reason: 'Printed unsuspended-attack permission restricted to no-source Digimon must use CAN_ATTACK_UNSUSPENDED with maxSourceCount:0.'
        });
      }
    }
    if (/unsuspended\s+level\s+\d+\s+or\s+lower\s+Digimon/i.test(text)) {
      const m = text.match(/unsuspended\s+level\s+(\d+)\s+or\s+lower\s+Digimon/i);
      const lv = m ? m[1] : null;
      if (!/CAN_ATTACK_UNSUSPENDED/.test(blob) || (lv && !new RegExp('maxLevel"\\s*:\\s*' + lv).test(blob))) {
        issues.semanticIssues.unsuspendedAttackPermissionEncodingLeak.push({
          id: card.id,
          name: card.name,
          reason: 'Printed unsuspended-attack permission with a level cap must use CAN_ATTACK_UNSUSPENDED with maxLevel.'
        });
      }
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      const keyword = String(action.keyword || action.buff?.keyword || action.text || '');
      if (action.type === 'GRANT_KEYWORD' && /attack[^.]*unsuspended/i.test(keyword)) {
        issues.semanticIssues.unsuspendedAttackPermissionEncodingLeak.push({ id: card.id, name: card.name, mechanicIndex: mi, actionIndex: ai, reason: 'Unsuspended-Digimon attack permission should use CAN_ATTACK_UNSUSPENDED, not a broad GRANT_KEYWORD attackActive placeholder.' });
      }
      if (action.type === 'MOVE' && /unsuspended/i.test(JSON.stringify(action))) {
        issues.semanticIssues.unsuspendedAttackPermissionEncodingLeak.push({ id: card.id, name: card.name, mechanicIndex: mi, actionIndex: ai, reason: 'Unsuspended-attack permission must not be encoded as MOVE targeting an opponent Digimon.' });
      }
    }));
  }
}


function auditCanOnlyAttackSuspendedDigimonEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/can\s+only\s+attack\s+suspended\s+Digimon/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/CAN_ONLY_ATTACK_SUSPENDED_DIGIMON/.test(blob)) {
      issues.semanticIssues.canOnlyAttackSuspendedDigimonEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed “can only attack suspended Digimon” must use CAN_ONLY_ATTACK_SUSPENDED_DIGIMON, not STUN or broad CANT_ATTACK.'
      });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      if (['STUN','CANT_ATTACK','CANT_ATTACK_PLAYER','CANT_ATTACK_DIGIMON'].includes(String(action.type || '').toUpperCase())) {
        issues.semanticIssues.canOnlyAttackSuspendedDigimonEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: '“Can only attack suspended Digimon” should not be approximated by STUN or generic attack bans; it still allows attacks into suspended Digimon.'
        });
      }
    }));
  }
}


function auditForcedOpponentAttackEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/opponent\s+(?:must\s+)?attacks?\s+with\s+the\s+chosen\s+Digimon|opponent\s+attacks?\s+with\s+chosen\s+Digimon/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (/"type"\s*:\s*"(?:STUN|MOVE|REVEAL_AND_SELECT)"/.test(blob)) {
      issues.semanticIssues.forcedOpponentAttackEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed “your opponent attacks with the chosen Digimon” must not be encoded as STUN, MOVE, or reveal/select placeholder actions.'
      });
    }
    if (!/END_OF_OPPONENTS_TURN/.test(blob)) {
      issues.semanticIssues.forcedOpponentAttackEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed [End of Opponent’s Turn] forced-attack text should use END_OF_OPPONENTS_TURN, not controller END_OF_TURN.'
      });
    }
    if (!/REQUEST_ATTACK_PLAYER/.test(blob) || !/forcedAttack/.test(blob) || !/chooseAttacker/.test(blob) || !/"owner"\s*:\s*"opponent"/.test(blob)) {
      issues.semanticIssues.forcedOpponentAttackEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Forced opponent attack should choose an opponent Digimon and use REQUEST_ATTACK_PLAYER with forcedAttack/chooseAttacker.'
      });
    }
  }
}


function auditColorChangeEncodingLeak(cards, issues) {
  const colorWords = '(?:red|blue|yellow|green|black|purple|white)';
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const lower = text.toLowerCase();
    const mentionsColorTreatment = new RegExp(`this\\s+digimon\\s+is\\s+also\\s+treated\\s+as\\s+(?:a\\s+)?${colorWords}`, 'i').test(text)
      || /change[^.。!?]*color/i.test(text)
      || /also\s+having\s+the\s+colors?\s+of\s+(?:the\s+trashed\s+card|its\s+digivolution\s+cards|this\s+digimon['’]s\s+digivolution\s+cards)/i.test(text)
      || /treated\s+as\s+also\s+having\s+the\s+color\s+of\s+its\s+digivolution\s+cards/i.test(text);
    if (!mentionsColorTreatment) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/COLOR_CHANGE/.test(blob)) {
      issues.semanticIssues.colorChangeEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed color-changing / also-treated-as-color text should use COLOR_CHANGE so runtime color checks can see it.' });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      const type = String(action.type || '').toUpperCase();
      const buff = action.buff || {};
      const keyword = String(action.keyword || buff.keyword || '').toLowerCase();
      const stat = String(action.stat || buff.stat || '').toLowerCase();
      if ((type === 'GRANT_KEYWORD' || type === 'DP_MOD') && (stat === 'color' || /^(red|blue|yellow|green|black|purple|white)$/.test(keyword))) {
        issues.semanticIssues.colorChangeEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Color identity must not be represented as GRANT_KEYWORD or DP_MOD; use COLOR_CHANGE.'
        });
      }
    }));
  }
}


function auditTamerAsDigimonEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/(?:treated as|treat(?:ed)?)[^.。!?]{0,160}\d{3,5}\s*DP\s+Digimon|\d{3,5}\s*DP\s+Digimon/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/TREAT_AS_DIGIMON/.test(blob)) {
      issues.semanticIssues.tamerAsDigimonEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed Tamer-as-X-DP-Digimon text must use TREAT_AS_DIGIMON, not only DP_MOD or MOVE placeholders.' });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      const type = String(action.type || '').toUpperCase();
      const actionText = JSON.stringify(action || {});
      if (type === 'MOVE' && /tamer|Marcus Damon|Spencer Damon/i.test(actionText)) {
        issues.semanticIssues.tamerAsDigimonEncodingLeak.push({ id: card.id, name: card.name, mechanicIndex: mi, actionIndex: ai, reason: 'Tamer-as-Digimon text should not be encoded as MOVE; the Tamer stays in battle area and gains Digimon status.' });
      }
      if (type === 'DP_MOD' && /tamer|Marcus Damon|Spencer Damon/i.test(actionText) && action.setDp !== true) {
        issues.semanticIssues.tamerAsDigimonEncodingLeak.push({ id: card.id, name: card.name, mechanicIndex: mi, actionIndex: ai, reason: 'Tamer-as-Digimon text should not be represented by plain DP_MOD; use TREAT_AS_DIGIMON with fixed DP.' });
      }
    }));
  }
}

function auditZeroDpPlaceholderLeak(cards, issues) {
  for (const card of cards) {
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action || String(action.type || '').toUpperCase() !== 'DP_MOD') return;
      const raw = action.amount ?? action.value ?? action.buff?.value;
      if (Number(raw) === 0 && action.setDp !== true) {
        issues.semanticIssues.zeroDpPlaceholderLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'DP_MOD with value/amount 0 is a semantic placeholder and should be removed or replaced with the real rule action.'
        });
      }
    }));
  }
}



function auditAttackTargetMoveEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/(?:change|switch)\s+(?:the\s+)?attack\s+target|attack\s+target\s+to/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      if (String(action.type || '').toUpperCase() === 'MOVE') {
        issues.semanticIssues.attackTargetMoveEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Printed attack-target change/switch text must use CHANGE_ATTACK_TARGET/REDIRECT_ATTACK_TARGET, not MOVE placeholder mechanics.'
        });
      }
    }));
  }
}

function auditEffectAttackMoveEncodingLeak(cards, issues) {
  const attackRequestTypes = new Set(['REQUEST_ATTACK', 'REQUEST_ATTACK_PLAYER', 'REQUEST_ATTACK_DIGIMON']);
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const mentionsEffectAttack = /(?:may\s+attack|that\s+Digimon\s+attacks|this\s+Digimon\s+may\s+attack|your\s+opponent\s+attacks\s+with|＜Execute＞|<Execute>)/i.test(text);
    if (!mentionsEffectAttack) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    let hasMoveAttack = false;
    let hasRequest = false;
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      const type = String(action.type || '').toUpperCase();
      if (attackRequestTypes.has(type)) hasRequest = true;
      if (type === 'MOVE') {
        const blob = JSON.stringify(action || {});
        if (/battle|attacking|player|opponent/i.test(blob) || /may\s+attack|that\s+Digimon\s+attacks|your\s+opponent\s+attacks\s+with|＜Execute＞|<Execute>/i.test(text)) {
          hasMoveAttack = true;
          issues.semanticIssues.effectAttackMoveEncodingLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex: mi,
            actionIndex: ai,
            reason: 'Effect-created attack text must use REQUEST_ATTACK/REQUEST_ATTACK_PLAYER/REQUEST_ATTACK_DIGIMON, not MOVE placeholder mechanics.'
          });
        }
      }
    }));
    if (hasMoveAttack && !hasRequest) {
      issues.semanticIssues.effectAttackMoveEncodingLeak.push({ id: card.id, name: card.name, reason: 'MOVE-based effect attack has no real REQUEST_ATTACK replacement.' });
    }
  }
}

function auditEndAttackManualLeak(cards, issues) {
  const gs = getGameStateTextForAudit();
  if (!/queueEndAttackByEffect/.test(gs) || !/endCurrentAttackByEffectNow/.test(gs) || !/end_attack_by_effect/.test(gs)) {
    issues.semanticIssues.endAttackManualLeak.push({
      id: 'GAME_STATE',
      name: 'End attack runtime',
      reason: 'Printed “end the attack” effects need a real END_ATTACK runtime path that cancels Counter/Blocker/battle handoff commands.'
    });
  }
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/end (?:the|that|this) attack/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/END_ATTACK/.test(blob)) {
      issues.semanticIssues.endAttackManualLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed “end the attack” text must use END_ATTACK, not MANUAL_REQUIRED or an omitted mechanic.'
      });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      if (String(action.type || '').toUpperCase() === 'MANUAL_REQUIRED' && /end (?:the|that|this) attack/i.test(JSON.stringify(action))) {
        issues.semanticIssues.endAttackManualLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'End-the-attack text is still a MANUAL_REQUIRED placeholder.'
        });
      }
    }));
  }
}


function auditBreedingMoveEncodingLeak(cards, issues) {
  const movementActions = new Set(['MOVE_BREEDING_TO_BATTLE', 'MOVE_BATTLE_TO_BREEDING', 'HATCH_TO_BREEDING', 'HATCH_EGG_TO_BREEDING']);
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const mentionsBreedingMove = /move[^.。!?]*(?:breeding area|battle area)|hatch 1 digi-egg|moves? to the (?:empty )?space in your breeding area/i.test(text);
    if (!mentionsBreedingMove) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics || []);
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (String(action?.type || '').toUpperCase() === 'MOVE') {
        issues.semanticIssues.breedingMoveEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Printed breeding/battle-area movement or hatch text must use MOVE_BREEDING_TO_BATTLE, MOVE_BATTLE_TO_BREEDING, or HATCH_TO_BREEDING, not generic manual MOVE.'
        });
      }
    }));
    if (/hatch 1 digi-egg/i.test(text) && !/HATCH_TO_BREEDING|HATCH_EGG_TO_BREEDING/.test(blob)) {
      issues.semanticIssues.breedingMoveEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed hatch-to-breeding text is missing HATCH_TO_BREEDING runtime action.' });
    }
    const hasBreedingToBattleActionText = (/(?:^|[.。!?]\s*)(?:[^.。!?]{0,80})?(?:move 1[^.。!?]*from (?:the )?breeding area to (?:the )?battle area)/i.test(text)
      || (/\[Breeding\][^.。!?]*(?:this digimon may move|may move)/i.test(text) && !/move[^.。!?]*(?:to|into) (?:the )?(?:empty )?(?:space in your )?breeding area/i.test(text)))
      && !/when[^.。!?]*moves? from (?:the )?breeding area to (?:the )?battle area/i.test(text);
    if (hasBreedingToBattleActionText && !/MOVE_BREEDING_TO_BATTLE/.test(blob)) {
      issues.semanticIssues.breedingMoveEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed breeding-to-battle movement is missing MOVE_BREEDING_TO_BATTLE.' });
    }
    const hasBattleToBreedingActionText = /(?:this digimon may )?move[^.。!?]*(?:to|into) (?:the )?(?:empty )?(?:space in your )?breeding area/i.test(text)
      && !/when[^.。!?]*moves? from (?:the )?breeding area to (?:the )?battle area/i.test(text);
    if (hasBattleToBreedingActionText && !/MOVE_BATTLE_TO_BREEDING/.test(blob)) {
      issues.semanticIssues.breedingMoveEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed battle-to-breeding movement is missing MOVE_BATTLE_TO_BREEDING.' });
    }
    if (movementActions.has('MOVE_BREEDING_TO_BATTLE') && /MODAL_CHOICE/.test(blob) && /hatch 1 digi-egg/i.test(text) && /or move/i.test(text)) {
      if (!/HATCH_TO_BREEDING/.test(blob) || !/MOVE_BREEDING_TO_BATTLE/.test(blob)) {
        issues.semanticIssues.breedingMoveEncodingLeak.push({ id: card.id, name: card.name, reason: 'Printed hatch-or-move choice should preserve both modal branches.' });
      }
    }
  }
}


function auditCopySourceEffectsEncodingLeak(cards, issues) {
  const gs = getGameStateTextForAudit();
  if (!/getSourceEffectCopyDescriptors/.test(gs) || !/getCopiedSourceStructuredEntries/.test(gs) || !/getCopiedSourceStaticProviders/.test(gs)) {
    issues.semanticIssues.copySourceEffectsEncodingLeak.push({
      id: 'GAME_STATE',
      name: 'Source-effect copy runtime',
      reason: 'Printed “gains all effects of cards in its digivolution cards” needs copied structured/static source-effect runtime support.'
    });
  }
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/gains?\s+all(?:\s+\[[^\]]+\])?\s+(?:of\s+the\s+)?effects?/i.test(text) || !/digivolution cards/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics || []);
    if (!/COPY_SOURCE_EFFECTS/.test(blob)) {
      issues.semanticIssues.copySourceEffectsEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed source-effect copy text should use COPY_SOURCE_EFFECTS metadata instead of relying on text-only or fake keyword encodings.'
      });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action || String(action.type || '').toUpperCase() !== 'GRANT_KEYWORD') return;
      const keyword = String(action.keyword || action.buff?.keyword || action.buff?.stat || action.text || '');
      if (/all\s*(?:turns)?$|all effects?|effects?|gammamon effects?|gammamon|machinedramon|chaosdramon|goldramon|bagra army/i.test(keyword)) {
        issues.semanticIssues.copySourceEffectsEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Source-effect copy text is not a keyword; fake GRANT_KEYWORD does not copy source mechanics.'
        });
      }
    }));
  }
}


function auditStunBroadEncodingLeak(cards, issues) {
  for (const card of cards) {
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mechanicIndex) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, actionIndex) => {
        if (String(action?.type || '').toUpperCase() !== 'STUN') return;
        issues.semanticIssues.stunBroadEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex,
          actionIndex,
          reason: 'STUN is too broad for official Digimon Card Game text; encode the exact rule layer such as CANT_ATTACK, CANT_ATTACK_PLAYER, CANT_SUSPEND, CANT_UNSUSPEND, CANT_DIGIVOLVE, or CANT_BE_DELETED.'
        });
      });
    });
  }
}


function auditFakeGrantKeywordSemanticLeak(cards, issues) {
  const fakeKeywordPattern = /^(?:STUN|WHEN_SUSPENDED|WHEN_DIGIVOLVING|WARP_EVOLVE)$/i;
  const fakeTextPattern = /De-?Digivolve\s+\d+|cannot be deleted in battle|can['’]?t be deleted in battle/i;
  for (const card of cards) {
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mechanicIndex) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, actionIndex) => {
        if (String(action?.type || '').toUpperCase() !== 'GRANT_KEYWORD') return;
        const keyword = String(action.keyword || action.buff?.keyword || action.text || '').trim();
        if (!fakeKeywordPattern.test(keyword) && !fakeTextPattern.test(keyword)) return;
        issues.semanticIssues.fakeGrantKeywordSemanticLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex,
          actionIndex,
          keyword,
          reason: 'This is not a real keyword grant. Encode the exact rule layer: GRANT_TRIGGER_EFFECT, ACTIVATE_TRIGGER_EFFECT, DE_DIGIVOLVE, WARP_EVOLVE, CANT_SUSPEND, CANT_BE_DELETED, etc.'
        });
      });
    });
  }
}


function auditPreventLeavePlaySemanticLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mechanicIndex) => {
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, actionIndex) => {
        if (String(action?.type || '').toUpperCase() !== 'PREVENT_LEAVE_PLAY') return;
        const lower = text.toLowerCase();
        const actionBlob = JSON.stringify(action || {});
        const push = reason => issues.semanticIssues.preventLeavePlaySemanticLeak.push({ id: card.id, name: card.name, mechanicIndex, actionIndex, reason });
        if (/can['’]?t be unsuspended|can\s*not be unsuspended|doesn['’]?t unsuspend|can['’]?t unsuspend|cannot unsuspend/i.test(text)) {
          push('Printed unsuspend-lock text must use CANT_UNSUSPEND, not PREVENT_LEAVE_PLAY.');
        }
        if (/attack target[^.。!?]*(?:can['’]?t|cannot|can\s*not|isn['’]?t|is not)[^.。!?]*(?:switched|changed)|can['’]?t have their attack targets switched/i.test(text)) {
          push('Printed attack-target switch lock must use CANT_CHANGE_ATTACK_TARGET / CANT_SWITCH_ATTACK_TARGET, not PREVENT_LEAVE_PLAY.');
        }
        if (/security[^.。!?]*(?:option cards?|cards?)\s+checked by this digimon[^.。!?]*(?:don['’]?t|do not|can['’]?t|cannot) activate|doesn['’]?t activate \[Security\] skills on Option cards/i.test(text)) {
          push('Checked-security effect suppression must use CANT_ACTIVATE_EFFECT with securityCheckScope metadata, not PREVENT_LEAVE_PLAY.');
        }
        if (/can['’]?t activate \[On Play\] effects?/i.test(text)) {
          push('On Play activation-lock text must use CANT_ACTIVATE_EFFECT, not PREVENT_LEAVE_PLAY.');
        }
        if (/(?:none of|1 of your|neither player)[^.。!?]{0,120}(?:can(?:not|['’]?t|\s*not) be deleted in battle|can be deleted in battle)|neither player's digimon can be deleted in battle/i.test(text) && !/byBattle|battleOnly|inBattle/.test(actionBlob)) {
          push('Battle-only deletion protection must use CANT_BE_DELETED with byBattle:true, not generic PREVENT_LEAVE_PLAY.');
        }
        if (/opponent['’]?s effects can['’]?t reduce this Digimon['’]?s DP or return it to hands? or decks?/i.test(text)) {
          push('DP-reduction/return immunity should be split into DP_REDUCTION_IMMUNITY and CANT_BE_RETURNED, not PREVENT_LEAVE_PLAY.');
        }
        if (/can only digivolve into (?:white|red|blue|yellow|green|black|purple) Digimon/i.test(text)) {
          push('Printed can-only-digivolve-into-color text must use CANT_DIGIVOLVE with allowedColor/evolveToColorOnly metadata, not PREVENT_LEAVE_PLAY.');
        }
        if (/can only digivolve into (?:Digimon cards? with )?\[[^\]]+\](?: in (?:their|its) name)?/i.test(text)) {
          push('Printed can-only-digivolve-into-name text must use CANT_DIGIVOLVE with allowedName/allowedNameContains metadata, not PREVENT_LEAVE_PLAY.');
        }
        if (/players? can['’]?t ignore digivolution requirements/i.test(text)) {
          push('Printed players-can’t-ignore-digivolution-requirements text must use CANT_IGNORE_DIGIVOLUTION_REQUIREMENTS, not PREVENT_LEAVE_PLAY.');
        }
        const hasRealLeaveText = /would (?:leave|be deleted)|prevent|isn[’']?t deleted|doesn[’']?t leave|can['’]?t leave|cannot leave|Barrier|Armor Purge|Fragment|Scapegoat|Decode|Partition|Material Save|Decoy|Fortitude|Evade|Ascension|Save/i.test(text);
        const reminderOnlyTiming = ['WHEN_ATTACKING','WHEN_BLOCKING','ON_PLAY'].includes(String(mech?.trigger || '').toUpperCase());
        if (!hasRealLeaveText && reminderOnlyTiming && /(?:Piercing|Blocker|Security A\.|Retaliation|Raid)/i.test(text)) {
          push('Printed keyword/reminder text must not generate PREVENT_LEAVE_PLAY; keyword runtime handles Piercing/Blocker/Security A./Retaliation/Raid.');
        }
      });
    });
  }
}


function hasPrintedSaveKeywordClause(text = '') {
  const normalized = String(text || '').replace(/\u00a0/g, ' ');
  const clauses = normalized.split(/(?=\[(?:On Deletion|When|On Play|Your Turn|Opponent|All Turns|Security|Main|End))/i);
  return clauses.some(clause => {
    const head = String(clause || '').trim().slice(0, 360);
    if (!/^\[On Deletion\]/i.test(head)) return false;
    return /^\[On Deletion\]\s*＜\s*Save\s*＞/i.test(head) || /then,?\s*＜\s*Save\s*＞/i.test(head);
  });
}

function auditSaveSelfToTamerEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!hasPrintedSaveKeywordClause(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics || []);
    if (!/SAVE_SELF_TO_TAMER/.test(blob)) {
      issues.semanticIssues.saveSelfToTamerEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed <Save> must place the deleted card itself under a Tamer via SAVE_SELF_TO_TAMER.'
      });
    }
    mechanics.forEach((mech, mechanicIndex) => {
      if (String(mech?.trigger || '').toUpperCase() !== 'ON_DELETION') return;
      (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, actionIndex) => {
        const type = String(action?.type || '').toUpperCase();
        if (type === 'PREVENT_LEAVE_PLAY') {
          issues.semanticIssues.saveSelfToTamerEncodingLeak.push({
            id: card.id,
            name: card.name,
            mechanicIndex,
            actionIndex,
            reason: 'Printed <Save> does not prevent deletion/leave play; remove PREVENT_LEAVE_PLAY and use SAVE_SELF_TO_TAMER.'
          });
        }
        if (type === 'PLACE_SOURCE') {
          const target = action.target || {};
          const textBlob = JSON.stringify(action || {});
          const saveSelector = /"(?:trait|keyword|textContains|nameContains)"\s*:\s*"Save"|"Save"/.test(textBlob) && !/"name"\s*:\s*"/.test(textBlob);
          const selfLike = target.self === true || String(target.name || '').toLowerCase() === String(card.name || '').toLowerCase() || String(action.from || '').toLowerCase() === 'self';
          const broadFake = !saveSelector && (selfLike || String(target.cardType || '').toLowerCase() === 'tamer' || (String(target.cardType || '').toLowerCase() === 'digimon' && !target.name && !target.trait && !target.textContains && !target.color));
          if (broadFake) {
            issues.semanticIssues.saveSelfToTamerEncodingLeak.push({
              id: card.id,
              name: card.name,
              mechanicIndex,
              actionIndex,
              reason: 'Printed <Save> self-placement should not be a broad PLACE_SOURCE selector; use SAVE_SELF_TO_TAMER.'
            });
          }
        }
      });
    });
  }
}


function auditDigivolveOnlyColorEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/can only digivolve into (white|red|blue|yellow|green|black|purple) Digimon/i.test(text)) continue;
    const wanted = (text.match(/can only digivolve into (white|red|blue|yellow|green|black|purple) Digimon/i) || [])[1];
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (/PREVENT_LEAVE_PLAY/.test(blob)) {
      issues.semanticIssues.digivolveOnlyColorEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Can-only-digivolve-into-color restriction must not be encoded as PREVENT_LEAVE_PLAY.'
      });
    }
    if (!/CANT_DIGIVOLVE/.test(blob) || !new RegExp(`allowedColor|evolveToColorOnly`, 'i').test(blob) || !new RegExp(wanted, 'i').test(blob)) {
      issues.semanticIssues.digivolveOnlyColorEncodingLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Can-only-digivolve-into-color restriction is missing CANT_DIGIVOLVE with allowed color metadata.'
      });
    }
  }
}

function auditDigimonOptionTargetLeak(cards, issues) {
  const riskyActionTypes = new Set(['GRANT_KEYWORD', 'DP_MOD', 'PREVENT_LEAVE_PLAY', 'MOVE', 'REQUEST_ATTACK_PLAYER', 'REQUEST_ATTACK_DIGIMON', 'SEND_TO_SECURITY']);
  for (const card of cards) {
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    const royalBaseDigimonText = /Royal Base[^.。!?]{0,80}Digimon|Digimon[^.。!?]{0,80}Royal Base/i.test(text);
    const xAntibodyThisDigimonKeywordText = /this Digimon[^.。!?]{0,120}(?:gains?|gets?)[^.。!?]{0,80}<(?:Blocker|Reboot|Jamming|Piercing|Collision|Rush|Security A\.)|While this Digimon has[^.。!?]*X Antibody[^.。!?]*(?:gains?|gets?)/i.test(text);
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action || !riskyActionTypes.has(String(action.type || '').toUpperCase())) return;
      const target = action.target || {};
      const actionBlob = JSON.stringify(action || {});
      const isRoyalBaseOptionLeak = royalBaseDigimonText && target.cardType === 'option' && /Royal Base/.test(String(target.trait || actionBlob));
      const isThisDigimonKeywordOptionLeak = xAntibodyThisDigimonKeywordText && String(action.type || '').toUpperCase() === 'GRANT_KEYWORD' && target.cardType === 'option';
      if (isRoyalBaseOptionLeak || isThisDigimonKeywordOptionLeak) {
        issues.semanticIssues.digimonOptionTargetLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Printed text targets/gives status to Digimon, but mechanics target cardType:"option". Use cardType:"digimon" or self/host binding instead.'
        });
      }
      if (/and attacks|may attack|attacks\./i.test(text) && target.cardType === 'option' && String(action.type || '').toUpperCase() === 'MOVE') {
        issues.semanticIssues.digimonOptionTargetLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: 'Printed Digimon attack requests must use REQUEST_ATTACK_PLAYER/REQUEST_ATTACK_DIGIMON with a Digimon target, not MOVE on an Option target.'
        });
      }
    }));
  }
}

function auditOptionColorRequirementRuntimeLeak(cards, issues) {
  const gs = getGameStateTextForAudit();
  if (!/getPublicColorRequirementCards/.test(gs) || !/isDigimonLike\(card\) \|\| this\.isTamerLike\(card\)/.test(gs)) {
    issues.semanticIssues.optionColorRequirementRuntimeLeak.push({
      id: 'GAME_STATE',
      name: 'Option color requirement runtime',
      reason: 'Option color requirements must be met only by Digimon/Tamers on the field; battle-area Options must not satisfy another Option color requirement.'
    });
  }
  if (!/ignoresOptionColorRequirement\(playerId, optionCard, action\)/.test(gs)) {
    issues.semanticIssues.optionColorRequirementRuntimeLeak.push({
      id: 'GAME_STATE',
      name: 'Option color requirement runtime',
      reason: 'Ignore-color clauses must be evaluated with player context and printed conditions, not as a card-text blanket.'
    });
  }
  if (/text\.includes\(['"]ignore['"]\)\s*&&\s*text\.includes\(['"]color requirement['"]\)/.test(gs)) {
    issues.semanticIssues.optionColorRequirementRuntimeLeak.push({
      id: 'GAME_STATE',
      name: 'Option color requirement runtime',
      reason: 'Runtime still contains the old blanket ignore-color text check.'
    });
  }
  if (!/colors\.every\(color => this\.hasColorInPublicArea\(playerId, color\)\)/.test(gs)) {
    issues.semanticIssues.optionColorRequirementRuntimeLeak.push({
      id: 'GAME_STATE',
      name: 'Option color requirement runtime',
      reason: 'Multicolor Option cards must meet every Option-side color requirement unless a printed bypass applies.'
    });
  }
}

function auditAttackTargetChangeLockEncodingLeak(cards, issues) {
  for (const card of cards) {
    const text = String(card.effectText || card.mainEffect || '') + ' ' + String(card.sourceEffect || '');
    if (!/attack target[^.。!?]*(?:can['’]?t|can’t|cannot|can\s*not|isn['’]?t|is not)[^.。!?]*(?:change|changed|switch|switched)/i.test(text)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (!/CANT_CHANGE_ATTACK_TARGET|CANT_SWITCH_ATTACK_TARGET/.test(blob) && !/attackTargetChangeLockApplies/.test(getGameStateTextForAudit())) {
      issues.semanticIssues.attackTargetChangeLockEncodingLeak.push({ id: card.id, name: card.name, reason: "Printed attack-target-change lock must be implemented by runtime/static attack-target-change logic or CANT_CHANGE_ATTACK_TARGET." });
    }
    mechanics.forEach((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, ai) => {
      if (!action) return;
      const actionText = JSON.stringify(action || {});
      if (['STUN', 'PREVENT_LEAVE_PLAY', 'CANT_SUSPEND', 'CANT_UNSUSPEND', 'DP_MOD'].includes(String(action.type || '').toUpperCase()) && /attack target/i.test(actionText)) {
        issues.semanticIssues.attackTargetChangeLockEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: "Printed attack target can't-change text must not be approximated with STUN/PREVENT_LEAVE_PLAY/CANT_SUSPEND/DP_MOD or fake attack-target traits."
        });
      }
      if (action.type === 'GRANT_KEYWORD' && /attack target|cannot be switched|can't change|cant change/i.test(actionText)) {
        issues.semanticIssues.attackTargetChangeLockEncodingLeak.push({
          id: card.id,
          name: card.name,
          mechanicIndex: mi,
          actionIndex: ai,
          reason: "Printed attack target can't-change text should not be a GRANT_KEYWORD placeholder."
        });
      }
    }));
  }
}

const fs = require('fs');
const path = require('path');

const CARDS_FILE = path.join(__dirname, 'cards.json');
const AUDIT_BACKUP = path.join(__dirname, 'cards_backup_before_audit.json');

// Round 18G: shared cache for runtime guard scans. Avoid repeated disk reads of
// the large game-state.js during full audit and helper-level semantic checks.
let _cachedGameStateTextForAudit = null;
function getGameStateTextForAudit() {
  if (_cachedGameStateTextForAudit !== null) return _cachedGameStateTextForAudit;
  const gameStatePath = path.join(__dirname, 'game-state.js');
  _cachedGameStateTextForAudit = fs.existsSync(gameStatePath) ? fs.readFileSync(gameStatePath, 'utf8') : '';
  return _cachedGameStateTextForAudit;
}
const VALID_TRIGGERS = new Set([
  "MAIN",
  "WOULD_BE_PLAYED",
  "WOULD_BE_USED",
  "WOULD_DIGIVOLVE",
  "ON_PLAY",
  "WHEN_DIGIVOLVING",
  "DIGIVOLVED",
  "WHEN_ATTACKING",
  "ON_DELETION",
  "SECURITY",
  "START_OF_TURN",
  "START_OF_MAIN_PHASE",
  "END_OF_TURN",
  "END_OF_OPPONENTS_TURN",
  "START_OF_OPPONENTS_TURN",
  "END_OF_ATTACK",
  "END_OF_ALL_TURNS",
  "DELAY",
  "ALL_TURNS",
  "YOUR_TURN",
  "OPPONENTS_TURN",
  "BREEDING",
  "WHEN_BLOCKING",
  "WHEN_MOVING",
  "SECURITY_REMOVED",
  "SECURITY_CHECKED",
  "PLAYED_FROM_SOURCE",
  "OPPONENT_SOURCE_TRASHED",
  "TRASHED_FROM_DECK",
  "OWN_CARD_TRASHED_FROM_DECK",
  "PLAYED_BY_EFFECT",
  "OPPONENT_PLAYED_DIGIMON",
  "OWN_CARD_PLAYED",
  "OPPONENT_CARD_PLAYED",
  "OPTION_TRASHED_IN_BATTLE_AREA",
  "ATTACK_BLOCKED",
  "ATTACK_TARGET_CHANGED",
  "OPPONENT_ATTACKED_PLAYER",
  "OPPONENT_ATTACKED",
  "COUNTER",
  "DELETED_OPPONENT_IN_BATTLE",
  "OWN_HAND_TRASHED_BY_EFFECT",
  "OPPONENT_HAND_TRASHED_BY_EFFECT",
  "DIGIMON_SUSPENDED",
  "DIGIMON_UNSUSPENDED",
  "OPPONENT_DIGIMON_SUSPENDED",
  "OWN_DIGIMON_UNSUSPENDED",
  "THIS_DIGIMON_LINKED",
  "YOUR_DIGIMON_LINKED",
  "CARD_TRASHED",
  "TRASHED",
  "OWN_CARD_TRASHED",
  "OPPONENT_CARD_TRASHED",
  "TRASHED_FROM_HAND",
  "TRASHED_FROM_SOURCE",
  "TRASHED_FROM_SECURITY",
  "SOURCE_PLACED",
  "SOURCE_REMOVED",
  "SOURCE_MOVED",
  "WOULD_BE_DELETED",
  "WOULD_LEAVE_BATTLE_AREA",
  "OWN_DIGIMON_PLAYED",
  "OPTION_USED",
  "OPPONENT_OPTION_USED",
  "SECURITY_ADDED",
  "OWN_DIGIMON_ATTACKED_PLAYER",
  "TAMER_SUSPENDED",
  "OWN_TAMER_SUSPENDED",
  "OPPONENT_TAMER_SUSPENDED",
  "DIGIMON_DELETED",
  "OWN_DIGIMON_DELETED",
  "OPPONENT_DIGIMON_DELETED",
  "CARD_ADDED_TO_HAND",
  "OWN_CARD_ADDED_TO_HAND",
  "OPPONENT_CARD_ADDED_TO_HAND",
  "CARD_ADDED_FROM_SECURITY_TO_HAND",
  "CARD_ADDED_FROM_TRASH_TO_HAND",
  "CARD_ADDED_FROM_SOURCE_TO_HAND",
  "SOURCE_TRASHED",
  "LINK_CARD_TRASHED",
  "DIGI_BURST_ACTIVATED",
  "TRASHED_FROM_DECK",
  "BATTLE_WON"
]);

// Round 9U: SCHEDULE_DELAYED_ACTION is the canonical encoding for delayed cleanup; do not use MANUAL_REQUIRED for simple EOT cleanup.
const VALID_ACTIONS = new Set([
  "DRAW",
  "GAIN_MEMORY",
  "SET_MEMORY",
  "LOSE_MEMORY",
  "SCHEDULE_DELAYED_ACTION",
  "RETURN_HAND_TO_DECK_TOP",
  "REDUCE_COST",
  "DELETE_DIGIMON",
  "DE_DIGIVOLVE",
  "DP_MOD",
  "COLOR_CHANGE",
  "TREAT_AS_DIGIMON",
  "COPY_SOURCE_EFFECTS",
  "ADD_TO_HAND",
  "RECOVERY_DECK",
  "TRASH_BOTTOM_EVO",
  "RETURN_REVEALED_REST_TO_DECK_BOTTOM",
  "RETURN_REVEALED_REST_TO_DECK_TOP",
  "TRASH_REVEALED_REST",
  "RETURN_REVEALED_REST_TO_SECURITY_SHUFFLE",
  "REVEAL_AND_SELECT",
  "GRANT_KEYWORD",
  "TRASH_HAND",
  "TRASH_TOP_DECK",
  "TRASH_DECK_TOP",
  "PLAY_FROM_HAND",
  "PLAY_FROM_TRASH",
  "PLAY_FROM_HAND_OR_SOURCE",
  "PLAY_FROM_HAND_OR_TRASH",
  "SEND_TO_SECURITY",
  "PLACE_SECURITY_FROM_HAND",
  "PLACE_SECURITY_FROM_TRASH",
  "PLACE_THIS_CARD_AS_SECURITY",
  "TRASH_SECURITY_STACK",
  "SUSPEND",
  "SUSPEND_OPPONENT",
  "UNSUSPEND",
  "DNA_DIGIVOLVE",
  "BURST_DIGIVOLVE",
  "WARP_EVOLVE",
  "STUN",
  "CANT_ATTACK",
  "CANT_ATTACK_PLAYER",
  "CANT_ATTACK_DIGIMON",
  "CAN_ONLY_ATTACK_SUSPENDED_DIGIMON",
  "CAN_ATTACK_UNSUSPENDED",
  "CANT_BLOCK",
  "CANT_CHANGE_ATTACK_TARGET",
  "CANT_SWITCH_ATTACK_TARGET",
  "CANT_UNSUSPEND",
  "CANT_SUSPEND",
  "CANT_BE_ATTACKED",
  "CANT_BE_DELETED",
  "CANT_BE_RETURNED",
  "CANT_BE_BLOCKED",
  "MANUAL_REQUIRED",
  "BOUNCE",
  "PLACE_SOURCE",
  "SAVE_SELF_TO_TAMER",
  "RETURN_SOURCE_TO_DECK",
  "RETURN_SOURCE_TO_HAND",
  "TRASH_SOURCE",
  "BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE",
  "RETURN_TO_DECK",
  "PREVENT_LEAVE_PLAY",
  "MOVE",
  "MOVE_BREEDING_TO_BATTLE",
  "MOVE_BATTLE_TO_BREEDING",
  "HATCH_TO_BREEDING",
  "HATCH_EGG_TO_BREEDING",
  "PLACE_IN_DELAY_AREA",
  "LINK_FROM_HAND",
  "PLAY_FROM_HAND_OR_TRASH_OR_SOURCE",
  "PLAY_FROM_SOURCE",
  "ADD_SECURITY_TO_HAND",
  "PREVENT_PLAYER_ATTACK",
  "VORTEX_ATTACK_REQUEST",
  "PLAY_FROM_SECURITY",
  "ADD_CURRENT_SECURITY_TO_HAND",
  "SEARCH_SECURITY_TO_HAND",
  "ACTIVATE_TRIGGER_EFFECT",
  "TRIGGER_REDIRECT",
  "GRANT_KEYWORD_TO_LAST_PLAYED",
  "GRANT_KEYWORD_TO_PLAYED_BY_EFFECT",
  "GRANT_TRIGGER_EFFECT",
  "LINK_SELF_AS_SOURCE",
  "TRASH_OPTION_IN_BATTLE_AREA",
  "DELETE_LOWEST_DP_DIGIMON",
  "REVEAL_SECURITY_TOP_CONDITIONAL",
  "CANT_ATTACK_DIGIMON",
  "REQUEST_ATTACK",
  "REQUEST_ATTACK_PLAYER",
  "REQUEST_ATTACK_DIGIMON",
  "ATTACK_PLAYER",
  "END_ATTACK",
  "REDIRECT_ATTACK_TARGET",
  "CHANGE_ATTACK_TARGET",
  "BLAST_DIGIVOLVE",
  "BLAST_DNA_DIGIVOLVE",
  "USE_OPTION_CARD",
  "USE_OPTION",
  "ACTIVATE_MAIN_EFFECT",
  "MODAL_CHOICE",
  "ACTIVATE_ONE_OF",
  "PLAY_TOKEN",
  "OVERCLOCK_ATTACK_REQUEST",
  "DIGIXROS",
  "APP_FUSION",
  "MIND_LINK",
  "ASSEMBLY",
  "CANT_ACTIVATE_EFFECT",
  "EFFECT_ACTIVATION_LOCK",
  "UNAFFECTED_BY_OPPONENT_EFFECTS",
  "CANT_PLAY_BY_EFFECT",
  "CANT_PLAY",
  "CANT_MOVE",
  "CANT_DIGIVOLVE",
  "CANT_IGNORE_DIGIVOLUTION_REQUIREMENTS",
  "DP_REDUCTION_IMMUNITY",
  "CANT_USE_OPTION",
  "CANT_GAIN_MEMORY",
  "CANT_REDUCE_COST",
  "BATTLE_DIGIMON"
]);

const VALID_OWNERS = new Set(["own", "opponent", "any"]);
const VALID_CONDITIONS = new Set([
  "MEMORY_COUNT",
  "SECURITY_COUNT",
  "DIGIXROSING",
  "HAS_TAMER",
  "HAS_TRAIT",
  "HAS_KEYWORD",
  "IS_SUSPENDED",
  "ALL_DIGIMON_SUSPENDED",
  "HAND_COUNT",
  "TURN_PLAYER",
  "DP_CHECK",
  "COLOR_CHECK",
  "LEVEL_CHECK",
  "HAS_SPECIFIC_CARD",
  "SOURCE_COUNT",
  "TRASH_COUNT",
  "HAS_DIGIMON",
  "OR",
  "AND",
  "NOT",
  "SECURITY_REMOVED_BY_EFFECT",
  "DIGIVOLVE_CONTEXT",
  "LAST_DELETION_COUNT",
  "FACE_UP_SECURITY_COUNT",
  "NO_FACE_UP_SECURITY",
  "EVENT_CONTEXT",
  "SECURITY_COUNT_COMPARE",
  "SELF_NAME_CONTAINS",
  "PLAYED_BY_THIS_EFFECT",
  "IF_PLAYED_BY_THIS_EFFECT",
  "LAST_PLAYED_BY_THIS_EFFECT",
  "SUSPENDED_OWN_BY_THIS_EFFECT",
  "IF_SUSPENDED_OWN_BY_THIS_EFFECT",
  "SUSPENDED_BY_THIS_EFFECT",
  "IF_SUSPENDED_BY_THIS_EFFECT",
  "UNSUSPENDED_BY_THIS_EFFECT",
  "IF_UNSUSPENDED_BY_THIS_EFFECT",
  "DELETED_BY_THIS_EFFECT",
  "IF_DELETED_BY_THIS_EFFECT",
  "NOT_DELETED_BY_THIS_EFFECT",
  "IF_NOT_DELETED_BY_THIS_EFFECT",
  "DELETED_OWN_BY_THIS_EFFECT",
  "IF_DELETED_OWN_BY_THIS_EFFECT",
  "DELETED_OPPONENT_BY_THIS_EFFECT",
  "IF_DELETED_OPPONENT_BY_THIS_EFFECT",
  "NOT_DELETED_OPPONENT_BY_THIS_EFFECT",
  "IF_NOT_DELETED_OPPONENT_BY_THIS_EFFECT",
  "RETURNED_BY_THIS_EFFECT",
  "IF_RETURNED_BY_THIS_EFFECT",
  "NOT_RETURNED_BY_THIS_EFFECT",
  "IF_NOT_RETURNED_BY_THIS_EFFECT",
  "RETURNED_OPPONENT_BY_THIS_EFFECT",
  "IF_RETURNED_OPPONENT_BY_THIS_EFFECT",
  "NOT_RETURNED_OPPONENT_BY_THIS_EFFECT",
  "IF_NOT_RETURNED_OPPONENT_BY_THIS_EFFECT",
  "TRASHED_BY_THIS_EFFECT",
  "IF_TRASHED_BY_THIS_EFFECT",
  "NOT_TRASHED_BY_THIS_EFFECT",
  "IF_NOT_TRASHED_BY_THIS_EFFECT",
  "TRASHED_OWN_BY_THIS_EFFECT",
  "IF_TRASHED_OWN_BY_THIS_EFFECT",
  "TRASHED_OPPONENT_BY_THIS_EFFECT",
  "IF_TRASHED_OPPONENT_BY_THIS_EFFECT",
  "NOT_TRASHED_OPPONENT_BY_THIS_EFFECT",
  "IF_NOT_TRASHED_OPPONENT_BY_THIS_EFFECT",
  "PLACED_BY_THIS_EFFECT",
  "IF_PLACED_BY_THIS_EFFECT",
  "NOT_PLACED_BY_THIS_EFFECT",
  "IF_NOT_PLACED_BY_THIS_EFFECT",
  "PLACED_OWN_BY_THIS_EFFECT",
  "IF_PLACED_OWN_BY_THIS_EFFECT",
  "DIGIVOLVED_BY_THIS_EFFECT",
  "IF_DIGIVOLVED_BY_THIS_EFFECT",
  "ADDED_TO_HAND_BY_THIS_EFFECT",
  "USED_OPTION_BY_THIS_EFFECT",
  "IF_USED_OPTION_BY_THIS_EFFECT",
  "NOT_USED_OPTION_BY_THIS_EFFECT",
  "IF_NOT_USED_OPTION_BY_THIS_EFFECT",
  "IF_ADDED_TO_HAND_BY_THIS_EFFECT",
  "NOT_ADDED_TO_HAND_BY_THIS_EFFECT",
  "IF_NOT_ADDED_TO_HAND_BY_THIS_EFFECT",
  "EVENT_CONTEXT",
  "ATTACK_IN_PROGRESS"
]);

// Round 14A: semantic audit helpers. These checks catch mechanics that are
// syntactically valid but likely diverge from official gameplay.
const TIMING_OR_RULE_TRAIT_TOKENS = new Set([
  "on play", "when digivolving", "when attacking", "on deletion", "main", "security",
  "your turn", "opponent's turn", "all turns", "once per turn", "start of your turn",
  "start of opponent's turn", "start of your main phase", "end of your turn",
  "end of opponent's turn", "end of all turns", "end of attack", "when moving",
  "when blocking", "counter", "delay", "hand", "trash", "breeding", "link",
  "overclock", "blast digivolve", "would be played", "would digivolve"
]);

const STATIC_LIKE_TRIGGERS = new Set(["YOUR_TURN", "OPPONENTS_TURN", "ALL_TURNS"]);
const REPLACEMENT_TIMING_TRIGGERS = new Set(["WOULD_BE_DELETED", "WOULD_LEAVE_BATTLE_AREA"]);
const STATIC_LIKE_ACTIONS = new Set([
  "DP_MOD", "COLOR_CHANGE", "TREAT_AS_DIGIMON", "COPY_SOURCE_EFFECTS", "GRANT_KEYWORD", "STUN", "PREVENT_LEAVE_PLAY",
  "CANT_ATTACK", "CANT_ATTACK_PLAYER", "CANT_ATTACK_DIGIMON", "CAN_ONLY_ATTACK_SUSPENDED_DIGIMON", "CANT_BLOCK", "CANT_CHANGE_ATTACK_TARGET", "CANT_SWITCH_ATTACK_TARGET", "CANT_UNSUSPEND", "CANT_SUSPEND", "CANT_ACTIVATE_EFFECT", "EFFECT_ACTIVATION_LOCK", "UNAFFECTED_BY_OPPONENT_EFFECTS",
  "CANT_PLAY_BY_EFFECT", "CANT_PLAY", "CANT_USE_OPTION", "CANT_GAIN_MEMORY"
]);

function isRuntimeContinuousStaticClause(raw = '') {
  const text = String(raw || '');
  // Round 14O: Reminder text inside printed keywords often contains "When ..."
  // (Alliance, Jamming, Piercing, etc.) and was causing false positives for true
  // continuous clauses such as "[Your Turn] This Digimon gains <Alliance>".
  const stripped = text
    .replace(/＜[^＞]+＞\s*\([^)]*\)/g, ' KEYWORD ')
    .replace(/<[^>]+>\s*\([^)]*\)/g, ' KEYWORD ');
  const hasStaticTiming = /\[(?:your turn|opponent'?s turn|all turns|security)\]/i.test(stripped) || /\b(your turn|opponent'?s turn|all turns)\b/i.test(stripped);
  if (!hasStaticTiming && !/\bwhile\b/i.test(stripped)) return false;
  const hasContinuousWording = /\bwhile\b|\ball of your\b|\ball your\b|\byour other\b|\bnone of\b|\bno (?:digimon|tamers?|cards?)\b|\bthis (?:digimon|card)(?: with [^.,]+)? (?:gets|gains|has|can't|cannot|doesn't|does not|can also|is also treated|is treated|is unblockable)\b|\byour .*digimon.*(?:get|gets|gain|gains|has|can't|cannot|can also|are also treated|are treated|don't|do not)\b|\bopponent'?s .*digimon.*(?:get|gets|gain|gains|can't|cannot|don't|do not)\b|\bplayers can't\b|\byour opponent(?:'s effects)? can't\b|\bdon't unsuspend\b|\bcan'?t unsuspend\b|\bcan only digivolve into\b|\bdoesn'?t activate \[security\]\b|\bfor (?:each|every) [^.]+ (?:gets|gain|gains) [+-]\d+\s*DP\b|\bcan't ignore digivolution requirements\b|\bcan'?t reduce digivolution costs\b|\badd \d+ to the maximum dp\b/i.test(stripped);
  if (!hasContinuousWording) return false;
  const hasTriggeredClause = /\bwhen\b/i.test(stripped) && !/\bwhile\b/i.test(stripped) && !/\ball of your\b|\bnone of\b|\bplayers can't\b|\byour opponent can't\b/i.test(stripped);
  return !hasTriggeredClause;
}

function isRuntimeContinuousStaticText(text = '') {
  return String(text || '')
    .split(/\r?\n|(?=\[(?:Your Turn|Opponent'?s Turn|All Turns|Security)\])/i)
    .some(clause => isRuntimeContinuousStaticClause(clause));
}

const SUSPICIOUS_COST_TYPES = new Set([
  "MEMORY",          // prefer GAIN_MEMORY / LOSE_MEMORY actions or explicit PAY_MEMORY cost if implemented
  "TRASH_SECURITY",  // prefer ADD_SECURITY_TO_HAND / TRASH_SECURITY_STACK with byCost context
  "DELETE_DIGIMON",  // deletion as a cost requires replacement/protection handling and rollback
  "COMPOSITE",       // prefer AND with costs[]
  "REDUCE_COST",     // cost reduction is preprocessing/action, not a paid cost
  "UNSUSPEND",
  "BOUNCE"
]);


function actionTreeContainsType(node, type) {
  if (!node) return false;
  if (Array.isArray(node)) return node.some(x => actionTreeContainsType(x, type));
  if (typeof node === 'object') {
    if (node.type === type) return true;
    return Object.values(node).some(v => actionTreeContainsType(v, type));
  }
  return false;
}

function findCantAttackOrBlockWithoutCantBlock(card) {
  const mainText = String(card.mainEffect || '');
  const sourceText = String(card.sourceEffect || '');
  const fullText = `${mainText} ${sourceText}`;
  if (!/(?:can't|cannot|can\s*not)\s+attack\s+or\s+block/i.test(fullText)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const trigger = String(mech.trigger || '').toUpperCase();
    // Round 22Y: cards can have Main text that says "can't attack or block" and a
    // separate Security text that only says "can't attack". Do not require
    // CANT_BLOCK on the Security mechanic unless the Security text itself has it.
    if (trigger === 'SECURITY' && !/(?:can't|cannot|can\s*not)\s+attack\s+or\s+block/i.test(sourceText)) continue;
    const actions = mech.actions || [];
    if (actionTreeContainsType(actions, 'CANT_ATTACK') && !actionTreeContainsType(actions, 'CANT_BLOCK')) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: 'Printed can\'t attack or block mechanics must include CANT_BLOCK; CANT_ATTACK alone does not stop Blocker timing.' });
    }
  }
  return issues;
}

function findCantAttackRestrictionEncodingLeak(card) {
  const mainText = String(card.mainEffect || '');
  const sourceText = String(card.sourceEffect || '');
  const fullText = `${mainText} ${sourceText}`;
  const mechanics = card.mechanics || [];
  const issues = [];
  const mentionsCantAttackPlayers = /(?:can't|cannot|can\s*not)\s+attack\s+players/i.test(fullText);
  const mentionsGenericCantAttack = /(?:can't|cannot|can\s*not)\s+attack\s+(?:until|for the turn)/i.test(fullText) || /(?:can't|cannot|can\s*not)\s+attack\s+until/i.test(fullText);
  if (mentionsCantAttackPlayers && !actionTreeContainsType(mechanics, 'CANT_ATTACK_PLAYER')) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Printed can't attack players text must use CANT_ATTACK_PLAYER; DP_MOD/empty mechanics do not stop player attacks." });
  }
  if (mentionsGenericCantAttack && !/(?:can't|cannot|can\s*not)\s+attack\s+players/i.test(fullText) && !actionTreeContainsType(mechanics, 'CANT_ATTACK')) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Printed can't attack text must use CANT_ATTACK; keyword placeholders or unrelated actions do not block attack declarations." });
  }
  const mechanicsStr = JSON.stringify(mechanics || []).toLowerCase();
  if ((mentionsCantAttackPlayers || mentionsGenericCantAttack) && (mechanicsStr.includes('cannot attack') || mechanicsStr.includes("can't attack")) && !actionTreeContainsType(mechanics, 'CANT_ATTACK') && !actionTreeContainsType(mechanics, 'CANT_ATTACK_PLAYER')) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Found text/keyword placeholder for attack restriction without runtime CANT_ATTACK/CANT_ATTACK_PLAYER." });
  }
  return issues;
}

function findCantUseOptionEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+use\s+Option\s+cards?/i.test(text)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const actions = mech.actions || [];
    if (!actionTreeContainsType(actions, 'CANT_USE_OPTION')) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed can't use Option cards must use CANT_USE_OPTION; STUN/SUSPEND_OPPONENT cannot restrict cards in hand." });
    }
  }
  return issues;
}


function findCantGainMemoryEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+gain\s+memory/i.test(text)) return [];
  if (!/(?:other than|except with|except by)\s+(?:by\s+)?Tamer\s+effects?/i.test(text)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    if (String(mech.trigger || '').toUpperCase() !== 'ALL_TURNS') continue;
    const actions = mech.actions || [];
    if (!actionTreeContainsType(actions, 'CANT_GAIN_MEMORY')) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed memory-gain locks must use CANT_GAIN_MEMORY; SET_MEMORY/STUN/SUSPEND/PREVENT_LEAVE_PLAY are unrelated." });
    }
  }
  return issues;
}

function findCantReduceCostEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+reduce\s+(?:play|digivolution|evolution)\s+costs?/i.test(text)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const trigger = String(mech.trigger || '').toUpperCase();
    if (!['ALL_TURNS', 'YOUR_TURN', 'OPPONENTS_TURN'].includes(trigger)) continue;
    const actions = mech.actions || [];
    const hasLock = actionTreeContainsType(actions, 'CANT_REDUCE_COST');
    const hasFakeReduction = actionTreeContainsType(actions, 'REDUCE_COST');
    if (!hasLock || hasFakeReduction) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed cost-reduction locks must use CANT_REDUCE_COST; REDUCE_COST amount 0 does not prevent later reductions." });
    }
  }
  return issues;
}

function findCantPlayEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+play/i.test(text)) return [];
  if (/this\s+effect\s+(?:can't|cannot|can\s*not)\s+play/i.test(text)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const actions = mech.actions || [];
    const hasPlayerLock = actionTreeContainsType(actions, 'CANT_PLAY') || actionTreeContainsType(actions, 'CANT_PLAY_BY_EFFECT');
    const hasWrongApprox = actionTreeContainsType(actions, 'STUN') || actionTreeContainsType(actions, 'SUSPEND_OPPONENT') || actionTreeContainsType(actions, 'PREVENT_LEAVE_PLAY');
    const trigger = String(mech.trigger || '').toUpperCase();
    if (!['ALL_TURNS', 'YOUR_TURN', 'OPPONENTS_TURN', 'MAIN', 'ON_PLAY', 'WHEN_DIGIVOLVING', 'SECURITY'].includes(trigger)) continue;
    if (!hasPlayerLock && hasWrongApprox) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed can't-play clauses must use CANT_PLAY/CANT_PLAY_BY_EFFECT player locks; STUN/SUSPEND/PREVENT_LEAVE_PLAY affect the wrong rule layer." });
    }
  }
  return issues;
}


function findCantMoveEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+(?:play\s+or\s+)?move/i.test(text)) return [];
  const issues = [];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const trigger = String(mech.trigger || '').toUpperCase();
    if (!['ALL_TURNS', 'YOUR_TURN', 'OPPONENTS_TURN', 'MAIN', 'ON_PLAY', 'WHEN_DIGIVOLVING', 'SECURITY'].includes(trigger)) continue;
    const actions = mech.actions || [];
    const hasMoveLock = actionTreeContainsType(actions, 'CANT_MOVE');
    const hasPairedPlayLock = actionTreeContainsType(actions, 'CANT_PLAY') || actionTreeContainsType(actions, 'STUN') || actionTreeContainsType(actions, 'SUSPEND_OPPONENT') || actionTreeContainsType(actions, 'PREVENT_LEAVE_PLAY');
    if (hasPairedPlayLock && !hasMoveLock) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed can't-move clauses must use CANT_MOVE beside the related play/restriction lock; CANT_PLAY alone does not stop raising/moving from breeding." });
    }
  }
  return issues;
}


function findCantDigivolveEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+(?:dna\s+)?digivolve/i.test(text)) return [];
  const issues = [];
  const wrongTypes = ['STUN', 'PREVENT_LEAVE_PLAY'];
  for (const [idx, mech] of (card.mechanics || []).entries()) {
    const trigger = String(mech.trigger || '').toUpperCase();
    if (!['ALL_TURNS', 'YOUR_TURN', 'OPPONENTS_TURN', 'MAIN', 'ON_PLAY', 'WHEN_DIGIVOLVING', 'WHEN_ATTACKING', 'THIS_DIGIMON_LINKED', 'START_OF_MAIN_PHASE', 'END_OF_TURN'].includes(trigger)) continue;
    const actions = mech.actions || [];
    const hasLock = actionTreeContainsType(actions, 'CANT_DIGIVOLVE');
    const hasWrongApprox = wrongTypes.some(type => actionTreeContainsType(actions, type)) || JSON.stringify(actions).toLowerCase().includes('cannot digivolve') || JSON.stringify(actions).toLowerCase().includes("can't digivolve");
    if (!hasLock && hasWrongApprox) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "Printed can't-digivolve clauses must use CANT_DIGIVOLVE; STUN/PREVENT_LEAVE_PLAY/keyword strings affect the wrong rule layer." });
    }
  }
  if (!actionTreeContainsType(card.mechanics || [], 'CANT_DIGIVOLVE')) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Printed can't-digivolve text has no CANT_DIGIVOLVE action." });
  }
  return issues;
}

function findDpReductionImmunityEncodingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/effects?\s+can(?:not|\s*not|'t)\s+reduce[^.。]*dp|can(?:not|\s*not|'t)\s+reduce[^.。]*dp[^.。]*effects?|can(?:not|\s*not|'t)\s+have[^.。]*dp\s+reduced|dp\s+reduced\s+or\s+be\s+returned/i.test(text)) return [];
  const issues = [];
  const hasDpReductionImmunity = actionTreeContainsType(card.mechanics || [], 'DP_REDUCTION_IMMUNITY');
  const mechanicsStr = JSON.stringify(card.mechanics || []).toLowerCase();
  const hasWrongApprox = mechanicsStr.includes('immune_to_dp_reduction') || mechanicsStr.includes('dp_reduction') || /\"type\":\s*\"dp_mod\"/.test(mechanicsStr) && /\"amount\":\s*0/.test(mechanicsStr) || actionTreeContainsType(card.mechanics || [], 'STUN') || (mechanicsStr.includes('cannot have dp reduced') || mechanicsStr.includes("can't have") && mechanicsStr.includes('dp reduced'));
  if (!hasDpReductionImmunity) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Printed DP-reduction immunity must use DP_REDUCTION_IMMUNITY; text/buff placeholders don't create a runtime immunity." });
  }
  if (hasWrongApprox && !hasDpReductionImmunity) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Found placeholder/approximate DP-reduction immunity without runtime DP_REDUCTION_IMMUNITY action." });
  }
  return issues;
}


function findCantBeBlockedKeywordLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/(?:can't|cannot|can\s*not)\s+be\s+blocked|\bunblockable\b/i.test(text)) return [];
  const issues = [];
  const mechanics = card.mechanics || [];
  const hasCbb = actionTreeContainsType(mechanics, 'CANT_BE_BLOCKED');
  const mechanicsStr = JSON.stringify(mechanics).toLowerCase();
  const hasKeywordApprox = mechanicsStr.includes('cannot be blocked') || mechanicsStr.includes("can't be blocked") || mechanicsStr.includes('unblockable');
  const hasWrongApprox = actionTreeContainsType(mechanics, 'STUN') || actionTreeContainsType(mechanics, 'PREVENT_LEAVE_PLAY') || actionTreeContainsType(mechanics, 'CANT_UNSUSPEND');
  if (!hasCbb && (hasKeywordApprox || hasWrongApprox)) {
    issues.push({ mechanicIndex: null, trigger: null, reason: "Printed can't-be-blocked clauses must use CANT_BE_BLOCKED, not GRANT_KEYWORD text, STUN, PREVENT_LEAVE_PLAY, or CANT_UNSUSPEND." });
  }
  for (const [idx, mech] of mechanics.entries()) {
    const trigger = String(mech.trigger || '').toUpperCase();
    if (!['ALL_TURNS', 'YOUR_TURN', 'OPPONENTS_TURN', 'MAIN', 'ON_PLAY', 'WHEN_DIGIVOLVING', 'WHEN_ATTACKING', 'START_OF_MAIN_PHASE', 'OWN_CARD_ADDED_TO_HAND'].includes(trigger)) continue;
    const actions = mech.actions || [];
    const actionText = JSON.stringify(actions).toLowerCase();
    if (!actionTreeContainsType(actions, 'CANT_BE_BLOCKED') && (actionText.includes('cannot be blocked') || actionText.includes("can't be blocked") || actionText.includes('unblockable') || actionTreeContainsType(actions, 'PREVENT_LEAVE_PLAY') || actionTreeContainsType(actions, 'STUN'))) {
      issues.push({ mechanicIndex: idx, trigger: mech.trigger, reason: "This trigger appears to encode can't-be-blocked without CANT_BE_BLOCKED." });
    }
  }
  return issues;
}

function createSemanticIssue(card, reason, details = {}) {
  return {
    id: card.id,
    name: card.name,
    reason,
    details,
    mainEffect: card.mainEffect || "",
    sourceEffect: card.sourceEffect || ""
  };
}

function addSemanticIssue(report, card, bucket, reason, details = {}) {
  if (!report.semanticIssues[bucket]) report.semanticIssues[bucket] = [];
  report.semanticIssues[bucket].push(createSemanticIssue(card, reason, details));
}

function walkCosts(cost, visitor, pathLabel = 'cost') {
  if (!cost || typeof cost !== 'object') return;
  visitor(cost, pathLabel);
  const children = [];
  if (Array.isArray(cost.costs)) children.push(...cost.costs.map((c, i) => [c, `${pathLabel}.costs[${i}]`]));
  if (Array.isArray(cost.parts)) children.push(...cost.parts.map((c, i) => [c, `${pathLabel}.parts[${i}]`]));
  if (cost.cost && typeof cost.cost === 'object') children.push([cost.cost, `${pathLabel}.cost`]);
  children.forEach(([child, childPath]) => walkCosts(child, visitor, childPath));
}


function isReplacementPreventionMechanic(mech, act, fullText = '') {
  if (!mech || !act || act.type !== 'PREVENT_LEAVE_PLAY') return false;
  const trigger = String(mech.trigger || '').toUpperCase();
  if (REPLACEMENT_TIMING_TRIGGERS.has(trigger)) return true;
  const text = String(fullText || '').toLowerCase();
  return /would\s+(?:be\s+deleted|leave)|prevent\s+(?:that|its|this)\s+deletion|isn['’]?t\s+deleted/.test(text);
}


function isEffectLockOrImmunityRuntimeMechanic(mech, act, fullText = '') {
  const text = String(fullText || '').toLowerCase();
  const actionBlob = JSON.stringify(act || {}).toLowerCase();
  if (['CANT_ACTIVATE_EFFECT', 'EFFECT_ACTIVATION_LOCK', 'UNAFFECTED_BY_OPPONENT_EFFECTS'].includes(String(act?.type || '').toUpperCase())) return true;
  if (/can't\s+activate|cannot\s+activate|can\s*not\s+activate|don't\s+activate|do\s*not\s+activate|none\s+of\s+.*activate/.test(text + ' ' + actionBlob)) return true;
  if (/unaffected|can't\s+be\s+affected|cannot\s+be\s+affected|aren'?t\s+affected|isn'?t\s+affected|effects?\s+don't\s+affect/.test(text + ' ' + actionBlob)) return true;
  if (/can't\s+use\s+option|cannot\s+use\s+option|option\s+cards?\s+can't\s+be\s+used|security\s+effects?.*don't\s+activate/.test(text + ' ' + actionBlob)) return true;
  return false;
}


function isRevealSelectedConsumerLeak(mech, actionList, actionIndex, cardText = '') {
  const act = actionList[actionIndex];
  if (!act || typeof act !== 'object') return false;
  const type = String(act.type || '').toUpperCase();
  const consumerTypes = new Set(['PLAY_FROM_HAND', 'PLAY_FROM_TRASH', 'PLAY_FROM_HAND_OR_TRASH', 'PLAY_FROM_SOURCE', 'PLACE_SOURCE', 'SEND_TO_SECURITY', 'ADD_TO_HAND']);
  if (!consumerTypes.has(type)) return false;
  const from = String(act.from || act.zone || '').toLowerCase();
  if (from.includes('revealed')) return false;
  if (from && !['deck', 'deck_top'].includes(from)) return false;
  const text = String(cardText || '').toLowerCase();
  if (!text.includes('reveal') || !text.includes('among them')) return false;

  // Find the nearest preceding reveal in the same action list, tolerating rest cleanup before old consumers.
  const cleanupTypes = new Set(['RETURN_REVEALED_REST_TO_DECK_BOTTOM', 'RETURN_REVEALED_REST_TO_DECK_TOP', 'TRASH_REVEALED_REST']);
  let reveal = null;
  for (let i = actionIndex - 1; i >= 0 && i >= actionIndex - 5; i--) {
    const prevType = String(actionList[i]?.type || '').toUpperCase();
    if (prevType === 'REVEAL_AND_SELECT') { reveal = actionList[i]; break; }
    if (prevType && !cleanupTypes.has(prevType)) break;
  }
  if (!reveal) return false;

  const targets = [];
  if (reveal.target && typeof reveal.target === 'object') targets.push(reveal.target);
  (reveal.selections || []).forEach(slot => { if (slot && slot.target) targets.push(slot.target); });
  if (targets.some(t => String(t.cardType || '').toLowerCase() === 'security')) return false;

  const actionTarget = act.target || {};
  const blob = [actionTarget.name, actionTarget.nameContains, actionTarget.trait, actionTarget.color, actionTarget.cardType].filter(Boolean).join(' ').toLowerCase();
  if (type === 'PLACE_SOURCE' && String(act.zone || '').toLowerCase().includes('deck')) return false;
  if (type === 'PLACE_SOURCE' && blob && String(cardText || '').toLowerCase().includes('place this card') && /option|tamer/.test(blob)) return false;
  if (type === 'PLACE_SOURCE' && /＜?save＞?|\bsave\b/i.test(String(cardText || '')) && /return the rest|trash the rest/i.test(String(cardText || ''))) return false;
  return true;
}



// Round 15F: current cards.json metadata can still contain old bracket text
// references copied into traitTokens/traits. Runtime target matching is protected,
// but deck-builder filters and future regenerated data should keep real traits
// separate from effect text references.
function normalizeAuditToken(value = '') {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function getAuditKnownCardNames() {
  if (getAuditKnownCardNames._cache) return getAuditKnownCardNames._cache;
  const set = new Set();
  try {
    const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
    (Array.isArray(cards) ? cards : []).forEach(card => {
      [card?.name || '', ...(Array.isArray(card?.nameTokens) ? card.nameTokens : [])].forEach(name => {
        const n = normalizeAuditToken(name).toLowerCase();
        if (n) set.add(n);
      });
    });
  } catch (e) {}
  getAuditKnownCardNames._cache = set;
  return set;
}

function findMetadataTraitTextPollution(card) {
  const knownNames = getAuditKnownCardNames();
  const ownNames = new Set([card?.name || '', ...(Array.isArray(card?.nameTokens) ? card.nameTokens : [])]
    .map(x => normalizeAuditToken(x).toLowerCase()).filter(Boolean));
  const text = `${card?.mainEffect || ''} ${card?.sourceEffect || ''} ${card?.effectText || ''} ${card?.cardText || ''}`;
  const mentioned = new Set();
  let match;
  const re = /\[([^\]]+)\]/g;
  while ((match = re.exec(text)) !== null) {
    const token = normalizeAuditToken(match[1]).toLowerCase();
    if (token && !TIMING_OR_RULE_TRAIT_TOKENS.has(token)) mentioned.add(token);
  }
  const tokens = [
    ...(Array.isArray(card?.traitTokens) ? card.traitTokens : []),
    ...String(card?.traits || '').split(',').map(x => x.trim()).filter(Boolean)
  ];
  return [...new Set(tokens.map(t => normalizeAuditToken(t)).filter(t => {
    const l = t.toLowerCase();
    return knownNames.has(l) && !ownNames.has(l) && mentioned.has(l) && !clauseUsesTokenAsTrait(card, t);
  }))];
}


function splitAuditOrTokens(value) {
  return String(value || '')
    .split(/\s+or\s+|\s*\/\s*|,\s*/i)
    .map(x => normalizeAuditToken(x))
    .filter(Boolean);
}

function clauseUsesTokenAsTrait(card, token) {
  const text = `${card?.mainEffect || ''} ${card?.sourceEffect || ''} ${card?.effectText || ''}`;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+');
  const after = new RegExp(`\\[${escaped}\\][^\\.\\n]{0,80}\\btraits?\\b`, 'i');
  const before = new RegExp(`\\btraits?\\b[^\\.\\n]{0,80}\\[${escaped}\\]`, 'i');
  return after.test(text) || before.test(text);
}

function findMechanicsTraitNamePollution(card) {
  const knownNames = getAuditKnownCardNames();
  const issues = [];
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (typeof node.trait === 'string') {
      const tokens = splitAuditOrTokens(node.trait);
      const bad = tokens.filter(token => knownNames.has(token.toLowerCase()) && !clauseUsesTokenAsTrait(card, token));
      if (bad.length > 0) issues.push({ path: `${pathLabel}.trait`, value: node.trait, tokens: bad });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 15H: color words are card color properties, not traits. Phrases such as
// "blue Tamer" or "red or yellow Digimon" must be encoded as color/colorAny,
// never as trait/traitAny. Do not flag legitimate traits like "Blue Flare".
const AUDIT_COLOR_WORDS = new Set(['red', 'blue', 'yellow', 'green', 'black', 'purple', 'white']);
function isAuditColorOnlyExpression(value = '') {
  const raw = normalizeAuditToken(value);
  if (!raw) return false;
  const words = raw.match(/(red|blue|yellow|green|black|purple|white)/ig) || [];
  if (words.length === 0) return false;
  const stripped = raw
    .replace(/(red|blue|yellow|green|black|purple|white)/ig, '')
    .replace(/\s+or\s+|\s+and\s+|[,/()\s-]+/ig, '');
  return stripped.length === 0;
}
function findMechanicsTraitColorPollution(card) {
  const issues = [];
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (typeof node.trait === 'string' && isAuditColorOnlyExpression(node.trait)) {
      issues.push({ path: `${pathLabel}.trait`, value: node.trait });
    }
    if (Array.isArray(node.traitAny)) {
      const bad = node.traitAny.filter(v => AUDIT_COLOR_WORDS.has(normalizeAuditToken(v).toLowerCase()));
      if (bad.length > 0) issues.push({ path: `${pathLabel}.traitAny`, value: node.traitAny, tokens: bad });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 15I: HAS_SPECIFIC_CARD is a board/card-name existence condition. It must
// not carry arbitrary residue in a field named trait (card names, event phrases,
// or source-count phrases). Such clauses should use name/nameContains,
// SOURCE_COUNT, HAS_DIGIMON, SECURITY_ADDED/REMOVED triggers, or EVENT_CONTEXT.
function findHasSpecificCardTraitConditionPollution(card) {
  const issues = [];
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (node.type === 'HAS_SPECIFIC_CARD' && Object.prototype.hasOwnProperty.call(node, 'trait')) {
      issues.push({ path: pathLabel, value: node.trait, condition: node });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}

// Round 15J: compound alternatives must not remain as one trait string.
// Examples like "Hybrid or Ten Warriors" must be traitAny, while mixed
// alternatives like "Night Claw or 2-color" must be anyOf.

function findTamerSuspendedEventBindingLeak(card) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/when (?:one|any) of your .*tamers? (?:becomes suspended|suspend)|when one of your effects suspends a tamer|when any of your opponent's tamers suspend/i.test(text)) return [];
  const issues = [];
  (Array.isArray(card.mechanics) ? card.mechanics : []).forEach((mech, mechanicIndex) => {
    const blob = JSON.stringify(mech || {}).toLowerCase();
    const trigger = String(mech?.trigger || '').toUpperCase();
    const mentionsTamerSuspend = /tamer/.test(blob) || /tamer/.test(text.toLowerCase());
    if (!mentionsTamerSuspend) return;
    const hasLegacyTamerCondition = /\"has_tamer\"/.test(blob) || /becomes suspended|tamer.*suspended|tamer.*suspend/.test(blob);
    if ((trigger === 'DIGIMON_SUSPENDED' || trigger === 'YOUR_TURN' || trigger === 'ALL_TURNS') && hasLegacyTamerCondition) {
      issues.push({ mechanicIndex, trigger, reason: 'Tamer suspension text must use OWN_TAMER_SUSPENDED / OPPONENT_TAMER_SUSPENDED event triggers, not Digimon/static triggers.' });
    }
    if ((trigger === 'OWN_TAMER_SUSPENDED' || trigger === 'OPPONENT_TAMER_SUSPENDED') && /"has_tamer"/.test(blob) && !/"event_context"/.test(blob)) {
      issues.push({ mechanicIndex, trigger, reason: 'Tamer-suspend listener must check the actual suspendedCard via EVENT_CONTEXT instead of board-state HAS_TAMER.' });
    }
  });
  return issues;
}

function findOptionUseCostConditionLeak(card) {
  const issues = [];
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if ((node.type === 'HAS_TRAIT' || node.type === 'HAS_SPECIFIC_CARD') && typeof node.trait === 'string' && /option card .*cost|option card with/i.test(node.trait)) {
      issues.push({ path: pathLabel, value: node.trait, condition: node });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}

function findCompoundTraitStringLeak(card) {
  const issues = [];
  function isCompoundAlternativeString(value) {
    return typeof value === 'string' && /\s+or\s+|\//i.test(value);
  }
  function isCompoundNameAlternativeString(value) {
    // Round 21H: comma-delimited printed name alternatives such as
    // "Huckmon, Jesmon, Sistermon" must also be split. A single
    // nameContains string would look for the whole phrase and match nothing.
    return typeof value === 'string' && (/\s+or\s+|\//i.test(value) || /,/.test(value));
  }
  function isCompoundTraitString(value) {
    // Round 21C: trait fields must not store phrases like
    // "Puppet and LIBERATOR" or "Bird Dragon and LIBERATOR". Official
    // "and" wording means all listed traits are required, encoded as traitAll.
    return typeof value === 'string' && (/\s+or\s+|\//i.test(value) || /\s+and\s+/i.test(value));
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    // Round 21A: compound card-name alternatives should be explicitly split.
    // Runtime can normalize some legacy strings, but generated mechanics should
    // use canonical nameContainsAny so audit/selection logic remains predictable.
    if (isCompoundTraitString(node.trait)) {
      issues.push({ path: `${pathLabel}.trait`, value: node.trait, expected: 'traitAny/traitAll/anyOf split alternatives' });
    }
    if (isCompoundNameAlternativeString(node.nameContains)) {
      issues.push({ path: `${pathLabel}.nameContains`, value: node.nameContains, expected: 'nameContainsAny split alternatives, including comma-delimited alternatives' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21E: Unique Emblem-style Delay Options trigger from named Tamer suspension.
// They must not be encoded as a static YOUR_TURN action, nor pay Delay by
// trashing security or suspending the Tamer. The Delay cost is trashing this
// Option from the battle area after its placing turn.
function findUniqueEmblemDelayTriggerLeak(card) {
  const issues = [];
  const text = String((card && (card.mainEffect || card.effectText)) || '');
  if (!/When any of your \[[^\]]+\]s? suspend,\s*＜Delay＞/i.test(text)) return issues;
  const expectedTamer = (text.match(/When any of your \[([^\]]+)\]s? suspend,\s*＜Delay＞/i) || [])[1] || null;
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const delayMechs = mechanics.filter(m => JSON.stringify(m || {}).includes('TRASH_OPTION_IN_BATTLE_AREA') || m.trigger === 'OWN_TAMER_SUSPENDED' || m.trigger === 'YOUR_TURN');
  const hasGood = delayMechs.some(m => {
    const blob = JSON.stringify(m || {});
    return m.trigger === 'OWN_TAMER_SUSPENDED'
      && /"TURN_PLAYER"/.test(blob)
      && /"EVENT_CONTEXT"/.test(blob)
      && (!expectedTamer || blob.includes(expectedTamer))
      && /"TRASH_OPTION_IN_BATTLE_AREA"/.test(blob)
      && !/"TRASH_SECURITY_STACK"/.test(blob)
      && !/"SUSPEND_OPPONENT"/.test(blob);
  });
  if (!hasGood) {
    issues.push({ expectedTamer, expected: 'OWN_TAMER_SUSPENDED + TURN_PLAYER own + EVENT_CONTEXT suspendedCard + TRASH_OPTION_IN_BATTLE_AREA' });
  }
  delayMechs.forEach((m, idx) => {
    const blob = JSON.stringify(m || {});
    if (m.trigger === 'YOUR_TURN') issues.push({ path: `mechanics[${idx}]`, issue: 'Delay suspend trigger encoded as static YOUR_TURN' });
    if (/"TRASH_SECURITY_STACK"/.test(blob)) issues.push({ path: `mechanics[${idx}]`, issue: 'Delay cost trashes security instead of this Option in battle area' });
    if (/"SUSPEND_OPPONENT"/.test(blob)) issues.push({ path: `mechanics[${idx}]`, issue: 'Delay trigger/cost incorrectly suspends a Tamer' });
  });
  return issues;
}


// Round 21B: printed color+trait selectors must keep both restrictions.
// Example: "blue or yellow [TS] trait Digimon" is not just trait:"TS".
function findColorTraitSelectorLeak(card) {
  const issues = [];
  const text = String((card && (card.mainEffect || card.effectText)) || '');
  const patterns = [
    { re: /blue\s+or\s+yellow\s+\[TS\]\s*trait\s+Digimon/i, trait: 'TS', colors: ['Blue', 'Yellow'] }
  ];
  const active = patterns.filter(p => p.re.test(text));
  if (active.length === 0) return issues;
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (node.target && typeof node.target === 'object') {
      for (const ptn of active) {
        const t = node.target;
        if (String(t.trait || '').toLowerCase() === ptn.trait.toLowerCase()) {
          const got = Array.isArray(t.colorAny) ? t.colorAny.map(x => String(x).toLowerCase()) : [];
          const missing = ptn.colors.filter(c => !got.includes(c.toLowerCase()));
          if (missing.length > 0) {
            issues.push({ path: `${pathLabel}.target`, trait: t.trait, expectedColorAny: ptn.colors });
          }
        }
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21D: color OR alternatives should be canonicalized as colorAny.
// Runtime can split legacy color strings, but generated mechanics should not keep
// values like "blue or green" in a single color field because that hides OR
// semantics from audits and future transformations.
function findCompoundColorStringLeak(card) {
  const issues = [];
  function isCompoundColorString(value) {
    if (typeof value !== 'string') return false;
    return /\b(red|blue|yellow|green|black|purple|white)\b\s+or\s+\b(red|blue|yellow|green|black|purple|white)\b/i.test(value);
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (isCompoundColorString(node.color)) {
      issues.push({ path: `${pathLabel}.color`, value: node.color, expected: 'colorAny split alternatives' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21F/21G: card-type OR alternatives should be encoded as anyOf, not as
// one impossible cardType string such as "digimon or tamer" / "tamer or option".
// Runtime keeps a compatibility fallback, but generated card data should use explicit OR.
function findCompoundCardTypeStringLeak(card) {
  const issues = [];
  function isCompoundCardTypeString(value) {
    if (typeof value !== 'string') return false;
    return /^(digimon|tamers?|options?)\s+or\s+(digimon|tamers?|options?)$/i.test(value.trim());
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (isCompoundCardTypeString(node.cardType)) {
      issues.push({ path: `${pathLabel}.cardType`, value: node.cardType, expected: 'anyOf card-type alternatives' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21L: “the Digimon this effect played gains <keyword>” must be a
// same-effect played-card follow-up. Do not hide the granted keyword inside the
// PLAY_FROM_* action's buff field or it can be skipped/stale-bound at runtime.
function findPlayedByThisEffectKeywordBuffLeak(card) {
  const issues = [];
  const text = String(card?.mainEffect || '') + ' ' + String(card?.sourceEffect || '') + ' ' + String(card?.effectText || '');
  if (!/(?:digimon|card)\s+(?:this effect played|played by this effect)\s+gains?/i.test(text)) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (!/GRANT_KEYWORD_TO_PLAYED_BY_EFFECT/.test(blob)) {
    issues.push({ path: 'mechanics', issue: 'missing GRANT_KEYWORD_TO_PLAYED_BY_EFFECT for played-by-this-effect keyword grant' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    const type = String(node.type || '').toUpperCase();
    if (/^PLAY_FROM_/.test(type) && node.buff && typeof node.buff.keyword === 'string') {
      issues.push({ path: `${pathLabel}.buff.keyword`, value: node.buff.keyword, expected: 'separate GRANT_KEYWORD_TO_PLAYED_BY_EFFECT action(s)' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}




// Round 21Q: "2 or more colors" is a color-count predicate, not trait text.
// Older generated mechanics used trait:"2" / trait:"more colors" or textContains
// placeholders, which silently miss real multicolor Digimon and their sources.
function findMulticolorTraitConditionLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '').toLowerCase()).join(' ');
  if (!/(?:2|two) or more colors/.test(text)) return issues;
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    const trait = String(node.trait || '').toLowerCase().trim();
    const textContains = String(node.textContains || '').toLowerCase().trim();
    if ((trait === '2' || trait === 'more colors') || (textContains === '2' || textContains === 'more colors')) {
      issues.push({ path: pathLabel, value: node.trait || node.textContains, expected: 'multicolor:true or sourceMulticolor:true' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21R: "with no digivolution cards" is a source-count predicate, not a
// trait. Runtime compatibility may exist, but card data must encode it with
// maxSourceCount:0 / NOT HAS_DIGIMON minSourceCount:1 / dynamic matching counts.
function findNoSourceTraitConditionLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '').toLowerCase()).join(' ');
  if (!/no digivolution cards|no digimon with digivolution cards|without digivolution cards/.test(text)) return issues;
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    const trait = String(node.trait || '').toLowerCase().trim();
    if (/no digivolution cards/.test(trait) || /^digivolution cards?$/.test(trait) || /with no digivolution cards/.test(trait)) {
      issues.push({ path: `${pathLabel}.trait`, value: node.trait, expected: 'maxSourceCount/minSourceCount source-count predicate' });
    }
    const keyword = String(node.buff?.keyword || node.keyword || '').toLowerCase();
    if (/can't be blocked by .*no digivolution cards|cannot be blocked by .*no digivolution cards/.test(keyword) && !node.buff?.blockerRestriction && !node.blockerRestriction) {
      issues.push({ path: `${pathLabel}.buff.keyword`, value: node.buff?.keyword || node.keyword, expected: 'blockerRestriction:{maxSourceCount:0}' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}


// Round 21S: "without cards under it" applies to the source/under-card count
// of a Digimon or Tamer host. It is not a trait and must not split the printed
// single Digimon-or-Tamer choice into two separate targets.
function findNoCardsUnderTraitConditionLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '').toLowerCase()).join(' ');
  if (!/without cards under it|no cards under it|cards under/.test(text)) return issues;
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    const trait = String(node.trait || '').toLowerCase().trim();
    if (/no cards under it|without cards under it|cards under/.test(trait)) {
      issues.push({ path: `${pathLabel}.trait`, value: node.trait, expected: 'maxSourceCount/minSourceCount under-card predicate' });
    }
    const type = String(node.type || '').toUpperCase();
    if (type === 'TRASH_SECURITY_STACK' && /trash .*card under/i.test(text)) {
      issues.push({ path: `${pathLabel}.type`, value: node.type, expected: 'TRASH_SOURCE with sourceHostTarget' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}

// Round 21M: printed hand-size clauses must use HAND_COUNT. MEMORY_COUNT is
// only for the memory gauge; using it for “cards in your hand” makes hand-size
// effects fire based on turn memory instead of the player's actual hand.
function findHandCountAsMemoryCountLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '').toLowerCase()).join(' ');
  if (!/cards? in (?:your|the) hand/.test(text)) return issues;
  const numberWords = new Map([[0,'zero'],[1,'one'],[2,'two'],[3,'three'],[4,'four'],[5,'five'],[6,'six'],[7,'seven'],[8,'eight'],[9,'nine'],[10,'ten'],[11,'eleven'],[12,'twelve']]);
  function hasPrintedHandClause(value, operator) {
    if (value === undefined || value === null) return false;
    const values = [String(value).toLowerCase(), numberWords.get(Number(value))].filter(Boolean);
    return values.some(v => {
      const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fewer = new RegExp(`${esc}\\s+or\\s+(?:fewer|less)\\s+cards?\\s+in\\s+(?:your|the)\\s+hand`, 'i');
      const more = new RegExp(`${esc}\\s+or\\s+more\\s+cards?\\s+in\\s+(?:your|the)\\s+hand`, 'i');
      if (['<=','<','=','=='].includes(String(operator || ''))) return fewer.test(text);
      if (['>=','>','=','=='].includes(String(operator || ''))) return more.test(text);
      return fewer.test(text) || more.test(text);
    });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (String(node.type || '').toUpperCase() === 'MEMORY_COUNT' && hasPrintedHandClause(node.value, node.operator)) {
      issues.push({ path: pathLabel, value: node.value, operator: node.operator, expected: 'HAND_COUNT' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(card.mechanics || []);
  return issues;
}

// Round 21O: granted triggered text must not be hidden as a fake keyword.
// Effects such as "When this Digimon becomes suspended, lose 1 memory" need a
// temporary trigger payload so runtime can fire it later when that Digimon suspends.
function findGrantedSuspendTriggerKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const needsLoseMemory = /when this digimon becomes suspended,?\s*lose 1 memory/i.test(text);
  const needsDeleteByPlayCost = /when this digimon becomes suspended[\s\S]{0,160}delete all of your opponent's digimon with a play cost less than or equal to this digimon/i.test(text);
  if (!needsLoseMemory && !needsDeleteByPlayCost) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (needsLoseMemory && (!/GRANT_TRIGGER_EFFECT/.test(blob) || !/DIGIMON_SUSPENDED/.test(blob) || !/LOSE_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with DIGIMON_SUSPENDED -> LOSE_MEMORY' });
  }
  if (needsDeleteByPlayCost && (!/GRANT_TRIGGER_EFFECT/.test(blob) || !/DIGIMON_SUSPENDED/.test(blob) || !/DELETE_DIGIMON/.test(blob) || !/maxCost/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with DIGIMON_SUSPENDED -> DELETE_DIGIMON maxCost:this' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`));
      return;
    }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/when this digimon becomes suspended/.test(keyword) || /lose 1 memory/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}

// Round 21T: granted [On Deletion] text is also a temporary trigger, not a keyword.
function findGrantedOnDeletionTriggerKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const needsLose1 = /gains?\s*["“]?\s*\[?on deletion\]?\s*lose 1 memory/i.test(text);
  const needsLose2 = /gains?\s*["“]?\s*\[?on deletion\]?\s*"?\s*lose 2 memory/i.test(text);
  const needsTrashSecurity = /gains?\s*["“]?\s*\[?on deletion\]?\s*trash the top card of your security stack/i.test(text);
  const needsGainMemory = /gains?\s*["“]?\s*\[?on deletion\]?\s*gain \+?\d+ memory/i.test(text);
  const needsPlayFromHandOrTrash = /gains?\s*["“]?\s*\[?on deletion\]?\s*(?:you may )?play 1 .* from your hand or trash without paying/i.test(text);
  if (!needsLose1 && !needsLose2 && !needsTrashSecurity && !needsGainMemory && !needsPlayFromHandOrTrash) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if ((needsLose1 || needsLose2) && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /ON_DELETION/.test(blob) && /LOSE_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with ON_DELETION -> LOSE_MEMORY' });
  }
  if (needsTrashSecurity && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /ON_DELETION/.test(blob) && /TRASH_SECURITY_STACK/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with ON_DELETION -> TRASH_SECURITY_STACK' });
  }
  if (needsGainMemory && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /ON_DELETION/.test(blob) && /GAIN_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with ON_DELETION -> GAIN_MEMORY' });
  }
  if (needsPlayFromHandOrTrash && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /ON_DELETION/.test(blob) && /PLAY_FROM_HAND_OR_TRASH/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT with ON_DELETION -> PLAY_FROM_HAND_OR_TRASH' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/on deletion/.test(keyword) && /(lose \d+ memory|gain \d+ memory|trash the top card of your security stack|play 1 .* from your hand or trash)/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}


function findGrantedEventTextKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const needsBlocked = /when this digimon is blocked,?\s*gain \+?3 memory/i.test(text);
  const needsBattleWon = /when this digimon deletes an opponent's digimon in battle and survives,?\s*unsuspend it/i.test(text);
  const needsSecurityChecked = /when this digimon checks your opponent's security stack,?\s*gain 2 memory/i.test(text);
  if (!needsBlocked && !needsBattleWon && !needsSecurityChecked) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (needsBlocked && !((/GRANT_TRIGGER_EFFECT/.test(blob) || /\"trigger\"\s*:\s*\"ATTACK_BLOCKED\"/.test(blob)) && /ATTACK_BLOCKED/.test(blob) && /GAIN_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'ATTACK_BLOCKED -> GAIN_MEMORY, either direct inherited trigger or GRANT_TRIGGER_EFFECT' });
  }
  if (needsBattleWon && !((/GRANT_TRIGGER_EFFECT/.test(blob) || /\"trigger\"\s*:\s*\"BATTLE_WON\"/.test(blob)) && /BATTLE_WON/.test(blob) && /UNSUSPEND/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'BATTLE_WON -> UNSUSPEND, either direct inherited trigger or GRANT_TRIGGER_EFFECT' });
  }
  if (needsSecurityChecked && !((/GRANT_TRIGGER_EFFECT/.test(blob) || /\"trigger\"\s*:\s*\"SECURITY_CHECKED\"/.test(blob)) && /SECURITY_CHECKED/.test(blob) && /GAIN_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'SECURITY_CHECKED -> GAIN_MEMORY, either direct inherited trigger or GRANT_TRIGGER_EFFECT' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/when this digimon is blocked|deletes an opponent's digimon in battle and survives|checks your opponent's security stack/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}



// Round 22A: attach [End of Attack] to all On Deletion effects must add a real timing copy.
function findAttachEndAttackOnDeletionTimingLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  if (!/attach\s*\[end of attack\]\s*to all of this digimon's\s*\[on deletion\]\s*effects/i.test(text)) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const hasEndAttackCopy = mechanics.some(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && JSON.stringify(m).includes('PLAY_FROM_HAND') && JSON.stringify(m).includes('PLAYED_BY_THIS_EFFECT'));
  if (!hasEndAttackCopy) issues.push({ path: 'mechanics', expected: "END_OF_ATTACK copy of this Digimon's On Deletion effect with same-effect played binding" });
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/^end of attack$|attach.*end of attack|on deletion/.test(keyword)) issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'END_OF_ATTACK mechanic copy, not GRANT_KEYWORD' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}

// Round 21W: granted [End of Attack] text is a temporary trigger, not a keyword.
function findGrantedEndOfAttackTriggerKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const printedGrant = /(?:gain|gains|grant|grants|gives?)[\s\S]{0,180}["“][^"”]*end of attack[^"”]*delete this digimon/i.test(text);
  if (!printedGrant) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (!(/GRANT_TRIGGER_EFFECT/.test(blob) && /END_OF_ATTACK/.test(blob) && /DELETE_DIGIMON/.test(blob) && /"self"\s*:\s*true/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT END_OF_ATTACK -> DELETE_DIGIMON self' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/end of attack/.test(keyword) && /delete this digimon/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}


// Round 21Z: granted [End of Your Turn] deletion text is a temporary trigger, not a keyword.
function findGrantedEndOfTurnDeletionKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const printedGrant = /(?:gain|gains|grant|grants|gives?)[\s\S]{0,220}["“][^"”]*end of your turn[^"”]*(?:delete this digimon|delete 1 of your digimon)/i.test(text);
  if (!printedGrant) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (!(/GRANT_TRIGGER_EFFECT/.test(blob) && /END_OF_TURN/.test(blob) && /DELETE_DIGIMON/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT END_OF_TURN -> DELETE_DIGIMON' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const stat = String(node.stat || node.buff?.stat || '').toLowerCase();
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if ((/end_of_turn|end of turn/.test(stat) || /end of your turn/.test(keyword)) && /delete/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
      if (/delete_digimon/.test(keyword) && /end_of_turn|end of turn/.test(stat)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}

// Round 21V: granted [When Attacking] text is a temporary trigger, not a keyword.
// This covers attack-tax effects such as Ice Wall/Takumi, and attack-granted
// effect text such as Forbidden Trident / I'll Drag You Into the Depths.
function findGrantedWhenAttackingTriggerKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const needsAttackTax = /(?:gain|gains|grant|grants|all level 3 digimon gain)[\s\S]{0,180}[\"“][^\"”]*\[?when attacking\]?\s*lose\s+\d+\s+memory/i.test(text) || /all level 3 digimon gain[^.]*\[?when attacking\]?[^.]*lose\s+\d+\s+memory/i.test(text);
  const needsAttackReturn = /(?:gain|gains|grant|grants)[\s\S]{0,180}[\"“][^\"”]*\[?when attacking\]?\s*return\s+1\s+of\s+your\s+opponent's\s+level\s+3\s+digimon/i.test(text);
  const needsAttackDeleteNoSource = /(?:gain|gains|grant|grants)[\s\S]{0,180}[\"“][^\"”]*when attacking an opponent's digimon with no digivolution cards,?\s*delete that digimon/i.test(text);
  const needsAttackTrashOwnSource = /all of your opponent's digimon gain[\s\S]{0,220}[\"“][^\"”]*\[?when attacking\]?\s*trash the bottom digivolution card of this digimon/i.test(text);
  if (!needsAttackTax && !needsAttackReturn && !needsAttackDeleteNoSource && !needsAttackTrashOwnSource) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (needsAttackTax && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /WHEN_ATTACKING/.test(blob) && /LOSE_MEMORY/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT WHEN_ATTACKING -> LOSE_MEMORY' });
  }
  if (needsAttackReturn && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /WHEN_ATTACKING/.test(blob) && /BOUNCE/.test(blob) && /currentAttackTarget/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT WHEN_ATTACKING -> BOUNCE current attack target' });
  }
  if (needsAttackDeleteNoSource && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /WHEN_ATTACKING/.test(blob) && /DELETE_DIGIMON/.test(blob) && /currentAttackTarget/.test(blob) && /maxSourceCount/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT WHEN_ATTACKING -> DELETE current no-source attack target' });
  }
  if (needsAttackTrashOwnSource && !(/GRANT_TRIGGER_EFFECT/.test(blob) && /WHEN_ATTACKING/.test(blob) && /TRASH_BOTTOM_EVO/.test(blob) && /"self"\s*:\s*true/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT WHEN_ATTACKING -> TRASH_BOTTOM_EVO self' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    const type = String(node.type || '').toUpperCase();
    if (type === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/\[?when attacking\]?/.test(keyword) && /(lose\s+\d+\s+memory|return\s+1\s+of\s+your\s+opponent's\s+level\s+3\s+digimon|delete that digimon|trash the bottom digivolution card of this digimon)/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    if (type === 'HAS_TRAIT') {
      const trait = String(node.trait || node.value || '').toLowerCase();
      if (/\[?when attacking\]?/.test(trait)) issues.push({ path: pathLabel, value: node.trait || node.value, expected: 'EVENT_CONTEXT / GRANT_TRIGGER_EFFECT, not HAS_TRAIT' });
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}



// Round 21U: granted Start-of-Main attack text is not a keyword; it is a
// temporary trigger that must fire when the affected Digimon's controller enters
// their main phase and then force that Digimon to attack if able.

// Round 21Y: printed "activate 1 of its [On Deletion]/[When Digivolving] effects" re-activates
// an existing trigger. It must not be represented as gaining a fake keyword.
function findActivatePrintedTriggerKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const needsOnDeletionActivate = /activate 1 of (?:the |its |that card's |that digimon's |this digimon's )?\[?on deletion\]? effects?/i.test(text);
  const needsWhenDigivolvingActivate = /activate 1 of (?:the |its |that card's |that digimon's |this digimon's )?\[?when digivolving\]? effects?/i.test(text);
  if (!needsOnDeletionActivate && !needsWhenDigivolvingActivate) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (needsOnDeletionActivate && !(/ACTIVATE_TRIGGER_EFFECT/.test(blob) && /ON_DELETION/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'ACTIVATE_TRIGGER_EFFECT triggerName:ON_DELETION' });
  }
  if (needsWhenDigivolvingActivate && !(/ACTIVATE_TRIGGER_EFFECT/.test(blob) && /WHEN_DIGIVOLVING/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'ACTIVATE_TRIGGER_EFFECT triggerName:WHEN_DIGIVOLVING' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/^(on deletion|when digivolving)$/.test(keyword.trim()) || /activate 1 .*effect/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'ACTIVATE_TRIGGER_EFFECT, not GRANT_KEYWORD' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}



// Round 22C: printed immediate "may attack / may attack a player" clauses are
// effect-created attack requests. They are not keyword buffs and should open the
// normal effect attack choice flow through REQUEST_ATTACK_PLAYER.
function findMayAttackKeywordRequestLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const mentionsAttackRequest = /\b(?:may attack|it may attack|this digimon may attack|one of (?:your|them).*may attack|may attack a player|may attack your opponent['’]s digimon|may attack opponent['’]s digimon|may attack without suspending)\b/i.test(text);
  const mentionsMayBattle = /\bmay battle 1 of your opponent['’]s Digimon\b/i.test(text);
  if (!mentionsAttackRequest && !mentionsMayBattle) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (/may attack (?:your )?opponent['’]s Digimon/i.test(text) && !/REQUEST_ATTACK_DIGIMON/.test(blob)) {
    issues.push({ path: 'mechanics', expected: 'REQUEST_ATTACK_DIGIMON for printed may-attack-opponent-Digimon text.' });
  }
  if (/may attack without suspending/i.test(text) && !(/REQUEST_ATTACK_PLAYER/.test(blob) && /withoutSuspending/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'REQUEST_ATTACK_PLAYER with withoutSuspending:true for printed may-attack-without-suspending text.' });
  }
  if (mentionsMayBattle && !/BATTLE_DIGIMON/.test(blob)) {
    issues.push({ path: 'mechanics', expected: 'BATTLE_DIGIMON for printed may-battle text, not an attack keyword.' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').trim();
      if (/^(may attack|may attack a player|may attack opponent['’]s digimon|attack|can attack|can_attack|attack active)$/i.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'REQUEST_ATTACK_PLAYER/REQUEST_ATTACK_DIGIMON/BATTLE_DIGIMON optional attack request, not GRANT_KEYWORD' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}

function findGrantedStartMainAttackKeywordLeak(card) {
  const issues = [];
  const text = [card?.mainEffect, card?.sourceEffect, card?.effectText].map(x => String(x || '')).join(' ');
  const printedGrant = /\b(?:give|gains?|gain)\b[\s\S]{0,220}[\"“][^\"”]*start of your main phase[^\"”]*(?:this digimon attacks|attack with this digimon)/i.test(text);
  if (!printedGrant) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const blob = JSON.stringify(mechanics || {});
  if (!(/GRANT_TRIGGER_EFFECT/.test(blob) && /START_OF_MAIN_PHASE/.test(blob) && /REQUEST_ATTACK_PLAYER/.test(blob) && /forcedAttack/.test(blob))) {
    issues.push({ path: 'mechanics', expected: 'GRANT_TRIGGER_EFFECT START_OF_MAIN_PHASE -> forced REQUEST_ATTACK_PLAYER' });
  }
  function walk(node, pathLabel = 'mechanics') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((child, idx) => walk(child, `${pathLabel}[${idx}]`)); return; }
    if (String(node.type || '').toUpperCase() === 'GRANT_KEYWORD') {
      const keyword = String(node.keyword || node.buff?.keyword || '').toLowerCase();
      if (/start of your main phase/.test(keyword) && /(this digimon attacks|attack with this digimon)/.test(keyword)) {
        issues.push({ path: pathLabel, value: node.keyword || node.buff?.keyword, expected: 'GRANT_TRIGGER_EFFECT' });
      }
    }
    Object.entries(node).forEach(([key, value]) => walk(value, `${pathLabel}.${key}`));
  }
  walk(mechanics);
  return issues;
}


function findDualOptionSideMissing(card) {
  const type = String(card?.type || card?.cardType || '').toLowerCase();
  if (!type.includes('dual')) return [];
  const sourceText = String(card?.sourceEffect || card?.optionEffect || card?.mainEffect || card?.effectText || '').toLowerCase();
  if (!sourceText.includes('[main]')) return [];
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const hasGatedOptionMain = mechanics.some(mech => mech && mech.dualOptionSide === true && String(mech.trigger || '').toUpperCase() === 'MAIN');
  if (hasGatedOptionMain) return [];
  return [{ path: 'mechanics', reason: 'DUAL source/Option side has [Main] text but no gated dualOptionSide MAIN mechanic' }];
}

function findDualGenericPlayLeak(card) {
  const issues = [];
  function walkAction(action, pathLabel = 'mechanics') {
    if (!action || typeof action !== 'object') return;
    const type = String(action.type || '').toUpperCase();
    if (type.startsWith('PLAY_FROM') && action.allowDualPlay === true) {
      issues.push({ path: pathLabel, type, reason: 'generic play action explicitly allows DUAL play; use Arts Digivolve support instead' });
    }
    Object.entries(action).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((child, idx) => walkAction(child, `${pathLabel}.${key}[${idx}]`));
      else if (value && typeof value === 'object') walkAction(value, `${pathLabel}.${key}`);
    });
  }
  (Array.isArray(card?.mechanics) ? card.mechanics : []).forEach((mech, mi) => {
    (Array.isArray(mech?.actions) ? mech.actions : []).forEach((action, ai) => walkAction(action, `mechanics[${mi}].actions[${ai}]`));
  });
  return issues;
}


function findDualUngatedOptionSideLeak(card) {
  const type = String(card?.type || card?.cardType || '').toLowerCase();
  if (!type.includes('dual')) return [];
  const sourceText = String(card?.sourceEffect || card?.optionEffect || card?.mainEffect || card?.effectText || '').toLowerCase();
  if (!sourceText.includes('[main]')) return [];
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  const issues = [];
  mechanics.forEach((mech, idx) => {
    if (!mech || String(mech.trigger || '').toUpperCase() !== 'MAIN') return;
    if (mech.dualOptionSide === true) return;
    issues.push({
      path: `mechanics[${idx}]`,
      reason: 'DUAL Option-side [Main] mechanic is not gated with dualOptionSide:true and may trigger as normal/inherited MAIN text',
      isInherited: mech.isInherited === true,
      actionTypes: (Array.isArray(mech.actions) ? mech.actions : []).map(a => a?.type).filter(Boolean)
    });
  });
  return issues;
}


// Round 18T: CRM 4.0 says DUAL Option reference uses lower Option-side
// information plus the card's traits. The dangerous bug is missing Option-side
// colors or ungated Option [Main] effects, not sharing the printed traits.
function findDualOptionInfoScopeLeak(card) {
  const type = String(card?.type || card?.cardType || '').toLowerCase();
  if (!type.includes('dual')) return [];
  const issues = [];
  const optionColors = [
    ...(Array.isArray(card?.optionColors) ? card.optionColors : []),
    ...(Array.isArray(card?.dualOptionColors) ? card.dualOptionColors : []),
    ...String(card?.optionColor || '').split(/[\/,&+|]/),
    ...String(card?.dualOptionColor || '').split(/[\/,&+|]/)
  ].map(x => String(x || '').replace(/ /g, ' ').trim()).filter(Boolean);
  if (optionColors.length === 0) {
    issues.push({ path: 'optionColors', reason: 'DUAL card is missing lower Option-side color metadata; do not fall back to Digimon-side colors.' });
  }
  const digimonTraits = [
    ...(Array.isArray(card?.traitTokens) ? card.traitTokens : []),
    ...String(card?.traits || '').split(',')
  ].map(x => String(x || '').replace(/ /g, ' ').trim()).filter(Boolean);
  const optionTraits = [
    ...(Array.isArray(card?.optionTraitTokens) ? card.optionTraitTokens : []),
    ...(Array.isArray(card?.dualOptionTraitTokens) ? card.dualOptionTraitTokens : []),
    ...String(card?.optionTraits || '').split(',')
  ].map(x => String(x || '').replace(/ /g, ' ').trim()).filter(Boolean);
  if (digimonTraits.length > 0 && optionTraits.length === 0) {
    issues.push({ path: 'optionTraitTokens', reason: 'DUAL Option reference should include the card traits per CRM 4.0.' });
  }
  return issues;
}


// Round 15O: Official 2026-04-17 text/ruling update standardizes specific
// listed effects from "gain memory and <Draw 1>" to "<Draw 1> and gain memory".
// Audit only the official listed card IDs; Rhythm-style conditional separated
// effects are explicitly excluded by the official note.
const OFFICIAL_DRAW_THEN_MEMORY_IDS = new Set([
  'BT6-087', 'BT6-088', 'BT8-028', 'BT8-092', 'BT9-092', 'BT11-092',
  'BT11-095', 'BT13-102', 'BT17-052', 'EX1-069', 'EX2-017', 'EX2-045', 'RB1-032'
]);

function findMemoryDrawOrderLeak(card) {
  if (!OFFICIAL_DRAW_THEN_MEMORY_IDS.has(String(card?.id || ''))) return [];
  const issues = [];
  (Array.isArray(card?.mechanics) ? card.mechanics : []).forEach((mech, mechanicIndex) => {
    const actions = Array.isArray(mech?.actions) ? mech.actions : [];
    for (let i = 0; i < actions.length - 1; i++) {
      const first = String(actions[i]?.type || '').toUpperCase();
      const second = String(actions[i + 1]?.type || '').toUpperCase();
      if (first === 'GAIN_MEMORY' && second === 'DRAW') {
        issues.push({
          mechanicIndex,
          actionIndex: i,
          trigger: mech?.trigger || null,
          reason: 'official listed card still resolves GAIN_MEMORY before DRAW'
        });
      }
    }
  });
  return issues;
}

function collectSemanticIssues(card, report, cachedTextLower = null, cachedMechanicsLower = null) {
  const text = cachedTextLower || `${card.mainEffect || ''} ${card.sourceEffect || ''}`.toLowerCase();
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const mechanicsStr = cachedMechanicsLower || JSON.stringify(mechanics).toLowerCase();

  const traitTokens = [
    ...(Array.isArray(card.traitTokens) ? card.traitTokens : []),
    ...String(card.traits || '').split(',').map(x => x.trim()).filter(Boolean)
  ];
  const officialTraitTokens = new Set(String(card.traits || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  const polluted = [...new Set(traitTokens.filter(t => {
    const token = String(t).trim().toLowerCase();
    if (!TIMING_OR_RULE_TRAIT_TOKENS.has(token)) return false;
    // BT24 Appmon cards can officially have Type "Security"; that is metadata,
    // not a leaked [Security] timing label.
    if (token === 'security' && officialTraitTokens.has('security')) return false;
    return true;
  }))];
  if (polluted.length > 0) {
    addSemanticIssue(report, card, 'timingTraitPollution', 'timing/rule text was stored as a trait token', { tokens: polluted });
  }

  // Round 17Y: skip expensive recursive semantic walkers unless the card
  // contains the fields/text that can actually trigger that guard.
  const hasTraitSelectorBlob = mechanicsStr.includes('"trait"') || mechanicsStr.includes('"traitany"');
  const hasColorSelectorBlob = mechanicsStr.includes('"color"') || mechanicsStr.includes('"colorany"');
  const hasCardTypeSelectorBlob = mechanicsStr.includes('"cardtype"') || mechanicsStr.includes('"anyof"');
  const hasBracketText = text.includes('[') && text.includes(']');
  const typeLower = String(card?.type || card?.cardType || '').toLowerCase();
  const maybeDual = typeLower.includes('dual') || mechanicsStr.includes('dualside') || mechanicsStr.includes('dualoptionside');

  if (hasBracketText && traitTokens.length > 0) {
    const metadataPolluted = findMetadataTraitTextPollution(card);
    if (metadataPolluted.length > 0) {
      addSemanticIssue(report, card, 'metadataTraitTextPollution', 'card-name bracket references from rules text are still stored as trait metadata', { tokens: metadataPolluted });
    }
  }

  if (hasTraitSelectorBlob) {
    const mechanicsTraitNamePolluted = findMechanicsTraitNamePollution(card);
    if (mechanicsTraitNamePolluted.length > 0) {
      addSemanticIssue(report, card, 'mechanicsTraitNamePollution', 'mechanics trait field is using exact card-name references; use name/nameAny/nameContains/textContains instead', { issues: mechanicsTraitNamePolluted });
    }

    const mechanicsTraitColorPolluted = findMechanicsTraitColorPollution(card);
    if (mechanicsTraitColorPolluted.length > 0) {
      addSemanticIssue(report, card, 'mechanicsTraitColorPollution', 'mechanics trait field is using color words; use color/colorAny/multicolor instead', { issues: mechanicsTraitColorPolluted });
    }

    const compoundTraitLeaks = findCompoundTraitStringLeak(card);
    if (compoundTraitLeaks.length > 0) {
      addSemanticIssue(report, card, 'compoundTraitStringLeak', 'compound alternatives are still encoded as one trait string; split into traitAny/colorAny/nameContainsAny/keywordAny/anyOf', { issues: compoundTraitLeaks });
    }

    const colorTraitLeaks = findColorTraitSelectorLeak(card);
    if (colorTraitLeaks.length > 0) {
      addSemanticIssue(report, card, 'colorTraitSelectorLeak', 'printed color+trait selector lost its color restriction; use colorAny plus trait', { issues: colorTraitLeaks });
    }
  }


  if (hasColorSelectorBlob) {
    const compoundColorLeaks = findCompoundColorStringLeak(card);
    if (compoundColorLeaks.length > 0) {
      addSemanticIssue(report, card, 'compoundColorStringLeak', 'compound color alternatives are still encoded as one color string; split into colorAny', { issues: compoundColorLeaks });
    }
  }

  if (hasCardTypeSelectorBlob) {
    const compoundCardTypeLeaks = findCompoundCardTypeStringLeak(card);
    if (compoundCardTypeLeaks.length > 0) {
      addSemanticIssue(report, card, 'compoundCardTypeStringLeak', 'compound card-type alternatives are still encoded as one cardType string; split into anyOf card-type alternatives', { issues: compoundCardTypeLeaks });
    }
  }

  if (text.includes('＜Delay＞') && /When any of your \[[^\]]+\]s? suspend/i.test(text)) {
    const uniqueEmblemDelayLeaks = findUniqueEmblemDelayTriggerLeak(card);
    if (uniqueEmblemDelayLeaks.length > 0) {
      addSemanticIssue(report, card, 'uniqueEmblemDelayTriggerLeak', 'Unique Emblem Delay suspend trigger/cost must listen to named Tamer suspension and trash this Option from battle area', { issues: uniqueEmblemDelayLeaks });
    }
  }



  if (/when (?:one|any) of your .*tamers? (?:becomes suspended|suspend)|when one of your effects suspends a tamer|when any of your opponent's tamers suspend/i.test(text)) {
    const tamerSuspendLeaks = findTamerSuspendedEventBindingLeak(card);
    if (tamerSuspendLeaks.length > 0) {
      addSemanticIssue(report, card, 'tamerSuspendedEventBindingLeak', 'Tamer-suspend effects must bind to OWN/OPPONENT_TAMER_SUSPENDED and EVENT_CONTEXT.suspendedCard', { issues: tamerSuspendLeaks });
    }
  }

  if (/option card .*cost|option card with/i.test(mechanicsStr)) {
    const optionUseCostLeaks = findOptionUseCostConditionLeak(card);
    if (optionUseCostLeaks.length > 0) {
      addSemanticIssue(report, card, 'optionUseCostConditionLeak', 'Option-use cost clauses must inspect EVENT_CONTEXT.optionCard or same-effect option use, not fake HAS_TRAIT strings', { issues: optionUseCostLeaks });
    }
  }

  if (/(?:digimon|card)\s+(?:this effect played|played by this effect)\s+gains?/i.test(text)) {
    const playedKeywordLeaks = findPlayedByThisEffectKeywordBuffLeak(card);
    if (playedKeywordLeaks.length > 0) {
      addSemanticIssue(report, card, 'playedByThisEffectKeywordBuffLeak', 'Keyword grants to the Digimon/card played by this effect must use same-effect played-card binding', { issues: playedKeywordLeaks });
    }
  }

  if (/cards? in (?:your|the) hand/i.test(text)) {
    const handCountLeaks = findHandCountAsMemoryCountLeak(card);
    if (handCountLeaks.length > 0) {
      addSemanticIssue(report, card, 'handCountAsMemoryCountLeak', 'Printed cards-in-hand conditions must use HAND_COUNT, not MEMORY_COUNT', { issues: handCountLeaks });
    }
  }

  if (/(?:2|two) or more colors/i.test(text)) {
    const multicolorLeaks = findMulticolorTraitConditionLeak(card);
    if (multicolorLeaks.length > 0) {
      addSemanticIssue(report, card, 'multicolorTraitConditionLeak', 'Printed 2-or-more-colors clauses must use multicolor/sourceMulticolor predicates, not fake trait/text strings', { issues: multicolorLeaks });
    }
  }

  if (/no digivolution cards|no Digimon with digivolution cards|without digivolution cards/i.test(text)) {
    const noSourceLeaks = findNoSourceTraitConditionLeak(card);
    if (noSourceLeaks.length > 0) {
      addSemanticIssue(report, card, 'noSourceTraitConditionLeak', 'Printed no-digivolution-card clauses must use source-count predicates, not fake trait strings', { issues: noSourceLeaks });
    }
  }


  if (/without cards under it|no cards under it|trash .*card under/i.test(text)) {
    const noCardsUnderLeaks = findNoCardsUnderTraitConditionLeak(card);
    if (noCardsUnderLeaks.length > 0) {
      addSemanticIssue(report, card, 'noCardsUnderTraitConditionLeak', 'Printed cards-under clauses must use source/under-card predicates and TRASH_SOURCE, not fake traits or security trash', { issues: noCardsUnderLeaks });
    }
  }

  if (/when this digimon becomes suspended/i.test(text)) {
    const grantedSuspendLeaks = findGrantedSuspendTriggerKeywordLeak(card);
    if (grantedSuspendLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedSuspendTriggerKeywordLeak', 'Granted suspend-trigger text must be a temporary trigger, not a fake keyword', { issues: grantedSuspendLeaks });
    }
  }


  if (/activate 1 of (?:the |its )?\[?(?:on deletion|when digivolving)\]? effects?/i.test(text)) {
    const activateTriggerLeaks = findActivatePrintedTriggerKeywordLeak(card);
    if (activateTriggerLeaks.length > 0) {
      addSemanticIssue(report, card, 'activatePrintedTriggerKeywordLeak', 'Printed activate-1-of-trigger-effects clauses must use ACTIVATE_TRIGGER_EFFECT, not fake GRANT_KEYWORD text', { issues: activateTriggerLeaks });
    }
  }

  if (/\[?on deletion\]?\s*(?:lose \d+ memory|trash the top card of your security stack)/i.test(text)) {
    const grantedOnDeletionLeaks = findGrantedOnDeletionTriggerKeywordLeak(card);
    if (grantedOnDeletionLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedOnDeletionTriggerKeywordLeak', 'Granted On Deletion text must be a temporary trigger, not a fake keyword string', { issues: grantedOnDeletionLeaks });
    }
  }

  if (/(?:gain|gains|grant|grants|gives?)[\s\S]{0,180}["“][^"”]*end of attack[^"”]*delete this digimon/i.test(text)) {
    const grantedEndOfAttackLeaks = findGrantedEndOfAttackTriggerKeywordLeak(card);
    if (grantedEndOfAttackLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedEndOfAttackTriggerKeywordLeak', 'Granted End of Attack deletion text must be a temporary trigger, not a fake keyword string', { issues: grantedEndOfAttackLeaks });
    }
  }

  if (/attach\s*\[end of attack\]\s*to all of this digimon's\s*\[on deletion\]\s*effects/i.test(text)) {
    const leaks = findAttachEndAttackOnDeletionTimingLeak(card);
    if (leaks.length > 0) addSemanticIssue(report, card, 'attachEndAttackOnDeletionTimingLeak', 'Attach [End of Attack] to On Deletion effects must be a real END_OF_ATTACK copy', { issues: leaks });
  }

  if (/(?:gain|gains|grant|grants|gives?)[\s\S]{0,220}["“][^"”]*end of your turn[^"”]*(?:delete this digimon|delete 1 of your digimon)/i.test(text)) {
    const grantedEndTurnLeaks = findGrantedEndOfTurnDeletionKeywordLeak(card);
    if (grantedEndTurnLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedEndOfTurnDeletionKeywordLeak', 'Granted End of Your Turn deletion text must be a temporary trigger, not a fake keyword string', { issues: grantedEndTurnLeaks });
    }
  }

  if (/when this digimon is blocked|deletes an opponent's digimon in battle and survives|checks your opponent's security stack/i.test(text)) {
    const grantedEventTextLeaks = findGrantedEventTextKeywordLeak(card);
    if (grantedEventTextLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedEventTextKeywordLeak', 'Granted event text must be a temporary trigger, not a fake keyword string', { issues: grantedEventTextLeaks });
    }
  }

  if (/(?:gain|gains|grant|grants|all level 3 digimon gain)[\s\S]{0,180}[\"“][^\"”]*\[?when attacking\]?[^\"”]*(?:lose \d+ memory|return 1 of your opponent's level 3 digimon|delete that digimon)/i.test(text) || /all level 3 digimon gain[^.]*\[?when attacking\]?[^.]*lose \d+ memory/i.test(text)) {
    const grantedWhenAttackingLeaks = findGrantedWhenAttackingTriggerKeywordLeak(card);
    if (grantedWhenAttackingLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedWhenAttackingTriggerKeywordLeak', 'Granted When Attacking text must be a temporary trigger, not a fake keyword or trait string', { issues: grantedWhenAttackingLeaks });
    }
  }

  if (/\b(?:give|gains?|gain)\b[\s\S]{0,220}[\"“][^\"”]*start of your main phase[^\"”]*(?:this digimon attacks|attack with this digimon)/i.test(text)) {
    const grantedStartMainAttackLeaks = findGrantedStartMainAttackKeywordLeak(card);
    if (grantedStartMainAttackLeaks.length > 0) {
      addSemanticIssue(report, card, 'grantedStartMainAttackKeywordLeak', 'Granted Start-of-Main attack text must be a temporary trigger, not a fake keyword string', { issues: grantedStartMainAttackLeaks });
    }
  }


  if (/\bmay attack(?: a player)?\b/i.test(text)) {
    const mayAttackLeaks = findMayAttackKeywordRequestLeak(card);
    if (mayAttackLeaks.length > 0) {
      addSemanticIssue(report, card, 'mayAttackKeywordRequestLeak', 'Printed may-attack clauses must be effect attack requests, not fake keyword strings', { issues: mayAttackLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+attack\s+or\s+block/i.test(text)) {
    const cantBlockLeaks = findCantAttackOrBlockWithoutCantBlock(card);
    if (cantBlockLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantAttackOrBlockCantBlockLeak', 'Printed can\'t attack or block clauses must add CANT_BLOCK, not only CANT_ATTACK.', { issues: cantBlockLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+attack\s+(?:players|until|for the turn)/i.test(text)) {
    const cantAttackRestrictionLeaks = findCantAttackRestrictionEncodingLeak(card);
    if (cantAttackRestrictionLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantAttackRestrictionEncodingLeak', 'Printed attack restrictions must use CANT_ATTACK_PLAYER or CANT_ATTACK, not unrelated actions or placeholders.', { issues: cantAttackRestrictionLeaks });
    }
  }


  if (/(?:can't|cannot|can\s*not)\s+be\s+blocked|\bunblockable\b/i.test(text)) {
    const cantBeBlockedLeaks = findCantBeBlockedKeywordLeak(card);
    if (cantBeBlockedLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantBeBlockedKeywordLeak', 'Printed cannot-be-blocked/unblockable clauses must use CANT_BE_BLOCKED, not keyword text or unrelated restrictions.', { issues: cantBeBlockedLeaks });
    }
  }


  if (/(?:can't|cannot|can\s*not)\s+gain\s+memory/i.test(text) && /(?:other than|except with|except by)\s+(?:by\s+)?Tamer\s+effects?/i.test(text)) {
    const cantGainMemoryLeaks = findCantGainMemoryEncodingLeak(card);
    if (cantGainMemoryLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantGainMemoryEncodingLeak', 'Printed memory-gain locks must be player-level CANT_GAIN_MEMORY restrictions with Tamer effects exempt.', { issues: cantGainMemoryLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+reduce\s+(?:play|digivolution|evolution)\s+costs?/i.test(text)) {
    const cantReduceCostLeaks = findCantReduceCostEncodingLeak(card);
    if (cantReduceCostLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantReduceCostEncodingLeak', 'Printed cost-reduction locks must be player-level CANT_REDUCE_COST restrictions, not REDUCE_COST amount 0.', { issues: cantReduceCostLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+play/i.test(text)) {
    const cantPlayLeaks = findCantPlayEncodingLeak(card);
    if (cantPlayLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantPlayEncodingLeak', "Printed can\'t-play clauses must be player-level CANT_PLAY/CANT_PLAY_BY_EFFECT locks, not STUN/SUSPEND/PREVENT_LEAVE_PLAY.", { issues: cantPlayLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+(?:play\s+or\s+)?move/i.test(text)) {
    const cantMoveLeaks = findCantMoveEncodingLeak(card);
    if (cantMoveLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantMoveEncodingLeak', "Printed can't-move clauses must be player-level CANT_MOVE locks, not CANT_PLAY alone.", { issues: cantMoveLeaks });
    }
  }

  if (/(?:can't|cannot|can\s*not)\s+(?:dna\s+)?digivolve/i.test(text)) {
    const cantDigivolveLeaks = findCantDigivolveEncodingLeak(card);
    if (cantDigivolveLeaks.length > 0) {
      addSemanticIssue(report, card, 'cantDigivolveEncodingLeak', "Printed can't-digivolve clauses must use CANT_DIGIVOLVE, not STUN/PREVENT_LEAVE_PLAY/keyword text.", { issues: cantDigivolveLeaks });
    }
  }

  if (/effects?\s+can(?:not|\s*not|'t)\s+reduce[^.。]*dp|can(?:not|\s*not|'t)\s+reduce[^.。]*dp[^.。]*effects?|can(?:not|\s*not|'t)\s+have[^.。]*dp\s+reduced|dp\s+reduced\s+or\s+be\s+returned/i.test(text)) {
    const dpReductionImmunityLeaks = findDpReductionImmunityEncodingLeak(card);
    if (dpReductionImmunityLeaks.length > 0) {
      addSemanticIssue(report, card, 'dpReductionImmunityEncodingLeak', "Printed opponent-effect DP-reduction immunity must use DP_REDUCTION_IMMUNITY, not placeholder buffs.", { issues: dpReductionImmunityLeaks });
    }
  }

  if (mechanicsStr.includes('"has_specific_card"') && hasTraitSelectorBlob) {
    const hasSpecificCardTraitConditionPolluted = findHasSpecificCardTraitConditionPollution(card);
    if (hasSpecificCardTraitConditionPolluted.length > 0) {
      addSemanticIssue(report, card, 'hasSpecificCardTraitConditionPollution', 'HAS_SPECIFIC_CARD condition still uses trait field; use name/nameContains/source/event/card-type conditions instead', { issues: hasSpecificCardTraitConditionPolluted });
    }
  }

  if (maybeDual) {
    const dualOptionMissing = findDualOptionSideMissing(card);
    if (dualOptionMissing.length > 0) {
      addSemanticIssue(report, card, 'dualOptionSideMissing', 'DUAL card has Option-side [Main] text but no gated dualOptionSide MAIN mechanic', { issues: dualOptionMissing });
    }

    const dualGenericPlayLeaks = findDualGenericPlayLeak(card);
    if (dualGenericPlayLeaks.length > 0) {
      addSemanticIssue(report, card, 'dualGenericPlayLeak', 'DUAL cards must not be enabled through generic play effects; they require use-as-Option/Arts Digivolve handling', { issues: dualGenericPlayLeaks });
    }

    const dualUngatedOptionSideLeaks = findDualUngatedOptionSideLeak(card);
    if (dualUngatedOptionSideLeaks.length > 0) {
      addSemanticIssue(report, card, 'dualUngatedOptionSideLeak', 'DUAL Option-side [Main] mechanics must be gated with dualOptionSide:true and must not act as inherited/source MAIN text', { issues: dualUngatedOptionSideLeaks });
    }

    const dualOptionInfoScopeLeaks = findDualOptionInfoScopeLeak(card);
    if (dualOptionInfoScopeLeaks.length > 0) {
      addSemanticIssue(report, card, 'dualOptionInfoScopeLeak', 'DUAL option-side metadata must not reuse Digimon-side trait/color information without explicit lower Option information', { issues: dualOptionInfoScopeLeaks });
    }
  }

  const memoryDrawOrderLeaks = findMemoryDrawOrderLeak(card);
  if (memoryDrawOrderLeaks.length > 0) {
    addSemanticIssue(report, card, 'memoryDrawOrderLeak', 'official 2026-04-17 listed cards must resolve <Draw 1> before gaining memory', { issues: memoryDrawOrderLeaks });
  }

  const returnToEggDeckCostLeaks = findReturnToEggDeckCostLeak(card);
  if (returnToEggDeckCostLeaks.length > 0) {
    addSemanticIssue(report, card, 'returnToEggDeckCostLeak', 'costs that return cards to the Digi-Egg deck must target the correct zone/destination and selector', { issues: returnToEggDeckCostLeaks });
  }

  const breedingScopeLeaks = findBreedingScopeLeak(card);
  if (breedingScopeLeaks.length > 0) {
    addSemanticIssue(report, card, 'breedingScopeLeak', '[Breeding] effects must be gated to breeding area scope and source [Breeding] effects must require a breeding host', { issues: breedingScopeLeaks });
  }

  const playTokenAmountLeaks = findPlayTokenAmountRuntimeLeak(card);
  if (playTokenAmountLeaks.length > 0) {
    addSemanticIssue(report, card, 'playTokenAmountRuntimeLeak', 'PLAY_TOKEN actions with amount/amountSource must create the correct number of tokens at runtime', { issues: playTokenAmountLeaks });
  }

  const tokenAsNormalPlayLeaks = findTokenAsNormalPlayLeak(card);
  if (tokenAsNormalPlayLeaks.length > 0) {
    addSemanticIssue(report, card, 'tokenAsNormalPlayLeak', 'token creation must use PLAY_TOKEN instead of generic PLAY_FROM_* zone actions', { issues: tokenAsNormalPlayLeaks });
  }

  mechanics.forEach((mech, mechIndex) => {
    walkCosts(mech.cost, (cost, pathLabel) => {
      if (cost.type && SUSPICIOUS_COST_TYPES.has(cost.type)) {
        addSemanticIssue(report, card, 'badCostType', 'suspicious cost type needs schema normalization', {
          mechanicIndex: mechIndex,
          path: `mechanic[${mechIndex}].${pathLabel}`,
          costType: cost.type
        });
      }
      if (cost.type === 'TRASH_BOTTOM_EVO') {
        const textSaysDeckBottom = /bottom of (your|the|its owner's) deck/.test(text);
        const textSaysDigiBurstOrSourceTrash = /digi-burst|trash .*digivolution card|trash .*source/.test(text);
        if (textSaysDeckBottom && !textSaysDigiBurstOrSourceTrash) {
          addSemanticIssue(report, card, 'badCostType', 'TRASH_BOTTOM_EVO cost may be confusing deck bottom with digivolution-source trash', {
            mechanicIndex: mechIndex,
            path: `mechanic[${mechIndex}].${pathLabel}`
          });
        }
      }
    }, 'cost');

    const actionList = mech.actions || [];
    const hasDeDigiAction = actionList.some(a => a && typeof a === 'object' && a.type === 'DE_DIGIVOLVE');

    actionList.forEach((act, actionIndex) => {
      if (!act || typeof act !== 'object') return;
      const actionPath = `mechanic[${mechIndex}].actions[${actionIndex}]`;

      if (isRevealSelectedConsumerLeak(mech, actionList, actionIndex, `${card.mainEffect || ''} ${card.sourceEffect || ''}`)) {
        addSemanticIssue(report, card, 'revealSelectedConsumerLeak', 'post-reveal selected consumer may still read from hand/trash/normal zones instead of revealed buffer', {
          mechanicIndex: mechIndex,
          actionIndex,
          actionType: act.type,
          action: act
        });
      }

      walkCosts(act.cost, (cost, pathLabel) => {
        if (cost.type && SUSPICIOUS_COST_TYPES.has(cost.type)) {
          addSemanticIssue(report, card, 'badCostType', 'suspicious nested action cost type needs schema normalization', {
            mechanicIndex: mechIndex,
            actionIndex,
            path: `${actionPath}.${pathLabel}`,
            costType: cost.type
          });
        }
      }, 'cost');

      if (/de-?digivolve|de-digivolve|de digivolve/.test(text)) {
        const target = act.target || {};
        const owner = String(target.owner || '').toLowerCase();
        const cardType = String(target.cardType || 'digimon').toLowerCase();
        const type = String(act.type || '').toUpperCase();
        const destructive = type === 'DELETE_DIGIMON' || type === 'TRASH_BOTTOM_EVO' || type === 'TRASH_SECURITY_STACK';
        const targetsDigimon = cardType === 'digimon' || cardType === 'any' || cardType.includes('digimon');
        const ownerLooksRelevant = owner === 'opponent' || owner === 'any';
        // Round 14L: mixed cards often contain a real De-Digivolve clause and a separate normal
        // delete clause. Do not flag unrelated deletes just because the full card text mentions
        // De-Digivolve. Only flag shapes that are mechanically impossible for a normal delete but
        // common in old De-Digivolve encodings.
        const looksLikeLegacyDeDigiEncoding = destructive && ownerLooksRelevant && targetsDigimon && (
          Number(target.maxLevel) === 3 ||
          (type === 'TRASH_SECURITY_STACK' && target.maxLevel !== undefined) ||
          (type === 'TRASH_BOTTOM_EVO' && (Number(target.maxLevel) === 3 || (String(mech.trigger || '').toUpperCase() === 'SECURITY' && /\[security\].*de-?digivolve/i.test(`${card.mainEffect || ''} ${card.sourceEffect || ''}`))))
        );
        if (!hasDeDigiAction && looksLikeLegacyDeDigiEncoding && act.type !== 'DE_DIGIVOLVE') {
          addSemanticIssue(report, card, 'dedigiAsDelete', 'De-Digivolve text appears encoded as deletion/source-trash instead of DE_DIGIVOLVE', {
            mechanicIndex: mechIndex,
            actionIndex,
            actionType: act.type,
            target: act.target || null
          });
        }
      }

      const tinyDpMod = act.type === 'DP_MOD' && Number.isFinite(Number(act.amount)) && Math.abs(Number(act.amount)) <= 10;
      const fullCardTextForKeywordDp = `${card.mainEffect || ''} ${card.sourceEffect || ''} ${card.effectText || ''}`;
      const textMentionsSecurityAttackKeyword = /security\s*a\.?\s*[+-]\s*\d|security attack\s*[+-]\s*\d|checks?\s+\d+\s+(fewer|additional)/i.test(fullCardTextForKeywordDp);
      if (tinyDpMod && textMentionsSecurityAttackKeyword) {
        addSemanticIssue(report, card, 'keywordAsDpMod', 'Security Attack keyword/count appears encoded as DP_MOD', {
          mechanicIndex: mechIndex,
          actionIndex,
          amount: act.amount,
          action: act
        });
      }
      // Round 22AF: zero-DP actions were repeatedly used as fake placeholders
      // for printed keyword/reminder text (<Piercing>, <Iceclad>, granted Blitz,
      // etc.). A real DP modifier of 0 should not open target windows or create
      // runtime debuff/status logs unless a card literally says +0/-0 DP.
      const dpModStat = String(act.stat || act.buff?.stat || 'dp').toLowerCase();
      const amountIsZeroDp = act.type === 'DP_MOD' && (dpModStat === 'dp' || dpModStat === 'dp_mod') && (
        (Object.prototype.hasOwnProperty.call(act, 'amount') && Number(act.amount) === 0) ||
        (act.buff && Object.prototype.hasOwnProperty.call(act.buff, 'value') && Number(act.buff.value) === 0)
      );
      const printedLiteralZeroDp = /[+-]?0\s*DP/i.test(fullCardTextForKeywordDp);
      if (amountIsZeroDp && !printedLiteralZeroDp) {
        addSemanticIssue(report, card, 'keywordAsDpMod', 'DP_MOD amount/value 0 appears to be a fake placeholder; encode the real keyword/rule action or remove reminder text mechanics', {
          mechanicIndex: mechIndex,
          actionIndex,
          amount: act.amount,
          buffValue: act.buff?.value,
          action: act
        });
      }

      if (STATIC_LIKE_TRIGGERS.has(mech.trigger) && STATIC_LIKE_ACTIONS.has(act.type)) {
        const fullText = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
        const coveredByRuntimeLayer = isRuntimeContinuousStaticText(fullText);
        const replacementPrevention = isReplacementPreventionMechanic(mech, act, fullText);
        const effectLockOrImmunity = isEffectLockOrImmunityRuntimeMechanic(mech, act, fullText);
        const attackKeywordRuntime = isAttackKeywordRuntimeMechanic(card, mech, act, fullText);
        const printedKeywordRuntime = isPrintedKeywordRuntimeMechanic(card, mech, act, fullText);
        if (!coveredByRuntimeLayer && !replacementPrevention && !effectLockOrImmunity && !attackKeywordRuntime && !printedKeywordRuntime) {
          const maybeRuntimeOnly = !act.duration || ['THIS_TURN', 'END_OF_TURN'].includes(String(act.duration || act?.buff?.duration || '').toUpperCase());
          addSemanticIssue(report, card, 'staticLikeAction', 'timing trigger/action may be a triggered effect or unsupported static scope', {
            mechanicIndex: mechIndex,
            actionIndex,
            trigger: mech.trigger,
            actionType: act.type,
            duration: act.duration || act?.buff?.duration || null,
            maybeRuntimeOnly
          });
        }
      }
    });
  });



  if (isPrintedKeywordOnlyTextForAudit(card) && hasOnlyGrantKeywordMechanics(card)) {
    addSemanticIssue(report, card, 'printedKeywordOnlyMechanic', 'pure printed keyword text should be handled by runtime keyword/replacement layers, not fake GRANT_KEYWORD mechanics', {
      mechanicCount: Array.isArray(card.mechanics) ? card.mechanics.length : 0,
      triggers: (card.mechanics || []).map(m => m.trigger)
    });
  }

  if (hasFakePrintedRebootUnsuspendMechanic(card)) {
    addSemanticIssue(report, card, 'printedKeywordRebootMechanicLeak', 'Printed <Reboot> should be handled by the unsuspend-phase keyword runtime, not by an END_OF_TURN HAS_TRAIT(Reboot) -> UNSUSPEND mechanic.', {
      triggers: (card.mechanics || []).map(m => m.trigger)
    });
  }

  // Some parsers encode immunity/effect lock as generic stun/protection. Flag these for official scope checks.
  // Round 22U: do not flag legitimate costed replacement windows on the same card
  // just because another clause says On Play effects do not activate.
  if (/unaffected|can't be affected|cannot be affected|can't activate \[on play\]|can't activate effects|don't activate/.test(text)) {
    const broadBadAction = (card.mechanics || []).some(m => (m.actions || []).some(a => {
      const type = String(a?.type || '').toUpperCase();
      if (type === 'STUN') return true;
      if (type !== 'PREVENT_LEAVE_PLAY') return false;
      return !isReplacementPreventionMechanic(m, a, `${card.mainEffect || ''} ${card.sourceEffect || ''}`);
    }));
    if (broadBadAction) {
      addSemanticIssue(report, card, 'effectLockOrImmunityScope', 'effect lock/immunity may still be encoded with too-broad generic actions', {});
    }
  }
}


function isAttackKeywordRuntimeMechanic(card, mech, act, fullText = '') {
  const trigger = String(mech?.trigger || '').toUpperCase();
  const type = String(act?.type || '').toUpperCase();
  const text = String(fullText || '').toLowerCase();
  if (type === 'GRANT_KEYWORD') {
    const keyword = String(act?.buff?.keyword || act?.keyword || '').toLowerCase();
    const duration = String(act?.duration || act?.buff?.duration || '').toUpperCase();
    if (['blocker','jamming','piercing','raid','collision','alliance','vortex','reboot','retaliation'].includes(keyword) && !duration) {
      if (text.includes(`＜${keyword}＞`) || text.includes(`<${keyword}>`)) return true;
    }
  }
  if (trigger === 'WHEN_ATTACKING' && type === 'MOVE' && /＜?\s*raid\s*＞?|raid/i.test(fullText)) return true;
  return false;
}


function isPrintedKeywordRuntimeMechanic(card, mech, act, fullText = '') {
  if (!card || !mech || !act || String(act.type || '').toUpperCase() !== 'GRANT_KEYWORD') return false;
  const keyword = String(act?.buff?.keyword || act?.keyword || '').trim();
  if (!keyword) return false;
  const keywordLower = keyword.toLowerCase();
  const runtimePrintedKeywords = new Set([
    'blocker','jamming','piercing','reboot','raid','collision','alliance','rush','retaliation','vortex',
    'armor purge','barrier','decoy','scapegoat','fortitude','decode','partition','overclock'
  ]);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = String(fullText || '');
  const source = String(card.sourceEffect || '');
  const printed = new RegExp(`＜\\s*${escaped}\\b|<\\s*${escaped}\\b`, 'i').test(text);
  if (!printed) return false;
  const sourcePureKeyword = !!mech.isInherited && new RegExp(`^\\s*＜\\s*${escaped}[^＞]*＞\\s*\\([^)]*\\)\\s*$`, 'is').test(source);
  const duration = String(act?.duration || act?.buff?.duration || '').toUpperCase();
  // Round 14O: a printed keyword harness may still have a generic self target.
  // If there is no temporary duration and the keyword is printed on the card, the runtime
  // keyword/replacement layers already read it; it should not remain an audit risk.
  return sourcePureKeyword || (!duration && runtimePrintedKeywords.has(keywordLower));
}



// Round 15A: printed keyword-only cards are handled by runtime getKeywords()
// and replacement layers. They should not keep fake GRANT_KEYWORD mechanics such
// as ON_PLAY Blocker or WHEN_BLOCKING Blocker.
function stripPrintedKeywordBlocksForAudit(text = '') {
  return String(text || '')
    .replace(/(?:Inherited Effect\s*)?[＜<][^＞>]+[＞>](?:\s*\([^)]*\))?\.?/gis, '')
    .replace(/\b(?:Inherited Effect|Security Effect)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim();
}

function isPrintedKeywordOnlyTextForAudit(card) {
  const text = `${card?.mainEffect || ''} ${card?.sourceEffect || ''}`;
  return stripPrintedKeywordBlocksForAudit(text) === '';
}

function hasOnlyGrantKeywordMechanics(card) {
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  if (!mechanics.length) return false;
  return mechanics.every(mech => {
    const actions = Array.isArray(mech?.actions) ? mech.actions : [];
    return actions.length > 0 && actions.every(action => String(action?.type || '').toUpperCase() === 'GRANT_KEYWORD');
  });
}


function hasFakePrintedRebootUnsuspendMechanic(card) {
  const text = `${card?.mainEffect || ''} ${card?.sourceEffect || ''}`;
  if (!/[＜<]\s*Reboot\b/i.test(text)) return false;
  return (card.mechanics || []).some(mech => {
    const trigger = String(mech?.trigger || '').toUpperCase();
    const condition = mech?.condition || {};
    const isRebootCondition = String(condition?.type || '').toUpperCase() === 'HAS_TRAIT' && String(condition?.trait || '').toLowerCase() === 'reboot';
    const hasUnsuspendAction = (mech.actions || []).some(a => String(a?.type || '').toUpperCase() === 'UNSUSPEND');
    return trigger === 'END_OF_TURN' && isRebootCondition && hasUnsuspendAction;
  });
}

function summarizeSemanticIssues(report) {
  const summary = {};
  for (const [bucket, list] of Object.entries(report.semanticIssues || {})) {
    const uniqueCards = new Set((list || []).map(x => x.id));
    summary[bucket] = {
      issues: (list || []).length,
      cards: uniqueCards.size
    };
  }
  report.semanticSummary = summary;
}



// Round 10E: Counter/ACE/Blast basics support COUNTER + BLAST_DIGIVOLVE; Overflow stays a card property/rule layer.
// Round 10C: cost preprocess v2 supports return-to-deck costs, digisorption, and evolving-card self reductions.
function classifyManualRequired(reason, cardText, mechanicsStr = "") {
    const blob = (String(reason || "") + " " + String(cardText || "")).toLowerCase();
    const has = (...xs) => xs.some(x => blob.includes(String(x).toLowerCase()));

    // Round 10A: break OTHER_MANUAL_REQUIRED into actionable engineering buckets.
    if (has("ace overflow", "blast digivolve", "[counter]", "counter/blast", "counter window")) return "COUNTER_ACE_BLAST";
    if (has("overflow")) return "OVERFLOW_RULE_LAYER";
    if (has("barrier", "decoy", "scapegoat", "fortitude", "armor purge", "would be deleted", "would-be-deleted", "prevent its deletion", "prevent this deletion", "prevent that deletion", "isn't deleted")) return "REPLACEMENT_PROTECTION";
    if (has("decode", "would leave", "would-leave", "leave the battle area", "leaves the battle area", "return to the hand or play")) return "REPLACEMENT_LEAVE_PLAY_DECODE";
    if (has("unaffected", "can't be affected", "can't return this digimon", "effect immunity", "immune", "effects can't return")) return "IMMUNITY_UNAFFECTED";

    if (has("hybrid", "digivolve from your tamer", "from one of your tamers", "from your tamer", "tamer may digivolve")) return "HYBRID_TAMER_EVOLVE";
    if (has("would digivolve", "would be played", "cost reduction", "reduced by", "reduce the cost", "reduce its", "invalid/ambiguous cost", "use three musketeers/ts option with cost reduction")) return "COST_REDUCTION_PREPROCESS";
    if (has("option-use", "use 1 option", "use an option", "use 1 [", "activate this card's [main]", "activate 1 of", "activate 1 of this", "use three musketeers")) return "USE_OPTION_OR_ACTIVATE_EFFECT";

    if (has("attack target", "redirect", "change the attack target", "switch the target", "attacks a player", "when this digimon is blocked", "blocker timing", "must block", "collision")) return "ATTACK_REDIRECT_BLOCKER";
    if (has("retaliation", "deleted after losing a battle", "delete_opponent_in_battle_trigger", "if_no_digimon_deleted_fallback", "deletes an opponent's digimon in battle", "delete an opponent's digimon in battle")) return "BATTLE_DELETION_RETALIATION";
    if (has("alliance", "vortex", "may attack", "attack-time choice", "end of your turn]", "then, 1 of your digimon may attack")) return "ATTACK_CHOICE_VORTEX_ALLIANCE";
    if (has("security attack", "checks security", "security check", "jamming", "piercing")) return "SECURITY_ATTACK_KEYWORD";

    if (has("total play cost", "total worth", "play cost's total", "play cost’s total")) return "TOTAL_PLAY_COST_SELECTION";
    if (has("reveal") && has("multi-step", "play", "place", "trash", "return", "total-cost", "total play cost")) return "REVEAL_PLAY_PLACE_COMPLEX";
    if (has("reveal") && has("multi-slot", "multiple selection", "selection slot", "add 1", "and 1")) return "REVEAL_MULTI_SLOT";
    if (has("reveal")) return "REVEAL_SEARCH_COMPLEX";

    if (has("link", "linked", "gets linked", "linked-state", "overclock")) return "LINK_OVERCLOCK";
    if (has("token")) return "TOKEN_SYSTEM";
    if (has("source", "digivolution cards", "under your opponent", "under 1 of", "from this digimon's digivolution", "trash any 1 card under", "trash all digivolution", "play_from_source", "return_source", "place source")) return "SOURCE_COMPLEX";

    if (has("trash hand", "trash_hand", "trash 1 card in your hand", "trashing 1 card in your hand", "then trash 1 card", "trashed from", "discard", "opponent_discard", "opponent's hand", "without looking")) return "HAND_TRASH_DISCARD";
    if (has("deck top", "self-mill", "trash the top", "trashing the top", "from your deck")) return "DECK_TRASH_SELF_MILL";
    if (has("security", "face-up security", "top security", "bottom security", "security stack is removed", "recovery", "add your top security")) return "SECURITY_STACK_MANIPULATION";
    if (has("suspend", "unsuspend", "can't unsuspend", "becomes suspended", "becomes unsuspended")) return "SUSPEND_UNSUSPEND_TRIGGER";

    if (has("effects below", "choose one", "choose 1", "modal", "choice-based", "delete this digimon to choose")) return "MODAL_CHOICE_EFFECT";
    if (has("dna digivolve", "jogress")) return "DNA_CHAIN_COMPLEX";
    if (has("lowest dp", "highest dp", "level maximum", "same level", "as much dp", "for each", " dp")) return "DYNAMIC_DP_LEVEL_CALC";
    if (has("play 1", "play up to", "without paying", "revive", "from your trash", "from hand or trash")) return "PLAY_REVIVE_COMPLEX";
    if (has("return all cards from trash", "owners deck bottom", "trash to the bottom")) return "TRASH_RECYCLE_COMPLEX";

    if (has("round 5", "round 6", "placeholder", "not safely parseable", "dedicated engine support", "official timing", "manual resolution", "complex effect kept manual")) return "LEGACY_PLACEHOLDER_NEEDS_REVIEW";
    return "OTHER_MANUAL_REQUIRED";
}

function validateCondition(condition, bugs, pathLabel) {
    if (!condition) return;
    if (!condition.type) return;
    if (!VALID_CONDITIONS.has(condition.type)) {
        bugs.push(`❌ 非法 condition type at ${pathLabel}: ${condition.type}`);
        return;
    }
    if ((condition.type === "OR" || condition.type === "AND") && Array.isArray(condition.conditions)) {
        condition.conditions.forEach((child, idx) => validateCondition(child, bugs, `${pathLabel}.conditions[${idx}]`));
    }
}


function findReturnToEggDeckCostLeak(card) {
  const issues = [];
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
  if (!/digi[- ]egg deck/i.test(text) || !/return(?:ing)?\s+\d+|return\s+\d+/i.test(text)) return issues;
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  mechanics.forEach((mech, mechIndex) => {
    walkCosts(mech.cost, (cost, pathLabel) => {
      if (!cost || cost.type !== 'RETURN_TO_DECK') return;
      const destText = [cost.destination, cost.toZone, cost.deck, cost.to, cost.position].map(x => String(x || '').toLowerCase()).join(' ');
      const fromText = [cost.from, cost.zone, cost.sourceZone, cost.target && cost.target.zone].map(x => String(x || '').toLowerCase()).join(' ');
      const targetText = JSON.stringify(cost.target || {}).toLowerCase();
      if (!/eggdeck|digi[-_ ]?egg|egg deck/.test(destText)) {
        issues.push({ mechanicIndex: mechIndex, path: pathLabel, reason: 'RETURN_TO_DECK cost text says Digi-Egg deck but cost destination is not eggDeck', cost });
      }
      if (/trash|digivolution|source/.test(text.toLowerCase()) && !(/trash/.test(fromText) && /source|digivolution|under/.test(fromText))) {
        issues.push({ mechanicIndex: mechIndex, path: pathLabel, reason: 'RETURN_TO_DECK cost should be payable from trash or digivolution cards', cost });
      }
      if (/negamon/i.test(text) && !/negamon/i.test(targetText)) {
        issues.push({ mechanicIndex: mechIndex, path: pathLabel, reason: 'RETURN_TO_DECK cost should target cards with [Negamon] in text', cost });
      }
    });
  });
  return issues;
}


// Round 15S: [Breeding] effects must not leak after the card/host leaves breeding.
// These known structured mechanics represent explicit [Breeding] clauses and
// therefore require breedingOnly:true. Source [Breeding] effects also require
// inherited scope so they bind to a breeding host instead of the source card in battle.
const ROUND15S_BREEDING_EXPECTATIONS = {
  'EX9-057': [{ trigger: 'BREEDING', inherited: false }],
  'BT22-080': [{ trigger: 'BREEDING', inherited: true }],
  'BT22-079': [{ trigger: 'BREEDING', inherited: true }],
  'BT23-073': [{ trigger: 'BREEDING', inherited: true }],
  'EX6-006': [{ trigger: 'START_OF_MAIN_PHASE', inherited: false }, { trigger: 'END_OF_TURN', inherited: false }],
  'BT13-007': [{ trigger: 'BREEDING', inherited: false }, { trigger: 'START_OF_MAIN_PHASE', inherited: false }],
  'BT23-072': [{ trigger: 'START_OF_MAIN_PHASE', inherited: true }],
  'EX10-013': [{ trigger: 'WHEN_DIGIVOLVING', inherited: false }],
  'BT18-086': [{ trigger: 'WOULD_LEAVE_BATTLE_AREA', inherited: false }],
  'BT22-007': [{ trigger: 'START_OF_MAIN_PHASE', inherited: false }, { trigger: 'ALL_TURNS', inherited: false }],
  'EX9-005': [{ trigger: 'BREEDING', inherited: false }, { trigger: 'ALL_TURNS', inherited: false }],
  'BT20-083': [{ trigger: 'BREEDING', inherited: true }]
};

function findBreedingScopeLeak(card) {
  const issues = [];
  const expected = ROUND15S_BREEDING_EXPECTATIONS[card?.id];
  if (!expected) return issues;
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  mechanics.forEach((mech, mechIndex) => {
    if (card.id === 'EX9-057' && String(mech?.trigger || '').toUpperCase() === 'OPPONENT_ATTACKED') {
      issues.push({ mechanicIndex: mechIndex, trigger: mech.trigger, reason: 'duplicate battle-area OPPONENT_ATTACKED leak from [Breeding] attack-listener text' });
    }
  });
  expected.forEach(req => {
    const matches = mechanics
      .map((mech, index) => ({ mech, index }))
      .filter(x => String(x.mech?.trigger || '').toUpperCase() === req.trigger && (req.inherited === undefined || (x.mech?.isInherited === true) === req.inherited));
    if (!matches.length) {
      issues.push({ trigger: req.trigger, inherited: req.inherited, reason: 'expected [Breeding] structured mechanic not found with correct inherited scope' });
      return;
    }
    matches.forEach(({ mech, index }) => {
      if (mech.breedingOnly !== true) {
        issues.push({ mechanicIndex: index, trigger: mech.trigger, inherited: mech.isInherited === true, reason: 'explicit [Breeding] mechanic is missing breedingOnly:true' });
      }
    });
  });
  return issues;
}

// Round 15U: PLAY_TOKEN effects must honor amount/amountSource.
// Several official token effects create more than one token or scale from the
// board state. If runtime always creates one token, those cards resolve wrong
// even while schema audit remains green.
function findPlayTokenAmountRuntimeLeak(card) {
  const issues = [];
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  mechanics.forEach((mech, mechIndex) => {
    (Array.isArray(mech.actions) ? mech.actions : []).forEach((action, actionIndex) => {
      if (!action || action.type !== 'PLAY_TOKEN') return;
      const hasVariableOrMultiAmount =
        action.amountSource !== undefined ||
        action.amount !== undefined ||
        action.count !== undefined ||
        (action.token && typeof action.token === 'object' && action.token.amount !== undefined);
      if (!hasVariableOrMultiAmount) return;
      try {
        const gameStateText = getGameStateTextForAudit();
        const runtimeHandlesAmount =
          gameStateText.includes("case 'PLAY_TOKEN'") &&
          gameStateText.includes('tokenAmount') &&
          gameStateText.includes('getDynamicActionAmount') &&
          /for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*tokenAmount/.test(gameStateText);
        if (!runtimeHandlesAmount) {
          issues.push({ mechanicIndex: mechIndex, actionIndex, amount: action.amount, amountSource: action.amountSource, tokenAmount: action.token?.amount });
        }
      } catch (e) {
        issues.push({ mechanicIndex: mechIndex, actionIndex, error: e.message });
      }
    });
  });
  return issues;
}




// Round 15V: Token creation must use PLAY_TOKEN, not generic zone play.
// Official token preparation means tokens are prepared outside the deck/hand/trash
// and enter by the creating effect; they are not searched from normal zones.
function findTokenAsNormalPlayLeak(card) {
  const issues = [];
  const mechanics = Array.isArray(card?.mechanics) ? card.mechanics : [];
  mechanics.forEach((mech, mechanicIndex) => {
    (Array.isArray(mech?.actions) ? mech.actions : []).forEach((action, actionIndex) => {
      if (!action || typeof action !== 'object') return;
      const type = String(action.type || '').toUpperCase();
      if (!['PLAY_FROM_HAND', 'PLAY_FROM_TRASH', 'PLAY_FROM_HAND_OR_TRASH', 'PLAY_FROM_SECURITY', 'PLAY_FROM_SOURCE'].includes(type)) return;
      const serialized = JSON.stringify(action);
      if (!/Token/i.test(serialized)) return;
      issues.push({
        mechanicIndex,
        actionIndex,
        actionType: action.type,
        reason: 'token creation is encoded as generic zone play instead of PLAY_TOKEN'
      });
    });
  });
  return issues;
}



// Round 22BD: a pre-[Main] "While you have..., you can ignore this card's color requirements" clause
// is an Option-use legality bypass only. It must not be encoded as the [Main]
// effect's condition, otherwise the Option text fizzles even when the player
// satisfies the normal color requirement.
function getOptionIgnoreColorClauseForAudit(card) {
  const text = [card?.mainEffect || '', card?.effectText || '']
    .join(' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = text.match(/While\s+[^.。!?]{0,260}(?:can|may)\s+ignore\s+this\s+card['’]?s\s+color\s+requirements?\.?/i);
  return m ? m[0] : '';
}

function conditionLooksLikeOptionIgnoreClauseForAudit(condition, clause) {
  if (!condition || !clause) return false;
  const lower = String(clause || '').toLowerCase();
  const type = String(condition.type || '').toUpperCase();
  if (['OR', 'AND'].includes(type)) {
    const children = Array.isArray(condition.conditions) ? condition.conditions : [];
    return children.length > 0 && children.every(child => conditionLooksLikeOptionIgnoreClauseForAudit(child, clause));
  }
  if (type === 'HAS_TRAIT') return !!condition.trait && lower.includes(String(condition.trait).toLowerCase());
  if (type === 'HAS_DIGIMON') return /digimon/.test(lower);
  if (type === 'HAS_TAMER') {
    if (!/tamer/.test(lower)) return false;
    if (condition.trait) return lower.includes(String(condition.trait).toLowerCase());
    if (condition.name || condition.nameContains) return lower.includes(String(condition.name || condition.nameContains).toLowerCase());
    return true;
  }
  if (type === 'HAS_SPECIFIC_CARD') {
    if (condition.color) return lower.includes(String(condition.color).toLowerCase());
    if (condition.name || condition.nameContains) {
      const op = String(condition.operator || '').trim();
      const negativeClause = /don['’]?t|do\s+not|don't|no\s+/.test(lower);
      if (negativeClause && !/[!<]/.test(op)) return false;
      if (!negativeClause && /[!<]/.test(op)) return false;
      return lower.includes(String(condition.name || condition.nameContains).toLowerCase());
    }
    if (condition.textContains) return lower.includes(String(condition.textContains).toLowerCase()) && /text/.test(lower);
    if (condition.trait) return lower.includes(String(condition.trait).toLowerCase());
    return false;
  }
  if (type === 'NO_FACE_UP_SECURITY') return /no\s+face-up/.test(lower) && /security/.test(lower);
  if (type === 'SECURITY_COUNT') return /no\s+face-up/.test(lower) && /security/.test(lower) && Number(condition.value) <= 1;
  return false;
}


function auditSelfSourceColorStaticConditionRuntimeLeak(cards, report) {
    // Round 22BP: self-source static clauses such as Aldamon/Beowolfmon say
    // “digivolution cards include a [Hybrid] Digimon or a red/blue Tamer card”.
    // The color word must be parsed as a source filter; `\b` must be escaped in
    // the RegExp constructor or JS treats it as a backspace and any-color Tamers pass.
    try {
        const gs = getGameStateTextForAudit();
        const hasRoundGuard = /Round 22BP: source-condition color words are real filters/.test(gs);
        const escapedWordBoundary = /new RegExp\(`\\\\b\$\{c\}\\\\b`, 'i'\)\.test\(alt\)/.test(gs);
        const staleBackspaceRegex = /new RegExp\(`\\b\$\{c\}\\b`, 'i'\)\.test\(alt\)/.test(gs) && !escapedWordBoundary;
        if (!hasRoundGuard || !escapedWordBoundary || staleBackspaceRegex) {
            report.semanticIssues.selfSourceColorStaticConditionLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BP self-source color static condition guard',
                reason: 'Self-source static clauses must treat red/blue/etc. as real source filters; unescaped `\\b` in template literals accepts any-color Tamers.',
                hasRoundGuard,
                escapedWordBoundary,
                staleBackspaceRegex
            });
        }
    } catch (e) {
        report.semanticIssues.selfSourceColorStaticConditionLeak.push({ id:'RUNTIME', name:'Round 22BP guard', reason:'self-source color static runtime guard failed: '+e.message });
    }

    const keyCards = new Set(['BT4-016', 'BT4-030']);
    for (const card of cards) {
        if (!keyCards.has(card.id)) continue;
        const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
        if (!/digivolution cards include[^.]+(?:red|blue)\s+Tamer card/i.test(text)) {
            report.semanticIssues.selfSourceColorStaticConditionLeak.push({
                id: card.id,
                name: card.name,
                reason: 'Expected Aldamon/Beowolfmon-style self-source red/blue Tamer static clause to remain present for runtime guard coverage.'
            });
        }
    }
}


function auditPlacedCardLevelCostBindingLeak(cards, report) {
    // Round 22BQ: same-level-as-placed-card payoffs must bind to the card
    // actually placed as the current cost. They must not be approximated as
    // TRASH_BOTTOM_EVO + maxLevel, broad PLACE_SOURCE actions, or count:1.
    const cardById = new Map(cards.map(card => [card.id, card]));
    const bt18 = cardById.get('BT18-042');
    if (bt18) {
        const mechs = Array.isArray(bt18.mechanics) ? bt18.mechanics : [];
        const relevant = mechs.filter(m => ['WHEN_DIGIVOLVING', 'END_OF_OPPONENTS_TURN'].includes(String(m.trigger || '').toUpperCase()));
        if (relevant.length < 2) {
            report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, reason: 'BT18-042 should encode both [When Digivolving] and [End of Opponent\'s Turn] timings.' });
        }
        for (const mech of relevant) {
            const trigger = String(mech.trigger || '');
            const actions = Array.isArray(mech.actions) ? mech.actions : [];
            if (String(mech.cost?.type || '').toUpperCase() !== 'PLACE_SOURCE_TO_SECURITY') {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, trigger, reason: 'BT18-042 must place a source as bottom security as a cost, not trash a source or use a normal action.' });
            }
            if (String(mech.cost?.position || mech.cost?.to || '').toLowerCase().includes('bottom') === false) {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, trigger, reason: 'BT18-042 cost must place the source as bottom security.' });
            }
            if (!mech.cost?.sourceHostSelf) {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, trigger, reason: 'BT18-042 cost must take the source from this Digimon.' });
            }
            if (actions.some(a => String(a?.type || '').toUpperCase() === 'TRASH_BOTTOM_EVO')) {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, trigger, reason: 'BT18-042 must not encode the source-to-security cost as TRASH_BOTTOM_EVO.' });
            }
            const del = actions.find(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON');
            if (!del || del.target?.count !== 'all' || String(del.target?.selection || '').toLowerCase() !== 'same_level_as_placed_cost') {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: bt18.id, name: bt18.name, trigger, reason: 'BT18-042 payoff must delete all opponent Digimon with same_level_as_placed_cost.' });
            }
        }
    }

    const ex6 = cardById.get('EX6-066');
    if (ex6) {
        const main = (Array.isArray(ex6.mechanics) ? ex6.mechanics : []).find(m => String(m.trigger || '').toUpperCase() === 'MAIN');
        if (!main) {
            report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: ex6.id, name: ex6.name, reason: 'EX6-066 missing Main mechanic.' });
        } else {
            if (String(main.cost?.type || '').toUpperCase() !== 'PLACE_SOURCE') {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: ex6.id, name: ex6.name, reason: 'EX6-066 hand-source placement must be an atomic PLACE_SOURCE cost.' });
            }
            const costBlob = JSON.stringify(main.cost || {});
            if (!/Aqua/.test(costBlob) || !/Sea Animal/.test(costBlob) || !/attachToTarget/.test(costBlob) || !/Blue/.test(costBlob)) {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: ex6.id, name: ex6.name, reason: 'EX6-066 cost must place an Aqua/Sea Animal Digimon card from hand under 1 blue Digimon.' });
            }
            const bounce = (main.actions || []).find(a => String(a?.type || '').toUpperCase() === 'BOUNCE');
            if (!bounce || bounce.target?.count !== 'all' || String(bounce.target?.selection || '').toLowerCase() !== 'same_level_as_placed_cost') {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: ex6.id, name: ex6.name, reason: 'EX6-066 payoff must bounce all opponent Digimon with same_level_as_placed_cost.' });
            }
            if ((main.actions || []).some(a => String(a?.type || '').toUpperCase() === 'PLACE_SOURCE')) {
                report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: ex6.id, name: ex6.name, reason: 'EX6-066 must not keep PLACE_SOURCE as a normal first action before the bounce payoff.' });
            }
        }
    }

    try {
        const gs = getGameStateTextForAudit();
        if (!/Round 22BQ/.test(gs) || !/payPlaceSourceToSecurityCost/.test(gs) || !/applyAllSameLevelAsPlacedCostAction/.test(gs)) {
            report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: 'RUNTIME', name: 'Round 22BQ guard', reason: 'Runtime must support PLACE_SOURCE_TO_SECURITY cost and all-target same-level-as-placed-cost payoff.' });
        }
    } catch (e) {
        report.semanticIssues.placedCardLevelCostBindingLeak.push({ id: 'RUNTIME', name: 'Round 22BQ guard', reason: 'placed-card level runtime guard failed: ' + e.message });
    }
}



function auditAeroVeedramonZeroCostTrashLeak(cards, report) {
    // Round 22BU: P-047 AeroVeedramon Zero has two easy-to-miss payments:
    // its top effect must trash 3 cards from deck before the Tamer-gated +3000 DP,
    // and its inherited attack effect must return 3 non-Digi-Egg cards from trash
    // to deck bottom as a real cost before giving this Digimon +2000 DP.
    const aero = (cards || []).find(card => card && card.id === 'P-047');
    if (!aero) {
        report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: 'P-047', name: 'AeroVeedramon Zero', reason: 'P-047 is missing from cards.json.' });
        return;
    }
    const mechanics = Array.isArray(aero.mechanics) ? aero.mechanics : [];
    const whenDigi = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_DIGIVOLVING' && m.isInherited !== true);
    if (!whenDigi) {
        report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 missing non-inherited When Digivolving mechanic.' });
    } else {
        const actions = Array.isArray(whenDigi.actions) ? whenDigi.actions : [];
        const trash = actions.find(a => ['TRASH_DECK_TOP', 'TRASH_TOP_DECK'].includes(String(a?.type || '').toUpperCase()));
        if (!trash || Number(trash.amount || trash.target?.count || 0) !== 3) {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 When Digivolving must trash the top 3 cards of your deck.' });
        }
        const dp = actions.find(a => String(a?.type || '').toUpperCase() === 'DP_MOD' && Number(a?.amount || a?.value || 0) === 3000);
        if (!dp || dp.target?.self !== true || String(dp.condition?.type || '').toUpperCase() !== 'HAS_TAMER') {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 +3000 DP payoff must be a self buff gated by having a Tamer.' });
        }
    }
    const inherited = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_ATTACKING' && m.isInherited === true);
    if (!inherited) {
        report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 missing inherited When Attacking mechanic.' });
    } else {
        if (String(inherited.cost?.type || '').toUpperCase() !== 'RETURN_TO_DECK' || Number(inherited.cost?.amount || inherited.cost?.target?.count || 0) !== 3 || !/trash/i.test(String(inherited.cost?.from || inherited.cost?.zone || '')) || !/bottom/i.test(String(inherited.cost?.position || inherited.cost?.to || ''))) {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 inherited attack effect must return 3 cards from trash to deck bottom as a RETURN_TO_DECK cost.' });
        }
        if (inherited.cost?.target?.notDigiEgg !== true && inherited.cost?.target?.nonDigiEgg !== true) {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 inherited cost must exclude Digi-Egg cards from the trash payment.' });
        }
        const dp = (inherited.actions || []).find(a => String(a?.type || '').toUpperCase() === 'DP_MOD' && Number(a?.amount || a?.value || 0) === 2000);
        if (!dp || dp.target?.self !== true) {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: aero.id, name: aero.name, reason: 'P-047 inherited payoff must give this Digimon +2000 DP only after cost payment.' });
        }
    }
    try {
        const gs = getGameStateTextForAudit();
        if (!/notDigiEgg|nonDigiEgg|excludeDigiEgg/.test(gs)) {
            report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: 'RUNTIME', name: 'Round 22BU guard', reason: 'Runtime target matching must support non-Digi-Egg cost filters.' });
        }
    } catch (e) {
        report.semanticIssues.aeroVeedramonZeroCostTrashLeak.push({ id: 'RUNTIME', name: 'Round 22BU guard', reason: 'P-047 runtime guard failed: ' + e.message });
    }
}




function auditDynamicTotalPlayCostSourceBonusLeak(cards, report) {
    // Round 22BW: printed limits such as P-094 Destromon's "total play cost
    // of 3, +1 for every [Vemmon] in this Digimon's digivolution cards" must
    // be dynamic at runtime. The card data already carries totalPlayCostBase
    // and bonusPerSourceName; the engine must read those fields when opening
    // total-play-cost target choices.
    const destromon = (cards || []).find(card => card && card.id === 'P-094');
    if (!destromon) {
        report.semanticIssues.dynamicTotalPlayCostSourceBonusLeak.push({ id: 'P-094', name: 'Destromon', reason: 'P-094 Destromon is missing from cards.json.' });
        return;
    }
    const mechanics = Array.isArray(destromon.mechanics) ? destromon.mechanics : [];
    const relevant = mechanics.filter(m => ['ON_PLAY','WHEN_DIGIVOLVING'].includes(String(m?.trigger || '').toUpperCase()));
    for (const mech of relevant) {
        const del = (mech.actions || []).find(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON');
        if (!del || del.target?.selection !== 'total_play_cost' || Number(del.target?.totalPlayCostBase) !== 3 || del.target?.bonusPerSourceName !== 'Vemmon') {
            report.semanticIssues.dynamicTotalPlayCostSourceBonusLeak.push({ id: destromon.id, name: destromon.name, reason: 'Destromon On Play/When Digivolving must preserve totalPlayCostBase:3 and bonusPerSourceName:"Vemmon" metadata.' });
        }
    }
    try {
        const gs = getGameStateTextForAudit();
        const hasRoundGuard = /Round 22BW: dynamic total-play-cost caps/.test(gs);
        const readsBonusName = /bonusPerSourceName/.test(gs);
        const readsBase = /totalPlayCostBase/.test(gs);
        const scansStack = /Array\.isArray\(host\?\.stack\)/.test(gs) || /Array\.isArray\(sourceCard\?\.stack\)/.test(gs);
        const matchesNames = /getCardNameTokens\(src\)/.test(gs);
        if (!hasRoundGuard || !readsBonusName || !readsBase || !scansStack || !matchesNames) {
            report.semanticIssues.dynamicTotalPlayCostSourceBonusLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BW dynamic total play-cost source bonus guard',
                reason: 'Runtime must compute total play-cost limits from totalPlayCostBase plus bonusPerSourceName/bonusPerSourceTrait counts in the source host stack.',
                hasRoundGuard,
                readsBonusName,
                readsBase,
                scansStack,
                matchesNames
            });
        }
    } catch (e) {
        report.semanticIssues.dynamicTotalPlayCostSourceBonusLeak.push({ id:'RUNTIME', name:'Round 22BW guard', reason:'dynamic total-play-cost source bonus runtime guard failed: '+e.message });
    }
}


function auditDynamicLevelMaximumTargetLeak(cards, report) {
    // Round 22BX: printed "add to this effect's level maximum" clauses must
    // not be left as fixed maxLevel or fake DP/REDUCE_COST actions.
    const cardById = new Map((cards || []).map(card => [card.id, card]));
    const checks = [
        { id: 'BT18-029', name: 'AncientMermaimon', actionType: 'BOUNCE', triggers: new Set(['ON_PLAY','WHEN_DIGIVOLVING']), must: t => Number(t.maxLevelBase) === 4 && Number(t.bonusPerOtherOwnDigimon) === 1, reason: 'AncientMermaimon must use maxLevelBase:4 plus bonusPerOtherOwnDigimon:1, not fixed maxLevel:4.' },
        { id: 'BT21-078', name: 'WereGarurumon', actionType: 'DELETE_DIGIMON', triggers: new Set(['ON_PLAY','WHEN_DIGIVOLVING']), must: t => Number(t.maxLevelBase) === 4 && Number(t.bonusIfOwnTamerTotalColorsAtLeast) === 2 && Number(t.bonusLevelAmount) === 1, reason: 'BT21-078 must use maxLevelBase:4 plus the 2+ total Tamer colors level bonus, not fixed maxLevel:4.' },
        { id: 'BT12-083', name: 'Arresterdramon: Superior Mode', actionType: 'PLACE_SOURCE', triggers: new Set(['WHEN_DIGIVOLVING']), must: t => Number(t.maxLevelBase) === 3 && Number(t.bonusPerOwnTamerTotalColor) === 1, reason: 'BT12-083 must use maxLevelBase:3 plus bonusPerOwnTamerTotalColor:1, not fixed maxLevel:3 or fake DP_MOD.' },
        { id: 'ST21-11', name: 'MetalGarurumon', actionType: 'RETURN_TO_DECK', triggers: new Set(['ON_PLAY','WHEN_DIGIVOLVING']), must: t => Number(t.maxLevelBase) === 4 && Number(t.bonusPerOwnTamerColorGroup) === 2 && Number(t.bonusLevelAmount) === 1, reason: 'ST21-11 must use maxLevelBase:4 plus +1 per 2 total Tamer colors.' },
        { id: 'EX9-061', name: 'Devimon', actionType: 'DELETE_DIGIMON', triggers: new Set(['WHEN_ATTACKING']), must: t => Number(t.maxLevelBase) === 3 && Number(t.bonusPerFaceDownSourceGroup) === 2 && Number(t.bonusLevelAmount) === 1, reason: 'EX9-061 must use maxLevelBase:3 plus +1 per 2 face-down sources, not fixed maxLevel:3 or fake DP_MOD.' }
    ];
    for (const spec of checks) {
        const card = cardById.get(spec.id);
        if (!card) {
            report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id: spec.id, name: spec.name, reason: `${spec.id} is missing from cards.json.` });
            continue;
        }
        const mechs = Array.isArray(card.mechanics) ? card.mechanics : [];
        for (const trigger of spec.triggers) {
            const mech = mechs.find(m => String(m.trigger || '').toUpperCase() === trigger);
            const action = (mech?.actions || []).find(a => String(a?.type || '').toUpperCase() === spec.actionType);
            const target = action?.target || {};
            if (!action || !spec.must(target) || target.maxLevel !== undefined) {
                report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id: card.id, name: card.name, trigger, reason: spec.reason, target });
            }
            const actionBlob = JSON.stringify(mech?.actions || []);
            if (/"type"\s*:\s*"DP_MOD"[\s\S]{0,160}"maxLevel"|"type"\s*:\s*"REDUCE_COST"[\s\S]{0,160}"maxLevel"/.test(actionBlob)) {
                report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id: card.id, name: card.name, trigger, reason: 'Level-maximum bonuses must not be encoded as DP_MOD/REDUCE_COST placeholder actions.' });
            }
        }
    }
    try {
        const gs = getGameStateTextForAudit();
        if (!/Round 22BX: printed clauses such as AncientMermaimon/.test(gs) || !/getTargetLevelMaximum/.test(gs) || !/bonusPerOtherOwnDigimon/.test(gs) || !/bonusIfOwnTamerTotalColorsAtLeast/.test(gs)) {
            report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id:'RUNTIME', name:'Round 22BX dynamic level maximum guard', reason:'Runtime must compute dynamic maxLevelBase bonuses for target selection.' });
        }
        if (!/Round 22BY: remaining official dynamic level-maximum variants/.test(gs) || !/bonusPerOwnTamerTotalColor/.test(gs) || !/bonusPerOwnTamerColorGroup/.test(gs) || !/bonusPerFaceDownSourceGroup/.test(gs)) {
            report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id:'RUNTIME', name:'Round 22BY dynamic level maximum variants guard', reason:'Runtime must compute remaining dynamic maxLevelBase bonuses from distinct Tamer colors, Tamer color groups, and face-down source groups.' });
        }
    } catch (e) {
        report.semanticIssues.dynamicLevelMaximumTargetLeak.push({ id:'RUNTIME', name:'Round 22BX guard', reason:'dynamic level maximum runtime guard failed: '+e.message });
    }
}

function auditDpCheckOwnerTargetScopeLeak(cards, report) {
    // Round 22BV: DP_CHECK conditions must respect printed owner/target scope.
    // Official clauses such as "your opponent has a Digimon with 10000 DP or more"
    // must not pass just because the resolving player controls a large Digimon.
    try {
        const gs = getGameStateTextForAudit();
        const hasRoundGuard = /Round 22BV: DP_CHECK/.test(gs);
        const readsTargetOwner = /condition\.owner\s*\|\|\s*dpTarget\.owner/.test(gs);
        const normalizesOpponentTrait = /opponent\|their/.test(gs) && /dpOwnerScope\s*=\s*'opponent'/.test(gs);
        const cardMatchesTarget = /cardMatchesTarget\(c, target\)/.test(gs);
        if (!hasRoundGuard || !readsTargetOwner || !normalizesOpponentTrait || !cardMatchesTarget) {
            report.semanticIssues.dpCheckOwnerTargetScopeLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BV DP_CHECK owner/target scope guard',
                reason: 'DP_CHECK must respect condition.owner, condition.target.owner, legacy opponent/own trait scope, and cardMatchesTarget filters.',
                hasRoundGuard,
                readsTargetOwner,
                normalizesOpponentTrait,
                cardMatchesTarget
            });
        }
    } catch (e) {
        report.semanticIssues.dpCheckOwnerTargetScopeLeak.push({ id:'RUNTIME', name:'Round 22BV guard', reason:'DP_CHECK owner/target runtime guard failed: '+e.message });
    }

    // Keep an explicit card-level sentinel because multiple legacy cards still
    // encode opponent DP clauses via trait text rather than owner:"opponent".
    const legacy = (cards || []).filter(card => JSON.stringify(card.mechanics || {}).includes('opponent\'s Digimon') && JSON.stringify(card.mechanics || {}).includes('DP_CHECK'));
    if (legacy.length === 0) {
        report.semanticIssues.dpCheckOwnerTargetScopeLeak.push({
            id: 'CARDS',
            name: 'DP_CHECK legacy owner-scope sentinel',
            reason: 'Expected at least one legacy DP_CHECK opponent-scope encoding to remain covered by the runtime guard.'
        });
    }
}

function auditSameLevelDeletedHandCostLeak(cards, report) {
    // Round 22BS: Fake Agumon Expert's cost is event-bound. It must trash a
    // hand card whose level equals the Digimon deleted in this OPPONENT_DIGIMON_DELETED
    // trigger, and the draw must not resolve if that same-level hand cost fails.
    const fake = (cards || []).find(card => card && card.id === 'EX4-052');
    if (!fake) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: 'EX4-052', name: 'Fake Agumon Expert', reason: 'EX4-052 is missing from cards.json.' });
        return;
    }
    const mechanics = Array.isArray(fake.mechanics) ? fake.mechanics : [];
    const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'OPPONENT_DIGIMON_DELETED');
    if (!mech) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Fake Agumon Expert must listen to OPPONENT_DIGIMON_DELETED.' });
        return;
    }
    const blob = JSON.stringify(mech);
    if (/opponent'?s Digimon is deleted/i.test(blob) || /"type"\s*:\s*"HAS_TRAIT"/.test(blob) || /"position"\s*:\s*"same level as the deleted Digimon"/i.test(blob)) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Deleted-Digimon event text must not be encoded as HAS_TRAIT or a free-form position string.' });
    }
    if (String(mech.condition?.type || '').toUpperCase() !== 'TURN_PLAYER' || mech.condition?.owner !== 'own') {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Fake Agumon Expert is [Your Turn], so the trigger condition should be TURN_PLAYER owner:own.' });
    }
    if (String(mech.cost?.type || '').toUpperCase() !== 'TRASH_HAND' || mech.cost?.sameLevelAsDeletedCard !== true) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Fake Agumon Expert cost must be TRASH_HAND with sameLevelAsDeletedCard:true.' });
    }
    if (String(mech.cost?.target?.cardType || '').toLowerCase() !== 'digimon') {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Same-level hand-trash cost must target a Digimon card from hand, not any card / Option.' });
    }
    if (!Array.isArray(mech.actions) || !mech.actions.some(action => action?.type === 'DRAW' && Number(action.amount) === 2)) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: fake.id, name: fake.name, reason: 'Fake Agumon Expert payoff must remain Draw 2 after the cost is paid.' });
    }
    try {
        const gs = getGameStateTextForAudit();
        if (!/sameLevelAsDeletedCard/.test(gs) || !/deletedCard/.test(gs) || !/deletedLevel/.test(gs)) {
            report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: 'RUNTIME', name: 'Round 22BS guard', reason: 'Runtime TRASH_HAND cost must filter candidates by the deleted Digimon level from trigger context.' });
        }
    } catch (e) {
        report.semanticIssues.sameLevelDeletedHandCostLeak.push({ id: 'RUNTIME', name: 'Round 22BS guard', reason: 'same-level deleted hand-cost runtime guard failed: ' + e.message });
    }
}

function auditPlayFromSourceHostSelectorLeak(cards, report) {
    // Round 22BR: "from 1 of your blue Digimon's digivolution cards" has
    // two independent selectors: the source card must match the printed play
    // target, and the host stack must be a blue Digimon. A broad
    // PLAY_FROM_SOURCE target can illegally play any Digimon from any source.
    const cardById = new Map(cards.map(card => [card.id, card]));
    const aegis = cardById.get('EX3-026');
    if (aegis) {
        const whenDigi = (Array.isArray(aegis.mechanics) ? aegis.mechanics : [])
            .find(m => String(m.trigger || '').toUpperCase() === 'WHEN_DIGIVOLVING');
        const play = (whenDigi?.actions || []).find(a => String(a?.type || '').toUpperCase() === 'PLAY_FROM_SOURCE');
        if (!play) {
            report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: aegis.id, name: aegis.name, reason: 'EX3-026 missing PLAY_FROM_SOURCE in its When Digivolving effect.' });
        } else {
            const blob = JSON.stringify(play || {});
            const target = play.target || {};
            if (!Array.isArray(target.anyOf) || !/"color"\s*:\s*"Blue"/.test(blob) || !/"level"\s*:\s*3/.test(blob) || !/Seadramon/.test(blob) || !/Aqua/.test(blob) || !/Sea Animal/.test(blob)) {
                report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: aegis.id, name: aegis.name, reason: 'EX3-026 source-card selector must be blue Lv.3 OR Seadramon-name OR Aqua/Sea Animal-trait Digimon.' });
            }
            if (!play.sourceHostTarget || !/"color"\s*:\s*"Blue"/.test(JSON.stringify(play.sourceHostTarget))) {
                report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: aegis.id, name: aegis.name, reason: 'EX3-026 must restrict the source host to 1 of your blue Digimon.' });
            }
            const tooBroad = String(target.cardType || '').toLowerCase() === 'digimon'
                && target.count === 1
                && !target.anyOf
                && !target.trait
                && !target.traitAny
                && !target.name
                && !target.nameContains
                && !target.color
                && !target.level;
            if (tooBroad) {
                report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: aegis.id, name: aegis.name, reason: 'EX3-026 PLAY_FROM_SOURCE target is too broad and may play illegal source cards.' });
            }
        }
    }

    try {
        const gs = getGameStateTextForAudit();
        if (!/sourceHostMatchesAction/.test(gs) || !/getSourceHostTargetForAction/.test(gs) || !/sourceHostTarget/.test(gs)) {
            report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: 'RUNTIME', name: 'Round 22BR guard', reason: 'Runtime must support sourceHostTarget filtering for PLAY_FROM_SOURCE candidates.' });
        }
    } catch (e) {
        report.semanticIssues.playFromSourceHostSelectorLeak.push({ id: 'RUNTIME', name: 'Round 22BR guard', reason: 'play-from-source host-selector runtime guard failed: ' + e.message });
    }
}

function auditOptionIgnoreColorConditionLeak(cards, report) {
  for (const card of cards) {
    if (String(card?.type || '').toLowerCase() !== 'option') continue;
    const clause = getOptionIgnoreColorClauseForAudit(card);
    if (!clause) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const mainRows = mechanics
      .map((mech, mechanicIndex) => ({ mech, mechanicIndex }))
      .filter(row => String(row.mech?.trigger || '').toUpperCase() === 'MAIN');
    for (const row of mainRows) {
      if (!row.mech.condition) continue;
      if (!conditionLooksLikeOptionIgnoreClauseForAudit(row.mech.condition, clause)) continue;
      report.semanticIssues.optionIgnoreColorConditionLeak.push({
        id: card.id,
        name: card.name,
        mechanicIndex: row.mechanicIndex,
        reason: 'Pre-[Main] ignore-color requirement is Option-use legality only and must not gate the printed [Main] effect.'
      });
    }
  }
}



// Round 22BM: security-to-hand payments are structured costs.
// Printed clauses like “By adding your top security card to the hand” or
// “By adding the top or bottom card of your security stack to the hand” must
// not be encoded as REVEAL_AND_SELECT/ADD_TO_HAND actions before the payoff.
function getSecurityToHandCostClauseForAudit(card) {
  const text = [card?.mainEffect || '', card?.sourceEffect || '', card?.effectText || '']
    .join(' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ');
  const patterns = [
    /By adding your top security card to the hand\s*,\s*[^.。!?]+/i,
    /By adding the top card of your security stack to the hand\s*,\s*[^.。!?]+/i,
    /By adding the top or bottom card of your security stack to the hand\s*,\s*[^.。!?]+/i,
    /By adding the bottom or top card of your security stack to the hand\s*,\s*[^.。!?]+/i
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (!m) continue;
    const clause = m[0];
    // Alternative-cost cards such as Murasamemon need an OR-cost model; do not
    // force them into a single ADD_SECURITY_TO_HAND cost in this bucket.
    if (/\bor\s+trashing\b|\bor\s+by\s+trashing\b/i.test(clause)) continue;
    return clause;
  }
  return null;
}

function auditSecurityToHandCostEncodingLeak(cards, report) {
  for (const card of cards) {
    const clause = getSecurityToHandCostClauseForAudit(card);
    if (!clause) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    for (let mechanicIndex = 0; mechanicIndex < mechanics.length; mechanicIndex++) {
      const mech = mechanics[mechanicIndex] || {};
      const trigger = String(mech.trigger || '').toUpperCase();
      if (!['ON_PLAY','WHEN_DIGIVOLVING','START_OF_MAIN_PHASE','START_OF_YOUR_MAIN_PHASE','WHEN_ATTACKING','END_OF_OPPONENTS_TURN','END_OF_OPPONENT_TURN'].includes(trigger)) continue;
      const costType = String(mech.cost?.type || '').toUpperCase();
      const actionTypes = (Array.isArray(mech.actions) ? mech.actions : []).map(a => String(a?.type || '').toUpperCase());
      const hasFakeSecuritySelector = (Array.isArray(mech.actions) ? mech.actions : []).some(a => {
        const blob = JSON.stringify(a || {});
        return (String(a?.type || '').toUpperCase() === 'REVEAL_AND_SELECT' && /"cardType"\s*:\s*"security"/.test(blob))
          || (String(a?.type || '').toUpperCase() === 'ADD_TO_HAND' && /"cardType"\s*:\s*"security"/.test(blob));
      });
      if (actionTypes.includes('ADD_SECURITY_TO_HAND') || hasFakeSecuritySelector || costType === 'TRASH_SECURITY_STACK' || costType === 'TRASH_SECURITY' || (costType && costType !== 'ADD_SECURITY_TO_HAND' && hasFakeSecuritySelector)) {
        report.semanticIssues.securityToHandCostEncodingLeak.push({
          id: card.id,
          name: card.name,
          trigger,
          mechanicIndex,
          costType: costType || null,
          actionTypes,
          reason: 'Printed security-to-hand “By adding...” text must be encoded as ADD_SECURITY_TO_HAND cost, not as REVEAL_AND_SELECT/ADD_TO_HAND action or trash-security cost.'
        });
      }
    }
  }
}

// Round 22BH: battle-area Option trash can be a cost. If a printed clause says
// “By trashing 1 Option card in the battle area,” the follow-up must not resolve
// unless that battle-area Option cost is actually paid. It also must not be
// approximated as TRASH_SECURITY_STACK position:battle_area or TRASH_REVEALED_REST.
function cardTextHasBattleAreaOptionTrashCostForAudit(card) {
  const text = [card?.mainEffect || '', card?.sourceEffect || '', card?.effectText || ''].join(' ').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ');
  return /by trashing 1(?: of your)? Option cards? in the battle area/i.test(text);
}

function auditOptionBattleAreaCostAtomicityLeak(cards, report) {
  for (const card of cards) {
    if (!cardTextHasBattleAreaOptionTrashCostForAudit(card)) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const blob = JSON.stringify(mechanics);
    if (/TRASH_SECURITY_STACK/.test(blob) && /battle_area/.test(blob)) {
      report.semanticIssues.optionBattleAreaCostAtomicityLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed battle-area Option trash cost must not be encoded as TRASH_SECURITY_STACK position:battle_area.'
      });
    }
    if (/TRASH_REVEALED_REST/.test(blob)) {
      report.semanticIssues.optionBattleAreaCostAtomicityLeak.push({
        id: card.id,
        name: card.name,
        reason: 'Printed battle-area Option trash cost must not use TRASH_REVEALED_REST placeholder.'
      });
    }
    mechanics.forEach((mech, mechanicIndex) => {
      const trigger = String(mech?.trigger || '').toUpperCase();
      if (!['ON_PLAY','WHEN_DIGIVOLVING','WHEN_ATTACKING','WOULD_LEAVE_BATTLE_AREA','WOULD_BE_DELETED'].includes(trigger)) return;
      const actions = Array.isArray(mech.actions) ? mech.actions : [];
      actions.forEach((action, actionIndex) => {
        if (String(action?.type || '').toUpperCase() !== 'TRASH_OPTION_IN_BATTLE_AREA') return;
        const mechCostType = String(mech.cost?.type || '').toUpperCase();
        const actionCostType = String(action.cost?.type || '').toUpperCase();
        if (mechCostType !== 'TRASH_OPTION_IN_BATTLE_AREA' && actionCostType !== 'TRASH_OPTION_IN_BATTLE_AREA') {
          report.semanticIssues.optionBattleAreaCostAtomicityLeak.push({
            id: card.id,
            name: card.name,
            trigger,
            mechanicIndex,
            actionIndex,
            reason: 'TRASH_OPTION_IN_BATTLE_AREA appears as a normal action inside a printed “By trashing...” cost clause; encode it as mechanic.cost or action.cost so follow-ups are atomic.'
          });
        }
      });
    });
  }
}


// Round 22BI: BT16-090 Lui Ohwada has a composite printed cost: delete 1
// [Ukkomon] and trash 1 Digimon in the breeding area. The follow-up plays
// [BigUkkomon] to an empty breeding area for a fixed play cost of 3. This must
// not be approximated as a generic cost reduction or a single delete cost.
function auditLuiOhwadaCompositeCostLeak(cards, report) {
  const card = cards.find(c => c && c.id === 'BT16-090');
  if (!card) return;
  const main = (Array.isArray(card.mechanics) ? card.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'MAIN');
  if (!main) {
    report.semanticIssues.luiOhwadaCompositeCostLeak.push({ id: 'BT16-090', name: 'Lui Ohwada', reason: 'Missing [Main] mechanic.' });
    return;
  }
  const cost = main.cost || {};
  const costBlob = JSON.stringify(cost);
  const actionBlob = JSON.stringify(main.actions || []);
  const costTypes = Array.isArray(cost.costs) ? cost.costs.map(c => String(c?.type || '').toUpperCase()) : [String(cost.type || '').toUpperCase()];
  if (!['COMPOSITE','AND'].includes(String(cost.type || '').toUpperCase()) || !costTypes.includes('DELETE_OWN_DIGIMON_COST') || !costTypes.includes('TRASH_BREEDING_DIGIMON_COST')) {
    report.semanticIssues.luiOhwadaCompositeCostLeak.push({ id: card.id, name: card.name, reason: 'Lui Ohwada must use an atomic composite cost: delete [Ukkomon] and trash a breeding-area Digimon.' });
  }
  if (!/"name"\s*:\s*"Ukkomon"/.test(costBlob)) {
    report.semanticIssues.luiOhwadaCompositeCostLeak.push({ id: card.id, name: card.name, reason: 'Delete-cost leg must specifically require one of your [Ukkomon].' });
  }
  if (/REDUCE_COST/.test(actionBlob) || !/"playCostOverride"\s*:\s*3/.test(actionBlob) || !/"destination"\s*:\s*"breedingArea"/.test(actionBlob) || !/"requireEmptyBreeding"\s*:\s*true/.test(actionBlob)) {
    report.semanticIssues.luiOhwadaCompositeCostLeak.push({ id: card.id, name: card.name, reason: 'BigUkkomon follow-up must play to an empty breeding area for fixed play cost 3, not REDUCE_COST.' });
  }


  // Round 22BK: Breaclaw has a free +2000 DP first, then only the Draw payoff
  // is gated by a printed "Then, by placing..." cost. This must be action.cost,
  // not mechanic.cost, otherwise the first DP part would incorrectly fizzle.
  const breaclaw = cards.find(c => c && c.id === 'BT10-094');
  if (breaclaw) {
    const main = (Array.isArray(breaclaw.mechanics) ? breaclaw.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'MAIN');
    const actions = Array.isArray(main?.actions) ? main.actions : [];
    const hasDpFirst = String(actions[0]?.type || '').toUpperCase() === 'DP_MOD';
    const draw = actions.find(a => String(a?.type || '').toUpperCase() === 'DRAW');
    if (!main || !hasDpFirst || !draw || String(draw.cost?.type || '').toUpperCase() !== 'PLACE_SOURCE') {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT10-094', name:'Breaclaw', reason:'Breaclaw should keep its first DP_MOD action, then gate only Draw 1 behind an action-level PLACE_SOURCE cost.' });
    }
    if (actions.some(a => String(a?.type || '').toUpperCase() === 'PLACE_SOURCE')) {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT10-094', name:'Breaclaw', reason:'Breaclaw must not leave PLACE_SOURCE as a normal action before Draw 1.' });
    }
  }

  const blackGatomon = cards.find(c => c && c.id === 'BT25-082');
  if (blackGatomon) {
    const atk = (Array.isArray(blackGatomon.mechanics) ? blackGatomon.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_ATTACKING');
    if (!atk || atk.isInherited !== true) {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT25-082', name:'BlackGatomon', reason:'BT25-082 printed When Attacking is a source effect and must remain inherited after converting its By-placing payment to a cost.' });
    }
  }

  try {
    const gameStateText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/TRASH_BREEDING_DIGIMON_COST/.test(gameStateText) || !/playCostOverride/.test(gameStateText)) {
      report.semanticIssues.luiOhwadaCompositeCostLeak.push({ id: 'RUNTIME', name: 'game-state.js', reason: 'Runtime must support TRASH_BREEDING_DIGIMON_COST and fixed playCostOverride for effect plays.' });
    }
  } catch (e) {}
}


// Round 22BJ: Printed clauses like “By placing 1 card ... as this Digimon's
// bottom/top digivolution card, [effect]” are source-placement costs. They must
// not be encoded as a normal PLACE_SOURCE action before the payoff, otherwise the
// payoff can resolve even when the required card cannot be placed.
const PLACE_SOURCE_COST_ATOMICITY_CASES = {
  'BT15-059': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'BT21-022': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'P-088': ['WHEN_DIGIVOLVING'],
  'BT22-045': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'P-164': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'ST19-13': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'BT13-075': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'BT13-088': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'EX10-021': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  // Round 22BK: remaining hand/trash source-placement costs whose payoff
  // must not resolve when the required material cannot be placed.
  'BT17-059': ['WHEN_DIGIVOLVING'],
  'BT22-020': ['WHEN_ATTACKING'],
  'BT17-021': ['ON_PLAY'],
  'BT24-027': ['ON_PLAY', 'WHEN_DIGIVOLVING'],
  'BT25-082': ['WHEN_ATTACKING']
};

function auditPlaceSourceCostAtomicityLeak(cards, report) {
  for (const [id, triggers] of Object.entries(PLACE_SOURCE_COST_ATOMICITY_CASES)) {
    const card = cards.find(c => c && c.id === id);
    if (!card) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    for (const trigger of triggers) {
      const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === trigger);
      if (!mech) {
        report.semanticIssues.placeSourceCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'Missing mechanic for printed By-placing source-cost effect.' });
        continue;
      }
      const costType = String(mech.cost?.type || '').toUpperCase();
      const firstActionType = String((Array.isArray(mech.actions) ? mech.actions[0]?.type : '') || '').toUpperCase();
      const costBlob = JSON.stringify(mech.cost || {});
      if (costType !== 'PLACE_SOURCE') {
        report.semanticIssues.placeSourceCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'Printed By-placing source payment must be encoded as mechanic.cost.type PLACE_SOURCE.' });
      }
      if (firstActionType === 'PLACE_SOURCE') {
        report.semanticIssues.placeSourceCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'PLACE_SOURCE is still a normal first action; follow-up effects are not atomic with the printed cost.' });
      }
      if (!/("from"\s*:\s*"(?:hand|trash|hand_or_trash)"|"zone"\s*:\s*"(?:hand|trash|hand_or_trash)")/.test(costBlob)) {
        report.semanticIssues.placeSourceCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'PLACE_SOURCE cost should preserve its printed source zone such as hand/trash.' });
      }
    }
  }


  // Round 22BK: Breaclaw has a free +2000 DP first, then only the Draw payoff
  // is gated by a printed "Then, by placing..." cost. This must be action.cost,
  // not mechanic.cost, otherwise the first DP part would incorrectly fizzle.
  const breaclaw = cards.find(c => c && c.id === 'BT10-094');
  if (breaclaw) {
    const main = (Array.isArray(breaclaw.mechanics) ? breaclaw.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'MAIN');
    const actions = Array.isArray(main?.actions) ? main.actions : [];
    const hasDpFirst = String(actions[0]?.type || '').toUpperCase() === 'DP_MOD';
    const draw = actions.find(a => String(a?.type || '').toUpperCase() === 'DRAW');
    if (!main || !hasDpFirst || !draw || String(draw.cost?.type || '').toUpperCase() !== 'PLACE_SOURCE') {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT10-094', name:'Breaclaw', reason:'Breaclaw should keep its first DP_MOD action, then gate only Draw 1 behind an action-level PLACE_SOURCE cost.' });
    }
    if (actions.some(a => String(a?.type || '').toUpperCase() === 'PLACE_SOURCE')) {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT10-094', name:'Breaclaw', reason:'Breaclaw must not leave PLACE_SOURCE as a normal action before Draw 1.' });
    }
  }

  const blackGatomon = cards.find(c => c && c.id === 'BT25-082');
  if (blackGatomon) {
    const atk = (Array.isArray(blackGatomon.mechanics) ? blackGatomon.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_ATTACKING');
    if (!atk || atk.isInherited !== true) {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'BT25-082', name:'BlackGatomon', reason:'BT25-082 printed When Attacking is a source effect and must remain inherited after converting its By-placing payment to a cost.' });
    }
  }

  try {
    const gameStateText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/case 'PLACE_SOURCE':/.test(gameStateText) || !/payPlaceSourceCost/.test(gameStateText) || !/Cost PLACE_SOURCE could not be paid/.test(gameStateText)) {
      report.semanticIssues.placeSourceCostAtomicityLeak.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must pay PLACE_SOURCE as an atomic structured cost and skip the effect if it cannot be paid.' });
    }
  } catch (e) {}
}


// Round 22BL: Printed clauses such as “By returning 1 level 6 Digimon card
// from this Digimon's digivolution cards to its owner's hand” are source-return
// costs. They must not be encoded as normal RETURN_SOURCE_TO_HAND/RETURN_TO_DECK
// actions before the payoff, or the payoff can resolve after the cost fails.
const RETURN_SOURCE_TO_HAND_COST_CASES = {
  'BT11-073': ['WHEN_DIGIVOLVING'],
  'BT10-067': ['WHEN_DIGIVOLVING'],
  'BT5-087': ['WHEN_ATTACKING'],
  // Round 22BO: BT7-029 MagnaGarurumon returns a [Hybrid] source as the payment
  // for the same-level bounce payoff. This must be an atomic cost, not a normal
  // RETURN_SOURCE_TO_HAND action followed by a payoff that can see stale state.
  'BT7-029': ['WHEN_DIGIVOLVING', 'WHEN_ATTACKING']
};

function auditReturnSourceToHandCostAtomicityLeak(cards, report) {
  for (const [id, triggers] of Object.entries(RETURN_SOURCE_TO_HAND_COST_CASES)) {
    const card = cards.find(c => c && c.id === id);
    if (!card) continue;
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    for (const trigger of triggers) {
      const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === trigger);
      if (!mech) {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'Missing mechanic for printed by-returning-source-to-hand cost.' });
        continue;
      }
      const costType = String(mech.cost?.type || '').toUpperCase();
      const actionTypes = (Array.isArray(mech.actions) ? mech.actions : []).map(a => String(a?.type || '').toUpperCase());
      if (costType !== 'RETURN_SOURCE_TO_HAND') {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'Printed source-return payment must be encoded as mechanic.cost.type RETURN_SOURCE_TO_HAND.' });
      }
      if (actionTypes[0] === 'RETURN_SOURCE_TO_HAND' || actionTypes[0] === 'RETURN_TO_DECK') {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'Source-return payment is still a normal first action; payoff is not atomic with the printed cost.' });
      }
      const costBlob = JSON.stringify(mech.cost || {});
      if (!/sourceHostSelf/.test(costBlob) || !/"count"\s*:\s*1/.test(costBlob)) {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'RETURN_SOURCE_TO_HAND cost should bind to this Digimon/source host and return exactly one source card.' });
      }
      if (id === 'BT7-029' && !/Hybrid/.test(costBlob)) {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'MagnaGarurumon must return exactly 1 [Hybrid] source card, not any source.' });
      }
      if (id === 'BT7-029' && !actionTypes.includes('BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE')) {
        report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id, name: card.name, trigger, reason: 'MagnaGarurumon payoff must bounce 1 opponent Digimon with the same level as the returned source.' });
      }
    }
  }

  const sameLevelSourceReturnRows = [];
  for (const card of cards) {
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    mechanics.forEach((mech, mi) => {
      const actionTypes = (Array.isArray(mech.actions) ? mech.actions : []).map(a => String(a?.type || '').toUpperCase());
      if (!actionTypes.includes('BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE')) return;
      if (String(mech.cost?.type || '').toUpperCase() !== 'RETURN_SOURCE_TO_HAND') {
        sameLevelSourceReturnRows.push({ id: card.id, name: card.name, mechanicIndex: mi, reason: 'BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE must be gated by a RETURN_SOURCE_TO_HAND cost in the same mechanic.' });
      }
      if (actionTypes[0] === 'RETURN_SOURCE_TO_HAND') {
        sameLevelSourceReturnRows.push({ id: card.id, name: card.name, mechanicIndex: mi, reason: 'Same-level source-return payoff still has source return as a normal action, not a cost.' });
      }
    });
  }
  report.semanticIssues.returnSourceToHandCostAtomicityLeak.push(...sameLevelSourceReturnRows);

  const zwart = cards.find(c => c && c.id === 'BT5-087');
  if (zwart) {
    const atk = (Array.isArray(zwart.mechanics) ? zwart.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_ATTACKING');
    const actions = Array.isArray(atk?.actions) ? atk.actions : [];
    if (actions.some(a => String(a?.type || '').toUpperCase() === 'BOUNCE_SAME_LEVEL_AS_RETURNED_SOURCE')) {
      report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id:'BT5-087', name:'Omnimon Zwart', reason:'Printed payoff deletes an unsuspended play-cost-12-or-less Digimon; it must not use same-level bounce placeholder.' });
    }
    const del = actions.find(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON');
    if (!del || Number(del.target?.maxCost) !== 12 || del.target?.isUnsuspended !== true) {
      report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id:'BT5-087', name:'Omnimon Zwart', reason:'Payoff must delete 1 opponent unsuspended Digimon with play cost 12 or less.' });
    }
  }

  try {
    const gameStateText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/case 'RETURN_SOURCE_TO_HAND':/.test(gameStateText) || !/RETURN_SOURCE_TO_HAND_COST/.test(gameStateText) || !/recordReturnedByThisEffect/.test(gameStateText)) {
      report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must support RETURN_SOURCE_TO_HAND as an atomic structured cost and record the returned source.' });
    }
    if (!/Round 22BO/.test(gameStateText) || !/_lastReturnedByThisEffect/.test(gameStateText) || !/bounceByLastReturnedSourceLevel\(playerId, action = \{\}, effectContext = null\)/.test(gameStateText)) {
      report.semanticIssues.returnSourceToHandCostAtomicityLeak.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime same-level bounce must bind to the source returned by this current cost/effect, not stale lastReturnedSource.' });
    }
  } catch (e) {}
}


function auditAmphimonRb1UnderCardCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'RB1-016');
  if (!card) {
    report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:'RB1-016', name:'Amphimon', reason:'RB1-016 is missing from cards.json.' });
    return;
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  for (const trigger of ['WHEN_DIGIVOLVING','WHEN_ATTACKING']) {
    const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === trigger);
    if (!mech) {
      report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Missing printed timing.' });
      continue;
    }
    if (String(mech.cost?.type || '').toUpperCase() !== 'TRASH_HAND' || mech.cost?.upTo !== true || Number(mech.cost?.amount) !== 2 || !/Blue/i.test(JSON.stringify(mech.cost?.target || {}))) {
      report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Printed up-to-2 blue hand trash must be encoded as a TRASH_HAND upTo cost so the actual count is recorded.' });
    }
    const trashSource = (Array.isArray(mech.actions) ? mech.actions : []).find(a => String(a?.type || '').toUpperCase() === 'TRASH_SOURCE');
    if (!trashSource || !/TRASHED_BY_THIS_EFFECT/.test(JSON.stringify(trashSource.amount || {})) || !/digimon/.test(JSON.stringify(trashSource.sourceHostTarget || {}).toLowerCase()) || !/tamer/.test(JSON.stringify(trashSource.sourceHostTarget || {}).toLowerCase())) {
      report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Under-card trash must repeat from the actual number of blue cards trashed by this effect and only hit opponent Digimon/Tamer source hosts.' });
    }
    if (!/maxSourceCount"?\s*:?\s*0/.test(JSON.stringify(mech.actions || []))) {
      report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Printed follow-up must still return 1 opponent Digimon with no digivolution cards to deck bottom.' });
    }
  }
  const prevent = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'WOULD_BE_DELETED');
  const blob = JSON.stringify(prevent || {});
  if (!/PREVENT_LEAVE_PLAY/.test(blob) || !/RETURN_TO_DECK/.test(blob) || !/textContains"?\s*:?\s*"Jellymon"/.test(blob)) {
    report.semanticIssues.amphimonRb1UnderCardCostLeak.push({ id:card.id, name:card.name, reason:'Deletion-prevention cost must return 3 cards with [Jellymon] in their texts from trash, not only nameContains Jellymon.' });
  }
}


function auditAmphimonLmUnderCardCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'LM-005');
  if (!card) {
    report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:'LM-005', name:'Amphimon', reason:'LM-005 is missing from cards.json.' });
    return;
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  for (const trigger of ['ON_PLAY','WHEN_DIGIVOLVING']) {
    const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === trigger);
    if (!mech) {
      report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Missing printed timing.' });
      continue;
    }
    if (String(mech.cost?.type || '').toUpperCase() !== 'TRASH_HAND' || mech.cost?.upTo !== true || Number(mech.cost?.amount) !== 4 || !/Blue/i.test(JSON.stringify(mech.cost?.target || {}))) {
      report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Printed up-to-4 blue hand trash must be encoded as a TRASH_HAND upTo cost so the actual count is recorded.' });
    }
    const trashSource = (Array.isArray(mech.actions) ? mech.actions : []).find(a => String(a?.type || '').toUpperCase() === 'TRASH_SOURCE');
    if (!trashSource || !/TRASHED_BY_THIS_EFFECT/.test(JSON.stringify(trashSource.amount || {})) || !/digimon/.test(JSON.stringify(trashSource.sourceHostTarget || {}).toLowerCase()) || !/tamer/.test(JSON.stringify(trashSource.sourceHostTarget || {}).toLowerCase())) {
      report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Under-card trash must repeat from the actual number of blue cards trashed by this effect and only hit opponent Digimon/Tamer source hosts.' });
    }
    const bounce = (Array.isArray(mech.actions) ? mech.actions : []).find(a => String(a?.type || '').toUpperCase() === 'BOUNCE');
    if (!bounce || !/maxSourceCount"?\s*:?\s*0/.test(JSON.stringify(bounce?.target || {})) || !/digimon/.test(JSON.stringify(bounce?.target || {}).toLowerCase()) || !/tamer/.test(JSON.stringify(bounce?.target || {}).toLowerCase())) {
      report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:card.id, name:card.name, trigger, reason:'Printed follow-up must return 1 opponent Digimon or Tamer with no cards under it to hand.' });
    }
  }
  const attack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_ATTACKING');
  const attackBlob = JSON.stringify(attack || {});
  if (String(attack?.cost?.type || '').toUpperCase() !== 'RETURN_TO_DECK' || Number(attack?.cost?.amount) !== 3 || !/textContains"?\s*:?\s*"Jellymon"/.test(attackBlob) || !/GRANT_KEYWORD/.test(attackBlob) || !/Security A\. \+1/.test(attackBlob)) {
    report.semanticIssues.amphimonLmUnderCardCostLeak.push({ id:card.id, name:card.name, trigger:'WHEN_ATTACKING', reason:'Printed When Attacking must pay RETURN_TO_DECK 3 Jellymon-text cards before granting Security A.+1.' });
  }
}


function auditSimpleEndAttackTimingLeak(cards, report) {
  const expected = {
    'BT21-031': { name:'Sangomon', action:'GAIN_MEMORY' },
    'EX11-013': { name:'Sangomon', action:'GAIN_MEMORY' },
    'BT19-019': { name:'Shellmon', action:'GAIN_MEMORY' },
    'BT20-050': { name:'HoverEspimon', action:'DRAW' }
  };
  for (const [id, spec] of Object.entries(expected)) {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.simpleEndAttackTimingLeak.push({ id, name:spec.name, reason:'Card missing from cards.json.' });
      continue;
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && JSON.stringify(m.actions || []).includes(spec.action));
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && JSON.stringify(m.actions || []).includes(spec.action));
    if (!/\[End of Attack\]/i.test(String(card.effectText || ''))) {
      report.semanticIssues.simpleEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed [End of Attack] text; review this guard.' });
    }
    if (!endAttack) {
      report.semanticIssues.simpleEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:`Printed [End of Attack] ${spec.action} effect must use END_OF_ATTACK timing.` });
    }
    if (badEndTurn) {
      report.semanticIssues.simpleEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:`Printed [End of Attack] ${spec.action} effect is still encoded as END_OF_TURN.` });
    }
    if (endAttack && endAttack.isOncePerTurn !== true) {
      report.semanticIssues.simpleEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Printed simple End of Attack effect is [Once Per Turn] and must mark isOncePerTurn:true.' });
    }
  }
}

function auditEndAttackSelfLeaveTimingLeak(cards, report) {
  const specs = {
    'EX1-062': { name:'SkullGreymon', action:'DELETE_DIGIMON', selfAction:true, forbid:'SET_MEMORY' },
    'RB1-029': { name:'GulusGammamon', cost:'DELETE_OWN_DIGIMON_COST', dpLimit:'deleted_cost_dp' },
    'LM-007': { name:'Publimon', action:'SEND_TO_SECURITY', selfAction:true },
    'EX2-028': { name:'Parasitemon', action:'PLACE_SOURCE', selfAction:true, requireAttachOther:true }
  };
  for (const [id, spec] of Object.entries(specs)) {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id, name:spec.name, reason:'Card missing from cards.json.' });
      continue;
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    if (!/\[End of Attack\]/i.test(String(card.effectText || ''))) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed [End of Attack] text; review this guard.' });
    }
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK');
    if (!endAttack) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Printed self-leave [End of Attack] effect must use END_OF_ATTACK timing.' });
      continue;
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && JSON.stringify(m).match(/DELETE_DIGIMON|DELETE_OWN_DIGIMON_COST|SEND_TO_SECURITY|PLACE_SOURCE/));
    if (badEndTurn) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Printed self-leave End of Attack effect is still encoded as END_OF_TURN.' });
    }
    const blob = JSON.stringify(endAttack);
    if (spec.cost && String(endAttack.cost?.type || '').toUpperCase() !== spec.cost) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:`Printed by-deleting-this clause must encode ${spec.cost} as the effect cost.` });
    }
    if (spec.action && !blob.includes(`"type":"${spec.action}"`) && !blob.includes(`"type": "${spec.action}"`)) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:`Missing printed ${spec.action} payoff at END_OF_ATTACK.` });
    }
    if (spec.selfAction && !/"self"\s*:\s*true/.test(blob)) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Self-leave End of Attack effect must target this exact Digimon with self:true.' });
    }
    if (spec.dpLimit && !blob.includes(spec.dpLimit)) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Follow-up DP cap must bind to the Digimon actually deleted as the cost, not a fixed printed DP.' });
    }
    if (spec.requireAttachOther && (!/attachToTarget/.test(blob) || !/"excludeSelf"\s*:\s*true/.test(blob))) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:'Parasitemon must place itself under one of your other Digimon; attach target must exclude self.' });
    }
    if (spec.forbid && JSON.stringify(mechanics).includes(spec.forbid)) {
      report.semanticIssues.endAttackSelfLeaveTimingLeak.push({ id:card.id, name:card.name, reason:`Printed keyword text must not be encoded as fake ${spec.forbid}.` });
    }
  }
}



function auditInheritedEndAttackTimingLeak(cards, report) {
  const specs = {
    'BT9-062': { name:'Raptordramon', action:'DELETE_DIGIMON', requireSelfAlphamon:true },
    'P-164': { name:'Shellmon', action:'DRAW' },
    'BT13-028': { name:'Thetismon', action:'UNSUSPEND', requireSelfTarget:true, requireReturnCost:true },
    'BT16-076': { name:'Soloogarmon', action:'UNSUSPEND', requireSelfTarget:true, requireOpponentMemory:true },
    'BT10-082': { name:'Beelzemon', action:'GAIN_MEMORY', requireTrashCountAmount:true },
    'BT16-071': { name:'MadLeomon', action:'PLAY_FROM_TRASH', requireSelfDeleteCost:true, requirePlayMaxLevel:4 },
    'BT15-071': { name:'Loogamon', action:'GAIN_MEMORY', requireOpponentMemory:true },
    'BT15-075': { name:'Loogarmon', action:'GAIN_MEMORY', requireOpponentMemory:true },
    'BT19-017': { name:'Sangomon', action:'GAIN_MEMORY' },
    'BT19-019': { name:'Shellmon', action:'GAIN_MEMORY' },
    'BT21-031': { name:'Sangomon', action:'GAIN_MEMORY' },
    'EX11-013': { name:'Sangomon', action:'GAIN_MEMORY' }
  };
  for (const [id, spec] of Object.entries(specs)) {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id, name:spec.name, reason:'Guarded source-effect card is missing from cards.json.' });
      continue;
    }
    const text = [card.sourceEffect || '', card.effectText || ''].join(' ');
    if (!/\[End of Attack\]/i.test(text)) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Guarded inherited card no longer has printed [End of Attack] text; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && m?.isInherited === true && JSON.stringify(m?.actions || []).includes(spec.action));
    if (!endAttack) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:`Printed inherited [End of Attack] ${spec.action} effect must use END_OF_ATTACK with isInherited:true.` });
      continue;
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && JSON.stringify(m?.actions || []).includes(spec.action));
    if (badEndTurn) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:`Printed inherited [End of Attack] ${spec.action} effect is still encoded as END_OF_TURN.` });
    }
    const blob = JSON.stringify(endAttack);
    if (spec.requireSelfAlphamon && (!/"scope"\s*:\s*"self"/.test(blob) || !/Alphamon/.test(blob))) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Raptordramon source condition must bind to the Alphamon host, not a board-wide Alphamon check.' });
    }
    if (spec.requireSelfTarget && !/"self"\s*:\s*true/.test(blob)) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Inherited End of Attack unsuspend must target the source host with self:true.' });
    }
    if (spec.requireReturnCost && (String(endAttack.cost?.type || '').toUpperCase() !== 'RETURN_TO_DECK' || !/Jellymon/.test(blob))) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Thetismon inherited End of Attack must pay RETURN_TO_DECK 3 Jellymon-text cards before unsuspending.' });
    }
    if (spec.requireOpponentMemory && !/"owner"\s*:\s*"opponent"/.test(JSON.stringify(endAttack.condition || {}))) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Soloogarmon inherited End of Attack must check opponent memory, not own memory.' });
    }
    if (spec.requireTrashCountAmount && !/TRASH_COUNT/.test(blob)) {
      report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'Beelzemon inherited End of Attack memory gain must scale from own trash count.' });
    }
    if (spec.requireSelfDeleteCost) {
      const costBlob = JSON.stringify(endAttack.cost || {});
      if (String(endAttack.cost?.type || '').toUpperCase() !== 'DELETE_OWN_DIGIMON_COST' || !/\"self\"\s*:\s*true/.test(costBlob)) {
        report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'MadLeomon inherited End of Attack must delete this/source-host Digimon as the cost, not any own Digimon and not a normal action.' });
      }
    }
    if (spec.requirePlayMaxLevel !== undefined) {
      const action = (Array.isArray(endAttack.actions) ? endAttack.actions : []).find(a => String(a?.type || '').toUpperCase() === spec.action);
      if (!action || Number(action.target?.maxLevel) !== Number(spec.requirePlayMaxLevel) || String(action.target?.owner || '').toLowerCase() !== 'own' || String(action.target?.cardType || '').toLowerCase() !== 'digimon') {
        report.semanticIssues.inheritedEndAttackTimingLeak.push({ id:card.id, name:card.name, reason:'MadLeomon inherited End of Attack must play 1 own level 4 or lower Digimon card from trash.' });
      }
    }
  }
}




function auditTaomonSt22InheritedEndAttackSecurityCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'ST22-04');
  if (!card) {
    report.semanticIssues.taomonSt22InheritedEndAttackSecurityCostLeak.push({ id:'ST22-04', name:'Taomon', reason:'ST22-04 Taomon is missing from cards.json.' });
    return;
  }
  const sourceText = String(card.sourceEffect || '');
  if (!/\[End of Attack\]/i.test(sourceText) || !/trashing your top security card/i.test(sourceText) || !/Sakuyamon/i.test(sourceText)) {
    report.semanticIssues.taomonSt22InheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches Taomon inherited [End of Attack] security-trash Sakuyamon unsuspend; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited === true
    && m?.isOncePerTurn === true
    && String(m?.cost?.type || '').toUpperCase() === 'TRASH_SECURITY_STACK'
    && Number(m?.cost?.amount || 0) === 1
    && /top/i.test(String(m?.cost?.position || m?.cost?.from || ''))
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'UNSUSPEND'
      && String(a?.target?.owner || '').toLowerCase() === 'own'
      && /Sakuyamon/i.test(String(a?.target?.nameContains || a?.target?.name || a?.target?.textContains || ''))));
  if (!endAttack) {
    report.semanticIssues.taomonSt22InheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'ST22-04 source effect must be inherited END_OF_ATTACK once-per-turn, gated by trashing the top security card, then unsuspend 1 own Sakuyamon-name Digimon.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
    && /UNSUSPEND/.test(JSON.stringify(m?.actions || []))
    && /Sakuyamon/i.test(JSON.stringify(m?.actions || [])));
  if (badEndTurn) {
    report.semanticIssues.taomonSt22InheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'ST22-04 inherited [End of Attack] unsuspend must not remain encoded as END_OF_TURN.' });
  }
  const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited !== true
    && /UNSUSPEND/.test(JSON.stringify(m?.actions || []))
    && /Sakuyamon/i.test(JSON.stringify(m?.actions || [])));
  if (wrongTopLevel) {
    report.semanticIssues.taomonSt22InheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'ST22-04 lower/source effect must be inherited only; it must not trigger from Taomon as a top-level Digimon.' });
  }
}

function auditAlphamonNameInheritedEndAttackSourceLeak(cards, report) {
  const specs = {
    'BT9-064': { name:'Grademon', actionType:'DELETE_DIGIMON', maxCost:5, once:false },
    'BT8-069': { name:'Ouryumon', actionType:'UNSUSPEND', selfTarget:true, once:true }
  };
  Object.entries(specs).forEach(([id, spec]) => {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id, name:spec.name, reason:`${id} ${spec.name} is missing from cards.json.` });
      return;
    }
    const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
    if (!/\[End of Attack\]/i.test(text) || !/Alphamon/i.test(text)) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed inherited [End of Attack] Alphamon-name text; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited === true
      && /Alphamon/i.test(JSON.stringify(m?.condition || {}))
      && (Array.isArray(m.actions) ? m.actions : []).some(a => {
        if (String(a?.type || '').toUpperCase() !== spec.actionType) return false;
        if (spec.maxCost !== undefined && Number(a?.target?.maxCost ?? a?.target?.maxPlayCost ?? -1) !== spec.maxCost) return false;
        if (spec.selfTarget && a?.target?.self !== true) return false;
        return true;
      }));
    if (!endAttack) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id:card.id, name:card.name, reason:'Printed Alphamon-name source effect must use inherited END_OF_ATTACK with condition bound to the source host.' });
    }
    if (endAttack && spec.once === true && endAttack.isOncePerTurn !== true) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id:card.id, name:card.name, reason:'BT8-069 source effect is printed [Once Per Turn] and must keep isOncePerTurn:true.' });
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
      && JSON.stringify(m?.actions || []).includes(spec.actionType));
    if (badEndTurn) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id:card.id, name:card.name, reason:'Printed inherited [End of Attack] Alphamon-name source effect must not remain encoded as END_OF_TURN.' });
    }
    const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited !== true
      && JSON.stringify(m?.actions || []).includes(spec.actionType));
    if (wrongTopLevel) {
      report.semanticIssues.alphamonNameInheritedEndAttackSourceLeak.push({ id:card.id, name:card.name, reason:'Printed source/lower text must be inherited only; it must not trigger from the top-level card.' });
    }
  });
}





function auditMetalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak(cards, report) {
  const card = cards.find(c => c && c.id === 'BT19-025');
  if (!card) {
    report.semanticIssues.metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak.push({ id:'BT19-025', name:'MetalGreymon', reason:'BT19-025 is missing from cards.json.' });
    return;
  }
  const sourceText = String(card.sourceEffect || '').replace(/\u00a0/g, ' ');
  if (!/\[End of Attack\]/i.test(sourceText) || !/level 4 or lower/i.test(sourceText) || !/\[Blue Flare\]/i.test(sourceText) || !/under any of your Tamers/i.test(sourceText)) {
    report.semanticIssues.metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches BT19-025 inherited End-of-Attack Tamer-source play text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const end = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited === true
    && m?.isOncePerTurn === true
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'PLAY_FROM_SOURCE'
      && String(a?.target?.owner || '').toLowerCase() === 'own'
      && String(a?.target?.cardType || '').toLowerCase() === 'digimon'
      && Number(a?.target?.maxLevel) === 4
      && /Blue Flare/i.test(String(a?.target?.trait || a?.target?.traitAny || ''))
      && String((a?.sourceHostTarget || a?.hostTarget || a?.target?.sourceHostTarget || a?.target?.hostTarget || {})?.owner || '').toLowerCase() === 'own'
      && String((a?.sourceHostTarget || a?.hostTarget || a?.target?.sourceHostTarget || a?.target?.hostTarget || {})?.cardType || '').toLowerCase() === 'tamer'));
  if (!end) {
    report.semanticIssues.metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak.push({ id:card.id, name:card.name, reason:'BT19-025 source effect must be inherited END_OF_ATTACK once-per-turn and PLAY_FROM_SOURCE a Lv.4-or-lower [Blue Flare] Digimon from under an own Tamer.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
    && /PLAY_FROM_HAND_OR_TRASH|PLAY_FROM_TRASH|PLAY_FROM_HAND|PLAY_FROM_SOURCE/.test(JSON.stringify(m))
    && /Blue Flare|blue|level|Lv/i.test(JSON.stringify(m)));
  if (badEndTurn) {
    report.semanticIssues.metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak.push({ id:card.id, name:card.name, reason:'BT19-025 inherited [End of Attack] play-from-under-Tamer effect must not remain encoded as END_OF_TURN.' });
  }
  const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited !== true
    && /PLAY_FROM_SOURCE|PLAY_FROM_HAND_OR_TRASH|PLAY_FROM_TRASH|PLAY_FROM_HAND/.test(JSON.stringify(m))
    && /Blue Flare|under.*Tamer|sourceHostTarget/i.test(JSON.stringify(m)));
  if (wrongTopLevel) {
    report.semanticIssues.metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak.push({ id:card.id, name:card.name, reason:'BT19-025 lower/source text must not trigger from the top-level MetalGreymon body.' });
  }
}

function auditDexDoruGreymonInheritedEndAttackChosenLevelLeak(cards, report) {
  const card = cards.find(c => c && c.id === 'BT17-067');
  if (!card) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:'BT17-067', name:'DexDoruGreymon', reason:'BT17-067 is missing from cards.json.' });
    return;
  }
  const sourceText = String(card.sourceEffect || '').replace(/\u00a0/g, ' ');
  if (!/\[End of Attack\]/i.test(sourceText) || !/choose 1 of your Digimon/i.test(sourceText) || !/level equal to or lower than that Digimon/i.test(sourceText)) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches inherited End-of-Attack chosen-Digimon level-binding text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const end = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited === true
    && m?.isOncePerTurn === true
    && String(m?.cost?.type || '').toUpperCase() === 'DELETE_OWN_DIGIMON_COST'
    && m?.cost?.allowSource === true
    && String(m?.cost?.target?.owner || '').toLowerCase() === 'own'
    && String(m?.cost?.target?.cardType || '').toLowerCase() === 'digimon'
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON'
      && String(a?.target?.owner || '').toLowerCase() === 'opponent'
      && String(a?.target?.cardType || '').toLowerCase() === 'digimon'
      && String(a?.target?.maxLevel || '').toLowerCase() === 'deleted_cost_level'));
  if (!end) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:card.id, name:card.name, reason:'BT17-067 source effect must be inherited END_OF_ATTACK once-per-turn, delete 1 chosen own Digimon, and bind opponent maxLevel to deleted_cost_level.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
    && /DELETE_DIGIMON|DELETE_OWN_DIGIMON_COST/.test(JSON.stringify(m))
    && /level|chosen|deleted_cost_level/i.test(JSON.stringify(m)));
  if (badEndTurn) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:card.id, name:card.name, reason:'DexDoruGreymon inherited [End of Attack] deletion must not remain encoded as END_OF_TURN.' });
  }
  const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited !== true
    && /DELETE_DIGIMON|DELETE_OWN_DIGIMON_COST/.test(JSON.stringify(m))
    && /deleted_cost_level|level equal|chosen/i.test(JSON.stringify(m)));
  if (wrongTopLevel) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:card.id, name:card.name, reason:'DexDoruGreymon lower/source text must not trigger from the top-level card body.' });
  }
  const gs = getGameStateTextForAudit();
  if (!/deleted_cost_level/.test(gs) || !/deletedCostLevel/.test(gs) || !/getTargetLevelMaximum/.test(gs)) {
    report.semanticIssues.dexDoruGreymonInheritedEndAttackChosenLevelLeak.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must bind deleted_cost_level to the Digimon deleted as the same-effect cost for target selection.' });
  }
}

function auditBeastAntylamonInheritedEndAttackCostLeak(cards, report) {
  const specs = {
    'BT17-049': { name:'Antylamon', costType:'DELETE_OWN_DIGIMON_COST', payoff:'PLAY_FROM_TRASH', sourceZone:'trash', costVerb:/deleting 1 of your other suspended Digimon/i },
    'EX6-034': { name:'Antylamon', costType:'RETURN_TO_HAND_COST', payoff:'PLAY_FROM_HAND', sourceZone:'hand', costVerb:/returning 1 of your other suspended Digimon to the hand/i }
  };
  Object.entries(specs).forEach(([id, spec]) => {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.beastAntylamonInheritedEndAttackCostLeak.push({ id, name:spec.name, reason:`${id} ${spec.name} is missing from cards.json.` });
      return;
    }
    const sourceText = String(card.sourceEffect || '').replace(/\u00a0/g, ' ');
    if (!/\[End of Attack\]/i.test(sourceText) || !spec.costVerb.test(sourceText) || !/level 3[^.]*\[Beast\]/i.test(sourceText)) {
      report.semanticIssues.beastAntylamonInheritedEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches inherited [End of Attack] other-suspended-cost into Lv.3 Beast play text; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const end = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited === true
      && m?.isOncePerTurn === true
      && String(m?.cost?.type || '').toUpperCase() === spec.costType
      && String(m?.cost?.target?.owner || '').toLowerCase() === 'own'
      && String(m?.cost?.target?.cardType || '').toLowerCase() === 'digimon'
      && m?.cost?.target?.isSuspended === true
      && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === spec.payoff
        && String(a?.target?.owner || '').toLowerCase() === 'own'
        && String(a?.target?.cardType || '').toLowerCase() === 'digimon'
        && Number(a?.target?.level ?? a?.target?.maxLevel) === 3
        && String(a?.target?.trait || '').toLowerCase() === 'beast'));
    if (!end) {
      report.semanticIssues.beastAntylamonInheritedEndAttackCostLeak.push({ id:card.id, name:card.name, reason:`${id} lower/source text must be inherited END_OF_ATTACK once-per-turn with ${spec.costType} targeting 1 other suspended own Digimon and ${spec.payoff} Lv.3 Beast payoff.` });
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
      && /PLAY_FROM_TRASH|PLAY_FROM_HAND|DELETE_DIGIMON|BOUNCE/.test(JSON.stringify(m?.actions || []))
      && /suspended|Beast|level\":3|level 3/i.test(JSON.stringify(m)));
    if (badEndTurn) {
      report.semanticIssues.beastAntylamonInheritedEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Inherited Antylamon [End of Attack] cost/play effect must not remain encoded as END_OF_TURN.' });
    }
    const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited !== true
      && /PLAY_FROM_TRASH|PLAY_FROM_HAND/.test(JSON.stringify(m?.actions || []))
      && /suspended|Beast/i.test(JSON.stringify(m)));
    if (wrongTopLevel) {
      report.semanticIssues.beastAntylamonInheritedEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Inherited Antylamon source payoff must not trigger from the top-level Antylamon body.' });
    }
  });
}

function auditEx4AllianceInheritedEndAttackAnotherSuspendedLeak(cards, report) {
  const specs = {
    'EX4-025': { name:'Turuiemon', actionType:'DP_MOD', dp:-2000 },
    'EX4-029': { name:'Antylamon', actionType:'DP_MOD', dp:-2000, topRecovery:true },
    'EX4-054': { name:'Wendigomon', actionType:'ADD_TO_HAND', returnGreen:true },
    'EX4-057': { name:'Antylamon', actionType:'ADD_TO_HAND', returnGreen:true }
  };
  const gs = getGameStateTextForAudit();
  if (!/case ['"]IS_SUSPENDED['"][\s\S]{0,900}excludeSelf/.test(gs)) {
    report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:'GAME_STATE', name:'IS_SUSPENDED condition', reason:'IS_SUSPENDED board condition must support excludeSelf/otherThanSource so “another suspended Digimon” does not count the source host itself.' });
  }
  Object.entries(specs).forEach(([id, spec]) => {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id, name:spec.name, reason:`${id} ${spec.name} is missing from cards.json.` });
      return;
    }
    const sourceText = String(card.sourceEffect || '');
    if (!/\[End of Attack\]/i.test(sourceText) || !/another suspended Digimon/i.test(sourceText)) {
      report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches EX4 inherited [End of Attack] “another suspended Digimon” text; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const end = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited === true
      && m?.isOncePerTurn === true
      && String(m?.condition?.type || '').toUpperCase() === 'IS_SUSPENDED'
      && m?.condition?.excludeSelf === true
      && String(m?.condition?.owner || '').toLowerCase() === 'own'
      && String(m?.condition?.cardType || '').toLowerCase() === 'digimon'
      && (Array.isArray(m.actions) ? m.actions : []).some(a => {
        const type = String(a?.type || '').toUpperCase();
        if (type !== spec.actionType) return false;
        if (spec.dp !== undefined) return Number(a?.amount ?? a?.value ?? a?.buff?.value) === spec.dp;
        if (spec.returnGreen) return String(a?.from || a?.zone || '').toLowerCase().includes('trash')
          && String(a?.target?.owner || '').toLowerCase() === 'own'
          && String(a?.target?.cardType || '').toLowerCase() === 'digimon'
          && /green/i.test(JSON.stringify(a?.target || {}));
        return true;
      }));
    if (!end) {
      report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:card.id, name:card.name, reason:'EX4 lower/source “another suspended Digimon” text must be inherited END_OF_ATTACK once-per-turn, with IS_SUSPENDED excludeSelf:true and the printed payoff.' });
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN'
      && /DP_MOD|ADD_TO_HAND/.test(JSON.stringify(m?.actions || []))
      && /suspended|Green|-2000/i.test(JSON.stringify(m)));
    if (badEndTurn) {
      report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:card.id, name:card.name, reason:'EX4 inherited [End of Attack] “another suspended Digimon” effect must not remain encoded as END_OF_TURN.' });
    }
    const wrongTopLevel = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited !== true
      && /DP_MOD|ADD_TO_HAND/.test(JSON.stringify(m?.actions || []))
      && /suspended|Green|-2000/i.test(JSON.stringify(m)));
    if (wrongTopLevel) {
      report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:card.id, name:card.name, reason:'EX4 lower/source “another suspended Digimon” effect must not trigger from the top-level Digimon.' });
    }
  });
  const ex4029 = cards.find(c => c.id === 'EX4-029');
  if (ex4029) {
    const topRecovery = (Array.isArray(ex4029.mechanics) ? ex4029.mechanics : []).find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited !== true
      && String(m?.condition?.type || '').toUpperCase() === 'SECURITY_COUNT'
      && String(m?.condition?.operator || '') === '<='
      && Number(m?.condition?.value) === 3
      && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'RECOVERY_DECK'));
    if (!topRecovery) report.semanticIssues.ex4AllianceInheritedEndAttackAnotherSuspendedLeak.push({ id:'EX4-029', name:'Antylamon', reason:'EX4-029 printed top-level [End of Attack] Recovery +1 should be END_OF_ATTACK, not END_OF_TURN.' });
  }
}

function auditHerculesKabuterimonEndAttackTwicePerTurnLeak(cards, report) {
  const card = cards.find(c => c.id === 'BT1-081');
  if (!card) {
    report.semanticIssues.herculesKabuterimonEndAttackTwicePerTurnLeak.push({ id:'BT1-081', name:'HerculesKabuterimon', reason:'BT1-081 is missing from cards.json.' });
    return;
  }
  const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
  if (!/\[End of Attack\][^.。!?]*Twice Per Turn[^.。!?]*(?:decrease your memory by 3|memory by decreasing your memory by 3|unsuspend this Digimon by decreasing your memory by 3)/i.test(text)) {
    report.semanticIssues.herculesKabuterimonEndAttackTwicePerTurnLeak.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed [End of Attack][Twice Per Turn] pay-3-memory self-unsuspend text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && Number(m?.perTurnLimit || m?.maxPerTurn || m?.timesPerTurn || 0) === 2
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'UNSUSPEND'
      && a?.target?.self === true
      && String(a?.cost?.type || '').toUpperCase() === 'PAY_MEMORY'
      && Number(a?.cost?.amount || 0) === 3));
  if (!endAttack) {
    report.semanticIssues.herculesKabuterimonEndAttackTwicePerTurnLeak.push({ id:card.id, name:card.name, reason:'Printed [End of Attack][Twice Per Turn] must use END_OF_ATTACK + perTurnLimit:2 + PAY_MEMORY 3 self UNSUSPEND.' });
  }
  if (endAttack && endAttack.isOncePerTurn === true) {
    report.semanticIssues.herculesKabuterimonEndAttackTwicePerTurnLeak.push({ id:card.id, name:card.name, reason:'BT1-081 is printed [Twice Per Turn], not [Once Per Turn]; do not set isOncePerTurn:true.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && /UNSUSPEND/.test(JSON.stringify(m.actions || [])));
  if (badEndTurn) {
    report.semanticIssues.herculesKabuterimonEndAttackTwicePerTurnLeak.push({ id:card.id, name:card.name, reason:'Printed HerculesKabuterimon End-of-Attack self-unsuspend must not be encoded as END_OF_TURN.' });
  }
}




function auditMagnadramonBt9043EndAttackSecurityToHandCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'BT9-043');
  const bucket = report.semanticIssues.magnadramonBt9043EndAttackSecurityToHandCostLeak;
  if (!card) {
    bucket.push({ id:'BT9-043', name:'Magnadramon (X Antibody)', reason:'BT9-043 is missing from cards.json.' });
    return;
  }
  const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
  if (!/\[End of Attack\]/i.test(text) || !/add the top card of your security stack to your hand/i.test(text) || !/unsuspend this Digimon/i.test(text)) {
    bucket.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed End-of-Attack add-top-security-to-hand self-unsuspend text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited !== true
    && m?.isOncePerTurn === true
    && String(m?.cost?.type || '').toUpperCase() === 'ADD_SECURITY_TO_HAND'
    && Number(m?.cost?.amount || 0) === 1
    && /top|security_top/i.test(String(m?.cost?.position || m?.cost?.from || ''))
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'UNSUSPEND' && a?.target?.self === true));
  if (!endAttack) {
    bucket.push({ id:card.id, name:card.name, reason:'BT9-043 printed End-of-Attack effect must be END_OF_ATTACK once-per-turn, pay ADD_SECURITY_TO_HAND top-security as the cost, then unsuspend this Digimon.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && /ADD_SECURITY_TO_HAND|UNSUSPEND|security/i.test(JSON.stringify(m)));
  if (badEndTurn) {
    bucket.push({ id:card.id, name:card.name, reason:'BT9-043 End-of-Attack self-unsuspend must not be encoded as END_OF_TURN.' });
  }
  const whenDigivolving = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'WHEN_DIGIVOLVING');
  if (whenDigivolving && /UNSUSPEND/.test(JSON.stringify(whenDigivolving.actions || []))) {
    bucket.push({ id:card.id, name:card.name, reason:'BT9-043 When Digivolving effect must not contain the printed End-of-Attack self-unsuspend payoff.' });
  }
  if (whenDigivolving && !/Magnadramon|X Antibody/.test(JSON.stringify(whenDigivolving.condition || {}))) {
    bucket.push({ id:card.id, name:card.name, reason:'BT9-043 When Digivolving DP reduction must remain gated by a Magnadramon/X Antibody source condition.' });
  }
  const gs = getGameStateTextForAudit();
  if (!/case 'ADD_SECURITY_TO_HAND'/.test(gs) || !/ADD_SECURITY_TO_HAND_COST/.test(gs)) {
    bucket.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must support ADD_SECURITY_TO_HAND as an atomic cost so the unsuspend payoff does not resolve when security cannot be paid.' });
  }
}

function auditGlowingDawnInheritedEndAttackTamerSourceCostLeak(cards, report) {
  const ids = ['ST23-08','ST23-04','BT25-041'];
  const bucket = report.semanticIssues.glowingDawnInheritedEndAttackTamerSourceCostLeak;
  for (const id of ids) {
    const card = cards.find(c => c.id === id);
    if (!card) {
      bucket.push({ id, reason:'Guarded Glowing Dawn source-effect card is missing from cards.json.' });
      continue;
    }
    const sourceText = String(card.sourceEffect || '');
    if (!/\[End of Attack\]/i.test(sourceText) || !/bottom face-down card/i.test(sourceText) || !/under any of your Tamers/i.test(sourceText) || !/unsuspends/i.test(sourceText)) {
      bucket.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches the Glowing Dawn inherited End-of-Attack Tamer under-card cost template; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
      && m?.isInherited === true
      && m?.isOncePerTurn === true
      && String(m?.cost?.type || '').toUpperCase() === 'TRASH_BOTTOM_TAMER_SOURCE_COST'
      && m?.cost?.faceDown === true
      && String(m?.cost?.hostTarget?.owner || '').toLowerCase() === 'own'
      && String(m?.cost?.hostTarget?.cardType || '').toLowerCase() === 'tamer'
      && String(m?.condition?.type || '').toUpperCase() === 'HAS_TRAIT'
      && String(m?.condition?.scope || '').toLowerCase() === 'self'
      && /Glowing Dawn/i.test(String(m?.condition?.trait || m?.condition?.value || ''))
      && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'UNSUSPEND' && a?.target?.self === true));
    if (!endAttack) {
      bucket.push({ id:card.id, name:card.name, reason:'Glowing Dawn source text must be inherited END_OF_ATTACK once-per-turn, pay TRASH_BOTTOM_TAMER_SOURCE_COST for a bottom face-down own Tamer under-card, then unsuspend the source host.' });
    }
    if (mechanics.some(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && /TAMER_SOURCE|bottom_face_down|UNSUSPEND/i.test(JSON.stringify(m)))) {
      bucket.push({ id:card.id, name:card.name, reason:'Glowing Dawn inherited End-of-Attack effect must not be encoded as END_OF_TURN.' });
    }
    if (mechanics.some(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && m?.isInherited !== true && /TRASH_BOTTOM_TAMER_SOURCE_COST|bottom_face_down|UNSUSPEND/i.test(JSON.stringify(m)))) {
      bucket.push({ id:card.id, name:card.name, reason:'Glowing Dawn lower/source text must not trigger from the top-level card body.' });
    }
  }
  const gs = getGameStateTextForAudit();
  if (!/TRASH_BOTTOM_TAMER_SOURCE_COST/.test(gs) || !/bottom face-down card\(s\) from under Tamer/.test(gs)) {
    bucket.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must support TRASH_BOTTOM_TAMER_SOURCE_COST as an atomic cost from own Tamer under-cards.' });
  }
  if (!/explicitTraitFieldTokens/.test(gs) || !/Glowing Dawn/.test(gs)) {
    bucket.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime trait matching must preserve real traits that are also card names, such as Glowing Dawn.' });
  }
}

function auditMegadramonEx9064InheritedEndAttackUnsuspendCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'EX9-064');
  const bucket = report.semanticIssues.megadramonEx9064InheritedEndAttackUnsuspendCostLeak;
  if (!card) {
    bucket.push({ id:'EX9-064', name:'Megadramon', reason:'EX9-064 is missing from cards.json.' });
    return;
  }
  const sourceText = String(card.sourceEffect || '');
  if (!/\[End of Attack\]/i.test(sourceText) || !/By unsuspending this Digimon/i.test(sourceText) || !/lowest level/i.test(sourceText)) {
    bucket.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches inherited End-of-Attack unsuspend-cost/lowest-level deletion text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && m?.isInherited === true
    && m?.isOncePerTurn === true
    && String(m?.cost?.type || '').toUpperCase() === 'UNSUSPEND_THIS_DIGIMON_COST'
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON'
      && String(a?.target?.owner || '').toLowerCase() === 'own'
      && String(a?.target?.cardType || '').toLowerCase() === 'digimon'
      && String(a?.target?.selection || '').toLowerCase() === 'lowest_level'));
  if (!endAttack) {
    bucket.push({ id:card.id, name:card.name, reason:'EX9-064 source effect must be inherited END_OF_ATTACK once-per-turn, pay UNSUSPEND_THIS_DIGIMON_COST, then delete 1 own lowest-level Digimon.' });
  }
  const blob = JSON.stringify(mechanics || []);
  if (mechanics.some(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && /lowest_level|UNSUSPEND/i.test(JSON.stringify(m)))) {
    bucket.push({ id:card.id, name:card.name, reason:'EX9-064 inherited End-of-Attack effect must not be encoded as END_OF_TURN.' });
  }
  if (mechanics.some(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && m?.isInherited !== true && /lowest_level|UNSUSPEND/i.test(JSON.stringify(m)))) {
    bucket.push({ id:card.id, name:card.name, reason:'EX9-064 lower/source text must not trigger from top-level Megadramon.' });
  }
  const gs = getGameStateTextForAudit();
  if (!/UNSUSPEND_THIS_DIGIMON_COST/.test(gs) || !/canUnsuspendCard\(playerId, target, \{ reason: 'cost' \}\)/.test(gs)) {
    bucket.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must support UNSUSPEND_THIS_DIGIMON_COST and gate it through canUnsuspendCard as a real cost.' });
  }
  if (!/finite target clauses/.test(gs) || !/getExtremaSelectionValue\(entry\.card, metric\) === extreme/.test(gs)) {
    bucket.push({ id:'RUNTIME', name:'game-state.js', reason:'Runtime must restrict finite lowest/highest target windows, so “delete 1 lowest-level” cannot choose any matching Digimon.' });
  }
}

function auditBlackRapidmonEndAttackDedigivolveLeak(cards, report) {
  const card = cards.find(c => c.id === 'EX4-036');
  if (!card) {
    report.semanticIssues.blackRapidmonEndAttackDedigivolveLeak.push({ id:'EX4-036', name:'BlackRapidmon', reason:'EX4-036 is missing from cards.json.' });
    return;
  }
  const text = [card.effectText || '', card.mainEffect || '', card.sourceEffect || ''].join(' ');
  if (!/\[End of Attack\][^.。!?]*De-?Digivolve\s*1/i.test(text)) {
    report.semanticIssues.blackRapidmonEndAttackDedigivolveLeak.push({ id:card.id, name:card.name, reason:'Guarded card no longer has printed [End of Attack] De-Digivolve 1 text; review this guard.' });
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK'
    && (Array.isArray(m.actions) ? m.actions : []).some(a => String(a?.type || '').toUpperCase() === 'DE_DIGIVOLVE'
      && Number(a?.amount || 0) === 1
      && String(a?.target?.owner || '').toLowerCase() === 'opponent'
      && String(a?.target?.cardType || '').toLowerCase() === 'digimon'));
  if (!endAttack) {
    report.semanticIssues.blackRapidmonEndAttackDedigivolveLeak.push({ id:card.id, name:card.name, reason:'Printed [End of Attack] De-Digivolve 1 must use END_OF_ATTACK with DE_DIGIVOLVE amount 1 targeting 1 opponent Digimon.' });
  }
  const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && /DE_DIGIVOLVE/.test(JSON.stringify(m.actions || [])));
  if (badEndTurn) {
    report.semanticIssues.blackRapidmonEndAttackDedigivolveLeak.push({ id:card.id, name:card.name, reason:'Printed BlackRapidmon End-of-Attack De-Digivolve must not be encoded as END_OF_TURN.' });
  }
  if (endAttack && endAttack.isInherited === true) {
    report.semanticIssues.blackRapidmonEndAttackDedigivolveLeak.push({ id:card.id, name:card.name, reason:'EX4-036 upper-text End-of-Attack De-Digivolve is not inherited; it must resolve from BlackRapidmon itself.' });
  }
}

function auditPulsemonInheritedEndAttackSecurityCostLeak(cards, report) {
  const ids = ['BT17-036','BT16-074','BT16-023','BT16-044','BT16-059','BT16-034'];
  for (const id of ids) {
    const card = cards.find(c => c.id === id);
    if (!card) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id, reason:'Guarded Pulsemon-line source-effect card is missing from cards.json.' });
      continue;
    }
    const sourceText = String(card.sourceEffect || '');
    if (!/\[End of Attack\]/i.test(sourceText) || !/Pulsemon/i.test(sourceText) || !/trashing the top card of your security stack/i.test(sourceText)) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Guarded source text no longer matches the Pulsemon End-of-Attack security-trash template; review this guard.' });
    }
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const endAttack = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK' && m?.isInherited === true && JSON.stringify(m).includes('UNSUSPEND'));
    if (!endAttack) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Pulsemon-line source [End of Attack] unsuspend must be inherited END_OF_ATTACK, not top-level/end-turn.' });
      continue;
    }
    const blob = JSON.stringify(endAttack);
    if (String(endAttack.cost?.type || '').toUpperCase() !== 'TRASH_SECURITY_STACK' || Number(endAttack.cost?.amount || 0) !== 1 || !/top/i.test(String(endAttack.cost?.position || endAttack.cost?.from || ''))) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Pulsemon-line inherited End of Attack unsuspend must be gated by trashing exactly the top security card as a cost.' });
    }
    if (!/"scope"\s*:\s*"self"/.test(blob) || !/Pulsemon/.test(blob)) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Pulsemon-text condition must check the source host/this Digimon, not the board or source card name.' });
    }
    if (!/"self"\s*:\s*true/.test(blob)) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Pulsemon-line inherited unsuspend must target the source host with self:true.' });
    }
    const badEndTurn = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_TURN' && JSON.stringify(m).includes('UNSUSPEND') && /Pulsemon/i.test(JSON.stringify(m)));
    if (badEndTurn) {
      report.semanticIssues.pulsemonInheritedEndAttackSecurityCostLeak.push({ id:card.id, name:card.name, reason:'Pulsemon-line source [End of Attack] effect is still encoded as END_OF_TURN.' });
    }
  }
}

function auditTeslaJellymonEndAttackCostLeak(cards, report) {
  const card = cards.find(c => c.id === 'BT9-025');
  if (!card) {
    report.semanticIssues.teslaJellymonEndAttackCostLeak.push({ id:'BT9-025', name:'TeslaJellymon', reason:'BT9-025 is missing from cards.json.' });
    return;
  }
  const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
  const mech = mechanics.find(m => String(m?.trigger || '').toUpperCase() === 'END_OF_ATTACK');
  const blob = JSON.stringify(mech || {});
  if (!mech) {
    report.semanticIssues.teslaJellymonEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Missing printed [End of Attack] timing.' });
    return;
  }
  if (mech.isOncePerTurn !== true) {
    report.semanticIssues.teslaJellymonEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Printed End of Attack effect is [Once Per Turn] and must mark isOncePerTurn:true.' });
  }
  if (String(mech.cost?.type || '').toUpperCase() !== 'TRASH_HAND' || Number(mech.cost?.amount) !== 2 || !/card/.test(String(mech.cost?.target?.cardType || '').toLowerCase())) {
    report.semanticIssues.teslaJellymonEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Printed “trash 2 cards in your hand” must be encoded as TRASH_HAND cost amount 2.' });
  }
  if (!/UNSUSPEND/.test(blob) || !/"self"\s*:\s*true/.test(blob)) {
    report.semanticIssues.teslaJellymonEndAttackCostLeak.push({ id:card.id, name:card.name, reason:'Printed payoff must unsuspend this Digimon only after the hand-trash cost is paid.' });
  }
}


function auditCostSelectorSemanticLeak(cards, report) {
  const byId = new Map((cards || []).map(card => [String(card.id || ''), card]));
  const mechanicsBlob = id => JSON.stringify(byId.get(id)?.mechanics || []);
  const card = id => byId.get(id) || { id, name: id, mainEffect: '', sourceEffect: '' };

  const ex10010 = mechanicsBlob('EX10-010');
  if (/"minCost"\s*:\s*7/.test(ex10010) || !/"maxCost"\s*:\s*7/.test(ex10010) || !/"anyOf"/.test(ex10010)) {
    addSemanticIssue(report, card('EX10-010'), 'costSelectorSemanticLeak', 'Printed “play cost 7 or lower Digimon or Tamers” must be one OR target window using maxCost:7, not minCost:7 or two independent deletes.');
  }

  const bt19052 = byId.get('BT19-052');
  const vespamonBlob = JSON.stringify(bt19052?.mechanics || []);
  if (/"minCost"\s*:\s*2/.test(vespamonBlob) || /"type"\s*:\s*"REDUCE_COST"/.test(vespamonBlob) || !/FACE_UP_SECURITY_COUNT/.test(vespamonBlob) || !/MULTIPLY_ADD/.test(vespamonBlob)) {
    addSemanticIssue(report, card('BT19-052'), 'costSelectorSemanticLeak', 'Printed Vespamon deletion cap is dynamic maxCost 2 + 2 per face-up security; it must not be encoded as minCost or REDUCE_COST.');
  }
  const vespamonSource = (bt19052?.mechanics || []).find(m => String(m.trigger || '') === 'DELETED_OPPONENT_IN_BATTLE');
  if (!vespamonSource || vespamonSource.isInherited !== true) {
    addSemanticIssue(report, card('BT19-052'), 'costSelectorSemanticLeak', 'BT19-052 battle-deletion security trash text is a source effect and must be marked isInherited:true.');
  }

  const bt6060 = mechanicsBlob('BT6-060');
  if (!/"exactCost"\s*:\s*7/.test(bt6060) || /"cardType"\s*:\s*"option"[\s\S]{0,120}"minCost"\s*:\s*7/.test(bt6060)) {
    addSemanticIssue(report, card('BT6-060'), 'costSelectorSemanticLeak', 'Printed “Option card with a memory cost of 7” is exactCost:7, not minCost:7.');
  }

  const bt6112 = mechanicsBlob('BT6-112');
  if (!/"exactCost"\s*:\s*7/.test(bt6112) || /"cardType"\s*:\s*"option"[\s\S]{0,160}"minCost"\s*:\s*7/.test(bt6112) || !/TRASH_COUNT/.test(bt6112) || !/USE_OPTION_CARD/.test(bt6112) || !/ADD_TO_HAND/.test(bt6112)) {
    addSemanticIssue(report, card('BT6-112'), 'costSelectorSemanticLeak', 'BT6-112 must count exact 7-cost Options in trash for reduction, return exact 7-cost Option from trash, then use exact 7-cost Option from hand.');
  }

  const gameStateText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
  if (!/target\.exactCost/.test(gameStateText) || !/FACE_UP_SECURITY_COUNT/.test(gameStateText) || !/MULTIPLY_ADD/.test(gameStateText)) {
    report.semanticIssues.costSelectorSemanticLeak.push({
      id: 'ENGINE-COST-SELECTORS',
      name: 'Engine cost selector support',
      reason: 'Round 22DN requires runtime support for exactCost target filters and dynamic maxCost from FACE_UP_SECURITY_COUNT.'
    });
  }
}

function auditEffectDigivolveFixedCostLeak(cards, report) {
  const byId = new Map((cards || []).map(card => [String(card.id || ''), card]));
  const card = id => byId.get(id) || { id, name: id, mainEffect: '', sourceEffect: '' };
  const mechanics = id => Array.isArray(byId.get(id)?.mechanics) ? byId.get(id).mechanics : [];
  const firstAction = (id, trigger = null) => {
    for (const mech of mechanics(id)) {
      if (trigger && String(mech.trigger || '') !== trigger) continue;
      for (const action of (Array.isArray(mech.actions) ? mech.actions : [])) {
        const type = String(action?.type || '').toUpperCase();
        if (type === 'WARP_EVOLVE' || type === 'DNA_DIGIVOLVE') return { mech, action };
      }
    }
    return { mech: null, action: null };
  };
  const expectWarp = (id, trigger, fixedCost, evolveToken) => {
    const { mech, action } = firstAction(id, trigger);
    const blob = JSON.stringify(action || {});
    if (!action || String(action.type || '').toUpperCase() !== 'WARP_EVOLVE') {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', `Printed effect digivolve for memory cost ${fixedCost} must use WARP_EVOLVE, not DNA_DIGIVOLVE or a missing action.`);
      return;
    }
    if (mech?.cost && String(mech.cost?.type || '').toUpperCase() === 'PAY_MEMORY') {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', 'Effect digivolve memory cost must not be a mechanic-level PAY_MEMORY cost paid before choosing a legal evolution target.');
    }
    if (action.cost && typeof action.cost === 'object' && String(action.cost?.type || '').toUpperCase() === 'PAY_MEMORY') {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', 'Effect digivolve memory cost must not be an action.cost PAY_MEMORY object paid before WARP_EVOLVE target choice. Use payCost:true + fixedCost instead.');
    }
    if (/"minCost"\s*:/.test(blob) || /"maxCost"\s*:/.test(blob)) {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', 'Printed “for a memory cost X” must not be encoded as target.minCost/maxCost.');
    }
    if (action.payCost !== true || Number(action.fixedCost ?? action.digivolveCost ?? action.cost) !== Number(fixedCost)) {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', `Effect digivolve should carry payCost:true and fixedCost:${fixedCost}.`);
    }
    if (!action.evolveTo || !JSON.stringify(action.evolveTo).includes(evolveToken)) {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', `Effect digivolve should put the hand-card filter (${evolveToken}) in evolveTo, not in target.`);
    }
    if (action.useSourceCard !== true && action.target?.self !== true) {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', '“This Digimon can digivolve” effects should bind the current source/base Digimon, not search battle area by the evolveTo card name.');
    }
  };

  expectWarp('P-029', 'WHEN_ATTACKING', 2, 'AncientGreymon');
  expectWarp('P-030', 'WHEN_DIGIVOLVING', 1, 'AncientGarurumon');
  expectWarp('BT6-060', 'YOUR_TURN', 6, 'Three Musketeers');
  expectWarp('ST7-03', 'YOUR_TURN', 4, 'Gallantmon');
  expectWarp('BT10-067', 'WHEN_ATTACKING', 2, 'Justimon');
  expectWarp('BT7-051', 'WHEN_ATTACKING', 3, 'Insectoid');
  expectWarp('BT10-041', 'WHEN_ATTACKING', 1, 'Sakuyamon');
  expectWarp('ST8-04', 'YOUR_TURN', 4, 'UlforceVeedramon');

  for (const id of ['P-029', 'P-030']) {
    const blob = JSON.stringify(mechanics(id));
    if (/SCHEDULE_DELAYED_ACTION/.test(blob) && !/DIGIVOLVED_BY_THIS_EFFECT/.test(blob)) {
      addSemanticIssue(report, card(id), 'effectDigivolveFixedCostLeak', 'Printed “If it does, delete this Digimon at end of turn” must be gated by DIGIVOLVED_BY_THIS_EFFECT.');
    }
  }

  const gundramon = JSON.stringify(mechanics('BT6-065'));
  if (!/"exactCost"\s*:\s*7/.test(gundramon) || /"cardType"\s*:\s*"option"[\s\S]{0,120}"minCost"\s*:\s*7/.test(gundramon) || /"cardType"\s*:\s*"option"[\s\S]{0,120}"maxCost"\s*:\s*7/.test(gundramon)) {
    addSemanticIssue(report, card('BT6-065'), 'effectDigivolveFixedCostLeak', 'Gundramon exact memory-cost-7 Option use/fallback check should use exactCost:7, not minCost/maxCost range encoding.');
  }
}



function auditReducedPlayCostEffectPlayLeak(cards, report) {
  const byId = new Map((cards || []).map(card => [String(card.id || ''), card]));
  const card = id => byId.get(id) || { id, name: id, mechanics: [] };
  const specs = [
    { id:'BT20-013', reduction:2, token:'Sistermon' },
    { id:'BT15-024', reduction:3, token:'Matt Ishida' },
    { id:'BT23-008', reduction:2, token:'Nokia Shiramine', handOnly:true, anyType:true },
    { id:'BT23-018', reduction:2, token:'Nokia Shiramine', handOnly:true, anyType:true },
    { id:'BT16-048', reduction:8, token:'Insectoid' },
    { id:'BT19-099', reduction:4, token:'Composite' },
    { id:'BT20-099', reduction:4, token:'ACCEL' },
    { id:'EX7-060', reduction:4, token:'Nidhoggmon' },
    { id:'EX9-005', reduction:2, token:'Negamon' },
    { id:'BT20-093', reduction:3, token:'Dracomon' },
    { id:'BT20-094', reduction:5, token:'Free' }
  ];
  const playActions = c => (Array.isArray(c.mechanics) ? c.mechanics : []).flatMap((mech, mi) => (Array.isArray(mech.actions) ? mech.actions : []).map((action, ai) => ({ mech, mi, action, ai })));
  for (const spec of specs) {
    const c = card(spec.id);
    const hits = playActions(c).filter(row => String(row.action?.type || '').startsWith('PLAY_FROM') && String(row.action?.type || '') !== 'PLAY_FROM_SECURITY')
      .filter(row => JSON.stringify(row.action || {}).includes(spec.token));
    if (hits.length === 0) {
      addSemanticIssue(report, c, 'reducedPlayCostEffectPlayLeak', `Printed reduced play-cost effect should have a PLAY_FROM_* action targeting ${spec.token}.`);
      continue;
    }
    const ok = hits.some(row => row.action.free === false && row.action.payCost === true && Number(row.action.costReduction) === Number(spec.reduction));
    if (!ok) {
      addSemanticIssue(report, c, 'reducedPlayCostEffectPlayLeak', `Printed “play with the play cost reduced by ${spec.reduction}” must use free:false + payCost:true + costReduction:${spec.reduction}, not a free play.`);
    }
    const staleReduce = (Array.isArray(c.mechanics) ? c.mechanics : []).some(mech => (mech.actions || []).some(action => String(action?.type || '').toUpperCase() === 'REDUCE_COST' && Number(action.amount) === Number(spec.reduction)) && (mech.actions || []).some(action => String(action?.type || '').startsWith('PLAY_FROM')));
    if (staleReduce) {
      addSemanticIssue(report, c, 'reducedPlayCostEffectPlayLeak', 'Standalone REDUCE_COST before PLAY_FROM_* is a no-op leak; attach costReduction to the play action instead.');
    }
    if (spec.handOnly) {
      const bad = hits.some(row => row.action.type !== 'PLAY_FROM_HAND' || (spec.anyType && String(row.action.target?.cardType || '').toLowerCase() === 'digimon'));
      if (bad) addSemanticIssue(report, c, 'reducedPlayCostEffectPlayLeak', 'Printed name list includes a Tamer and says from hand; target must not be Digimon-only or hand/trash.');
    }
  }
  const dynamic = card('BT21-092');
  const dynBlob = JSON.stringify(dynamic.mechanics || []);
  if (!/PLACED_BY_THIS_EFFECT/.test(dynBlob) || /"type"\s*:\s*"REDUCE_COST"[\s\S]{0,80}"amount"\s*:\s*-1/.test(dynBlob)) {
    addSemanticIssue(report, dynamic, 'reducedPlayCostEffectPlayLeak', 'BT21-092 must reduce play cost dynamically by cards placed by this same effect, not by a standalone REDUCE_COST:-1 placeholder.');
  }
  const gameStateText = getGameStateTextForAudit();
  if (!/dynamicReduction/.test(gameStateText) || !/getDynamicActionAmount\(playerId, reductionRaw/.test(gameStateText)) {
    report.semanticIssues.reducedPlayCostEffectPlayLeak.push({
      id: 'ENGINE-REDUCED-PLAY-COST',
      name: 'Engine reduced play-cost support',
      reason: 'playCardFromZone must evaluate dynamic action.costReduction objects before charging reduced play costs.'
    });
  }
  if (!/isSelfOnlyCostReductionMechanic/.test(gameStateText) || !/areSameRuntimeCard\(sourceCard, playedCard\)/.test(gameStateText)) {
    report.semanticIssues.reducedPlayCostEffectPlayLeak.push({
      id: 'ENGINE-SELF-ONLY-COST-REDUCTION',
      name: 'Self-only play-cost reduction runtime scope',
      reason: 'WOULD_BE_PLAYED “this card would be played” reducers must only apply while that exact card is being played, not from a field copy.'
    });
  }
}


function auditTamerAutoAnimationTelemetryLeak(cards, report) {
  const gameStateText = getGameStateTextForAudit();
  let indexText = '';
  try { indexText = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'); } catch (e) {}
  const missing = [];
  if (!/visualEvents\s*=\s*\[\]/.test(gameStateText) || !/addVisualEvent\(type, payload/.test(gameStateText)) missing.push('bounded visualEvents stream');
  if (!/TAMER_EFFECT_ACTIVATED/.test(gameStateText)) missing.push('TAMER_EFFECT_ACTIVATED source telemetry');
  if (!/TAMER_SUSPENDED_FOR_EFFECT/.test(gameStateText) || !/SUSPEND_COST/.test(gameStateText)) missing.push('Tamer suspend-cost telemetry');
  if (!/TAMER_MEMORY_GAIN/.test(gameStateText) || !/TAMER_MEMORY_SET/.test(gameStateText)) missing.push('Tamer memory gain/set telemetry');
  if (!/visualEvents:\s*JSON\.parse/.test(gameStateText) || !/visualEventSeq/.test(gameStateText)) missing.push('cost rollback visualEvents snapshot');
  if (!/lastVisualEventSeq/.test(indexText) || !/playServerVisualEvents/.test(indexText) || !/presentTamerActivationFx/.test(indexText)) missing.push('front-end one-shot Tamer visual event consumer');
  if (!/playTamerSuspendDiffAnimations/.test(indexText)) missing.push('front-end Tamer suspend diff fallback');
  if (missing.length > 0) {
    report.semanticIssues.tamerAutoAnimationTelemetryLeak.push({
      id: 'ENGINE-TAMER-AUTO-ANIMATION-TELEMETRY',
      name: 'Tamer auto activation animation telemetry',
      reason: `Round 22DT requires visible, public, visual-only animation telemetry for automatic Tamer effects; missing: ${missing.join(', ')}.`
    });
  }
}



function auditAttackPendingTargetDeadlockLeak(cards, report) {
  const gameStateText = getGameStateTextForAudit();
  let indexText = '';
  let autoText = '';
  try { indexText = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'); } catch (e) {}
  try { autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8'); } catch (e) {}
  const missing = [];
  if (!/queueAttackCounterHandoff/.test(gameStateText) || !/hasAttackCounterHandoffQueued/.test(gameStateText)) missing.push('de-duplicated attack Counter handoff helper');
  if (!/advanceAttackTimingAfterWhenAttackingIfReady/.test(gameStateText)) missing.push('WHEN_ATTACKING pending-window completion fallback');
  if (!/_round22dvAttackHandoff/.test(gameStateText)) missing.push('Round 22DV marked System handoff');
  if (!/pendingWindowForMe/.test(indexText) || !/targetingMode === 'SERVER_TARGET'/.test(indexText) || !/belongs to the other[\s\S]{0,30}player/.test(indexText)) missing.push('front-end stale SERVER_TARGET cleanup while waiting for opponent');
  if (!/Round 22DV attack pending-target deadlock guardrails/.test(autoText)) missing.push('auto-mechanics Round 22DV guardrails');
  if (missing.length > 0) {
    report.semanticIssues.attackPendingTargetDeadlockLeak.push({
      id: 'ENGINE-ATTACK-PENDING-TARGET-DEADLOCK',
      name: 'Attack pending target / Counter handoff deadlock guard',
      reason: `Round 22DV requires attack [When Attacking] target windows to complete before Counter handoff and stale target UI to close; missing: ${missing.join(', ')}.`
    });
  }
}

function auditHandSpecialDigivolvePermissionLeak(cards, issues) {
  const ids = new Map(cards.map(card => [card.id, card]));
  const specialHand = [
    { id: 'BT2-111', base: 'Impmon', cost: 4, trash: 10 },
    { id: 'BT5-067', base: 'Keramon', cost: 4 },
    { id: 'BT5-014', base: 'Shoutmon', cost: 4 },
    { id: 'BT7-017', base: 'Machinedramon', cost: 1 },
    { id: 'BT7-111', base: 'Lucemon', cost: 7 }
  ];
  for (const spec of specialHand) {
    const card = ids.get(spec.id);
    if (!card) continue;
    const text = [card.mainEffect || '', card.effectText || ''].join(' ');
    if (!/can\s+digivolve\s+into\s+this\s+card\s+in\s+your\s+hand\s+for\s+a\s+memory\s+cost/i.test(text)) continue;
    const specials = Array.isArray(card.specialDigivolutionConditions) ? card.specialDigivolutionConditions : [];
    const hasSpecial = specials.some(cond => String(cond.type || '').toUpperCase() === 'DIGIVOLVE'
      && Number(cond.cost) === spec.cost
      && (cond.clauses || []).some(clause => String(clause.name || '').toLowerCase() === spec.base.toLowerCase()));
    if (!hasSpecial) {
      issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({
        id: card.id, name: card.name,
        reason: `Printed hand special digivolution from [${spec.base}] for cost ${spec.cost} must be encoded as specialDigivolutionConditions.`
      });
    }
    if (spec.trash) {
      const hasTrashCondition = specials.some(cond => cond.condition && String(cond.condition.type || '').toUpperCase() === 'TRASH_COUNT' && Number(cond.condition.value) === spec.trash);
      if (!hasTrashCondition) issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({ id: card.id, name: card.name, reason: 'Trash-count gate for hand special digivolution is missing.' });
    }
    const fakeMechs = (card.mechanics || []).filter(mech => ['MAIN', 'WHEN_DIGIVOLVING'].includes(mech.trigger) && /WARP_EVOLVE|PAY_MEMORY/.test(JSON.stringify(mech || {})) && new RegExp(spec.base, 'i').test(JSON.stringify(mech || {})));
    if (fakeMechs.length) {
      issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({
        id: card.id, name: card.name,
        reason: 'Printed hand special digivolution permission must not be an activated MAIN/WHEN_DIGIVOLVING WARP_EVOLVE/PAY_MEMORY mechanic.'
      });
    }
  }

  const hybridIds = ['BT7-011','BT7-022','BT7-036','BT7-047','BT7-073','BT12-013'];
  for (const id of hybridIds) {
    const card = ids.get(id);
    if (!card) continue;
    const text = [card.mainEffect || '', card.effectText || ''].join(' ');
    if (!/digivolve\s+this\s+card\s+from\s+your\s+hand\s+onto\s+one\s+of\s+your.+tamers.+for\s+a\s+memory\s+cost/i.test(text)) continue;
    const fake = (card.mechanics || []).some(mech => mech.trigger === 'MAIN' && /DNA_DIGIVOLVE|WARP_EVOLVE|PAY_MEMORY/.test(JSON.stringify(mech || {})));
    if (fake) {
      issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({
        id: card.id, name: card.name,
        reason: 'Hybrid/Tamer hand digivolution permission must be handled by normal hand digivolve rules, not a field MAIN/DNA_DIGIVOLVE action.'
      });
    }
  }

  const st703 = ids.get('ST7-03');
  if (st703) {
    const blob = JSON.stringify(st703.mechanics || []);
    if (/"trigger"\s*:\s*"WHEN_DIGIVOLVING"[\s\S]{0,240}"type"\s*:\s*"REDUCE_COST"/.test(blob)) {
      issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({ id: 'ST7-03', name: st703.name, reason: 'ST7-03 effect digivolve permission must not leave a stale WHEN_DIGIVOLVING REDUCE_COST mechanic.' });
    }
    if (/"trigger"\s*:\s*"ON_DELETION"[\s\S]{0,160}"type"\s*:\s*"DRAW"/.test(blob)) {
      issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({ id: 'ST7-03', name: st703.name, reason: 'ST7-03 inherited Draw 1 source effect must not be encoded as this card\'s On Deletion.' });
    }
    const ok = (st703.mechanics || []).some(mech => mech.trigger === 'OPPONENT_DIGIMON_DELETED' && mech.isInherited === true && /"type"\s*:\s*"DRAW"/.test(JSON.stringify(mech || {})));
    if (!ok) issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({ id: 'ST7-03', name: st703.name, reason: 'ST7-03 source effect should be inherited OPPONENT_DIGIMON_DELETED -> DRAW 1.' });
  }

  const gameState = getGameStateTextForAudit();
  if (!/parseTextSpecialDigivolutionConditions/.test(gameState) || !/memory\\s\+cost\\s\+of/.test(gameState)) {
    issues.semanticIssues.handSpecialDigivolvePermissionLeak.push({ id: 'RUNTIME', name: 'Hand special digivolve runtime', reason: 'game-state.js should parse hand special digivolution permissions and memory-cost text.' });
  }
}


function auditStartTurnOnPlayBleedLeak(allCards, report) {
    // Round 22EC: classic memory Tamers have separate printed effects:
    // [Start of Your Turn] memory set, [On Play] search/reveal, and
    // [Security] play this card. The search/reveal/recovery branch must not
    // bleed into START_OF_TURN or it will fire every turn and miss the memory set.
    const expected = {
        'BT3-093': {
            name: 'Davis Motomiya',
            onPlayMust: ['REVEAL_AND_SELECT', 'RETURN_REVEALED_REST_TO_DECK_BOTTOM'],
            onPlayMustNot: ['SET_MEMORY'],
            startMustNot: ['REVEAL_AND_SELECT', 'RETURN_REVEALED_REST_TO_DECK_BOTTOM'],
            custom(card, issues) {
                const onPlay = (card.mechanics || []).find(m => String(m.trigger || '').toUpperCase() === 'ON_PLAY');
                const reveal = (onPlay?.actions || []).find(a => a.type === 'REVEAL_AND_SELECT');
                const selections = Array.isArray(reveal?.selections) ? reveal.selections : [];
                const colors = selections.map(sel => String(sel?.target?.color || '').toLowerCase());
                if (!colors.includes('blue') || !colors.includes('green')) issues.push('BT3-093 On Play must select both 1 blue Digimon and 1 green Digimon.');
            }
        },
        'BT7-090': {
            name: 'Kota Domoto',
            onPlayMust: ['REVEAL_AND_SELECT', 'RETURN_REVEALED_REST_TO_DECK_BOTTOM'],
            onPlayMustNot: ['SET_MEMORY'],
            startMustNot: ['REVEAL_AND_SELECT', 'RETURN_REVEALED_REST_TO_DECK_BOTTOM'],
            custom(card, issues) {
                const onPlay = (card.mechanics || []).find(m => String(m.trigger || '').toUpperCase() === 'ON_PLAY');
                const reveal = (onPlay?.actions || []).find(a => a.type === 'REVEAL_AND_SELECT');
                const targetBlob = JSON.stringify(reveal?.target || reveal?.selections || {});
                if (!/X Antibody/i.test(targetBlob)) issues.push('BT7-090 On Play must search for an X Antibody trait card.');
                if (/"cardType"\s*:\s*"option"/i.test(targetBlob)) issues.push('BT7-090 On Play must not be restricted to Option cards.');
            }
        },
        'BT1-087': {
            name: 'T.K. Takaishi',
            onPlayMust: ['SEARCH_SECURITY_TO_HAND'],
            onPlayMustNot: ['SET_MEMORY', 'RECOVERY_DECK'],
            startMustNot: ['SEARCH_SECURITY_TO_HAND', 'RECOVERY_DECK'],
            custom(card, issues) {
                const onPlay = (card.mechanics || []).find(m => String(m.trigger || '').toUpperCase() === 'ON_PLAY');
                const search = (onPlay?.actions || []).find(a => a.type === 'SEARCH_SECURITY_TO_HAND');
                if (!search) return;
                if (!/yellow/i.test(String(search.thenRecoveryIfColor || '') + JSON.stringify(search.thenRecoveryTarget || {}))) {
                    issues.push('BT1-087 On Play recovery must be conditional on the chosen security card being yellow.');
                }
                if (search.thenRecovery === true) issues.push('BT1-087 On Play must not recover unconditionally.');
            }
        }
    };
    for (const [id, rule] of Object.entries(expected)) {
        const card = allCards.find(c => String(c.id || '') === id);
        const issues = [];
        if (!card) {
            report.semanticIssues.startTurnOnPlayBleedLeak.push({ id, name: rule.name, reason: 'Card missing for Round 22EC guard.' });
            continue;
        }
        const mechs = Array.isArray(card.mechanics) ? card.mechanics : [];
        const start = mechs.find(m => String(m.trigger || '').toUpperCase() === 'START_OF_TURN');
        const onPlay = mechs.find(m => String(m.trigger || '').toUpperCase() === 'ON_PLAY');
        const security = mechs.find(m => String(m.trigger || '').toUpperCase() === 'SECURITY');
        const startTypes = (start?.actions || []).map(a => String(a?.type || '').toUpperCase());
        const onPlayTypes = (onPlay?.actions || []).map(a => String(a?.type || '').toUpperCase());
        const securityTypes = (security?.actions || []).map(a => String(a?.type || '').toUpperCase());
        if (!start || !startTypes.includes('SET_MEMORY')) issues.push(`${id} [Start of Your Turn] must contain SET_MEMORY.`);
        if (!start?.condition || String(start.condition.type || '').toUpperCase() !== 'MEMORY_COUNT' || String(start.condition.operator || '') !== '<=' || Number(start.condition.value) !== 2) {
            issues.push(`${id} [Start of Your Turn] memory setter must be gated by MEMORY_COUNT <= 2.`);
        }
        for (const t of rule.startMustNot || []) if (startTypes.includes(t)) issues.push(`${id} [On Play] action ${t} leaked into START_OF_TURN.`);
        if (!onPlay) issues.push(`${id} missing ON_PLAY mechanic.`);
        for (const t of rule.onPlayMust || []) if (!onPlayTypes.includes(t)) issues.push(`${id} ON_PLAY missing ${t}.`);
        for (const t of rule.onPlayMustNot || []) if (onPlayTypes.includes(t)) issues.push(`${id} START_OF_TURN action ${t} leaked into ON_PLAY.`);
        if (!security || !securityTypes.includes('PLAY_FROM_SECURITY')) issues.push(`${id} [Security] must play this Tamer with PLAY_FROM_SECURITY, letting ON_PLAY trigger after play.`);
        if (typeof rule.custom === 'function') rule.custom(card, issues);
        if (issues.length) {
            report.semanticIssues.startTurnOnPlayBleedLeak.push({
                id,
                name: card.name || rule.name,
                reason: 'Round 22EC requires printed Start-of-Turn, On-Play, and Security branches to stay separate for legacy memory Tamers.',
                issues
            });
        }
    }
    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
    if (!/thenRecoveryIfColor/.test(gsText) || !/shouldRecoverAfterSecuritySearch/.test(gsText)) {
        report.semanticIssues.startTurnOnPlayBleedLeak.push({ id: 'RUNTIME', name: 'SEARCH_SECURITY_TO_HAND', reason: 'Runtime must support conditional recovery after security search for T.K. Takaishi-style effects.' });
    }
    if (!/Round 22EC legacy memory Tamer/.test(autoText)) {
        report.semanticIssues.startTurnOnPlayBleedLeak.push({ id: 'AUTO-GUARDRAIL', name: 'auto-mechanics.js', reason: 'auto-mechanics should document Round 22EC legacy memory Tamer guardrails.' });
    }
}



function auditSuspendTamerCostTargetLeak(allCards, report) {
    // Round 22EF: Digimon attack/digivolve triggers that say "By suspending 1
    // of your yellow/red Tamers" must ask before payment and pay by suspending
    // an eligible Tamer, not by defaulting SUSPEND cost to the source Digimon.
    const expected = {
        'BT17-029': [{ trigger: 'WHEN_ATTACKING', colors: ['Yellow'] }],
        'BT17-033': [{ trigger: 'WHEN_ATTACKING', colors: ['Yellow'] }],
        'BT17-037': [{ trigger: 'WHEN_DIGIVOLVING', colors: ['Yellow'] }, { trigger: 'WHEN_ATTACKING', colors: ['Yellow'] }],
        'BT21-045': [{ trigger: 'WHEN_ATTACKING', colors: ['Yellow', 'Red'] }]
    };
    const issues = [];
    for (const [id, rules] of Object.entries(expected)) {
        const card = allCards.find(c => String(c.id || '') === id);
        if (!card) {
            issues.push(`${id}: card missing.`);
            continue;
        }
        const mechs = Array.isArray(card.mechanics) ? card.mechanics : [];
        for (const rule of rules) {
            const mech = mechs.find(m => String(m.trigger || '').toUpperCase() === rule.trigger && String(m.cost?.type || '').toUpperCase() === 'SUSPEND');
            if (!mech) {
                issues.push(`${id}: missing ${rule.trigger} SUSPEND-cost mechanic.`);
                continue;
            }
            const target = mech.cost?.target || {};
            const blob = JSON.stringify(mech || {});
            if (!(mech.optional === true || mech.optionalProcessing === true || mech.may === true || mech.requiresActivationChoice === true)) {
                issues.push(`${id}: printed "By suspending" trigger must be optional/confirmed before cost payment.`);
            }
            if (String(target.cardType || '').toLowerCase() !== 'tamer') {
                issues.push(`${id}: SUSPEND cost must target a Tamer, not default to the source Digimon.`);
            }
            const targetColors = [];
            if (target.color) targetColors.push(...String(target.color).split(/\s+or\s+|[,/]/i).map(x => x.trim()).filter(Boolean));
            if (Array.isArray(target.colorAny)) targetColors.push(...target.colorAny);
            const have = targetColors.map(x => String(x || '').toLowerCase());
            for (const color of rule.colors) {
                if (!have.includes(color.toLowerCase())) issues.push(`${id}: SUSPEND Tamer cost missing ${color} color selector.`);
            }
            if (/"target"\s*:\s*null/.test(blob) || /"position"\s*:\s*"own"/.test(JSON.stringify(mech.cost || {})) && !target.cardType) {
                issues.push(`${id}: SUSPEND cost still has legacy targetless own-position encoding.`);
            }
        }
    }
    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/Round 22EF: respect explicit suspend-cost targets/.test(gsText) || !/explicitSelf/.test(gsText) || !/targetSpec/.test(gsText)) {
        issues.push('game-state.js must respect explicit SUSPEND cost targets before falling back to sourceCard/self costs.');
    }
    const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
    if (!/Round 22EF suspend-cost Tamer targeting/.test(autoText)) {
        issues.push('auto-mechanics.js should document Round 22EF suspend-cost Tamer targeting guardrails.');
    }
    if (issues.length) {
        report.semanticIssues.suspendTamerCostTargetLeak.push({
            id: 'ROUND_22EF',
            name: 'Suspend-cost Tamer targeting',
            reason: 'Printed Tamer-suspend costs must target eligible Tamers and remain optional, not try to suspend the source Digimon.',
            issues
        });
    }
}

function auditVioletInbootsTimingLeak(allCards, report) {
    // Round 22EE: EX11-068 Violet Inboots has three distinct printed branches:
    // [Start of Your Turn] memory setter, [Your Turn] Ghost-attack suspend-cost
    // loot, and [Security] play this card. Draw/trash must not fire from start
    // timing or security checks.
    const card = allCards.find(c => String(c.id || '') === 'EX11-068');
    const issues = [];
    if (!card) {
        report.semanticIssues.violetInbootsTimingLeak.push({ id: 'EX11-068', name: 'Violet Inboots', reason: 'Card missing for Round 22EE guard.' });
        return;
    }
    const mechs = Array.isArray(card.mechanics) ? card.mechanics : [];
    const byTrigger = trig => mechs.find(m => String(m.trigger || '').toUpperCase() === trig);
    const types = mech => (mech?.actions || []).map(a => String(a?.type || '').toUpperCase());
    const start = byTrigger('START_OF_TURN');
    const attack = byTrigger('WHEN_ATTACKING') || byTrigger('YOUR_TURN');
    const security = byTrigger('SECURITY');
    const startTypes = types(start);
    const attackTypes = types(attack);
    const securityTypes = types(security);
    const startBlob = JSON.stringify(start || {});
    const attackBlob = JSON.stringify(attack || {});
    const securityBlob = JSON.stringify(security || {});
    if (!start || !startTypes.includes('SET_MEMORY')) issues.push('EX11-068 [Start of Your Turn] must set memory to 3.');
    if (!start?.condition || String(start.condition.type || '').toUpperCase() !== 'MEMORY_COUNT' || String(start.condition.operator || '') !== '<=' || Number(start.condition.value) !== 2) {
        issues.push('EX11-068 Start memory setter must be gated by MEMORY_COUNT <= 2.');
    }
    if (/DRAW|TRASH_HAND|REVEAL_AND_SELECT/.test(startBlob)) issues.push('EX11-068 Ghost attack loot must not leak into START_OF_TURN.');
    if (!attack || !attackTypes.includes('DRAW') || !attackTypes.includes('TRASH_HAND')) issues.push('EX11-068 Ghost attack trigger must draw 1 and trash 1 from hand.');
    if (!/EVENT_CONTEXT/.test(attackBlob) || !/attacker/.test(attackBlob) || !/Ghost/.test(attackBlob)) issues.push('EX11-068 attack trigger must be bound to EVENT_CONTEXT.attacker with [Ghost] trait.');
    if (!/SUSPEND/.test(attackBlob) || !/(optionalProcessing|requiredsActivationChoice|requiresActivationChoice|"optional"\s*:\s*true)/.test(attackBlob)) issues.push('EX11-068 attack trigger must ask before paying the Tamer suspend cost.');
    if (!security || !securityTypes.includes('PLAY_FROM_SECURITY')) issues.push('EX11-068 Security effect must PLAY_FROM_SECURITY.');
    if (/DRAW|TRASH_HAND|SET_MEMORY/.test(securityBlob)) issues.push('EX11-068 Security effect must not directly draw/trash or set memory.');
    const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
    if (!/Round 22EE Violet Inboots/.test(autoText)) issues.push('auto-mechanics.js should document Round 22EE Violet Inboots timing guardrails.');
    if (issues.length) {
        report.semanticIssues.violetInbootsTimingLeak.push({
            id: 'EX11-068',
            name: card.name || 'Violet Inboots',
            reason: 'Round 22EE requires Violet Inboots Start, attack, and Security branches to stay separated.',
            issues
        });
    }
}

function auditOptionalTriggerConfirmLeak(allCards, report) {
    // Round 22ED: official optional processing condition. Trigger timing still
    // happens, but printed "By X, Y" / may-style effects must ask the player
    // before paying the cost; confirmed effects then resolve cost + payoff.
    const card = allCards.find(c => String(c.id || '') === 'BT11-012');
    const issues = [];
    if (!card) {
        report.semanticIssues.optionalTriggerConfirmLeak.push({ id: 'BT11-012', name: 'Shoutmon X3', reason: 'Card missing for Round 22ED optional trigger guard.' });
        return;
    }
    const mechs = Array.isArray(card.mechanics) ? card.mechanics : [];
    const start = mechs.find(m => String(m.trigger || '').toUpperCase() === 'START_OF_TURN');
    const onPlay = mechs.find(m => String(m.trigger || '').toUpperCase() === 'ON_PLAY');
    const startBlob = JSON.stringify(start || {});
    const onPlayBlob = JSON.stringify(onPlay || {});
    if (!start) issues.push('BT11-012 missing START_OF_TURN mechanic.');
    if (!start?.optional && !start?.optionalProcessing && !start?.may) issues.push('BT11-012 Start-of-Turn “By deleting this Digimon” must be marked optional/optionalProcessing.');
    if (!/DELETE_OWN_DIGIMON_COST/.test(startBlob) || !/"self"\s*:\s*true/.test(startBlob)) issues.push('BT11-012 Start-of-Turn must pay DELETE_OWN_DIGIMON_COST self:true.');
    if (!/GAIN_MEMORY/.test(startBlob) || !/"amount"\s*:\s*1/.test(startBlob)) issues.push('BT11-012 Start-of-Turn payoff must gain exactly 1 memory.');
    if (/REVEAL_AND_SELECT|RETURN_REVEALED_REST_TO_DECK_BOTTOM/.test(startBlob)) issues.push('BT11-012 On Play reveal/search leaked into START_OF_TURN.');
    if (!onPlay || !/REVEAL_AND_SELECT/.test(onPlayBlob) || !/RETURN_REVEALED_REST_TO_DECK_BOTTOM/.test(onPlayBlob)) issues.push('BT11-012 ON_PLAY must keep reveal 3 / add Xros Heart or Blue Flare / bottom rest.');
    if (/"color"\s*:\s*"blue"/i.test(onPlayBlob)) issues.push('BT11-012 ON_PLAY search is trait-based; it must not be restricted to blue color.');

    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
    if (!/isOptionalStructuredEffect/.test(gsText) || !/openOptionalStructuredEffectChoice/.test(gsText) || !/OPTIONAL_EFFECT_CONFIRM/.test(gsText)) {
        issues.push('game-state.js must expose a generic optional structured trigger confirmation path.');
    }
    if (!/_optionalConfirmed/.test(gsText) || !/Keep STRUCTURED_ACTION type/.test(gsText)) {
        issues.push('Confirmed optional structured effects must remain STRUCTURED_ACTION and carry _optionalConfirmed before cost payment.');
    }
    if (!/pendingStartPhase/.test(gsText) || !/continuePendingStartPhase/.test(gsText)) {
        issues.push('Start-of-Turn optional windows must pause Unsuspend/Draw/Breeding until the choice and follow-up effects finish.');
    }
    if (!/Round 22ED optional Start-of-Turn/.test(autoText)) {
        issues.push('auto-mechanics.js should document Round 22ED optional Start-of-Turn guardrails.');
    }
    if (issues.length) {
        report.semanticIssues.optionalTriggerConfirmLeak.push({
            id: 'BT11-012',
            name: card.name || 'Shoutmon X3',
            reason: 'Round 22ED requires official optional processing for Start-of-Turn “By X, Y” effects and separation from On Play search text.',
            issues
        });
    }
}



function auditBt25057FinalJudgmentErrataDurationLeak(cards, issues) {
    const card = cards.find(c => c.id === 'BT25-057');
    if (!card) {
        issues.semanticIssues.bt25057FinalJudgmentErrataDurationLeak.push({
            id: 'BT25-057',
            name: 'Monarchlizamon / Final Judgment',
            reason: 'Official May 15, 2026 errata target is missing from local card pool.'
        });
        return;
    }
    const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || '', card.officialMainText || ''].join(' ');
    const mainMechs = (Array.isArray(card.mechanics) ? card.mechanics : [])
        .filter(m => String(m.trigger || '').toUpperCase() === 'MAIN' && m.dualOptionSide === true);
    const blob = JSON.stringify(mainMechs);
    if (/until your opponent['’]s turn ends/i.test(text) || /OPPONENTS_END_OF_TURN|OPPONENT_END_OF_TURN|END_OF_OPPONENTS_TURN/.test(blob)) {
        issues.semanticIssues.bt25057FinalJudgmentErrataDurationLeak.push({
            id: card.id,
            name: card.name,
            reason: 'Official May 15, 2026 errata changes Final Judgment buffs from “until your opponent’s turn ends” to “for the turn”; mechanics must expire at END_OF_TURN.'
        });
    }
    if (!/for the turn/i.test(text)) {
        issues.semanticIssues.bt25057FinalJudgmentErrataDurationLeak.push({
            id: card.id,
            name: card.name,
            reason: 'BT25-057 local rules text must preserve the official errata wording “for the turn”.'
        });
    }
    const buffActions = mainMechs.flatMap(m => Array.isArray(m.actions) ? m.actions : [])
        .filter(a => ['GRANT_KEYWORD', 'DP_MOD'].includes(String(a?.type || '').toUpperCase()));
    if (buffActions.length < 3 || !buffActions.every(a => String(a.duration || a.buff?.duration || '').toUpperCase() === 'END_OF_TURN')) {
        issues.semanticIssues.bt25057FinalJudgmentErrataDurationLeak.push({
            id: card.id,
            name: card.name,
            reason: 'Final Judgment Rush/Security A.+1/+5000 DP actions must all use END_OF_TURN duration after errata.'
        });
    }
}


function auditSt1006MastemonErrataSecuritySearchLeak(cards, issues) {
    const card = cards.find(c => c.id === 'ST10-06');
    const bucket = issues.semanticIssues.st1006MastemonErrataSecuritySearchLeak;
    if (!card) {
        bucket.push({ id: 'ST10-06', name: 'Mastemon', reason: 'Official errata target is missing from local card pool.' });
        return;
    }
    const text = [card.mainEffect || '', card.effectText || '', card.officialMainText || ''].join(' ');
    const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
    const whenDigivolving = mechanics.filter(m => String(m.trigger || '').toUpperCase() === 'WHEN_DIGIVOLVING');
    const blob = JSON.stringify(whenDigivolving);
    const hasTrashToSecurity = /PLACE_SECURITY_FROM_TRASH/.test(blob);
    const hasOldPlaceSource = whenDigivolving.some(m => (m.actions || []).some(a => String(a?.type || '').toUpperCase() === 'PLACE_SOURCE' && /security/i.test(String(a.zone || a.to || ''))));
    const dnaBranch = whenDigivolving.find(m => /DIGIVOLVE_CONTEXT/.test(JSON.stringify(m.condition || {})) && /"dna"\s*:\s*true/.test(JSON.stringify(m.condition || {})));
    const dnaBlob = JSON.stringify(dnaBranch || {});
    const hasSecurityReveal = /REVEAL_AND_SELECT/.test(dnaBlob) && /"(?:from|zone)"\s*:\s*"security"/.test(dnaBlob);
    const hasRevealedPlay = /PLAY_FROM_HAND_OR_TRASH|PLAY_FROM_SECURITY|PLAY_FROM_HAND/.test(dnaBlob) && /"from"\s*:\s*"revealed"/.test(dnaBlob);
    const hasSecurityShuffleRest = /RETURN_REVEALED_REST_TO_SECURITY_SHUFFLE/.test(dnaBlob);
    const stillOldWording = /you may search your security stack for 1 level 5 or lower Digimon card and play it/i.test(text);
    const issuesFound = [];
    if (stillOldWording || !/search your security stack, and you may play 1 level 5 or lower Digimon card among it/i.test(text)) issuesFound.push('Local ST10-06 text should preserve the official errata search wording.');
    if (hasOldPlaceSource) issuesFound.push('Trash-to-security placement must not be encoded as PLACE_SOURCE zone:security.');
    if (!hasTrashToSecurity) issuesFound.push('Missing PLACE_SECURITY_FROM_TRASH for the first When Digivolving clause.');
    if (!dnaBranch) issuesFound.push('Missing DNA-only When Digivolving security-search branch gated by DIGIVOLVE_CONTEXT dna:true.');
    if (dnaBranch && !hasSecurityReveal) issuesFound.push('DNA branch must reveal/search from security, not hand/trash.');
    if (dnaBranch && !hasRevealedPlay) issuesFound.push('DNA branch must play the selected card from the revealed security buffer.');
    if (dnaBranch && !hasSecurityShuffleRest) issuesFound.push('DNA branch must return the unplayed security cards and shuffle security.');

    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/placeSecurityFromTrash/.test(gsText) || !/case 'PLACE_SECURITY_FROM_TRASH'/.test(gsText)) issuesFound.push('Runtime must support PLACE_SECURITY_FROM_TRASH as a real trash→security move.');
    if (!/RETURN_REVEALED_REST_TO_SECURITY_SHUFFLE/.test(gsText) || !/shouldShuffleSecurity/.test(gsText)) issuesFound.push('Runtime must support returning security-search rest to security and shuffling it.');

    if (issuesFound.length) {
        bucket.push({ id: card.id, name: card.name, reason: 'ST10-06 official errata requires trash→security placement and DNA-only security search/play semantics.', issues: issuesFound });
    }
}



function auditBt4105TacticalRetreatSecurityMoveLeak(cards, issues) {
    const bucket = issues.semanticIssues.bt4105TacticalRetreatSecurityMoveLeak;
    const card = cards.find(c => c.id === 'BT4-105');
    const found = [];
    if (!card) {
        bucket.push({ id: 'BT4-105', name: 'Tactical Retreat!', reason: 'BT4-105 is missing from local card pool.' });
        return;
    }
    const main = (Array.isArray(card.mechanics) ? card.mechanics : []).find(m => String(m.trigger || '').toUpperCase() === 'MAIN');
    const actions = Array.isArray(main?.actions) ? main.actions : [];
    const blob = JSON.stringify(actions);
    const hasSendToSecurity = actions.some(a => String(a?.type || '').toUpperCase() === 'SEND_TO_SECURITY' && String(a?.target?.owner || '') === 'own' && /digimon/i.test(String(a?.target?.cardType || '')));
    const hasPlaceSourceSecurity = actions.some(a => String(a?.type || '').toUpperCase() === 'PLACE_SOURCE' && /security/i.test(String(a?.zone || a?.to || a?.destination || '')));
    if (!hasSendToSecurity) found.push('Main effect must encode the selected battle-area Digimon as SEND_TO_SECURITY.');
    if (hasPlaceSourceSecurity || /PLACE_SOURCE/.test(blob) && /security/i.test(blob)) found.push('Main effect must not use PLACE_SOURCE zone:security; Tactical Retreat moves the Digimon, it does not place it as a source.');
    if (!/top/i.test(String(actions[0]?.position || actions[0]?.to || ''))) found.push('Main effect should place the Digimon on top of security.');

    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    if (!/Round 22EJ/.test(gsText) || !/actualSecurityAdded/.test(gsText)) found.push('Runtime must distinguish actual security addition from token/Digi-Egg replacement moves.');
    if (!/isDigiEggMovingToSecurity/.test(gsText) || !/eggDeck\.unshift/.test(gsText)) found.push('Runtime must route Digi-Egg cards that would move to security to the bottom of the Digi-Egg deck.');
    if (!/removeTokenFromGame/.test(gsText) || !/actualDestination = 'removedFromGame'/.test(gsText)) found.push('Runtime must route tokens that would move to security to the token pile/removed-from-game zone without security-added triggers.');

    const metaText = fs.readFileSync(path.join(__dirname, 'meta-match-sim.js'), 'utf8');
    if (!/Round 22EJ BT4-105 Tactical Retreat send-to-security guard/.test(metaText)) found.push('Meta regression must cover Tactical Retreat normal Digimon, token, and Digi-Egg replacement cases.');

    if (found.length) {
        bucket.push({
            id: card.id,
            name: card.name,
            reason: 'Official BT4-105 Q&A requires Tactical Retreat to move a battle-area Digimon to security, with Token/Digi-Egg replacement behavior; local encoding/runtime must not treat it as PLACE_SOURCE.',
            issues: found
        });
    }
}

function auditEffectAttackDuringExistingAttackLeak(cards, issues) {
    const bucket = issues.semanticIssues.effectAttackDuringExistingAttackLeak;
    const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
    const found = [];
    if (!/isAttackInProgress\s*\(\)/.test(gsText) || !/rejectNestedAttackDeclaration\s*\(/.test(gsText)) {
        found.push('Runtime must expose a central guard for “a new attack declaration can’t be made during an existing attack.”');
    }
    for (const fn of ['requestAttack', 'requestAttackPlayer', 'requestAttackDigimon', 'startAttackWithoutSuspending', 'startForcedAttackWithLegalTarget']) {
        const re = new RegExp(fn + '\\s*\\([^)]*\\)\\s*{[\\s\\S]{0,300}rejectNestedAttackDeclaration');
        if (!re.test(gsText)) found.push(`${fn} must reject nested effect-created attack declarations while counterTiming.pendingAttack is active.`);
    }
    for (const fn of ['getAttackAnyTargetOptions', 'getAttackDigimonTargetOptions', 'getForcedAttackTargetOptions', 'getBlitzAttackTargetOptions']) {
        const re = new RegExp(fn + '\\s*\\([^)]*\\)\\s*{[\\s\\S]{0,220}isAttackInProgress\\s*\\(');
        if (!re.test(gsText)) found.push(`${fn} must return no legal attack options during an existing attack so the UI does not open a stale attack choice.`);
    }
    const dan = cards.find(c => c.id === 'BT25-086');
    const danBlob = JSON.stringify(dan?.mechanics || []);
    if (!dan || !/REQUEST_ATTACK_PLAYER/.test(danBlob) || !/END_OF_TURN/.test(danBlob)) {
        found.push('BT25-086 Dan Yuki should remain covered because its official Q&A is the live nested-attack case.');
    }
    if (found.length) {
        bucket.push({
            id: 'RUNTIME',
            name: 'Effect-created attack declarations',
            reason: 'Official BT25-086 Q6408 says a new attack declaration cannot be made during an attack; effect-created attack requests must fizzle instead of opening choices or replacing the active attack.',
            issues: found
        });
    }
}

function auditCards() {
    console.log("🕵️ 启动 DTCG 赛博质检员 (Mechanics Auditor)...");

    // 1. 读取数据并备份
    let allCards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
    fs.writeFileSync(AUDIT_BACKUP, JSON.stringify(allCards, null, 2));
    console.log(`✅ 已备份当前数据至 → ${AUDIT_BACKUP}`);

    const targetId = process.argv[2];
        if (targetId) {
        allCards = allCards.filter(card => card.id === targetId);
        console.log(`🎯 只检查目标卡牌：${targetId}`);
    }

    let badCount = 0;

    const report = {
        missingMechanics: [],
        invalidTrigger: [],
        invalidAction: [],
        invalidCondition: [],
        badRevealReturn: [],
        stunTooBroad: [],
        semanticKeywordErrors: [],
        // Round 14A: syntactically valid but official-semantics suspicious.
        semanticIssues: {
            timingTraitPollution: [],
            staticLikeAction: [],
            dedigiAsDelete: [],
            keywordAsDpMod: [],
            badCostType: [],
            effectLockOrImmunityScope: [],
            revealSelectedConsumerLeak: [],
            nestedTargetCondition: [],
            impossibleSecurityRemovedCondition: [],
            printedKeywordOnlyMechanic: [],
            metadataTraitTextPollution: [],
            mechanicsTraitNamePollution: [],
            mechanicsTraitColorPollution: [],
            hasSpecificCardTraitConditionPollution: [],
            compoundTraitStringLeak: [],
            colorTraitSelectorLeak: [],
            compoundColorStringLeak: [],
            compoundCardTypeStringLeak: [],
            uniqueEmblemDelayTriggerLeak: [],
            optionUseCostConditionLeak: [],
            tamerSuspendedEventBindingLeak: [],
            playedByThisEffectKeywordBuffLeak: [],
            handCountAsMemoryCountLeak: [],
            multicolorTraitConditionLeak: [],
            noSourceTraitConditionLeak: [],
            noCardsUnderTraitConditionLeak: [],
            grantedSuspendTriggerKeywordLeak: [],
            grantedOnDeletionTriggerKeywordLeak: [],
            grantedEventTextKeywordLeak: [],
            grantedWhenAttackingTriggerKeywordLeak: [],
            grantedEndOfAttackTriggerKeywordLeak: [],
            attachEndAttackOnDeletionTimingLeak: [],
            grantedEndOfTurnDeletionKeywordLeak: [],
            activatePrintedTriggerKeywordLeak: [],
            mayAttackKeywordRequestLeak: [],
            dualOptionSideMissing: [],
            dualGenericPlayLeak: [],
            dualUngatedOptionSideLeak: [],
            dualOptionInfoScopeLeak: [],
            dualFieldOptionReferenceLeak: [],
            dualArtsDigivolveRuntimeLeak: [],
            memoryDrawOrderLeak: [],
            piercingImmediateProcessingLeak: [],
            returnToEggDeckCostLeak: [],
            breedingScopeLeak: [],
            playTokenAmountRuntimeLeak: [],
            tokenAsNormalPlayLeak: [],
            staticTextScopeLeak: [],
            selfSourceColorStaticConditionLeak: [],
            placedCardLevelCostBindingLeak: [],
            faceUpSecurityStaticClauseLeak: [],
            tokenFieldRuleLeak: [],
            tokenOfficial20260508RuntimeLeak: [],
            tokenControllerOwnerRuntimeLeak: [],
            officialTokenCardPoolCoverageLeak: [],
            officialTokenImagePullerLeak: [],
            officialNamedTokenAssetCoverageLeak: [],
            startTurnOnPlayBleedLeak: [],
            optionalTriggerConfirmLeak: [],
            violetInbootsTimingLeak: [],
            suspendTamerCostTargetLeak: [],
            bt25057FinalJudgmentErrataDurationLeak: [],
            st1006MastemonErrataSecuritySearchLeak: [],
            effectAttackDuringExistingAttackLeak: [],
            bt4105TacticalRetreatSecurityMoveLeak: [],
            officialAd01ColorMetadataLeak: [],
            staticWhileHaveZoneLeak: [],
            selfTargetTraitLeak: [],
            delayedActionConditionLeak: [],
            sourceCountHostScopeLeak: [],
            cantSuspendEncodingLeak: [],
            digiXrosMaterialStackLeak: [],
            playFromSourceTotalCostLeak: [],
            playFromSourceHostSelectorLeak: [],
            aeroVeedramonZeroCostTrashLeak: [],
            dpCheckOwnerTargetScopeLeak: [],
            dynamicTotalPlayCostSourceBonusLeak: [],
            dynamicLevelMaximumTargetLeak: [],
            amphimonRb1UnderCardCostLeak: [],
            amphimonLmUnderCardCostLeak: [],
            teslaJellymonEndAttackCostLeak: [],
            simpleEndAttackTimingLeak: [],
            endAttackSelfLeaveTimingLeak: [],
            inheritedEndAttackTimingLeak: [],
            pulsemonInheritedEndAttackSecurityCostLeak: [],
            herculesKabuterimonEndAttackTwicePerTurnLeak: [],
            blackRapidmonEndAttackDedigivolveLeak: [],
            magnadramonBt9043EndAttackSecurityToHandCostLeak: [],
            glowingDawnInheritedEndAttackTamerSourceCostLeak: [],
            megadramonEx9064InheritedEndAttackUnsuspendCostLeak: [],
            sameLevelDeletedHandCostLeak: [],
            effectImmunityActivationLockLeak: [],
            dnaPostconditionLeak: [],
            totalDpSelectionLeak: [],
            totalPlayCostSelectionLeak: [],
            implicitSelfTargetMissingLeak: [],
            totalValueFeasibleTargetLeak: [],
            trashMoveAtomicityLeak: [],
            modalChoiceEncodingLeak: [],
            sameNameTamerRestrictionLeak: [],
            printedKeywordRebootMechanicLeak: [],
            allScopeCountOneLeak: [],
            verifiedMainEffectMissingLeak: [],
            sameTargetFollowupLeak: [],
            placeSourceSameTargetBuffLeak: [],
            playedByThisEffectFollowupLeak: [],
            suspendAnyIfOwnSuspendedLeak: [],
            deletedOwnByThisEffectLeak: [],
            notDeletedByThisEffectLeak: [],
            returnedByThisEffectLeak: [],
            trashedByThisEffectLeak: [],
            placedByThisEffectLeak: [],
            placedByThisEffectCountLeak: [],
            trashedByThisEffectCountLeak: [],
            deletedByThisEffectLevelCountLeak: [],
            addedToHandByThisEffectCountLeak: [],
            suspendedByThisEffectCountLeak: [],
            blockerWindowNoLegalBlockerLeak: [],
            patamonBt14033EncodingLeak: [],
            mulliganOrderLeak: [],
            mulliganRedrawProcedureLeak: [],
            counterBlastPermissionLeak: [],
            blastDnaEncodingLeak: [],
            effectDnaPrintedRequirementLeak: [],
            guardedActionNoOpSuccessLeak: [],
            officialReportTelemetryLeak: [],
            dualOptionSourceLinkScopeLeak: [],
            threeMusketeersOptionSourceCostAtomicityLeak: [],
            costSelectorSemanticLeak: [],
            effectDigivolveFixedCostLeak: [],
            handSpecialDigivolvePermissionLeak: [],
            reducedPlayCostEffectPlayLeak: [],
            tamerAutoAnimationTelemetryLeak: [],
            attackPendingTargetDeadlockLeak: [],
            bt25OfficialCardPoolCoverageLeak: [],
            bt25OfficialImagePullerLeak: [],
            discordDotenvConfigLeak: [],
            npmTestEntryPointLeak: [],
            fragmentRuntimeLeak: [],
            jammingOverprotectionLeak: [],
            decoyRuntimeLeak: [],
            retaliationKeywordEncodingLeak: [],
            armorPurgeInstanceIdLeak: [],
            barrierOptionalWindowLeak: [],
            partitionColorLevelRuntimeLeak: [],
            fortitudeTriggerRuntimeLeak: [],
            materialSaveOptionalRuntimeLeak: [],
            vortexOptionalTargetRuntimeLeak: [],
            unsuspendedDigimonConditionLeak: [],
            effectAttackBindingLeak: [],
            raidTargetLegalityLeak: [],
            cantBeAttackedRuntimeLeak: [],
            forcedAttackTargetLegalityLeak: [],
            blitzTimingRuntimeLeak: [],
            cantAttackDigimonTargetLeak: [],
            cantAttackOrBlockCantBlockLeak: [],
            cantAttackRestrictionEncodingLeak: [],
            cantBeBlockedKeywordLeak: [],
            cantUseOptionEncodingLeak: [],
            cantGainMemoryEncodingLeak: [],
            cantReduceCostEncodingLeak: [],
            cantPlayEncodingLeak: [],
            cantMoveEncodingLeak: [],
            cantDigivolveEncodingLeak: [],
            dpReductionImmunityEncodingLeak: [],
    cantBeDeletedEncodingLeak: [],
    cantBeReturnedEncodingLeak: [],
            sourceScopedOpponentEffectImmunityLeak: [],
            opponentEffectImmunityEncodingLeak: [],
            securityCheckAutoResolutionLeak: [],
            securityRemovedByEffectConditionLeak: [],
            staleTurnTransitionRuntimeLeak: [],
            liveBotSocketActionPathLeak: [],
            sourceOverflowDoubleChargeLeak: [],
            fieldOverflowBreedingAreaLeak: [],
            attackTimingSimultaneousPriorityLeak: [],
            ownerAnyConditionRuntimeLeak: [],
            explicitConditionRuntimeLeak: [],
            activationLockBracketClauseLeak: [],
            multiSecurityCheckFlowLeak: [],
            piercingSecurityContinuationLeak: [],
            securityCheckedSelfBindingLeak: [],
            battleDeletionThisBindingLeak: [],
            securityRemovedOwnerOpponentBindingLeak: [],
            oncePerTurnBindingFilterLeak: [],
            faceUpSecurityStaticScopeLeak: [],
            evadeRuntimeLeak: [],
            allianceCantSuspendRuntimeLeak: [],
            collisionImmunityBlockerLeak: [],
            securityDigimonStaticScopeLeak: [],
            suppressOnPlayEncodingLeak: [],
            activationLockEncodingLeak: [],
            securitySuppressionEncodingLeak: [],
            attackTargetChangeLockEncodingLeak: [],
            deDigivolveReminderTrashSecurityLeak: [],
            unsuspendedAttackPermissionEncodingLeak: [],
            canOnlyAttackSuspendedDigimonEncodingLeak: [],
            forcedOpponentAttackEncodingLeak: [],
            colorChangeEncodingLeak: [],
            tamerAsDigimonEncodingLeak: [],
            zeroDpPlaceholderLeak: [],
            optionColorRequirementRuntimeLeak: [],
            optionIgnoreColorConditionLeak: [],
            guardedActionPhaseTelemetryLeak: [],
            searchSecurityRecoveryShuffleOrderLeak: [],
            securityToHandCostEncodingLeak: [],
            optionBattleAreaCostAtomicityLeak: [],
            luiOhwadaCompositeCostLeak: [],
            placeSourceCostAtomicityLeak: [],
            returnSourceToHandCostAtomicityLeak: [],
            digimonOptionTargetLeak: [],
            endAttackManualLeak: [],
            attackTargetMoveEncodingLeak: [],
            effectAttackMoveEncodingLeak: [],
            stunBroadEncodingLeak: [],
            fakeGrantKeywordSemanticLeak: [],
            preventLeavePlaySemanticLeak: [],
            digivolveOnlyColorEncodingLeak: [],
            breedingMoveEncodingLeak: [],
            copySourceEffectsEncodingLeak: [],
            saveSelfToTamerEncodingLeak: [],
            taomonSt22InheritedEndAttackSecurityCostLeak: [],
            alphamonNameInheritedEndAttackSourceLeak: [],
            ex4AllianceInheritedEndAttackAnotherSuspendedLeak: [],
            beastAntylamonInheritedEndAttackCostLeak: [],
            metalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak: [],
            dexDoruGreymonInheritedEndAttackChosenLevelLeak: []
        },
        semanticSummary: {},
        manualRequiredByCategory: [],
        other: []
    };

    // Round 18G: cache game-state.js once for runtime guard checks. Full audit
    // previously reread the 600KB+ engine file inside broad/per-card guards,
    // which made node audit-mechanics.js look hung even when all buckets were green.
    const gameStateTextForRuntimeGuards = getGameStateTextForAudit();



    // Round 22CX: Codex/live-bot official match reports must not infer
    // successful decisions from rejected/no-op actions, and must distinguish
    // actionPhase (official action timing) from endSnapshotPhase (after-action
    // board state such as next-turn HATCH). The actual runner may live outside
    // this upload, so server.js exposes reusable helpers for report writers.
    try {
        const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const hasRound = /Round 22CX/.test(serverText);
        const hasDeckHelper = /function buildOfficialDeckLegalityReport/.test(serverText) && /function formatOfficialDeckValidationForReport/.test(serverText);
        const hasActionHelper = /function getOfficialActionReportEntry/.test(serverText) && /includeInSuccessfulDecisions/.test(serverText) && /actionApplied/.test(serverText);
        const hasPhaseHelper = /function formatOfficialTurnStateForReport/.test(serverText) && /actionPhase/.test(serverText) && /endSnapshotPhase/.test(serverText);
        const hasDecisionFilter = /function buildOfficialSuccessfulDecisions/.test(serverText);
        const hasOfficialLegalityLines = /Official banned list/.test(serverText) && /Official restricted list/.test(serverText) && /Official banned-pair list/.test(serverText);
        const exported = /module\.exports[\s\S]*buildOfficialDeckLegalityReport[\s\S]*formatOfficialDeckValidationForReport[\s\S]*getOfficialActionReportEntry[\s\S]*formatOfficialTurnStateForReport[\s\S]*buildOfficialSuccessfulDecisions/.test(serverText);
        if (!hasRound || !hasDeckHelper || !hasActionHelper || !hasPhaseHelper || !hasDecisionFilter || !hasOfficialLegalityLines || !exported) {
            report.semanticIssues.officialReportTelemetryLeak.push({
                id: 'REPORT',
                name: 'official match report telemetry helpers',
                reason: 'server.js must expose Round 22CX report helpers so Codex/bot reports separate successful decisions from rejected/no-op actions, print actionPhase vs endSnapshotPhase, and show full official deck legality checks.',
                hasRound,
                hasDeckHelper,
                hasActionHelper,
                hasPhaseHelper,
                hasDecisionFilter,
                hasOfficialLegalityLines,
                exported
            });
        }
    } catch (e) {
        report.semanticIssues.officialReportTelemetryLeak.push({
            id: 'REPORT',
            name: 'official match report telemetry helpers',
            reason: `Round 22CX audit guard failed to inspect report helper handling: ${e.message}`
        });
    }



    // Round 22CY: actual Codex/live-bot runner integration should use a real
    // report writer module instead of leaving the server helpers disconnected.
    // This catches regressions where illegal/no-op guarded actions can again
    // appear as successful turn decisions in generated markdown/json reports.
    try {
        const writerPath = path.join(__dirname, 'official-report-writer.js');
        const writerText = fs.existsSync(writerPath) ? fs.readFileSync(writerPath, 'utf8') : '';
        const hasWriter = !!writerText;
        const hasRound = /Round 22CY/.test(writerText);
        const hasPayload = /buildOfficialMatchReportPayload/.test(writerText) && /formatOfficialMatchMarkdown/.test(writerText) && /writeOfficialMatchReports/.test(writerText);
        const filtersRejected = /includeInSuccessfulDecisions/.test(writerText) && /actionApplied/.test(writerText) && /Rejected \/ no-change actions/.test(writerText);
        const separatesPhases = /actionPhase/.test(writerText) && /endSnapshotPhase/.test(writerText);
        const usesDeckFormatter = /formatOfficialDeckValidationForReport/.test(writerText);
        const exportsWriter = /module\.exports[\s\S]*buildOfficialMatchReportPayload[\s\S]*formatOfficialMatchMarkdown[\s\S]*writeOfficialMatchReports/.test(writerText);
        if (!hasWriter || !hasRound || !hasPayload || !filtersRejected || !separatesPhases || !usesDeckFormatter || !exportsWriter) {
            report.semanticIssues.officialReportTelemetryLeak.push({
                id: 'REPORT',
                name: 'official match report writer integration',
                reason: 'Round 22CY requires official-report-writer.js so real Codex/bot reports use guarded action telemetry, exclude rejected/no-op actions from successful decisions, split actionPhase/endSnapshotPhase, and print full official deck legality.',
                hasWriter,
                hasRound,
                hasPayload,
                filtersRejected,
                separatesPhases,
                usesDeckFormatter,
                exportsWriter
            });
        }
    } catch (e) {
        report.semanticIssues.officialReportTelemetryLeak.push({
            id: 'REPORT',
            name: 'official match report writer integration',
            reason: `Round 22CY audit guard failed to inspect report writer integration: ${e.message}`
        });
    }


    // Round 22CZ: actual Codex/live-bot runner integration should be directly
    // invokable as a CLI/adapter after a structured report is produced. This
    // prevents reports from silently falling back to the old markdown writer.
    try {
        const writerPath = path.join(__dirname, 'official-report-writer.js');
        const writerText = fs.existsSync(writerPath) ? fs.readFileSync(writerPath, 'utf8') : '';
        const hasRound = /Round 22CZ/.test(writerText);
        const hasCli = /function parseCliArgs/.test(writerText) && /function runCli/.test(writerText) && /require\.main\s*===\s*module/.test(writerText);
        const readsInputs = /readJsonFile/.test(writerText) && /--input/.test(writerText) && /--decklists/.test(writerText) && /--out-dir/.test(writerText);
        const writesReports = /writeOfficialMatchReports/.test(writerText) && /fs\.mkdirSync\(outDir/.test(writerText);
        const expandsCountedDecklists = /expandCountedDeckArray/.test(writerText) && /normalizeReportDecklists/.test(writerText);
        const standaloneFallback = /loadServerHelpers/.test(writerText) && /_standaloneFallback/.test(writerText) && /fallbackFormatOfficialDeckValidationForReport/.test(writerText);
        const exportsCli = /module\.exports[\s\S]*parseCliArgs[\s\S]*normalizeDecklistsForWriter[\s\S]*runCli/.test(writerText);
        if (!hasRound || !hasCli || !readsInputs || !writesReports || !expandsCountedDecklists || !standaloneFallback || !exportsCli) {
            report.semanticIssues.officialReportTelemetryLeak.push({
                id: 'REPORT',
                name: 'official match report writer CLI adapter',
                reason: 'Round 22CZ requires official-report-writer.js to be directly invokable by Codex/live-bot runners, accept structured report + decklists input, expand counted decklists, write official json/md reports, and run without Express/Socket.IO dependencies.',
                hasRound,
                hasCli,
                readsInputs,
                writesReports,
                expandsCountedDecklists,
                standaloneFallback,
                exportsCli
            });
        }
    } catch (e) {
        report.semanticIssues.officialReportTelemetryLeak.push({
            id: 'REPORT',
            name: 'official match report writer CLI adapter',
            reason: `Round 22CZ audit guard failed to inspect report writer CLI adapter: ${e.message}`
        });
    }



    // Round 22DA: BT25-085 BeelStarmon has two different printed source scopes.
    // Its Option-use clause says hand or this Digimon's digivolution cards only;
    // its unsuspend cost says any digivolution cards or link cards. The runtime
    // must preserve both distinctions instead of treating all sources alike.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const beel = allCards.find(c => c.id === 'BT25-085');
        const useActions = (beel?.mechanics || []).flatMap(m => Array.isArray(m.actions) ? m.actions : []).filter(a => a && a.type === 'USE_OPTION_CARD');
        const trashActions = (beel?.mechanics || []).flatMap(m => Array.isArray(m.actions) ? m.actions : []).filter(a => a && a.type === 'TRASH_SOURCE');
        const useScopedToSelf = useActions.length > 0 && useActions.every(a => a.sourceHostSelf === true);
        const trashAllowsLinks = trashActions.length > 0 && trashActions.every(a => a.includeLinked === true || /link/i.test(String(a.from || a.zone || '')));
        const hasRuntimeHelper = /Round 22DA/.test(gs) && /actionAllowsLinkedSourceCards/.test(gs);
        const useCarriesSourceCard = /sourceCard: action\.sourceCard \|\| sourceCard/.test(gs);
        const linkedSkippedByDefault = /this\.isLinkedCard\(card\) && !includeLinked/.test(gs);
        if (!beel || !useScopedToSelf || !trashAllowsLinks || !hasRuntimeHelper || !useCarriesSourceCard || !linkedSkippedByDefault) {
            report.semanticIssues.dualOptionSourceLinkScopeLeak.push({
                id: 'BT25-085',
                name: 'BeelStarmon',
                reason: 'Round 22DA requires BeelStarmon USE_OPTION_CARD to read only hand/this Digimon sources, while TRASH_SOURCE may include printed link-card scope; runtime must skip linked cards unless explicitly allowed.',
                useScopedToSelf,
                trashAllowsLinks,
                hasRuntimeHelper,
                useCarriesSourceCard,
                linkedSkippedByDefault
            });
        }
    } catch (e) {
        report.semanticIssues.dualOptionSourceLinkScopeLeak.push({
            id: 'BT25-085',
            name: 'BeelStarmon',
            reason: `Round 22DA audit guard failed to inspect DUAL source/link scope: ${e.message}`
        });
    }


    // Round 22DB: BT25-083 LadyDevimon's once-per-turn text pays by trashing
    // 1 Option card from any own Digimon's digivolution cards, then uses 1
    // [Three Musketeers] trait Option from trash with its cost reduced by 3.
    // It must not be encoded as a generic REDUCE_COST or TRASH_SECURITY_STACK,
    // and the runtime must charge the reduced Option use cost when free:false.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const lady = allCards.find(c => c.id === 'BT25-083');
        const onceActions = (lady?.mechanics || [])
            .filter(m => ['WHEN_DIGIVOLVING','WHEN_ATTACKING'].includes(String(m.trigger || '').toUpperCase()) && m.isOncePerTurn === true)
            .flatMap(m => Array.isArray(m.actions) ? m.actions : []);
        const useActions = onceActions.filter(a => a && a.type === 'USE_OPTION_CARD');
        const hasBadReduce = onceActions.some(a => a && a.type === 'REDUCE_COST');
        const allUseFromTrash = useActions.length >= 2 && useActions.every(a => String(a.from || '') === 'trash');
        const allPayReducedCost = useActions.length >= 2 && useActions.every(a => a.free === false && Number(a.costReduction) === 3);
        const allCostSourceOption = useActions.length >= 2 && useActions.every(a => a.cost?.type === 'TRASH_SOURCE' && a.cost?.target?.cardType === 'option' && !/security/i.test(JSON.stringify(a.cost || {})));
        const hasRuntimePayment = /Round 22DB/.test(gs) && /getStructuredOptionUseFinalCost/.test(gs) && /canPayStructuredOptionUse/.test(gs) && /reduced Option use cost/.test(gs);
        const filtersPayableCandidates = /canPayStructuredOptionUse\(playerId, entry\.card, action\)/.test(gs);
        if (!lady || hasBadReduce || !allUseFromTrash || !allPayReducedCost || !allCostSourceOption || !hasRuntimePayment || !filtersPayableCandidates) {
            report.semanticIssues.threeMusketeersOptionSourceCostAtomicityLeak.push({
                id: 'BT25-083',
                name: 'LadyDevimon',
                reason: 'Round 22DB requires BT25-083 to pay TRASH_SOURCE Option cost before USE_OPTION_CARD from trash, pay reduced Option use cost 3 less, and skip payoff if the source cost cannot be paid.',
                hasBadReduce,
                allUseFromTrash,
                allPayReducedCost,
                allCostSourceOption,
                hasRuntimePayment,
                filtersPayableCandidates
            });
        }
    } catch (e) {
        report.semanticIssues.threeMusketeersOptionSourceCostAtomicityLeak.push({
            id: 'BT25-083',
            name: 'LadyDevimon',
            reason: `Round 22DB audit guard failed to inspect Three Musketeers Option source-cost atomicity: ${e.message}`
        });
    }


    // Round 22DC: official BT25 card-pool coverage guard. The local database
    // must include Bandai official BT25 cards that the third-party feed may omit,
    // and fetch-cards.js must preserve the overlay during refreshes.
    try {
        const requiredBt25 = ['BT25-036','BT25-039','BT25-060','BT25-076','BT25-088','BT25-090'];
        const bt25Ids = new Set(allCards.filter(c => String(c.id || '').startsWith('BT25-')).map(c => c.id));
        const missing = requiredBt25.filter(id => !bt25Ids.has(id));
        const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
        const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
        const hasOverlay = /OFFICIAL_BT25_CARD_PATCHES/.test(fetchText) && /applyOfficialCardPoolOverlay/.test(fetchText) && requiredBt25.every(id => fetchText.includes(id));
        const hasGuardrail = /Round 22DC official BT25 card-pool guardrails/.test(autoText) && requiredBt25.every(id => autoText.includes(id));
        const uniqueCountOk = bt25Ids.size >= 104;
        if (missing.length || !uniqueCountOk || !hasOverlay || !hasGuardrail) {
            report.semanticIssues.bt25OfficialCardPoolCoverageLeak.push({
                id: 'BT25-OFFICIAL-CARD-POOL',
                name: 'Official BT25 card pool coverage',
                reason: 'Round 22DC requires the six official BT25 overlay cards to exist locally, BT25 unique-card count to stay at least 104, and fetch-cards/auto-mechanics guardrails to preserve them across refreshes.',
                missing,
                bt25UniqueCount: bt25Ids.size,
                hasOverlay,
                hasGuardrail
            });
        }
    } catch (e) {
        report.semanticIssues.bt25OfficialCardPoolCoverageLeak.push({
            id: 'BT25-OFFICIAL-CARD-POOL',
            name: 'Official BT25 card pool coverage',
            reason: `Round 22DC audit guard failed to inspect official BT25 coverage: ${e.message}`
        });
    }


    // Round 22DD: official BT25 overlay cards also need deterministic image
    // pulling. Since those cards can be absent from the upstream API card loop,
    // fetch-cards.js must provide a separate image-only CLI and helper path.
    try {
        const requiredBt25 = ['BT25-036','BT25-039','BT25-060','BT25-076','BT25-088','BT25-090'];
        const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
        const cardsWithBadImg = allCards
            .filter(c => requiredBt25.includes(String(c.id || '')))
            .filter(c => String(c.img || '') !== `/img/${c.id}.jpg`);
        const hasRound = /Round 22DD/.test(fetchText);
        const hasHelpers = /function getOfficialBt25OverlayImageIds/.test(fetchText)
            && /function getOfficialBt25OverlayImageUrl/.test(fetchText)
            && /function getOfficialBt25OverlayImagePath/.test(fetchText)
            && /function ensureOfficialBt25OverlayImages/.test(fetchText);
        const hasImageOnlyCli = /--official-bt25-images-only/.test(fetchText) && /--overlay-images-only/.test(fetchText) && /runOfficialBt25ImagesOnly/.test(fetchText);
        const deterministicUrl = /images\.digimoncard\.io\/images\/cards\/\$\{String\(cardId/.test(fetchText) || /images\.digimoncard\.io\/images\/cards\/\$\{.*cardId/.test(fetchText);
        const calledAfterOverlay = /applyOfficialCardPoolOverlay\(localDatabase, oldMap\)[\s\S]{0,260}ensureOfficialBt25OverlayImages\(\)/.test(fetchText);
        const exported = /module\.exports[\s\S]*ensureOfficialBt25OverlayImages[\s\S]*runOfficialBt25ImagesOnly/.test(fetchText);
        const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
        const hasAutoGuardrail = /Round 22DD official BT25 overlay image guardrails/.test(autoText) && requiredBt25.every(id => fetchText.includes(id));
        if (cardsWithBadImg.length || !hasRound || !hasHelpers || !hasImageOnlyCli || !deterministicUrl || !calledAfterOverlay || !exported || !hasAutoGuardrail) {
            report.semanticIssues.bt25OfficialImagePullerLeak.push({
                id: 'BT25-OFFICIAL-OVERLAY-IMAGES',
                name: 'Official BT25 overlay image puller',
                reason: 'Round 22DD requires deterministic /img/<cardId>.jpg paths for the six official BT25 overlay cards plus a fetch-cards.js image-only CLI/helper that can pull those images even when the third-party feed omits the cards.',
                badImgIds: cardsWithBadImg.map(c => ({ id: c.id, img: c.img })),
                hasRound,
                hasHelpers,
                hasImageOnlyCli,
                deterministicUrl,
                calledAfterOverlay,
                exported,
                hasAutoGuardrail
            });
        }
    } catch (e) {
        report.semanticIssues.bt25OfficialImagePullerLeak.push({
            id: 'BT25-OFFICIAL-OVERLAY-IMAGES',
            name: 'Official BT25 overlay image puller',
            reason: `Round 22DD audit guard failed to inspect overlay image puller: ${e.message}`
        });
    }


    // Round 22DE: Discord OAuth/server configuration must load local .env
    // before reading process.env. Otherwise a valid .env still yields
    // /healthz discordConfigured:false and /auth/discord returns 503.
    try {
        const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
        const dotenvIndex = serverText.indexOf("require('dotenv').config()") >= 0
            ? serverText.indexOf("require('dotenv').config()")
            : serverText.indexOf('require("dotenv").config()');
        const discordIndex = serverText.indexOf('const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID');
        const secretIndex = serverText.indexOf('const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET');
        const redirectIndex = serverText.indexOf('process.env.DISCORD_REDIRECT_URI');
        const hasRoundMarker = /Round 22DE/.test(serverText);
        const hasOptionalSafeLoad = /try\s*\{[\s\S]{0,180}require\(['"]dotenv['"]\)\.config\(\)[\s\S]{0,260}MODULE_NOT_FOUND/.test(serverText);
        const loadsBeforeDiscord = dotenvIndex >= 0 && discordIndex > dotenvIndex && secretIndex > dotenvIndex && redirectIndex > dotenvIndex;
        const noHardcodedDiscordSecret = !/DISCORD_CLIENT_SECRET\s*=\s*['"][^'"]+['"]/.test(serverText);
        const healthReportsDiscord = /discordConfigured:\s*hasDiscordConfig\(\)/.test(serverText);
        const hasAutoGuardrail = /Round 22DE Discord dotenv guardrails/.test(autoText);
        if (!hasRoundMarker || !hasOptionalSafeLoad || !loadsBeforeDiscord || !noHardcodedDiscordSecret || !healthReportsDiscord || !hasAutoGuardrail) {
            report.semanticIssues.discordDotenvConfigLeak.push({
                id: 'SERVER-DISCORD-DOTENV',
                name: 'Discord .env bootstrap',
                reason: 'Round 22DE requires server.js to load local .env safely before reading Discord OAuth env vars, while keeping credentials in process.env and exposing correct /healthz discordConfigured status.',
                hasRoundMarker,
                hasOptionalSafeLoad,
                loadsBeforeDiscord,
                noHardcodedDiscordSecret,
                healthReportsDiscord,
                hasAutoGuardrail
            });
        }
    } catch (e) {
        report.semanticIssues.discordDotenvConfigLeak.push({
            id: 'SERVER-DISCORD-DOTENV',
            name: 'Discord .env bootstrap',
            reason: `Round 22DE audit guard failed to inspect server dotenv loading: ${e.message}`
        });
    }



    // Round 22DF: npm/package test entrypoint must be real and stable.
    // `npm test` should run a root test-all.js that proves syntax/audit/meta
    // without depending on stale missing root files or broken legacy relative requires.
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        const testAllPath = path.join(__dirname, 'test-all.js');
        const testAllText = fs.existsSync(testAllPath) ? fs.readFileSync(testAllPath, 'utf8') : '';
        const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
        const scripts = packageJson.scripts || {};
        const scriptValues = Object.values(scripts).map(v => String(v || ''));
        const hasRootEntrypoint = fs.existsSync(testAllPath) && /Round 22DF/.test(testAllText);
        const npmTestUsesRootEntrypoint = scripts.test === 'node test-all.js' && scripts['test:all'] === 'node test-all.js --all';
        const rootRunsAudit = /audit-mechanics\.js/.test(testAllText);
        const rootRunsMeta = /meta-match-sim\.js/.test(testAllText);
        const rootRunsSyntax = /--check/.test(testAllText) && /game-state\.js/.test(testAllText) && /server\.js/.test(testAllText);
        const hasLegacyShim = /ensureLegacyRequireShims/.test(testAllText) && /module\.exports = require\('\.\.\/game-state\.js'\)/.test(testAllText);
        const directMissingRootLegacy = scriptValues.some(cmd => /^node test-(security|trash|source|reveal|cost|selection|static)/.test(cmd) && !cmd.includes('--legacy'));
        const hasAutoGuardrail = /Round 22DF npm test entrypoint guardrails/.test(autoText);
        if (!hasRootEntrypoint || !npmTestUsesRootEntrypoint || !rootRunsAudit || !rootRunsMeta || !rootRunsSyntax || !hasLegacyShim || directMissingRootLegacy || !hasAutoGuardrail) {
            report.semanticIssues.npmTestEntryPointLeak.push({
                id: 'NPM-TEST-ENTRYPOINT',
                name: 'npm test entrypoint',
                reason: 'Round 22DF requires package.json to point npm test/test:all at a real root test-all.js that runs syntax/audit/meta and shields legacy test-report files from broken relative require paths.',
                hasRootEntrypoint,
                npmTestUsesRootEntrypoint,
                rootRunsAudit,
                rootRunsMeta,
                rootRunsSyntax,
                hasLegacyShim,
                directMissingRootLegacy,
                hasAutoGuardrail
            });
        }
    } catch (e) {
        report.semanticIssues.npmTestEntryPointLeak.push({
            id: 'NPM-TEST-ENTRYPOINT',
            name: 'npm test entrypoint',
            reason: `Round 22DF audit guard failed to inspect npm test entrypoint: ${e.message}`
        });
    }


    // Round 22CW: guarded server actions must propagate explicit GameState
    // false returns. Illegal/no-op actions such as normal DUAL play/digivolve
    // must be reported as ok:false/actionApplied:false instead of action:true.
    try {
        const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const hasNormalizer = /function normalizeGuardedGameActionResult/.test(serverText) && /result === false/.test(serverText);
        const capturesPlay = /case 'play':[\s\S]{0,140}result = game\.playOrEvolve/.test(serverText);
        const capturesAttack = /case 'declareAttack':[\s\S]{0,140}result = game\.declareAttack/.test(serverText);
        const capturesDna = /case 'dnaDigivolve':[\s\S]{0,140}result = game\.dnaEvolve/.test(serverText);
        const capturesPending = /case 'submitChoice':[\s\S]{0,140}result = game\.submitChoice/.test(serverText) && /case 'submitTarget':[\s\S]{0,140}result = game\.submitTarget/.test(serverText);
        const telemetryUsesAppliedOk = /actionApplied: !!applied\?\.ok/.test(serverText);
        if (!/Round 22CW/.test(serverText) || !hasNormalizer || !capturesPlay || !capturesAttack || !capturesDna || !capturesPending || !telemetryUsesAppliedOk) {
            report.semanticIssues.guardedActionNoOpSuccessLeak.push({
                id: 'RUNTIME',
                name: 'guarded action false-return propagation',
                reason: 'server.js must capture GameState return values and convert explicit false into ok:false/actionApplied:false so illegal no-op actions are not reported as successful.',
                hasNormalizer,
                capturesPlay,
                capturesAttack,
                capturesDna,
                capturesPending,
                telemetryUsesAppliedOk
            });
        }
    } catch (e) {
        report.semanticIssues.guardedActionNoOpSuccessLeak.push({
            id: 'RUNTIME',
            name: 'guarded action false-return propagation',
            reason: `Round 22CW audit guard failed to inspect server guarded action result handling: ${e.message}`
        });
    }

    // Round 22CV: EX6-074-style effect DNA does not ignore printed DNA
    // requirements. The runtime must not fall back to “any higher-level
    // byEffect target,” because that illegally allows non-DNA/DUAL cards such
    // as BT25-085 BeelStarmon.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasHelpers = /cardHasPrintedDnaDigivolutionText/.test(gs) && /dnaActionRequiresPrintedDnaText/.test(gs);
        const oldByEffectFallback = /!canDNA\s*&&\s*options\.byEffect\)\s*canDNA\s*=\s*true/.test(gs)
            || /action\.byEffect \|\| action\.free \|\| action\.allowAnyHandDigimon \|\| !action\.target\?\.requiresDnaText/.test(gs);
        const supportsBlastPrintedMaterials = /blast\\s\+dna\\s\+digivolve/.test(gs);
        if (!/Round 22CV/.test(gs) || !hasHelpers || oldByEffectFallback || !supportsBlastPrintedMaterials) {
            report.semanticIssues.effectDnaPrintedRequirementLeak.push({
                id: 'RUNTIME',
                name: 'effect DNA printed requirement',
                reason: 'Effect-granted DNA must still require printed DNA text/material matching unless an effect explicitly ignores requirements; generic byEffect DNA must not allow non-DNA DUAL targets.'
            });
        }
    } catch (e) {
        report.semanticIssues.effectDnaPrintedRequirementLeak.push({
            id: 'RUNTIME',
            name: 'effect DNA printed requirement',
            reason: `Round 22CV audit guard failed to inspect game-state DNA legality: ${e.message}`
        });
    }

    // Round 22CU: guarded live/Codex action reports must distinguish the
    // original snapshot phase, the official action phase, and the after-action
    // snapshot. Main-phase actions requested from HATCH must first enter MAIN,
    // so reports never imply that play/attack happened during Breeding/Hatch.
    try {
        const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
        const gs = gameStateTextForRuntimeGuards;
        const hasMainActionSet = /MAIN_PHASE_GUARDED_ACTIONS/.test(serverText) && /shouldEnterMainBeforeGuardedAction/.test(serverText);
        const normalizesHatchToMain = /game\.phase === 'HATCH'[\s\S]{0,260}shouldEnterMainBeforeGuardedAction\(type\)[\s\S]{0,260}enterMainPhase/.test(serverText);
        const emitsTelemetry = /buildGuardedActionTelemetry/.test(serverText) && /actionPhase/.test(serverText) && /endSnapshotPhase/.test(serverText) && /lastGuardedActionTelemetry/.test(serverText);
        const debugExposesTelemetry = /lastGuardedActionTelemetry/.test(gs);
        if (!/Round 22CU/.test(serverText) || !hasMainActionSet || !normalizesHatchToMain || !emitsTelemetry || !debugExposesTelemetry) {
            report.semanticIssues.guardedActionPhaseTelemetryLeak.push({
                id: 'RUNTIME',
                name: 'executeGuardedRoomAction phase telemetry',
                reason: 'Guarded Main Phase actions requested from HATCH must normalize to MAIN and expose actionPhase/endSnapshotPhase telemetry for official match reports.'
            });
        }
    } catch (e) {
        report.semanticIssues.guardedActionPhaseTelemetryLeak.push({
            id: 'RUNTIME',
            name: 'executeGuardedRoomAction phase telemetry',
            reason: `Round 22CU audit guard failed to inspect server/game-state telemetry: ${e.message}`
        });
    }

    // Round 22CT: SEARCH_SECURITY_TO_HAND cards such as BT11-042 Angewomon
    // must resolve printed order: add from security -> Recovery +1 -> then shuffle.
    // If shuffle runs before recovery, the recovered card illegally remains fixed on top.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const body = (gs.match(/searchSecurityToHand\(playerId, action = \{\}\) \{[\s\S]*?\n    \}/) || [])[0] || '';
        const runtimeOrderOk = /thenRecovery[\s\S]{0,180}recoveryDeck[\s\S]{0,220}shuffle\(zone\.security\)/.test(body);
        if (!/Round 22CT/.test(body) || !runtimeOrderOk) {
            report.semanticIssues.searchSecurityRecoveryShuffleOrderLeak.push({
                id: 'RUNTIME',
                name: 'SEARCH_SECURITY_TO_HAND',
                reason: 'SEARCH_SECURITY_TO_HAND with thenRecovery must call recoveryDeck before shuffle(zone.security), so recovered cards are included in the final security shuffle.'
            });
        }
        const angewomon = allCards.find(card => card.id === 'BT11-042');
        const action = (angewomon?.mechanics || [])
            .flatMap(mech => Array.isArray(mech.actions) ? mech.actions : [])
            .find(action => action && action.type === 'SEARCH_SECURITY_TO_HAND');
        if (!action || action.thenRecovery !== true || action.shuffle !== true) {
            report.semanticIssues.searchSecurityRecoveryShuffleOrderLeak.push({
                id: 'BT11-042',
                name: 'Angewomon',
                reason: 'BT11-042 must encode its security search with thenRecovery:true and shuffle:true to match printed “If you added, Recovery +1. Then shuffle.” text.'
            });
        }
    } catch (e) {
        report.semanticIssues.searchSecurityRecoveryShuffleOrderLeak.push({
            id: 'RUNTIME',
            name: 'SEARCH_SECURITY_TO_HAND',
            reason: `Round 22CT audit guard failed to inspect runtime order: ${e.message}`
        });
    }

    // Round 22BH: battle-area Option trash cost/action atomicity.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasSharedCandidateHelper = /getBattleAreaOptionCandidatesForAction/.test(gs) && /cardMatchesTarget\(card, \{ \.\.\.target/.test(gs);
        const costSupportsBattleAreaOptions = /case 'TRASH_OPTION_IN_BATTLE_AREA':[\s\S]{0,500}getBattleAreaOptionCandidatesForAction/.test(gs);
        const replacementCostSupportsBattleAreaOptions = /type === 'TRASH_OPTION_IN_BATTLE_AREA'[\s\S]{0,520}trashOptionInBattleArea/.test(gs);
        const actionPassesEffectContext = /trashOptionInBattleArea\(effect\.playerId, action, effect\)/.test(gs);
        const noRawOptionScan = !/if \(this\.isOptionLike\(card\)\) \{[\s\S]{0,220}triggerOptionTrashedInBattleArea/.test(gs);
        if (!hasSharedCandidateHelper || !costSupportsBattleAreaOptions || !replacementCostSupportsBattleAreaOptions || !actionPassesEffectContext || !noRawOptionScan) {
            report.semanticIssues.optionBattleAreaCostAtomicityLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BH battle-area Option cost guard',
                reason: 'TRASH_OPTION_IN_BATTLE_AREA must be payable as a structured/replacement cost, share target-filtered candidates, and avoid raw Option scans that can consume field DUAL Digimon.',
                hasSharedCandidateHelper,
                costSupportsBattleAreaOptions,
                replacementCostSupportsBattleAreaOptions,
                actionPassesEffectContext,
                noRawOptionScan
            });
        }
    } catch (e) {
        report.semanticIssues.optionBattleAreaCostAtomicityLeak.push({ id:'RUNTIME', name:'Round 22BH guard', reason:'battle-area Option cost runtime guard failed: '+e.message });
    }

    // Round 22BG: condition.owner:"any" must aggregate both players. It is used
    // by official text such as "a Digimon with [Boss] trait", "there are 2 or
    // more suspended Digimon", and "the total cards in both players' security stacks".
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasOwnerScope = /const ownerScope = condition\.owner \|\| 'own'/.test(gs)
            && /ownerIdsForCondition = ownerScope === 'any' \? \['p1', 'p2'\]/.test(gs);
        const securityAggregates = /case 'SECURITY_COUNT'[\s\S]{0,520}ownerScope === 'any'[\s\S]{0,260}security/.test(gs);
        const oldOwnOnly = /const owner = condition\.owner === 'opponent' \? this\.getOpponentId\(playerId\) : playerId;[\s\S]{0,140}ownerIdsForCondition = owner === 'any'/.test(gs);
        if (!hasOwnerScope || !securityAggregates || oldOwnOnly) {
            report.semanticIssues.ownerAnyConditionRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BG owner:any aggregate condition guard',
                reason: 'condition.owner:"any" must inspect/aggregate both players, and SECURITY_COUNT owner:any must use total security across both players.',
                hasOwnerScope,
                securityAggregates,
                oldOwnOnly
            });
        }
    } catch (e) {
        report.semanticIssues.ownerAnyConditionRuntimeLeak.push({ id:'RUNTIME', name:'Round 22BG guard', reason:'owner:any condition runtime guard failed: '+e.message });
    }

    // Round 22BF: DUAL cards stacked on the field through Arts Digivolve are
    // treated as Digimon and must not still be referenceable as Option cards.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasFieldDualDetector = /isDualFieldDigimon/.test(gs) && /battleArea/.test(gs) && /breedingArea/.test(gs);
        const hasOptionReferenceHelper = /isOptionLikeForReference/.test(gs) && /isDualFieldDigimon\(card\)/.test(gs);
        const cardTypeCheckUsesHelper = /wantedType === "option"[\s\S]{0,160}isOptionLikeForReference/.test(gs)
            && (gs.match(/isOptionLikeForReference\(card, target\)/g) || []).length >= 3;
        if (!hasFieldDualDetector || !hasOptionReferenceHelper || !cardTypeCheckUsesHelper) {
            report.semanticIssues.dualFieldOptionReferenceLeak.push({
                id: 'RUNTIME',
                name: 'Round 22BF DUAL field Option-reference guard',
                reason: 'A DUAL card treated as a field Digimon must not match Option-card references until it leaves the field.',
                hasFieldDualDetector,
                hasOptionReferenceHelper,
                cardTypeCheckUsesHelper
            });
        }
    } catch (e) {
        report.semanticIssues.dualFieldOptionReferenceLeak.push({ id:'RUNTIME', name:'Round 22BF guard', reason:'DUAL field Option-reference runtime guard failed: '+e.message });
    }

    // Round 22BD: catch pre-[Main] Option ignore-color clauses leaking into [Main] effect conditions.
    auditOptionIgnoreColorConditionLeak(allCards, report);
    auditSecurityToHandCostEncodingLeak(allCards, report);
    auditOptionBattleAreaCostAtomicityLeak(allCards, report);
    auditLuiOhwadaCompositeCostLeak(allCards, report);
    auditPlaceSourceCostAtomicityLeak(allCards, report);
    auditReturnSourceToHandCostAtomicityLeak(allCards, report);























    // Round 22AG: End-of-Opponent forced attack text is a player-affecting
    // attack declaration, not a Digimon status. Runtime must trigger it from the
    // non-turn player's cards and allow choosing the opponent's Digimon as the
    // attacker.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasOpponentEndTrigger = /END_OF_OPPONENTS_TURN/.test(gs) && /triggerEffect\(opponentId, card, 'END_OF_OPPONENTS_TURN'\)/.test(gs);
        const hasForcedAttackerChoice = /FORCED_ATTACKER_CHOICE/.test(gs) && /startForcedAttackFromActionTarget/.test(gs);
        const hasPlayerAffectingComment = /Round 22AG/.test(gs) && /affects the player/.test(gs);
        if (!hasOpponentEndTrigger || !hasForcedAttackerChoice || !hasPlayerAffectingComment) {
            report.semanticIssues.forcedOpponentAttackEncodingLeak.push({
                id: 'RUNTIME',
                name: 'Round 22AG forced opponent attack runtime guard',
                reason: 'Runtime must fire END_OF_OPPONENTS_TURN from the non-turn player and resolve chosen-opponent-Digimon forced attacks as player-affecting attack declarations.',
                hasOpponentEndTrigger,
                hasForcedAttackerChoice,
                hasPlayerAffectingComment
            });
        }
    } catch (e) {
        report.semanticIssues.forcedOpponentAttackEncodingLeak.push({ id:'RUNTIME', name:'Round 22AG guard', reason:'Forced opponent attack runtime guard failed: '+e.message });
    }

    // Round 21I: Security Digimon scope is a security-battle state, not a trait.
    // Runtime must give the checked card a controller while it is parked in
    // currentSecurityCard, and continuous static scope must not leak "Security
    // Digimon" buffs/debuffs to normal battle-area Digimon.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const controllerHandlesCurrentSecurity = /currentSecurityCard[\s\S]{0,700}defenderId/.test(gs) && /Round 21I/.test(gs);
        const staticScopeRejectsBattleDigimon = /security\\s\+digimon/i.test(gs) && /isCurrentSecurityDigimon/.test(gs);
        const targetFlagSupported = /target\.securityDigimon/.test(gs) || /isSecurityDigimon/.test(gs);
        if (!controllerHandlesCurrentSecurity || !staticScopeRejectsBattleDigimon || !targetFlagSupported) {
            report.semanticIssues.securityDigimonStaticScopeLeak.push({
                id: 'RUNTIME',
                name: 'Round 21I Security Digimon static scope guard',
                reason: 'Security Digimon DP/static effects must apply only to the currently checked Security Digimon, not normal battle-area Digimon.'
            });
        }
    } catch (e) {
        report.semanticIssues.securityDigimonStaticScopeLeak.push({ id:'RUNTIME', name:'Round 21I guard', reason:'Security Digimon static scope guard failed: '+e.message });
    }

    // Round 20F: multi-security checks are not a pre-paid fixed loop. After each
    // checked card resolves, later queued checks must re-check whether the attacker
    // remains in battle and whether current Security A.+/- still permits another
    // check. Security A.-N statuses generated as structured {stat:'security'}
    // must also be visible to getSecurityChecks().
    try {
        const gs = gameStateTextForRuntimeGuards;
        const tracksPerformed = /securityChecksPerformed/.test(gs);
        const skipsDeadAttacker = /Remaining security checks skipped: attacker left the battle area/.test(gs);
        const skipsSecMinus = /current Security Attack modifiers no longer allow more checks/.test(gs);
        const runtimeSecurityStat = /eff\.stat/.test(gs) && /Security A\./.test(gs);
        if (!tracksPerformed || !skipsDeadAttacker || !skipsSecMinus || !runtimeSecurityStat) {
            report.semanticIssues.multiSecurityCheckFlowLeak.push({
                id: 'RUNTIME',
                name: 'Multi-security-check official flow guard',
                reason: 'Follow-up security checks must dynamically stop after attacker leaves battle area or Security A.-N cancels remaining checks, and runtime security stat modifiers must feed getSecurityChecks().',
                tracksPerformed,
                skipsDeadAttacker,
                skipsSecMinus,
                runtimeSecurityStat
            });
        }
    } catch(e) {
        report.semanticIssues.multiSecurityCheckFlowLeak.push({ id:'RUNTIME', name:'Round 20F guard', reason:'Multi-security-check flow guard failed: '+e.message });
    }

    // Round 20G: Piercing is pending until immediately before End of Attack,
    // but the number of checks must be computed from the attacker's current
    // Security A.+/- state at that pending transition. Battle-deletion triggers
    // can grant or remove Security Attack modifiers after battle result is known.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRound20GComment = /Round 20G/.test(gs);
        const recomputesCurrentPiercingChecks = /const currentChecks = this\.getSecurityChecks\(attacker\)/.test(gs) && /processSecurityChecks\(pending\.attackerPlayerId, attacker, defenderSide, currentChecks\)/.test(gs);
        const staleSnapshotPiercing = /processSecurityChecks\(pending\.attackerPlayerId, attacker, defenderSide, pending\.totalChecks\)/.test(gs);
        if (!hasRound20GComment || !recomputesCurrentPiercingChecks || staleSnapshotPiercing) {
            report.semanticIssues.piercingSecurityContinuationLeak.push({
                id: 'RUNTIME',
                name: 'Piercing security continuation guard',
                reason: 'Pending Piercing must use current Security A.+/- at Piercing resolution, not the stale totalChecks captured before battle-deletion triggers resolve.',
                hasRound20GComment,
                recomputesCurrentPiercingChecks,
                staleSnapshotPiercing
            });
        }
    } catch(e) {
        report.semanticIssues.piercingSecurityContinuationLeak.push({ id:'RUNTIME', name:'Round 20G guard', reason:'Piercing continuation guard failed: '+e.message });
    }

    // Round 20H: SECURITY_CHECKED event listeners must preserve "this Digimon"
    // binding and face-up checked-security gates. The runtime broadcasts the
    // SECURITY_CHECKED event to own listeners, so card encodings that say
    // "this Digimon checks" must explicitly bind to the event attacker.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntimeSelfBinding = /Round 20H: SECURITY_CHECKED self-binding/.test(gs)
            && /matchesSource/.test(gs)
            && /checkedSecurityFaceUp/.test(gs)
            && /faceUpSecurity/.test(gs);
        const harpy = allCards.find(c => c.id === 'BT16-033');
        const harpyMech = (harpy?.mechanics || []).find(m => m.trigger === 'SECURITY_CHECKED');
        const harpySelfBound = harpyMech?.condition?.type === 'EVENT_CONTEXT'
            && harpyMech.condition.key === 'attacker'
            && harpyMech.condition.matchesSource === true;
        const kapu = allCards.find(c => c.id === 'BT20-005');
        const kapuMech = (kapu?.mechanics || []).find(m => m.trigger === 'SECURITY_CHECKED');
        const kapuConds = kapuMech?.condition?.conditions || [];
        const kapuSelfBound = kapuMech?.condition?.type === 'AND'
            && kapuConds.some(c => c.type === 'EVENT_CONTEXT' && c.key === 'attacker' && c.matchesSource === true)
            && kapuConds.some(c => c.type === 'EVENT_CONTEXT' && c.key === 'checkedSecurityCard' && c.faceUpSecurity === true);
        const kapuTargetsSelf = (kapuMech?.actions || []).some(a => a.type === 'GRANT_KEYWORD' && a.target?.self === true && /jamming/i.test(String(a.buff?.keyword || '')));
        if (!hasRuntimeSelfBinding || !harpySelfBound || !kapuSelfBound || !kapuTargetsSelf) {
            report.semanticIssues.securityCheckedSelfBindingLeak.push({
                id: 'RUNTIME',
                name: 'SECURITY_CHECKED self-binding / face-up guard',
                reason: 'When-this-Digimon SECURITY_CHECKED effects must bind to the actual attacker; face-up checked-security clauses must inspect the checked card; inherited buffs must target the host as this Digimon.',
                hasRuntimeSelfBinding,
                harpySelfBound,
                kapuSelfBound,
                kapuTargetsSelf
            });
        }
    } catch(e) {
        report.semanticIssues.securityCheckedSelfBindingLeak.push({ id:'RUNTIME', name:'Round 20H guard', reason:'SECURITY_CHECKED self-binding guard failed: '+e.message });
    }

    // Round 20I: DELETED_OPPONENT_IN_BATTLE is intentionally broadcast for
    // watcher text such as "one of your Digimon", but "when this Digimon
    // deletes/wins" must bind to the actual battle winner. The broadcast must
    // also be batched so every listener sees the same battleWinnerId context.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasSelfBindingHelper = /Round 20I: battle-deletion events are broadcast/.test(gs)
            && /shouldBindBattleDeletionTriggerToWinner/.test(gs)
            && /battleWinnerId/.test(gs);
        const batchedBroadcast = /withTriggerBatch\('DELETED_OPPONENT_IN_BATTLE'/.test(gs);
        const thisTextCards = [];
        for (const card of allCards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ').replace(/\s+/g, ' ').toLowerCase();
            const hasThisText = /when this digimon (?:deletes?|would delete) .*opponent'?s? digimon.*battle/.test(text)
                || /when this digimon wins? (?:a )?battle/.test(text);
            if (!hasThisText) continue;
            const hasTrigger = (card.mechanics || []).some(m => m && m.trigger === 'DELETED_OPPONENT_IN_BATTLE');
            if (hasTrigger) thisTextCards.push(card.id);
        }
        if (!hasSelfBindingHelper || !batchedBroadcast) {
            report.semanticIssues.battleDeletionThisBindingLeak.push({
                id: 'RUNTIME',
                name: 'Battle-deletion this-Digimon binding guard',
                reason: 'When-this-Digimon battle-deletion triggers must bind to the battleWinnerId while preserving broadcast watcher effects.',
                hasSelfBindingHelper,
                batchedBroadcast,
                affectedThisTextCards: thisTextCards.slice(0, 30),
                affectedCount: thisTextCards.length
            });
        }
    } catch(e) {
        report.semanticIssues.battleDeletionThisBindingLeak.push({ id:'RUNTIME', name:'Round 20I guard', reason:'Battle-deletion this-Digimon binding guard failed: '+e.message });
    }




    // Round 20L: face-up security static providers must not duplicate combined
    // effectText/sourceEffect or read keyword reminder text as continuous grants.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasFaceUpSecurityDeDup = /Round 20L: face-up security static providers/.test(gs)
            && /return this\.getBattleRuntimeText\(card\);/.test(gs);
        const stripsReminderText = /Round 20L: reminder text in parentheses/.test(gs)
            && /const bonusText = String\(provider\.text \|\| ''\)\.replace/.test(gs)
            && /extractStaticSecurityAttackModifiers\(bonusText\)/.test(gs);
        const splitsMainBoundary = /Round 20L: \[Main\]\/triggered timing labels terminate a static provider clause/.test(gs)
            && /Main\|On Play\|When Digivolving\|When Attacking\|On Deletion/.test(gs);
        if (!hasFaceUpSecurityDeDup || !stripsReminderText || !splitsMainBoundary) {
            report.semanticIssues.faceUpSecurityStaticScopeLeak.push({
                id:'RUNTIME',
                name:'Face-up security static scope guard',
                reason:'Face-up security continuous providers must use non-duplicated battle/static text, split before activation timings, and ignore reminder parentheses when extracting Security A.+/- or other continuous grants.',
                hasFaceUpSecurityDeDup,
                stripsReminderText,
                splitsMainBoundary
            });
        }
    } catch(e) {
        report.semanticIssues.faceUpSecurityStaticScopeLeak.push({ id:'RUNTIME', name:'Round 20L guard', reason:'Face-up security static scope guard failed: '+e.message });
    }

    // Round 20K: rejected text/context broadcasts must not consume once-per-turn.
    // SECURITY_REMOVED now broadcasts across players, and battle-deletion events
    // broadcast to support watcher text. Filters that reject wrong-owner/wrong-winner
    // listeners must run before markEffectUsed(), or a false broadcast can lock out
    // the real trigger later in the same turn.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRound20KComment = /Round 20K: text\/context binding filters must run before once-per-turn/.test(gs);
        const legacyOnceIdx = gs.indexOf('const onceKey = `${this.normalizeTriggerName(timing)}:${entry.isSource');
        const sharedOnceIdx = gs.indexOf('const onceKey = mech.oncePerTurnKey');
        const optIdx = sharedOnceIdx !== -1 ? sharedOnceIdx : legacyOnceIdx;
        const secIdx = gs.indexOf('shouldTriggerSecurityRemovedForListener(playerId, normalizedTiming');
        const battleIdx = gs.indexOf('shouldBindBattleDeletionTriggerToWinner(normalizedTiming');
        if (!hasRound20KComment || !(secIdx !== -1 && battleIdx !== -1 && optIdx !== -1 && secIdx < optIdx && battleIdx < optIdx)) {
            report.semanticIssues.oncePerTurnBindingFilterLeak.push({
                id:'RUNTIME',
                name:'Once-per-turn binding filter guard',
                reason:'Structured trigger filters for rejected SECURITY_REMOVED/battle-deletion broadcasts must execute before once-per-turn consumption.',
                hasRound20KComment,
                secBeforeOnce: secIdx !== -1 && optIdx !== -1 && secIdx < optIdx,
                battleBeforeOnce: battleIdx !== -1 && optIdx !== -1 && battleIdx < optIdx
            });
        }
    } catch(e) {
        report.semanticIssues.oncePerTurnBindingFilterLeak.push({ id:'RUNTIME', name:'Round 20K guard', reason:'Once-per-turn binding filter guard failed: '+e.message });
    }

    // Round 20J: SECURITY_REMOVED owner/opponent binding guard. Effects that
    // say "your security stack" must only fire on the removed stack owner's side,
    // while "your opponent's security stack" must be allowed to fire from the
    // opposite player's board/source listeners.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasTextClassifiers = /securityRemovedTextWatchesOpponent/.test(gs)
            && /securityRemovedTextWatchesOwn/.test(gs)
            && /securityRemovedTextWatchesThisCard/.test(gs);
        const hasOpponentBroadcast = /Round 20J: effects that say "when your opponent's security stack is/.test(gs)
            && /opponentId = playerId === 'p1' \? 'p2' : 'p1'/.test(gs);
        const hasContextOwner = /ownerId:\s*playerId/.test(gs)
            && /removedOwner = ctx\.ownerId \|\| ctx\.playerId/.test(gs);
        if (!hasTextClassifiers || !hasOpponentBroadcast || !hasContextOwner) {
            report.semanticIssues.securityRemovedOwnerOpponentBindingLeak.push({
                id:'RUNTIME',
                name:'SECURITY_REMOVED owner/opponent binding guard',
                reason:'SECURITY_REMOVED must bind listener text to the removed security stack owner and support explicit opponent-security watchers.',
                hasTextClassifiers,
                hasOpponentBroadcast,
                hasContextOwner
            });
        }
    } catch(e) {
        report.semanticIssues.securityRemovedOwnerOpponentBindingLeak.push({ id:'RUNTIME', name:'Round 20J guard', reason:'SECURITY_REMOVED owner/opponent binding guard failed: '+e.message });
    }

    // Round 20E: activation-lock sentences may contain embedded timing labels
    // such as [Security] as the locked effect type. The clause splitter must not
    // truncate the sentence before "don't activate", and [Your Turn] windows must
    // not become all-turns just because the locked timing is [Security].
    try {
        const gs = gameStateTextForRuntimeGuards;
        if (!/Round 20E: bracketed timing labels inside the object of a lock sentence/.test(gs)
            || !/activationLockTimingActive/.test(gs)
            || !/sentenceMatches/.test(gs)
            || !/isEffectActivationLocked[\s\S]*activationLockTimingActive/.test(gs)) {
            report.semanticIssues.activationLockBracketClauseLeak.push({
                id: 'RUNTIME',
                name: 'Activation lock bracket clause guard',
                reason: 'Activation-lock runtime must preserve full negative activation sentences containing embedded [Security] labels and respect explicit Your/Opponent turn windows.'
            });
        }
    } catch(e) {
        report.semanticIssues.activationLockBracketClauseLeak.push({ id:'RUNTIME', name:'Round 20E guard', reason:'Activation-lock bracket clause guard failed: '+e.message });
    }

    // Round 20D: common conditions used by real card mechanics must not fall
    // through to the default "unsupported condition = true" branch.
    // HAS_KEYWORD and IS_SUSPENDED are small but high-impact legality gates.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasKeywordCase = /case ['"]HAS_KEYWORD['"]/.test(gs);
        const hasSuspendedCase = /case ['"]IS_SUSPENDED['"]/.test(gs);
        const defaultStillPermissive = /未完全支持的 condition:[\s\S]{0,140}return true;/.test(gs);
        if (!hasKeywordCase || !hasSuspendedCase) {
            report.semanticIssues.explicitConditionRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Explicit condition runtime guard',
                reason: 'HAS_KEYWORD and IS_SUSPENDED must be explicitly evaluated instead of falling through to permissive unsupported-condition handling.',
                hasKeywordCase,
                hasSuspendedCase,
                defaultStillPermissive
            });
        }
    } catch(e) {
        report.semanticIssues.explicitConditionRuntimeLeak.push({ id:'RUNTIME', name:'Round 20D guard', reason:'Explicit condition runtime guard failed: '+e.message });
    }

    // Round 20C: source/link ACE Overflow must be charged exactly once.
    // removeSourceFromHost is the central source-leave primitive and already
    // calls processOverflow with source/destination context. Callers such as
    // trashLinkedCard must not process the same moved card again.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const doubleChargePattern = /trashLinkedCard[\s\S]{0,900}removeSourceFromHost[\s\S]{0,500}processOverflow\(playerId, moved\)/.test(gs);
        if (doubleChargePattern) {
            report.semanticIssues.sourceOverflowDoubleChargeLeak.push({
                id: 'RUNTIME',
                name: 'Source/link Overflow single-charge guard',
                reason: 'trashLinkedCard or another source-removal caller is charging ACE Overflow after removeSourceFromHost already charged it.',
                doubleChargePattern
            });
        }
    } catch(e) {
        report.semanticIssues.sourceOverflowDoubleChargeLeak.push({ id:'RUNTIME', name:'Round 20C guard', reason:'Source Overflow double-charge guard failed: '+e.message });
    }



    // Round 22BB: official rule revision defines the field as battle area + breeding area.
    // ACE <Overflow> must trigger when moving from breeding area to a non-field area,
    // and must not trigger for movement that stays inside the field/under-card family.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasBreedingFamily = /overflowFieldFamily[\s\S]{0,240}breedingarea/.test(gs) || /fromOverflowArea[\s\S]{0,240}breedingarea/.test(gs);
        if (!hasBreedingFamily) {
            report.semanticIssues.fieldOverflowBreedingAreaLeak.push({
                id: 'RUNTIME',
                name: 'Field Overflow breeding-area guard',
                reason: 'isOverflowMovement must treat breedingArea/raisingArea as part of the field for ACE Overflow movement checks.'
            });
        }
    } catch(e) {
        report.semanticIssues.fieldOverflowBreedingAreaLeak.push({ id:'RUNTIME', name:'Round 22BB guard', reason:'Field Overflow breeding-area guard failed: '+e.message });
    }

    // Round 22BC: attack-declaration timing is a simultaneous trigger window.
    // Opponent-attack listeners must not resolve/open target windows before the
    // turn player's own [When Attacking] effects from the same attack are collected.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasNormalBatch = /withTriggerBatch\('ATTACK_DECLARATION_TIMING'[\s\S]{0,2600}\{\s*resolve:\s*false\s*\}/.test(gs);
        const hasEffectAttackBatch = /withTriggerBatch\('EFFECT_ATTACK_TIMING'[\s\S]{0,900}\{\s*resolve:\s*false\s*\}/.test(gs);
        const hasPostBatchResolve = (/ATTACK_DECLARATION_TIMING[\s\S]{0,3600}shift_to_counter[\s\S]{0,420}resolveEffect\(\)/.test(gs)
            || /ATTACK_DECLARATION_TIMING[\s\S]{0,3600}queueAttackCounterHandoff[\s\S]{0,420}resolveEffect\(\)/.test(gs))
            && (/EFFECT_ATTACK_TIMING[\s\S]{0,1500}shift_to_counter[\s\S]{0,420}resolveEffect\(\)/.test(gs)
            || /EFFECT_ATTACK_TIMING[\s\S]{0,1500}queueAttackCounterHandoff[\s\S]{0,420}resolveEffect\(\)/.test(gs));
        if (!hasNormalBatch || !hasEffectAttackBatch || !hasPostBatchResolve) {
            report.semanticIssues.attackTimingSimultaneousPriorityLeak.push({
                id: 'RUNTIME',
                name: 'Attack timing simultaneous priority guard',
                reason: 'Normal and effect-created attacks must batch opponent-attack listeners, keyword attack timing, and [When Attacking] effects before resolving, then continue into shift_to_counter.'
            });
        }
    } catch(e) {
        report.semanticIssues.attackTimingSimultaneousPriorityLeak.push({ id:'RUNTIME', name:'Round 22BC guard', reason:'Attack timing priority guard failed: '+e.message });
    }


    // Round 20B: live bots/replay drivers must use the same guarded action path
    // as Socket.IO clients. Direct GameState method calls bypass spectator,
    // spoofing, memory-side, pending-owner, and BO3 match-recording guards.
    try {
        const serverPath = path.join(__dirname, 'server.js');
        const serverText = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';
        const hasSharedGuard = /function executeGuardedRoomAction/.test(serverText)
            && /function applyGameAction/.test(serverText)
            && /createLiveBotSocketActionGuard/.test(serverText)
            && /botActionPathGuard/.test(serverText)
            && /module\.exports[\s\S]*executeGuardedRoomAction/.test(serverText)
            && /module\.exports[\s\S]*createLiveBotSocketActionGuard/.test(serverText);
        const handlerUsesGuard = /socket\.on\('action'[\s\S]*executeGuardedRoomAction/.test(serverText);
        const duplicateSwitchLeak = /socket\.on\('action'[\s\S]{0,1400}case 'hatch':\s*game\.hatchEgg/.test(serverText);
        if (!hasSharedGuard || !handlerUsesGuard || duplicateSwitchLeak) {
            report.semanticIssues.liveBotSocketActionPathLeak.push({
                id: 'RUNTIME',
                name: 'Live bot/socket action path guard',
                reason: 'Bots and socket clients must share executeGuardedRoomAction/applyGameAction so automation cannot bypass server guards or BO3 recording.',
                hasSharedGuard,
                handlerUsesGuard,
                duplicateSwitchLeak
            });
        }
    } catch(e) {
        report.semanticIssues.liveBotSocketActionPathLeak.push({ id:'RUNTIME', name:'Round 20B guard', reason:'Live bot/socket action path guard failed: '+e.message });
    }

    // Round 20A: SECURITY_REMOVED_BY_EFFECT must be an explicit condition.
    // It should pass for effects/costs that remove security, but must not pass
    // for normal security checks. Also protect turn transition from stale
    // pendingEndPhase snapshots that can create duplicate same-player turns.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasCondition = /case ['\"]SECURITY_REMOVED_BY_EFFECT['\"]/.test(gs)
            && /byEffect/.test(gs)
            && /byCost/.test(gs)
            && /byCheck/.test(gs)
            && /SECURITY_CHECK/.test(gs);
        if (!hasCondition) {
            report.semanticIssues.securityRemovedByEffectConditionLeak.push({
                id: 'RUNTIME',
                name: 'SECURITY_REMOVED_BY_EFFECT condition',
                reason: 'SECURITY_REMOVED_BY_EFFECT must not fall through as unsupported/true; it must require security removal by an effect/cost and exclude normal security checks.',
                hasCondition
            });
        }
    } catch(e) {
        report.semanticIssues.securityRemovedByEffectConditionLeak.push({ id:'RUNTIME', name:'Round 20A guard', reason:'SECURITY_REMOVED_BY_EFFECT guard failed: '+e.message });
    }

    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasTransitionGuard = /_turnTransitionInProgress/.test(gs)
            && /cp !== this\.turnPlayer/.test(gs)
            && /pending\.turnCount !== this\.turnCount/.test(gs)
            && /Ignored stale pending end phase/.test(gs);
        if (!hasTransitionGuard) {
            report.semanticIssues.staleTurnTransitionRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Stale end-phase transition guard',
                reason: 'continuePendingEndPhase/completeTurnTransition must reject stale player/turn snapshots to prevent duplicate turn starts and extra draws.',
                hasTransitionGuard
            });
        }
    } catch(e) {
        report.semanticIssues.staleTurnTransitionRuntimeLeak.push({ id:'RUNTIME', name:'Round 20A guard', reason:'Stale turn-transition guard failed: '+e.message });
    }

    // Round 19Z: after the defender passes Counter/Blocker, combat System work
    // must auto-resolve. Otherwise live rooms can log bypassed Counter / no legal
    // blockers while the queued execute_attack never flips/removes security.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntime = /autoResolveCombatDamageStep\s*\(/.test(gs)
            && /execute_attack\|resolve_security_battle\|trash_security\|sec_check/.test(gs)
            && /performBlock[\s\S]{0,2600}autoResolveCombatDamageStep\s*\(\)/.test(gs)
            && /skipBlock[\s\S]{0,900}autoResolveCombatDamageStep\s*\(\)/.test(gs);
        if (!hasRuntime) {
            report.semanticIssues.securityCheckAutoResolutionLeak.push({
                id: 'RUNTIME',
                name: 'Security check auto-resolution',
                reason: 'Counter/Blocker auto-pass must automatically drain combat System effects so a player attack actually flips/removes security and reaches End of Attack.',
                hasRuntime
            });
        }
    } catch(e) {
        report.semanticIssues.securityCheckAutoResolutionLeak.push({ id:'RUNTIME', name:'Round 19Z guard', reason:'Security auto-resolution guard failed: '+e.message });
    }

    // Round 19Y: "can't attack Digimon" is a targeted attack restriction on
    // the selected Digimon, distinct from CANT_ATTACK_PLAYER and generic STUN.
    // It must be applied through the normal target/status pipeline so cards like
    // P-135 ShoeShoemon can choose 1 opponent Digimon and bind the Security A.-1
    // follow-up to that same target.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntime = /case 'CANT_ATTACK_DIGIMON':[\s\S]{0,500}case 'PREVENT_PLAYER_ATTACK'/.test(gs)
            && /\[(?:'COLOR_CHANGE',\s*)?(?:'TREAT_AS_DIGIMON',\s*)?'CANT_ATTACK', 'CANT_ATTACK_PLAYER', 'CANT_ATTACK_DIGIMON'/.test(gs)
            && /recordLastStructuredTarget\(playerId, resolvedOwner, targetDigimon, action\)/.test(gs);
        const shoe = allCards.find(card => card.id === 'P-135');
        const shoeJson = JSON.stringify(shoe?.mechanics || []);
        const shoeOk = /CANT_ATTACK_DIGIMON/.test(shoeJson)
            && /Security A\. -1/.test(shoeJson)
            && /DP_MOD/.test(shoeJson)
            && /-2000/.test(shoeJson)
            && !((shoe?.mechanics || []).some(m => m.trigger === 'WHEN_DIGIVOLVING' && JSON.stringify(m).includes('Jamming')));
        const badCards = allCards.filter(card => {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/(?:can't|cannot|can\s*not)\s+attack\s+(?:(?:your\s+)?opponent['’]?s\s+)?digimon/i.test(text)) return false;
            const json = JSON.stringify(card.mechanics || []);
            return !/CANT_ATTACK_DIGIMON/.test(json) || /"type"\s*:\s*"STUN"/.test(json);
        });
        if (!hasRuntime || !shoeOk || badCards.length) {
            report.semanticIssues.cantAttackDigimonTargetLeak.push({
                id: 'RUNTIME',
                name: 'CANT_ATTACK_DIGIMON target legality',
                reason: 'Printed “can’t attack Digimon” must target/apply CANT_ATTACK_DIGIMON to the selected Digimon, not the source, STUN, or fake Jamming.',
                hasRuntime,
                shoeOk,
                badCards: badCards.map(c => c.id)
            });
        }
    } catch(e) {
        report.semanticIssues.cantAttackDigimonTargetLeak.push({ id:'RUNTIME', name:'Round 19Y guard', reason:'CANT_ATTACK_DIGIMON guard failed: '+e.message });
    }

    // Round 19X: <Blitz> is an optional processing effect checked when
    // the keyword activates and only if memory is already on the opponent's
    // side. It must open an attack target choice and continue through normal
    // attack timing, not become a passive Rush-like keyword or AOE grant.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasBlitzCards = allCards.some(card => /＜?\s*Blitz\s*＞?|\bBlitz\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /startBlitzAttackChoice/.test(gs)
            && /resolveBlitzChoice/.test(gs)
            && /BLITZ_TARGET_CHOICE/.test(gs)
            && /isMemoryOnOpponentSide\(playerId\)/.test(gs)
            && /SKIP_BLITZ/.test(gs)
            && /blitz:\s*has\('blitz'/.test(gs);
        const badRuntime = /case 'GRANT_KEYWORD':[\s\S]{0,900}blitz[\s\S]{0,900}getBattleAreaAoeTargetsForAction/.test(gs) && !/startBlitzAttackChoice/.test(gs);
        if (hasBlitzCards && (!hasRuntime || badRuntime)) {
            report.semanticIssues.blitzTimingRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Blitz timing/runtime',
                reason: '<Blitz> must be an optional attack opportunity when memory is on the opponent side, preserving normal attack legality and Counter/Blocker timing.',
                hasBlitzCards,
                hasRuntime,
                badRuntime
            });
        }
    } catch(e) {
        report.semanticIssues.blitzTimingRuntimeLeak.push({ id:'RUNTIME', name:'Round 19X guard', reason:'Blitz runtime guard failed: '+e.message });
    }

    // Round 19W: forced attacks should choose a legal attack target. If a
    // Digimon cannot attack players, the effect should still attack an
    // opponent's legal Digimon target when one exists, instead of hardcoding a
    // player attack and fizzling incorrectly.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntime = /getForcedAttackTargetOptions/.test(gs)
            && /startForcedAttackWithLegalTarget/.test(gs)
            && /FORCED_ATTACK_TARGET_CHOICE/.test(gs)
            && /canDeclareAttackAgainst\(playerId, attacker, 'player'\)/.test(gs)
            && /canAttackTargetDigimon\(playerId, attacker, opponentId, target\)/.test(gs);
        const oldHardcoded = /processForcedStartMainAttacks[\s\S]{0,900}declareAttack\(activePlayerId, card\.instanceId, 'player', null\)/.test(gs);
        if (!hasRuntime || oldHardcoded) {
            report.semanticIssues.forcedAttackTargetLegalityLeak.push({
                id: 'RUNTIME',
                name: 'Forced attack target legality',
                reason: 'Forced “this Digimon attacks” flow must select a legal target; CANT_ATTACK_PLAYER should fall back to legal Digimon targets when available.',
                hasRuntime,
                oldHardcoded
            });
        }
    } catch(e) {
        report.semanticIssues.forcedAttackTargetLegalityLeak.push({ id:'RUNTIME', name:'Round 19W guard', reason:'Forced attack target legality guard failed: '+e.message });
    }

    // Round 19V: "can't be attacked" is protection on the defending target,
    // not STUN/CANT_ATTACK on that Digimon. Attack declaration must reject the
    // target, but target-changing effects such as Raid remain handled by their
    // own timing windows.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const protectedCards = allCards.filter(card => /(?:can't|cannot|can\s*not)\s+be\s+attacked/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /getCantBeAttackedState/.test(gs)
            && /canAttackTargetDigimon/.test(gs)
            && /CANT_BE_ATTACKED/.test(gs)
            && /targetGate\.reason\s*===\s*'CANT_BE_ATTACKED'/.test(gs);
        const badStunCards = protectedCards.filter(card => JSON.stringify(card.mechanics || []).includes('"type":"STUN"') || JSON.stringify(card.mechanics || []).includes('"type": "STUN"'));
        if (protectedCards.length && (!hasRuntime || badStunCards.length)) {
            report.semanticIssues.cantBeAttackedRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Cannot be attacked runtime/encoding',
                reason: 'Printed “can’t be attacked” must be target protection at attack declaration, not STUN/can’t-attack encoding.',
                hasRuntime,
                badCards: badStunCards.map(c => c.id)
            });
        }
    } catch(e) {
        report.semanticIssues.cantBeAttackedRuntimeLeak.push({ id:'RUNTIME', name:'Round 19V guard', reason:'Cannot-be-attacked guard failed: '+e.message });
    }

    // Round 19U: <Raid> is an optional trigger when the Digimon attacks. It
    // may switch any current attack target to one of the opponent's unsuspended
    // Digimon tied for highest DP; it must not be limited to player attacks or
    // encoded as normal battle/delete/redirect card actions.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRaidCards = allCards.some(card => /＜?\s*Raid\s*＞?|Raid/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /mode:\s*'RAID_TARGET_CHOICE'/.test(gs)
            && /optional:\s*true/.test(gs)
            && /highestDp/.test(gs)
            && /!c\.isSuspended/.test(gs)
            && /changeAttackTargetToDigimon\(playerId, pending\.targetOwnerId/.test(gs);
        const playerOnlyRuntime = /kw\.raid\s*&&\s*this\.counterTiming\.pendingAttack\.targetType\s*===\s*'player'/.test(gs);
        if (hasRaidCards && (!hasRuntime || playerOnlyRuntime)) {
            report.semanticIssues.raidTargetLegalityLeak.push({
                id: 'RUNTIME',
                name: 'Raid runtime',
                reason: '<Raid> must be optional and choose among opponent unsuspended highest-DP Digimon whenever the Digimon attacks, not only when attacking a player.',
                hasRaidCards,
                hasRuntime,
                playerOnlyRuntime
            });
        }
    } catch(e) {
        report.semanticIssues.raidTargetLegalityLeak.push({ id: 'RUNTIME', name: 'Round 19U guard', reason: 'Raid runtime guard failed: ' + e.message });
    }

    // Round 19T: <Alliance> is paid by suspending 1 of your other Digimon.
    // The selectable ally list and submitChoice resolver must both reject
    // Digimon that cannot legally suspend, such as cards under "can't suspend".
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasAllianceCards = allCards.some(card => /＜?\s*Alliance\s*＞?|\bAlliance\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /canUseAsAllianceAlly/.test(gs)
            && /filter\(c\s*=>\s*this\.canUseAsAllianceAlly\(playerId, attacker, c\)\)/.test(gs)
            && /!this\.canUseAsAllianceAlly\(playerId, attacker, ally\)/.test(gs)
            && /canSuspendCard\(playerId, ally, \{ reason: 'alliance'/.test(gs);
        const oldBroadAlliance = /const\s+candidates\s*=\s*\(this\.zones\[playerId\]\.battleArea\s*\|\|\s*\[\]\)\.filter\(c\s*=>\s*c\.instanceId\s*!==\s*attacker\.instanceId\s*&&\s*!c\.isSuspended\s*&&\s*this\.isDigimonLike\(c\)\)/.test(gs);
        if (hasAllianceCards && (!hasRuntime || oldBroadAlliance)) {
            report.semanticIssues.allianceCantSuspendRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Alliance runtime',
                reason: "<Alliance> must only offer and resolve another Digimon that can legally suspend; \"can\'t suspend\" allies are not legal Alliance partners.",
                hasAllianceCards,
                hasRuntime,
                oldBroadAlliance
            });
        }
    } catch(e) {
        report.semanticIssues.allianceCantSuspendRuntimeLeak.push({ id: 'RUNTIME', name: 'Round 19T guard', reason: 'Alliance can-suspend guard failed: ' + e.message });
    }

    // Round 19S: <Collision> has a Digimon-affecting Blocker grant plus a
    // player-affecting forced-block rule. Unaffected Digimon must not gain
    // Blocker from Collision; they are forced to block only if they already
    // have a legal native Blocker.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasCollisionCards = allCards.some(card => /＜?\s*Collision\s*＞?|\bCollision\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /canGainCollisionBlocker/.test(gs) && /canBlockDuringCollision/.test(gs) && /isActionBlockedByImmunity\(defenderId, card, 'GRANT_KEYWORD'/.test(gs);
        const oldBroadCollision = /getCollisionBlockers[\s\S]*?return \(this\.zones\?\.\[playerId\]\?\.battleArea[^;]+this\.canSuspendCard\(playerId, card, \{ reason: 'block', silent: true \}\)\s*\);/.test(gs) && !/canBlockDuringCollision/.test(gs);
        if (hasCollisionCards && (!hasRuntime || oldBroadCollision)) {
            report.semanticIssues.collisionImmunityBlockerLeak.push({
                id: 'RUNTIME',
                name: 'Collision runtime',
                reason: '<Collision> must not make unaffected non-Blocker Digimon block by treating every unsuspended Digimon as a legal blocker.',
                hasCollisionCards,
                hasRuntime,
                oldBroadCollision
            });
        }
    } catch(e) {
        report.semanticIssues.collisionImmunityBlockerLeak.push({ id: 'RUNTIME', name: 'Round 19S guard', reason: 'Collision immunity/blocker guard failed: ' + e.message });
    }

    // Round 19R: <Evade> is an optional deletion replacement paid by
    // suspending that Digimon. It must not be encoded as fake On Deletion / generic
    // PREVENT_LEAVE_PLAY mechanics, and the runtime must expose a real EVADE choice
    // only when the Digimon can legally suspend.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const hasEvadeCards = allCards.some(card => /＜?\s*Evade\s*＞?|\bEvade\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasEvadeRuntime = /canUseEvade/.test(gs) && /choice === 'EVADE'/.test(gs) && /triggerDigimonSuspendedEvent\(playerId, card, \{ byEvade: true/.test(gs) && /USE \[EVADE\]/.test(html);
        const oldCanEvadeLeak = /const\s+canEvade\s*=\s*kw\.evade\s*&&\s*!card\.isSuspended/.test(gs);
        if (hasEvadeCards && (!hasEvadeRuntime || oldCanEvadeLeak)) {
            report.semanticIssues.evadeRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Evade runtime',
                reason: '<Evade> must expose an optional EVADE protection choice only if the Digimon can legally suspend, and using it must trigger suspension events.',
                hasEvadeCards,
                hasEvadeRuntime,
                oldCanEvadeLeak
            });
        }
        const walkActions = function*(obj){
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { for (const v of obj) yield* walkActions(v); return; }
            if (obj.type) yield obj;
            for (const v of Object.values(obj)) yield* walkActions(v);
        };
        for (const card of allCards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/＜?\s*Evade\s*＞?|\bEvade\b/i.test(text)) continue;
            (card.mechanics || []).forEach((mechanic, mechanicIndex) => {
                const trigger = mechanic && mechanic.trigger;
                if (!['ON_DELETION','WOULD_BE_DELETED'].includes(trigger)) return;
                const blob = JSON.stringify(mechanic || {});
                if (/PREVENT_LEAVE_PLAY|SUSPEND_OPPONENT/.test(blob)) {
                    report.semanticIssues.evadeRuntimeLeak.push(createSemanticIssue(card,
                        '<Evade> must not be encoded as ON_DELETION/WOULD_BE_DELETED -> PREVENT_LEAVE_PLAY or fake suspend actions. Runtime protection handles the optional replacement.',
                        { mechanicIndex, trigger }));
                }
            });
        }
    } catch(e) {
        report.semanticIssues.evadeRuntimeLeak.push({ id: 'RUNTIME', name: 'Round 19R guard', reason: 'Evade runtime guard failed: ' + e.message });
    }

    // Round 19Q: REQUEST_ATTACK_PLAYER must not accidentally make the effect source
    // attack when printed text says "1 of your Digimon attacks" or grants delayed
    // "[Start of Your Main Phase] This Digimon attacks." to an opponent's Digimon.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntime = /ATTACK_PLAYER_CHOICE/.test(gs) && /resolveAttackPlayerChoice/.test(gs) && /processForcedStartMainAttacks/.test(gs);
        if (!hasRuntime) {
            report.semanticIssues.effectAttackBindingLeak.push({
                id:'RUNTIME',
                name:'game-state.js',
                reason:'Effect-created attack requests must bind/select the attacking Digimon and support delayed start-main forced attack text.'
            });
        }
        const delayedGrantCards = new Set(['P-183','BT25-054']);
        const sameTargetCards = new Set(['BT19-091','BT25-057']);
        const walkActions = function*(obj){
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { for (const v of obj) yield* walkActions(v); return; }
            if (obj.type) yield obj;
            for (const v of Object.values(obj)) yield* walkActions(v);
        };
        for (const card of allCards) {
            const actions = [...walkActions(card.mechanics || [])];
            if (delayedGrantCards.has(card.id)) {
                const hasGrant = actions.some(a => a.type === 'GRANT_TRIGGER_EFFECT' && a.trigger === 'START_OF_MAIN_PHASE' && a.target?.owner === 'opponent' && JSON.stringify(a).includes('forcedAttack'));
                const badImmediate = actions.some(a => a.type === 'REQUEST_ATTACK_PLAYER' && a.target?.owner === 'opponent' && String(a.target?.cardType || '').toLowerCase().includes('digimon'));
                if (!hasGrant || badImmediate) report.semanticIssues.effectAttackBindingLeak.push(createSemanticIssue(card, 'Delayed forced attack text must be encoded as a temporary Start-of-Main granted trigger to the opponent Digimon, not immediate REQUEST_ATTACK_PLAYER.'));
            }
            if (sameTargetCards.has(card.id)) {
                const hasSameTargetAttack = actions.some(a => a.type === 'REQUEST_ATTACK_PLAYER' && a.target?.sameAsPreviousTarget === true);
                if (!hasSameTargetAttack) report.semanticIssues.effectAttackBindingLeak.push(createSemanticIssue(card, 'Follow-up "it attacks" must bind REQUEST_ATTACK_PLAYER to sameAsPreviousTarget.'));
            }
        }
    } catch(e) {
        report.semanticIssues.effectAttackBindingLeak.push({ id:'RUNTIME', name:'Round 19Q guard', reason:'Effect attack binding guard failed: '+e.message });
    }

    // Round 19P: Clauses that say "your opponent has no/an unsuspended Digimon"
    // must test Digimon suspension state, not Tamer existence, trait:"unsuspended",
    // or an unfiltered HAS_DIGIMON. Limit this guard to the cards manually fixed
    // in Round 19P so future broader audits can handle the remaining advanced cases.
    try {
        const expectedUnsuspendedConditions = {
            'BT13-047': { noUnsuspended: true },
            'RB1-020': { noUnsuspended: true },
            'RB1-003': { noUnsuspended: true },
            'BT19-062': { hasUnsuspended: true },
            'RB1-025': { noUnsuspendedAction: true },
            'BT6-067': { hasUnsuspended: true },
            'BT13-052': { noUnsuspended: true },
            'RB1-022': { noUnsuspended: true },
            'BT6-062': { hasUnsuspended: true }
        };
        const isUnsuspendedDigimonCond = (cond, wantNo) => {
            if (!cond || cond.type !== 'HAS_DIGIMON') return false;
            if (cond.owner !== 'opponent') return false;
            if (cond.cardType && cond.cardType !== 'digimon') return false;
            if (cond.isUnsuspended !== true) return false;
            const op = String(cond.operator || '').toLowerCase();
            const value = Number(cond.value ?? (wantNo ? 0 : 1));
            if (wantNo) return value === 0 && ['==', '=', 'equals', '==='].includes(op || '==');
            return value >= 1 && ['>=', '>', 'exists', ''].includes(op);
        };
        const walkConditions = (obj, out = []) => {
            if (!obj || typeof obj !== 'object') return out;
            if (Array.isArray(obj)) { obj.forEach(v => walkConditions(v, out)); return out; }
            if (obj.type) out.push(obj);
            Object.values(obj).forEach(v => walkConditions(v, out));
            return out;
        };
        for (const card of allCards) {
            const cfg = expectedUnsuspendedConditions[card.id];
            if (!cfg) continue;
            const conditions = walkConditions(card.mechanics || []);
            const hasNo = conditions.some(cond => isUnsuspendedDigimonCond(cond, true));
            const hasYes = conditions.some(cond => isUnsuspendedDigimonCond(cond, false));
            const polluted = conditions.some(cond =>
                (cond.type === 'HAS_TAMER' && /unsuspended|opponent/i.test(String(cond.trait || cond.name || ''))) ||
                (cond.type === 'HAS_TRAIT' && /unsuspended/i.test(String(cond.trait || ''))) ||
                (cond.type === 'SOURCE_COUNT' && cond.owner === 'opponent') ||
                (cond.type === 'HAS_DIGIMON' && cond.owner === 'opponent' && cond.isUnsuspended !== true)
            );
            if ((cfg.noUnsuspended || cfg.noUnsuspendedAction) && !hasNo) {
                report.semanticIssues.unsuspendedDigimonConditionLeak.push(createSemanticIssue(card,
                    'Missing canonical condition for "opponent has no unsuspended Digimon": HAS_DIGIMON owner:opponent isUnsuspended:true operator == value 0.'));
            }
            if (cfg.hasUnsuspended && !hasYes) {
                report.semanticIssues.unsuspendedDigimonConditionLeak.push(createSemanticIssue(card,
                    'Missing canonical condition for "opponent has an unsuspended Digimon": HAS_DIGIMON owner:opponent isUnsuspended:true operator >= value 1.'));
            }
            if (polluted) {
                report.semanticIssues.unsuspendedDigimonConditionLeak.push(createSemanticIssue(card,
                    'Unsuspended-Digimon condition is polluted by HAS_TAMER/HAS_TRAIT/SOURCE_COUNT or unfiltered HAS_DIGIMON.'));
            }
        }
    } catch (e) {
        report.semanticIssues.unsuspendedDigimonConditionLeak.push({ id:'RUNTIME', name:'Round 19P guard', reason:'Unsuspended Digimon condition guard failed: '+e.message });
    }

    // Round 19O: <Vortex> is optional. Runtime must expose a target/skip
    // choice instead of auto-selecting an opponent Digimon and attacking.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasVortexCards = allCards.some(card => /＜\s*Vortex\s*＞|\bvortex\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasOptionalChoiceRuntime = /VORTEX_TARGET_CHOICE/.test(gs) && /resolveVortexChoice/.test(gs) && /SKIP_VORTEX/.test(gs);
        const vortexCaseReturnsOnPendingChoice = /case 'VORTEX_ATTACK_REQUEST':[\s\S]*requestVortexAttack[\s\S]*pendingChoice\?\.mode === 'VORTEX_TARGET_CHOICE'[\s\S]*return;/.test(gs);
        if (hasVortexCards && (!hasOptionalChoiceRuntime || !vortexCaseReturnsOnPendingChoice)) {
            report.semanticIssues.vortexOptionalTargetRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: '<Vortex> must open an optional target/skip choice instead of auto-attacking.',
                details: { hasOptionalChoiceRuntime, vortexCaseReturnsOnPendingChoice }
            });
        }
    } catch (e) {
        report.semanticIssues.vortexOptionalTargetRuntimeLeak.push({ id: 'RUNTIME', name: 'game-state.js', reason: 'Vortex optional runtime guard failed: ' + e.message });
    }

    // Round 19L: Partition clauses can specify color+level requirements
    // (for example Yellow Lv.6 & Purple/Black Lv.6). Runtime must parse each
    // ampersand-separated clause as one required source, preserving slash as
    // color OR rather than splitting it into extra independent requirements.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasColorLevelPartitionCards = cards.some(card => /Partition\s*\([^)]*(?:Lv\.?|Level)\s*\d+/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntimeSupport = /parsePartitionSpecs/.test(gs) && /sourceMatchesPartitionSpec/.test(gs) && /cardHasColor\(sourceCard/.test(gs) && /split\(\/\\\/\|\\bor\\b\/i\)/.test(gs);
        const slashSplitLeak = gs.includes('.split(/&|,|\\/|\\band\\b/i)');
        if (hasColorLevelPartitionCards && (!hasRuntimeSupport || slashSplitLeak)) {
            report.semanticIssues.partitionColorLevelRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Partition color/level runtime support',
                reason: 'Partition must support color+level source specs and preserve slash-separated colors as OR within one required source.',
                hasColorLevelPartitionCards,
                hasRuntimeSupport,
                slashSplitLeak
            });
        }
    } catch(e) {}

    // Round 19K: <Barrier> has an optional processing condition. Runtime must
    // open the protection window and wait for the player's BARRIER/NONE choice;
    // it must not automatically trash security from applyLeaveReplacement.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const hasBarrierCards = cards.some(card => /＜?\s*Barrier\s*＞?|\bBarrier\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasPendingBarrier = /canUseBarrier/.test(gs) && /choice === 'BARRIER'/.test(gs) && /barrier:\s*canBarrier/.test(gs) && /USE \[BARRIER\]/.test(html);
        const hasAutoBarrier = /isBattleDeletion && \/＜\?\\s\*barrier[\s\S]{0,220}trashTopSecurityForKeywordCost\(playerId\)/.test(gs);
        if (hasBarrierCards && (!hasPendingBarrier || hasAutoBarrier)) {
            report.semanticIssues.barrierOptionalWindowLeak.push({
                id: 'RUNTIME',
                name: 'Barrier optional protection window',
                reason: '<Barrier> must expose an optional BARRIER protection choice and must not auto-trash top security before the player chooses it.',
                hasBarrierCards,
                hasPendingBarrier,
                hasAutoBarrier
            });
        }
    } catch(e) {}

    // Round 19J: Armor Purge promotes the top source while keeping the battle object stable.
    // The trashed outer armor shell must get a fresh physical instanceId; otherwise
    // the same id can exist in battle and trash after the replacement resolves.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasArmorShellId = /armor-shell/.test(gs) && /skin\.instanceId\s*=/.test(gs) && /choice === 'ARMOR_PURGE'/.test(gs);
        if (!hasArmorShellId) {
            report.semanticIssues.armorPurgeInstanceIdLeak.push({
                id: 'RUNTIME',
                name: 'Armor Purge instance identity',
                reason: 'Armor Purge must assign a unique instanceId to the trashed outer shell while preserving the battle object instanceId for the promoted Digimon.',
                hasArmorShellId
            });
        }
    } catch(e) {}

    // Round 19D: Counter/Blast ACE permission guard. Counter timing may activate
    // one [Counter] effect per attack; it is not a second Main Phase. Runtime/UI
    // must support non-Blast [Counter] effects and still block normal actions.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const serverPath = path.join(__dirname, 'server.js');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const server = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, 'utf8') : '';
        const hasGenericCounterRuntime = /getAvailableCounterEffectOptions/.test(gs) && /performCounterEffect/.test(gs) && /actionType === 'COUNTER_EFFECT'/.test(gs);
        const blocksMainDuringCounter = /game\.counterTiming\?\.isActive/.test(server) && /blocked during counter\/block timing/.test(server);
        const hasCounterUi = /counter-effect-btn/.test(html) && /executeCounterEffectProtocol/.test(html);
        if (!hasGenericCounterRuntime || !blocksMainDuringCounter || !hasCounterUi) {
            report.semanticIssues.counterBlastPermissionLeak.push({
                id: 'RUNTIME',
                name: 'Counter / Blast ACE runtime',
                reason: 'Counter timing must support legal [Counter] effects while blocking ordinary Main Phase actions.',
                hasGenericCounterRuntime,
                blocksMainDuringCounter,
                hasCounterUi
            });
        }
    } catch(e) {}

    // Round 19E: Blast DNA must be represented separately from normal Blast Digivolve.
    // These cards use a Counter-timing DNA procedure with two materials and DNA context,
    // not a one-base ACE Blast Digivolve shortcut.
    try {
        for (const card of cards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/Blast\s+DNA\s+Digivolve/i.test(text)) continue;
            const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
            const counterMechanics = mechanics.filter(m => String(m?.trigger || '').toUpperCase() === 'COUNTER');
            const counterActions = counterMechanics.flatMap(m => Array.isArray(m.actions) ? m.actions : []);
            const hasBlastDna = counterActions.some(a => String(a?.type || '').toUpperCase() === 'BLAST_DNA_DIGIVOLVE');
            const hasPlainBlast = counterActions.some(a => String(a?.type || '').toUpperCase() === 'BLAST_DIGIVOLVE');
            if (!hasBlastDna || hasPlainBlast) {
                report.semanticIssues.blastDnaEncodingLeak.push(createSemanticIssue(card,
                    'Blast DNA Digivolve must use COUNTER -> BLAST_DNA_DIGIVOLVE and must not be encoded as ordinary BLAST_DIGIVOLVE.',
                    { hasBlastDna, hasPlainBlast }));
            }
        }
    } catch(e) {}


    // Round 19F: <Fragment (N)> is a deletion replacement keyword and must not
    // silently behave like a normal deletion. Runtime must expose it through the
    // protection layer and trash sources with source-to-trash movement context.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const hasFragmentCards = cards.some(card => /Fragment\s*[（(]\s*\d+\s*[）)]/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasRuntime = /parseFragmentAmount/.test(gs) && /resolveFragment/.test(gs) && /choice === 'FRAGMENT'/.test(gs) && /fromZone:\s*'source'[\s\S]{0,180}cause:\s*'FRAGMENT'/.test(gs);
        const hasProtectionOption = /fragment:\s*canFragment/.test(gs) && /USE \[FRAGMENT\]/.test(html);
        if (hasFragmentCards && (!hasRuntime || !hasProtectionOption)) {
            report.semanticIssues.fragmentRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Fragment replacement runtime/UI',
                reason: '<Fragment (N)> cards exist, so deletion prevention must expose Fragment and trash source cards with source-leave context.',
                hasFragmentCards,
                hasRuntime,
                hasProtectionOption
            });
        }
        for (const card of cards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/Fragment\s*[（(]\s*\d+\s*[）)]/i.test(text)) continue;
            const encoded = JSON.stringify(card.mechanics || []);
            if (/ON_DELETION[\s\S]{0,160}TRASH_SOURCE|ARMOR_PURGE|FORTITUDE|BARRIER/.test(encoded)) {
                report.semanticIssues.fragmentRuntimeLeak.push(createSemanticIssue(card,
                    'Fragment should stay in runtime replacement layer, not be encoded as On Deletion/trash-source/other protection keyword mechanics.',
                    {}));
            }
        }
    } catch(e) {}


    // Round 19G: <Jamming> only prevents deletion in battles against Security Digimon.
    // It must not remain as generic leave-play protection or stun mechanics, because
    // those would incorrectly protect against normal battles/effects or block actions.
    try {
        for (const card of cards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/Jamming/i.test(text) || !/Security\s+Digimon/i.test(text)) continue;
            const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
            mechanics.forEach((mech, mechanicIndex) => {
                const actions = Array.isArray(mech.actions) ? mech.actions : [];
                actions.forEach((action, actionIndex) => {
                    const type = String(action?.type || '').toUpperCase();
                    if (type !== 'PREVENT_LEAVE_PLAY' && type !== 'STUN') return;
                    const trigger = String(mech?.trigger || '').toUpperCase();
                    const blob = JSON.stringify({ trigger: mech.trigger, condition: mech.condition, action }).toLowerCase();
                    const looksLikeSecurityBattleJamming = /security\s+digimon|security/.test(blob) ||
                        (type === 'STUN' && trigger === 'SECURITY') ||
                        (type === 'PREVENT_LEAVE_PLAY' && ['MAIN','ON_PLAY','WHEN_ATTACKING','WHEN_BLOCKING','SECURITY'].includes(trigger));
                    if (!looksLikeSecurityBattleJamming) return;
                    report.semanticIssues.jammingOverprotectionLeak.push(createSemanticIssue(card,
                        'Printed <Jamming> must be handled only by the Security Digimon battle check, not by generic PREVENT_LEAVE_PLAY/STUN mechanics.',
                        { mechanicIndex, actionIndex, trigger: mech.trigger, actionType: action.type }));
                });
            });
        }
    } catch(e) {}

    // Round 19H: <Decoy (X)> is an opponent-effect deletion replacement keyword.
    // It can scope by color (Black/White, Red/Black) or trait/name. It must not be
    // represented as ON_DELETION / WOULD_BE_PLAYED / WHEN_DIGIVOLVING fake
    // PREVENT_LEAVE_PLAY mechanics, and runtime must parse color scopes.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRuntime = /parseDecoyTokens/.test(gs) && /cardMatchesDecoyToken/.test(gs) && /cardHasColor/.test(gs) && /sourcePlayerId[\s\S]{0,220}!== playerId/.test(gs);
        const hasLiveKeywordText = /card\.turnEffects[\s\S]{0,220}eff\?\.keyword/.test(gs) && /continuous\.providers/.test(gs);
        if (!hasRuntime || !hasLiveKeywordText) {
            report.semanticIssues.decoyRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Decoy replacement runtime',
                reason: 'Decoy must support color/trait scopes and gained Decoy keyword text during opponent-effect deletion replacement.',
                hasRuntime,
                hasLiveKeywordText
            });
        }
        for (const card of cards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            if (!/Decoy\s*\(/i.test(text)) continue;
            const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
            mechanics.forEach((mech, mechanicIndex) => {
                const trigger = String(mech?.trigger || '').toUpperCase();
                const actions = Array.isArray(mech.actions) ? mech.actions : [];
                const hasPrevent = actions.some(a => String(a?.type || '').toUpperCase() === 'PREVENT_LEAVE_PLAY');
                const hasSelfDelete = actions.some(a => String(a?.type || '').toUpperCase() === 'DELETE_DIGIMON' && JSON.stringify(a).toLowerCase().includes(String(card.name || '').toLowerCase()));
                if (hasPrevent && ['ON_DELETION','WHEN_DIGIVOLVING','WOULD_BE_PLAYED','ALL_TURNS','YOUR_TURN','OPPONENTS_TURN'].includes(trigger)) {
                    report.semanticIssues.decoyRuntimeLeak.push(createSemanticIssue(card,
                        'Printed <Decoy> must stay in the runtime replacement layer, not fake trigger mechanics with PREVENT_LEAVE_PLAY/self-delete.',
                        { mechanicIndex, trigger, hasPrevent, hasSelfDelete }));
                }
            });
        }
    } catch(e) {}



    // Round 19I: Retaliation is a runtime battle keyword, not a trait and not an
    // ordinary [On Deletion] effect. A Digimon with <Retaliation> deletes the
    // battled Digimon only when it is deleted after losing a battle; it must not
    // fire from effect deletion or target arbitrary opponent Digimon.
    try {
        const keywordTraitPaths = [];
        const scanRetaliationTrait = (obj, pathLabel = '') => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) return obj.forEach((v, i) => scanRetaliationTrait(v, `${pathLabel}[${i}]`));
            if (obj.trait === 'Retaliation') keywordTraitPaths.push(`${pathLabel}.trait`);
            if (Array.isArray(obj.traitAny) && obj.traitAny.includes('Retaliation')) keywordTraitPaths.push(`${pathLabel}.traitAny`);
            Object.entries(obj).forEach(([k, v]) => scanRetaliationTrait(v, pathLabel ? `${pathLabel}.${k}` : k));
        };
        for (const card of cards) {
            const text = [card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ');
            const mentionsRetaliation = /Retaliation/i.test(text);
            const mechanics = Array.isArray(card.mechanics) ? card.mechanics : [];
            keywordTraitPaths.length = 0;
            scanRetaliationTrait(mechanics, 'mechanics');
            if (keywordTraitPaths.length > 0) {
                report.semanticIssues.retaliationKeywordEncodingLeak.push(createSemanticIssue(card,
                    'Retaliation is a keyword, not a trait. Use target.keyword:"Retaliation" or runtime getKeywords(), never trait:"Retaliation".',
                    { paths: keywordTraitPaths.slice(0, 8) }));
            }
            if (!mentionsRetaliation) continue;
            mechanics.forEach((mech, mechanicIndex) => {
                const trigger = String(mech?.trigger || '').toUpperCase();
                if (trigger !== 'ON_DELETION') return;
                const blob = JSON.stringify(mech || {});
                const looksLikeFakeRetaliation = /Retaliation/.test(blob) && /DELETE_DIGIMON/.test(blob);
                if (looksLikeFakeRetaliation) {
                    report.semanticIssues.retaliationKeywordEncodingLeak.push(createSemanticIssue(card,
                        '<Retaliation> must not be encoded as ON_DELETION -> DELETE_DIGIMON. Runtime battle resolution handles losing-battle retaliation only.',
                        { mechanicIndex, trigger }));
                }
            });
        }
    } catch(e) {}


    // Round 19M: <Fortitude> is mandatory trigger-type processing after a
    // Digimon with digivolution cards is deleted. It must not be treated as a
    // would-be-deleted replacement shield, and effects that reference Digimon
    // with <Fortitude> must use keyword, not trait.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasFortitudeCards = cards.some(card => /＜?\s*Fortitude\s*＞?|\bFortitude\b/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasAfterDeletionRuntime = /resolveFortitudeFromTrash/.test(gs) && /shouldResolveFortitude/.test(gs) && /sendToTrash\(playerId, deadCard/.test(gs);
        const fortitudeReplacementLeak = /isDeletion && this\.canUseFortitude\(card\)[\s\S]{0,120}resolveFortitude\(playerId, card, options\)/.test(gs);
        if (hasFortitudeCards && (!hasAfterDeletionRuntime || fortitudeReplacementLeak)) {
            report.semanticIssues.fortitudeTriggerRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Fortitude trigger runtime',
                reason: '<Fortitude> must trigger after deletion and replay the deleted card from trash; it must not prevent the deletion as a replacement.',
                hasFortitudeCards,
                hasAfterDeletionRuntime,
                fortitudeReplacementLeak
            });
        }
        const scanFortitudeTrait = (obj, paths, pathLabel = '') => {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) return obj.forEach((v, i) => scanFortitudeTrait(v, paths, `${pathLabel}[${i}]`));
            if (obj.trait === 'Fortitude') paths.push(`${pathLabel}.trait`);
            if (Array.isArray(obj.traitAny) && obj.traitAny.includes('Fortitude')) paths.push(`${pathLabel}.traitAny`);
            Object.entries(obj).forEach(([k, v]) => scanFortitudeTrait(v, paths, pathLabel ? `${pathLabel}.${k}` : k));
        };
        for (const card of cards) {
            const paths = [];
            scanFortitudeTrait(card.mechanics || [], paths, 'mechanics');
            if (paths.length > 0) {
                report.semanticIssues.fortitudeTriggerRuntimeLeak.push(createSemanticIssue(card,
                    'Fortitude is a keyword, not a trait. Effects that say Digimon cards with <Fortitude> must use keyword:"Fortitude", not trait:"Fortitude".',
                    { paths: paths.slice(0, 8) }));
            }
        }
    } catch(e) {}

    // Round 19N: <Material Save N> is optional processing when the Digimon
    // would be deleted. It may move cards under a Tamer before the deletion
    // continues, but it must not auto-save materials when the player chooses NONE.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const hasMaterialSaveCards = cards.some(card => /Material\s+Save\s+\d+/i.test([card.mainEffect || '', card.sourceEffect || '', card.effectText || ''].join(' ')));
        const hasOptionalRuntime = /canUseMaterialSave/.test(gs) && /materialSave:\s*canMaterialSave/.test(gs) && /choice === 'MATERIAL_SAVE'/.test(gs) && /resolveMaterialSave:\s*true/.test(gs) && /USE \[MATERIAL SAVE\]/.test(html);
        const autoSaveLeak = /executePhysicalDeletion[\s\S]{0,900}this\.resolveMaterialSave\(playerId, deadCard, options\);/.test(gs);
        if (hasMaterialSaveCards && (!hasOptionalRuntime || autoSaveLeak)) {
            report.semanticIssues.materialSaveOptionalRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'Material Save optional runtime',
                reason: '<Material Save> must expose an optional MATERIAL_SAVE choice; choosing NONE must still delete the Digimon without automatically moving sources under a Tamer.',
                hasMaterialSaveCards,
                hasOptionalRuntime,
                autoSaveLeak
            });
        }
    } catch(e) {}

    // Round 18H: CRM 4.0 5-2-1-4 requires opening-hand re-draw/mulligan
    // declarations starting with the first player. Runtime must expose and enforce
    // nextMulliganPlayer before security setup.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
        const hasRuntimeOrder = /mulliganOrder\s*=\s*\[startingPlayer/.test(gs) && /nextMulliganPlayer/.test(gs) && /getExpectedMulliganPlayer\(\)/.test(gs);
        const blocksWrongPlayer = /playerId\s*!==\s*expectedPlayer/.test(gs) && /return false/.test(gs);
        const setupAfterBoth = /mulliganDecisions\.p1 !== null && this\.mulliganDecisions\.p2 !== null[\s\S]{0,700}setupInitialSecurity\('p1'\)/.test(gs);
        const uiGated = /nextMulliganPlayer/.test(html) && /canDeclareMulligan/.test(html);
        if (!hasRuntimeOrder || !blocksWrongPlayer || !setupAfterBoth || !uiGated) {
            report.semanticIssues.mulliganOrderLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js / index.html',
                reason: 'Official mulligan declarations must start with the first player and only then allow the second player.',
                hasRuntimeOrder,
                blocksWrongPlayer,
                setupAfterBoth,
                uiGated
            });
        }
    } catch(e) {}

    // Round 18I: CRM 4.0 5-2-1-5 re-draw procedure guard.
    // A player who declares re-draw returns their entire initial hand to their
    // deck, shuffles it, then draws exactly 5 new cards before security setup.
    try {
        const gs = gameStateTextForRuntimeGuards;
        const hasRedrawBranch = /if \(doMulligan\) \{[\s\S]{0,650}zone\.deck\.push\(\.\.\.zone\.hand\)/.test(gs);
        const clearsHandBeforeDraw = /zone\.hand\s*=\s*\[\]/.test(gs);
        const shufflesReturnedHand = /this\.shuffle\(zone\.deck\)/.test(gs);
        const drawsFiveNewCards = /for\s*\(let i\s*=\s*0;\s*i\s*<\s*5;\s*i\+\+\)[\s\S]{0,180}zone\.hand\.push\(zone\.deck\.pop\(\)\)/.test(gs);
        const securityAfterBoth = /mulliganDecisions\.p1 !== null && this\.mulliganDecisions\.p2 !== null[\s\S]{0,700}setupInitialSecurity\('p1'\)/.test(gs);
        if (!hasRedrawBranch || !clearsHandBeforeDraw || !shufflesReturnedHand || !drawsFiveNewCards || !securityAfterBoth) {
            report.semanticIssues.mulliganRedrawProcedureLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Official re-draw must return the entire hand to deck, shuffle, draw 5, and only set security after both players finish mulligan decisions.',
                hasRedrawBranch,
                clearsHandBeforeDraw,
                shufflesReturnedHand,
                drawsFiveNewCards,
                securityAfterBoth
            });
        }
    } catch(e) {}

    // Round 15Q: CRM 4.0 clarifies <Piercing> security checks are pending
    // until immediately before attack end, and only one security-check transition
    // may occur per attack. This runtime-level check prevents reverting to the old
    // immediate processSecurityChecks() path after battle deletion.
    try {
        const gameStateText = gameStateTextForRuntimeGuards;
        const hasPendingPiercing = gameStateText.includes('pendingPiercingSecurityCheck') &&
            gameStateText.includes('resolvePendingPiercingSecurityCheck') &&
            gameStateText.includes('securityCheckTransitionOccurred');
        const hasOldImmediatePiercing = /getKeywords\(attacker\)\.piercing[\s\S]{0,900}processSecurityChecks\(ad\.attackerId,\s*attacker,\s*defSide,\s*totalChecks\)/.test(gameStateText);
        if (!hasPendingPiercing || hasOldImmediatePiercing) {
            report.semanticIssues.piercingImmediateProcessingLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Piercing must be pending until immediately before attack end and must respect one security-check transition per attack.',
                details: { hasPendingPiercing, hasOldImmediatePiercing }
            });
        }

        const hasReturnToDeckCostHelper = gameStateText.includes('payReturnToDeckCost') &&
            gameStateText.includes('getReturnToDeckCostDestination') &&
            gameStateText.includes('eggDeck');
        if (!hasReturnToDeckCostHelper) {
            report.semanticIssues.returnToEggDeckCostLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'RETURN_TO_DECK cost runtime must support returning selected cards from trash/source to the Digi-Egg deck.',
                details: { hasReturnToDeckCostHelper }
            });
        }

        const hasBreedingScopeGuard = gameStateText.includes('mech.breedingOnly === true') &&
            gameStateText.includes('isCardInBreedingArea(playerId, breedingHost)');
        const hasBreedingBridgeStrictGate = gameStateText.includes('restrictToExplicitBreedingTiming && mech.breedingOnly !== true');
        if (!hasBreedingScopeGuard || !hasBreedingBridgeStrictGate) {
            report.semanticIssues.breedingScopeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: '[Breeding] structured mechanics require runtime gates so they do not activate from the battle area or let ordinary same-timing effects fire in breeding.',
                details: { hasBreedingScopeGuard, hasBreedingBridgeStrictGate }
            });
        }

        // Round 15W: static effects and "while you have [X]" conditions must
        // match names/traits from card identity metadata only. Using effectText
        // here makes cards that merely mention [X] satisfy [X] trait/name scopes.
        const traitTextMatch = gameStateText.match(new RegExp('getCardTraitText\\(card\\)\\s*\\{([\\s\\S]*?)\\n    \\}'));
        const traitTextBody = (traitTextMatch || [null, ''])[1];
        const staticTraitUsesEffectText = /effectText/.test(traitTextBody);
        const staticTraitUsesNameTokens = /nameTokens/.test(traitTextBody);
        if (staticTraitUsesEffectText || !staticTraitUsesNameTokens) {
            report.semanticIssues.staticTextScopeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Static target/condition matching must not use full effectText as trait/name identity; use name/nameTokens/traits/traitTokens only.',
                details: { staticTraitUsesEffectText, staticTraitUsesNameTokens }
            });
        }
        // Round 15Y: face-up security static text must be evaluated per clause.
        // Otherwise unconditional and conditional grants on cards such as
        // Abyss Sanctuary: Throne Room are merged, causing either missing
        // Blocker or unconditional Alliance.
        const hasStaticClauseSplitter = gameStateText.includes('splitStaticEffectClauses') &&
            gameStateText.includes('While you have [Neptunemon] or [Venusmon]');
        const legacyFaceUpKeywordScannerDisabled = /getFaceUpSecurityStaticKeywords\([^)]*\)\s*\{[\s\S]{0,700}return \[\];/.test(gameStateText);
        const collectUsesClauses = gameStateText.includes('for (const text of this.splitStaticEffectClauses(securityText))');
        const conditionsHandleAlternatives = gameStateText.includes('alternatives inside the same clause, such as [A] or [B], are OR') ||
            gameStateText.includes('clauses.every(tokens => tokens.some');
        if (!hasStaticClauseSplitter || !legacyFaceUpKeywordScannerDisabled || !collectUsesClauses || !conditionsHandleAlternatives) {
            report.semanticIssues.faceUpSecurityStaticClauseLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Face-up security static effects must be evaluated clause-by-clause and must not use the legacy full-text keyword scanner.',
                details: { hasStaticClauseSplitter, legacyFaceUpKeywordScannerDisabled, collectUsesClauses, conditionsHandleAlternatives }
            });
        }

        // Round 15Z: official token rules. Tokens can't digivolve, cards can't
        // be placed under tokens, and tokens removed from the field are removed
        // from the game instead of entering ordinary zones.
        const hasTokenHelpers = gameStateText.includes('isTokenCard(card)') &&
            gameStateText.includes('removeTokenFromGame') &&
            gameStateText.includes('removedFromGame');
        const sendTrashTokenGuard = /sendToTrash\(playerId, cardInstance[\s\S]{0,2400}isTokenCard\(cardInstance\)[\s\S]{0,1600}removeTokenFromGame/.test(gameStateText);
        const moveTokenGuard = /executeBattleAreaMove\(playerId, instanceId, destination[\s\S]{0,1800}isTokenCard\(moved\)[\s\S]{0,520}removeTokenFromGame/.test(gameStateText);
        const placeSourceTokenGuard = /attachSourceToDigimon\(playerId, sourceCard, targetDigimon[\s\S]{0,500}isTokenCard\(targetDigimon\)/.test(gameStateText);
        const digivolveTokenGuard = /effectDigivolve\(playerId, baseEntry, evolveEntry[\s\S]{0,900}isTokenCard\(base\)[\s\S]{0,900}isTokenCard\(evolveEntry\?\.card\)/.test(gameStateText);
        if (!hasTokenHelpers || !sendTrashTokenGuard || !moveTokenGuard || !placeSourceTokenGuard || !digivolveTokenGuard) {
            report.semanticIssues.tokenFieldRuleLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Token Digimon must obey official field rules: cannot digivolve, cannot receive sources, and leave the field by being removed from the game.',
                details: { hasTokenHelpers, sendTrashTokenGuard, moveTokenGuard, placeSourceTokenGuard, digivolveTokenGuard }
            });
        }

        // Round 22AY: 2026-05-08 official Token Q&A precision. Deleted Tokens
        // still have On Deletion pending from trash and count as deleted Digimon,
        // Token cards chosen for place-as-source leave the game instead of
        // attaching, and Token returned-to-hand costs must not add them to hand.
        const tokenDeletionOfficialGuard = /sendToTrash\(playerId, cardInstance[\s\S]{0,2600}tokenOnDeletionPendingFromTrash[\s\S]{0,1500}triggerDigimonDeleted\(playerId, cardInstance/.test(gameStateText);
        const tokenSourcePlaceOfficialGuard = /attachSourceToDigimon\(playerId, sourceCard, targetDigimon[\s\S]{0,1000}isTokenCard\(sourceCard\)[\s\S]{0,420}removeTokenFromGame/.test(gameStateText);
        const tokenReturnCostOfficialGuard = /RETURN_TO_HAND_COST[\s\S]{0,1200}isTokenCard\(moved\)[\s\S]{0,320}removeTokenFromGame/.test(gameStateText);
        const tokenAtomicOutsideGuard = /removeTokenFromGame\(playerId, tokenCard[\s\S]{0,1800}\['battleArea', 'hand', 'security', 'breedingArea', 'revealed', 'trash'\]/.test(gameStateText);
        if (!tokenDeletionOfficialGuard || !tokenSourcePlaceOfficialGuard || !tokenReturnCostOfficialGuard || !tokenAtomicOutsideGuard) {
            report.semanticIssues.tokenOfficial20260508RuntimeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Official 2026-05-08 Token rules require deleted Tokens to keep On Deletion/deleted-Digimon semantics while the Token card returns outside the game, and returned/placed Tokens must not enter hand/source zones.',
                details: { tokenDeletionOfficialGuard, tokenSourcePlaceOfficialGuard, tokenReturnCostOfficialGuard, tokenAtomicOutsideGuard }
            });
        }

        // Round 22BA: official Medusamon/Token Q&A ownership precision. When an
        // effect plays the activating player's Token as an opponent's Digimon,
        // the Token is controlled in the opponent's battle area but returns to
        // the activating player's token pile when it leaves. Play-by-effect locks
        // must evaluate the player whose effect is playing the Token, not the
        // battle-area controller it enters.
        const tokenOwnerMetadataGuard = /tokenOwnerId/.test(gameStateText) && /ownerPlayerId/.test(gameStateText) && /originalOwnerId/.test(gameStateText);
        const tokenControllerMetadataGuard = /tokenControllerId/.test(gameStateText) && /controllerId/.test(gameStateText) && /playedByPlayerId/.test(gameStateText);
        const tokenReturnOwnerGuard = /returnOwnerId[\s\S]{0,350}tokenCard\.tokenOwnerId/.test(gameStateText) && /ensureRemovedFromGameZone\(returnOwnerId\)/.test(gameStateText);
        const tokenCrossZoneRemovalGuard = /for \(const scanPlayerId of \['p1', 'p2'\]\)/.test(gameStateText) && /zone\.battleArea[\s\S]{0,260}host\.stack/.test(gameStateText);
        const tokenPlayLockOwnerGuard = /staticPlayByEffectLockApplies\(effect\.playerId, token/.test(gameStateText) && /temporaryPlayByEffectLockApplies\(effect\.playerId, token/.test(gameStateText);
        if (!tokenOwnerMetadataGuard || !tokenControllerMetadataGuard || !tokenReturnOwnerGuard || !tokenCrossZoneRemovalGuard || !tokenPlayLockOwnerGuard) {
            report.semanticIssues.tokenControllerOwnerRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Token runtime must separate Token owner/pile from battle-area controller for effects that play your Token as an opponent Digimon, and evaluate play locks from the effect player.',
                details: { tokenOwnerMetadataGuard, tokenControllerMetadataGuard, tokenReturnOwnerGuard, tokenCrossZoneRemovalGuard, tokenPlayLockOwnerGuard }
            });
        }

        // Round 22DH: official Token cardlist coverage guard. Bandai publishes
        // Token cards as cardlist entries even though they cannot be registered
        // in decks. Keep them searchable in cards.json, preserve them through
        // fetch refreshes, and reject them in deck validation/report paths.
        try {
            const requiredTokens = [
                { id: 'TOKEN', name: 'Diaboromon', dp: 3000, color: 'White' },
                { id: 'BT22-TOKEN', name: 'Familiar', dp: 3000, color: 'Yellow' },
                { id: 'BT23-TOKEN', name: 'Atho, René & Por', dp: 6000, color: 'White' },
                { id: 'BT24-TOKEN', name: 'Petrification', dp: 3000, color: 'White' },
                { id: 'ST22-TOKEN01', name: 'Pipe Fox', dp: 6000, color: 'Yellow' },
                { id: 'ST22-TOKEN02', name: 'Uka no Mitama', dp: 9000, color: 'Yellow' }
            ];
            const tokenIssues = [];
            for (const tok of requiredTokens) {
                const card = allCards.find(c => String(c.id || '') === tok.id && String(c.name || '') === tok.name);
                if (!card) { tokenIssues.push(`${tok.id} ${tok.name} missing`); continue; }
                if (card.isToken !== true || !/token/i.test(String(card.cardKind || ''))) tokenIssues.push(`${tok.id} ${tok.name} must be marked isToken/cardKind token`);
                if (Number(card.dp || 0) !== tok.dp) tokenIssues.push(`${tok.id} ${tok.name} DP mismatch`);
                const colors = Array.isArray(card.colors) ? card.colors : [card.color];
                if (!colors.includes(tok.color)) tokenIssues.push(`${tok.id} ${tok.name} color mismatch`);
            }
            const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
            const serverText = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
            const builderText = fs.existsSync(path.join(__dirname, 'deck-builder.html')) ? fs.readFileSync(path.join(__dirname, 'deck-builder.html'), 'utf8') : '';
            const reportWriterText = fs.existsSync(path.join(__dirname, 'official-report-writer.js')) ? fs.readFileSync(path.join(__dirname, 'official-report-writer.js'), 'utf8') : '';
            const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
            const hasFetchOverlay = /OFFICIAL_TOKEN_CARD_PATCHES/.test(fetchText) && /\.\.\.OFFICIAL_TOKEN_CARD_PATCHES/.test(fetchText) && requiredTokens.every(tok => fetchText.includes(tok.id) && fetchText.includes(tok.name));
            const hasServerDeckReject = /function isTokenDeckCard/.test(serverText) && /Official Token cards cannot be included in decks/.test(serverText) && /tokenCards/.test(serverText);
            const hasBuilderDeckReject = /function isTokenDeckCard/.test(builderText) && /Token 卡不能放入官方卡组/.test(builderText);
            const hasReportDeckReject = /function isTokenDeckCard/.test(reportWriterText) && /tokenCards/.test(reportWriterText);
            const hasAutoGuardrail = /Round 22DH official Token cardlist guardrails/.test(autoText) && requiredTokens.every(tok => autoText.includes(tok.id));
            if (tokenIssues.length || !hasFetchOverlay || !hasServerDeckReject || !hasBuilderDeckReject || !hasReportDeckReject || !hasAutoGuardrail) {
                report.semanticIssues.officialTokenCardPoolCoverageLeak.push({
                    id: 'OFFICIAL-TOKEN-CARDLIST',
                    name: 'Official Token cardlist coverage',
                    reason: 'Round 22DH requires official Token cardlist records to exist locally, survive fetch refreshes, and remain illegal in deck registration.',
                    tokenIssues,
                    hasFetchOverlay,
                    hasServerDeckReject,
                    hasBuilderDeckReject,
                    hasReportDeckReject,
                    hasAutoGuardrail
                });
            }
        } catch (e) {
            report.semanticIssues.officialTokenCardPoolCoverageLeak.push({
                id: 'OFFICIAL-TOKEN-CARDLIST',
                name: 'Official Token cardlist coverage',
                reason: `Round 22DH audit guard failed to inspect official Token cardlist coverage: ${e.message}`
            });
        }


function auditOfficialNamedTokenAssetCoverageLeak(allCards, report) {
  // Round 22EB: the official Rule page exposes the complete named Token asset
  // set as printable PDFs. Runtime PLAY_TOKEN specs already reference these
  // names, so local card/search assets and image puller metadata must preserve
  // all named official Token assets, not only the newer cardlist overlay six.
  try {
    const requiredTokens = [
    { id: 'TOKEN', name: 'Diaboromon', dp: 3000, color: 'White', pdf: 'token_02.pdf' },
    { id: 'TOKEN-03', name: 'Amon of Crimson Flame', dp: 6000, color: 'Red', pdf: 'token_03.pdf' },
    { id: 'TOKEN-04', name: 'Umon of Blue Thunder', dp: 6000, color: 'Yellow', pdf: 'token_04.pdf' },
    { id: 'TOKEN-05', name: 'Gyuukimon', dp: 3000, color: 'Purple', pdf: 'token_05.pdf' },
    { id: 'TOKEN-06', name: 'Fujitsumon', dp: 3000, color: 'Purple', pdf: 'token_06.pdf' },
    { id: 'TOKEN-07', name: 'KoHagurumon', dp: 1000, color: 'Black', pdf: 'token_07.pdf' },
    { id: 'BT22-TOKEN', name: 'Familiar', dp: 3000, color: 'Yellow', pdf: 'token_08.pdf' },
    { id: 'TOKEN-09', name: 'Volée & Zerdrücken', dp: 5000, color: 'Purple', pdf: 'token_09.pdf' },
    { id: 'ST22-TOKEN01', name: 'Pipe Fox', dp: 6000, color: 'Yellow', pdf: 'token_10.pdf' },
    { id: 'TOKEN-11', name: 'WarGrowlmon', dp: 6000, color: 'Red', pdf: 'token_11.pdf' },
    { id: 'TOKEN-12', name: 'Taomon', dp: 6000, color: 'Yellow', pdf: 'token_12.pdf' },
    { id: 'TOKEN-13', name: 'Rapidmon', dp: 6000, color: 'Green', pdf: 'token_13.pdf' },
    { id: 'ST22-TOKEN02', name: 'Uka no Mitama', dp: 9000, color: 'Yellow', pdf: 'token_14.pdf' },
    { id: 'BT23-TOKEN', name: 'Atho, René & Por', dp: 6000, color: 'White', pdf: 'token_15.pdf' },
    { id: 'BT24-TOKEN', name: 'Petrification', dp: 3000, color: 'White', pdf: 'token_16.pdf' },
    { id: 'TOKEN-17', name: 'Hinukamuy', dp: 6000, color: 'White', pdf: 'token_17.pdf' }
];
    const tokenIssues = [];
    for (const tok of requiredTokens) {
      const card = allCards.find(c => String(c.id || '') === tok.id && String(c.name || '') === tok.name);
      if (!card) { tokenIssues.push(`${tok.id} ${tok.name} missing`); continue; }
      if (card.isToken !== true || !/token/i.test(String(card.cardKind || ''))) tokenIssues.push(`${tok.id} ${tok.name} must be marked isToken/cardKind token`);
      if (Number(card.dp || 0) !== tok.dp) tokenIssues.push(`${tok.id} ${tok.name} DP mismatch`);
      const colors = Array.isArray(card.colors) ? card.colors : [card.color];
      if (!colors.includes(tok.color)) tokenIssues.push(`${tok.id} ${tok.name} color mismatch`);
      if (String(card.img || '') !== `/img/${tok.id}.jpg`) tokenIssues.push(`${tok.id} ${tok.name} must use deterministic /img/${tok.id}.jpg path`);
    }
    const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
    const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
    const hasFetchOverlay = /OFFICIAL_TOKEN_CARD_PATCHES/.test(fetchText) && requiredTokens.every(tok => fetchText.includes(tok.id) && fetchText.includes(tok.name));
    const hasPdfSourceMap = /OFFICIAL_TOKEN_IMAGE_PDF_SOURCES/.test(fetchText) && requiredTokens.every(tok => fetchText.includes(tok.id) && fetchText.includes(tok.pdf));
    const hasAutoGuardrail = /Round 22EB complete named official Token asset coverage/.test(autoText) && requiredTokens.every(tok => autoText.includes(tok.id));
    if (tokenIssues.length || !hasFetchOverlay || !hasPdfSourceMap || !hasAutoGuardrail) {
      report.semanticIssues.officialNamedTokenAssetCoverageLeak.push({
        id: 'OFFICIAL-NAMED-TOKEN-ASSETS',
        name: 'Complete official named Token asset coverage',
        reason: 'Round 22EB requires every named official Token PDF/asset on the Rule page to exist locally as a searchable token record and image-puller source while remaining illegal deck material.',
        tokenIssues,
        hasFetchOverlay,
        hasPdfSourceMap,
        hasAutoGuardrail
      });
    }
  } catch (e) {
    report.semanticIssues.officialNamedTokenAssetCoverageLeak.push({
      id: 'OFFICIAL-NAMED-TOKEN-ASSETS',
      name: 'Complete official named Token asset coverage',
      reason: `Round 22EB guard failed to inspect named official Token assets: ${e.message}`
    });
  }
}

        // Round 22DI: official Token images. Bandai exposes printable Token PDFs
        // from the rule page; local runtime still needs deterministic cropped
        // /img/<TokenId>.jpg files for card rendering.
        try {
            const requiredTokenImages = [
                { id: 'TOKEN', file: 'TOKEN.jpg', pdf: 'token_02.pdf' },
                { id: 'BT22-TOKEN', file: 'BT22-TOKEN.jpg', pdf: 'token_08.pdf' },
                { id: 'BT23-TOKEN', file: 'BT23-TOKEN.jpg', pdf: 'token_15.pdf' },
                { id: 'BT24-TOKEN', file: 'BT24-TOKEN.jpg', pdf: 'token_16.pdf' },
                { id: 'ST22-TOKEN01', file: 'ST22-TOKEN01.jpg', pdf: 'token_10.pdf' },
                { id: 'ST22-TOKEN02', file: 'ST22-TOKEN02.jpg', pdf: 'token_14.pdf' }
            ];
            const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
            const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
            const missingImages = [];
            const badCardImgPaths = [];
            // Round 22DW: code-only source bundles used for review may omit
            // binary /img assets even when the user's real project folder has
            // them. Keep this strict when an img directory is present, while
            // still validating deterministic card.img paths and the official
            // fetch helper/CLI in stripped uploads.
            const imgDir = path.join(__dirname, 'img');
            const shouldCheckLocalBinaryImages = fs.existsSync(imgDir);
            for (const tok of requiredTokenImages) {
                const card = allCards.find(c => String(c.id || '') === tok.id && c.isToken === true);
                if (!card || String(card.img || '') !== `/img/${tok.file}`) badCardImgPaths.push({ id: tok.id, img: card && card.img });
                if (shouldCheckLocalBinaryImages) {
                    const imgPath = path.join(imgDir, tok.file);
                    if (!fs.existsSync(imgPath) || fs.statSync(imgPath).size < 10000) missingImages.push(tok.file);
                }
            }
            const hasPdfSourceMap = /OFFICIAL_TOKEN_IMAGE_PDF_SOURCES/.test(fetchText) && requiredTokenImages.every(tok => fetchText.includes(tok.id) && fetchText.includes(tok.pdf));
            const hasHelpers = /function getOfficialTokenImageIds/.test(fetchText)
                && /function getOfficialTokenImagePath/.test(fetchText)
                && /function getOfficialTokenImagePdfUrl/.test(fetchText)
                && /function ensureOfficialTokenImages/.test(fetchText);
            const hasImageOnlyCli = /--official-token-images-only/.test(fetchText) && /--token-images-only/.test(fetchText) && /runOfficialTokenImagesOnly/.test(fetchText);
            const exported = /module\.exports[\s\S]*ensureOfficialTokenImages[\s\S]*runOfficialTokenImagesOnly/.test(fetchText);
            const hasAutoGuardrail = /Round 22DI official Token image guardrails/.test(autoText);
            if (missingImages.length || badCardImgPaths.length || !hasPdfSourceMap || !hasHelpers || !hasImageOnlyCli || !exported || !hasAutoGuardrail) {
                report.semanticIssues.officialTokenImagePullerLeak.push({
                    id: 'OFFICIAL-TOKEN-IMAGES',
                    name: 'Official Token image puller',
                    reason: 'Round 22DI requires six official Token jpg runtime images plus a fetch-cards.js token image-only helper/CLI backed by Bandai official Token PDF sources.',
                    missingImages,
                    badCardImgPaths,
                    hasPdfSourceMap,
                    hasHelpers,
                    hasImageOnlyCli,
                    exported,
                    hasAutoGuardrail
                });
            }
        } catch (e) {
            report.semanticIssues.officialTokenImagePullerLeak.push({
                id: 'OFFICIAL-TOKEN-IMAGES',
                name: 'Official Token image puller',
                reason: `Round 22DI audit guard failed to inspect official Token image coverage: ${e.message}`
            });
        }


        // Round 22DJ/22EA: official multi-color metadata. Bandai's official
        // cardlist uses whitespace-separated color words for multi-color cards
        // such as Red Black / Blue Red Green. Local cards and refresh helpers
        // must preserve every official color in `colors`, while legacy `color`
        // can remain the first color for UI compatibility. Round 22EA extends
        // this to older Angel/Mastemon support cards in the user's deck.
        try {
            const requiredAd01Colors = {
                'AD1-004': ['Red', 'Black'],
                'AD1-005': ['Red', 'White'],
                'AD1-006': ['Red', 'Black', 'Blue'],
                'AD1-009': ['Red', 'Black'],
                'AD1-011': ['Blue', 'Green'],
                'AD1-012': ['Blue', 'Black'],
                'AD1-013': ['Blue', 'Black'],
                'AD1-014': ['Blue', 'Purple'],
                'AD1-016': ['Yellow', 'Red'],
                'AD1-017': ['Yellow', 'Red'],
                'AD1-018': ['Purple', 'Black'],
                'AD1-019': ['Blue', 'Yellow'],
                'AD1-020': ['Blue', 'Red', 'Green'],
                'AD1-021': ['Yellow', 'Red'],
                'AD1-022': ['Green', 'Red'],
                'AD1-023': ['Black', 'Yellow', 'Purple'],
                'AD1-024': ['Blue', 'Green'],
                'AD1-025': ['Red', 'White', 'Blue'],
                'ST10-04': ['Yellow', 'Purple'],
                'BT11-094': ['Purple', 'Yellow'],
                'EX6-074': ['Purple', 'Yellow']
            };
            const colorIssues = [];
            for (const [id, expected] of Object.entries(requiredAd01Colors)) {
                const card = allCards.find(c => String(c.id || '') === id);
                if (!card) { colorIssues.push(`${id} missing`); continue; }
                const got = Array.isArray(card.colors) ? card.colors.map(String) : [];
                const missing = expected.filter(color => !got.includes(color));
                if (missing.length || got.length < expected.length || card.color !== expected[0]) {
                    colorIssues.push(`${id} expected ${expected.join('/')} got color=${card.color} colors=${got.join('/')}`);
                }
                const searchText = String(card.searchText || '').toLowerCase();
                if (!expected.every(color => searchText.includes(color.toLowerCase()))) {
                    colorIssues.push(`${id} searchText missing official colors`);
                }
            }
            const fetchText = fs.readFileSync(path.join(__dirname, 'fetch-cards.js'), 'utf8');
            const gsText = fs.readFileSync(path.join(__dirname, 'game-state.js'), 'utf8');
            const autoText = fs.readFileSync(path.join(__dirname, 'auto-mechanics.js'), 'utf8');
            const hasFetchPatch = /OFFICIAL_COLOR_METADATA_PATCHES/.test(fetchText)
                && /function normalizeColorTokensFromString/.test(fetchText)
                && /applyOfficialColorMetadataPatch\(rawId, enrichedCard\)/.test(fetchText)
                && Object.keys(requiredAd01Colors).every(id => fetchText.includes(id));
            const hasRuntimeParser = /splitOfficialColorValues/.test(gsText)
                && /Red Black|whitespace-separated/.test(gsText)
                && /getCardColors\(card\)/.test(gsText);
            const hasAutoGuardrail = /Round 22DJ official AD-01 color metadata guardrails/.test(autoText)
                && /Round 22EA official Angel\/Mastemon support color metadata guardrails/.test(autoText);
            if (colorIssues.length || !hasFetchPatch || !hasRuntimeParser || !hasAutoGuardrail) {
                report.semanticIssues.officialAd01ColorMetadataLeak.push({
                    id: 'OFFICIAL-AD01-COLORS',
                    name: 'Official multi-color metadata',
                    reason: 'Round 22DJ/22EA requires official multi-color metadata, refresh overlay, and runtime whitespace color parsing.',
                    colorIssues,
                    hasFetchPatch,
                    hasRuntimeParser,
                    hasAutoGuardrail
                });
            }
        } catch (e) {
            report.semanticIssues.officialAd01ColorMetadataLeak.push({
                id: 'OFFICIAL-AD01-COLORS',
                name: 'Official multi-color metadata',
                reason: `Round 22DJ/22EA audit guard failed to inspect official multi-color metadata: ${e.message}`
            });
        }



        // Round 22AZ: official DUAL Arts Digivolve. A DUAL used as an Option
        // must not be trashed before its lower [Main] effect resolves. It opens
        // an optional Arts Digivolve choice after that activation, charges the
        // lower Option-side cost for manual use, draws 1 when stacked, and only
        // trashes if Arts Digivolve is skipped/impossible.
        const dualArtsPendingGuard = /pendingDualArtsDigivolve/.test(gameStateText) && /beginDualOptionUse/.test(gameStateText);
        const dualArtsChoiceGuard = /ARTS_DIGIVOLVE_CHOICE/.test(gameStateText) && /resolveArtsDigivolveChoice/.test(gameStateText);
        const dualOptionCostGuard = /getPrintedOptionUseCost/.test(gameStateText) && /dualOptionCost/.test(gameStateText);
        const dualNoImmediateTrashGuard = /if \(isDualOptionUse\) this\.beginDualOptionUse[\s\S]{0,180}else cur\.trash\.push\(movedCard\)/.test(gameStateText)
            && /if \(isDualOptionUse\) this\.beginDualOptionUse[\s\S]{0,220}else this\.zones\[playerId\]\.trash\.push\(moved\)/.test(gameStateText);
        const dualArtsDrawAndTriggerGuard = /drawCard\(playerId, 1\)[\s\S]{0,900}ARTS_DIGIVOLVE_RULE_CHECK[\s\S]{0,900}WHEN_DIGIVOLVING/.test(gameStateText);
        if (!dualArtsPendingGuard || !dualArtsChoiceGuard || !dualOptionCostGuard || !dualNoImmediateTrashGuard || !dualArtsDrawAndTriggerGuard) {
            report.semanticIssues.dualArtsDigivolveRuntimeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'DUAL Option use must follow official Arts Digivolve timing: resolve lower [Main], then choose Arts Digivolve or trash, using Option-side cost and digivolution bonus draw.',
                details: { dualArtsPendingGuard, dualArtsChoiceGuard, dualOptionCostGuard, dualNoImmediateTrashGuard, dualArtsDrawAndTriggerGuard }
            });
        }

        // Round 16A: "while you have [X]" static providers must not count
        // breeding-area cards, security cards, or sources as cards in play.
        // This prevents face-up security static clauses from being enabled by
        // a Venusmon/Neptunemon hidden in security or an in-breeding Digimon.
        const playerHasMatch = gameStateText.match(new RegExp('playerHasCardByNameOrTrait\\(playerId, token\\)\\s*\\{([\\s\\S]*?)\\n    \\}'));
        const playerHasBody = (playerHasMatch || [null, ''])[1];
        const staticWhileUsesOnlyBattleArea = playerHasBody.includes('zone.battleArea') &&
            !playerHasBody.includes('zone.breedingArea') &&
            !playerHasBody.includes('zone.security') &&
            !playerHasBody.includes('card.stack');
        if (!staticWhileUsesOnlyBattleArea) {
            report.semanticIssues.staticWhileHaveZoneLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Static "while you have [X]" conditions must count only cards in play, not breeding/security/source cards.',
                details: { staticWhileUsesOnlyBattleArea }
            });
        }

        // Round 16B: "this Digimon" is not a trait/name selector. Runtime must
        // support explicit self-targets so self buffs don't open illegal target
        // choices or fail to match because no card has trait:"this".
        const hasSelfTargetRuntime = gameStateText.includes('isSelfTargetDescriptor(target = {})') &&
            gameStateText.includes('getSelfActionTargetCard(playerId, sourceCard, action = {})') &&
            gameStateText.includes('applyTurnEffectToCard(playerId, targetCard, effectPayload = {})');
        if (!hasSelfTargetRuntime) {
            report.semanticIssues.selfTargetTraitLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must support explicit target.self for effects that say this Digimon/this card.',
                details: { hasSelfTargetRuntime }
            });
        }


        // Round 16C: delayed actions are still effect actions. Their printed
        // action.condition/target must survive scheduling and be re-evaluated at
        // the delayed timing, rather than falling back to the source card.
        const delayedPreservesWrapper = gameStateText.includes("scheduleDelayedAction(playerId, action, sourceCard = null, timing = 'END_OF_TURN', wrapper = {})") &&
            gameStateText.includes('if (!delayedAction.target && wrapper?.target) delayedAction.target') &&
            gameStateText.includes('if (!delayedAction.condition && wrapper?.condition) delayedAction.condition');
        const delayedChecksCondition = /executeDelayedAction\(item\)\s*\{[\s\S]{0,900}evaluateStructuredCondition\(playerId, action\.condition, item\.sourceCard/.test(gameStateText);
        const delayedQueuesTargetedActions = gameStateText.includes('queueDelayedStructuredAction(playerId, action, item.sourceCard, context)');
        const delayedDeleteNoSourceFallback = gameStateText.includes('delayed DELETE_DIGIMON skipped: no target was preserved') &&
            !/case 'DELETE_DIGIMON':[\s\S]{0,180}source\?\.instanceId/.test(gameStateText);
        if (!delayedPreservesWrapper || !delayedChecksCondition || !delayedQueuesTargetedActions || !delayedDeleteNoSourceFallback) {
            report.semanticIssues.delayedActionConditionLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Delayed action runtime must preserve target/condition fields and re-check action.condition at delayed resolution timing.',
                details: { delayedPreservesWrapper, delayedChecksCondition, delayedQueuesTargetedActions, delayedDeleteNoSourceFallback }
            });
        }


        // Round 16I: source-count conditions must know which Digimon's source
        // stack is being counted. Runtime needs hostTarget/base_source support
        // for clauses like "one of your [Mother D-Reaper]s has 5 or more
        // digivolution cards" or "a Tamer card in its digivolution cards".
        const hasSourceCountHostRuntime = gameStateText.includes('getSourceCountHostCandidates(playerId, condition = {}, sourceCard = null, context = {})') &&
            gameStateText.includes('evaluateSourceCountCondition(playerId, condition = {}, sourceCard = null, context = {}, cmp = null, compareValue = 0)') &&
            gameStateText.includes("scope === 'base_source'") &&
            gameStateText.includes('condition.hostTarget || condition.sourceHostTarget');
        if (!hasSourceCountHostRuntime) {
            report.semanticIssues.sourceCountHostScopeLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'SOURCE_COUNT runtime must support hostTarget/base_source binding so source-count clauses do not accidentally count the wrong Digimon.',
                details: { hasSourceCountHostRuntime }
            });
        }

        // Round 16J: "can't suspend" is a distinct restriction. It must not be encoded
        // as STUN, CANT_UNSUSPEND, PREVENT_LEAVE_PLAY, or immediate SUSPEND_OPPONENT.
        const hasCantSuspendRuntime = gameStateText.includes('hasCantSuspendRestriction(card)') &&
            gameStateText.includes('canSuspendCard(playerId, card, context = {})') &&
            gameStateText.includes("eff.type === 'CANT_SUSPEND'");
        if (!hasCantSuspendRuntime) {
            report.semanticIssues.cantSuspendEncodingLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must support CANT_SUSPEND as distinct from stun/cant-unsuspend and gate attack/block/cost/effect suspends.',
                details: { hasCantSuspendRuntime }
            });
        }


        // Round 16K: DigiXros/Assembly materials from the battle area must not
        // carry their existing source stack under the new host. Those old
        // sources are trashed when the material leaves the battle area.
        const hasDigiXrosMaterialRuntime = gameStateText.includes('trashDetachedSourcesFromMaterial(playerId, materialCard') &&
            gameStateText.includes('DIGIXROS_MATERIAL_STACK_TRASHED') &&
            gameStateText.includes("getSpecialMaterialRecords(playerId, targetIds, ['battleArea', 'hand'])") &&
            gameStateText.includes('prepareSingleCardAsSpecialMaterial(removed.card') &&
            gameStateText.includes('if (!target || this.isTokenCard(target)) return false');
        if (!hasDigiXrosMaterialRuntime) {
            report.semanticIssues.digiXrosMaterialStackLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'DigiXros/Assembly runtime must place only selected material top cards under the new host, trash old battle-material sources, support hand materials, and reject token hosts/materials.',
                details: { hasDigiXrosMaterialRuntime }
            });
        }


        // Round 16L: total play-cost source play must stay bound to the printed host.
        const hasPlayFromSourceTotalRuntime = gameStateText.includes('startTotalPlayCostZoneChoice(playerId, action = {}, candidateEntries = [])') &&
            gameStateText.includes('applyTotalPlayCostZoneAction(playerId, action = {}, selectedCards = []') &&
            gameStateText.includes('sourceHostMatchesAction(playerId, hostCard, action = {}, sourceCard = null)') &&
            gameStateText.includes("mode: 'TOTAL_PLAY_COST_ZONE_CHOICE'");
        if (!hasPlayFromSourceTotalRuntime) {
            report.semanticIssues.playFromSourceTotalCostLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'PLAY_FROM_SOURCE total-play-cost runtime must support host-bound source candidates and multi-select total play cost validation.',
                details: { hasPlayFromSourceTotalRuntime }
            });
        }


        // Round 16M: immunity/effect-activation locks are static rule-layer gates.
        // They must be skipped as runtime-only static mechanics and must not be
        // encoded as PREVENT_LEAVE_PLAY or STUN, which would change official meaning.
        const hasStaticImmunityLockSkip = /staticActions = new Set\(\[[^\]]*UNAFFECTED_BY_OPPONENT_EFFECTS[^\]]*EFFECT_ACTIVATION_LOCK|staticActions = new Set\(\[[^\]]*EFFECT_ACTIVATION_LOCK[^\]]*UNAFFECTED_BY_OPPONENT_EFFECTS/.test(gameStateText);
        const hasImmunityRuntimeLayer = gameStateText.includes('isActionBlockedByImmunity(targetOwnerId, targetCard, actionType') &&
            gameStateText.includes('providerGrantsGeneralOpponentEffectImmunity') &&
            gameStateText.includes('isEffectActivationLocked(playerId, card, timing');
        if (!hasStaticImmunityLockSkip || !hasImmunityRuntimeLayer) {
            report.semanticIssues.effectImmunityActivationLockLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Static unaffected/effect-activation locks must be runtime-only rule gates, not queued stale turn effects.',
                details: { hasStaticImmunityLockSkip, hasImmunityRuntimeLayer }
            });
        }
    } catch (e) {}




    // Round 16V: moving a battle-area card to trash must remove the original
    // direct-zone reference first; otherwise duplicate instanceIds can remain
    // across battleArea/trash after rule deletion or direct sendToTrash callers.
    try {
        const gameStateTextForTrashAtomicity = gameStateTextForRuntimeGuards;
        const hasAtomicTrashMove = gameStateTextForTrashAtomicity.includes('zone moves must be atomic') &&
            gameStateTextForTrashAtomicity.includes("'battleArea', 'hand', 'security', 'breedingArea', 'revealed'") &&
            gameStateTextForTrashAtomicity.includes('arr[i]?.instanceId === cardInstance.instanceId');
        if (!hasAtomicTrashMove) {
            report.semanticIssues.trashMoveAtomicityLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'sendToTrash must remove direct-zone references before pushing to trash to prevent duplicate instanceIds across zones.',
                details: { hasAtomicTrashMove }
            });
        }
    } catch (e) {}


    // Round 16N: "If this effect DNA digivolved" must be driven by same-effect
    // DNA_DIGIVOLVE result context. Do not rely on global counter state or always
    // fire the following actions.
    try {
        const gameStateTextForDnaPostcondition = gameStateTextForRuntimeGuards;
        const hasDnaPostconditionRuntime = gameStateTextForDnaPostcondition.includes('markCurrentStructuredEffectDnaResult(didDnaDigivolve') &&
            gameStateTextForDnaPostcondition.includes('thisEffectDnaDigivolved') &&
            gameStateTextForDnaPostcondition.includes('dnaDigivolved: !!didDnaDigivolve');
        if (!hasDnaPostconditionRuntime) {
            report.semanticIssues.dnaPostconditionLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: '"If this effect DNA digivolved" follow-up actions need same-effect DNA result context.',
                details: { hasDnaPostconditionRuntime }
            });
        }
    } catch (e) {}


    // Round 17H: "If you played" / "the Digimon played by this effect" follow-ups
    // must use this same effect's successful play result, not a stale global last-played card
    // or a fresh target search by name.
    try {
        const gameStateTextForPlayedByThisEffect = gameStateTextForRuntimeGuards;
        const hasPlayedByThisEffectContext = gameStateTextForPlayedByThisEffect.includes('recordPlayedByThisEffect') &&
            gameStateTextForPlayedByThisEffect.includes('getLastPlayedByThisEffect') &&
            gameStateTextForPlayedByThisEffect.includes('PLAYED_BY_THIS_EFFECT') &&
            gameStateTextForPlayedByThisEffect.includes('playedByThisEffect');
        if (!hasPlayedByThisEffectContext) {
            report.semanticIssues.playedByThisEffectFollowupLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must track cards successfully played by the current structured effect and bind follow-ups such as attack redirects to that result.',
                details: { hasPlayedByThisEffectContext }
            });
        }
    } catch (e) {}

    // Round 17I: generic "Suspend 1 Digimon" must be able to target either player,
    // and "If this effect suspended your Digimon" must use same-effect success context.
    try {
        const gameStateTextForSuspendAny = gameStateTextForRuntimeGuards;
        const hasSuspendAnyRuntime = gameStateTextForSuspendAny.includes("case 'SUSPEND':") &&
            gameStateTextForSuspendAny.includes("targetOwnerSetting === 'any'") &&
            gameStateTextForSuspendAny.includes('candidateOwnerByInstanceId') &&
            gameStateTextForSuspendAny.includes('recordSuspendedByThisEffect') &&
            gameStateTextForSuspendAny.includes('recordUnsuspendedByThisEffect') &&
            gameStateTextForSuspendAny.includes('SUSPENDED_OWN_BY_THIS_EFFECT');
        if (!hasSuspendAnyRuntime) {
            report.semanticIssues.suspendAnyIfOwnSuspendedLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must support generic SUSPEND owner:any and same-effect own-suspend result conditions.',
                details: { hasSuspendAnyRuntime }
            });
        }
    } catch (e) {}

    // Round 17J: "If this effect deleted one of your Digimon" must be tracked
    // as a same-effect successful deletion result. Broad HAS_TRAIT placeholders
    // or global deletion counts can fire after deleting the wrong side.
    try {
        const gameStateTextForDeletedOwn = gameStateTextForRuntimeGuards;
        const hasDeletedOwnRuntime = gameStateTextForDeletedOwn.includes('recordDeletedByThisEffect') &&
            gameStateTextForDeletedOwn.includes('DELETED_OWN_BY_THIS_EFFECT') &&
            gameStateTextForDeletedOwn.includes('_deletedOwnByThisEffect') &&
            gameStateTextForDeletedOwn.includes('NOT_DELETED_BY_THIS_EFFECT') &&
            gameStateTextForDeletedOwn.includes('NOT_DELETED_OPPONENT_BY_THIS_EFFECT') &&
            gameStateTextForDeletedOwn.includes('_deletedOpponentByThisEffect');
        if (!hasDeletedOwnRuntime) {
            report.semanticIssues.deletedOwnByThisEffectLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must track successful same-effect deletion results, including whether the deleted card was your Digimon.',
                details: { hasDeletedOwnRuntime }
            });
        }
    } catch (e) {}

    // Round 17M: "If this effect returned" / "If this effect didn't return"
    // must be tracked as same-effect successful move results.
    try {
        const gameStateTextForReturned = gameStateTextForRuntimeGuards;
        const hasReturnedRuntime = gameStateTextForReturned.includes('recordReturnedByThisEffect') &&
            gameStateTextForReturned.includes('RETURNED_BY_THIS_EFFECT') &&
            gameStateTextForReturned.includes('NOT_RETURNED_BY_THIS_EFFECT') &&
            gameStateTextForReturned.includes('_returnedByThisEffect') &&
            gameStateTextForReturned.includes('_returnedOpponentByThisEffect');
        if (!hasReturnedRuntime) {
            report.semanticIssues.returnedByThisEffectLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must track successful same-effect return results for BOUNCE / RETURN_TO_DECK / ADD_TO_HAND follow-ups.',
                details: { hasReturnedRuntime }
            });
        }
    } catch (e) {}

    
    // Round 17O: "If this effect placed" follow-ups must be tracked as
    // same-effect successful placement results, not unconditional actions.
    try {
        const gameStateTextForPlaced = gameStateTextForRuntimeGuards;
        const hasPlacedRuntime = gameStateTextForPlaced.includes('recordPlacedByThisEffect') &&
            gameStateTextForPlaced.includes('countPlacedByThisEffect') &&
            gameStateTextForPlaced.includes('PLACED_BY_THIS_EFFECT') &&
            gameStateTextForPlaced.includes('_placedByThisEffect');
        if (!hasPlacedRuntime) {
            report.semanticIssues.placedByThisEffectLeak.push({
                id: 'RUNTIME',
                name: 'game-state.js',
                reason: 'Runtime must track successful same-effect placement results for follow-ups such as "If this effect placed".',
                details: { hasPlacedRuntime }
            });
        }
    } catch (e) {}

    // Round 16V: total DP/play-cost pending choices must filter out candidates
        // whose individual value already exceeds the total limit. Otherwise a
        // mandatory "choose 1 or more" window can become impossible to submit.
        try {
            const gameStateTextForTotalFeasible = gameStateTextForRuntimeGuards;
            const hasFeasibleTotalFilter = gameStateTextForTotalFeasible.includes('no feasible total-') &&
                gameStateTextForTotalFeasible.includes('value <= limit') &&
                gameStateTextForTotalFeasible.includes('feasibleEntries');
            if (!hasFeasibleTotalFilter) {
                report.semanticIssues.totalValueFeasibleTargetLeak.push({
                    id: 'RUNTIME',
                    name: 'game-state.js',
                    reason: 'Total DP/play-cost choice must not open a mandatory pending window when no non-empty selection can fit under the total limit.',
                    details: { hasFeasibleTotalFilter }
                });
            }
        } catch (e) {}

    // 2. 遍历所有卡牌进行体检
    allCards.forEach(card => {

        // Round 17Y: cache the per-card text/mechanics blobs used by many
        // audit guards. The full 4k+ card pool made repeated JSON.stringify
        // calls slow enough to look like an audit hang in the repair loop.
        const cardMechanicsForAudit = Array.isArray(card.mechanics) ? card.mechanics : [];
        const mechanicsStrCached = JSON.stringify(cardMechanicsForAudit);
        const mechanicsStrCachedLower = mechanicsStrCached.toLowerCase();
        const cardTextForSourceScope = `${card.mainEffect || ''} ${card.sourceEffect || ''}`;
        const cardTextLowerCached = cardTextForSourceScope.toLowerCase();
        const needsHostBoundSourceCount = /has\s+\d+\s+or\s+more\s+digivolution\s+cards/i.test(cardTextForSourceScope) ||
            /with\s+(?:a|an|\d+|one)\s+[^.]{0,80}\s+in\s+(?:its|their|this digimon'?s)\s+digivolution\s+cards/i.test(cardTextForSourceScope);

        // Round 16O: total-DP deletion such as Atomic Blaster must be a summed multi-target limit, not per-card maxDp.
        if (/(?:DP\s+adding\s+up|whose total DP|total DP adds up|total\s+DP\s+adds\s+up)/i.test(cardTextForSourceScope) || /\"selection\":\"total_dp\"/.test(mechanicsStrCached)) {
            const mechanicsBlobForTotalDp = mechanicsStrCached;
            const hasTotalDpSelection = /"selection":"total_dp"/.test(mechanicsBlobForTotalDp) && /"totalDp":/.test(mechanicsBlobForTotalDp);
            const hasPerCardOnlyTotalDp = /"selection":"total_dp"/.test(mechanicsBlobForTotalDp) && /"maxDp":/.test(mechanicsBlobForTotalDp) && !/"totalDp":/.test(mechanicsBlobForTotalDp);
            if (!hasTotalDpSelection || hasPerCardOnlyTotalDp) {
                report.semanticIssues.totalDpSelectionLeak.push(createSemanticIssue(card,
                    'Total-DP selection should use target.selection:"total_dp" plus target.totalDp as a summed limit, not per-card maxDp/count.',
                    { hasTotalDpSelection, hasPerCardOnlyTotalDp }
                ));
            }
        }



        // Round 16T: total play-cost selection must store the summed limit in
        // target.totalPlayCost/maxTotalPlayCost/totalLimit, not overload target.count.
        // target.count describes how many targets may be selected; using it as the
        // total play-cost limit makes later runtime/refactor work ambiguous.
        if (/"selection":"total_play_cost"/.test(mechanicsStrCached)) {
            const mechanicsBlobForTotalPlayCost = mechanicsStrCached;
            const hasTotalPlayCostSelection = /"selection":"total_play_cost"/.test(mechanicsBlobForTotalPlayCost) && /"(?:totalPlayCost|maxTotalPlayCost|totalLimit|maxTotal)":/.test(mechanicsBlobForTotalPlayCost);
            const hasCountOnlyTotalPlayCost = /"selection":"total_play_cost"/.test(mechanicsBlobForTotalPlayCost) && !/"(?:totalPlayCost|maxTotalPlayCost|totalLimit|maxTotal)":/.test(mechanicsBlobForTotalPlayCost) && /"count":\s*(?:\d+|"\d+")/.test(mechanicsBlobForTotalPlayCost);
            if (!hasTotalPlayCostSelection || hasCountOnlyTotalPlayCost) {
                report.semanticIssues.totalPlayCostSelectionLeak.push(createSemanticIssue(card,
                    'Total play-cost selection should use target.totalPlayCost/maxTotalPlayCost as the summed limit; target.count must not be the limit.',
                    { hasTotalPlayCostSelection, hasCountOnlyTotalPlayCost }
                ));
            }
        }

        // Round 16X: printed "Activate 1 of the effects below" / "You may activate 1"
        // must be encoded as a MODAL_CHOICE/ACTIVATE_ONE_OF branch, unless the
        // card has a mutually exclusive "activate all instead" condition branch.
        // Otherwise all effects resolve sequentially, which is not official.
        const modalChoiceText = /(?:you may\s+)?activate\s+1\s+of\s+the\s+effects\s+below|choose\s+1\s+of\s+the\s+effects\s+below/i.test(cardTextForSourceScope);
        if (modalChoiceText) {
            const relevantMechs = (card.mechanics || []).filter(mech => {
                const trig = String(mech.trigger || '').toUpperCase();
                return ['MAIN','ON_PLAY','WHEN_DIGIVOLVING','WHEN_ATTACKING','ALL_TURNS'].includes(trig);
            });
            const hasModal = relevantMechs.some(mech => (mech.actions || []).some(action => ['MODAL_CHOICE','ACTIVATE_ONE_OF'].includes(String(action.type || '').toUpperCase())));
            const sequentialChoiceLike = relevantMechs.some(mech => {
                const actions = mech.actions || [];
                if (actions.some(action => ['MODAL_CHOICE','ACTIVATE_ONE_OF'].includes(String(action.type || '').toUpperCase()))) return false;
                const branchyTypes = actions.filter(action => ['DP_MOD','DRAW','GAIN_MEMORY','DELETE_DIGIMON','DE_DIGIVOLVE','WARP_EVOLVE','DNA_DIGIVOLVE','PLAY_FROM_HAND','PLAY_FROM_HAND_OR_TRASH','PLAY_FROM_SOURCE','RETURN_TO_DECK','SEND_TO_SECURITY','SUSPEND_OPPONENT','UNSUSPEND','GRANT_KEYWORD','CANT_SUSPEND'].includes(String(action.type || '').toUpperCase()));
                return branchyTypes.length >= 2;
            });
            if (!hasModal && sequentialChoiceLike) {
                addSemanticIssue(report, card, 'modalChoiceEncodingLeak', 'Printed choose-one/modal effect is encoded as sequential actions; use MODAL_CHOICE so only one branch resolves.', {
                    triggers: relevantMechs.map(mech => mech.trigger),
                    text: cardTextForSourceScope.slice(0, 360)
                });
            }
        }





        // Round 16Y: Tamer play effects that say they can't play cards with
        // the same name as any of your Tamers need an explicit target/runtime
        // restriction. These effects also must keep the printed card type and
        // source zone (for example, Tamer card from trash, not Digimon/from hand).
        const sameNameTamerRestrictionText = /can't\s+play\s+cards?\s+with\s+the\s+same\s+name\s+as\s+any\s+of\s+your\s+Tamers|without\s+the\s+same\s+name\s+as\s+any\s+of\s+your\s+Tamers/i.test(cardTextForSourceScope);
        if (sameNameTamerRestrictionText) {
            const playActions = (card.mechanics || []).flatMap((mech, mechIndex) =>
                (Array.isArray(mech.actions) ? mech.actions : [])
                    .map((action, actionIndex) => ({ mech, mechIndex, action, actionIndex }))
                    .filter(entry => /^PLAY_FROM_/.test(String(entry.action.type || '').toUpperCase()))
            );
            const hasRestrictedTamerPlay = playActions.some(({ action }) => {
                const target = action.target || {};
                return String(target.cardType || '').toLowerCase() === 'tamer'
                    && (target.noSameNameAsOwnTamer === true || target.excludeSameNameAsOwnTamer === true || action.noSameNameAsOwnTamer === true);
            });
            if (!hasRestrictedTamerPlay) {
                addSemanticIssue(report, card, 'sameNameTamerRestrictionLeak', 'Printed Tamer-play same-name restriction is missing target.noSameNameAsOwnTamer:true, or the play action is not encoded as a Tamer play.', {
                    playActions: playActions.map(({ mech, action, actionIndex }) => ({ trigger: mech.trigger, actionIndex, type: action.type, target: action.target || null })),
                    text: cardTextForSourceScope.slice(0, 360)
                });
            }
            const mentionsFromTrash = /from\s+your\s+trash|from\s+trash/i.test(cardTextForSourceScope);
            if (mentionsFromTrash && playActions.some(({ action }) => String(action.type || '').toUpperCase() === 'PLAY_FROM_HAND')) {
                addSemanticIssue(report, card, 'sameNameTamerRestrictionLeak', 'Printed text plays the Tamer from trash, but mechanics uses PLAY_FROM_HAND.', {
                    playActions: playActions.map(({ mech, action, actionIndex }) => ({ trigger: mech.trigger, actionIndex, type: action.type, target: action.target || null }))
                });
            }
        }

        // Round 16U: printed self-buff clauses must explicitly target the effect host.
        // Missing target on GRANT_KEYWORD becomes AOE at runtime; owner/count-only DP_MOD opens
        // an illegal target window. Keep this focused on currently verified problematic cards, including D-Reaper self static clauses.
        if (['P-213', 'BT25-053', 'EX2-050', 'EX2-052'].includes(card.id)) {
            (card.mechanics || []).forEach((mech, mechIndex) => {
                (mech.actions || []).forEach((action, actionIndex) => {
                    if (!['GRANT_KEYWORD', 'DP_MOD'].includes(String(action.type || '').toUpperCase())) return;
                    const target = action.target || {};
                    if (target.self !== true) {
                        addSemanticIssue(report, card, 'implicitSelfTargetMissingLeak', 'This Digimon self-buff must use target.self:true to avoid AOE or illegal target-choice behavior.', {
                            trigger: mech.trigger,
                            mechIndex,
                            actionIndex,
                            actionType: action.type,
                            target
                        });
                    }
                });
                if (card.id === 'P-213' && mech.trigger === 'WHEN_DIGIVOLVING' && !mech.actions.some(a => a.type === 'REQUEST_ATTACK_PLAYER' || a.type === 'ATTACK_PLAYER')) {
                    addSemanticIssue(report, card, 'implicitSelfTargetMissingLeak', 'Printed text says this Digimon may attack, but no effect-created attack action is encoded.', {
                        trigger: mech.trigger,
                        mechIndex
                    });
                }
            });
        }



        // Round 17B: verified all-scope buffs must not be encoded as count:1.
        // Keep this focused on validated cards to avoid flagging unrelated "1 of" actions on cards whose text also contains an all-scope clause.
        const verifiedAllScopeCards = new Set(['EX2-046', 'EX3-033', 'BT24-090', 'EX2-054', 'EX2-034', 'BT3-106', 'BT2-104']);
        if (verifiedAllScopeCards.has(card.id)) {
            (card.mechanics || []).forEach((mech, mechIndex) => {
                (mech.actions || []).forEach((action, actionIndex) => {
                    const type = String(action.type || '').toUpperCase();
                    if (!['DP_MOD','GRANT_KEYWORD','UNSUSPEND'].includes(type)) return;
                    const target = action.target || {};
                    const targetTrait = String(target.trait || '').toLowerCase();
                    const isVerifiedAllScope =
                        (card.id === 'EX2-046' && type === 'DP_MOD' && targetTrait === 'd-reaper') ||
                        (card.id === 'EX3-033' && type === 'GRANT_KEYWORD' && targetTrait === 'four great dragons') ||
                        (card.id === 'BT24-090' && type === 'GRANT_KEYWORD' && targetTrait === 'ts') ||
                        (card.id === 'EX2-054' && type === 'GRANT_KEYWORD' && String(target.owner || '').toLowerCase() === 'opponent') ||
                        (card.id === 'EX2-034' && type === 'DP_MOD' && String(target.keyword || '').toLowerCase() === 'blocker') ||
                        (card.id === 'BT3-106' && type === 'GRANT_KEYWORD' && Array.isArray(target.keywordAny) && target.keywordAny.map(x => String(x).toLowerCase()).includes('blocker') && target.keywordAny.map(x => String(x).toLowerCase()).includes('reboot')) ||
                        (card.id === 'BT2-104' && String(mech.trigger || '').toUpperCase() === 'SECURITY' && ['DP_MOD','UNSUSPEND'].includes(type) && String(target.keyword || '').toLowerCase() === 'blocker');
                    if (isVerifiedAllScope && target.count !== 'all') {
                        addSemanticIssue(report, card, 'allScopeCountOneLeak', 'Printed text says all matching Digimon gain/get the effect, but mechanics does not use target.count:"all".', {
                            trigger: mech.trigger,
                            mechIndex,
                            actionIndex,
                            actionType: action.type,
                            target
                        });
                    }
                });
            });
        }



        // Round 17C: verified printed [Main] effects must not disappear just because a card also has a Security mechanic.
        // Keep the first guard targeted to BT5-103 to avoid broad false positives while we expand coverage card-by-card.
        if (card.id === 'BT5-103') {
            const hasMainMechanic = (card.mechanics || []).some(mech => mech && mech.trigger === 'MAIN');
            if (!hasMainMechanic) {
                addSemanticIssue(report, card, 'verifiedMainEffectMissingLeak', 'Printed [Main] effect is missing from mechanics; Security-only encoding would make the card unusable from hand.', {
                    expected: 'MAIN DP_MOD + GRANT_KEYWORD for all own Reboot Digimon'
                });
            }
        }


        // Round 17E/17F: verified same-target follow-ups must bind to the previous target.
        // Keep targeted to cards whose printed text uses exact same-target wording, not generic "1 of their" wording.
        if (['BT7-103', 'BT25-053'].includes(card.id)) {
            (card.mechanics || []).forEach((mech, mechIndex) => {
                (mech.actions || []).forEach((action, actionIndex) => {
                    if (String(action.type || '').toUpperCase() !== 'CANT_UNSUSPEND') return;
                    const prev = (mech.actions || [])[actionIndex - 1];
                    if (!prev || String(prev.type || '').toUpperCase() !== 'SUSPEND_OPPONENT') return;
                    const target = action.target || {};
                    if (target.sameAsPreviousTarget !== true) {
                        addSemanticIssue(report, card, 'sameTargetFollowupLeak', 'Printed text says That/It cannot unsuspend, but mechanics opens an independent target instead of binding to the previously suspended target.', {
                            trigger: mech.trigger,
                            mechIndex,
                            actionIndex,
                            target
                        });
                    }
                });
            });
        }

        if (card.id === 'BT1-095') {
            (card.mechanics || []).forEach((mech, mechIndex) => {
                (mech.actions || []).forEach((action, actionIndex) => {
                    if (String(action.type || '').toUpperCase() !== 'GRANT_KEYWORD') return;
                    const prev = (mech.actions || [])[actionIndex - 1];
                    if (!prev || String(prev.type || '').toUpperCase() !== 'UNSUSPEND') return;
                    const target = action.target || {};
                    if (target.sameAsPreviousTarget !== true) {
                        addSemanticIssue(report, card, 'sameTargetFollowupLeak', 'Printed text says Unsuspend 1... That Digimon gains Blocker, but GRANT_KEYWORD opens an independent target instead of binding to the previously unsuspended target.', {
                            trigger: mech.trigger,
                            mechIndex,
                            actionIndex,
                            target
                        });
                    }
                });
            });
        }


        if (card.id === 'EX6-040') {
            (card.mechanics || []).forEach((mech, mechIndex) => {
                if (String(mech.trigger || '').toUpperCase() !== 'MAIN') return;
                (mech.actions || []).forEach((action, actionIndex) => {
                    if (String(action.type || '').toUpperCase() !== 'DP_MOD') return;
                    const prev = (mech.actions || [])[actionIndex - 1];
                    if (!prev || String(prev.type || '').toUpperCase() !== 'PLACE_SOURCE') return;
                    const target = action.target || {};
                    if (target.sameAsPreviousTarget !== true) {
                        addSemanticIssue(report, card, 'placeSourceSameTargetBuffLeak', 'Printed text says placing this card under 1 Digimon makes that Digimon get DP; the DP_MOD follow-up must bind to the PLACE_SOURCE host.', {
                            trigger: mech.trigger,
                            mechIndex,
                            actionIndex,
                            target
                        });
                    }
                });
            });
        }

        if (['EX6-038', 'EX6-007', 'EX6-008'].includes(card.id)) {
            const hasPlaceSourceDpBuff = (card.mechanics || []).some(mech =>
                String(mech.trigger || '').toUpperCase() === 'MAIN' &&
                (mech.actions || []).some(action =>
                    String(action.type || '').toUpperCase() === 'PLACE_SOURCE' &&
                    String(action.buff?.stat || '').toUpperCase() === 'DP' &&
                    Number(action.buff?.value || 0) !== 0
                )
            );
            if (!hasPlaceSourceDpBuff) {
                addSemanticIssue(report, card, 'placeSourceSameTargetBuffLeak', 'Verified Legend-Arms hand Main effect should keep its DP buff attached to PLACE_SOURCE or a sameAsPreviousTarget DP_MOD follow-up.', { id: card.id });
            }
        }



        // Round 19X: printed <Blitz> should not be encoded as a normal
        // battle/delete/request-player card action. The runtime opens a dedicated
        // optional BLITZ_TARGET_CHOICE when the memory condition is met.
        if (/＜?\s*Blitz\s*＞?|\bBlitz\b/i.test(cardTextForSourceScope)) {
            const badBlitzActions = [];
            (card.mechanics || []).forEach((mech, mechIndex) => (mech.actions || []).forEach((action, actionIndex) => {
                const actionBlob = JSON.stringify(action || {});
                const type = String(action?.type || '').toUpperCase();
                if (['BATTLE_DIGIMON','DELETE_DIGIMON','REQUEST_ATTACK_PLAYER','ATTACK_PLAYER'].includes(type) && /blitz/i.test(actionBlob)) {
                    badBlitzActions.push({ mechIndex, actionIndex, type });
                }
            }));
            if (badBlitzActions.length > 0) {
                addSemanticIssue(report, card, 'blitzTimingRuntimeLeak', 'Printed Blitz must not be encoded as direct battle/delete/request-player mechanics; attack-flow runtime opens optional BLITZ_TARGET_CHOICE.', { badBlitzActions });
            }
        }

        // Round 19U: printed <Raid> is handled by attack-flow runtime, not by
        // card mechanics that directly battle/delete/redirect because those can
        // bypass the official optional target-change and Counter/Blocker timing.
        if (/＜?\s*Raid\s*＞?|Raid/i.test(cardTextForSourceScope)) {
            const badRaidActions = [];
            (card.mechanics || []).forEach((mech, mechIndex) => (mech.actions || []).forEach((action, actionIndex) => {
                const actionBlob = JSON.stringify(action || {});
                const type = String(action?.type || '').toUpperCase();
                if (['BATTLE_DIGIMON','DELETE_DIGIMON','CHANGE_ATTACK_TARGET','REDIRECT_ATTACK_TARGET'].includes(type) && /raid/i.test(actionBlob)) {
                    badRaidActions.push({ mechIndex, actionIndex, type });
                }
            }));
            if (badRaidActions.length > 0) {
                addSemanticIssue(report, card, 'raidTargetLegalityLeak', 'Printed Raid must not be encoded as normal battle/delete/redirect card mechanics; attack-flow runtime opens optional RAID_TARGET_CHOICE.', { badRaidActions });
            }
        }

        // Round 17H: "If you played" / "the Digimon played by this effect" must not
        // reselect by name after a failed play, nor point at an older copy already in play.
        if (/(?:digimon|card)\s+played\s+by\s+this\s+effect/i.test(cardTextForSourceScope) && /(?:change|switch)\s+the\s+(?:attack\s+target|target\s+of\s+attack)\s+to\s+(?:that\s+digimon|the\s+digimon\s+played\s+by\s+this\s+effect)/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForPlayedByEffect = mechanicsStrCached;
            const hasAttackRedirect = mechanicsBlobForPlayedByEffect.includes('"CHANGE_ATTACK_TARGET"') || mechanicsBlobForPlayedByEffect.includes('"REDIRECT_ATTACK_TARGET"');
            const hasPlayedByThisEffectBinding = mechanicsBlobForPlayedByEffect.includes('"PLAYED_BY_THIS_EFFECT"') &&
                (mechanicsBlobForPlayedByEffect.includes('"playedByThisEffect":true') || mechanicsBlobForPlayedByEffect.includes('"useLastPlayedByThisEffect":true'));
            const riskyFreshRedirect = hasAttackRedirect && !hasPlayedByThisEffectBinding;
            if (!hasAttackRedirect || !hasPlayedByThisEffectBinding || riskyFreshRedirect) {
                report.semanticIssues.playedByThisEffectFollowupLeak.push(createSemanticIssue(card,
                    'Attack redirect to the Digimon played by this effect must be conditioned on the same-effect play result and target playedByThisEffect, not a fresh name search.',
                    { hasAttackRedirect, hasPlayedByThisEffectBinding, riskyFreshRedirect }
                ));
            }
        }

        // Round 17I: "Suspend 1 Digimon. If this effect suspended your Digimon..."
        // needs a generic any-owner suspend action and a same-effect own-suspend condition.
        if (/(?:You may )?Suspend 1(?: level \d+ or lower)? Digimon\. If this effect suspended your Digimon/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForSuspendAny = mechanicsStrCached;
            const hasGenericSuspendAny = mechanicsBlobForSuspendAny.includes('"type":"SUSPEND"') && mechanicsBlobForSuspendAny.includes('"owner":"any"');
            const hasOwnSuspendCondition = mechanicsBlobForSuspendAny.includes('"SUSPENDED_OWN_BY_THIS_EFFECT"') || mechanicsBlobForSuspendAny.includes('"IF_SUSPENDED_OWN_BY_THIS_EFFECT"');
            const hasConditionalFollowup = (card.mechanics || []).some(mech => (mech.actions || []).some((action, actionIndex) =>
                actionIndex > 0 &&
                ['SUSPENDED_OWN_BY_THIS_EFFECT','IF_SUSPENDED_OWN_BY_THIS_EFFECT'].includes(String(action.condition?.type || '').toUpperCase())
            ));
            if (!hasGenericSuspendAny || !hasOwnSuspendCondition || !hasConditionalFollowup) {
                addSemanticIssue(report, card, 'suspendAnyIfOwnSuspendedLeak', 'Printed text says Suspend 1 Digimon, then only if this effect suspended your Digimon do the follow-up. It must not be encoded as SUSPEND_OPPONENT or an unconditional follow-up.', {
                    hasGenericSuspendAny,
                    hasOwnSuspendCondition,
                    hasConditionalFollowup
                });
            }
        }



        // Round 17K: Wind Slicer uses the same generic suspend/own-suspended
        // pattern but includes level text and optional wording, so keep a
        // targeted guard to prevent regression back to SUSPEND_OPPONENT/own-only.
        if (card.id === 'EX7-069') {
            const main = (card.mechanics || []).find(mech => String(mech.trigger || '').toUpperCase() === 'MAIN');
            const sec = (card.mechanics || []).find(mech => String(mech.trigger || '').toUpperCase() === 'SECURITY');
            const windMechs = [main, sec].filter(Boolean);
            const bad = windMechs.some(mech => {
                const first = mech.actions?.[0] || {};
                const second = mech.actions?.[1] || {};
                return first.type !== 'SUSPEND' || first.target?.owner !== 'any' || Number(first.target?.maxLevel) !== 6 || second.type !== 'UNSUSPEND' || second.condition?.type !== 'SUSPENDED_OWN_BY_THIS_EFFECT';
            }) || windMechs.length !== 2;
            if (bad) {
                addSemanticIssue(report, card, 'suspendAnyIfOwnSuspendedLeak', 'EX7-069 Wind Slicer must suspend any level 6 or lower Digimon, then gate unsuspend on same-effect own suspension.', { id: card.id });
            }
        }

        // Round 17J: If this effect deleted one of your Digimon must not use
        // a vague HAS_TRAIT placeholder or global deletion count. It must depend
        // on same-effect own deletion success.
        if (/If this effect deleted one of your Digimon/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForDeletedOwn = mechanicsStrCached;
            const hasDeletedOwnCondition = mechanicsBlobForDeletedOwn.includes('"DELETED_OWN_BY_THIS_EFFECT"') || mechanicsBlobForDeletedOwn.includes('"IF_DELETED_OWN_BY_THIS_EFFECT"');
            const hasBadPlaceholder = /own digimon was deleted by this effect/i.test(mechanicsBlobForDeletedOwn) || mechanicsBlobForDeletedOwn.includes('"LAST_DELETION_COUNT"');
            if (!hasDeletedOwnCondition || hasBadPlaceholder) {
                addSemanticIssue(report, card, 'deletedOwnByThisEffectLeak', 'Printed text requires a same-effect own deletion result; follow-up must use DELETED_OWN_BY_THIS_EFFECT.', {
                    hasDeletedOwnCondition,
                    hasBadPlaceholder
                });
            }
        }



        // Round 17L: "If this effect didn't delete" / "If no Digimon was deleted
        // by this effect" must check same-effect deletion failure, not memory/DP
        // placeholder conditions or broad board state.
        if (/(?:If this effect didn\'t delete|If no (?:opponent\'s )?Digimon was deleted by this effect|If an opponent\'s Digimon wasn\'t deleted by this effect)/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForNotDeleted = mechanicsStrCached;
            const hasNotDeletedCondition = mechanicsBlobForNotDeleted.includes('"NOT_DELETED_BY_THIS_EFFECT"') ||
                mechanicsBlobForNotDeleted.includes('"IF_NOT_DELETED_BY_THIS_EFFECT"') ||
                mechanicsBlobForNotDeleted.includes('"NOT_DELETED_OPPONENT_BY_THIS_EFFECT"') ||
                mechanicsBlobForNotDeleted.includes('"IF_NOT_DELETED_OPPONENT_BY_THIS_EFFECT"');
            const actionHasBadFailurePlaceholder = (action) => {
                const cond = action && action.condition;
                if (!cond) return false;
                const condBlob = JSON.stringify(cond);
                return condBlob.includes('"DP_CHECK"') ||
                    condBlob.includes('"MEMORY_COUNT"') ||
                    condBlob.includes('"LAST_DELETION_COUNT"') ||
                    /opponent has no Digimon in play|wasn'?t deleted by this effect|didn'?t delete/i.test(condBlob);
            };
            const hasBadPlaceholder = (card.mechanics || []).some(mech => (mech.actions || []).some((action, idx) => idx > 0 && actionHasBadFailurePlaceholder(action)));
            const guardedRound17LIds = new Set(['EX2-067','EX4-048','BT17-010','BT21-068','BT17-016','BT19-015','P-186','BT16-081','BT12-018','BT24-096','ST7-09','BT9-017','EX10-009','EX6-055','EX4-013','BT17-008','BT23-071']);
            if (guardedRound17LIds.has(card.id) && (!hasNotDeletedCondition || hasBadPlaceholder)) {
                addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Printed text requires same-effect deletion failure; follow-up must use NOT_DELETED_BY_THIS_EFFECT / NOT_DELETED_OPPONENT_BY_THIS_EFFECT, not DP/MEMORY/LAST_DELETION placeholders.', {
                    hasNotDeletedCondition,
                    hasBadPlaceholder
                });
            }
            // Round 22BT: high-confidence failed-delete card repairs.
            // These cards had either missing DELETE_DIGIMON actions, DP_CHECK placeholders,
            // or wrong follow-up zones. Keep exact guards so future regeneration cannot
            // silently reintroduce those official text mismatches.
            const round22BtBlob = mechanicsBlobForNotDeleted;
            const compact22Bt = round22BtBlob.replace(/\s+/g, '');
            if (card.id === 'ST7-09') {
                if (!/"DELETE_DIGIMON"/.test(round22BtBlob) || !/"maxDp":4000/.test(compact22Bt) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || !/"self":true/.test(compact22Bt)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: ST7-09 must delete 4000 DP or less, then self +3000 only if this same effect deleted nothing.');
                }
            }
            if (card.id === 'BT9-017') {
                if (!/"DELETE_DIGIMON"/.test(round22BtBlob) || !/"lowest_dp"/.test(round22BtBlob) || !/"UNSUSPEND"/.test(round22BtBlob) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || /"DP_CHECK"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: BT9-017 must unsuspend only if its same-effect lowest-DP delete deleted nothing, without DP_CHECK placeholders.');
                }
            }
            if (card.id === 'EX10-009') {
                if (!/"TRASH_DECK_TOP"/.test(round22BtBlob) || /"TRASH_SECURITY_STACK"/.test(round22BtBlob) || !/"TRASH_COUNT"/.test(round22BtBlob) || !/"owner":"opponent"/.test(compact22Bt) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: EX10-009 must trash opponent deck top 5 on failed delete and count opponent trash for its attack branch.');
                }
            }
            if (card.id === 'EX6-055') {
                if (!/"maxLevel":5/.test(compact22Bt) || !/"TRASH_HAND"/.test(round22BtBlob) || !/"HAND_COUNT"/.test(round22BtBlob) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || /"DP_CHECK"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: EX6-055 must delete Lv.5-or-lower, trash opponent hand only on failed delete, and gate Rush/Sec+1 by opponent hand count.');
                }
            }
            if (card.id === 'EX4-013') {
                if (!/"SUSPEND_OPPONENT"/.test(round22BtBlob) || !/"CANT_UNSUSPEND"/.test(round22BtBlob) || !/"sameAsPreviousTarget":true/.test(compact22Bt) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || /"DP_CHECK"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: EX4-013 must suspend on failed delete and lock that same target from unsuspending.');
                }
            }
            if (card.id === 'BT17-008') {
                if (!/"OWN_CARD_PLAYED"/.test(round22BtBlob) || !/"EVENT_CONTEXT"/.test(round22BtBlob) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || /"DP_CHECK"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: BT17-008 must listen to played Calumon/Takato cards and gain memory only on same-effect failed delete.');
                }
            }
            if (card.id === 'BT23-071') {
                if (!/"DELETE_DIGIMON"/.test(round22BtBlob) || !/"highest_level"/.test(round22BtBlob) || !/"NOT_DELETED_BY_THIS_EFFECT"/.test(round22BtBlob) || /"WHEN_ATTACKING"[\s\S]{0,220}"highest_level"/.test(round22BtBlob)) {
                    addSemanticIssue(report, card, 'notDeletedByThisEffectLeak', 'Round 22BT: BT23-071 must use real highest-level delete and failed-delete self +5000, without fake When Attacking highest-level DP_MOD.');
                }
            }
        }

        // Round 17M: returned/not-returned follow-ups must use same-effect
        // successful return context, not memory placeholders or board-state checks.
        if (/(?:If this effect returned|If this effect didn\'t return|If no Digimon was returned by this effect)/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForReturned = mechanicsStrCached;
            const hasReturnedCondition = mechanicsBlobForReturned.includes('"RETURNED_BY_THIS_EFFECT"') ||
                mechanicsBlobForReturned.includes('"IF_RETURNED_BY_THIS_EFFECT"') ||
                mechanicsBlobForReturned.includes('"NOT_RETURNED_BY_THIS_EFFECT"') ||
                mechanicsBlobForReturned.includes('"IF_NOT_RETURNED_BY_THIS_EFFECT"') ||
                mechanicsBlobForReturned.includes('"RETURNED_OPPONENT_BY_THIS_EFFECT"') ||
                mechanicsBlobForReturned.includes('"NOT_RETURNED_OPPONENT_BY_THIS_EFFECT"');
            const returnActionTypes = new Set(['BOUNCE','RETURN_TO_DECK','ADD_TO_HAND','RETURN_SOURCE_TO_HAND']);
            const badReturnFollowupCondition = (action) => {
                const condBlob = JSON.stringify(action?.condition || {});
                return /"MEMORY_COUNT"|"DP_CHECK"|"LAST_RETURN_COUNT"|didn'?t return|was returned by this effect/i.test(condBlob);
            };
            const hasBadPlaceholder = (card.mechanics || []).some(mech => {
                let sawReturnAction = false;
                return (mech.actions || []).some(action => {
                    if (returnActionTypes.has(String(action?.type || '').toUpperCase())) {
                        sawReturnAction = true;
                        return false;
                    }
                    return sawReturnAction && badReturnFollowupCondition(action);
                });
            });
            const guardedRound17MIds = new Set(['BT25-091','EX9-066','BT24-091','LM-039','BT11-033']);
            if (guardedRound17MIds.has(card.id) && (!hasReturnedCondition || hasBadPlaceholder)) {
                addSemanticIssue(report, card, 'returnedByThisEffectLeak', 'Printed returned/not-returned follow-up must use RETURNED_BY_THIS_EFFECT / NOT_RETURNED_BY_THIS_EFFECT same-effect context.', {
                    hasReturnedCondition,
                    hasBadPlaceholder
                });
            }
        }

        // Round 17N: trashed/didn't-trash follow-ups must use same-effect
        // successful trash context, not memory/security/source-count placeholders.
        if (/(?:If this effect trashed|If this effect didn\'t trash|If this effect didn’t trash|If no card was trashed by this effect)/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForTrashed = mechanicsStrCached;
            const hasTrashedCondition = mechanicsBlobForTrashed.includes('"TRASHED_BY_THIS_EFFECT"') ||
                mechanicsBlobForTrashed.includes('"IF_TRASHED_BY_THIS_EFFECT"') ||
                mechanicsBlobForTrashed.includes('"NOT_TRASHED_BY_THIS_EFFECT"') ||
                mechanicsBlobForTrashed.includes('"IF_NOT_TRASHED_BY_THIS_EFFECT"') ||
                mechanicsBlobForTrashed.includes('"TRASHED_OPPONENT_BY_THIS_EFFECT"') ||
                mechanicsBlobForTrashed.includes('"NOT_TRASHED_OPPONENT_BY_THIS_EFFECT"');
            const badTrashFollowupCondition = (action) => {
                const condBlob = JSON.stringify(action?.condition || {});
                return /"MEMORY_COUNT"|"SOURCE_COUNT"|"TRASH_COUNT"|LAST_TRASH|didn'?t trash|trashed by this effect/i.test(condBlob);
            };
            const hasBadPlaceholder = (card.mechanics || []).some(mech => (mech.actions || []).some((action, idx) => idx > 0 && badTrashFollowupCondition(action)));
            const guardedRound17NIds = new Set(['P-212','EX5-069']);
            if (guardedRound17NIds.has(card.id) && (!hasTrashedCondition || hasBadPlaceholder)) {
                addSemanticIssue(report, card, 'trashedByThisEffectLeak', 'Printed trashed/did-not-trash follow-up must use TRASHED_BY_THIS_EFFECT / NOT_TRASHED_BY_THIS_EFFECT same-effect context.', {
                    hasTrashedCondition,
                    hasBadPlaceholder
                });
            }
        }


        // Round 17O: placed/not-placed follow-ups must use same-effect placement
        // context. Do not let "If this effect placed" actions fire unconditionally.
        if (/(?:If this effect placed|If this effect didn\'t place|If this effect didn’t place)/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForPlaced = mechanicsStrCached;
            const hasPlacedCondition = mechanicsBlobForPlaced.includes('"PLACED_BY_THIS_EFFECT"') ||
                mechanicsBlobForPlaced.includes('"IF_PLACED_BY_THIS_EFFECT"') ||
                mechanicsBlobForPlaced.includes('"NOT_PLACED_BY_THIS_EFFECT"') ||
                mechanicsBlobForPlaced.includes('"IF_NOT_PLACED_BY_THIS_EFFECT"');
            const badPlacedFollowupCondition = (action) => {
                const condBlob = JSON.stringify(action?.condition || {});
                return /"MEMORY_COUNT"|LAST_PLACE|placed by this effect|didn.?t place|if this effect placed/i.test(condBlob);
            };
            const hasBadPlaceholder = (card.mechanics || []).some(mech => {
                let sawPlaceAction = false;
                return (mech.actions || []).some(action => {
                    if (String(action?.type || '').toUpperCase() === 'PLACE_SOURCE' || String(action?.type || '').toUpperCase() === 'PLACE_THIS_CARD_AS_SECURITY' || String(action?.type || '').toUpperCase() === 'PLACE_IN_DELAY_AREA') {
                        sawPlaceAction = true;
                        return false;
                    }
                    return sawPlaceAction && badPlacedFollowupCondition(action);
                });
            });
            const guardedRound17OIds = new Set(['EX7-044','AD1-023','AD1-020']);
            if (guardedRound17OIds.has(card.id) && (!hasPlacedCondition || hasBadPlaceholder)) {
                addSemanticIssue(report, card, 'placedByThisEffectLeak', 'Printed placed/not-placed follow-up must use PLACED_BY_THIS_EFFECT / NOT_PLACED_BY_THIS_EFFECT same-effect context.', {
                    hasPlacedCondition,
                    hasBadPlaceholder
                });
            }
        }



        // Round 17P: "for each card placed by this effect" must scale from the
        // actual number of cards this same effect successfully placed. A fixed
        // maximum such as DE_DIGIVOLVE amount:3 silently over-resolves when only
        // 1-2 cards were placed, and a single amount:3 on one target is not the
        // same as repeating De-Digivolve 1 once per placed card.
        if (/for each card (?:this effect )?placed|for each card placed by this effect/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForPlacedCount = mechanicsStrCached;
            const hasPlacedDynamicCount = mechanicsBlobForPlacedCount.includes('"repeatForEachPlacedByThisEffect"') ||
                mechanicsBlobForPlacedCount.includes('"source":"PLACED_BY_THIS_EFFECT"');
            const hasFixedPlacedMax = /"type":"DE_DIGIVOLVE"[\s\S]{0,160}"amount":\s*[2-9]/.test(mechanicsBlobForPlacedCount) ||
                /"amount":\s*-?1[\s\S]{0,160}"for each card this effect placed/i.test(mechanicsBlobForPlacedCount);
            const guardedRound17PIds = new Set(['EX3-013']);
            if (guardedRound17PIds.has(card.id) && (!hasPlacedDynamicCount || hasFixedPlacedMax)) {
                addSemanticIssue(report, card, 'placedByThisEffectCountLeak', 'Printed for-each-card-placed follow-up must scale from actual PLACED_BY_THIS_EFFECT count, not fixed printed maximum.', {
                    hasPlacedDynamicCount,
                    hasFixedPlacedMax
                });
            }
        }



        // Round 17Q: "for each card trashed by this effect" must scale from
        // the actual number of cards this effect successfully moved to trash.
        // EX4-073 is explicitly clarified by the official Apr. 17, 2026 revision:
        // delete one lowest-play-cost Digimon/Tamer once per trashed source, then
        // trash security only if 3 cards were actually trashed.
        if (/for each card (?:this effect )?trashed|for each card trashed by this effect|for each card trashed/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForTrashedCount = mechanicsStrCached;
            const hasTrashedDynamicCount = mechanicsBlobForTrashedCount.includes('"repeatForEachTrashedByThisEffect"') ||
                mechanicsBlobForTrashedCount.includes('"source":"TRASHED_BY_THIS_EFFECT"');
            const hasOldAlterBCost = mechanicsBlobForTrashedCount.includes('"type":"TRASH_SECURITY_STACK","amount":3,"position":"top"');
            const guardedRound17QIds = new Set(['EX4-073']);
            if (guardedRound17QIds.has(card.id) && (!hasTrashedDynamicCount || hasOldAlterBCost)) {
                addSemanticIssue(report, card, 'trashedByThisEffectCountLeak', 'Printed for-each-card-trashed follow-up must scale from actual TRASHED_BY_THIS_EFFECT count and must not trash security as the Alter-B source cost.', {
                    hasTrashedDynamicCount,
                    hasOldAlterBCost
                });
            }
        }

        // Round 17R: "for each level of the Digimon deleted by this effect"
        // must use the level of the card actually deleted by this same effect.
        // Fixed numbers, printed-keyword stubs, or unconditional deck trashing
        // over-resolve when deletion fails or the deleted Digimon has another level.
        if (/for each level of (?:the )?Digimon deleted by this effect/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForDeletedLevel = mechanicsStrCached;
            const hasDeletedLevelDynamicCount = mechanicsBlobForDeletedLevel.includes('DELETED_LEVELS_BY_THIS_EFFECT') ||
                mechanicsBlobForDeletedLevel.includes('DELETED_BY_THIS_EFFECT_LEVEL_SUM');
            const hasFakeBlockerFollowup = /"type":"GRANT_KEYWORD"[\s\S]{0,120}"Blocker"/.test(mechanicsBlobForDeletedLevel);
            const guardedRound17RIds = new Set(['EX6-058']);
            if (guardedRound17RIds.has(card.id) && (!hasDeletedLevelDynamicCount || hasFakeBlockerFollowup)) {
                addSemanticIssue(report, card, 'deletedByThisEffectLevelCountLeak', 'Printed for-each-level-deleted follow-up must scale from actual same-effect deleted Digimon levels.', {
                    hasDeletedLevelDynamicCount,
                    hasFakeBlockerFollowup
                });
            }
        }

        // Round 17S: "for each card added to your hand by this effect" must
        // use the number of cards this effect actually moved to hand. Fixed
        // suspend counts, HAS_SPECIFIC_CARD placeholders, or count:all over-resolve.
        if (/for each card added to (?:your|the) hand by this effect/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForAddedCount = mechanicsStrCached;
            const hasAddedDynamicCount = mechanicsBlobForAddedCount.includes('repeatForEachAddedToHandByThisEffect') ||
                mechanicsBlobForAddedCount.includes('ADDED_TO_HAND_BY_THIS_EFFECT');
            const hasAddedPlaceholder = /"value":"added_to_hand"|"selection":"added_to_hand"/.test(mechanicsBlobForAddedCount);
            const hasFixedAllSuspend = /"type":"SUSPEND_OPPONENT"[\s\S]{0,220}"count":"all"/.test(mechanicsBlobForAddedCount);
            const guardedRound17SIds = new Set(['BT4-107']);
            if (guardedRound17SIds.has(card.id) && (!hasAddedDynamicCount || hasAddedPlaceholder || hasFixedAllSuspend)) {
                addSemanticIssue(report, card, 'addedToHandByThisEffectCountLeak', 'Printed for-each-card-added-to-hand follow-up must scale from actual ADDED_TO_HAND_BY_THIS_EFFECT count.', {
                    hasAddedDynamicCount,
                    hasAddedPlaceholder,
                    hasFixedAllSuspend
                });
            }
        }


        // Round 17T: "for each Digimon/Tamer suspended by this effect" must
        // scale from targets actually suspended by this same effect, with owner
        // filtering when the printed text says opponent's Digimon.

        // Round 17X: BT14-033 Patamon has a start-of-main security digivolve
        // effect. It must not be reduced to generic start-turn / your-turn memory gain.
        if (card.id === 'BT14-033') {
            const mechanicsBlobForPatamon = mechanicsStrCached;
            const hasStartMain = mechanicsBlobForPatamon.includes('"trigger":"START_OF_MAIN_PHASE"');
            const hasSecurityWarp = mechanicsBlobForPatamon.includes('"type":"WARP_EVOLVE"') && mechanicsBlobForPatamon.includes('"security"');
            const hasDigivolvedGate = mechanicsBlobForPatamon.includes('DIGIVOLVED_BY_THIS_EFFECT') || mechanicsBlobForPatamon.includes('"byThisEffect":true');
            const hasInheritedSecurityAdded = mechanicsBlobForPatamon.includes('"trigger":"SECURITY_ADDED"') && mechanicsBlobForPatamon.includes('"isInherited":true');
            const hasWrongStartTurnGainOnly = mechanicsBlobForPatamon.includes('"trigger":"START_OF_TURN"') && !hasSecurityWarp;
            if (!hasStartMain || !hasSecurityWarp || !hasDigivolvedGate || !hasInheritedSecurityAdded || hasWrongStartTurnGainOnly) {
                addSemanticIssue(report, card, 'patamonBt14033EncodingLeak', 'BT14-033 Patamon must search/digivolve from security at start of main phase and gate the hand-to-security follow-up on this effect actually digivolving.', {
                    hasStartMain, hasSecurityWarp, hasDigivolvedGate, hasInheritedSecurityAdded, hasWrongStartTurnGainOnly
                });
            }
        }

        // Round 17X: A normal Blocker timing window with no legal blockers must
        // auto-skip. Otherwise server action guard keeps the match stuck in
        // counter/block timing even though the defender cannot block.
        try {
            const gs = gameStateTextForRuntimeGuards;
            if (!/getLegalBlockers\(playerId\)/.test(gs) || !/enterBlockerStepOrSkip\(defenderId\)/.test(gs) || !/No legal blockers available; blocker timing auto-skipped/.test(gs)) {
                addSemanticIssue(report, card, 'blockerWindowNoLegalBlockerLeak', 'Runtime must auto-skip BLOCKER timing when the defender has no legal blockers.', {});
            }
        } catch(e) {}

        if (/for each (?:of your opponent's )?(?:Digimon|Tamer|Tamers|card|cards)[^\.]{0,120}suspended by this effect/i.test(cardTextForSourceScope)) {
            const mechanicsBlobForSuspendedCount = mechanicsStrCached;
            const hasSuspendedDynamicCount = mechanicsBlobForSuspendedCount.includes('SUSPENDED_BY_THIS_EFFECT');
            const hasFixedMemoryGain = /"type":"GAIN_MEMORY"[\s\S]{0,80}"amount":\s*1/.test(mechanicsBlobForSuspendedCount) && !hasSuspendedDynamicCount;
            const hasOpponentOnlySuspendForGenericText = card.id === 'EX8-044' && mechanicsBlobForSuspendedCount.includes('"type":"SUSPEND_OPPONENT"');
            const guardedRound17TIds = new Set(['EX8-044']);
            if (guardedRound17TIds.has(card.id) && (!hasSuspendedDynamicCount || hasFixedMemoryGain || hasOpponentOnlySuspendForGenericText)) {
                addSemanticIssue(report, card, 'suspendedByThisEffectCountLeak', 'Printed for-each-suspended-by-this-effect follow-up must scale from actual SUSPENDED_BY_THIS_EFFECT count and preserve generic any-owner suspend wording.', {
                    hasSuspendedDynamicCount,
                    hasFixedMemoryGain,
                    hasOpponentOnlySuspendForGenericText
                });
            }
        }

        if (needsHostBoundSourceCount) {
            const mechanicsBlobForSourceScope = mechanicsStrCached;
            const hasAnySourceCountEncoding = mechanicsBlobForSourceScope.includes('"type":"SOURCE_COUNT"');
            const hasHostBoundEncoding = hasAnySourceCountEncoding &&
                (mechanicsBlobForSourceScope.includes('"hostTarget"') || mechanicsBlobForSourceScope.includes('"scope":"base_source"') || mechanicsBlobForSourceScope.includes('"sourceTarget"'));
            const textRequiresExternalHostBinding = /one of your Digimon with|one of your \[[^\]]+\]s has|Mother D-Reaper\]s has|Tamer card in (?:its|their) digivolution cards would digivolve/i.test(cardTextForSourceScope);
            const textIsThisDigimonRawCount = /this Digimon has \d+ or more digivolution cards/i.test(cardTextForSourceScope);
            const encodingOk = textRequiresExternalHostBinding ? hasHostBoundEncoding : (textIsThisDigimonRawCount ? hasAnySourceCountEncoding : hasHostBoundEncoding);
            if (!encodingOk && /Mother D-Reaper|Tamer card in (?:its|their) digivolution cards|with \[[^\]]+\].*digivolution cards/i.test(cardTextForSourceScope)) {
                report.semanticIssues.sourceCountHostScopeLeak.push(createSemanticIssue(card,
                    'Printed source-count/source-content condition appears to need host/base binding but mechanics do not use SOURCE_COUNT hostTarget/base_source/sourceTarget.',
                    { text: cardTextForSourceScope.slice(0, 260) }
                ));
            }
        }

        const textNeedsCantSuspend = /can(?:not|\s*not|\'t|’t)\s+(?:be\s+)?suspended?|can(?:not|\s*not|\'t|’t)\s+suspend/i.test(cardTextForSourceScope);
        if (textNeedsCantSuspend) {
            const mechanicsBlobForCantSuspend = mechanicsStrCached;
            if (!mechanicsBlobForCantSuspend.includes('\"type\":\"CANT_SUSPEND\"')) {
                report.semanticIssues.cantSuspendEncodingLeak.push(createSemanticIssue(card,
                    "Printed text says a Digimon/Tamer can't suspend or can't be suspended, but mechanics do not use CANT_SUSPEND.",
                    { text: cardTextForSourceScope.slice(0, 240) }
                ));
            }
            if (/GRANT_KEYWORD[\s\S]{0,260}can(?:not|\'t|’t)\s+(?:be\s+)?suspended?/i.test(mechanicsBlobForCantSuspend)) {
                report.semanticIssues.cantSuspendEncodingLeak.push(createSemanticIssue(card,
                    "Printed can't-be-suspended status should use CANT_SUSPEND, not GRANT_KEYWORD placeholder text.",
                    { text: cardTextForSourceScope.slice(0, 240) }
                ));
            }
        }

        const textNeedsCantUnsuspend = /can(?:not|\s*not|\'t|’t)\s+unsuspend/i.test(cardTextForSourceScope);
        if (textNeedsCantUnsuspend) {
            const mechanicsBlobForCantUnsuspend = mechanicsStrCached;
            if (!mechanicsBlobForCantUnsuspend.includes('\"type\":\"CANT_UNSUSPEND\"')) {
                report.semanticIssues.cantSuspendEncodingLeak.push(createSemanticIssue(card,
                    "Printed text says a Digimon/Tamer can't unsuspend, but mechanics do not use CANT_UNSUSPEND.",
                    { text: cardTextForSourceScope.slice(0, 240) }
                ));
            }
            if (/GRANT_KEYWORD[\s\S]{0,260}can(?:not|\'t|’t)\s+unsuspend/i.test(mechanicsBlobForCantUnsuspend)) {
                report.semanticIssues.cantSuspendEncodingLeak.push(createSemanticIssue(card,
                    "Printed can't-unsuspend status should use CANT_UNSUSPEND, not GRANT_KEYWORD placeholder text.",
                    { text: cardTextForSourceScope.slice(0, 240) }
                ));
            }
        }


        const textNeedsPlaySourceTotalCost = /play up to \d+ play cost'?s total worth of [^.]+ from this Digimon['’]s digivolution cards/i.test(cardTextForSourceScope);
        if (textNeedsPlaySourceTotalCost) {
            const mechanicsBlobForPlaySourceTotal = mechanicsStrCached;
            const hasSourceTotalPlay = mechanicsBlobForPlaySourceTotal.includes('"type":"PLAY_FROM_SOURCE"') &&
                mechanicsBlobForPlaySourceTotal.includes('"selection":"total_play_cost"') &&
                (mechanicsBlobForPlaySourceTotal.includes('"sourceHostSelf":true') || mechanicsBlobForPlaySourceTotal.includes('"sourceHost":"self"'));
            const hasHandTrashTotalLeak = /"type":"PLAY_FROM_HAND_OR_TRASH"[^}]+"selection":"total_play_cost"/.test(mechanicsBlobForPlaySourceTotal);
            if (!hasSourceTotalPlay || hasHandTrashTotalLeak) {
                report.semanticIssues.playFromSourceTotalCostLeak.push(createSemanticIssue(card,
                    "Printed text plays total play-cost cards from this Digimon\'s digivolution cards, but mechanics do not use host-bound PLAY_FROM_SOURCE total-play-cost selection.",
                    { hasSourceTotalPlay, hasHandTrashTotalLeak, text: cardTextForSourceScope.slice(0, 280) }
                ));
            }
        }

        // Round 16M: static immunity/effect activation lock wording must not be
        // represented as PREVENT_LEAVE_PLAY (leave protection) or STUN (can't attack).
        const mechanicsBlobForEffectLocks = mechanicsStrCached;
        const textLooksLikeOpponentEffectImmunity = /(?:unaffected|not affected|isn['’]?t affected|aren['’]?t affected|none of your [^.]+ are affected)\s+[^.]{0,120}opponent['’]?s?[^.]{0,80}effects?/i.test(cardTextForSourceScope);
        if (textLooksLikeOpponentEffectImmunity && mechanicsBlobForEffectLocks.includes('"type":"PREVENT_LEAVE_PLAY"')) {
            report.semanticIssues.effectImmunityActivationLockLeak.push(createSemanticIssue(card,
                'Printed text grants immunity/unaffected-by-opponent-effects, but mechanics use PREVENT_LEAVE_PLAY leave protection.',
                { text: cardTextForSourceScope.slice(0, 320) }
            ));
        }
        const textLooksLikeActivationLock = /(?:can't|cannot|can\s*not|don't|do\s*not|none of [^.]+ can)\s+[^.]{0,120}activate\s+\[[^\]]+\]\s+effects?/i.test(cardTextForSourceScope);
        if (textLooksLikeActivationLock && mechanicsBlobForEffectLocks.includes('"type":"STUN"')) {
            report.semanticIssues.effectImmunityActivationLockLeak.push(createSemanticIssue(card,
                "Printed text prevents effect activation, but mechanics use STUN/can\'t attack instead of EFFECT_ACTIVATION_LOCK.",
                { text: cardTextForSourceScope.slice(0, 320) }
            ));
        }


        // Round 16N: cards that say "If this effect DNA digivolved" must guard the
        // follow-up action(s) with DIGIVOLVE_CONTEXT dna:true. Otherwise effects
        // like BT16-097 Recovery +1 happen even when DNA was impossible or skipped.
        if (/if this effect dna digivolved/i.test(cardTextForSourceScope)) {
            const mainMechs = (card.mechanics || []).filter(mech => String(mech.trigger || '').toUpperCase() === 'MAIN');
            const hasDnaAction = mainMechs.some(mech => (mech.actions || []).some(action => String(action.type || '').toUpperCase() === 'DNA_DIGIVOLVE'));
            const hasGuardedFollowUp = mainMechs.some(mech => {
                const actions = mech.actions || [];
                const dnaIndex = actions.findIndex(action => String(action.type || '').toUpperCase() === 'DNA_DIGIVOLVE');
                if (dnaIndex < 0) return false;
                return actions.slice(dnaIndex + 1).some(action => {
                    const cond = action.condition || {};
                    return String(cond.type || '').toUpperCase() === 'DIGIVOLVE_CONTEXT' && (cond.dna === true || cond.isDna === true);
                });
            });
            if (!hasDnaAction || !hasGuardedFollowUp) {
                report.semanticIssues.dnaPostconditionLeak.push(createSemanticIssue(card,
                    'Printed text says "If this effect DNA digivolved", but the follow-up actions are not guarded by DIGIVOLVE_CONTEXT dna:true.',
                    { hasDnaAction, hasGuardedFollowUp, text: cardTextForSourceScope.slice(0, 320) }
                ));
            }
        }

        // Round 16B: self-target cleanup for buff/restriction actions.
        // "This Digimon gets/gains..." must be encoded as target.self, not
        // target.trait:"this" / "this Digimon", because those are not official
        // traits and will break target matching.
        const SELF_TARGET_ACTIONS = new Set([
            'DP_MOD', 'GRANT_KEYWORD', 'UNSUSPEND', 'CANT_ATTACK', 'CANT_ATTACK_PLAYER',
            'CANT_UNSUSPEND', 'CANT_ACTIVATE_EFFECT', 'EFFECT_ACTIVATION_LOCK', 'UNAFFECTED_BY_OPPONENT_EFFECTS'
        ]);
        const SELF_TARGET_WORDS = new Set(['this', 'this digimon', 'this card', 'it']);
        (card.mechanics || []).forEach((mech, mechIndex) => {
            (mech.actions || []).forEach((action, actionIndex) => {
                const target = action.target || {};
                if (!SELF_TARGET_ACTIONS.has(String(action.type || '').toUpperCase())) return;
                const leaked = ['trait', 'name', 'nameContains'].some(key => SELF_TARGET_WORDS.has(String(target[key] || '').trim().toLowerCase()));
                if (leaked) {
                    addSemanticIssue(report, card, 'selfTargetTraitLeak', 'Self-target wording was encoded as a trait/name selector instead of target.self.', {
                        trigger: mech.trigger,
                        actionType: action.type,
                        mechIndex,
                        actionIndex,
                        target
                    });
                }
            });
        });
        if (!card.mechanics || card.mechanics.length === 0 || card.mechanics[0].trigger === "MANUAL") {
            const cardText = cardTextLowerCached;

            const looksAutoNeeded =
                cardText.includes("[on play]") ||
                cardText.includes("[when digivolving]") ||
                cardText.includes("[when attacking]") ||
                cardText.includes("[on deletion]") ||
                cardText.includes("[main]") ||
                cardText.includes("[security]") ||
                cardText.includes("reveal the top") ||
                cardText.includes("reveal ") ||
                cardText.includes("draw ") ||
                cardText.includes("gain ") ||
                cardText.includes("delete ") ||
                cardText.includes("return ") ||
                cardText.includes("play 1") ||
                cardText.includes("recovery");

            if (looksAutoNeeded && !isPrintedKeywordOnlyTextForAudit(card)) {
                const issue = {
                    id: card.id,
                    name: card.name,
                    reason: "卡文看起来需要自动效果，但 mechanics 是空的",
                    mainEffect: card.mainEffect || "",
                    sourceEffect: card.sourceEffect || ""
                };

                report.missingMechanics.push(issue);

                console.log(`\n⚠️ 未生成 mechanics: [${card.id}] ${card.name}`);
                console.log(`   -> ${issue.reason}`);

                badCount++;
            }

            return;
        }

        let bugs = [];
        const mechanicsStr = mechanicsStrCached;
        const cardText = cardTextLowerCached;

        // Round 14A: run semantic checks separately from hard schema checks.
        collectSemanticIssues(card, report, cardTextLowerCached, mechanicsStrCachedLower);

        card.mechanics.forEach((mech, mechIndex) => {
            if (!mech || typeof mech !== "object") {
                bugs.push(`❌ mechanic[${mechIndex}] 不是 object`);
                return;
            }

            if (!VALID_TRIGGERS.has(mech.trigger)) {
                bugs.push(`❌ 非法 trigger: ${mech.trigger}`);
            }

            validateCondition(mech.condition, bugs, `mechanic[${mechIndex}].condition`);

            if (mech.cost && mech.cost.type) {
                const VALID_COSTS = new Set([
                    "MEMORY",
                    "PAY_MEMORY",
                    "SUSPEND",
                    "TRASH_HAND",
                    "TRASH_SECURITY",
                    "TRASH_SECURITY_STACK",
                    "TRASH_BOTTOM_EVO",
                    "DELETE_DIGIMON",
                    "DELETE_OWN_DIGIMON_COST",
                    "PLACE_SOURCE",
                    "PLACE_SOURCE_TO_SECURITY",
                    "RETURN_TO_DECK",
                    "RETURN_TO_HAND_COST",
                    "ADD_SECURITY_TO_HAND",
                    "PLACE_SECURITY_FROM_HAND",
  "PLACE_SECURITY_FROM_TRASH",
  "PLACE_THIS_CARD_AS_SECURITY",
                    "AND",
                    "COMPOSITE",
                    "TRASH_SOURCE",
                    "TRASH_HAND_OR_SOURCE",
                    "RETURN_SOURCE_TO_HAND",
                    "TRASH_OPTION_IN_BATTLE_AREA",
                    "TRASH_BREEDING_DIGIMON_COST",
                    "UNSUSPEND_THIS_DIGIMON_COST",
                    "TRASH_BOTTOM_TAMER_SOURCE_COST"
                ]);

                if (!VALID_COSTS.has(mech.cost.type)) {
                    bugs.push(`❌ 非法 cost type: ${mech.cost.type}`);
                }
            }

            if (!Array.isArray(mech.actions)) {
                bugs.push(`❌ ${mech.trigger} 的 actions 不是 array`);
                return;
            }

            mech.actions.forEach((act, actIndex) => {
                if (!act || typeof act !== "object" || Array.isArray(act)) {
                    bugs.push(`❌ action[${actIndex}] 不是合法 object`);
                    return;
                    }

                if (!VALID_ACTIONS.has(act.type)) {
                    bugs.push(`❌ 非法 action type: ${act.type}`);
                }

                // 🔍 Reveal 多选择槽检查：防止 "Add 1 A and 1 B" 被错误合并成 "A or B"
                if (
                    act.type === "REVEAL_AND_SELECT" &&
                    act.target &&
                    typeof act.target.trait === "string" &&
                    Number(act.target.count || 0) > 1 &&
                    /\s+or\s+/i.test(act.target.trait)
                ) {
                const textLooksLikeSeparateSlots =
                    /\badd\s+1\b/i.test(cardText) &&
                    /\band\s+1\b/i.test(cardText);

                    const textLooksLikePickMultipleFromOrPool =
                        /\badd\s+2\s+cards?\b/i.test(cardText) ||
                        /\badd\s+up\s+to\s+2\s+cards?\b/i.test(cardText) ||
                        /\badd\s+all\b/i.test(cardText);

                    if (textLooksLikeSeparateSlots && !textLooksLikePickMultipleFromOrPool) {
                        bugs.push("❌ Reveal 多选择槽被合并成一个 OR trait，应改用 selections 数组");
                    }
                }

                if (
                    act.type === "REVEAL_AND_SELECT" &&
                    /\band\s+1\b/i.test(cardText) &&
                    !Array.isArray(act.selections)
                ) {
                    bugs.push("❌ Reveal 文本包含多个选择目标，但 mechanics 没有使用 selections 数组");
                }
                
                validateCondition(act.condition, bugs, `action[${actIndex}].condition`);
                validateCondition(act.target && act.target.condition, bugs, `action[${actIndex}].target.condition`);
                if (act.target && act.target.condition) {
                    addSemanticIssue(report, card, 'nestedTargetCondition', 'action.target.condition is ignored by resolver; move it to action.condition', {
                        path: `mechanics[${mechIndex}].actions[${actIndex}].target.condition`,
                        actionType: act.type,
                        condition: act.target.condition
                    });
                }

                if (
                    act.type === "RETURN_TO_DECK" &&
                    String(act.from || act.zone || '').toLowerCase().includes('revealed') &&
                    (
                        cardText.includes("place the rest") ||
                        cardText.includes("place the remaining") ||
                        cardText.includes("return the rest") ||
                        cardText.includes("return the remaining") ||
                        cardText.includes("trash the rest") ||
                        cardText.includes("trash the remaining")
                    )
                ) {
                    bugs.push("❌ Reveal 剩余卡不应使用 RETURN_TO_DECK，应该使用 RETURN_REVEALED_REST_TO_DECK_BOTTOM / RETURN_REVEALED_REST_TO_DECK_TOP / TRASH_REVEALED_REST");
                }

                if (act.target && act.target.owner && !VALID_OWNERS.has(act.target.owner)) {
                    bugs.push(`❌ 非法 owner: ${act.target.owner}`);
                    }

                if (act.type === "TRASH_BOTTOM_EVO") {
                    const text = cardText;
                    const isActuallyBottomDeck =
                        text.includes("bottom of your deck") ||
                        text.includes("bottom of the deck") ||
                        text.includes("bottom of its owner's deck");

                    const isActuallyTrashEvo =
                        /trash the bottom\s*(?:\d+)?\s*digivolution/.test(text) ||
                        text.includes("trash 1 digivolution card") ||
                        text.includes("trash any 1 option card from 1 digimon's digivolution cards");

                    if (isActuallyBottomDeck && !isActuallyTrashEvo) {
                        bugs.push("❌ 把 deck bottom 错写成 TRASH_BOTTOM_EVO");
                    }
                }

                if (act.type === "RETURN_TO_DECK") {
                    if (cardText.includes("to the hand") || cardText.includes("to your hand")) {
                        bugs.push("❌ return/add to hand 被错写成 RETURN_TO_DECK");
                    }
                }

                if (act.type === "STUN") {
                    if (
                        cardText.includes("can't attack players") ||
                        cardText.includes("can't unsuspend") ||
                        cardText.includes("can't attack")
                ) {
                    bugs.push("⚠️ STUN 语义太粗：需要拆成 CANT_ATTACK / CANT_UNSUSPEND / CANT_ATTACK_PLAYER");
                    }
                }
            });
        });

        const hasRevealText =
        cardText.includes("reveal the top") ||
        cardText.includes("reveal ") ||
        cardText.includes("reveal 3 cards") ||
        cardText.includes("reveal 4 cards") ||
        cardText.includes("reveal 5 cards");

    const hasRevealAction = mechanicsStr.includes('"REVEAL_AND_SELECT"');

    const hasRevealRestBottomAction =
        mechanicsStr.includes('"RETURN_REVEALED_REST_TO_DECK_BOTTOM"');

    const hasRevealRestTopAction =
        mechanicsStr.includes('"RETURN_REVEALED_REST_TO_DECK_TOP"');

    const hasTrashRevealRestAction =
        mechanicsStr.includes('"TRASH_REVEALED_REST"');

    const textMentionsRest =
        cardText.includes("place the rest") ||
        cardText.includes("place the remaining") ||
        cardText.includes("return the rest") ||
        cardText.includes("return the remaining") ||
        cardText.includes("trash the rest") ||
        cardText.includes("trash the remaining");

    const textSaysTrashRest =
        cardText.includes("trash the rest") ||
        cardText.includes("trash the remaining");

    // 注意：不能只检查 "top of your deck"
    // 因为 Reveal from the top of your deck 会造成误报
    const textSaysTopOrBottomRest =
        /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+(?:to|at|on)\s+(?:the\s+)?top\s+or\s+bottom/i.test(cardText) ||
        /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+(?:to|at|on)\s+(?:the\s+)?bottom\s+or\s+top/i.test(cardText);

    const textSaysBottomRest =
        !textSaysTopOrBottomRest &&
        (
            /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+(?:to|at|on)\s+(?:the\s+)?bottom/i.test(cardText) ||
            /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+.*bottom of (?:your|the|its owner's) deck/i.test(cardText)
        );

    const textSaysTopRest =
        !textSaysTopOrBottomRest &&
        (
            /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+(?:to|at|on)\s+(?:the\s+)?top/i.test(cardText) ||
            /(?:place|return)\s+(?:the\s+)?(?:rest|remaining cards?)\s+.*top of (?:your|the|its owner's) deck/i.test(cardText)
        );

    // Round 10B: cards can contain multiple reveal clauses with different cleanup destinations
    // (e.g. Main returns rest to top, Delay trashes rest). Require all mentioned cleanups,
    // but do not flag mixed cleanup actions as contradictions.
    const mixedRevealCleanupText = [textSaysBottomRest, textSaysTopRest, textSaysTrashRest].filter(Boolean).length > 1;

    if (hasRevealText && hasRevealAction) {
        if (textSaysBottomRest && !hasRevealRestBottomAction) {
            bugs.push("❌ Reveal 有剩余卡放底，但缺少 RETURN_REVEALED_REST_TO_DECK_BOTTOM");
        }

        if (textSaysTopRest && !hasRevealRestTopAction) {
            bugs.push("❌ Reveal 有剩余卡放顶，但缺少 RETURN_REVEALED_REST_TO_DECK_TOP");
        }

        if (textSaysTopOrBottomRest && !hasRevealRestBottomAction && !hasRevealRestTopAction) {
            bugs.push("❌ Reveal 有剩余卡可放顶或放底，但缺少 RETURN_REVEALED_REST_TO_DECK_TOP / RETURN_REVEALED_REST_TO_DECK_BOTTOM");
        }

        if (textSaysTrashRest && !hasTrashRevealRestAction) {
            bugs.push("❌ Reveal 有剩余卡丢弃，但缺少 TRASH_REVEALED_REST");
        }

        if (!mixedRevealCleanupText && textSaysBottomRest && hasRevealRestTopAction) {
            bugs.push("❌ Reveal 剩余卡应该放底，但 mechanics 使用了 RETURN_REVEALED_REST_TO_DECK_TOP");
        }

        if (!mixedRevealCleanupText && textSaysTopRest && hasRevealRestBottomAction) {
            bugs.push("❌ Reveal 剩余卡应该放顶，但 mechanics 使用了 RETURN_REVEALED_REST_TO_DECK_BOTTOM");
        }

        if (!mixedRevealCleanupText && textSaysTrashRest && (hasRevealRestBottomAction || hasRevealRestTopAction)) {
            bugs.push("❌ Reveal 剩余卡应该丢弃，但 mechanics 使用了 RETURN_REVEALED_REST_TO_DECK");
        }
    }

        // 🚨 违规 1：强迫症瞎填 0 (我们在 v4.0 重点打击的病)
        if (mechanicsStr.includes('"maxDp":0') || 
            mechanicsStr.includes('"maxLevel":0') || 
            mechanicsStr.includes('"minCost":0') || 
            mechanicsStr.includes('"maxCost":0')) {
            bugs.push("🚫 强迫症填0 (maxDp/maxLevel/Cost: 0)");
        }

        // 🚨 违规 2：幻觉烧盾 (天女兽的锅)
        if (mechanicsStr.includes('"TRASH_SECURITY_STACK"') && 
            !cardText.includes('trash') && !cardText.includes('discard') && !cardText.includes('security attack')) {
            bugs.push("🔥 幻觉烧盾 (凭空生成 TRASH_SECURITY_STACK)");
        }

        // 🚨 违规 3：幻觉加血 (绝对爆风的锅)
        if (mechanicsStr.includes('"RECOVERY_DECK"') && !cardText.includes('recovery')) {
            bugs.push("🛡️ 幻觉加盾 (凭空生成 RECOVERY_DECK)");
        }

        // 🚨 违规 4：违章套娃嵌套 (Gatomon 的锅)
        let hasNesting = false;
        card.mechanics.forEach(mech => {
            (mech.actions || []).forEach(act => {
                const actionType = String(act?.type || '').toUpperCase();
                // Round 21T: GRANT_TRIGGER_EFFECT intentionally carries the
                // granted trigger's future actions. This is not illegal nested
                // immediate resolution; it is the runtime payload for the
                // temporary trigger attached to the target Digimon.
                if ((act.actions && actionType !== 'GRANT_TRIGGER_EFFECT') || (act.target && act.target.actions)) {
                    hasNesting = true;
                }
            });
        });
        if (hasNesting) {
            bugs.push("🪆 违章套娃 (Action内部嵌套Action)");
        }

        // 🚨 违规 5：不当的 ADD_TO_HAND 安保效果
        if (mechanicsStr.includes('"ADD_TO_HAND"') && mechanicsStr.includes('"zone":"security"')) {
             if (!cardText.includes("add this card to your hand") && !cardText.includes("add this card to the hand")) {
                 bugs.push("🖐️ 幻觉回手 (安保效果凭空生成 ADD_TO_HAND)");
             }
        }



        // 🚨 Round 8C: 关键词/替代效果语义检查
        // 这些关键词不是普通 trigger，不能被硬塞成 ON_DELETION / END_OF_TURN 等动作。
        const hasBarrierText = /＜\s*Barrier\s*＞|\bbarrier\b/i.test(cardText);
        const hasDecodeText = /＜\s*Decode\b|\bdecode\s*\(/i.test(cardText);
        const hasVortexText = /＜\s*Vortex\s*＞|\bvortex\b/i.test(cardText);
        const hasOverflowText = /＜\s*Overflow\b|\boverflow\s*[-+]?\d*/i.test(cardText);

        const onDeletionMechs = (card.mechanics || []).filter(mech => mech && mech.trigger === "ON_DELETION");
        const endOfTurnMechs = (card.mechanics || []).filter(mech => mech && mech.trigger === "END_OF_TURN");
        const allActionsFlat = (card.mechanics || []).flatMap(mech => Array.isArray(mech.actions) ? mech.actions : []);
        const manualActions = allActionsFlat.filter(act => act && act.type === "MANUAL_REQUIRED");

        if (hasBarrierText) {
            const barrierMisencodedAsDeletion = onDeletionMechs.some(mech => {
                const mechBlob = JSON.stringify(mech);
                const mechBlobLower = mechBlob.toLowerCase();
                return mechBlob.includes("PREVENT_LEAVE_PLAY") ||
                    mechBlob.includes("TRASH_SECURITY") ||
                    mechBlob.includes("TRASH_SECURITY_STACK") ||
                    mechBlobLower.includes("prevent deletion") ||
                    mechBlobLower.includes("barrier");
            });

            const barrierFakeBuff = allActionsFlat.some(act => {
                if (!(act.type === "TRASH_SECURITY_STACK" || act.type === "TRASH_SECURITY")) return false;
                return JSON.stringify(act).toLowerCase().includes("prevent");
            });

            if (barrierMisencodedAsDeletion || barrierFakeBuff) {
                bugs.push("❌ Barrier 是 would-be-deleted replacement，不能写成 ON_DELETION / TRASH_SECURITY_STACK + prevent buff");
            }
        }

        if (hasDecodeText) {
            const decodeMisencodedAsDeletion = onDeletionMechs.some(mech => {
                const mechBlob = JSON.stringify(mech);
                const mechBlobLower = mechBlob.toLowerCase();
                return mechBlob.includes("PLAY_FROM_SOURCE") ||
                    mechBlob.includes("PLAY_FROM_HAND_OR_TRASH") ||
                    mechBlobLower.includes("decode") ||
                    mechBlobLower.includes("aegiomon");
            });

            if (decodeMisencodedAsDeletion) {
                bugs.push("❌ Decode 是 would-leave-battle-area replacement，不能写成 ON_DELETION");
            }
        }

        if (hasVortexText) {
            const vortexManual = manualActions.some(act => /vortex/i.test(act.reason || ""));
            const vortexAsEndOfTurnManual = endOfTurnMechs.some(mech => {
                const mechBlobLower = JSON.stringify(mech).toLowerCase();
                return mechBlobLower.includes("vortex") && mechBlobLower.includes("manual_required");
            });
            const hasVortexRequest = allActionsFlat.some(act => act && act.type === "VORTEX_ATTACK_REQUEST");

            if ((vortexManual || vortexAsEndOfTurnManual) && !hasVortexRequest) {
                bugs.push("❌ Vortex 不应继续 MANUAL_REQUIRED；应进入 ATTACK_CHOICE / VORTEX_ATTACK_REQUEST 系统");
            }
        }

        if (hasOverflowText) {
            const overflowManual = manualActions.some(act => /overflow/i.test(act.reason || ""));
            const overflowAsAction = allActionsFlat.some(act => /overflow/i.test(JSON.stringify(act)));

            if (overflowManual || overflowAsAction) {
                bugs.push("❌ Overflow 是规则层离场处理，不应作为普通 action / MANUAL_REQUIRED 生成");
            }
        }

        manualActions.forEach(act => {
            const reason = String(act.reason || "");
            const category = classifyManualRequired(reason, cardText, mechanicsStr);

            report.manualRequiredByCategory.push({
                id: card.id,
                name: card.name,
                category,
                reason,
                mainEffect: card.mainEffect || "",
                sourceEffect: card.sourceEffect || ""
            });
        });

                // 👨‍⚕️ 如果查出问题，对卡牌进行“清空并打回重造”标记
        if (bugs.length > 0) {
            console.log(`\n❌ 查获病患: [${card.id}] ${card.name}`);
            bugs.forEach(b => console.log(`   -> ${b}`));

            const issue = {
                id: card.id,
                name: card.name,
                bugs,
                mainEffect: card.mainEffect || "",
                mechanics: card.mechanics || []
            };

            if (bugs.some(b => /Barrier|Decode|Vortex|Overflow/.test(b))) {
                report.semanticKeywordErrors.push(issue);
            }

            report.other.push(issue);

            badCount++;
        }
    });

    auditActivationLockEncodingLeak(allCards, report);
    auditSecuritySuppressionEncodingLeak(allCards, report);
    auditSuppressOnPlayEncodingLeak(allCards, report);
    auditCantBeDeletedEncodingLeak(allCards, report);
    auditCantBeReturnedEncodingLeak(allCards, report);
    auditSourceScopedOpponentEffectImmunityLeak(allCards, report);
    auditOpponentEffectImmunityEncodingLeak(allCards, report);
    auditAttackTargetChangeLockEncodingLeak(allCards, report);
    auditAttackTargetMoveEncodingLeak(allCards, report);
    auditCanOnlyAttackSuspendedDigimonEncodingLeak(allCards, report);
    auditDeDigivolveReminderTrashSecurityLeak(allCards, report);
    auditUnsuspendedAttackPermissionEncodingLeak(allCards, report);
    auditForcedOpponentAttackEncodingLeak(allCards, report);
    auditColorChangeEncodingLeak(allCards, report);
    auditTamerAsDigimonEncodingLeak(allCards, report);
    auditZeroDpPlaceholderLeak(allCards, report);
    auditOptionColorRequirementRuntimeLeak(allCards, report);
    auditDigimonOptionTargetLeak(allCards, report);
    auditEndAttackManualLeak(allCards, report);
    auditBreedingMoveEncodingLeak(allCards, report);
    auditCopySourceEffectsEncodingLeak(allCards, report);
    auditSaveSelfToTamerEncodingLeak(allCards, report);
    auditStunBroadEncodingLeak(allCards, report);
    auditFakeGrantKeywordSemanticLeak(allCards, report);
    auditPreventLeavePlaySemanticLeak(allCards, report);
    auditDigivolveOnlyColorEncodingLeak(allCards, report);
    auditSelfSourceColorStaticConditionRuntimeLeak(allCards, report);
    auditPlacedCardLevelCostBindingLeak(allCards, report);
    auditAeroVeedramonZeroCostTrashLeak(allCards, report);
    auditDynamicTotalPlayCostSourceBonusLeak(allCards, report);
    auditDynamicLevelMaximumTargetLeak(allCards, report);
    auditAmphimonRb1UnderCardCostLeak(allCards, report);
    auditAmphimonLmUnderCardCostLeak(allCards, report);
    auditTeslaJellymonEndAttackCostLeak(allCards, report);
    auditSimpleEndAttackTimingLeak(allCards, report);
    auditEndAttackSelfLeaveTimingLeak(allCards, report);
    auditInheritedEndAttackTimingLeak(allCards, report);
    auditPulsemonInheritedEndAttackSecurityCostLeak(allCards, report);
    auditTaomonSt22InheritedEndAttackSecurityCostLeak(allCards, report);
    auditAlphamonNameInheritedEndAttackSourceLeak(allCards, report);
    auditEx4AllianceInheritedEndAttackAnotherSuspendedLeak(allCards, report);
    auditMetalGreymonBt19025InheritedEndAttackTamerSourcePlayLeak(allCards, report);
    auditDexDoruGreymonInheritedEndAttackChosenLevelLeak(allCards, report);
    auditBeastAntylamonInheritedEndAttackCostLeak(allCards, report);
    auditHerculesKabuterimonEndAttackTwicePerTurnLeak(allCards, report);
    auditMagnadramonBt9043EndAttackSecurityToHandCostLeak(allCards, report);
    auditGlowingDawnInheritedEndAttackTamerSourceCostLeak(allCards, report);
    auditMegadramonEx9064InheritedEndAttackUnsuspendCostLeak(allCards, report);
    auditBlackRapidmonEndAttackDedigivolveLeak(allCards, report);
    auditDpCheckOwnerTargetScopeLeak(allCards, report);
    auditSameLevelDeletedHandCostLeak(allCards, report);
    auditPlayFromSourceHostSelectorLeak(allCards, report);
    auditCostSelectorSemanticLeak(allCards, report);
    auditEffectDigivolveFixedCostLeak(allCards, report);
    auditHandSpecialDigivolvePermissionLeak(allCards, report);
    auditReducedPlayCostEffectPlayLeak(allCards, report);
    auditTamerAutoAnimationTelemetryLeak(allCards, report);
    auditAttackPendingTargetDeadlockLeak(allCards, report);
    auditStartTurnOnPlayBleedLeak(allCards, report);
    auditOptionalTriggerConfirmLeak(allCards, report);
    auditVioletInbootsTimingLeak(allCards, report);
    auditSuspendTamerCostTargetLeak(allCards, report);
    auditBt25057FinalJudgmentErrataDurationLeak(allCards, report);
    auditSt1006MastemonErrataSecuritySearchLeak(allCards, report);
    auditEffectAttackDuringExistingAttackLeak(allCards, report);
    auditBt4105TacticalRetreatSecurityMoveLeak(allCards, report);
    auditOfficialNamedTokenAssetCoverageLeak(allCards, report);

    summarizeSemanticIssues(report);

    fs.writeFileSync(
        path.join(__dirname, 'audit-report.json'),
        JSON.stringify(report, null, 2)
    );

    if (Object.keys(report.semanticSummary || {}).length > 0) {
        console.log("\n🧠 Round 14A semantic summary:");
        Object.entries(report.semanticSummary).forEach(([bucket, stats]) => {
            console.log(`   ${bucket}: ${stats.issues} issue(s), ${stats.cards} card(s)`);
        });
    }

    console.log(`📄 已生成报告 → audit-report.json`);

    const semanticIssueCount = Object.values(report.semanticSummary || {}).reduce((sum, stats) => sum + Number(stats.issues || 0), 0);

    if (badCount > 0) {
        console.log(`\n🎯 体检完毕！硬性 schema/结构问题涉及 ${badCount} 张卡。`);
        console.log(`📋 本次只输出报告，没有修改 cards.json。`);
    } else if (semanticIssueCount > 0) {
        console.log(`\n✅ 硬性 schema/结构检查通过。`);
        console.log(`⚠️  但发现 ${semanticIssueCount} 个 Round 14A semantic risk，需要按 audit-report.json 分批修。`);
        console.log(`📋 本次只输出报告，没有修改 cards.json。`);
    } else {
        console.log(`\n🎉 体检完毕！没有发现已知问题。`);
    }
}

auditCards();
// Round 10F: Replacement protection keywords are runtime-supported:
// Barrier, Armor Purge/Partition, Scapegoat, Decoy, and Fortitude.
// Pure keyword placeholders should not be kept as MANUAL_REQUIRED.
