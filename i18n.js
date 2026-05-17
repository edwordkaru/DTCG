(function () {
    const STORAGE_KEY = 'dtcg_language';
    const SUPPORTED = ['en', 'zh'];

    const fallback = {
        en: {
            LANGUAGE_LABEL: 'Language',
            CONNECT_DISCORD: 'CONNECT DISCORD',
            DECK_READY: 'DECK READY',
            NO_DECK_LOADED: 'NO DECK LOADED',
            DECK_STATUS_OK: 'READY: Main {main}/50 / Digi-Egg {eggs}/5',
            DECK_STATUS_BAD: 'INVALID: Main {main}/50 / Digi-Egg {eggs}/5',
            MY_DECKS: '[ MY DECKS ]',
            DECK_BUILDER: '[ DECK BUILDER ]',
            CREATE_ROOM: '[ CREATE ROOM ]',
            JOIN_MATCH: '[ JOIN MATCH ]',
            ENTER_SECURE_ROOM_ID: 'ENTER SECURE ROOM ID',
            ACTIVE_NODES: '>> ACTIVE NODES (JOINABLE ROOMS)',
            NO_ACTIVE_ROOMS: 'NO ACTIVE ROOMS',
            NO_ACTIVE_ROOMS_HINT: 'NO ACTIVE ROOMS<br>Create one to start.',
            LEAVE_CLOSE_ROOM: '[ LEAVE / CLOSE ROOM ]',
            READY_TO_BATTLE: '[ READY TO BATTLE ]',
            CANCEL_READY: '[ CANCEL READY ]',
            OFFICIAL_FIRST_PLAYER_CHECK: 'OFFICIAL FIRST PLAYER CHECK',
            RPS_INSTRUCTION: 'Rock-paper-scissors decides the first player. The winner automatically goes first.',
            RPS_ROCK: 'ROCK',
            RPS_PAPER: 'PAPER',
            RPS_SCISSORS: 'SCISSORS',
            RPS_WAITING: 'Waiting for both players...',
            TACTICAL_MULLIGAN: 'TACTICAL MULLIGAN',
            MULLIGAN_HELP: 'Bad opening hand? Shuffle it back and draw 5 new cards. Once per game.',
            KEEP_DECK: '[ KEEP DECK ]',
            MULLIGAN: '[ MULLIGAN ]',
            AWAITING_OPPONENT_DECISION: '>> AWAITING OPPONENT DECISION...',
            PENDING_ABILITIES: '>> PENDING ABILITIES',
            EFFECT_CHOICE_HELP: '* Official timing: choose the order to resolve your effects, or skip optional effects.',
            EFFECT_QUEUE: 'Pending Effect Queue',
            WAITING_BANNER: 'Battle resolution in progress, waiting for opponent response',
            WAITING: 'WAITING',
            MATCH_HISTORY: 'MATCH HISTORY / REPLAY LOG',
            EXPORT_JSON: 'EXPORT JSON',
            CLOSE: 'CLOSE',
            DECK_REPOSITORY: 'DECK REPOSITORY',
            FINISH_TURN: 'Finish Turn',
            SURRENDER: 'Surrender',
            CARD_PREVIEW: 'Card Preview',
            OPEN_CARD_INSPECTOR: 'OPEN CARD INSPECTOR',
            INSPECTOR_HINT: 'Right-click field/hand cards to inspect.',
            CHAT_PLACEHOLDER: 'Enter message...',
            SEND: 'SEND',
            CARD_INSPECTOR: 'CARD INSPECTOR',
            MAIN_RULE_TEXT: 'MAIN / RULE TEXT',
            INHERITED_SECURITY_TEXT: 'INHERITED / SECURITY TEXT',
            DIGIVOLUTION_SOURCES: 'DIGIVOLUTION SOURCES',
            BACK_TO_LOBBY: '[ BACK TO LOBBY ]',
            SEARCH_PLACEHOLDER: 'SEARCH NAME / ID / TRAIT / EFFECT...',
            TRAIT_PLACEHOLDER: 'TRAIT / KEYWORD e.g. D-Reaper, Blocker',
            COLOR_MATCH_ANY: 'COLOR MATCH: ANY',
            COLOR_MATCH_ALL: 'COLOR MATCH: ALL',
            COLOR_MATCH_EXACT: 'COLOR MATCH: EXACT',
            LV_ALL: 'LV: ALL',
            TYPE_ALL: 'TYPE: ALL',
            SORT_ID: 'SORT: ID',
            SORT_NAME: 'SORT: NAME',
            SORT_LEVEL: 'SORT: LEVEL',
            SORT_PLAY_COST: 'SORT: PLAY COST',
            SORT_DP: 'SORT: DP',
            RESET: 'RESET',
            MATCHES: '{count} MATCHES',
            SCANNING_DATABANK: 'SCANNING DATABANK...',
            END_OF_DATABANK: '>> END OF DATABANK <<',
            DECK_ARCHITECT: 'DECK ARCHITECT',
            MAIN_DECK: 'MAIN DECK:',
            DIGI_EGGS: 'DIGI-EGGS:',
            DIGIMON: 'DIGIMON:',
            OPTION: 'OPTION:',
            TAMER: 'TAMER:',
            DEPLOY_TO_BATTLE: '[ DEPLOY TO BATTLE ]',
            EXPORT: 'EXPORT',
            IMPORT: 'IMPORT',
            ACCESS_VAULT: '[ ACCESS VAULT ]',
            VAULT_EDIT_MODE: 'VAULT // EDIT MODE',
            DECK_PAYLOAD_OK: 'Deck payload OK.',
            EMPTY_MAIN_DECK: 'EMPTY MAIN DECK',
            REMOVE_ONE_COPY: 'Remove one copy',
            TRASH_CHOICE_TITLE: '>> SELECT CARD FROM TRASH <<',
            TRASH_CHOICE_SUBTITLE: 'Choose a legal card for this effect.',
            TRASH_CHOICE_SKIP: '[ SKIP / DO NOT PLAY ]',
            TRASH_PLAY_TITLE: '>> PLAY FROM TRASH <<',
            TRASH_PLAY_SUBTITLE: 'Select a legal Digimon card from your trash to play.',
            TRASH_PLAY_SKIP: '[ SKIP / DO NOT PLAY ]',
            CHOICE_SKIP: 'SKIP / DO NOT USE'
        },
        zh: {
            LANGUAGE_LABEL: '语言',
            CONNECT_DISCORD: '连接 Discord',
            DECK_READY: '卡组就绪',
            NO_DECK_LOADED: '未载入卡组',
            DECK_STATUS_OK: '就绪：主卡组 {main}/50 / 数码蛋 {eggs}/5',
            DECK_STATUS_BAD: '无效：主卡组 {main}/50 / 数码蛋 {eggs}/5',
            MY_DECKS: '[ 我的卡组 ]',
            DECK_BUILDER: '[ 组卡器 ]',
            CREATE_ROOM: '[ 创建房间 ]',
            JOIN_MATCH: '[ 加入对战 ]',
            ENTER_SECURE_ROOM_ID: '输入房间 ID',
            ACTIVE_NODES: '>> 可加入房间',
            NO_ACTIVE_ROOMS: '暂无可加入房间',
            NO_ACTIVE_ROOMS_HINT: '暂无可加入房间<br>先创建一间吧。',
            LEAVE_CLOSE_ROOM: '[ 离开 / 关闭房间 ]',
            READY_TO_BATTLE: '[ 准备对战 ]',
            CANCEL_READY: '[ 取消准备 ]',
            OFFICIAL_FIRST_PLAYER_CHECK: '官方先攻判定',
            RPS_INSTRUCTION: '猜拳决定先后攻。胜者自动先攻，不能选择后攻。',
            RPS_ROCK: '石头',
            RPS_PAPER: '布',
            RPS_SCISSORS: '剪刀',
            RPS_WAITING: '等待双方选择...',
            TACTICAL_MULLIGAN: '起手重调',
            MULLIGAN_HELP: '起手不佳时，可以将手牌洗回卡组并重新抽 5 张。每局限 1 次。',
            KEEP_DECK: '[ 保留手牌 ]',
            MULLIGAN: '[ 重调手牌 ]',
            AWAITING_OPPONENT_DECISION: '>> 等待对手决定...',
            PENDING_ABILITIES: '>> 待发动技能',
            EFFECT_CHOICE_HELP: '* 按官方时点：你可以自由选择效果结算顺序，或跳过非强制效果。',
            EFFECT_QUEUE: '待处理效果队列',
            WAITING_BANNER: '战斗处理中，等待对手响应',
            WAITING: '等待中',
            MATCH_HISTORY: '比赛历史 / 回放日志',
            EXPORT_JSON: '导出 JSON',
            CLOSE: '关闭',
            DECK_REPOSITORY: '卡组仓库',
            FINISH_TURN: '结束回合',
            SURRENDER: '投降',
            CARD_PREVIEW: '卡牌预览',
            OPEN_CARD_INSPECTOR: '打开卡牌检查器',
            INSPECTOR_HINT: '右键场上/手牌卡可查看详情。',
            CHAT_PLACEHOLDER: '输入消息...',
            SEND: '发送',
            CARD_INSPECTOR: '卡牌检查器',
            MAIN_RULE_TEXT: '主要 / 规则文本',
            INHERITED_SECURITY_TEXT: '进化源 / 安防文本',
            DIGIVOLUTION_SOURCES: '进化源',
            BACK_TO_LOBBY: '[ 返回大厅 ]',
            SEARCH_PLACEHOLDER: '搜索名称 / ID / 特征 / 效果...',
            TRAIT_PLACEHOLDER: '特征 / 关键词，例如 D-Reaper、Blocker',
            COLOR_MATCH_ANY: '颜色匹配：任意',
            COLOR_MATCH_ALL: '颜色匹配：全部',
            COLOR_MATCH_EXACT: '颜色匹配：完全一致',
            LV_ALL: '等级：全部',
            TYPE_ALL: '类型：全部',
            SORT_ID: '排序：ID',
            SORT_NAME: '排序：名称',
            SORT_LEVEL: '排序：等级',
            SORT_PLAY_COST: '排序：登场费用',
            SORT_DP: '排序：DP',
            RESET: '重置',
            MATCHES: '{count} 张匹配',
            SCANNING_DATABANK: '正在扫描卡库...',
            END_OF_DATABANK: '>> 卡库到底 <<',
            DECK_ARCHITECT: '卡组构筑',
            MAIN_DECK: '主卡组：',
            DIGI_EGGS: '数码蛋：',
            DIGIMON: '数码兽：',
            OPTION: '选项：',
            TAMER: '驯兽师：',
            DEPLOY_TO_BATTLE: '[ 部署到对战 ]',
            EXPORT: '导出',
            IMPORT: '导入',
            ACCESS_VAULT: '[ 访问仓库 ]',
            VAULT_EDIT_MODE: '仓库 // 编辑模式',
            DECK_PAYLOAD_OK: '卡组数据正常。',
            EMPTY_MAIN_DECK: '主卡组为空',
            REMOVE_ONE_COPY: '移除一张',
            TRASH_CHOICE_TITLE: '>> 从废弃区选择卡牌 <<',
            TRASH_CHOICE_SUBTITLE: '为这个效果选择合法卡牌。',
            TRASH_CHOICE_SKIP: '[ 跳过 / 不登场 ]',
            TRASH_PLAY_TITLE: '>> 从废弃区登场 <<',
            TRASH_PLAY_SUBTITLE: '从你的废弃区选择 1 张可登场的数码宝贝卡。',
            TRASH_PLAY_SKIP: '[ 跳过 / 不登场 ]',
            CHOICE_SKIP: '跳过 / 不使用'
        }
    };

    const state = {
        lang: normalizeLanguage(localStorage.getItem(STORAGE_KEY) || navigator.language || 'zh'),
        dictionaries: {
            en: { ...fallback.en },
            zh: { ...fallback.zh }
        },
        loaded: new Set()
    };

    function normalizeLanguage(lang) {
        return String(lang || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    function interpolate(text, vars) {
        return String(text).replace(/\{(\w+)\}/g, (_, key) => vars && vars[key] !== undefined ? vars[key] : `{${key}}`);
    }

    async function load(lang = state.lang) {
        lang = normalizeLanguage(lang);
        if (state.loaded.has(lang)) return;
        try {
            const res = await fetch(`/translations/${lang}.json`, { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                state.dictionaries[lang] = { ...state.dictionaries[lang], ...data };
            }
        } catch (e) {
            console.warn('[DTCG i18n] Translation fetch failed, using fallback dictionary.', e);
        }
        state.loaded.add(lang);
    }

    function t(key, vars) {
        const dict = state.dictionaries[state.lang] || state.dictionaries.en;
        const text = dict[key] || state.dictionaries.en[key] || key;
        return interpolate(text, vars);
    }

    function apply(root = document) {
        if (!root) return;
        document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
        root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
        root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
        root.querySelectorAll('[data-language-switcher]').forEach(renderSwitcher);
    }

    async function setLanguage(lang) {
        state.lang = normalizeLanguage(lang);
        localStorage.setItem(STORAGE_KEY, state.lang);
        await load(state.lang);
        apply(document);
        window.dispatchEvent(new CustomEvent('dtcg:language-changed', { detail: { lang: state.lang } }));
    }

    function renderSwitcher(target) {
        const host = typeof target === 'string' ? document.getElementById(target) : target;
        if (!host) return;
        host.innerHTML = `
            <label class="lang-switcher-label">
                <span>${t('LANGUAGE_LABEL')}</span>
                <select class="lang-select" aria-label="${t('LANGUAGE_LABEL')}">
                    <option value="en"${state.lang === 'en' ? ' selected' : ''}>English</option>
                    <option value="zh"${state.lang === 'zh' ? ' selected' : ''}>中文</option>
                </select>
            </label>
        `;
        const select = host.querySelector('select');
        if (select) select.addEventListener('change', () => setLanguage(select.value));
    }

    function firstText(card, keys) {
        if (!card) return '';
        for (const key of keys) {
            const value = card[key];
            if (value !== undefined && value !== null && String(value).trim()) return value;
        }
        return '';
    }

    function autoZhCardText(text) {
        if (!text) return '';
        let out = String(text).replace(/\r\n/g, '\n');
        const replacements = [
            [/\[Your Turn\]/g, '[自己的回合]'],
            [/\[Opponent's Turn\]/g, '[对手的回合]'],
            [/\[All Turns\]/g, '[双方回合]'],
            [/\[Main\]/g, '[主要]'],
            [/\[Security\]/g, '[安防]'],
            [/\[On Play\]/g, '[登场时]'],
            [/\[When Digivolving\]/g, '[进化时]'],
            [/\[When Attacking\]/g, '[攻击时]'],
            [/\[On Deletion\]/g, '[消灭时]'],
            [/\[End of Attack\]/g, '[攻击结束时]'],
            [/\[Start of Your Main Phase\]/g, '[自己的主要阶段开始时]'],
            [/\[Start of Your Turn\]/g, '[自己的回合开始时]'],
            [/\[End of Your Turn\]/g, '[自己的回合结束时]'],
            [/\[Once Per Turn\]/g, '[每回合1次]'],
            [/\[Twice Per Turn\]/g, '[每回合2次]'],
            [/Security Effect/g, '安防效果'],
            [/Inherited Effect/g, '进化源效果'],
            [/Special Digivolution Condition/g, '特殊进化条件'],
            [/Digivolution cards?/gi, '进化源卡'],
            [/digivolution cards?/gi, '进化源卡'],
            [/digivolution requirements?/gi, '进化条件'],
            [/digivolution cost/gi, '进化费用'],
            [/play cost/gi, '登场费用'],
            [/memory cost/gi, '费用'],
            [/without paying (?:the )?cost/gi, '不支付费用'],
            [/without paying (?:its )?memory cost/gi, '不支付费用'],
            [/ignoring (?:its )?digivolution requirements/gi, '无视进化条件'],
            [/Draw (\d+)/g, '抽 $1'],
            [/＜Draw (\d+)＞/g, '＜抽 $1＞'],
            [/<Draw (\d+)>/g, '＜抽 $1＞'],
            [/＜Recovery \+(\d+) \(Deck\)＞/g, '＜回复+$1（卡组）＞'],
            [/<Recovery \+(\d+) \(Deck\)>/g, '＜回复+$1（卡组）＞'],
            [/＜Security A\. \+(\d+)＞/g, '＜安防攻击+$1＞'],
            [/<Security A\. \+(\d+)>/g, '＜安防攻击+$1＞'],
            [/＜Security A\. -(\d+)＞/g, '＜安防攻击-$1＞'],
            [/<Security A\. -(\d+)>/g, '＜安防攻击-$1＞'],
            [/＜De-Digivolve (\d+)＞/g, '＜退化 $1＞'],
            [/<De-Digivolve (\d+)>/g, '＜退化 $1＞'],
            [/＜Piercing＞/g, '＜贯通＞'],
            [/<Piercing>/g, '＜贯通＞'],
            [/＜Blocker＞/g, '＜阻挡者＞'],
            [/<Blocker>/g, '＜阻挡者＞'],
            [/＜Jamming＞/g, '＜干扰＞'],
            [/<Jamming>/g, '＜干扰＞'],
            [/＜Rush＞/g, '＜速攻＞'],
            [/<Rush>/g, '＜速攻＞'],
            [/＜Retaliation＞/g, '＜复仇＞'],
            [/<Retaliation>/g, '＜复仇＞'],
            [/＜Reboot＞/g, '＜重启＞'],
            [/<Reboot>/g, '＜重启＞'],
            [/＜Evade＞/g, '＜回避＞'],
            [/<Evade>/g, '＜回避＞'],
            [/＜Raid＞/g, '＜突袭＞'],
            [/<Raid>/g, '＜突袭＞'],
            [/＜Barrier＞/g, '＜屏障＞'],
            [/<Barrier>/g, '＜屏障＞'],
            [/＜Overflow ?\((-?\d+)\)＞/g, '＜溢出（$1）＞'],
            [/<Overflow ?\((-?\d+)\)>/g, '＜溢出（$1）＞'],
            [/＜Delay＞/g, '＜延迟＞'],
            [/<Delay>/g, '＜延迟＞'],
            [/This Digimon/g, '这只数码兽'],
            [/this Digimon/g, '这只数码兽'],
            [/your opponent's/gi, '对手的'],
            [/your opponent/gi, '对手'],
            [/one of your/gi, '你的1只'],
            [/1 of your/gi, '你的1只'],
            [/1 of (?:your )?opponent's/gi, '对手的1只'],
            [/all of your/gi, '你的全部'],
            [/all of (?:your )?opponent's/gi, '对手的全部'],
            [/you may/gi, '你可以'],
            [/you can/gi, '你可以'],
            [/you have/gi, '你有'],
            [/if you have/gi, '如果你有'],
            [/if you don't have/gi, '如果你没有'],
            [/if (?:you )?do/gi, '如果如此'],
            [/then,/gi, '然后，'],
            [/Then,/g, '然后，'],
            [/until the end of your opponent's turn/gi, '直到对手回合结束'],
            [/until the end of their turn/gi, '直到其回合结束'],
            [/until the end of the turn/gi, '直到回合结束'],
            [/for the turn/gi, '直到回合结束'],
            [/may digivolve into/gi, '可以进化为'],
            [/digivolve into/gi, '进化为'],
            [/may DNA digivolve into/gi, '可以 DNA 进化为'],
            [/DNA digivolve into/gi, 'DNA 进化为'],
            [/play 1/gi, '登场1张'],
            [/play this card/gi, '登场这张卡'],
            [/return 1/gi, '将1张返回'],
            [/return up to (\d+)/gi, '将最多$1张返回'],
            [/add this card to (?:your )?hand/gi, '将这张卡加入手牌'],
            [/add it to (?:your )?hand/gi, '将其加入手牌'],
            [/add 1/gi, '将1张加入'],
            [/trash 1/gi, '废弃1张'],
            [/trash the top card/gi, '废弃最上方的卡'],
            [/delete 1/gi, '消灭1只'],
            [/delete all/gi, '消灭全部'],
            [/unsuspend/gi, '重置'],
            [/suspend/gi, '横置'],
            [/can't suspend/gi, '不能横置'],
            [/can't attack/gi, '不能攻击'],
            [/can't block/gi, '不能阻挡'],
            [/can't be deleted/gi, '不会被消灭'],
            [/can't be returned/gi, '不会被返回'],
            [/can't be played/gi, '不能被登场'],
            [/gains?/gi, '获得'],
            [/gain (\d+) memory/gi, '获得$1点内存'],
            [/lose (\d+) memory/gi, '失去$1点内存'],
            [/reduce (?:the )?play cost by (\d+)/gi, '登场费用-$1'],
            [/with (?:a )?play cost of (\d+) or less/gi, '登场费用$1以下'],
            [/with (\d+) DP or less/gi, 'DP为$1以下'],
            [/(\d+) DP or less/gi, 'DP为$1以下'],
            [/(\d+) DP or higher/gi, 'DP为$1以上'],
            [/level (\d+) or lower/gi, '等级$1以下'],
            [/level (\d+) or higher/gi, '等级$1以上'],
            [/Lv\.(\d+)/g, 'Lv.$1'],
            [/from your hand or trash/gi, '从你的手牌或废弃区'],
            [/from (?:your )?hand/gi, '从你的手牌'],
            [/from (?:your )?trash/gi, '从你的废弃区'],
            [/from (?:your )?deck/gi, '从你的卡组'],
            [/from (?:your )?security stack/gi, '从你的安防区'],
            [/to (?:your )?hand/gi, '到你的手牌'],
            [/to (?:your )?trash/gi, '到废弃区'],
            [/to the bottom of (?:its owner's )?deck/gi, '到其持有者卡组最下方'],
            [/to the bottom of (?:your )?deck/gi, '到你的卡组最下方'],
            [/at the bottom of (?:your )?security stack face down/gi, '以背面放到你的安防区最下方'],
            [/battle area/gi, '战斗区'],
            [/breeding area/gi, '孵化区'],
            [/security stack/gi, '安防区'],
            [/security/gi, '安防'],
            [/hand/gi, '手牌'],
            [/trash/gi, '废弃区'],
            [/deck/gi, '卡组'],
            [/Digimon/g, '数码兽'],
            [/Tamer/g, '驯兽师'],
            [/Tamers/g, '驯兽师'],
            [/Option/g, '选项'],
            [/Options/g, '选项'],
            [/Digi-Egg/g, '数码蛋'],
            [/red/gi, '红色'],
            [/blue/gi, '蓝色'],
            [/yellow/gi, '黄色'],
            [/green/gi, '绿色'],
            [/black/gi, '黑色'],
            [/purple/gi, '紫色'],
            [/white/gi, '白色'],
            [/card/g, '卡'],
            [/cards/g, '卡'],
            [/name/g, '名称'],
            [/trait/g, '特征'],
            [/traits/g, '特征']
        ];
        for (const [pattern, replacement] of replacements) {
            out = out.replace(pattern, replacement);
        }
        return out;
    }

    function localizedCardText(card, zhKeys, enKeys) {
        if (state.lang === 'zh') {
            return firstText(card, zhKeys) || autoZhCardText(firstText(card, enKeys));
        }
        return firstText(card, enKeys);
    }

    function cardName(card) {
        return localizedCardText(card, ['name_zh', 'zhName', 'nameZh', 'cnName', 'chineseName'], ['name', 'optionName', 'id']) || 'UNKNOWN';
    }

    function cardMain(card) {
        return localizedCardText(card, ['mainEffect_zh', 'zhMainEffect', 'mainEffectZh', 'officialMainText_zh'], ['mainEffect']);
    }

    function cardSource(card) {
        return localizedCardText(card, ['sourceEffect_zh', 'zhSourceEffect', 'sourceEffectZh', 'officialSourceText_zh'], ['sourceEffect']);
    }

    function cardEffect(card) {
        return localizedCardText(card, ['effectText_zh', 'zhEffectText', 'effectTextZh', 'officialEffectText_zh'], ['effectText']);
    }

    function cardImage(card) {
        if (!card) return '';
        if (state.lang === 'zh') {
            return firstText(card, ['img_zh', 'zhImg', 'image_zh', 'zhImage']) || firstText(card, ['img']);
        }
        return firstText(card, ['img']);
    }

    function cardSearchText(card) {
        if (!card) return '';
        const keys = [
            'id', 'name', 'optionName', 'type', 'color', 'traits', 'mainEffect', 'sourceEffect', 'effectText',
            'name_zh', 'zhName', 'nameZh', 'cnName', 'chineseName',
            'mainEffect_zh', 'zhMainEffect', 'mainEffectZh',
            'sourceEffect_zh', 'zhSourceEffect', 'sourceEffectZh',
            'effectText_zh', 'zhEffectText', 'effectTextZh'
        ];
        return keys.map(key => card[key]).filter(Boolean).join(' ');
    }

    async function init() {
        await load(state.lang);
        apply(document);
    }

    window.DTCGI18N = {
        supported: SUPPORTED,
        init,
        load,
        apply,
        t,
        setLanguage,
        getLanguage: () => state.lang,
        cardName,
        cardMain,
        cardSource,
        cardEffect,
        cardImage,
        autoZhCardText,
        cardSearchText
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
