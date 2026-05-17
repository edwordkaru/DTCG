#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = __dirname;
const CARDS_FILE = path.join(ROOT, 'cards.json');
const OUT_JSON = path.join(ROOT, 'official-diff-audit-report.json');
const OUT_MD = path.join(ROOT, 'official-diff-audit-report.md');

const OFFICIAL_RULE_SOURCES = [
  {
    name: 'Rule page',
    url: 'https://en.digimoncard.com/rule/',
    baseline: 'Official Rule Manual ver.6.0 / Comprehensive Rules ver.4.0 listed 2026-04-01'
  },
  {
    name: 'Effective Rule Revisions',
    url: 'https://world.digimoncard.com/rule/revised/',
    baseline: 'CRM 4.0 & Official Rule Manual 6.0 revisions, 2026-04-17'
  },
  {
    name: 'Token rules',
    url: 'https://en.digimoncard.com/rule/token-card/',
    baseline: 'Basic Rules of Token Cards, 2026-05-08'
  },
  {
    name: 'Official card list',
    url: 'https://world.digimoncard.com/cardlist/',
    baseline: 'Global English card list HTML'
  }
];

const LATEST_CATEGORY_LIMIT = Number(process.env.OFFICIAL_CATEGORY_LIMIT || 9);
const STATIC_FILES = [
  'game-state.js',
  'server.js',
  'tournament-admin.js',
  'deck-builder.html',
  'fetch-cards.js',
  'audit-mechanics.js',
  'meta-match-sim.js',
  'official-report-writer.js'
];

function textOf(html = '') {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|dd|dt|li|dl|ul|h\d)>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(value = '') {
  return textOf(value).replace(/\s+/g, ' ').trim();
}

function normalize(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[＜]/g, '<')
    .replace(/[＞]/g, '>')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeColors(colors) {
  const arr = Array.isArray(colors) ? colors : String(colors || '').split(/[,\s/|]+/);
  const known = ['Red', 'Blue', 'Yellow', 'Green', 'Black', 'Purple', 'White'];
  const out = [];
  for (const color of arr) {
    const hit = known.find(k => k.toLowerCase() === String(color || '').trim().toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const m = String(value).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function getFirstMatch(text, re) {
  const m = String(text || '').match(re);
  return m ? oneLine(m[1]) : null;
}

async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 45000,
    responseType: 'text',
    headers: {
      'User-Agent': 'DTCG official-diff-audit/1.0'
    }
  });
  return String(res.data || '');
}

function parseCategoryOptions(html) {
  const options = [];
  for (const m of html.matchAll(/<option[^>]*value=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/option>/gi)) {
    if (!/^\d+$/.test(m[1])) continue;
    const label = oneLine(m[2]);
    if (!label || /^(Rarity|Card type|Lv\.|Color|Form|Attribute|Type|Keyword effect|Alternative Art)$/i.test(label)) continue;
    if (!options.some(o => o.id === m[1])) options.push({ id: m[1], label });
  }
  return options;
}

function parseCardBlocks(html) {
  const blocks = [];
  const re = /<div class="popupCol" id="([^"]+)">([\s\S]*?)(?=<li class="image_lists_item|\s*<\/ul>\s*<\/div>)/gi;
  for (const m of html.matchAll(re)) {
    const id = m[1].trim();
    if (/^Q\d+/.test(id)) continue;
    if (!/^[A-Z]+\d*-/.test(id) && !/TOKEN/i.test(id)) continue;
    blocks.push({ id, html: m[2] });
  }
  return blocks;
}

function parseInfoField(blockHtml, label) {
  const re = new RegExp(`<dt class="cardInfoTit">${label}<\\/dt>\\s*<dd class="cardInfoData[^"]*">([\\s\\S]*?)<\\/dd>`, 'i');
  return getFirstMatch(blockHtml, re);
}

