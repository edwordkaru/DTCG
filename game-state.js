class GameState {
    constructor(p1Name, p2Name, p1Deck = [], p2Deck = []) {
        this.players = { p1: { name: p1Name }, p2: { name: p2Name } };
        this.turnPlayer = 'p1';
        this.turnCount = 1;
        this.phase = 'MULLIGAN';
        this.mulliganDecisions = { p1: null, p2: null };
        this.memory = 0;
        this.gameOver = false;
        this.winner = null;
        this.hasActionedInHatch = false;
        this.eotTriggered = false;
        this.pendingEffectSelection = null;
        this.effectQueue = [];
        this.pendingTarget = null;
        this.pendingReveal = null;
        this.pendingTrashRevive = null;
        this.pendingProtection = null;
        this.counterTiming = { isActive: false, defenderId: null, pendingAttack: null, step: 'IDLE' };

        this.zones = {
            p1: { deck: [], hand: [], battleArea: [], trash: [], security: [], breedingArea: [], eggDeck: [] },
            p2: { deck: [], hand: [], battleArea: [], trash: [], security: [], breedingArea: [], eggDeck: [] }
        };

        this.initDeck('p1', p1Deck);
        this.initDeck('p2', p2Deck);
        this.setupGame();
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // --- 🔄 官方规则：Mulligan 调度 ---
    decideMulligan(playerId, doMulligan) {
        if (this.phase !== 'MULLIGAN' || this.mulliganDecisions[playerId] !== null) return;
        
        this.mulliganDecisions[playerId] = doMulligan;

        if (doMulligan) {
            const zone = this.zones[playerId];
            // 将手牌塞回卡组，洗牌，重抽 5 张
            zone.deck.push(...zone.hand);
            zone.hand = [];
            this.shuffle(zone.deck);
            for(let i=0; i<5; i++) {
                if(zone.deck.length > 0) zone.hand.push(zone.deck.pop());
            }
        }

        // 双方都决定完毕，比赛正式开始，进入先攻的孵化阶段
        if (this.mulliganDecisions.p1 !== null && this.mulliganDecisions.p2 !== null) {
            this.phase = 'HATCH';
        }
    }

    // --- 📥 官方规则：卡组初始化 ---
    initDeck(playerId, fullDeck) {
        const zone = this.zones[playerId];
        fullDeck.forEach(card => {
            // 生成独一无二的物理 ID
            const cardCopy = { 
                ...card, 
                instanceId: Math.random().toString(36).substr(2, 9) + Date.now() 
            };
            // 规则：Lv.2 或 Egg 类型进入蛋组，其他进入主卡组
            if (card.level === 2 || (card.type && card.type.toLowerCase().includes('egg'))) {
                zone.eggDeck.push(cardCopy);
            } else {
                zone.deck.push(cardCopy);
            }
        });
        this.shuffle(zone.deck);
        this.shuffle(zone.eggDeck);
    }

    // --- 🃏 官方规则：开局 setup ---
    setupGame() {
        ['p1', 'p2'].forEach(pId => {
            const zone = this.zones[pId];
            // 1. 设置 5 张安保卡
            for(let i=0; i<5; i++) {
                if(zone.deck.length > 0) zone.security.push(zone.deck.pop());
            }
            // 2. 抽取 5 张起始手牌
            for(let i=0; i<5; i++) {
                if(zone.deck.length > 0) zone.hand.push(zone.deck.pop());
            }
        });
    }

    nextPhase() {
        if (this.phase === 'HATCH') this.phase = 'MAIN';
        else if (this.phase === 'MAIN') {
            this.phase = 'END';
            this.handleEndOfTurn();
        } else {
            // 回合转换
            this.turnPlayer = this.turnPlayer === 'p1' ? 'p2' : 'p1';
            this.phase = 'HATCH';
            this.turnCount++;
            
            // 规则校准：只有从第 2 回合开始（或后攻第一回合）才执行 Draw Phase
            if (this.turnCount > 1) {
                this.drawCard(this.turnPlayer, 1);
            }
        }
    }

    sendToTrash(playerId, cardInstance) {
        const tr = this.zones[playerId].trash;

        // 🔥 关键：任何进入废弃区的卡，都必须先触发 Overflow
        this.processOverflow(playerId, cardInstance);

        // 如果有进化源，先把底牌全部单独送墓
        if (cardInstance.stack && cardInstance.stack.length > 0) {
            cardInstance.stack.forEach(sourceCard => {
                delete sourceCard.stack;
                // 底牌进入废弃区也要触发 Overflow（手册要求）
                this.processOverflow(playerId, sourceCard);
                tr.push(sourceCard);
            });
        }

        // 顶牌最后送墓
        delete cardInstance.stack;
        tr.push(cardInstance);
    }

    // ==========================================
    // 🛡️ 模拟器核心：规则警察 (Rule Processing)
    // ==========================================
    checkGlobalRules() {
        if (this.gameOver) return;
        const players = ['p1', 'p2'];
        players.forEach(p => {
            const area = this.zones[p].battleArea;
            for (let i = area.length - 1; i >= 0; i--) {
                const cardType = String(area[i].type || area[i].cardType || "").toLowerCase();
                if (cardType.includes('tamer') || cardType.includes('option')) continue;

                if (this.getDp(area[i]) <= 0) {
                    console.log(`💀 [RULE] ${area[i].name} 因为 DP 为 0 被消灭`);
                    const deadCard = area.splice(i, 1)[0];
                    this.processOverflow(p, deadCard); 
                    
                    // 🔥 修复：先触发遗言，后送入碎纸机！
                    this.triggerEffect(p, deadCard, "On Deletion");
                    this.sendToTrash(p, deadCard);
                }
            }
        });
    }

    // 🔥 替换原来的 checkTurnEnd（核心修复）
    checkTurnEnd() {
        if (this.counterTiming.isActive || this.effectQueue.length > 0) return;

        const isP1Turn = this.turnPlayer === 'p1';
        const opponentSide = isP1Turn ? this.memory < 0 : this.memory > 0;  // 指针在对手侧
        const opponentMemory = Math.abs(this.memory);

        if (opponentSide && opponentMemory >= 1) {
            if (!this.eotTriggered) {
                this.eotTriggered = true;
                console.log("⏳ 内存过线 → 扫描 [End of Turn] 效果...");

                // 回合玩家优先触发
                this.zones[this.turnPlayer].battleArea.forEach(card => 
                    this.triggerEffect(this.turnPlayer, card, "End of Turn")
                );
                // 再触发对手的
                const opp = this.turnPlayer === 'p1' ? 'p2' : 'p1';
                this.zones[opp].battleArea.forEach(card => 
                    this.triggerEffect(opp, card, "End of Turn")
                );

                if (this.effectQueue.length > 0) return;
            }
            console.log("✅ 效果清空 → 正式结束回合");
            this.passTurn();
        } else {
            this.eotTriggered = false;
        }
    }

    processEffectQueue() {
        if (this.effectQueue.length === 0) {
            this.pendingEffectSelection = null;
            return;
        }

        // 🛑 核心改变：不再自动执行，而是把整队效果挂起来，等玩家挑
        const first = this.effectQueue[0];
        this.pendingEffectSelection = {
            playerId: first.playerId,
            effects: [...this.effectQueue] // 把当前排队的所有效果发给前端
        };
    }

    // 🔥 处理玩家的排序与发动选择
    resolveManualEffect(playerId, effectIndex, confirmed) {
        if (!this.pendingEffectSelection || this.pendingEffectSelection.playerId !== playerId) return;

        const effect = this.effectQueue[effectIndex];
        if (!effect) return;

        if (confirmed) {
            console.log(`>> [EFFECT] 玩家确认发动: ${effect.cardName}`);
            this.applyEffect(effect);
        } else {
            console.log(`>> [EFFECT] 玩家选择跳过: ${effect.cardName}`);
        }

        // 处理完一个，从队列里踢走
        this.effectQueue.splice(effectIndex, 1);
        
        // 继续处理剩下的效果
        this.processEffectQueue();
    }

    declareAttack(playerId, attackerInstanceId, targetType, targetInstanceId = null) {
        if (this.gameOver || this.turnPlayer !== playerId) return; 
        if (this.counterTiming.isActive || this.effectQueue.length > 0) return; 
        if ((this.turnPlayer === 'p1' && this.memory < 0) || (this.turnPlayer === 'p2' && this.memory > 0)) {
            console.warn("🚫 内存已透支，无法发起攻击！");
            return;
        }

        if (this.phase === 'HATCH') {
            this.phase = 'MAIN';
            this.hasActionedInHatch = true;
            console.log("➡️ 玩家发起攻击，自动进入主要阶段 (MAIN PHASE)。");
            // 🔥 修复：正式进入主阶段，扫描触发全场内存驯兽师
            const currentPlayerArea = this.zones[this.turnPlayer].battleArea;
            currentPlayerArea.forEach(card => this.triggerEffect(this.turnPlayer, card, "Start of Main Phase"));
        }
    
        const attacker = this.zones[playerId].battleArea.find(c => c.instanceId === attackerInstanceId);
        if (!attacker || attacker.isSuspended) return;
        
        // 🔥 新增：检查是否被魔法冰冻
        if (attacker.turnEffects && attacker.turnEffects.some(e => e.type === 'STUN')) {
            console.warn(`🚫 规则拦截：${attacker.name} 已被冰冻状态禁锢，无法发起攻击！`);
            return;
        }
        
        if (attacker.playedThisTurn && !this.getKeywords(attacker).rush) return;

        // 🔥 修复：如果是拥有特权的狙击手，允许无视横置状态进行攻击
        if (targetType === 'digimon' && targetInstanceId) {
            const defSide = this.zones[(playerId === 'p1') ? 'p2' : 'p1'];
            const targetDigimon = defSide.battleArea.find(c => c.instanceId === targetInstanceId);
            
            if (!targetDigimon) {
                console.warn("🚫 规则拦截：目标非法或不存在于对方场上！");
                return;
            }
            
            const hasSniperPrivilege = this.getKeywords(attacker).attackActive;
            if (!targetDigimon.isSuspended && !hasSniperPrivilege) {
                console.warn("🚫 规则拦截：不能攻击未横置的数码兽！");
                return;
            }
        }
        
        attacker.isSuspended = true; 
        this.counterTiming = { 
            isActive: true, 
            step: 'WHEN_ATTACKING', 
            defenderId: playerId === 'p1' ? 'p2' : 'p1', 
            pendingAttack: { attackerId: playerId, attackerInstanceId, targetType, targetInstanceId } 
        };
        
        const preQueueLen = this.effectQueue.length;
        
        // 🔥 核心修复：打破“独狼”限制，全场广播！
        // 扫描己方整个战斗区，激活所有关联的 [When Attacking] 效果（如驯兽师的联动）
        const myArea = this.zones[playerId].battleArea;
        myArea.forEach(card => {
            this.triggerEffect(playerId, card, "When Attacking");
        });

        // 如果真的触发了攻击时效果，用系统指令强行把反击阶段往后拖
        if (this.effectQueue.length > preQueueLen) {
            this.effectQueue.push({
                id: `sys_counter_${Math.random().toString(36).substr(2, 5)}`,
                playerId: playerId,
                sourceName: "系统 (System)",
                effectText: `shift_to_counter`,
                type: "System",
                priority: 98 // 优先级卡在常规效果和连击判定之间
            });
            this.effectQueue.sort((a, b) => a.priority - b.priority);
        } else {
            // 如果是白板怪兽平A，没有效果阻挡，则直接开放反击窗口
            this.counterTiming.step = 'COUNTER';
        }
    }

    resolveCounter(playerId, actionType, blastData = null) {
        if (!this.counterTiming.isActive || this.counterTiming.step !== 'COUNTER') return;
        if (this.counterTiming.defenderId !== playerId) return;
        
        if (actionType === 'BLAST' && blastData) {
            // 🔥 修复：传入 true，激活免单特权，防止爆裂进化扣除内存
            this.playOrEvolve(playerId, blastData.handCard, 'battle', blastData.targetId, true);
        }
        
        if (this.effectQueue.length > 0) {
            console.log("⏳ 等待爆裂进化效果结算...");
            // 我们给时点打个特殊的补丁：等待效果
            this.counterTiming.step = 'WAIT_COUNTER_EFFECT';
            return;
        }

        this.counterTiming.step = 'BLOCKER';
    }

    performBlock(playerId, blockerInstanceId) {
        if (this.counterTiming.step !== 'BLOCKER' || this.counterTiming.defenderId !== playerId) return;
        const blocker = this.zones[playerId].battleArea.find(c => c.instanceId === blockerInstanceId);
        
        // 🔥 新增：检查阻挡者是否被冰冻
        if (blocker && blocker.turnEffects && blocker.turnEffects.some(e => e.type === 'STUN')) {
            console.warn(`🚫 规则拦截：${blocker.name} 已被冰冻状态禁锢，无法执行阻挡！`);
            return;
        }
        
        if (blocker && !blocker.isSuspended && this.getKeywords(blocker).blocker) {
            blocker.isSuspended = true;
            this.counterTiming.pendingAttack.targetType = 'digimon';
            this.counterTiming.pendingAttack.targetInstanceId = blockerInstanceId;
            
            // 🔥 补全规则：触发阻挡者的专属时点
            this.triggerEffect(playerId, blocker, "When Blocking");
        }
        
        // 🔥 核心重构：把同步对撞改成异步排队，确保效果先结算完
        this.effectQueue.push({
            id: `sys_exec_${Math.random().toString(36).substr(2, 5)}`,
            playerId: playerId,
            sourceName: "系统 (System)",
            effectText: `execute_attack`,
            type: "System",
            priority: 99 
        });
        this.effectQueue.sort((a, b) => a.priority - b.priority);
        this.counterTiming.step = 'DAMAGE_STEP'; // 锁死时点状态
    }

    skipBlock(playerId) {
        if (this.counterTiming.step !== 'BLOCKER' || this.counterTiming.defenderId !== playerId) return;
        
        this.effectQueue.push({
            id: `sys_exec_${Math.random().toString(36).substr(2, 5)}`,
            playerId: playerId,
            sourceName: "系统 (System)",
            effectText: `execute_attack`,
            type: "System",
            priority: 99 
        });
        this.effectQueue.sort((a, b) => a.priority - b.priority);
        this.counterTiming.step = 'DAMAGE_STEP';
    }

    executePendingAttack() {
        if (this.gameOver) return;
        const ad = this.counterTiming.pendingAttack;
        if (!ad) { this.resetBattleState(); return; }

        const defSide = this.zones[this.counterTiming.defenderId];
        const atkSide = this.zones[ad.attackerId];
        const attacker = atkSide.battleArea.find(c => c.instanceId === ad.attackerInstanceId);
        
        if (!attacker) { this.resetBattleState(); return; }

        const totalChecks = 1 + this.getKeywords(attacker).secPlus;

        if (ad.targetType === 'digimon') {
            const tIdx = defSide.battleArea.findIndex(c => c.instanceId === ad.targetInstanceId);
            if (tIdx !== -1) {
                const target = defSide.battleArea[tIdx];
                if (String(target.type || "").toLowerCase().includes('tamer')) {
                     this.resetBattleState(); return;
                }
                
                const battleResult = this.resolveBattle(ad.attackerId, attacker, this.counterTiming.defenderId, ad.targetInstanceId);
                
                if (battleResult.attackerSurvived && battleResult.targetDeleted && this.getKeywords(attacker).piercing) {
                    console.log(`🗡️ [PIERCING] ${attacker.name} 触发贯通，进行安保判定！`);
                    
                    // 🔥 撤销之前的误判：贯通只能进行判定，绝不能越权斩杀游戏！
                    if (defSide.security.length > 0 && totalChecks > 0) {
                        this.processSecurityChecks(ad.attackerId, attacker, defSide, totalChecks);
                    } else if (defSide.security.length === 0) {
                        console.log(`⚠️ 贯通触发，但对方已无安保卡，攻击就此止步。`);
                    }
                }
            }
        } else {
            if (defSide.security.length === 0) {
                // 🔥 修复：如果判定次数被减到 0 甚至负数，绝对不能赢！
                if (totalChecks > 0) {
                    this.gameOver = true;
                    this.winner = ad.attackerId;
                    this.resetBattleState();
                    return;
                } else {
                    console.log(`⚠️ 攻击命中玩家，但安保判定次数为 ${totalChecks}，判定无效！`);
                }
            } else {
                if (totalChecks > 0) this.processSecurityChecks(ad.attackerId, attacker, defSide, totalChecks);
            }
        }
        
        this.checkGlobalRules();

        // 🔥 修复：因为引入了异步安保判定，战斗绝对不能在这里同步结束！
        // 把“战斗结束收尾”也做成一个系统指令，排在所有连击和安保陷阱的最后面执行。
        this.effectQueue.push({
            id: `sys_eoa_${Math.random().toString(36).substr(2, 5)}`,
            playerId: ad.attackerId,
            sourceName: "系统 (System)",
            effectText: `end_of_attack ${ad.attackerInstanceId}`,
            type: "System",
            priority: 100 // 优先级最低 (100)，必须垫底执行
        });
        this.effectQueue.sort((a, b) => a.priority - b.priority);
        this.checkTurnEnd(); 
    }

    resetBattleState() {
        this.counterTiming.isActive = false;
        this.counterTiming.step = 'IDLE';
        this.counterTiming.pendingAttack = null;
    }

    dnaEvolve(playerId, handCard, targetId1, targetId2) {
        const cur = this.zones[playerId];
        const mat1 = cur.battleArea.find(c => c.instanceId === targetId1);
        const mat2 = cur.battleArea.find(c => c.instanceId === targetId2);

        if (!mat1 || !mat2 || !handCard) return;

        let canDNA = false;
        let drawAmount = 2;   // 默认 2（手册通常值）

        // ==========================================
        // 🔥 DNA 合法性 + 抽牌数量动态解析
        // ==========================================
        if (handCard.mainEffect) {
            const effectText = handCard.mainEffect.toLowerCase();

            // 模式 A: 颜色+等级
            const lvColorMatch = effectText.match(/\[dna digivolve\]\s*(\w+)\s*lv\.?(\d+)\s*\+\s*(\w+)\s*lv\.?(\d+)/i);
            if (lvColorMatch) {
                const [, cA, lA, cB, lB] = lvColorMatch;
                const matchNormal = (String(mat1.color || "").toLowerCase().includes(cA) && mat1.level == lA &&
                                     String(mat2.color || "").toLowerCase().includes(cB) && mat2.level == lB);
                const matchReverse = (String(mat1.color || "").toLowerCase().includes(cB) && mat1.level == lB &&
                                      String(mat2.color || "").toLowerCase().includes(cA) && mat2.level == lA);
                if (matchNormal || matchReverse) canDNA = true;
            }

            // 模式 B: 指定名字
            const nameMatch = effectText.match(/\[dna digivolve\]\s*\[(.*?)\]\s*\+\s*\[(.*?)\]/i);
            if (!canDNA && nameMatch) {
                const [, nA, nB] = nameMatch;
                const m1n = mat1.name.toLowerCase();
                const m2n = mat2.name.toLowerCase();
                const matchNormal = m1n.includes(nA.toLowerCase()) && m2n.includes(nB.toLowerCase());
                const matchReverse = m1n.includes(nB.toLowerCase()) && m2n.includes(nA.toLowerCase());
                if (matchNormal || matchReverse) canDNA = true;
            }

            // 🔥 新增：从卡面解析抽牌数量（支持 draw 1 / draw 3 等）
            const drawMatch = effectText.match(/draw\s*(\d+)/i);
            if (drawMatch) drawAmount = parseInt(drawMatch[1]);
        }

        // 基础颜色/Lv fallback（如果你有不写 [DNA] 的卡）
        if (!canDNA) {
            const dnaColors = String(handCard.color || "").toLowerCase().split(/[\/\s,]+/);
            const reqLv = handCard.level - 1;
            if (mat1.level === reqLv && mat2.level === reqLv) {
                if (dnaColors.length >= 2) {
                    canDNA = (String(mat1.color || "").toLowerCase().includes(dnaColors[0]) && 
                              String(mat2.color || "").toLowerCase().includes(dnaColors[1])) ||
                             (String(mat1.color || "").toLowerCase().includes(dnaColors[1]) && 
                              String(mat2.color || "").toLowerCase().includes(dnaColors[0]));
                }
            }
        }

        if (canDNA) {
            console.log(`🌀 [DNA EVOLVE] ${mat1.name} + ${mat2.name} → ${handCard.name} （抽 ${drawAmount} 张）`);

            const handIdx = cur.hand.findIndex(c => c.instanceId === handCard.instanceId);
            if (handIdx !== -1) cur.hand.splice(handIdx, 1);

            const m1Data = { ...mat1 }; delete m1Data.stack;
            const m2Data = { ...mat2 }; delete m2Data.stack;
            const newStack = [...(mat1.stack || []), m1Data, ...(mat2.stack || []), m2Data];

            cur.battleArea = cur.battleArea.filter(c => c.instanceId !== targetId1 && c.instanceId !== targetId2);

            const newInstance = { 
                ...handCard, 
                instanceId: `dna-${Date.now()}`, 
                stack: newStack, 
                isSuspended: false,
                playedThisTurn: false 
            };
            cur.battleArea.push(newInstance);

            this.drawCard(playerId, drawAmount);           // ← 动态抽牌
            this.triggerEffect(playerId, newInstance, "When Digivolving");
            this.checkGlobalRules();
            this.checkTurnEnd();
        } else {
            console.warn(`🚫 [DNA FAIL] 不满足合体条件`);
        }
    }

    appFusion(playerId, handCard, targetId) {
        const cur = this.zones[playerId];
        const target = cur.battleArea.find(c => c.instanceId === targetId);
        if (!target || !handCard) return;

        // App Fusion 直接把目标卡当作素材堆叠
        const newStack = [...(target.stack || []), { ...target }];
        cur.battleArea = cur.battleArea.filter(c => c.instanceId !== targetId);

        const newInstance = {
            ...handCard,
            instanceId: `app-${Date.now()}`,
            stack: newStack,
            isSuspended: false,
            playedThisTurn: true
        };
        cur.battleArea.push(newInstance);

        this.triggerEffect(playerId, newInstance, "On Play");
        this.checkGlobalRules();
        this.checkTurnEnd();
    }

    // ==========================================
    // 🔥 DigiXros + Assembly（手册 p.22-25）
    // ==========================================
    digiXros(playerId, handCard, targetIds = []) {
        const cur = this.zones[playerId];
        if (!handCard || targetIds.length === 0) return;

        let canXros = false;
        let reduction = 0;   // 减费

        const effectText = (handCard.mainEffect || "").toLowerCase();

        // 模式1：指定素材减费
        const xrosMatch = effectText.match(/\[digixros\].*?reduce.*?(\d+)/i);
        if (xrosMatch) reduction = parseInt(xrosMatch[1]);

        // 模式2：具体素材要求（支持多个）
        const requiredNames = effectText.match(/\[digixros\]\s*\[(.*?)\]/gi);
        if (requiredNames) {
            const needed = requiredNames.map(m => m.match(/\[(.*?)\]/)[1].toLowerCase());
            const provided = targetIds.map(id => {
                const card = cur.battleArea.find(c => c.instanceId === id);
                return card ? card.name.toLowerCase() : '';
            });
            canXros = needed.every(name => provided.some(p => p.includes(name)));
        } else {
            // 基础颜色/Lv 要求（fallback）
            canXros = true;
        }

        if (canXros) {
            console.log(`🔥 [DIGIXROS] ${handCard.name} 成功合体！减费 ${reduction}`);

            // 从手牌移除
            const handIdx = cur.hand.findIndex(c => c.instanceId === handCard.instanceId);
            if (handIdx !== -1) cur.hand.splice(handIdx, 1);

            // 扣减后的费用
            const finalCost = Math.max(0, (handCard.playCost || 0) - reduction);
            this.updateMemory(playerId === 'p1' ? -finalCost : finalCost);

            // 创建新实例 + 合并素材 stack
            const newStack = [];
            targetIds.forEach(id => {
                const mat = cur.battleArea.find(c => c.instanceId === id);
                if (mat) {
                    newStack.push(...(mat.stack || []), { ...mat });
                    cur.battleArea = cur.battleArea.filter(c => c.instanceId !== id);
                }
            });

            const newInstance = {
                ...handCard,
                instanceId: `xros-${Date.now()}`,
                stack: newStack,
                isSuspended: false,
                playedThisTurn: true
            };
            cur.battleArea.push(newInstance);

            this.triggerEffect(playerId, newInstance, "On Play");
            this.checkGlobalRules();
            this.checkTurnEnd();
        } else {
            console.warn(`🚫 [DIGIXROS] 素材不满足要求`);
        }
    }

    // Assembly（从手牌/场上指定素材堆叠到目标卡底部）
    assembly(playerId, sourceInstanceId, targetInstanceId) {
        const cur = this.zones[playerId];
        const source = [...cur.hand, ...cur.battleArea].find(c => c.instanceId === sourceInstanceId);
        const target = cur.battleArea.find(c => c.instanceId === targetInstanceId);

        if (!source || !target) return;

        // 如果 source 有 stack，先把它的底牌送墓
        if (source.stack && source.stack.length > 0) {
            source.stack.forEach(s => this.sendToTrash(playerId, s));
        }

        // 从原位置移除 source
        if (cur.hand.some(c => c.instanceId === sourceInstanceId)) {
            cur.hand = cur.hand.filter(c => c.instanceId !== sourceInstanceId);
        } else {
            cur.battleArea = cur.battleArea.filter(c => c.instanceId !== sourceInstanceId);
        }

        // 塞入 target 最底层
        if (!target.stack) target.stack = [];
        target.stack.unshift({ ...source, stack: undefined, isSuspended: false });

        console.log(`🧩 [ASSEMBLY] ${source.name} 已堆叠到 ${target.name} 底部`);
        this.checkGlobalRules();
        this.checkTurnEnd();
    }

    // ==========================================
    // 🧬 跨物种挂载枢纽 (Save / Mind Link)
    // ==========================================
    attachToStack(playerId, sourceInstanceId, targetInstanceId) {
        const cur = this.zones[playerId];
        let sourceCard, sourceZoneIndex, sourceZoneType;

        // 1. 雷达扫描源卡牌 (支持从战场或手牌直接塞入)
        sourceZoneIndex = cur.battleArea.findIndex(c => c.instanceId === sourceInstanceId);
        if (sourceZoneIndex !== -1) {
            sourceCard = cur.battleArea[sourceZoneIndex];
            sourceZoneType = 'battleArea';
        } else {
            sourceZoneIndex = cur.hand.findIndex(c => c.instanceId === sourceInstanceId);
            if (sourceZoneIndex !== -1) {
                sourceCard = cur.hand[sourceZoneIndex];
                sourceZoneType = 'hand';
            }
        }

        if (!sourceCard) return;

        // 2. 锁定被塞入的目标载体 (只能是战斗区)
        const targetCard = cur.battleArea.find(c => c.instanceId === targetInstanceId);
        if (!targetCard) return;

        // 3. 物理剥离源卡牌 (如果源卡牌自带一堆底牌，底牌全部掉落进废弃区)
        if (sourceCard.stack && sourceCard.stack.length > 0) {
            cur.trash.push(...sourceCard.stack);
            console.log(`🗑️ 剥离脱落：${sourceCard.name} 挂载时，其原有的进化源全部掉入废弃区！`);
        }

        // 4. 从原区域切除源卡牌
        if (sourceZoneType === 'battleArea') {
            cur.battleArea.splice(sourceZoneIndex, 1);
        } else if (sourceZoneType === 'hand') {
            cur.hand.splice(sourceZoneIndex, 1);
        }

        // 5. 格式化并强行塞入目标卡的最底层 (unshift)
        const cardToAttach = { ...sourceCard, isSuspended: false };
        delete cardToAttach.stack; 

        if (!targetCard.stack) targetCard.stack = [];
        targetCard.stack.unshift(cardToAttach);

        console.log(`🧬 [CROSS-MOUNT] 跨物种挂载成功！[${sourceCard.name}] 已被塞入 [${targetCard.name}] 的底层！`);
        
        this.checkGlobalRules();
        this.checkTurnEnd();
    }

    resolveEffect() {
        if (this.gameOver) return;
        
        while (this.effectQueue.length > 0) {
            // 🔥 四锁合一：瞄准、盲盒、招魂、免死。任何一个在等待，引擎必须静止！
            if (this.pendingTarget || this.pendingReveal || this.pendingTrashRevive || this.pendingProtection) {
                return; 
            }
            
            const eff = this.effectQueue.shift();
            let text = eff.effectText; 

            // 🛡️ 魔法防火墙 1：己方场上存在特定卡牌 (如 If you have a Tamer)
            const selfCondMatch = text.match(/if\s*you\s*have\s*(?:a|an)\s*(tamer|digimon)/i);
            if (selfCondMatch) {
                const reqType = selfCondMatch[1].toLowerCase();
                // 扫描己方战斗区，看看有没有这个类型的卡
                const hasRequired = this.zones[eff.playerId].battleArea.some(c => 
                    (c.type || c.cardType || "").toLowerCase().includes(reqType)
                );
                
                if (!hasRequired) {
                    console.log(`🚫 [CONDITION] 魔法反制：玩家 ${eff.playerId} 场上没有 ${reqType}，效果落空！`);
                    continue; // 拦截成功！直接切断当前循环，这效果废了
                }
                
                // 验证通过，把前面的 If 废话切掉，留下干货给后面的解析器
                console.log(`✨ [CONDITION] 条件达成！场上存在 ${reqType}，准备执行后续魔法...`);
                text = text.replace(/if\s*you\s*have\s*(?:a|an)\s*(?:tamer|digimon)(?:\s*in\s*play)?\s*,?\s*/i, '');
            }

            // 🛡️ 魔法防火墙 2：对手场上怪兽数量达标 (如 If your opponent has 2 or more Digimon)
            const oppCondMatch = text.match(/if\s*your\s*opponent\s*has\s*([0-9]+)\s*or\s*more\s*digimon/i);
            if (oppCondMatch) {
                const reqCount = parseInt(oppCondMatch[1]);
                const oppId = (eff.playerId === 'p1') ? 'p2' : 'p1';
                const oppCount = this.zones[oppId].battleArea.length; // 统计对面人头
                
                if (oppCount < reqCount) {
                    console.log(`🚫 [CONDITION] 魔法反制：对手场上只有 ${oppCount} 只怪兽，不足 ${reqCount} 只，效果落空！`);
                    continue;
                }
                
                console.log(`✨ [CONDITION] 条件达成！对手人头数达标，准备执行惩罚...`);
                text = text.replace(/if\s*your\s*opponent\s*has\s*[0-9]+\s*or\s*more\s*digimon\s*,?\s*/i, '');
            }

            // ⚔️ 解析：动态安保攻击力加成 (Sec Attack Mod)
            // 兼容诸如: "1 of your Digimon gets <Security Attack +1> for the turn"
            const secModMatch = text.match(/(?:gets|get).*?security\s*attack\s*([+-]\s*[0-9]+).*?for\s*the\s*turn/i);
            
            if (secModMatch) {
                const amount = parseInt(secModMatch[1].replace(/\s/g, ''));
                console.log(`🎯 [TARGET] 引擎雷达锁定：施加安保判定修改！数值: ${amount}`);
                
                this.pendingTarget = {
                    actionType: 'SEC_MOD',
                    playerId: eff.playerId,
                    conditions: { modValue: amount } 
                };
                return; // 🛑 踩死刹车，等前端准星锁定目标
            }

            // ⚖️ 解析：回合初强制锁费 (Memory Setter)
            // 兼容格式: "if you have 2 or less memory, set your memory to 3"
            const memSetMatch = text.match(/if\s*you\s*have\s*([0-9]+)\s*(?:or\s*less)?\s*memory\s*,?\s*set\s*(?:your\s*memory|it)\s*to\s*([0-9]+)/i);
            
            if (memSetMatch) {
                const threshold = parseInt(memSetMatch[1]);
                const targetMem = parseInt(memSetMatch[2]);
                
                // 算一下当前的绝对内存视角。对 p1 来说，正数是自己的；对 p2 来说，负数才是自己的。
                const myCurrentMem = (eff.playerId === 'p1') ? this.memory : -this.memory;
                
                if (myCurrentMem <= threshold) {
                    console.log(`⚖️ [MEMORY SETTER] 玩家 ${eff.playerId} 触发锁费！当前内存 ${myCurrentMem}，强行拉升至 ${targetMem}！`);
                    // 直接改写物理墙，不走相对增减
                    this.memory = (eff.playerId === 'p1') ? targetMem : -targetMem;
                } else {
                    console.log(`⏩ [MEMORY SETTER] 内存充足 (${myCurrentMem} > ${threshold})，不触发锁费。`);
                }
            }
            
            // 🔮 解析：翻牌检索 (Reveal & Add)
            const revealMatch = text.match(/reveal\s*(?:the\s*)?top\s*([0-9]+)\s*cards?\s*of\s*your\s*deck/i);
            if (revealMatch) {
                const count = parseInt(revealMatch[1]);
                const pZone = this.zones[eff.playerId];
                const actualCount = Math.min(count, pZone.deck.length);
                
                if (actualCount > 0) {
                    console.log(`🔍 [REVEAL] 引擎挂起：从 ${eff.playerId} 的卡组顶抽出 ${actualCount} 张卡进行结算！`);
                    
                    // 🔥 核心修复：pop 是末尾，所以牌顶在数组末端！从末尾切出卡牌，并 reverse 翻转，让最顶上的卡排在数组第一位供 UI 渲染
                    const revealedCards = pZone.deck.splice(pZone.deck.length - actualCount, actualCount).reverse(); 
                    
                    this.pendingReveal = { playerId: eff.playerId, cards: revealedCards };
                    return; // 🛑 踩死刹车，等前端挑牌
                }
            }

            // 🦇 解析：从废弃区登场 (Play from Trash)
            // 兼容格式: "play 1 purple digimon card from your trash without paying its memory cost"
            const reviveMatch = text.match(/play\s*(?:1|an?)\s*(?:([a-z]+)\s*)?digimon\s*card\s*from\s*your\s*trash/i);
            
            if (reviveMatch) {
                const colorReq = reviveMatch[1] ? reviveMatch[1].toLowerCase() : null;
                const pZone = this.zones[eff.playerId];
                
                // 过滤出废弃区里符合颜色的“数码兽”
                const validCards = pZone.trash.filter(c => {
                    const isDigimon = String(c.type || c.cardType || "").toLowerCase().includes("digimon");
                    const matchColor = colorReq ? String(c.color || "").toLowerCase().includes(colorReq) : true;
                    return isDigimon && matchColor;
                });
                
                if (validCards.length > 0) {
                    console.log(`🦇 [REVIVE] 引擎挂起：开启玩家 ${eff.playerId} 的墓地，准备秽土转生！`);
                    this.pendingTrashRevive = { playerId: eff.playerId, cards: validCards };
                    return; // 🛑 踩死刹车，等前端选尸体
                } else {
                    console.log(`⏩ [REVIVE] 废弃区里没有符合条件的尸体，招魂失败。`);
                }
            }

            // 🧬 解析：退化 (De-Digivolve)
            const dedigiMatch = text.match(/de-digivolve\s*([0-9]+)/i);
            if (dedigiMatch) {
                const amount = parseInt(dedigiMatch[1]);
                console.log(`🎯 [TARGET] 引擎雷达锁定：退化目标！退化层数: ${amount}`);
                this.pendingTarget = { actionType: 'DEDIGIVOLVE', playerId: eff.playerId, conditions: { amount: amount } };
                return; 
            }

            // ⚡ 解析：抽牌
            const drawMatch = text.match(/draw\s*([0-9]+)/);
            if (drawMatch) {
                const drawAmount = parseInt(drawMatch[1]);
                console.log(`⚡ [EFFECT] ${eff.sourceName} 发动效果：抽 ${drawAmount} 张牌`);
                this.drawCard(eff.playerId, drawAmount);
            }

            const memMatch = text.match(/(?:memory\s*\+|gain\s*)([0-9]+)\s*memory/);
            if (memMatch) {
                const memAmount = parseInt(memMatch[1]);
                console.log(`⚡ [EFFECT] ${eff.sourceName} 发动效果：回复 ${memAmount} 内存`);
                // 🔥 修复：回复内存必须是给己方加费，把减号换成正号！
                const change = (eff.playerId === 'p1') ? memAmount : -memAmount;
                this.updateMemory(change);
            }

            // 🔥 新增：解析多重安保判定接力
            const secMatch = text.match(/sec_check\s*([0-9]+)/);
            if (secMatch) {
                const remaining = parseInt(secMatch[1]);
                const ad = this.counterTiming.pendingAttack;
                if (ad) {
                    const attacker = this.zones[ad.attackerId].battleArea.find(c => c.instanceId === ad.attackerInstanceId);
                    const defSide = this.zones[this.counterTiming.defenderId];
                    // 必须确认攻击者还活着，才会执行下一次翻牌
                    if (attacker && defSide.security.length > 0) {
                        console.log(`⚔️ [BATTLE] 攻击者存活，进行接力安保判定！剩余次数: ${remaining}`);
                        this.processSecurityChecks(ad.attackerId, attacker, defSide, remaining);
                    }
                }
            }

            // ❄️ 解析：攻击/阻挡限制 (Stun)
            // 兼容格式: "1 of your opponent's Digimon cannot attack or block"
            const stunMatch = text.match(/cannot\s*attack/i);
            
            if (stunMatch) {
                console.log(`🎯 [TARGET] 引擎雷达锁定：施加冰冻限制！`);
                this.pendingTarget = {
                    actionType: 'STUN',
                    playerId: eff.playerId,
                    conditions: {} 
                };
                return; // 🛑 踩死刹车，等待狙击
            }

            // 💥 解析：无差别击杀或带DP限制的狙击
            // 兼容格式: "delete 1 of your opponent's digimon" 或 "delete 1 opponent's digimon with 4000 dp or less"
            const deleteMatch = text.match(/delete\s*(?:[0-9]+|an|1)\s*(?:of\s*)?(?:your\s*)?opponent's\s*digimon(?:.*?with\s*([0-9]+)\s*dp\s*or\s*less)?/i);
            
            if (deleteMatch) {
                // 如果正则抓到了后面的 DP 数字，就存下来，否则当做无上限（Infinity）的无差别击杀
                const maxDp = deleteMatch[1] ? parseInt(deleteMatch[1]) : Infinity;
                console.log(`🎯 [TARGET] 引擎雷达锁定：消灭目标！限制条件: DP <= ${maxDp === Infinity ? '无限制' : maxDp}`);
                
                // 挂起引擎，等待前端玩家扣动扳机！
                this.pendingTarget = {
                    actionType: 'DELETE',
                    playerId: eff.playerId,
                    conditions: { maxDp: maxDp } // 把限制条件存进去，前端UI可以用来高亮合法的靶子
                };
                return; // 🛑 核心：立刻 return，绝对不要往下走，让流水线停在这里等信号！
            }

            // 🌪️ 解析：弹回手牌 (Bounce)
            // 兼容格式: "return 1 of your opponent's digimon to hand" 或 "return 1 opponent's digimon to its owner's hand"
            const bounceMatch = text.match(/return\s*(?:[0-9]+|an|1)\s*(?:of\s*)?(?:your\s*)?opponent's\s*digimon\s*to\s*(?:its\s*owner's\s*)?hand/i);
            
            if (bounceMatch) {
                console.log(`🎯 [TARGET] 引擎雷达锁定：回手目标！`);
                // 挂起引擎，等待前端玩家点选目标
                this.pendingTarget = {
                    actionType: 'BOUNCE',
                    playerId: eff.playerId,
                    conditions: {} // 回手一般无条件，或者后续扩展等级限制
                };
                return; // 🛑 再次踩下刹车！
            }

            // 🩸 解析：临时属性修改 (Buff/Debuff)
            const dpModMatch = text.match(/(?:gets|get)\s*([+-][0-9]+)\s*dp\s*for\s*the\s*turn/i);
            
            if (dpModMatch) {
                const amount = parseInt(dpModMatch[1]);
                console.log(`🎯 [TARGET] 引擎雷达锁定：施加状态！数值: ${amount} DP`);
                
                this.pendingTarget = {
                    actionType: 'DP_MOD',
                    playerId: eff.playerId,
                    conditions: { modValue: amount } 
                };
                return; // 🛑 踩下刹车，等前端准星锁定
            }

            const counterMatch = text.match(/shift_to_counter/);
            if (counterMatch) {
                if (this.counterTiming.isActive) {
                    console.log("➡️ [When Attacking] 效果结算完毕，正式开放反击阶段 (COUNTER)。");
                    this.counterTiming.step = 'COUNTER';
                }
            }

            const execMatch = text.match(/execute_attack/);
            if (execMatch) {
                console.log("⚔️ 防守阶段结束，正式交锋！");
                this.executePendingAttack();
            }

            const eoaMatch = text.match(/end_of_attack\s*(.+)/);
            if (eoaMatch) {
                const attackerId = eoaMatch[1];
                const ad = this.counterTiming.pendingAttack;
                if (ad) {
                    const attacker = this.zones[ad.attackerId].battleArea.find(c => c.instanceId === attackerId);
                    // 只有攻击者历经千难万险活到了最后，才配触发 [End of Attack]
                    if (attacker) {
                        this.triggerEffect(ad.attackerId, attacker, "End of Attack");
                    }
                    console.log("⏹️ 战斗连击与陷阱清算完毕，重置战斗引擎。");
                    this.resetBattleState();
                }
            }

            // ==========================================
            // 🔥 解析：将选项卡/驯兽师送入废弃区 或 动态留场
            // ==========================================
            const trashSecMatch = text.match(/trash_security/);
            if (trashSecMatch) {
                const secCard = this.counterTiming.currentSecurityCard;
                if (secCard) {
                    const defId = this.counterTiming.defenderId;
                    const defSide = this.zones[defId];
                    
                    const secText = (secCard.mainEffect || "").toLowerCase();
                    const shouldPlay = secText.includes('[security]') && (secText.includes('play this card') || secText.includes('不支付费用') || secText.includes('登场'));
                    const shouldAddHand = secText.includes('[security]') && (secText.includes('add this card') || secText.includes('加入手牌'));

                    if (shouldPlay) {
                        console.log(`🛡️ [SECURITY PLAY] ${secCard.name} 触发特权，直接登场！`);
                        defSide.battleArea.push({...secCard, instanceId: `sec-${Date.now()}`, isSuspended: false, playedThisTurn: true, stack: []});
                    } else if (shouldAddHand) {
                        console.log(`🛡️ [SECURITY TO HAND] ${secCard.name} 触发特权，加入手牌！`);
                        defSide.hand.push(secCard);
                    } else {
                        defSide.trash.push(secCard);
                    }
                    this.counterTiming.currentSecurityCard = null;
                }
            }

            // ==========================================
            // 🔥 解析：安保数码兽延后对撞 或 动态留场
            // ==========================================
            const resolveSecBatMatch = text.match(/resolve_security_battle/);
            if (resolveSecBatMatch) {
                const secCard = this.counterTiming.currentSecurityCard;
                const ad = this.counterTiming.pendingAttack;
                
                if (secCard && ad) {
                    const aId = ad.attackerId;
                    const defId = this.counterTiming.defenderId;
                    const defSide = this.zones[defId];
                    const attacker = this.zones[aId].battleArea.find(c => c.instanceId === ad.attackerInstanceId);

                    const secText = (secCard.mainEffect || "").toLowerCase();
                    const shouldPlay = secText.includes('[security]') && (secText.includes('play this card') || secText.includes('不支付费用') || secText.includes('登场'));
                    const shouldAddHand = secText.includes('[security]') && (secText.includes('add this card') || secText.includes('加入手牌'));

                    if (shouldPlay) {
                        console.log(`🛡️ [SECURITY PLAY] ${secCard.name} 越过对撞判定，直接登场！`);
                        defSide.battleArea.push({...secCard, instanceId: `sec-${Date.now()}`, isSuspended: false, playedThisTurn: true, stack: []});
                    } else if (shouldAddHand) {
                        console.log(`🛡️ [SECURITY TO HAND] ${secCard.name} 越过对撞判定，加入手牌！`);
                        defSide.hand.push(secCard);
                    } else {
                        // 没有任何特权，乖乖进入物理对撞逻辑
                        if (attacker) {
                            if (this.getDp(secCard) >= this.getDp(attacker) && !this.getKeywords(attacker).jamming) {
                                this.processOverflow(aId, attacker);
                                const deadAttacker = this.zones[aId].battleArea.splice(this.zones[aId].battleArea.indexOf(attacker), 1)[0];
                                this.triggerEffect(aId, deadAttacker, "On Deletion");
                                this.sendToTrash(aId, deadAttacker);
                            }
                        }
                        defSide.trash.push(secCard);
                    }
                    this.counterTiming.currentSecurityCard = null;
                }
            }

            this.checkGlobalRules();

            // 🔥 修复 1：解除爆裂进化死锁！
            // 如果是在等待反击效果结算，且队列已空，自动推动引擎进入 BLOCKER 阶段
            if (this.counterTiming.step === 'WAIT_COUNTER_EFFECT' && this.effectQueue.length === 0) {
                console.log("▶️ 爆裂进化效果结算完毕，进入阻挡阶段 (BLOCKER)。");
                this.counterTiming.step = 'BLOCKER';
                return; // 此时还在战斗中，直接返回，绝对不能执行下面的 checkTurnEnd
            }

            this.checkTurnEnd(); 
        }
    }

    // 🔥 新增：接收前端的目标 ID，扣动扳机，然后解除刹车
    submitTarget(playerId, targetInstanceId) {
        if (!this.pendingTarget || this.pendingTarget.playerId !== playerId) {
            console.warn("🚫 没有等待中的目标请求，或玩家不匹配！");
            return;
        }

        // 🔥 补全规则：允许“空放/落空 (Fizzle)”。如果前端判断无目标或玩家跳过，直接解除刹车放行！
        if (!targetInstanceId) {
            console.log(`⏩ 玩家 ${playerId} 取消了选择或无合法目标，效果落空！`);
            this.pendingTarget = null;
            this.resolveEffect();
            return;
        }

        const action = this.pendingTarget.actionType;
        const targetSide = this.zones[(playerId === 'p1') ? 'p2' : 'p1']; // 默认假设是对敌方操作
        const targetDigimon = targetSide.battleArea.find(c => c.instanceId === targetInstanceId);

        if (!targetDigimon) {
            console.warn("🚫 目标不存在，可能是个幽灵 ID！请重新选择。");
            return; 
        }

        // 🔥 新增：校验靶子的 DP 是否符合准星的限制
        if (this.pendingTarget.conditions && this.pendingTarget.conditions.maxDp) {
            const targetDp = this.getDp(targetDigimon);
            if (targetDp > this.pendingTarget.conditions.maxDp) {
                console.warn(`🚫 规则拦截：目标 DP (${targetDp}) 太厚了，打不穿！限制上限为: ${this.pendingTarget.conditions.maxDp}`);
                return; // 目标不合法，维持挂起状态，让玩家重选
            }
        }

        if (action === 'SEC_MOD') {
            const modValue = this.pendingTarget.conditions.modValue;
            console.log(`⚔️ [SEC MOD] 玩家 ${playerId} 给 ${targetDigimon.name} 挂上了 Security Attack ${modValue > 0 ? '+' : ''}${modValue} 的状态！`);
            
            // 给目标开辟状态槽并塞入安保加成
            if (!targetDigimon.turnEffects) targetDigimon.turnEffects = [];
            targetDigimon.turnEffects.push({ type: 'SEC_MOD', value: modValue });
        }

        // 根据不同的动作类型，执行物理打击
        if (action === 'DELETE') {
            console.log(`💥 [FIRE] 玩家 ${playerId} 试图狙击 ${targetDigimon.name}！`);
            const targetOwner = (playerId === 'p1') ? 'p2' : 'p1';
            // 🔥 改用拦截器，而不是直接杀掉
            this.applyDeletion(targetOwner, targetDigimon.instanceId);
        }

        if (action === 'STUN') {
            console.log(`❄️ [STUN] 玩家 ${playerId} 冻结了 ${targetDigimon.name}，本回合它被禁锢了！`);
            
            // 动态开辟状态槽位，并塞入冰冻状态
            if (!targetDigimon.turnEffects) targetDigimon.turnEffects = [];
            targetDigimon.turnEffects.push({ type: 'STUN' });
        }

        if (action === 'BOUNCE') {
            console.log(`🌪️ [BOUNCE] 玩家 ${playerId} 将 ${targetDigimon.name} 强制弹回手牌！`);
            const targetOwner = (playerId === 'p1') ? 'p2' : 'p1';
            
            // 1. 触发溢出（离开战场即触发，不论生死）
            this.processOverflow(targetOwner, targetDigimon);
            
            // 2. 从战场物理切除
            const bouncedTarget = targetSide.battleArea.splice(targetSide.battleArea.indexOf(targetDigimon), 1)[0];
            
            // 3. 骨肉分离：把底牌全倒进废弃区
            if (bouncedTarget.stack && bouncedTarget.stack.length > 0) {
                bouncedTarget.stack.forEach(sourceCard => {
                    delete sourceCard.stack; 
                    targetSide.trash.push(sourceCard);
                });
            }
            
            // 4. 顶牌洗掉状态，干干净净回到手牌
            delete bouncedTarget.stack;
            bouncedTarget.isSuspended = false;
            bouncedTarget.playedThisTurn = false;
            targetSide.hand.push(bouncedTarget);
            
            // ⚠️ 绝对不要触发 [On Deletion]！
        }

        if (action === 'DEDIGIVOLVE') {
            const amount = this.pendingTarget.conditions.amount || 1;
            console.log(`🧬 [DE-DIGIVOLVE] 玩家 ${playerId} 对 ${targetDigimon.name} 强制退化 ${amount} 层！`);

            for (let i = 0; i < amount; i++) {
                // 如果只剩最后一张（比如退回到了 Lv.3），直接中止扒皮
                if (!targetDigimon.stack || targetDigimon.stack.length === 0) {
                    console.log(`⚠️ ${targetDigimon.name} 已经没有底牌了，退化终止。`);
                    break;
                }

                const topCard = targetDigimon.stack.pop();
                
                // 把退化掉的那层外壳剥下来，扔进垃圾桶
                const trashedSkin = { ...targetDigimon };
                delete trashedSkin.stack;
                targetSide.trash.push(trashedSkin);

                // 把底下一层的数据覆写上来，但必须保留现在的横置状态和本回合登场状态！
                const currentSuspended = targetDigimon.isSuspended;
                const currentPlayed = targetDigimon.playedThisTurn;
                const currentInstanceId = targetDigimon.instanceId;
                
                Object.assign(targetDigimon, topCard);
                
                targetDigimon.isSuspended = currentSuspended;
                targetDigimon.playedThisTurn = currentPlayed;
                targetDigimon.instanceId = currentInstanceId;
                
                // ⚠️ 不触发 Overflow，不触发 On Deletion
            }
        }

        if (action === 'DP_MOD') {
            const modValue = this.pendingTarget.conditions.modValue;
            console.log(`🩸 [DEBUFF] 玩家 ${playerId} 给 ${targetDigimon.name} 挂上了 ${modValue} DP 的状态！`);
            
            // 动态开辟状态槽位，并塞入负面状态
            if (!targetDigimon.turnEffects) targetDigimon.turnEffects = [];
            targetDigimon.turnEffects.push({ type: 'DP_MOD', value: modValue });
        }

        // 🎯 击毁/回手完毕，清空火控锁，重新点燃引擎！
        this.pendingTarget = null;
        this.resolveEffect();
        this.checkGlobalRules();
    }

    // 🔮 新增：接收前端的检索选择，发牌，并把剩下的塞回卡组底
    // 🦇 新增：接收前端的转生选择，把卡拉回战场并触发 On Play
    submitTrashRevive(playerId, selectedCardInstanceId) {
        if (!this.pendingTrashRevive || this.pendingTrashRevive.playerId !== playerId) {
            console.warn("🚫 没有等待中的转生请求，或玩家不匹配！");
            return;
        }

        const pZone = this.zones[playerId];
        
        if (selectedCardInstanceId) {
            const trashIdx = pZone.trash.findIndex(c => c.instanceId === selectedCardInstanceId);
            if (trashIdx !== -1) {
                // 从废弃区物理切除
                const revivedCard = pZone.trash.splice(trashIdx, 1)[0];
                
                // 洗刷干净，满血复活
                revivedCard.playedThisTurn = true;
                revivedCard.isSuspended = false;
                delete revivedCard.turnEffects; // 顺手把上一辈子的毒清理掉
                delete revivedCard.stack;
                
                pZone.battleArea.push(revivedCard);
                console.log(`🦇 [REVIVE] 玩家 ${playerId} 成功将 ${revivedCard.name} 从地狱拉回了战场！`);
                
                // 🔥 核心：跨区登场必须触发它的入场遗言
                this.triggerEffect(playerId, revivedCard, "On Play");
            }
        } else {
            console.log(`⏩ [REVIVE] 玩家 ${playerId} 放弃了墓地转生。`);
        }
        
        // 🦇 清理招魂锁，重新点燃引擎！
        this.pendingTrashRevive = null;
        this.resolveEffect();
        this.checkGlobalRules();
    }

    // 🛡️ 接收前端的抗性选择，决定是“免死”还是“认命”
    submitProtectionChoice(playerId, choice) {
        if (!this.pendingProtection || this.pendingProtection.playerId !== playerId) {
            console.warn("🚫 没有等待中的抗性请求！");
            return;
        }

        const { instanceId } = this.pendingProtection;
        const side = this.zones[playerId];
        const card = side.battleArea.find(c => c.instanceId === instanceId);

        if (card) {
            if (choice === 'EVADE') {
                console.log(`🌀 [EVADE] ${card.name} 通过横置躲过了致命一击！`);
                card.isSuspended = true;
            } else if (choice === 'ARMOR_PURGE') {
                console.log(`🛡️ [ARMOR PURGE] ${card.name} 舍弃了顶层装甲，本体存活！`);
                // 弹出最顶层的皮
                const topCard = card.stack.pop();
                const skin = { ...card };
                delete skin.stack;
                this.sendToTrash(playerId, skin);
                
                // 继承底牌数据，但保留当前的 instanceId
                Object.assign(card, topCard);
            } else {
                // 玩家选择 NONE（放弃抵抗）
                this.executePhysicalDeletion(playerId, card);
            }
        }

        // 🎯 抗性结算完毕，清空锁，重启引擎
        this.pendingProtection = null;
        this.resolveEffect(); 
        this.checkGlobalRules();
    }

    hatchEgg(playerId) {
        if (this.turnPlayer !== playerId || this.phase !== 'HATCH' || this.hasActionedInHatch) return;
        const cur = this.zones[playerId];
        if (cur.breedingArea.length === 0 && cur.eggDeck.length > 0) {
            const egg = cur.eggDeck.pop();
            cur.breedingArea.push({ ...egg, instanceId: `egg_${Math.random()}`, stack: [], isSuspended: false });
            this.hasActionedInHatch = true;
            this.phase = 'MAIN';
            
            console.log("➡️ 孵化完毕，自动进入主要阶段 (MAIN PHASE)。");
            const currentPlayerArea = this.zones[this.turnPlayer].battleArea;
            currentPlayerArea.forEach(card => this.triggerEffect(this.turnPlayer, card, "Start of Main Phase"));
        }
    }

    moveBreedingToBattle(playerId) {
        if (this.turnPlayer !== playerId || this.phase !== 'HATCH' || this.hasActionedInHatch) return;
        const cur = this.zones[playerId];
        if (cur.breedingArea.length > 0) {
            const topCard = cur.breedingArea[0];
            if (this.getLv(topCard) < 3) return;
            this.zones[playerId].battleArea.push(cur.breedingArea.splice(0, 1)[0]);
            this.hasActionedInHatch = true;
            this.phase = 'MAIN';
            
            console.log("➡️ 移动完毕，自动进入主要阶段 (MAIN PHASE)。");
            const currentPlayerArea = this.zones[this.turnPlayer].battleArea;
            currentPlayerArea.forEach(card => this.triggerEffect(this.turnPlayer, card, "Start of Main Phase"));
        }
    }

    // ==========================================
// 🔥 最终严格版 playOrEvolve（已100%对比手册 v6.0）
// ==========================================
playOrEvolve(playerId, card, zone = 'battle', targetInstanceId = null, isFree = false) {
        if (!card) return;
        const cur = this.zones[playerId];
        const cardType = String(card.type || card.cardType || "").toLowerCase();

        let finalCost = isFree ? 0 : (parseInt(card.playCost || card.digivolveCost || 0) || 0);

        // ====================== 进化分支（严格检查） ======================
        if (targetInstanceId) {
            const targetArray = [...cur.battleArea, ...cur.breedingArea];
            const targetIdx = targetArray.findIndex(c => c.instanceId === targetInstanceId);
            if (targetIdx === -1) return;

            const target = targetArray[targetIdx];
            const targetLv = this.getLv(target);
            const cardLv = this.getLv(card);

            // 基础条件：必须 Lv+1
            if (cardLv !== targetLv + 1) {
                console.warn(`🚫 进化非法：等级不符 (${cardLv} ≠ ${targetLv}+1)`);
                return;
            }

            // 颜色交集检查（手册核心）
            const cardColors = String(card.color || card.colors || "").toLowerCase().split(/[\/,\s]+/).filter(Boolean);
            const targetColors = String(target.color || target.colors || "").toLowerCase().split(/[\/,\s]+/).filter(Boolean);
            const colorMatch = cardColors.some(c => targetColors.includes(c)) || targetColors.some(c => cardColors.includes(c));

            // 特殊进化解析（支持多种手册写法）
            let isSpecialEvo = false;
            const effectText = (card.mainEffect || "").toLowerCase();

            // 模式1：名字指定
            const nameMatch = effectText.match(/\[digivolve\]:?\s*(\d+)\s*from\s*\[(.*?)\]/i);
            if (nameMatch) {
                const requiredName = nameMatch[2].trim().toLowerCase();
                if (target.name.toLowerCase().includes(requiredName)) isSpecialEvo = true;
            }

            // 模式2：等级+颜色混合
            const lvColorMatch = effectText.match(/digivolve\s*(\d+)\s*from\s*(\w+)\s*lv\.?(\d+)/i);
            if (!isSpecialEvo && lvColorMatch) {
                const requiredColor = lvColorMatch[2].toLowerCase();
                const requiredLv = parseInt(lvColorMatch[3]);
                if (targetColors.includes(requiredColor) && targetLv === requiredLv) isSpecialEvo = true;
            }

            // 最终合法判定
            if (!colorMatch && !isSpecialEvo) {
                console.warn(`🚫 进化非法：颜色不符且无特殊进化许可`);
                return;
            }

            finalCost = isFree ? 0 : (isSpecialEvo ? parseInt(nameMatch ? nameMatch[1] : card.digivolveCost) : finalCost);

            // 执行进化（堆叠 + 抽卡）
            const handIdx = cur.hand.findIndex(c => c.instanceId === card.instanceId);
            if (handIdx === -1) return;
            const [movedCard] = cur.hand.splice(handIdx, 1);

            const oldStack = target.stack || [];
            target.stack = [...oldStack, { ...target }];
            Object.assign(target, { ...movedCard, instanceId: target.instanceId, stack: target.stack, isSuspended: target.isSuspended });

            this.updateMemory(playerId === 'p1' ? -finalCost : finalCost);
            this.drawCard(playerId, 1);
            this.triggerEffect(playerId, target, "When Digivolving");
            this.checkGlobalRules();
            this.checkTurnEnd();
            return;
        }

    // ====================== 3. 普通出牌（非进化） ======================
    const handIdx = cur.hand.findIndex(c => c.instanceId === card.instanceId);
    if (handIdx === -1) return;
    const [movedCard] = cur.hand.splice(handIdx, 1);

    this.updateMemory(playerId === 'p1' ? -finalCost : finalCost);

    if (cardType.includes('option')) {
        // Option 颜色要求（手册 Page 11）
        const optionColors = String(movedCard.color || movedCard.colors || movedCard.cardColor || "")
            .toLowerCase().split(/[\/\s,]+/).filter(Boolean);

        const allMyCards = [...cur.battleArea, ...cur.breedingArea];
        const hasAllRequiredColors = optionColors.every(optColor => {
            if (!optColor) return true;
            return allMyCards.some(c => {
                const cColor = String(c.color || c.colors || c.cardColor || "").toLowerCase();
                return cColor.includes(optColor);
            });
        });

        if (!hasAllRequiredColors && optionColors.length > 0) {
            console.warn(`🚫 Option 颜色要求不满足`);
            cur.hand.push(movedCard);
            this.updateMemory(playerId === 'p1' ? finalCost : -finalCost);
            return;
        }

        cur.trash.push(movedCard);
        this.triggerEffect(playerId, movedCard, "Main");
    } else {
        // 普通 Digimon / Tamer
        cur.battleArea.push({
            ...movedCard,
            stack: [],
            isSuspended: false,
            playedThisTurn: true
        });
        this.triggerEffect(playerId, movedCard, "On Play");
    }

    this.checkGlobalRules();
    this.checkTurnEnd();
}

    getLv(card) { 
        if (!card) return 0; 
        const raw = card.lv || card.level || (card.cardnumber?.includes('Lv') ? card.cardnumber : "0"); 
        return parseInt(raw.toString().replace(/[^0-9]/g, '')) || 0; 
    }

    getDp(cardInstance) {
        if (!cardInstance || !cardInstance.dp) return 0;
        let totalDp = parseInt(cardInstance.dp.toString().replace(/[^0-9]/g, '')) || 0;
        if (cardInstance.stack) cardInstance.stack.forEach(s => {
            const dpMatch = (s.inheritedEffect || "").match(/\+([0-9]+)\s*dp/i);
            if (dpMatch) totalDp += parseInt(dpMatch[1]);
        });
        
        // 🔥 新增：结算所有挂载的临时 Buff/Debuff
        if (cardInstance.turnEffects) {
            cardInstance.turnEffects.forEach(eff => {
                if (eff.type === 'DP_MOD') totalDp += eff.value;
            });
        }
        
        return totalDp;
    }

    // 🔥 新增：绝对安全的内存增减方法，强制锁定在 -10 到 10 之间
    updateMemory(amount) {
        this.memory += amount;
        if (this.memory > 10) this.memory = 10;
        if (this.memory < -10) this.memory = -10;
    }

    getKeywords(card) {
        // 先读取顶层卡的基础文本
        let text = ((card.mainEffect || "") + (card.cardText || "")).toLowerCase();
        
        // 向下挖掘，把所有进化源里的 [继承效果] 拼接到一起
        if (card.stack && card.stack.length > 0) {
            card.stack.forEach(sCard => {
                text += " " + (sCard.inheritedEffect || sCard.sourceEffect || "").toLowerCase();
            });
        }
        
        let secPlusAmount = 0;
        const secMatches = [...text.matchAll(/security attack\s*([+-]\s*[0-9]+)/g)];
        secMatches.forEach(match => {
            secPlusAmount += parseInt(match[1].replace(/\s+/g, ''));
        });

        // 🔥 第一步：先把静态文字解析出来的全部属性打包成一个对象
        const keywords = { 
            secPlus: secPlusAmount, 
            blocker: text.includes("blocker"), 
            rush: text.includes("rush"), 
            piercing: text.includes("piercing"), 
            jamming: text.includes("jamming"),
            retaliation: text.includes("retaliation"),
            attackActive: text.includes("can attack unsuspended") || text.includes("attacks unsuspended"),
            evade: text.includes("evade"),
            armorPurge: text.includes("armor purge"),
            reboot: text.includes("reboot") || text.includes("再起") // 🔥 新增再起词条识别
        };

        // 🔥 第二步：叠加临时状态（Buff/Debuff）
        if (card.turnEffects) {
            card.turnEffects.forEach(eff => {
                if (eff.type === 'SEC_MOD') {
                    // 我们字典里叫 secPlus，所以直接加给它
                    keywords.secPlus += eff.value;
                }
            });
        }
        
        // 🔥 第三步：统一输出完整且包含 Buff 的最终面板
        return keywords;
    }

    // ==========================================
    // 🔥 完整修复版 triggerEffect（已解决所有报错 + 100%对齐手册）
    // ==========================================
    triggerEffect(playerId, card, timing) {
        if (!card) return;

        const effectsToTrigger = [];

        // 1. 主效果
        if (card.mainEffect) {
            effectsToTrigger.push({
                source: card,
                text: card.mainEffect,
                inherited: false
            });
        }

        // 2. 所有继承效果（Inherited）
        if (card.stack && card.stack.length > 0) {
            card.stack.forEach(sourceCard => {
                const inheritedText = sourceCard.inheritedEffect || sourceCard.sourceEffect;
                if (inheritedText) {
                    effectsToTrigger.push({
                        source: sourceCard,
                        text: inheritedText,
                        inherited: true
                    });
                }
            });
        }

        // 3. 时点匹配 + 触发
        effectsToTrigger.forEach(effect => {
            const text = effect.text.toLowerCase();
            let shouldTrigger = false;

            if (timing === "On Play" && text.includes("on play")) shouldTrigger = true;
            if (timing === "When Digivolving" && text.includes("when digivolving")) shouldTrigger = true;
            if (timing === "When Attacking" && text.includes("when attacking")) shouldTrigger = true;
            if (timing === "When Blocking" && text.includes("when blocking")) shouldTrigger = true;
            if (timing === "On Deletion" && text.includes("on deletion")) shouldTrigger = true;
            if (timing === "Security" && text.includes("security")) shouldTrigger = true;
            if (timing === "End of Turn" && text.includes("end of turn")) shouldTrigger = true;
            if (timing === "Start of Turn" && text.includes("start of turn")) shouldTrigger = true;

            if (!shouldTrigger) return;

            // 4. Once per Turn 防护
            if (this.isEffectUsedThisTurn(card, timing)) {
                console.log(`⏳ [ONCE] ${card.name} 的 ${timing} 效果本回合已使用，跳过`);
                return;
            }
            this.markEffectUsed(card, timing);

            // 5. 加入队列（让玩家选择顺序或跳过）
            this.effectQueue.push({
                id: `eff_${Math.random().toString(36).substr(2, 8)}`,
                playerId: playerId,
                sourceName: card.name,
                effectText: effect.text,
                type: timing,
                inherited: effect.inherited,
                sourceCard: effect.source,
                priority: 50
            });
        });

        // 6. 处理队列
        this.processEffectQueue();
    }

    // ====================== 配套辅助方法（已修复） ======================
    markEffectUsed(card, key) {
        if (!card.turnEffects) card.turnEffects = [];
        card.turnEffects.push({ type: 'ONCE_USED', key: key, turn: this.turnCount });
    }

    isEffectUsedThisTurn(card, key) {
        return card.turnEffects && card.turnEffects.some(e => 
            e.type === 'ONCE_USED' && e.key === key && e.turn === this.turnCount
        );
    }

    // ====================== 简单版 applyEffect（解决报错） ======================
    // 你可以后面再慢慢扩展这个函数，目前先让它不报错
    applyEffect(effect) {
        console.log(`>> 执行效果: ${effect.sourceName} - ${effect.effectText}`);
        // TODO: 后续在这里解析具体效果（抽卡、DP修改、记忆扣除等）
        // 目前先打印，防止报错
    }

    // ==========================================
    // 🔥 Link 系统（手册 p.26-27）
    // ==========================================
    calculateLinkDP(card) {
        if (!card) return 0;
        let base = this.getDp(card);
        if (card.stack && card.stack.length > 0) {
            card.stack.forEach(s => {
                if (s.inheritedEffect && s.inheritedEffect.toLowerCase().includes('link')) {
                    const match = s.inheritedEffect.match(/\+(\d+)\s*dp/i);
                    if (match) base += parseInt(match[1]);
                }
            });
        }
        return base;
    }

    getLinkLimit(card) {
        const text = ((card.mainEffect || "") + (card.cardText || "")).toLowerCase();
        const match = text.match(/link limit\s*(\d+)/i);
        return match ? parseInt(match[1]) : 0;   // 0 = 无限制
    }

    // 在 playOrEvolve 或 digiXros 成功后调用
    applyLink(playerId, cardInstance) {
        if (!cardInstance) return;
        const limit = this.getLinkLimit(cardInstance);
        if (limit > 0 && (cardInstance.stack || []).length >= limit) {
            console.log(`🔗 [LINK LIMIT] 已达上限，无法继续堆叠`);
            return false;
        }
        return true;
    }

    // 🔥 新增：once per turn 防护（放在类里任意位置即可）
    markEffectUsed(card, effectKey) {
        if (!card.turnEffects) card.turnEffects = [];
        card.turnEffects.push({ type: 'ONCE_USED', key: effectKey });
    }

    isEffectUsedThisTurn(card, effectKey) {
        return card.turnEffects && card.turnEffects.some(e => e.type === 'ONCE_USED' && e.key === effectKey);
    }

    resolveBattle(aId, attacker, dId, tId) {
        const dSide = this.zones[dId], aSide = this.zones[aId], tIdx = dSide.battleArea.findIndex(c => c.instanceId === tId);
        if (tIdx === -1) return { attackerSurvived: true, targetDeleted: false };
        
        const target = dSide.battleArea[tIdx];
        const aDp = this.getDp(attacker);
        const tDp = this.getDp(target);

        let attackerDeleted = false;
        let targetDeleted = false;

        // 基础 DP 比拼
        if (aDp >= tDp) targetDeleted = true;
        if (aDp <= tDp) attackerDeleted = true;

        // 检查复仇 (Retaliation)
        const aKeywords = this.getKeywords(attacker);
        const tKeywords = this.getKeywords(target);
        if (targetDeleted && tKeywords.retaliation) attackerDeleted = true;
        if (attackerDeleted && aKeywords.retaliation) targetDeleted = true;

        // 执行送墓与触发拦截
        if (targetDeleted) {
            console.log(`⚔️ [BATTLE] 目标 ${target.name} 在交锋中战败！`);
            // 🔥 核心替换：接入死亡拦截中枢，代替原本野蛮的 splice
            this.applyDeletion(dId, target.instanceId);
        }
        if (attackerDeleted) {
            console.log(`⚔️ [BATTLE] 攻击者 ${attacker.name} 在交锋中战败！`);
            // 🔥 核心替换：攻击者如果被反伤打死，也能触发抗性
            this.applyDeletion(aId, attacker.instanceId);
        }

        return {
            attackerSurvived: !attackerDeleted,
            targetDeleted: targetDeleted
        };
    }

    processSecurityChecks(aId, attacker, defenderSide, count) {
        if (count <= 0 || defenderSide.security.length === 0) return;
        const defId = (defenderSide === this.zones['p1']) ? 'p1' : 'p2'; 
        const secCard = defenderSide.security.pop();
        const cardType = String(secCard.type || secCard.cardType || "").toLowerCase();
        
        console.log(`🛡️ 翻开安保卡：${secCard.name}`);

        // 🔥 核心重构：将安保卡悬挂在缓冲区，防止它在效果结算前被销毁
        this.counterTiming.currentSecurityCard = secCard;

        // 无论是选项、驯兽师还是数码兽，先触发效果入列
        this.triggerEffect(defId, secCard, "Security");

        if (cardType.includes('option') || cardType.includes('tamer')) {
            this.effectQueue.push({
                id: `sys_trash_${Math.random().toString(36).substr(2, 5)}`,
                playerId: defId, sourceName: "系统 (System)", effectText: `trash_security`, type: "System", priority: 90
            });
        } else {
            // 🔥 数码兽对撞，作为物理后置指令入列，等效果跑完再打
            this.effectQueue.push({
                id: `sys_secbat_${Math.random().toString(36).substr(2, 5)}`,
                playerId: defId, sourceName: "系统 (System)", effectText: `resolve_security_battle`, type: "System", priority: 90
            });
        }

        // 如果还有多段连击，排在当次判定之后
        if (count > 1) {
            this.effectQueue.push({
                id: `sys_sec_${Math.random().toString(36).substr(2, 5)}`,
                playerId: aId, sourceName: "系统 (System)", effectText: `sec_check ${count - 1}`, type: "System", priority: 95
            });
        }

        this.effectQueue.sort((a, b) => a.priority - b.priority);
    }

    // ==========================================
    // 🔥 Overflow 完整版（手册 Page 19 严格实现）
    // ==========================================
    processOverflow(playerId, card) {
        if (!card) return;

        let total = 0;

        const scan = (c) => {
            if (c.overflow) {
                const val = parseInt(c.overflow) || 0;
                total += Math.abs(val);
            }
            if (c.stack && c.stack.length > 0) {
               c.stack.forEach(scan);
            }
        };

        scan(card);

        if (total > 0) {
            const change = (playerId === 'p1') ? -total : total;
            this.updateMemory(change);
            console.log(`💥 [OVERFLOW] ${card.name} 触发 ${total} 记忆扣除！`);
        }
    }

    // 🛡️ 死亡拦截中枢：所有“消灭”动作必须先过这一关
    applyDeletion(playerId, instanceId) {
        const side = this.zones[playerId];
        const card = side.battleArea.find(c => c.instanceId === instanceId);
        if (!card) return;

        const kw = this.getKeywords(card);
        // 回避：未横置且有词条
        const canEvade = kw.evade && !card.isSuspended; 
        // 装甲解除：有词条且肚子里的进化源不为空
        const canPurge = kw.armorPurge && card.stack && card.stack.length > 0; 

        if (canEvade || canPurge) {
            console.log(`🛡️ [PROTECTION] 拦截到 ${card.name} 的死亡信号，等待玩家选择抗性...`);
            this.pendingProtection = {
                playerId,
                instanceId,
                options: { evade: canEvade, armorPurge: canPurge }
            };
            return; // 🛑 成功拦截，引擎挂起，不执行后面的 executePhysicalDeletion
        }

        // 如果没有任何抗性，直接送进碎纸机
        this.executePhysicalDeletion(playerId, card);
    }

    // 💀 物理执行死亡：以前散落在各处的销毁逻辑，现在统一归口到这里
    executePhysicalDeletion(playerId, card) {
        const side = this.zones[playerId];
        const idx = side.battleArea.indexOf(card);
        if (idx === -1) return;

        const deadCard = side.battleArea.splice(idx, 1)[0];

        // 🔥 Overflow 必须在删除前触发（手册：离开场上立即扣记忆）
        this.processOverflow(playerId, deadCard);

        this.triggerEffect(playerId, deadCard, "On Deletion");
        this.sendToTrash(playerId, deadCard);
        console.log(`💀 ${deadCard.name} 已被彻底消灭。`);
    }

    passTurn() {
        if (this.gameOver) return;
        const cp = this.turnPlayer;

        // 1. 处理 Burst 退化（回合结束时）
        this.handleBurstRegression(cp);

        // 2. 设置下一回合的 Memory（官方规则）
        if (this.memory === 0) this.memory = (cp === 'p1') ? -3 : 3;
        else if (cp === 'p1' && this.memory >= 0) this.memory = -3;
        else if (cp === 'p2' && this.memory <= 0) this.memory = 3;

        // 切换玩家
        this.turnPlayer = (cp === 'p1') ? 'p2' : 'p1';
        this.hasActionedInHatch = false;
        this.eotTriggered = false;
        this.phase = 'HATCH';
        this.turnCount++;

        // 🔥【最重要】官方时点顺序：
        console.log(`🌅 ${this.turnPlayer} 回合开始！`);

        // A. 先触发 Start of Your Turn（双方都要触发）
        const currentArea = this.zones[this.turnPlayer].battleArea;
        currentArea.forEach(card => this.triggerEffect(this.turnPlayer, card, "Start of Turn"));

        // B. Unsuspend Phase（自己全部重置 + 对手的 Reboot）
        this.zones[this.turnPlayer].battleArea.forEach(c => {
            c.isSuspended = false;
            c.playedThisTurn = false;
        });
        const oppId = this.turnPlayer === 'p1' ? 'p2' : 'p1';
        this.zones[oppId].battleArea.forEach(c => {
            if (this.getKeywords(c).reboot) {
                c.isSuspended = false;
                console.log(`🔄 [REBOOT] ${c.name} 自动起立`);
            }
        });

        // C. 清空临时 Buff
        this.zones['p1'].battleArea.forEach(c => c.turnEffects = []);
        this.zones['p2'].battleArea.forEach(c => c.turnEffects = []);

        // D. Draw Phase（先攻第1回合不抽）
        if (this.turnCount > 1) {
            this.drawCard(this.turnPlayer, 1);
        }
    }
    
    handleBurstRegression(playerId) {
        const area = this.zones[playerId].battleArea;
        for (let i = area.length - 1; i >= 0; i--) {
            const card = area[i];
            if (card.isBurst) {
                console.log(`💥 [BURST] ${card.name} 触发退化`);

                this.processOverflow(playerId, card);   // 顶牌离开场上触发 Overflow

                if (card.stack && card.stack.length > 0) {
                    const top = card.stack.pop();
                    const skin = { ...card };
                    delete skin.stack;
                    this.sendToTrash(playerId, skin);   // 顶牌送墓

                    // 底层继承上来
                    area[i] = { ...top, instanceId: card.instanceId, stack: card.stack };
                } else {
                    this.sendToTrash(playerId, area.splice(i, 1)[0]);
                }
            }
        }
    }

    drawCard(playerId, amount = 1) {
        const cur = this.zones[playerId];
        for (let i = 0; i < amount; i++) {
            if (cur.deck.length === 0) { this.gameOver = true; this.winner = (playerId === 'p1') ? 'p2' : 'p1'; return; }
            cur.hand.push(cur.deck.pop());
        }
    }
}

// 🔥 让 Node.js 能够引入这台核动力引擎
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GameState;
}