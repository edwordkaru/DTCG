// ================================================
// fetch-cards.js · Safe Enriched Version
// 保留 mechanics + 增强卡牌资料
// ================================================
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CARDS_FILE = path.join(__dirname, 'cards.json');
const IMG_DIR = path.join(__dirname, 'img');

if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR);

function normalizeArray(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value
            .map(v => String(v).trim())
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(/[,/|]/)
            .map(v => v.trim())
            .filter(Boolean);
    }

    return [];
}

function uniq(arr) {
    return [...new Set(arr.filter(Boolean))];
}

const OFFICIAL_COLOR_TOKENS = ['Red', 'Blue', 'Yellow', 'Green', 'Black', 'Purple', 'White'];

function normalizeColorTokensFromString(value) {
    const raw = String(value || '').replace(/ /g, ' ').trim();
    if (!raw) return [];
    const normalized = raw.replace(/[\/,&+|]/g, ' ').replace(/\s+/g, ' ');
    const found = OFFICIAL_COLOR_TOKENS.filter(color => new RegExp(`\b${color}\b`, 'i').test(normalized));
    if (found.length > 0) return found;
    return normalizeArray(raw);
}

function normalizeColorList(value) {
    if (Array.isArray(value)) return uniq(value.flatMap(v => normalizeColorTokensFromString(v)));
    return normalizeColorTokensFromString(value);
}


// Round 14C: bracket tokens in card text contain both real names/traits
// ([D-Reaper], [Greymon]) and timing/rule labels ([When Moving], [Counter]).
// Only keep the former in traitTokens/searchText. Keeping timing labels as traits
// makes HAS_TRAIT / reveal / deck-builder filters produce false positives.
const TIMING_OR_RULE_BRACKET_TOKENS = new Set([
    "on play",
    "when digivolving",
    "when attacking",
    "on deletion",
    "main",
    "security",
    "your turn",
    "opponent's turn",
    "all turns",
    "once per turn",
    "start of your turn",
    "start of opponent's turn",
    "start of your main phase",
    "end of your turn",
    "end of opponent's turn",
    "end of all turns",
    "end of attack",
    "end of turn",
    "when moving",
    "when blocking",
    "counter",
    "delay",
    "hand",
    "trash",
    "breeding",
    "link",
    "overclock",
    "blast digivolve",
    "blast dna digivolve",
    "would be played",
    "would digivolve"
]);