function parseOfficialCard(block) {
  const h = block.html;
  const card = {
    imageId: block.id,
    id: canonicalCardId(block.id),
    rarity: getFirstMatch(h, /<li class="cardRarity">\s*([\s\S]*?)\s*<\/li>/i),
    type: getFirstMatch(h, /<li class="cardType">\s*([\s\S]*?)\s*<\/li>/i),
    level: asNumber(getFirstMatch(h, /<li class="cardLv">\s*Lv\.?([\s\S]*?)\s*<\/li>/i)),
    name: getFirstMatch(h, /<div class="cardTitle">\s*([\s\S]*?)\s*<\/div>/i),
    colorText: parseInfoField(h, 'Color'),
    playCost: asNumber(parseInfoField(h, 'Cost')),
    dp: asNumber(parseInfoField(h, 'DP')),
    form: parseInfoField(h, 'Form'),
    attribute: parseInfoField(h, 'Attribute'),
    traits: parseInfoField(h, 'Type'),
    notes: parseInfoField(h, 'Notes')
  };
  card.colors = normalizeColors(card.colorText);

  const evoCosts = [];
  for (const m of h.matchAll(/<dt class="cardInfoTit">Digivolve Cost\s*\d*<\/dt>\s*<dd class="cardInfoData[^"]*">([\s\S]*?)<\/dd>/gi)) {
    evoCosts.push(oneLine(m[1]));
  }
  card.digivolveCosts = evoCosts;
  card.digivolveCost = evoCosts.length ? asNumber(evoCosts[0].replace(/^.*?\s(\d+)\sfrom.*$/i, '$1')) : null;

  const textSections = [];
  for (const m of h.matchAll(/<dl class="cardInfoBoxSmall">\s*<dt class="cardInfoTitSmall">([\s\S]*?)<\/dt>\s*<dd class="cardInfoData">\s*([\s\S]*?)<\/dd>\s*<\/dl>/gi)) {
    const title = oneLine(m[1]);
    const body = oneLine(m[2]);
    if (title || body) textSections.push({ title, body });
  }
  card.textSections = textSections;
  card.mainText = textSections
    .filter(s => !/Inherited Effect/i.test(s.title))
    .map(s => `${s.title} ${s.body}`.trim())
    .join('\n');
  card.sourceText = textSections
    .filter(s => /Inherited Effect/i.test(s.title))
    .map(s => `${s.title} ${s.body}`.trim())
    .join('\n');
  card.allText = textSections.map(s => `${s.title} ${s.body}`.trim()).join('\n');
  return card;
}

function canonicalCardId(id = '') {
  return String(id || '').trim().replace(/_P\d+$/i, '');
}

function categorySetCodes(label = '') {
  const codes = new Set();
  for (const m of String(label || '').matchAll(/\[([A-Z]+)-?0?(\d+)(?:-?(\d+))?\]/g)) {
    const prefix = m[1];
    const first = Number(m[2]);
    const second = m[3] ? Number(m[3]) : null;
    if (second !== null) {
      for (let n = first; n <= second; n++) codes.add(`${prefix}${n}`);
    } else {
      codes.add(`${prefix}${first}`);
    }
  }
  return [...codes];
}

function cardSetCode(id = '') {
  const m = canonicalCardId(id).match(/^([A-Z]+)(\d+)-/);
  return m ? `${m[1]}${Number(m[2])}` : null;
}

async function fetchOfficialCategory(category) {
  const url = `https://world.digimoncard.com/cards/?search=true&category=${category.id}`;
  const html = await fetchText(url);
  const cards = parseCardBlocks(html).map(parseOfficialCard);
  return { ...category, url, count: cards.length, cards };
}

function localCardType(card) {
  const raw = String(card?.type || card?.cardType || '').toLowerCase();
  if (raw === 'dual') return 'Digimon/Option';
  if (raw.includes('digi-egg') || raw.includes('digi egg') || raw.includes('egg')) return 'Digi-Egg';
  if (raw.includes('digimon')) return 'Digimon';
  if (raw.includes('tamer')) return 'Tamer';
  if (raw.includes('option')) return 'Option';
  return raw || null;
}

