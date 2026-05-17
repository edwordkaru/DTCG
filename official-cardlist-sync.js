#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = __dirname;
const CARDS_FILE = path.join(ROOT, 'cards.json');
const DEFAULT_CATEGORY_LIMIT = Number(process.env.OFFICIAL_CATEGORY_LIMIT || 9);

function decodeHtml(value = '') {
  return String(value || '')
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
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))];
}

function asNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const m = String(value).replace(/,/g, '').match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function normalizeColors(value) {
  const text = Array.isArray(value) ? value.join(' ') : String(value || '');
  const canonical = {
    red: 'Red',
    blue: 'Blue',
    yellow: 'Yellow',
    green: 'Green',
    black: 'Black',
    purple: 'Purple',
    white: 'White'
  };
  const out = [];
  for (const match of text.matchAll(/\b(red|blue|yellow|green|black|purple|white)\b/ig)) {
    const color = canonical[String(match[1] || '').toLowerCase()];
    if (color && !out.includes(color)) out.push(color);
  }
  return out;
}

function typeToLocal(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'digimon/option') return 'dual';
  if (raw === 'digi-egg') return 'digi-egg';
  if (raw.includes('digimon')) return 'digimon';
  if (raw.includes('tamer')) return 'tamer';
  if (raw.includes('option')) return 'option';
  return raw || 'unknown';
}

function canonicalCardId(id = '') {
  return String(id || '').trim().replace(/_P\d+$/i, '');
}

async function fetchText(url) {
  const res = await axios.get(url, {
    timeout: 45000,
    responseType: 'text',
    headers: { 'User-Agent': 'DTCG official-cardlist-sync/1.0' }
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
    const imageId = m[1].trim();
    const id = canonicalCardId(imageId);
    if (!/^[A-Z]+\d*-/.test(id) && !/TOKEN/i.test(id)) continue;
    blocks.push({ imageId, id, html: m[2] });
  }
  return blocks;
}

function first(blockHtml, re) {
  const m = String(blockHtml || '').match(re);
  return m ? oneLine(m[1]) : null;
}

function info(blockHtml, label) {
  return first(blockHtml, new RegExp(`<dt class="cardInfoTit">${label}<\\/dt>\\s*<dd class="cardInfoData[^"]*">([\\s\\S]*?)<\\/dd>`, 'i'));
}

function parseTextSections(blockHtml) {
  const sections = [];
  for (const m of blockHtml.matchAll(/<dl class="cardInfoBoxSmall">\s*<dt class="cardInfoTitSmall">([\s\S]*?)<\/dt>\s*<dd class="cardInfoData">\s*([\s\S]*?)<\/dd>\s*<\/dl>/gi)) {
    const title = oneLine(m[1]);
    const body = oneLine(m[2]);
    if (title || body) sections.push({ title, body });
  }
  return sections;
}

function parseOfficialCard(block) {
  const h = block.html;
  const textSections = parseTextSections(h);
  const official = {
    id: block.id,
    imageId: block.imageId,
    name: first(h, /<div class="cardTitle">\s*([\s\S]*?)\s*<\/div>/i),
    type: first(h, /<li class="cardType">\s*([\s\S]*?)\s*<\/li>/i),
    level: asNumber(first(h, /<li class="cardLv">\s*Lv\.?([\s\S]*?)\s*<\/li>/i)),
    colorText: info(h, 'Color'),
    playCost: asNumber(info(h, 'Cost')),
    dp: asNumber(info(h, 'DP')),
    form: info(h, 'Form'),
    attribute: info(h, 'Attribute'),
    traits: info(h, 'Type'),
    textSections
  };
  official.colors = normalizeColors(official.colorText);
  official.mainText = textSections.filter(s => !/Inherited Effect/i.test(s.title)).map(s => `${s.title} ${s.body}`.trim()).join('\n');
  official.sourceText = textSections.filter(s => /Inherited Effect/i.test(s.title)).map(s => s.body).join('\n');
  official.ruleTraitTokens = [...official.mainText.matchAll(/\(Rule\)\s*Trait:\s*Has\s*\[([^\]]+)\]\s*Type\.?/ig)]
    .map(m => oneLine(m[1]))
    .filter(Boolean);
  official.specialRuleText = textSections.filter(s => /Special Rule/i.test(s.title)).map(s => s.body).join('\n');
  const specialRuleDp = official.specialRuleText.match(/([+-]?\d+)\s*DP/i);
  official.specialRuleDp = specialRuleDp ? Number(specialRuleDp[1]) : null;
  official.specialDigivolutionConditions = textSections
    .filter(s => /Special Digivolution Condition/i.test(s.title))
    .flatMap(s => parseSpecialDigivolutionConditions(s.body));
  return official;
}