function normalizeBracketToken(token = "") {
    return String(token || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isTimingOrRuleBracketToken(token = "") {
    const normalized = normalizeBracketToken(token).toLowerCase();
    if (!normalized) return true;
    if (TIMING_OR_RULE_BRACKET_TOKENS.has(normalized)) return true;
    // Covers variants like [Counter] <Blast Digivolve> should never become a trait.
    if (/^(start|end) of (your|opponent's|all) turn$/.test(normalized)) return true;
    return false;
}

function extractBracketTokens(text = "") {
    const tokens = [];
    const regex = /\[([^\]]+)\]/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const token = normalizeBracketToken(match[1]);
        if (isTimingOrRuleBracketToken(token)) continue;
        tokens.push(token);
    }

    return uniq(tokens);
}

function extractNameTokens(name = "") {
    const tokens = [name];

    // 例如 Agumon (X Antibody) → X Antibody
    const bracket = name.match(/\((.*?)\)/);
    if (bracket) tokens.push(bracket[1]);

    // 例如 Agumon - Bond of Bravery
    if (name.includes(" - ")) {
        tokens.push(...name.split(" - ").map(x => x.trim()));
    }

    return uniq(tokens);
}

function buildTraitTokens(card) {
    const rawTraits = [
        ...normalizeArray(card.traits),
        ...normalizeArray(card.attribute),
        ...normalizeArray(card.form),
        ...normalizeArray(card.type2),
        ...normalizeArray(card.card_type),
    ];

    const name = card.name || "";

    // Round 15E: Official targeting distinguishes real traits/names from
    // "[X] in its text" references. Do not copy arbitrary bracket tokens
    // from rules text into traitTokens; keep those in effectBracketTokens/searchText
    // only. This prevents cards that merely mention [Palmon] or [Mimi] from
    // being targetable as Palmon/Mimi-trait cards.
    const nameBased = [];
    if (/D-Reaper|ADR-|Mother D-Reaper/i.test(name)) {
        nameBased.push("D-Reaper");
    }

    return uniq([...rawTraits, ...nameBased]);
}

function buildEffectBracketTokens(card) {
    return uniq([
        ...extractBracketTokens(card.main_effect || ""),
        ...extractBracketTokens(card.source_effect || "")
    ]);
}

function normalizeColor(card) {
    // Round 22DJ: Bandai official card pages often expose multi-color values as
    // whitespace-separated text such as "Red Black" or "Blue Red Green".
    // Do not use normalizeArray here because it intentionally preserves spaces
    // for traits like "Royal Knight". Color metadata needs its own parser.
    const colors = uniq([
        ...normalizeColorList(card.color),
        ...normalizeColorList(card.colour),
        ...normalizeColorList(card.colors),
        ...normalizeColorList(card.colours)
    ]);
    return colors;
}


// Round 22DJ/22EA: official multi-color metadata overlay. Bandai's
// official cardlist publishes multi-color values as whitespace-separated
// color words, while third-party/local refreshes can collapse many entries
// to only the first color. Preserve these official colors through refreshes.
const OFFICIAL_COLOR_METADATA_PATCHES = {
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
    // Round 22EA: Angel/Mastemon support cards from older products that the
    // default latest-category official sync does not touch.
    'ST10-04': ['Yellow', 'Purple'],
    'BT11-094': ['Purple', 'Yellow'],
    'EX6-074': ['Purple', 'Yellow']
};



// Round 22EG/22EH: official errata overlay. Bandai's May 15, 2026 errata changes
// BT25-057 Final Judgment duration, and the Aug. 1, 2025 errata changes ST10-06
// Mastemon's security-search wording. Third-party/cardlist refreshes can still
// expose pre-errata text, so keep this local overlay authoritative and patch
// preserved mechanics too.
function applyOfficialErrataMetadataPatch(rawId, enrichedCard) {
    if (!enrichedCard) return enrichedCard;
    if (rawId === 'ST10-06') {
        const correctedMain = "[When Digivolving] Place 1 yellow or purple Digimon card from your trash on top of your security stack face down. When DNA digivolving, search your security stack, and you may play 1 level 5 or lower Digimon card among it without paying its cost. Then, shuffle your security stack.\n[All Turns] When you play another Digimon using an effect, delete 1 of your opponent's Digimon whose level is less than or equal to the played Digimon's level.";
        enrichedCard.mainEffect = correctedMain;
        enrichedCard.effectText = correctedMain;
        enrichedCard.officialMainText = "[Effect] [When Digivolving] Place 1 yellow or purple Digimon card from your trash on top of your security stack face down. When DNA digivolving, search your security stack, and you may play 1 level 5 or lower Digimon card among it without paying its cost. Then, shuffle your security stack. [All Turns] When you play another Digimon using an effect, delete 1 of your opponent's Digimon whose level is less than or equal to the played Digimon's level.";
        enrichedCard.mechanics = [
            {
                trigger: 'WHEN_DIGIVOLVING',
                actions: [{
                    type: 'PLACE_SECURITY_FROM_TRASH',
                    amount: 1,
                    target: { owner: 'own', cardType: 'digimon', count: 1, colorAny: ['Yellow', 'Purple'] },
                    position: 'top',
                    faceUp: false,
                    _round22eh: 'Official ST10-06 errata: place a Digimon card from trash on top of security; this is not PLACE_SOURCE.'
                }]
            },
            {
                trigger: 'WHEN_DIGIVOLVING',
                condition: { type: 'DIGIVOLVE_CONTEXT', dna: true },
                actions: [
                    { type: 'REVEAL_AND_SELECT', from: 'security', zone: 'security', amount: 0, target: { owner: 'own', cardType: 'digimon', maxLevel: 5, count: 1 }, then: 'PLAY_SELECTED', optional: true, _round22eh: 'Official ST10-06 errata: search security and optionally choose a Lv.5 or lower Digimon among it to play.' },
                    { type: 'PLAY_FROM_HAND_OR_TRASH', from: 'revealed', target: { owner: 'own', cardType: 'digimon', maxLevel: 5, count: 1 }, free: true, payCost: false, _round22eh: 'Consumes the chosen security card from the revealed buffer; not hand/trash.' },
                    { type: 'RETURN_REVEALED_REST_TO_SECURITY_SHUFFLE', _round22eh: 'Then, shuffle your security stack after the security search.' }
                ]
            },
            {
                trigger: 'ALL_TURNS',
                actions: [{
                    type: 'DELETE_DIGIMON',
                    target: { owner: 'opponent', cardType: 'digimon', maxLevel: { type: 'LEVEL_CHECK', operator: '<=', value: { type: 'LEVEL_CHECK', operator: '=', value: 'played_digimon_level' } } },
                    condition: { type: 'HAS_TRAIT', trait: 'played_digimon' }
                }]
            }
        ];
        enrichedCard.searchText = [rawId, enrichedCard.name || '', Array.isArray(enrichedCard.colors) ? enrichedCard.colors.join(' ') : (enrichedCard.color || ''), Array.isArray(enrichedCard.traitTokens) ? enrichedCard.traitTokens.join(' ') : (enrichedCard.traits || ''), enrichedCard.mainEffect || '', enrichedCard.sourceEffect || ''].join(' ').toLowerCase();
        enrichedCard._round22eh = { officialErrata: 'Aug. 1, 2025 ST10-06 Mastemon security-search/play wording and runtime mechanics are authoritative.' };
        return enrichedCard;
    }
    if (rawId !== 'BT25-057') return enrichedCard;
    const correctedMain = "[When Digivolving] [When Attacking] [Once Per Turn] By trashing the bottom face-down card under any of your Tamers, ＜De-Digivolve 1＞ 1 of your opponent's Digimon. (Trash the top card. You can't trash past level 3 cards.)\n[When Digivolving] This Digimon may battle 1 of your opponent's Digimon. Use Requirement: Glowing Dawn trait\n[Main] 1 of your Digimon gains ＜Rush＞, ＜Security A. +1＞ and +5000 DP for the turn. Then, it may attack.";
    const correctedOption = "Use Requirement: Glowing Dawn trait\n[Main] 1 of your Digimon gains ＜Rush＞, ＜Security A. +1＞ and +5000 DP for the turn. Then, it may attack.";
    enrichedCard.mainEffect = correctedMain;
    enrichedCard.sourceEffect = correctedOption;
    enrichedCard.officialMainText = "[Special Digivolution Condition] [Digivolve] Lv.4 w/[Glowing Dawn] trait: Cost 3\n[Effect] [When Digivolving] [When Attacking] [Once Per Turn] By trashing the bottom face-down card under any of your Tamers, ＜De-Digivolve 1＞ 1 of your opponent's Digimon. [When Digivolving] This Digimon may battle 1 of your opponent's Digimon.\n[DUAL Effect] ＜Use Req. ([Glowing Dawn] trait)＞ (Specified cards let you ignore color requirements.) [Main] 1 of your Digimon gains ＜Rush＞, ＜Security A. +1＞ and +5000 DP for the turn. Then, it may attack.\n[DUAL Rule] ＜Arts Digivolve＞ (Instead of trashing after use, your Digimon may digivolve into this card without paying the cost, ignoring digivolution requirements.)";
    enrichedCard.effectText = `${correctedMain} ${correctedOption}`.trim();
    if (Array.isArray(enrichedCard.mechanics)) {
        enrichedCard.mechanics.forEach(mech => {
            if (String(mech?.trigger || '').toUpperCase() !== 'MAIN' || mech.dualOptionSide !== true) return;
            mech._round22eg = 'Official May 15 2026 errata: Final Judgment buffs expire at END_OF_TURN.';
            (Array.isArray(mech.actions) ? mech.actions : []).forEach(action => {
                if (!['GRANT_KEYWORD', 'DP_MOD'].includes(String(action?.type || '').toUpperCase())) return;
                action.duration = 'END_OF_TURN';
                if (action.buff && typeof action.buff === 'object') action.buff.duration = 'END_OF_TURN';
            });
        });
    }
    enrichedCard.searchText = [
        rawId,
        enrichedCard.name || '',
        Array.isArray(enrichedCard.colors) ? enrichedCard.colors.join(' ') : (enrichedCard.color || ''),
        Array.isArray(enrichedCard.traitTokens) ? enrichedCard.traitTokens.join(' ') : (enrichedCard.traits || ''),
        enrichedCard.mainEffect || '',
        enrichedCard.sourceEffect || ''
    ].join(' ').toLowerCase();
    enrichedCard._round22eg = {
        officialErrata: 'May 15, 2026 BT25-057 Final Judgment duration is “for the turn”, not “until your opponent\'s turn ends”.'
    };
    return enrichedCard;
}

function applyOfficialColorMetadataPatch(rawId, enrichedCard) {
    const colors = OFFICIAL_COLOR_METADATA_PATCHES[rawId];
    if (!Array.isArray(colors) || colors.length === 0 || !enrichedCard) return enrichedCard;
    enrichedCard.color = colors[0];
    enrichedCard.colors = colors.slice();
    const searchParts = [
        rawId,
        enrichedCard.name || '',
        colors.join(' '),
        Array.isArray(enrichedCard.traitTokens) ? enrichedCard.traitTokens.join(' ') : enrichedCard.traits || '',
        enrichedCard.mainEffect || '',
        enrichedCard.sourceEffect || ''
    ];
    enrichedCard.searchText = searchParts.join(' ').toLowerCase();
    enrichedCard._round22dj = {
        officialColorMetadata: 'Restored official multi-color metadata from Bandai official cardlist.'
    };
    return enrichedCard;
}

// Round 15N: preserve future DUAL Option-side metadata if the upstream feed
// exposes it. Current digimoncard.io data often only has one color/trait field,
// so these helpers must not fabricate optionTraits from Digimon-side traits.
function normalizeOptionColors(card, old = {}) {
    return uniq([
        ...normalizeArray(card.option_color || card.optionColor || card.option_colors || card.optionColours),
        ...normalizeArray(old.optionColors || old.dualOptionColors)
    ]);
}

function normalizeOptionTraits(card, old = {}) {
    return uniq([
        ...normalizeArray(card.option_traits || card.optionTraits || card.option_type || card.optionType),
        ...normalizeArray(old.optionTraitTokens || old.dualOptionTraitTokens || old.optionTraits)
    ]);
}


// Round 18T: official DUAL lower Option-side metadata. The public feed can label
// cards as `dual` while still omitting DUAL Color/Cost/Use Req fields, so preserve
// and seed the known official metadata instead of falling back to Digimon-side info.
const OFFICIAL_DUAL_OPTION_METADATA = {
    "ST23-09": { optionName: "Eclipse Impact", optionColors: ["Green"], optionCost: 5, useReqTraits: ["BEATBREAK"], traits: ["Mutant", "Glowing Dawn", "BEATBREAK"] },
    "BT25-043": { optionName: "Habakiri", optionColors: ["Yellow"], optionCost: 6, useReqTraits: ["Glowing Dawn"], traits: ["Shaman", "Glowing Dawn", "BEATBREAK"] },
    "BT25-057": { optionName: "Final Judgment", optionColors: ["Green"], optionCost: 4, useReqTraits: ["Glowing Dawn"], traits: ["Cyborg", "Glowing Dawn", "BEATBREAK"] },
    "BT25-085": { optionName: "Fly Bullet", optionColors: ["Purple"], optionCost: 6, useReqTextContains: ["Three Musketeers"], traits: ["Wizard", "Three Musketeers", "Iliad", "TS"] },
    "ST24-07": { optionName: "GeoGrey Sword", optionColors: ["Yellow", "Red"], optionCost: 5, useReqTraits: ["DATA SQUAD"], traits: ["Light Dragon", "DATA SQUAD"] },
    "BT25-104": { optionName: "Final Shining Burst", optionColors: ["Red", "Yellow"], optionCost: 6, useReqTraits: ["DATA SQUAD"], traits: ["Light Dragon", "DATA SQUAD"] },
    "EX12-018": { optionName: "Planet Punch", optionColors: ["Red"], optionCost: 5, useReqTraits: ["VB"], traits: ["Light Dragon", "VB"] }
};

function applyOfficialDualOptionMetadata(rawId, enrichedCard, old = {}) {
    const meta = OFFICIAL_DUAL_OPTION_METADATA[rawId];
    const type = String(enrichedCard.type || '').toLowerCase();
    if (!meta && !type.includes('dual')) return enrichedCard;
    const officialTraits = Array.isArray(meta?.traits) ? meta.traits : null;
    if (officialTraits) {
        enrichedCard.traitTokens = officialTraits;
        enrichedCard.traits = officialTraits.join(', ');
    }
    const traitTokens = Array.isArray(enrichedCard.traitTokens) ? enrichedCard.traitTokens : [];
    const optionColors = uniq([...(meta?.optionColors || []), ...normalizeArray(enrichedCard.optionColors), ...normalizeArray(old.optionColors || old.dualOptionColors)]);
    const optionTraitTokens = uniq([...(meta ? traitTokens : []), ...normalizeArray(enrichedCard.optionTraitTokens), ...normalizeArray(old.optionTraitTokens || old.dualOptionTraitTokens)]);
    enrichedCard.optionName = meta?.optionName || old.optionName || enrichedCard.optionName || null;
    enrichedCard.optionColors = optionColors;
    enrichedCard.dualOptionColors = optionColors;
    enrichedCard.optionTraitTokens = optionTraitTokens;
    enrichedCard.dualOptionTraitTokens = optionTraitTokens;
    enrichedCard.dualOptionCost = meta?.optionCost ?? old.dualOptionCost ?? enrichedCard.dualOptionCost ?? null;
    enrichedCard.dualUseReqTraits = uniq([...(meta?.useReqTraits || []), ...normalizeArray(old.dualUseReqTraits)]);
    enrichedCard.dualUseReqTextContains = uniq([...(meta?.useReqTextContains || []), ...normalizeArray(old.dualUseReqTextContains)]);
    enrichedCard.searchText = [
        enrichedCard.searchText,
        enrichedCard.optionName,
        optionColors.join(' '),
        optionTraitTokens.join(' '),
        enrichedCard.dualUseReqTraits.join(' '),
        enrichedCard.dualUseReqTextContains.join(' ')
    ].join(' ').toLowerCase();
    return enrichedCard;
}

async function downloadImage(url, filePath) {
    try {
        const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            timeout: 15000
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) {
        console.log(`❌ 下载失败: ${url}`);
        return false;
    }
}

function hasUsableImageFile(filePath) {
    try {
        return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
    } catch (e) {
        return false;
    }
}

function getCardImageFileName(cardId) {
    return `${String(cardId || '').replace(/\//g, '-')}.jpg`;
}

function getOfficialBt25OverlayImageUrl(cardId) {
    // Round 22DD: the official BT25 overlay cards are absent from the third-party
    // card feed, so they may never pass through the normal per-card image loop.
    // Keep their image URL deterministic and runner-friendly.
    return `https://images.digimoncard.io/images/cards/${String(cardId || '').trim()}.jpg`;
}

function getOfficialBt25OverlayImagePath(cardId) {
    return path.join(IMG_DIR, getCardImageFileName(cardId));
}

// Round 22DI: official Token image source map. Bandai publishes printable
// Token sheets as official PDFs on the rule page; the simulator keeps one
// cropped jpg per Token id at /img/<tokenId>.jpg for normal card rendering.
const OFFICIAL_TOKEN_IMAGE_PDF_SOURCES = {

    "TOKEN-03": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_03.pdf?v=20260424", pdfName: "token_03.pdf" },
    "TOKEN-04": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_04.pdf?v=20260424", pdfName: "token_04.pdf" },
    "TOKEN-05": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_05.pdf?v=20260424", pdfName: "token_05.pdf" },
    "TOKEN-06": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_06.pdf?v=20260424", pdfName: "token_06.pdf" },
    "TOKEN-07": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_07.pdf?v=20260424", pdfName: "token_07.pdf" },
    "TOKEN-09": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_09.pdf?v=20260424", pdfName: "token_09.pdf" },
    "TOKEN-11": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_11.pdf?v=20260424", pdfName: "token_11.pdf" },
    "TOKEN-12": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_12.pdf?v=20260424", pdfName: "token_12.pdf" },
    "TOKEN-13": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_13.pdf?v=20260424", pdfName: "token_13.pdf" },
    "TOKEN-17": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_17.pdf?v=20260424", pdfName: "token_17.pdf" },
    "TOKEN": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_02.pdf?v=20260424", pdfName: "token_02.pdf" },
    "BT22-TOKEN": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_08.pdf?v=20260424", pdfName: "token_08.pdf" },
    "ST22-TOKEN01": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_10.pdf?v=20260424", pdfName: "token_10.pdf" },
    "ST22-TOKEN02": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_14.pdf?v=20260424", pdfName: "token_14.pdf" },
    "BT23-TOKEN": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_15.pdf?v=20260424", pdfName: "token_15.pdf" },
    "BT24-TOKEN": { pdfUrl: "https://world.digimoncard.com/rule/pdf/token/token_16.pdf?v=20260424", pdfName: "token_16.pdf" }
};

function getOfficialTokenImageIds() {
    return Object.keys(OFFICIAL_TOKEN_IMAGE_PDF_SOURCES);
}

function getOfficialTokenImagePath(cardId) {
    return path.join(IMG_DIR, getCardImageFileName(cardId));
}

function getOfficialTokenImagePdfUrl(cardId) {
    return OFFICIAL_TOKEN_IMAGE_PDF_SOURCES[String(cardId || '').trim()]?.pdfUrl || '';
}

function getOfficialTokenImagePdfPath(cardId) {
    const source = OFFICIAL_TOKEN_IMAGE_PDF_SOURCES[String(cardId || '').trim()];
    return source ? path.join(IMG_DIR, 'official-token-pdfs', source.pdfName) : '';
}

function tryRenderOfficialTokenPdfToJpg(pdfPath, jpgPath) {
    // Best-effort local helper. In stripped runners this may be unavailable; in
    // that case the downloaded package-provided jpg remains the source of truth.
    try {
        const { spawnSync } = require('child_process');
        const tools = process.platform === 'win32'
            ? [['magick'], ['convert']]
            : [['magick'], ['convert']];
        for (const toolArgs of tools) {
            const cmd = toolArgs[0];
            const args = [
                '-density', '216', `${pdfPath}[0]`,
                '-crop', '540x749+86+138', '+repage',
                '-resize', '488x680!',
                '-quality', '92',
                jpgPath
            ];
            const result = spawnSync(cmd, args, { stdio: 'ignore' });
            if (result.status === 0 && hasUsableImageFile(jpgPath)) return true;
        }
    } catch (e) {}
    return false;
}

async function ensureOfficialTokenImages(options = {}) {
    const ids = Array.isArray(options.ids) && options.ids.length
        ? options.ids
        : getOfficialTokenImageIds();
    const results = [];
    const pdfDir = path.join(IMG_DIR, 'official-token-pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    for (const id of ids) {
        const filePath = getOfficialTokenImagePath(id);
        const pdfUrl = getOfficialTokenImagePdfUrl(id);
        const pdfPath = getOfficialTokenImagePdfPath(id);
        if (hasUsableImageFile(filePath)) {
            results.push({ id, status: 'exists', filePath, pdfPath, url: pdfUrl });
            continue;
        }
        if (options.dryRun) {
            results.push({ id, status: 'missing', filePath, pdfPath, url: pdfUrl });
            continue;
        }
        if (!hasUsableImageFile(pdfPath)) await downloadImage(pdfUrl, pdfPath);
        const rendered = hasUsableImageFile(pdfPath) && tryRenderOfficialTokenPdfToJpg(pdfPath, filePath);
        results.push({
            id,
            status: hasUsableImageFile(filePath) ? (rendered ? 'rendered' : 'exists') : (hasUsableImageFile(pdfPath) ? 'pdf_downloaded' : 'failed'),
            filePath,
            pdfPath,
            url: pdfUrl
        });
    }
    return results;
}

async function runOfficialTokenImagesOnly() {
    console.log('🖼️ Round 22DI: pulling official Token images/PDF sheets only...');
    const results = await ensureOfficialTokenImages();
    for (const row of results) {
        const ok = ['exists','rendered'].includes(row.status);
        const icon = ok ? '✅' : (row.status === 'pdf_downloaded' ? '⚠️' : '❌');
        console.log(`${icon} ${row.id}: ${row.status} → ${path.relative(__dirname, row.filePath)}`);
    }
    const missingJpg = results.filter(row => !['exists','rendered'].includes(row.status));
    if (missingJpg.length) {
        console.log(`⚠️ ${missingJpg.length} Token jpg(s) still missing. The official PDF sheet was downloaded when possible; place/crop /img/<TokenId>.jpg if ImageMagick is unavailable.`);
    }
}

// Round 22DC: official BT25 overlay. The third-party digimoncard.io feed can lag
// behind Bandai's official BT25 cardlist. These cards are verified from the
// official BT25 cardlist and must survive refreshes even when upstream omits them.
const OFFICIAL_BT25_CARD_PATCHES = [
    {
        "id": "BT25-036",
        "name": "Craftmon",
        "type": "digimon",
        "level": 4,
        "playCost": 5,
        "digivolveCost": 2,
        "color": "Yellow",
        "colors": [
            "Yellow"
        ],
        "dp": 5000,
        "img": "/img/BT25-036.jpg",
        "mainEffect": "[App Fusion] [Kabemon] & [Gomimon] & [Ecomon] & [Puzzlemon]: Cost 0\nIf 2 such cards are linked together, stack the link card on top and digivolve.\n[Security] At the end of the battle, play this card without paying the cost.\n[On Play] [When Digivolving] Add your top security card to the hand. Then, ＜Recovery +1＞.",
        "sourceEffect": "DP+3000\n＜Link＞ [Appmon] trait: Cost 2 (Plug this card from the hand or battle area sideways into the specified Digimon in the battle area.)\n[When Linking] By trashing 1 [Appmon] trait card from your hand, ＜Draw 2＞.",
        "traits": "Design",
        "traitTokens": [
            "Design"
        ],
        "nameTokens": [
            "Craftmon"
        ],
        "effectText": "[App Fusion] [Kabemon] & [Gomimon] & [Ecomon] & [Puzzlemon]: Cost 0\nIf 2 such cards are linked together, stack the link card on top and digivolve.\n[Security] At the end of the battle, play this card without paying the cost.\n[On Play] [When Digivolving] Add your top security card to the hand. Then, ＜Recovery +1＞. DP+3000\n＜Link＞ [Appmon] trait: Cost 2 (Plug this card from the hand or battle area sideways into the specified Digimon in the battle area.)\n[When Linking] By trashing 1 [Appmon] trait card from your hand, ＜Draw 2＞.",
        "searchText": "bt25-036 craftmon yellow yellow design [app fusion] [kabemon] & [gomimon] & [ecomon] & [puzzlemon]: cost 0\nif 2 such cards are linked together, stack the link card on top and digivolve.\n[security] at the end of the battle, play this card without paying the cost.\n[on play] [when digivolving] add your top security card to the hand. then, ＜recovery +1＞. dp+3000\n＜link＞ [appmon] trait: cost 2 (plug this card from the hand or battle area sideways into the specified digimon in the battle area.)\n[when linking] by trashing 1 [appmon] trait card from your hand, ＜draw 2＞.",
        "mechanics": [
            {
                "trigger": "SECURITY",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "PLAY_FROM_SECURITY"
                    }
                ]
            },
            {
                "trigger": "ON_PLAY",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "ADD_SECURITY_TO_HAND",
                        "amount": 1,
                        "from": "security_top",
                        "target": {
                            "owner": "own",
                            "cardType": "security",
                            "count": 1
                        }
                    },
                    {
                        "type": "RECOVERY_DECK",
                        "amount": 1
                    }
                ]
            },
            {
                "trigger": "WHEN_DIGIVOLVING",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "ADD_SECURITY_TO_HAND",
                        "amount": 1,
                        "from": "security_top",
                        "target": {
                            "owner": "own",
                            "cardType": "security",
                            "count": 1
                        }
                    },
                    {
                        "type": "RECOVERY_DECK",
                        "amount": 1
                    }
                ]
            },
            {
                "trigger": "THIS_DIGIMON_LINKED",
                "isOncePerTurn": false,
                "isInherited": true,
                "condition": null,
                "cost": {
                    "type": "TRASH_HAND",
                    "amount": 1,
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "trait": "Appmon",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "DRAW",
                        "amount": 2
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "App Fusion",
            "Appmon",
            "Ecomon",
            "Gomimon",
            "Kabemon",
            "On Play",
            "Puzzlemon",
            "Security",
            "When Digivolving",
            "When Linking"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "form": "Sup./Appmon",
        "attribute": "Tool",
        "rarity": "C"
    },
    {
        "id": "BT25-039",
        "name": "Sirenmon",
        "type": "digimon",
        "level": 5,
        "playCost": 6,
        "digivolveCost": 4,
        "color": "Yellow",
        "colors": [
            "Yellow",
            "Green"
        ],
        "dp": 6000,
        "img": "/img/BT25-039.jpg",
        "mainEffect": "[Digivolve] Lv.4 w/[TS] trait: Cost 3\n{Security} [End of Your Turn] You may play 1 [Ceresmon] from your hand with the cost reduced by 7. If this effect played, you may place this card as the played Digimon's bottom digivolution card.\n[All Turns] When any of your other [Shaman] or [Iliad] trait Digimon or Tamers would leave the battle area other than by your effects, by deleting this Digimon, they don't leave.\n[On Deletion] You may place this card face up as the bottom security card.",
        "sourceEffect": "[Opponent's Turn] [Once Per Turn] When one of your opponent's Digimon attacks, you may change the attack target to 1 of your suspended Digimon.",
        "traits": "Shaman, Iliad, TS",
        "traitTokens": [
            "Shaman",
            "Iliad",
            "TS"
        ],
        "nameTokens": [
            "Sirenmon"
        ],
        "effectText": "[Digivolve] Lv.4 w/[TS] trait: Cost 3\n{Security} [End of Your Turn] You may play 1 [Ceresmon] from your hand with the cost reduced by 7. If this effect played, you may place this card as the played Digimon's bottom digivolution card.\n[All Turns] When any of your other [Shaman] or [Iliad] trait Digimon or Tamers would leave the battle area other than by your effects, by deleting this Digimon, they don't leave.\n[On Deletion] You may place this card face up as the bottom security card. [Opponent's Turn] [Once Per Turn] When one of your opponent's Digimon attacks, you may change the attack target to 1 of your suspended Digimon.",
        "searchText": "bt25-039 sirenmon yellow yellow green shaman, iliad, ts [digivolve] lv.4 w/[ts] trait: cost 3\n{security} [end of your turn] you may play 1 [ceresmon] from your hand with the cost reduced by 7. if this effect played, you may place this card as the played digimon's bottom digivolution card.\n[all turns] when any of your other [shaman] or [iliad] trait digimon or tamers would leave the battle area other than by your effects, by deleting this digimon, they don't leave.\n[on deletion] you may place this card face up as the bottom security card. [opponent's turn] [once per turn] when one of your opponent's digimon attacks, you may change the attack target to 1 of your suspended digimon.",
        "mechanics": [
            {
                "trigger": "END_OF_TURN",
                "isOncePerTurn": false,
                "isInherited": false,
                "securityOnly": true,
                "faceUpSecurity": true,
                "condition": {
                    "type": "HAS_SPECIFIC_CARD",
                    "name": "Ceresmon",
                    "owner": "own",
                    "zone": "hand"
                },
                "actions": [
                    {
                        "type": "PLAY_FROM_HAND",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "name": "Ceresmon",
                            "count": 1
                        },
                        "free": false,
                        "payCost": true,
                        "costReduction": 7
                    }
                ]
            },
            {
                "trigger": "WOULD_LEAVE_BATTLE_AREA",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": {
                    "type": "OR",
                    "conditions": [
                        {
                            "type": "EVENT_CONTEXT",
                            "key": "leavingCardTrait",
                            "value": "Shaman"
                        },
                        {
                            "type": "EVENT_CONTEXT",
                            "key": "leavingCardTrait",
                            "value": "Iliad"
                        }
                    ]
                },
                "cost": {
                    "type": "DELETE_OWN_DIGIMON_COST",
                    "self": true,
                    "ignoreLeaveReplacement": true
                },
                "actions": [
                    {
                        "type": "PREVENT_LEAVE_PLAY",
                        "target": {
                            "owner": "own",
                            "cardType": "any",
                            "traitAny": [
                                "Shaman",
                                "Iliad"
                            ],
                            "excludeSelf": true,
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "ON_DELETION",
                "isOncePerTurn": false,
                "isInherited": false,
                "actions": [
                    {
                        "type": "PLACE_THIS_CARD_AS_SECURITY",
                        "position": "bottom",
                        "faceUp": true
                    }
                ]
            },
            {
                "trigger": "OPPONENT_ATTACKED",
                "isOncePerTurn": true,
                "isInherited": true,
                "actions": [
                    {
                        "type": "CHANGE_ATTACK_TARGET",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "isSuspended": true,
                            "count": 1
                        }
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "All Turns",
            "Ceresmon",
            "Digivolve",
            "End of Your Turn",
            "Iliad",
            "On Deletion",
            "Once Per Turn",
            "Opponent's Turn",
            "Shaman",
            "TS"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "form": "Ultimate",
        "attribute": "Data",
        "rarity": "R"
    },
    {
        "id": "BT25-060",
        "name": "Rebootmon",
        "type": "digimon",
        "level": 6,
        "playCost": 12,
        "digivolveCost": 4,
        "color": "Green",
        "colors": [
            "Green",
            "White"
        ],
        "dp": 12000,
        "img": "/img/BT25-060.jpg",
        "mainEffect": "[App Fusion] [Bootmon] & [Shutmon]: Cost 0\nIf 2 such cards are linked together, stack the link card on top and digivolve.\n＜Security A. +1＞ ＜Reboot＞ ＜Link +1＞\n[When Digivolving] [When Attacking] [Once Per Turn] By linking 1 [Appmon] trait Digimon card from your hand or this Digimon's digivolution cards to this Digimon without paying the cost, 1 of your Digimon may unsuspend.\n[All Turns] [Once Per Turn] When this Digimon gets linked or unsuspends, until your turn ends, this Digimon gains ＜Piercing＞ and ＜Blocker＞, and your opponent's Digimon effects don't affect it.",
        "sourceEffect": "",
        "traits": "Reboot",
        "traitTokens": [
            "Reboot"
        ],
        "nameTokens": [
            "Rebootmon"
        ],
        "effectText": "[App Fusion] [Bootmon] & [Shutmon]: Cost 0\nIf 2 such cards are linked together, stack the link card on top and digivolve.\n＜Security A. +1＞ ＜Reboot＞ ＜Link +1＞\n[When Digivolving] [When Attacking] [Once Per Turn] By linking 1 [Appmon] trait Digimon card from your hand or this Digimon's digivolution cards to this Digimon without paying the cost, 1 of your Digimon may unsuspend.\n[All Turns] [Once Per Turn] When this Digimon gets linked or unsuspends, until your turn ends, this Digimon gains ＜Piercing＞ and ＜Blocker＞, and your opponent's Digimon effects don't affect it.",
        "searchText": "bt25-060 rebootmon green green white reboot [app fusion] [bootmon] & [shutmon]: cost 0\nif 2 such cards are linked together, stack the link card on top and digivolve.\n＜security a. +1＞ ＜reboot＞ ＜link +1＞\n[when digivolving] [when attacking] [once per turn] by linking 1 [appmon] trait digimon card from your hand or this digimon's digivolution cards to this digimon without paying the cost, 1 of your digimon may unsuspend.\n[all turns] [once per turn] when this digimon gets linked or unsuspends, until your turn ends, this digimon gains ＜piercing＞ and ＜blocker＞, and your opponent's digimon effects don't affect it.",
        "mechanics": [
            {
                "trigger": "WHEN_DIGIVOLVING",
                "isOncePerTurn": true,
                "isInherited": false,
                "actions": [
                    {
                        "type": "LINK_FROM_HAND",
                        "from": "hand_or_source",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "trait": "Appmon",
                            "count": 1
                        },
                        "attachToTarget": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        },
                        "sourceHostSelf": true,
                        "free": true,
                        "link": true,
                        "asLink": true
                    },
                    {
                        "type": "UNSUSPEND",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "WHEN_ATTACKING",
                "isOncePerTurn": true,
                "isInherited": false,
                "actions": [
                    {
                        "type": "LINK_FROM_HAND",
                        "from": "hand_or_source",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "trait": "Appmon",
                            "count": 1
                        },
                        "attachToTarget": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        },
                        "sourceHostSelf": true,
                        "free": true,
                        "link": true,
                        "asLink": true
                    },
                    {
                        "type": "UNSUSPEND",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "THIS_DIGIMON_LINKED",
                "isOncePerTurn": true,
                "isInherited": false,
                "actions": [
                    {
                        "type": "GRANT_KEYWORD",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        },
                        "buff": {
                            "keyword": "Piercing",
                            "duration": "END_OF_TURN"
                        }
                    },
                    {
                        "type": "GRANT_KEYWORD",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        },
                        "buff": {
                            "keyword": "Blocker",
                            "duration": "END_OF_TURN"
                        }
                    },
                    {
                        "type": "UNAFFECTED_BY_OPPONENT_EFFECTS",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        },
                        "sourceEffectType": "digimon",
                        "duration": "END_OF_TURN"
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "All Turns",
            "App Fusion",
            "Appmon",
            "Bootmon",
            "Once Per Turn",
            "Shutmon",
            "When Attacking",
            "When Digivolving"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "form": "God/Appmon",
        "attribute": "God",
        "rarity": "SR"
    },
    {
        "id": "BT25-076",
        "name": "Ghoulmon",
        "type": "digimon",
        "level": 6,
        "playCost": 12,
        "digivolveCost": 3,
        "color": "Black",
        "colors": [
            "Black"
        ],
        "dp": 12000,
        "img": "/img/BT25-076.jpg",
        "mainEffect": "When this card would be played, by deleting 1 of your play cost 11 or lower Digimon with [Negamon] in its digivolution cards and [Negamon] in its text, reduce the cost by the deleted Digimon's play cost.\n＜Rush＞ ＜Reboot＞ ＜Blocker＞\n[On Play] [When Attacking] [On Deletion] Delete 1 of your opponent's Digimon with the lowest play cost. If this effect didn't delete, trash your opponent's top security card.",
        "sourceEffect": "",
        "traits": "Demon Lord",
        "traitTokens": [
            "Demon Lord"
        ],
        "nameTokens": [
            "Ghoulmon"
        ],
        "effectText": "When this card would be played, by deleting 1 of your play cost 11 or lower Digimon with [Negamon] in its digivolution cards and [Negamon] in its text, reduce the cost by the deleted Digimon's play cost.\n＜Rush＞ ＜Reboot＞ ＜Blocker＞\n[On Play] [When Attacking] [On Deletion] Delete 1 of your opponent's Digimon with the lowest play cost. If this effect didn't delete, trash your opponent's top security card.",
        "searchText": "bt25-076 ghoulmon black black demon lord when this card would be played, by deleting 1 of your play cost 11 or lower digimon with [negamon] in its digivolution cards and [negamon] in its text, reduce the cost by the deleted digimon's play cost.\n＜rush＞ ＜reboot＞ ＜blocker＞\n[on play] [when attacking] [on deletion] delete 1 of your opponent's digimon with the lowest play cost. if this effect didn't delete, trash your opponent's top security card.",
        "mechanics": [
            {
                "trigger": "WOULD_BE_PLAYED",
                "isOncePerTurn": false,
                "isInherited": false,
                "cost": {
                    "type": "DELETE_OWN_DIGIMON_COST",
                    "amount": 1,
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "maxCost": 11,
                        "textContains": "Negamon",
                        "sourceTextContains": "Negamon",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "REDUCE_COST",
                        "amount": "DELETED_CARD_PLAY_COST"
                    }
                ]
            },
            {
                "trigger": "ON_PLAY",
                "isOncePerTurn": false,
                "isInherited": false,
                "actions": [
                    {
                        "type": "DELETE_DIGIMON",
                        "target": {
                            "owner": "opponent",
                            "cardType": "digimon",
                            "count": 1,
                            "selection": "lowest_play_cost"
                        }
                    },
                    {
                        "type": "TRASH_SECURITY_STACK",
                        "target": {
                            "owner": "opponent",
                            "count": 1
                        },
                        "condition": {
                            "type": "NOT_DELETED_BY_THIS_EFFECT"
                        }
                    }
                ]
            },
            {
                "trigger": "WHEN_ATTACKING",
                "isOncePerTurn": false,
                "isInherited": false,
                "actions": [
                    {
                        "type": "DELETE_DIGIMON",
                        "target": {
                            "owner": "opponent",
                            "cardType": "digimon",
                            "count": 1,
                            "selection": "lowest_play_cost"
                        }
                    },
                    {
                        "type": "TRASH_SECURITY_STACK",
                        "target": {
                            "owner": "opponent",
                            "count": 1
                        },
                        "condition": {
                            "type": "NOT_DELETED_BY_THIS_EFFECT"
                        }
                    }
                ]
            },
            {
                "trigger": "ON_DELETION",
                "isOncePerTurn": false,
                "isInherited": false,
                "actions": [
                    {
                        "type": "DELETE_DIGIMON",
                        "target": {
                            "owner": "opponent",
                            "cardType": "digimon",
                            "count": 1,
                            "selection": "lowest_play_cost"
                        }
                    },
                    {
                        "type": "TRASH_SECURITY_STACK",
                        "target": {
                            "owner": "opponent",
                            "count": 1
                        },
                        "condition": {
                            "type": "NOT_DELETED_BY_THIS_EFFECT"
                        }
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "Negamon",
            "On Deletion",
            "On Play",
            "When Attacking"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "form": "Mega",
        "attribute": "Data",
        "rarity": "R"
    },
    {
        "id": "BT25-088",
        "name": "Kyo Sawashiro",
        "type": "tamer",
        "level": null,
        "playCost": 4,
        "digivolveCost": 0,
        "color": "Yellow",
        "colors": [
            "Yellow"
        ],
        "dp": null,
        "img": "/img/BT25-088.jpg",
        "mainEffect": "[Start of Your Turn] If you have 2 or less memory, set it to 3.\n[All Turns] When your security stack is removed from, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.\n[Your Turn] [Once Per Turn] When you would play [Glowing Dawn] trait cards, by trashing the bottom face-down card from under any of your Tamers, reduce the cost by 1.",
        "sourceEffect": "[Security] Play this card without paying the cost.",
        "traits": "Glowing Dawn, BEATBREAK",
        "traitTokens": [
            "Glowing Dawn",
            "BEATBREAK"
        ],
        "nameTokens": [
            "Kyo Sawashiro"
        ],
        "effectText": "[Start of Your Turn] If you have 2 or less memory, set it to 3.\n[All Turns] When your security stack is removed from, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.\n[Your Turn] [Once Per Turn] When you would play [Glowing Dawn] trait cards, by trashing the bottom face-down card from under any of your Tamers, reduce the cost by 1. [Security] Play this card without paying the cost.",
        "searchText": "bt25-088 kyo sawashiro yellow yellow glowing dawn, beatbreak [start of your turn] if you have 2 or less memory, set it to 3.\n[all turns] when your security stack is removed from, by suspending this tamer, you may place the top 2 cards of your deck face down under this tamer.\n[your turn] [once per turn] when you would play [glowing dawn] trait cards, by trashing the bottom face-down card from under any of your tamers, reduce the cost by 1. [security] play this card without paying the cost.",
        "mechanics": [
            {
                "trigger": "START_OF_TURN",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": {
                    "type": "MEMORY_COUNT",
                    "operator": "<=",
                    "value": 2
                },
                "actions": [
                    {
                        "type": "SET_MEMORY",
                        "amount": 3
                    }
                ]
            },
            {
                "trigger": "SECURITY_REMOVED",
                "isOncePerTurn": false,
                "isInherited": false,
                "cost": {
                    "type": "SUSPEND",
                    "target": {
                        "owner": "own",
                        "cardType": "tamer",
                        "name": "Kyo Sawashiro",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "PLACE_SOURCE",
                        "amount": 2,
                        "from": "deck_top",
                        "faceDown": true,
                        "position": "bottom",
                        "target": {
                            "owner": "own",
                            "cardType": "any",
                            "count": 2
                        },
                        "attachToTarget": {
                            "owner": "own",
                            "cardType": "tamer",
                            "name": "Kyo Sawashiro",
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "WOULD_BE_PLAYED",
                "isOncePerTurn": true,
                "isInherited": false,
                "condition": {
                    "type": "HAS_TRAIT",
                    "trait": "Glowing Dawn"
                },
                "cost": {
                    "type": "TRASH_BOTTOM_TAMER_SOURCE_COST",
                    "amount": 1,
                    "faceDown": true,
                    "target": {
                        "owner": "own",
                        "cardType": "tamer",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "REDUCE_COST",
                        "amount": 1
                    }
                ]
            },
            {
                "trigger": "SECURITY",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "PLAY_FROM_SECURITY"
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "All Turns",
            "Glowing Dawn",
            "Once Per Turn",
            "Security",
            "Start of Your Turn",
            "Your Turn"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "rarity": "R"
    },
    {
        "id": "BT25-090",
        "name": "Tomoro Tenma",
        "type": "tamer",
        "level": null,
        "playCost": 4,
        "digivolveCost": 0,
        "color": "Green",
        "colors": [
            "Green"
        ],
        "dp": null,
        "img": "/img/BT25-090.jpg",
        "mainEffect": "[Start of Your Turn] If you have 2 or less memory, set it to 3.\n[All Turns] When any Digimon suspend, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.\n[Your Turn] [Once Per Turn] When you would use [Glowing Dawn] trait Option cards, by trashing the bottom face-down card from under any of your Tamers, reduce the cost by 1.",
        "sourceEffect": "[Security] Play this card without paying the cost.",
        "traits": "Glowing Dawn, BEATBREAK",
        "traitTokens": [
            "Glowing Dawn",
            "BEATBREAK"
        ],
        "nameTokens": [
            "Tomoro Tenma"
        ],
        "effectText": "[Start of Your Turn] If you have 2 or less memory, set it to 3.\n[All Turns] When any Digimon suspend, by suspending this Tamer, you may place the top 2 cards of your deck face down under this Tamer.\n[Your Turn] [Once Per Turn] When you would use [Glowing Dawn] trait Option cards, by trashing the bottom face-down card from under any of your Tamers, reduce the cost by 1. [Security] Play this card without paying the cost.",
        "searchText": "bt25-090 tomoro tenma green green glowing dawn, beatbreak [start of your turn] if you have 2 or less memory, set it to 3.\n[all turns] when any digimon suspend, by suspending this tamer, you may place the top 2 cards of your deck face down under this tamer.\n[your turn] [once per turn] when you would use [glowing dawn] trait option cards, by trashing the bottom face-down card from under any of your tamers, reduce the cost by 1. [security] play this card without paying the cost.",
        "mechanics": [
            {
                "trigger": "START_OF_TURN",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": {
                    "type": "MEMORY_COUNT",
                    "operator": "<=",
                    "value": 2
                },
                "actions": [
                    {
                        "type": "SET_MEMORY",
                        "amount": 3
                    }
                ]
            },
            {
                "trigger": "DIGIMON_SUSPENDED",
                "isOncePerTurn": false,
                "isInherited": false,
                "cost": {
                    "type": "SUSPEND",
                    "target": {
                        "owner": "own",
                        "cardType": "tamer",
                        "name": "Tomoro Tenma",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "PLACE_SOURCE",
                        "amount": 2,
                        "from": "deck_top",
                        "faceDown": true,
                        "position": "bottom",
                        "target": {
                            "owner": "own",
                            "cardType": "any",
                            "count": 2
                        },
                        "attachToTarget": {
                            "owner": "own",
                            "cardType": "tamer",
                            "name": "Tomoro Tenma",
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "OPTION_USED",
                "isOncePerTurn": true,
                "isInherited": false,
                "condition": {
                    "type": "EVENT_CONTEXT",
                    "key": "trait",
                    "value": "Glowing Dawn"
                },
                "cost": {
                    "type": "TRASH_BOTTOM_TAMER_SOURCE_COST",
                    "amount": 1,
                    "faceDown": true,
                    "target": {
                        "owner": "own",
                        "cardType": "tamer",
                        "count": 1
                    }
                },
                "actions": [
                    {
                        "type": "REDUCE_COST",
                        "amount": 1
                    }
                ],
                "_round22dc_note": "Fallback valid trigger for current engine; true would-use option cost-reduction runtime should be a future dedicated repair if needed."
            },
            {
                "trigger": "SECURITY",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "PLAY_FROM_SECURITY"
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "All Turns",
            "Glowing Dawn",
            "Once Per Turn",
            "Security",
            "Start of Your Turn",
            "Your Turn"
        ],
        "_round22dc": {
            "officialBt25Patch": "Added from official BT25 cardlist because third-party feed/local card pool missed this card."
        },
        "rarity": "R"
    }
];

// Round 22DH: official Token cardlist overlay. Bandai publishes Token entries
// as cardlist records; third-party feeds may omit them because they are not
// legal deck cards. Keep them in cards.json for search/card-pool parity while
// marking them isToken/cardKind token so deck validation can reject them.
const OFFICIAL_TOKEN_CARD_PATCHES = [
    {
        "id": "TOKEN",
        "name": "Diaboromon",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": 6,
        "playCost": 14,
        "digivolveCost": null,
        "color": "White",
        "colors": [
            "White"
        ],
        "dp": 3000,
        "img": "/img/TOKEN.jpg",
        "mainEffect": "■This card can be used as a [Diaboromon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
        "sourceEffect": "",
        "traits": "Unknown, Unidentified",
        "traitTokens": [
            "Unknown",
            "Unidentified"
        ],
        "nameTokens": [
            "Diaboromon"
        ],
        "keywords": [],
        "effectText": "■This card can be used as a [Diaboromon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
        "searchText": "token diaboromon white unknown, unidentified ■this card can be used as a [diaboromon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            }
        ],
        "effectBracketTokens": [
            "Diaboromon"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
    {
        "id": "BT22-TOKEN",
        "name": "Familiar",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": null,
        "playCost": null,
        "digivolveCost": null,
        "color": "Yellow",
        "colors": [
            "Yellow"
        ],
        "dp": 3000,
        "img": "/img/BT22-TOKEN.jpg",
        "mainEffect": "■This card can be used as a [Familiar] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[On Deletion] 1 of your opponent's Digimon gets -3000 DP for the turn.",
        "sourceEffect": "",
        "traits": "",
        "traitTokens": [],
        "nameTokens": [
            "Familiar"
        ],
        "keywords": [],
        "effectText": "■This card can be used as a [Familiar] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[On Deletion] 1 of your opponent's Digimon gets -3000 DP for the turn.",
        "searchText": "bt22-token familiar yellow  ■this card can be used as a [familiar] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n[on deletion] 1 of your opponent's digimon gets -3000 dp for the turn.",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            },
            {
                "trigger": "ON_DELETION",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "DP_MOD",
                        "amount": -3000,
                        "target": {
                            "owner": "opponent",
                            "cardType": "digimon",
                            "count": 1
                        },
                        "duration": "END_OF_TURN"
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "Familiar",
            "On Deletion"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
    {
        "id": "BT23-TOKEN",
        "name": "Atho, René & Por",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": null,
        "playCost": null,
        "digivolveCost": null,
        "color": "White",
        "colors": [
            "White"
        ],
        "dp": 6000,
        "img": "/img/BT23-TOKEN.jpg",
        "mainEffect": "■This card can be used as an [Atho, René & Por] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Reboot＞ ＜Blocker＞ ＜Decoy (Red)/(Black)＞",
        "sourceEffect": "",
        "traits": "",
        "traitTokens": [],
        "nameTokens": [
            "Atho, René & Por"
        ],
        "keywords": [
            "Reboot",
            "Blocker",
            "Decoy (Red)/(Black)"
        ],
        "effectText": "■This card can be used as an [Atho, René & Por] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Reboot＞ ＜Blocker＞ ＜Decoy (Red)/(Black)＞",
        "searchText": "bt23-token atho, rené & por white  ■this card can be used as an [atho, rené & por] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜reboot＞ ＜blocker＞ ＜decoy (red)/(black)＞",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            }
        ],
        "effectBracketTokens": [
            "Atho, René & Por"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
    {
        "id": "BT24-TOKEN",
        "name": "Petrification",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": null,
        "playCost": null,
        "digivolveCost": null,
        "color": "White",
        "colors": [
            "White"
        ],
        "dp": 3000,
        "img": "/img/BT24-TOKEN.jpg",
        "mainEffect": "■This card can be used as a [Petrification] token.\n■Token cards can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[Your Turn] This Digimon can't suspend.\n[On Deletion] Trash your top security card.",
        "sourceEffect": "",
        "traits": "",
        "traitTokens": [],
        "nameTokens": [
            "Petrification"
        ],
        "keywords": [],
        "effectText": "■This card can be used as a [Petrification] token.\n■Token cards can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[Your Turn] This Digimon can't suspend.\n[On Deletion] Trash your top security card.",
        "searchText": "bt24-token petrification white  ■this card can be used as a [petrification] token.\n■token cards can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n[your turn] this digimon can't suspend.\n[on deletion] trash your top security card.",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            },
            {
                "trigger": "YOUR_TURN",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_SUSPEND",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ]
            },
            {
                "trigger": "ON_DELETION",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "TRASH_SECURITY_STACK",
                        "amount": 1,
                        "position": "top",
                        "target": {
                            "owner": "own",
                            "cardType": "security",
                            "count": 1
                        }
                    }
                ]
            }
        ],
        "effectBracketTokens": [
            "Petrification",
            "Your Turn",
            "On Deletion"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
    {
        "id": "ST22-TOKEN01",
        "name": "Pipe Fox",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": null,
        "playCost": null,
        "digivolveCost": null,
        "color": "Yellow",
        "colors": [
            "Yellow"
        ],
        "dp": 6000,
        "img": "/img/ST22-TOKEN01.jpg",
        "mainEffect": "■This card can be used as a [Pipe Fox] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞",
        "sourceEffect": "",
        "traits": "",
        "traitTokens": [],
        "nameTokens": [
            "Pipe Fox"
        ],
        "keywords": [
            "Blocker"
        ],
        "effectText": "■This card can be used as a [Pipe Fox] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞",
        "searchText": "st22-token01 pipe fox yellow  ■this card can be used as a [pipe fox] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜blocker＞",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            }
        ],
        "effectBracketTokens": [
            "Pipe Fox"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
    {
        "id": "ST22-TOKEN02",
        "name": "Uka no Mitama",
        "type": "digimon",
        "cardKind": "token",
        "isToken": true,
        "level": null,
        "playCost": null,
        "digivolveCost": null,
        "color": "Yellow",
        "colors": [
            "Yellow"
        ],
        "dp": 9000,
        "img": "/img/ST22-TOKEN02.jpg",
        "mainEffect": "■This card can be used as an [Uka no Mitama] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Rush＞",
        "sourceEffect": "",
        "traits": "",
        "traitTokens": [],
        "nameTokens": [
            "Uka no Mitama"
        ],
        "keywords": [
            "Rush"
        ],
        "effectText": "■This card can be used as an [Uka no Mitama] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Rush＞",
        "searchText": "st22-token02 uka no mitama yellow  ■this card can be used as an [uka no mitama] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜rush＞",
        "mechanics": [
            {
                "trigger": "ALL_TURNS",
                "isOncePerTurn": false,
                "isInherited": false,
                "condition": null,
                "cost": null,
                "actions": [
                    {
                        "type": "CANT_DIGIVOLVE",
                        "target": {
                            "owner": "own",
                            "cardType": "digimon",
                            "self": true,
                            "count": 1
                        }
                    }
                ],
                "_round22dh": "Token cards cannot digivolve by official Token rules."
            }
        ],
        "effectBracketTokens": [
            "Uka no Mitama"
        ],
        "_round22dh": {
            "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
        }
    },
{
    "id": "TOKEN-03",
    "name": "Amon of Crimson Flame",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Red",
    "colors": [
        "Red"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-03.jpg",
    "mainEffect": "■This card can be used as an [Amon of Crimson Flame] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Rush＞",
    "sourceEffect": "",
    "traits": "Amon of Crimson Flame",
    "traitTokens": [
        "Amon of Crimson Flame"
    ],
    "nameTokens": [
        "Amon of Crimson Flame"
    ],
    "keywords": [
        "Rush"
    ],
    "effectText": "■This card can be used as an [Amon of Crimson Flame] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Rush＞",
    "searchText": "token-03 amon of crimson flame red amon of crimson flame ■this card can be used as an [amon of crimson flame] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜rush＞",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Amon of Crimson Flame"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_03.pdf?v=20260424; cropped runtime image path /img/TOKEN-03.jpg"
    }
},
{
    "id": "TOKEN-04",
    "name": "Umon of Blue Thunder",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Yellow",
    "colors": [
        "Yellow"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-04.jpg",
    "mainEffect": "■This card can be used as an [Umon of Blue Thunder] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞",
    "sourceEffect": "",
    "traits": "Umon of Blue Thunder",
    "traitTokens": [
        "Umon of Blue Thunder"
    ],
    "nameTokens": [
        "Umon of Blue Thunder"
    ],
    "keywords": [
        "Blocker"
    ],
    "effectText": "■This card can be used as an [Umon of Blue Thunder] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞",
    "searchText": "token-04 umon of blue thunder yellow umon of blue thunder ■this card can be used as an [umon of blue thunder] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜blocker＞",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Umon of Blue Thunder"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_04.pdf?v=20260424; cropped runtime image path /img/TOKEN-04.jpg"
    }
},
{
    "id": "TOKEN-05",
    "name": "Gyuukimon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": 5,
    "playCost": 7,
    "digivolveCost": null,
    "color": "Purple",
    "colors": [
        "Purple"
    ],
    "dp": 3000,
    "img": "/img/TOKEN-05.jpg",
    "mainEffect": "■This card can be used as a [Gyuukimon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "sourceEffect": "",
    "traits": "Ultimate, Virus, Dark Animal",
    "traitTokens": [
        "Ultimate",
        "Virus",
        "Dark Animal"
    ],
    "nameTokens": [
        "Gyuukimon"
    ],
    "keywords": [],
    "effectText": "■This card can be used as a [Gyuukimon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "searchText": "token-05 gyuukimon purple ultimate, virus, dark animal ■this card can be used as a [gyuukimon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Gyuukimon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_05.pdf?v=20260424; cropped runtime image path /img/TOKEN-05.jpg"
    }
},
{
    "id": "TOKEN-06",
    "name": "Fujitsumon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Purple",
    "colors": [
        "Purple"
    ],
    "dp": 3000,
    "img": "/img/TOKEN-06.jpg",
    "mainEffect": "■This card can be used as a [Fujitsumon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[All Turns] This Digimon can't unsuspend.\n[On Deletion] Trash 1 card in your hand.",
    "sourceEffect": "",
    "traits": "Fujitsumon",
    "traitTokens": [
        "Fujitsumon"
    ],
    "nameTokens": [
        "Fujitsumon"
    ],
    "keywords": [],
    "effectText": "■This card can be used as a [Fujitsumon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n[All Turns] This Digimon can't unsuspend.\n[On Deletion] Trash 1 card in your hand.",
    "searchText": "token-06 fujitsumon purple fujitsumon ■this card can be used as a [fujitsumon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n[all turns] this digimon can't unsuspend.\n[on deletion] trash 1 card in your hand.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        },
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_UNSUSPEND",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ]
        },
        {
            "trigger": "ON_DELETION",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "TRASH_HAND",
                    "amount": 1,
                    "target": {
                        "owner": "own",
                        "count": 1
                    }
                }
            ]
        }
    ],
    "effectBracketTokens": [
        "Fujitsumon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_06.pdf?v=20260424; cropped runtime image path /img/TOKEN-06.jpg"
    }
},
{
    "id": "TOKEN-07",
    "name": "KoHagurumon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Black",
    "colors": [
        "Black"
    ],
    "dp": 1000,
    "img": "/img/TOKEN-07.jpg",
    "mainEffect": "■This card can be used as a [KoHagurumon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞ ＜Decoy (Black)＞\n[Your Turn] This Digimon can't attack.",
    "sourceEffect": "",
    "traits": "KoHagurumon",
    "traitTokens": [
        "KoHagurumon"
    ],
    "nameTokens": [
        "KoHagurumon"
    ],
    "keywords": [
        "Blocker",
        "Decoy (Black)"
    ],
    "effectText": "■This card can be used as a [KoHagurumon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞ ＜Decoy (Black)＞\n[Your Turn] This Digimon can't attack.",
    "searchText": "token-07 kohagurumon black kohagurumon ■this card can be used as a [kohagurumon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜blocker＞ ＜decoy (black)＞\n[your turn] this digimon can't attack.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        },
        {
            "trigger": "YOUR_TURN",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_ATTACK",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ]
        }
    ],
    "effectBracketTokens": [
        "KoHagurumon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_07.pdf?v=20260424; cropped runtime image path /img/TOKEN-07.jpg"
    }
},
{
    "id": "TOKEN-09",
    "name": "Volée & Zerdrücken",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": 4,
    "playCost": null,
    "digivolveCost": null,
    "color": "Purple",
    "colors": [
        "Purple"
    ],
    "dp": 5000,
    "img": "/img/TOKEN-09.jpg",
    "mainEffect": "■This card can be used as a [Volée & Zerdrücken] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞ ＜Retaliation＞",
    "sourceEffect": "",
    "traits": "Volée & Zerdrücken",
    "traitTokens": [
        "Volée & Zerdrücken"
    ],
    "nameTokens": [
        "Volée & Zerdrücken"
    ],
    "keywords": [
        "Blocker",
        "Retaliation"
    ],
    "effectText": "■This card can be used as a [Volée & Zerdrücken] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Blocker＞ ＜Retaliation＞",
    "searchText": "token-09 volée & zerdrücken purple volée & zerdrücken ■this card can be used as a [volée & zerdrücken] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜blocker＞ ＜retaliation＞",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Volée & Zerdrücken"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_09.pdf?v=20260424; cropped runtime image path /img/TOKEN-09.jpg"
    }
},
{
    "id": "TOKEN-11",
    "name": "WarGrowlmon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Red",
    "colors": [
        "Red"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-11.jpg",
    "mainEffect": "■This card can be used as a [WarGrowlmon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "sourceEffect": "",
    "traits": "WarGrowlmon",
    "traitTokens": [
        "WarGrowlmon"
    ],
    "nameTokens": [
        "WarGrowlmon"
    ],
    "keywords": [],
    "effectText": "■This card can be used as a [WarGrowlmon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "searchText": "token-11 wargrowlmon red wargrowlmon ■this card can be used as a [wargrowlmon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "WarGrowlmon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_11.pdf?v=20260424; cropped runtime image path /img/TOKEN-11.jpg"
    }
},
{
    "id": "TOKEN-12",
    "name": "Taomon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Yellow",
    "colors": [
        "Yellow"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-12.jpg",
    "mainEffect": "■This card can be used as a [Taomon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "sourceEffect": "",
    "traits": "Taomon",
    "traitTokens": [
        "Taomon"
    ],
    "nameTokens": [
        "Taomon"
    ],
    "keywords": [],
    "effectText": "■This card can be used as a [Taomon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "searchText": "token-12 taomon yellow taomon ■this card can be used as a [taomon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Taomon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_12.pdf?v=20260424; cropped runtime image path /img/TOKEN-12.jpg"
    }
},
{
    "id": "TOKEN-13",
    "name": "Rapidmon",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "Green",
    "colors": [
        "Green"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-13.jpg",
    "mainEffect": "■This card can be used as a [Rapidmon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "sourceEffect": "",
    "traits": "Rapidmon",
    "traitTokens": [
        "Rapidmon"
    ],
    "nameTokens": [
        "Rapidmon"
    ],
    "keywords": [],
    "effectText": "■This card can be used as a [Rapidmon] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.",
    "searchText": "token-13 rapidmon green rapidmon ■this card can be used as a [rapidmon] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Rapidmon"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_13.pdf?v=20260424; cropped runtime image path /img/TOKEN-13.jpg"
    }
},
{
    "id": "TOKEN-17",
    "name": "Hinukamuy",
    "type": "digimon",
    "cardKind": "token",
    "isToken": true,
    "level": null,
    "playCost": null,
    "digivolveCost": null,
    "color": "White",
    "colors": [
        "White"
    ],
    "dp": 6000,
    "img": "/img/TOKEN-17.jpg",
    "mainEffect": "■This card can be used as a [Hinukamuy] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Alliance＞ ＜Reboot＞ ＜Blocker＞",
    "sourceEffect": "",
    "traits": "Hinukamuy",
    "traitTokens": [
        "Hinukamuy"
    ],
    "nameTokens": [
        "Hinukamuy"
    ],
    "keywords": [
        "Alliance",
        "Reboot",
        "Blocker"
    ],
    "effectText": "■This card can be used as a [Hinukamuy] token.\n■Tokens can't be put in decks or Digi-Egg decks.\n■Tokens can't digivolve.\n■Cards can't be placed under tokens.\n■When a token would leave the field, it's removed from the game.\n＜Alliance＞ ＜Reboot＞ ＜Blocker＞",
    "searchText": "token-17 hinukamuy white hinukamuy ■this card can be used as a [hinukamuy] token.\n■tokens can't be put in decks or digi-egg decks.\n■tokens can't digivolve.\n■cards can't be placed under tokens.\n■when a token would leave the field, it's removed from the game.\n＜alliance＞ ＜reboot＞ ＜blocker＞",
    "mechanics": [
        {
            "trigger": "ALL_TURNS",
            "isOncePerTurn": false,
            "isInherited": false,
            "condition": null,
            "cost": null,
            "actions": [
                {
                    "type": "CANT_DIGIVOLVE",
                    "target": {
                        "owner": "own",
                        "cardType": "digimon",
                        "self": true,
                        "count": 1
                    }
                }
            ],
            "_round22dh": "Token cards cannot digivolve by official Token rules."
        }
    ],
    "effectBracketTokens": [
        "Hinukamuy"
    ],
    "_round22dh": {
        "officialTokenCardPoolPatch": "Added as an official Token cardlist record; marked isToken/cardKind token so it is searchable but not legal deck material."
    },
    "_round22eb": {
        "officialNamedTokenAssetPatch": "Added because the official Rule page exposes this named Token PDF/asset, while runtime PLAY_TOKEN effects already reference it."
    },
    "_round22di": {
        "officialTokenImage": "Official Token image source: https://world.digimoncard.com/rule/pdf/token/token_17.pdf?v=20260424; cropped runtime image path /img/TOKEN-17.jpg"
    }
}
];

function applyOfficialCardPoolOverlay(localDatabase, oldMap = new Map()) {
    const byId = new Map((localDatabase || []).map(card => [card.id, card]));
    for (const patch of [...OFFICIAL_BT25_CARD_PATCHES, ...OFFICIAL_TOKEN_CARD_PATCHES]) {
        const old = oldMap.get(patch.id) || {};
        const current = byId.get(patch.id) || {};
        byId.set(patch.id, {
            ...patch,
            ...current,
            // Keep the official patch text/metadata as source of truth for cards
            // that the third-party API does not yet provide or provides partially.
            id: patch.id,
            cardKind: patch.cardKind || current.cardKind || old.cardKind || null,
            isToken: patch.isToken === true || current.isToken === true || old.isToken === true,
            keywords: Array.isArray(patch.keywords) ? patch.keywords : (current.keywords || old.keywords || []),
            img: patch.img || current.img || old.img || `/img/${getCardImageFileName(patch.id)}`,
            mainEffect: patch.mainEffect || current.mainEffect || old.mainEffect || '',
            sourceEffect: patch.sourceEffect || current.sourceEffect || old.sourceEffect || '',
            traits: patch.traits || current.traits || old.traits || '',
            traitTokens: Array.isArray(patch.traitTokens) ? patch.traitTokens : (current.traitTokens || old.traitTokens || []),
            effectBracketTokens: Array.isArray(patch.effectBracketTokens) ? patch.effectBracketTokens : (current.effectBracketTokens || old.effectBracketTokens || []),
            nameTokens: Array.isArray(patch.nameTokens) ? patch.nameTokens : (current.nameTokens || old.nameTokens || [patch.name]),
            mechanics: Array.isArray(patch.mechanics) && patch.mechanics.length ? patch.mechanics : (Array.isArray(current.mechanics) ? current.mechanics : (Array.isArray(old.mechanics) ? old.mechanics : [])),
            _round22dc: patch._round22dc || current._round22dc || old._round22dc || null,
            _round22dd: patch.isToken === true ? (current._round22dd || old._round22dd || null) : {
                officialBt25OverlayImage: `Run node fetch-cards.js --official-bt25-images-only to pull /img/${getCardImageFileName(patch.id)}.`
            },
            _round22di: patch.isToken === true ? {
                officialTokenImage: `Official Token image source: ${getOfficialTokenImagePdfUrl(patch.id)}; cropped runtime image path /img/${getCardImageFileName(patch.id)}.`
            } : (current._round22di || old._round22di || null)
        });
    }
    return Array.from(byId.values());
}

function getOfficialBt25OverlayImageIds() {
    return OFFICIAL_BT25_CARD_PATCHES.map(card => card.id);
}

async function ensureOfficialBt25OverlayImages(options = {}) {
    const ids = Array.isArray(options.ids) && options.ids.length
        ? options.ids
        : getOfficialBt25OverlayImageIds();
    const results = [];

    for (const id of ids) {
        const filePath = getOfficialBt25OverlayImagePath(id);
        const url = getOfficialBt25OverlayImageUrl(id);
        if (hasUsableImageFile(filePath)) {
            results.push({ id, status: 'exists', filePath, url });
            continue;
        }
        if (options.dryRun) {
            results.push({ id, status: 'missing', filePath, url });
            continue;
        }
        await downloadImage(url, filePath);
        results.push({
            id,
            status: hasUsableImageFile(filePath) ? 'downloaded' : 'failed',
            filePath,
            url
        });
    }

    return results;
}

async function runOfficialBt25ImagesOnly() {
    console.log('🖼️ Round 22DD: pulling official BT25 overlay card images only...');
    const results = await ensureOfficialBt25OverlayImages();
    for (const row of results) {
        const icon = row.status === 'downloaded' || row.status === 'exists' ? '✅' : '⚠️';
        console.log(`${icon} ${row.id}: ${row.status} → ${path.relative(__dirname, row.filePath)}`);
    }
    const failed = results.filter(row => row.status === 'failed');
    if (failed.length) {
        console.log(`⚠️ ${failed.length} official overlay image(s) failed to download. You can manually place them in /img with the card id filename.`);
    }
}

async function start() {
    console.log("🚀 正在抓取 Digimon TCG 卡牌数据（保留 mechanics + 增强资料版）...");

    const oldCards = fs.existsSync(CARDS_FILE)
        ? JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'))
        : [];

    const oldMap = new Map(oldCards.map(card => [card.id, card]));

    try {
        const res = await axios.get(
            'https://digimoncard.io/api-public/search.php?n=&series=Digimon%20Card%20Game',
            { timeout: 30000 }
        );

        const cards = res.data;
        const seen = new Set();
        const localDatabase = [];

        for (const card of cards) {
            const rawId = card.cardnumber || card.id;
            if (!rawId || seen.has(rawId)) continue;

            seen.add(rawId);

            const old = oldMap.get(rawId) || {};

            const safeId = rawId.replace(/\//g, '-');
            const fileName = `${safeId}.jpg`;
            const filePath = path.join(IMG_DIR, fileName);

            const remoteUrl = card.image_url || `https://images.digimoncard.io/images/cards/${rawId}.jpg`;

            if (!fs.existsSync(filePath)) {
                try {
                    await downloadImage(remoteUrl, filePath);
                } catch (e) {}
            }

            const mainEffect = card.main_effect || old.mainEffect || "";
            const sourceEffect = card.source_effect || old.sourceEffect || "";
            const colors = normalizeColor(card);
            const optionColors = normalizeOptionColors(card, old);
            const optionTraitTokens = normalizeOptionTraits(card, old);
            const traitTokens = buildTraitTokens(card);
            const effectBracketTokens = buildEffectBracketTokens(card);
            const nameTokens = extractNameTokens(card.name || old.name || "");

            const enrichedCard = {
                id: rawId,
                name: card.name || old.name || "",
                type: String(card.type || old.type || 'unknown').toLowerCase(),
                level: card.level || old.level || null,
                playCost: card.play_cost ?? old.playCost ?? 0,
                digivolveCost: card.evolution_cost ?? old.digivolveCost ?? 0,
                color: colors[0] || old.color || null,
                colors,
                dp: card.dp || old.dp || null,
                img: `/img/${fileName}`,

                mainEffect,
                sourceEffect,

                // 旧字段保留，但更完整
                traits: traitTokens.join(", "),

                // 新字段：给引擎用
                traitTokens,
                optionColors,
                dualOptionColors: optionColors,
                optionTraitTokens,
                dualOptionTraitTokens: optionTraitTokens,
                effectBracketTokens,
                nameTokens,
                effectText: `${mainEffect} ${sourceEffect}`.trim(),
                searchText: [
                    rawId,
                    card.name || old.name || "",
                    colors.join(" "),
                    traitTokens.join(" "),
                    mainEffect,
                    sourceEffect
                ].join(" ").toLowerCase(),

                // 关键：保留你已经修好的 mechanics 与规则层元数据
                mechanics: Array.isArray(old.mechanics) ? old.mechanics : [],
                overflow: old.overflow ?? null
            };

            applyOfficialColorMetadataPatch(rawId, enrichedCard);
            applyOfficialErrataMetadataPatch(rawId, enrichedCard);

            localDatabase.push(enrichedCard);
        }

        const backupPath = path.join(__dirname, `cards_backup_before_fetch_${Date.now()}.json`);
        if (fs.existsSync(CARDS_FILE)) {
            fs.writeFileSync(backupPath, JSON.stringify(oldCards, null, 2));
            console.log(`✅ 已备份旧 cards.json → ${backupPath}`);
        }

        const finalDatabase = applyOfficialCardPoolOverlay(localDatabase, oldMap);
        fs.writeFileSync(CARDS_FILE, JSON.stringify(finalDatabase, null, 2));
        const overlayImageResults = await ensureOfficialBt25OverlayImages();
        const overlayImagesReady = overlayImageResults.filter(row => row.status === 'exists' || row.status === 'downloaded').length;
        const tokenImageResults = await ensureOfficialTokenImages();
        const tokenImagesReady = tokenImageResults.filter(row => row.status === 'exists' || row.status === 'rendered').length;

        console.log(`✨ 完成！共保存 ${finalDatabase.length} 张唯一卡`);
        console.log(`🖼️ Round 22DD 官方 BT25 overlay 图片：${overlayImagesReady}/${overlayImageResults.length} ready`);
        console.log(`🖼️ Round 22DI 官方 Token 图片：${tokenImagesReady}/${tokenImageResults.length} ready`);
        console.log("✅ 已保留旧 mechanics，并增强 traits / colors / tokens / searchText");

    } catch (error) {
        console.error("❌ 抓取失败:", error.message);
    }
}

if (require.main === module) {
    const args = new Set(process.argv.slice(2));
    if (args.has('--official-bt25-images-only') || args.has('--overlay-images-only')) {
        runOfficialBt25ImagesOnly().catch(error => {
            console.error('❌ 官方 BT25 overlay 图片拉取失败:', error.message);
            process.exitCode = 1;
        });
    } else if (args.has('--official-token-images-only') || args.has('--token-images-only')) {
        runOfficialTokenImagesOnly().catch(error => {
            console.error('❌ 官方 Token 图片拉取失败:', error.message);
            process.exitCode = 1;
        });
    } else {
        start().catch(error => {
            console.error('❌ 抓取失败:', error.message);
            process.exitCode = 1;
        });
    }
}

module.exports = {
    OFFICIAL_COLOR_TOKENS,
    normalizeColorTokensFromString,
    normalizeColorList,
    OFFICIAL_COLOR_METADATA_PATCHES,
    applyOfficialColorMetadataPatch,
    applyOfficialErrataMetadataPatch,
    OFFICIAL_BT25_CARD_PATCHES,
    OFFICIAL_TOKEN_CARD_PATCHES,
    applyOfficialCardPoolOverlay,
    getOfficialBt25OverlayImageIds,
    getOfficialBt25OverlayImageUrl,
    getOfficialBt25OverlayImagePath,
    ensureOfficialBt25OverlayImages,
    runOfficialBt25ImagesOnly,
    OFFICIAL_TOKEN_IMAGE_PDF_SOURCES,
    getOfficialTokenImageIds,
    getOfficialTokenImagePath,
    getOfficialTokenImagePdfUrl,
    getOfficialTokenImagePdfPath,
    ensureOfficialTokenImages,
    runOfficialTokenImagesOnly
};