function compareCard(official, local) {
  const diffs = [];
  const localName = String(local?.name || '').trim();
  if (official.name && localName && normalize(official.name) !== normalize(localName)) {
    diffs.push({ field: 'name', official: official.name, local: local.name });
  }

  const offType = normalize(official.type);
  const locType = normalize(localCardType(local));
  if (offType && locType && offType !== locType) {
    diffs.push({ field: 'type', official: official.type, local: localCardType(local) });
  }

  const offColors = official.colors || [];
  const locColors = normalizeColors(local?.colors?.length ? local.colors : local?.color);
  if (offColors.length && locColors.length && offColors.join('|') !== locColors.join('|')) {
    diffs.push({ field: 'colors', official: offColors, local: locColors });
  }

  const scalarPairs = [
    ['level', official.level, asNumber(local?.level)],
    ['playCost', official.playCost, asNumber(local?.playCost)],
    ['dp', official.dp, asNumber(local?.dp)]
  ];
  for (const [field, off, loc] of scalarPairs) {
    if (off !== null && loc !== null && off !== loc) diffs.push({ field, official: off, local: loc });
  }

  const localMainCandidates = [local?.officialMainText, local?.mainEffect, local?.effectText]
    .filter(Boolean)
    .map(normalize);
  const officialMain = normalize(official.mainText);
  const localSourceCandidates = [local?.officialSourceText, local?.sourceEffect]
    .filter(Boolean)
    .map(normalize);
  const officialSource = normalize(official.sourceText);
  const mainMatches = localMainCandidates.some(localMain => localMain.includes(officialMain) || officialMain.includes(localMain));
  const sourceMatches = localSourceCandidates.some(localSource => localSource.includes(officialSource) || officialSource.includes(localSource));
  if (officialMain && localMainCandidates.length && !mainMatches) {
    diffs.push({
      field: 'mainText',
      official: official.mainText.slice(0, 400),
      local: String(local?.officialMainText || local?.mainEffect || local?.effectText || '').slice(0, 400)
    });
  }
  if (officialSource && localSourceCandidates.length && !sourceMatches) {
    diffs.push({
      field: 'sourceText',
      official: official.sourceText.slice(0, 400),
      local: String(local?.officialSourceText || local?.sourceEffect || '').slice(0, 400)
    });
  }

  return diffs;
}