function parseSpecialDigivolutionConditions(text = '') {
  const out = [];
  const normalized = oneLine(text);
  const parts = normalized.split(/(?=\[(?:DNA\s+)?Digivolve\])/i).map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    const costMatch = part.match(/:\s*Cost\s*(\d+)/i) || part.match(/\bCost\s*(\d+)/i);
    const cost = costMatch ? Number(costMatch[1]) : null;
    const isDna = /\[DNA\s+Digivolve\]/i.test(part);
    const isNormal = /\[Digivolve\]/i.test(part) && !isDna;
    if (!isNormal && !isDna) continue;
    const reqText = part
      .replace(/\[(?:DNA\s+)?Digivolve\]/i, '')
      .replace(/:\s*Cost\s*\d+.*/i, '')
      .replace(/\bCost\s*\d+.*/i, '')
      .trim();
    const clauses = isDna ? parseDnaClauses(reqText) : parseNormalDigivolveClauses(reqText);
    out.push({
      type: isDna ? 'DNA_DIGIVOLVE' : 'DIGIVOLVE',
      cost,
      text: part,
      requirementText: reqText,
      clauses
    });
  }
  return out;
}

function colorTokensFromText(text = '') {
  return normalizeColors(text);
}

function parseNormalDigivolveClauses(text = '') {
  const out = [];
  const segments = String(text || '')
    .split(/\s+or\s+/i)
    .flatMap(splitNameThenLevelAlternative)
    .map(s => s.trim())
    .filter(Boolean);

  let inheritedLevel = null;
  for (const seg of segments) {
    const levelMatch = seg.match(/Lv\.?\s*(\d+)/i);
    const level = levelMatch ? Number(levelMatch[1]) : inheritedLevel;
    if (levelMatch) inheritedLevel = level;
    const colors = colorTokensFromText(seg);
    const bracketTokens = [...seg.matchAll(/\[([^\]]+)\]/g)].map(m => oneLine(m[1])).filter(Boolean);
    const inName = /in\s+(?:name|its\s+name)/i.test(seg);
    const inText = /in\s+(?:text|its\s+text)/i.test(seg);
    const isTrait = /trait/i.test(seg);

    if (bracketTokens.length === 0) {
      out.push({ level, colors });
      continue;
    }
    for (const token of bracketTokens) {
      out.push({
        level,
        colors,
        ...(inName ? { nameContains: token } : {}),
        ...(!inName && inText ? { textContains: token } : {}),
        ...(!inName && !inText && isTrait ? { trait: token } : {}),
        ...(!inName && !inText && !isTrait ? { name: token } : {})
      });
    }
  }
  return out.filter(c => c.level || c.name || c.nameContains || c.textContains || c.trait || (c.colors && c.colors.length));
}

function splitNameThenLevelAlternative(segment = '') {
  const seg = String(segment || '').trim();
  const m = seg.match(/^(\[[^\]]+\])\s*\/\s*(Lv\.?\s*\d+.*)$/i);
  if (m) return [m[1], m[2]];
  return [seg];
}

function parseDnaClauses(text = '') {
  return String(text || '').split(/\s*\+\s*/).map(seg => {
    const levelMatch = seg.match(/Lv\.?\s*(\d+)/i);
    return {
      level: levelMatch ? Number(levelMatch[1]) : null,
      colors: colorTokensFromText(seg),
      text: oneLine(seg)
    };
  }).filter(c => c.level || c.colors.length || c.text);
}

function splitTraits(value = '') {
  return String(value || '').split(/[\/,]/).map(x => x.trim()).filter(Boolean);
}

function mergeSearchText(card) {
  return [
    card.id,
    card.name,
    ...(Array.isArray(card.colors) ? card.colors : []),
    ...(Array.isArray(card.traitTokens) ? card.traitTokens : []),
    card.optionName,
    ...(Array.isArray(card.optionColors) ? card.optionColors : []),
    card.mainEffect,
    card.sourceEffect
  ].filter(Boolean).join(' ').toLowerCase();
}