function staticSourceAudit() {
  const joined = {};
  for (const file of STATIC_FILES) {
    const fp = path.join(ROOT, file);
    joined[file] = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  }
  const gs = joined['game-state.js'];
  const server = joined['server.js'];
  const tournament = joined['tournament-admin.js'];
  const deck = joined['deck-builder.html'];
  const fetch = joined['fetch-cards.js'];
  const audit = joined['audit-mechanics.js'];
  const meta = joined['meta-match-sim.js'];

  const checks = [
    ['official setup: starting player configurable', /startingPlayer/.test(gs) && /mulliganOrder/.test(gs)],
    ['official setup: security after mulligan guard', /initialSecuritySetupComplete/.test(gs) && /setupInitialSecurity/.test(gs)],
    ['first player skips first draw', /turnCount\s*===\s*1/.test(gs) && /firstPlayer/.test(gs) && /performDrawPhase/.test(gs)],
    ['RPS/server starting-player path', /rps|rock|scissors|startingPlayer/i.test(server)],
    ['deck legality: 50-card main and egg deck constraints', /mainDeck|eggDeck|Digi-Egg|digiEgg/i.test(server) && /50/.test(server) && /5/.test(server)],
    ['deck legality: token cards illegal in decks', /isTokenCard|isToken|cardKind.*token/i.test(server) && /Token/i.test(deck)],
    ['DUAL runtime recognition', /isDualCard/.test(gs) && /dualOptionSide/.test(gs) && /pendingDualArtsDigivolve/.test(gs)],
    ['DUAL generic play blocked', /canGenericPlayCard/.test(gs) && /isDualCard/.test(gs)],
    ['Link runtime', /applyLink/.test(gs) && /getLinkLimit/.test(gs) && /enforceInvalidLinkRuleCheck/.test(gs)],
    ['App Fusion / material runtime', /App Fusion|APP_FUSION|appFusion/i.test(gs) && /DigiXros|DIGIXROS|Digi-Xros/i.test(gs)],
    ['Counter / Blast timing', /counterTiming/.test(gs) && /BLAST_DNA|Blast DNA|Blast Digivolve/i.test(gs)],
    ['ACE Overflow runtime', /OVERFLOW|Overflow/.test(gs) && /sourceOverflow|fieldOverflow|triggerOverflow/i.test(gs + meta)],
    ['Token 2026 runtime', /removeTokenFromGame/.test(gs) && /tokenOnDeletionPendingFromTrash/.test(gs)],
    ['Token owner/controller split', /tokenOwnerId/.test(gs) && /tokenControllerId/.test(gs)],
    ['one-at-a-time security checks', /securityChecksPerformed/.test(gs) && /processSecurityChecks/.test(gs)],
    ['piercing survival continuation', /Piercing|piercing/.test(gs) && /attackerSurvived|survives/.test(gs)],
    ['simultaneous trigger batching', /_triggerBatchDepth/.test(gs) && /turn-player|turnPlayer|priority/i.test(gs)],
    ['option color requirement runtime', /canUseOptionCard/.test(gs) && /ignoreColor/i.test(gs)],
    ['official BT25 overlay preservation', /OFFICIAL_BT25_CARD_PATCHES/.test(fetch) && /bt25OfficialCardPoolCoverageLeak/.test(audit)],
    ['official token cardlist overlay preservation', /OFFICIAL_TOKEN_CARD_PATCHES/.test(fetch) && /officialTokenCardPoolCoverageLeak/.test(audit)],
    ['tournament administration: Swiss pairings and standings', /pairSwissRound/.test(tournament) && /calculateStandings/.test(tournament) && /opponentAverageMatchWinRate/.test(tournament)],
    ['tournament administration: penalties and judge calls', /issuePenalty/.test(tournament) && /recordJudgeCall/.test(tournament) && /PENALTY_TYPES/.test(tournament)],
    ['tournament administration: end-of-round procedures', /resolveBetweenGamesTimeout/.test(tournament) && /resolveOngoingGameTimeout/.test(tournament) && /EXTRA_TURNS/.test(tournament)],
    ['official errata: BT25-057 Final Judgment duration', /bt25057FinalJudgmentErrataDurationLeak/.test(audit) && /Round 22EG|BT25-057 Final Judgment/.test(meta + fetch)],
    ['official Q&A: no nested attack declaration during attack', /effectAttackDuringExistingAttackLeak/.test(audit) && /rejectNestedAttackDeclaration/.test(gs) && /Round 22EI effect-created attack/.test(meta)],
    ['official Q&A: BT4-105 Tactical Retreat security move replacements', /bt4105TacticalRetreatSecurityMoveLeak/.test(audit) && /actualSecurityAdded/.test(gs) && /Round 22EJ BT4-105 Tactical Retreat/.test(meta)]
  ];

  return checks.map(([name, ok]) => ({ name, ok: Boolean(ok) }));
}

function ruleDeltaRiskAudit() {
  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  const risks = [];
  const byId = new Map(cards.map(c => [c.id, c]));

  const tokens = cards.filter(c => c.isToken || /token/i.test(String(c.cardKind || c.id || '')));
  const tokenBadDeckFlags = tokens.filter(c => c.deckLegal === true || c.canDeckBuild === true);
  if (tokenBadDeckFlags.length) {
    risks.push({ severity: 'high', area: 'Token', issue: 'Token card marked deck-legal', cards: tokenBadDeckFlags.map(c => c.id) });
  }

  const duals = cards.filter(c => /dual/i.test(String(c.type || c.cardType || '')));
  const dualMissingOption = duals.filter(c => !Array.isArray(c.optionColors) || c.optionColors.length === 0 || c.dualOptionCost === undefined || c.dualOptionCost === null);
  if (dualMissingOption.length) {
    risks.push({ severity: 'high', area: 'DUAL', issue: 'DUAL card missing lower Option-side color/cost metadata', cards: dualMissingOption.map(c => c.id) });
  }

  const manualRequired = cards.filter(c => JSON.stringify(c.mechanics || []).includes('MANUAL_REQUIRED'));
  if (manualRequired.length) {
    risks.push({ severity: 'medium', area: 'Card mechanics', issue: 'Cards still contain MANUAL_REQUIRED mechanics', count: manualRequired.length, cards: manualRequired.slice(0, 30).map(c => c.id) });
  }

  const noMechanicsWithText = cards.filter(c => {
    const text = `${c.mainEffect || ''} ${c.sourceEffect || ''}`;
    if (!text.trim()) return false;
    if (/token/i.test(String(c.cardKind || c.id || ''))) return false;
    if (/^\s*(Inherited Effect)?\s*$/i.test(text)) return false;
    if (isRuntimeCoveredWithoutStructuredMechanics(c)) return false;
    return !Array.isArray(c.mechanics) || c.mechanics.length === 0;
  });
  if (noMechanicsWithText.length) {
    risks.push({ severity: 'medium', area: 'Card mechanics', issue: 'Cards with rules text but no mechanics', count: noMechanicsWithText.length, cards: noMechanicsWithText.slice(0, 40).map(c => c.id) });
  }

  const overlayIds = ['BT25-001', 'BT25-104', 'AD1-025', 'BT24-TOKEN', 'ST22-TOKEN01', 'ST22-TOKEN02'];
  const missingOverlay = overlayIds.filter(id => !byId.has(id));
  if (missingOverlay.length) {
    risks.push({ severity: 'high', area: 'Latest official pool', issue: 'Expected current official overlay records missing', cards: missingOverlay });
  }

  return risks;
}

function stripPrintedKeywordReminderText(text = '') {
  return String(text || '')
    .replace(/[\uFF1C<][^\uFF1E>]+[\uFF1E>]\s*(?:\([^)]*\))?/g, ' ')
    .replace(/\bInherited Effect\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRuntimeCoveredWithoutStructuredMechanics(card = {}) {
  const text = `${card.mainEffect || ''} ${card.sourceEffect || ''}`.trim();
  if (!text) return true;
  const stripped = stripPrintedKeywordReminderText(text)
    .replace(/[.\u3002]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return true;

  const clauses = stripped
    .split(/(?=\[(?:Your Turn|Opponent'?s Turn|All Turns)\])/i)
    .map(x => x.trim())
    .filter(Boolean);
  if (clauses.length === 0) return false;

  return clauses.every(clause => {
    const normalized = clause.replace(/\s+/g, ' ').trim();
    if (!/^\[(?:Your Turn|Opponent'?s Turn|All Turns)\]/i.test(normalized)) return false;
    if (/\bWhen\b/i.test(normalized) && !/\bWhile\b/i.test(normalized)) return false;
    return /\bwhile\b|\bthis digimon (?:gets|gains|can't|cannot)\b|\ball of your\b|\byour .*digimon.*(?:get|gets|gain|gains|can't|cannot)\b/i.test(normalized);
  });
}

function topRows(rows, limit = 20) {
  return rows.slice(0, limit);
}

function writeMarkdown(report) {
  const lines = [];
  lines.push('# Official Difference Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Official Baseline');
  for (const src of report.officialSources) lines.push(`- ${src.name}: ${src.baseline} (${src.url})`);
  lines.push('');
  lines.push('## Card Pool Summary');
  lines.push(`- Local cards: ${report.localCount}`);
  lines.push(`- Official categories checked: ${report.categories.map(c => `${c.label}=raw ${c.rawCount}, unique ${c.uniqueCount}`).join('; ')}`);
  lines.push(`- Missing locally from checked official categories: ${report.cardDiff.missingLocal.length}`);
  lines.push(`- Local extras in checked official category prefixes: ${report.cardDiff.localExtras.length}`);
  lines.push(`- Field/text mismatches sampled: ${report.cardDiff.fieldMismatches.length}`);
  lines.push(`- Mismatch fields: ${Object.entries(report.cardDiff.mismatchFieldCounts || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
  lines.push('');

  if (report.cardDiff.missingLocal.length) {
    lines.push('## Missing Local Cards');
    for (const row of topRows(report.cardDiff.missingLocal, 50)) lines.push(`- ${row.id} ${row.name || ''} (${row.category})`);
    lines.push('');
  }

  if (report.cardDiff.localExtras.length) {
    lines.push('## Local Extras In Checked Prefixes');
    for (const row of topRows(report.cardDiff.localExtras, 50)) lines.push(`- ${row.id} ${row.name || ''}`);
    lines.push('');
  }

  if (report.cardDiff.fieldMismatches.length) {
    lines.push('## Field/Text Mismatches');
    for (const row of topRows(report.cardDiff.fieldMismatches, 60)) {
      const fields = row.diffs.map(d => d.field).join(', ');
      lines.push(`- ${row.id} ${row.name || ''}: ${fields}`);
    }
    lines.push('');
  }

  lines.push('## Static Rule Coverage Checks');
  for (const row of report.staticChecks) lines.push(`- ${row.ok ? 'PASS' : 'RISK'} ${row.name}`);
  lines.push('');

  lines.push('## Rule Delta Risks');
  if (!report.ruleRisks.length) lines.push('- No high-level static rule-delta risk detected by this script.');
  for (const risk of report.ruleRisks) {
    lines.push(`- ${risk.severity.toUpperCase()} ${risk.area}: ${risk.issue}${risk.count ? ` (${risk.count})` : ''}${risk.cards ? `: ${risk.cards.join(', ')}` : ''}`);
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('- Text mismatch detection is intentionally conservative: official wording updates, third-party feed formatting, or split DUAL text can create noise. Treat mismatches as triage targets, not automatic bugs.');
  lines.push('- Runtime equivalence still requires scenario tests for any mismatch that affects timing, target legality, cost atomicity, or replacement windows.');
  fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
}

async function main() {
  const localCards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  const localById = new Map(localCards.map(c => [String(c.id || ''), c]));
  const indexHtml = await fetchText('https://world.digimoncard.com/cardlist/');
  const categories = parseCategoryOptions(indexHtml).slice(0, LATEST_CATEGORY_LIMIT);
  const officialCategories = [];
  for (const category of categories) {
    console.log(`Fetching official category ${category.id}: ${category.label}`);
    officialCategories.push(await fetchOfficialCategory(category));
  }

  const officialCards = officialCategories.flatMap(cat => cat.cards.map(card => ({ ...card, category: cat.label, categoryId: cat.id })));
  const officialUniqueById = new Map();
  for (const card of officialCards) {
    const existing = officialUniqueById.get(card.id);
    if (!existing || existing.imageId !== card.id && card.imageId === card.id) {
      officialUniqueById.set(card.id, card);
    }
  }
  const officialUniqueCards = [...officialUniqueById.values()];
  const officialById = new Map(officialUniqueCards.map(c => [c.id, c]));
  const missingLocal = officialCards
    .filter(c => !localById.has(c.id))
    .filter((c, idx, arr) => arr.findIndex(x => x.id === c.id) === idx)
    .map(c => ({ id: c.id, name: c.name, category: c.category, type: c.type }));

  const checkedSetCodes = [...new Set(officialCategories.flatMap(c => categorySetCodes(c.label)))];
  const localExtras = localCards
    .filter(c => checkedSetCodes.includes(cardSetCode(c.id)) && !officialById.has(c.id) && !/TOKEN/i.test(String(c.id)))
    .map(c => ({ id: c.id, name: c.name, type: c.type }));

  const fieldMismatches = [];
  for (const official of officialUniqueCards) {
    const local = localById.get(official.id);
    if (!local) continue;
    const diffs = compareCard(official, local);
    if (diffs.length) fieldMismatches.push({ id: official.id, name: official.name, category: official.category, diffs });
  }

  const mismatchFieldCounts = {};
  for (const row of fieldMismatches) {
    for (const diff of row.diffs) mismatchFieldCounts[diff.field] = (mismatchFieldCounts[diff.field] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    officialSources: OFFICIAL_RULE_SOURCES,
    localCount: localCards.length,
    categories: officialCategories.map(c => ({
      id: c.id,
      label: c.label,
      url: c.url,
      rawCount: c.count,
      uniqueCount: new Set(c.cards.map(card => card.id)).size,
      setCodes: categorySetCodes(c.label)
    })),
    cardDiff: {
      missingLocal,
      localExtras,
      fieldMismatches,
      mismatchFieldCounts
    },
    staticChecks: staticSourceAudit(),
    ruleRisks: ruleDeltaRiskAudit()
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  writeMarkdown(report);
  console.log(`Wrote ${path.relative(ROOT, OUT_JSON)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_MD)}`);
  console.log(JSON.stringify({
    localCards: report.localCount,
    categories: report.categories.length,
    missingLocal: missingLocal.length,
    localExtras: localExtras.length,
    fieldMismatches: fieldMismatches.length,
    staticRisks: report.staticChecks.filter(c => !c.ok).length,
    ruleRisks: report.ruleRisks.length
  }, null, 2));
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