function applyOfficialOverlay(localCard, official) {
  const updated = { ...localCard };
  const oldName = updated.name;
  if (official.name) updated.name = official.name;
  if (official.type) updated.type = typeToLocal(official.type);
  if (official.level !== null) updated.level = official.level;
  if (official.playCost !== null && updated.type !== 'dual') updated.playCost = official.playCost;
  if (official.dp !== null) updated.dp = official.dp;
  if (official.colors.length) {
    updated.color = official.colors[0];
    updated.colors = official.colors.slice();
  }
  const officialTypeTraits = splitTraits(official.traits);
  const officialRuntimeTraits = unique([
    ...officialTypeTraits,
    ...splitTraits(official.form),
    ...splitTraits(official.attribute),
    ...(Array.isArray(official.ruleTraitTokens) ? official.ruleTraitTokens : [])
  ]);
  if (officialTypeTraits.length) {
    updated.traits = officialTypeTraits.join(', ');
    updated.traitTokens = officialRuntimeTraits;
  }
  if (official.specialRuleDp !== null && official.specialRuleDp !== undefined) {
    updated.linkDp = official.specialRuleDp;
    updated.appLinkDp = official.specialRuleDp;
  }
  if (official.sourceText && (!updated.sourceEffect || normalizeText(updated.sourceEffect) !== normalizeText(official.sourceText))) {
    updated.officialSourceText = official.sourceText;
  }
  if (official.mainText && !normalizeText(updated.mainEffect || '').includes(normalizeText(official.mainText).slice(0, 80))) {
    updated.officialMainText = official.mainText;
  }
  if (official.specialDigivolutionConditions.length) {
    updated.specialDigivolutionConditions = official.specialDigivolutionConditions;
  }
  updated.nameTokens = Array.from(new Set([updated.name, oldName, ...(Array.isArray(updated.nameTokens) ? updated.nameTokens : [])].filter(Boolean)));
  updated.searchText = mergeSearchText(updated);
  updated._officialCardlistSync = {
    syncedAt: new Date().toISOString(),
    source: 'world.digimoncard.com official cardlist',
    fields: ['name', 'type', 'level', 'playCost', 'dp', 'colors', 'traits', 'specialDigivolutionConditions']
  };
  return updated;
}

function normalizeText(value = '') {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/[＜]/g, '<').replace(/[＞]/g, '>').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function fetchOfficialCards(limit = DEFAULT_CATEGORY_LIMIT) {
  const indexHtml = await fetchText('https://world.digimoncard.com/cardlist/');
  const categories = parseCategoryOptions(indexHtml).slice(0, limit);
  const byId = new Map();
  for (const category of categories) {
    console.log(`Fetching ${category.label}`);
    const html = await fetchText(`https://world.digimoncard.com/cards/?search=true&category=${category.id}`);
    for (const card of parseCardBlocks(html).map(parseOfficialCard)) {
      const existing = byId.get(card.id);
      if (!existing || existing.imageId !== card.id && card.imageId === card.id) {
        byId.set(card.id, { ...card, category: category.label, categoryId: category.id });
      }
    }
  }
  return byId;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const officialById = await fetchOfficialCards(DEFAULT_CATEGORY_LIMIT);
  const cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  let changed = 0;
  const changedRows = [];
  const next = cards.map(card => {
    const official = officialById.get(card.id);
    if (!official) return card;
    const updated = applyOfficialOverlay(card, official);
    if (JSON.stringify(updated) !== JSON.stringify(card)) {
      changed++;
      changedRows.push(card.id);
    }
    return updated;
  });

  if (!dryRun) {
    const backup = path.join(ROOT, `cards_backup_before_official_sync_${Date.now()}.json`);
    fs.copyFileSync(CARDS_FILE, backup);
    fs.writeFileSync(CARDS_FILE, JSON.stringify(next, null, 2), 'utf8');
    console.log(`Backup: ${path.basename(backup)}`);
    console.log(`Updated cards.json (${changed} records changed).`);
  } else {
    console.log(`Dry run: ${changed} records would change.`);
  }
  console.log(changedRows.slice(0, 80).join(', '));
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
