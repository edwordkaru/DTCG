#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = __dirname;
const CARDS_FILE = path.join(ROOT, 'cards.json');
const ZH_OVERLAY_FILE = path.join(ROOT, 'translations', 'cards.zh.json');
const ZH_IMG_DIR = path.join(ROOT, 'img', 'zh');

const DEFAULT_SOURCE = String(process.env.ZH_CARD_SOURCE || 'cn').toLowerCase();
const DEFAULT_CN_API_URL = process.env.ZH_CN_API_URL || 'https://dtcgweb-api.digimoncard.cn';
const DEFAULT_HK_BASE_URL = process.env.ZH_CARDLIST_BASE_URL || 'https://hk.digimoncard.com';
const DEFAULT_CATEGORY_LIMIT = Number(process.env.ZH_CATEGORY_LIMIT || 0);
const DEFAULT_REQUEST_RETRIES = Number(process.env.ZH_REQUEST_RETRIES || 2);
const DEFAULT_IMAGE_TIMEOUT_MS = Number(process.env.ZH_IMAGE_TIMEOUT_MS || 60000);
const DEFAULT_IMAGE_RETRIES = Number(process.env.ZH_IMAGE_RETRIES || 2);

function parseArgs(argv) {
  const out = {
    dryRun: false,
    skipImages: false,
    forceImages: false,
    downloadAllImages: false,
    merge: true,
    addMissing: false,
    imageSource: null,
    limit: DEFAULT_CATEGORY_LIMIT,
    categories: [],
    only: new Set(),
    source: DEFAULT_SOURCE,
    baseUrl: DEFAULT_SOURCE === 'hk' ? DEFAULT_HK_BASE_URL : DEFAULT_CN_API_URL,
    imageTimeoutMs: DEFAULT_IMAGE_TIMEOUT_MS,
    imageRetries: DEFAULT_IMAGE_RETRIES
  };

  for (const arg of argv) {
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--skip-images') out.skipImages = true;
    else if (arg === '--force-images') out.forceImages = true;
    else if (arg === '--download-all-images') out.downloadAllImages = true;
    else if (arg === '--no-merge') out.merge = false;
    else if (arg === '--add-missing') out.addMissing = true;
    else if (arg.startsWith('--image-source=')) out.imageSource = String(arg.slice('--image-source='.length) || '').toLowerCase();
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.slice('--limit='.length) || 0);
    else if (arg.startsWith('--category=')) out.categories.push(...arg.slice('--category='.length).split(',').map(x => x.trim()).filter(Boolean));
    else if (arg.startsWith('--only=')) out.only = new Set(arg.slice('--only='.length).split(',').map(canonicalCardId).filter(Boolean));
    else if (arg.startsWith('--source=')) out.source = String(arg.slice('--source='.length) || '').toLowerCase();
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length).replace(/\/+$/, '');
    else if (arg.startsWith('--image-timeout-ms=')) out.imageTimeoutMs = Number(arg.slice('--image-timeout-ms='.length) || DEFAULT_IMAGE_TIMEOUT_MS);
    else if (arg.startsWith('--image-retries=')) out.imageRetries = Number(arg.slice('--image-retries='.length) || DEFAULT_IMAGE_RETRIES);
  }

  if (out.source !== 'hk' && out.source !== 'cn') {
    throw new Error(`Unsupported --source=${out.source}. Use --source=cn or --source=hk.`);
  }
  if (!argv.some(arg => arg.startsWith('--base-url='))) {
    out.baseUrl = out.source === 'hk' ? DEFAULT_HK_BASE_URL : DEFAULT_CN_API_URL;
  }
  if (!out.imageSource) out.imageSource = 'official';
  if (!['official', 'local', 'none'].includes(out.imageSource)) {
    throw new Error(`Unsupported --image-source=${out.imageSource}. Use official, local, or none.`);
  }
  if (!Number.isFinite(out.imageTimeoutMs) || out.imageTimeoutMs <= 0) out.imageTimeoutMs = DEFAULT_IMAGE_TIMEOUT_MS;
  if (!Number.isFinite(out.imageRetries) || out.imageRetries < 0) out.imageRetries = DEFAULT_IMAGE_RETRIES;
  out.imageRetries = Math.floor(out.imageRetries);

  return out;
}

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
    .replace(/&rtri;/g, '▹')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function oneLine(value = '') {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function cleanEffect(value = '') {
  const text = decodeHtml(value)
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '-' ? '' : text;
}

function canonicalCardId(id = '') {
  return String(id || '')
    .trim()
    .toUpperCase()
    .replace(/＿/g, '_')
    .replace(/_P\d+$/i, '')
    .replace(/\s+/g, '');
}

async function fetchText(url) {
  const res = await axiosGetWithRetries(url, {
    timeout: 45000,
    responseType: 'text',
    headers: { 'User-Agent': 'DTCG zh-cardlist-sync/1.0' }
  }, `GET ${url}`);
  return String(res.data || '');
}

async function fetchJson(url, params) {
  const res = await axiosGetWithRetries(url, {
    params,
    timeout: 45000,
    responseType: 'json',
    headers: { 'User-Agent': 'DTCG zh-cardlist-sync/1.0' }
  }, `GET ${url}`);
  return res.data;
}

async function axiosGetWithRetries(url, config, label) {
  const attempts = Math.max(1, DEFAULT_REQUEST_RETRIES + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const waitMs = Math.min(1000 * attempt, 5000);
        console.warn(`${label} failed attempt ${attempt}/${attempts}: ${formatDownloadError(error)}; retrying...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDownloadError(error) {
  if (error.response) {
    return `HTTP ${error.response.status}`;
  }
  return error.code || error.message || String(error);
}

async function downloadFile(url, filePath, options = {}) {
  const res = await axios.get(url, {
    timeout: options.timeoutMs || DEFAULT_IMAGE_TIMEOUT_MS,
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'DTCG zh-cardlist-sync/1.0' }
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(res.data));
}

async function downloadFileWithRetries(id, url, filePath, options) {
  const attempts = Math.max(1, Number(options.imageRetries || 0) + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await downloadFile(url, filePath, { timeoutMs: options.imageTimeoutMs });
      return { ok: true, attempts: attempt };
    } catch (error) {
      lastError = error;
      const message = formatDownloadError(error);
      if (attempt < attempts) {
        const waitMs = Math.min(1000 * attempt, 5000);
        console.warn(`Image ${id} failed attempt ${attempt}/${attempts}: ${message}; retrying...`);
        await sleep(waitMs);
      }
    }
  }

  return { ok: false, error: formatDownloadError(lastError) };
}

function parseCategoryOptions(html) {
  const categories = [];
  for (const m of html.matchAll(/<option[^>]*value=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/option>/gi)) {
    const id = String(m[1] || '').trim();
    const label = oneLine(m[2]);
    if (!/^507\d+$/.test(id)) continue;
    if (!label || label === '收錄彈') continue;
    if (!categories.some(c => c.id === id)) categories.push({ id, label });
  }
  return categories;
}

function parseCardBlocks(html) {
  const blocks = [];
  const re = /<li class="image_lists_item[\s\S]*?(?=<li class="image_lists_item|\s*<\/ul>)/gi;
  for (const m of html.matchAll(re)) {
    blocks.push(m[0]);
  }
  return blocks;
}

function first(blockHtml, re) {
  const m = String(blockHtml || '').match(re);
  return m ? oneLine(m[1]) : '';
}

function rawInfo(blockHtml, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<dt>\\s*${escaped}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)(?:<\\/dd>|<\\/dl>)`, 'i');
  const m = String(blockHtml || '').match(re);
  return m ? m[1] : '';
}

function info(blockHtml, label) {
  const text = oneLine(rawInfo(blockHtml, label));
  return text === '-' ? '' : text;
}

function parseZhCard(blockHtml, pageUrl) {
  const id = canonicalCardId(first(blockHtml, /<li class="cardno">\s*([\s\S]*?)\s*<\/li>/i));
  if (!id) return null;

  const imgSrc = first(blockHtml, /<img\s+src=["']([^"']+)["'][^>]*>/i);
  const imageUrl = imgSrc ? new URL(imgSrc, pageUrl).toString() : '';
  const ext = imageUrl.split('?')[0].match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() || 'png';
  const localImage = imageUrl ? `/img/zh/${id}.${ext === 'jpeg' ? 'jpg' : ext}` : '';
  const mainEffect = cleanEffect(rawInfo(blockHtml, '上方效果'));
  const sourceEffect = cleanEffect(rawInfo(blockHtml, '下方效果'));

  return {
    id,
    name_zh: first(blockHtml, /<div class="card_name">\s*([\s\S]*?)\s*<\/div>/i),
    type_zh: first(blockHtml, /<li class="cardtype">\s*([\s\S]*?)\s*<\/li>/i),
    level_zh: first(blockHtml, /<li class="cardlv">\s*([\s\S]*?)\s*<\/li>/i),
    color_zh: info(blockHtml, '顏色'),
    form_zh: info(blockHtml, '型態'),
    attribute_zh: info(blockHtml, '屬性'),
    traits_zh: info(blockHtml, '類型'),
    mainEffect_zh: mainEffect,
    sourceEffect_zh: sourceEffect,
    effectText_zh: [mainEffect, sourceEffect].filter(Boolean).join(' '),
    img_zh: localImage,
    remoteImg_zh: imageUrl
  };
}

function normalizeCnCard(raw) {
  const id = canonicalCardId(raw.model);
  if (!id) return null;
  const imageUrl = String(raw.imageCover || '').trim();
  const mainEffect = cleanEffect(raw.effect || '');
  const inheritedEffect = cleanEffect(raw.envolutionEffect || '');
  const securityEffect = cleanEffect(raw.safeEffect || '');
  const sourceEffect = [inheritedEffect, securityEffect].filter(Boolean).join('\n');
  const ext = imageUrl.split('?')[0].match(/\.(png|jpe?g|webp)$/i)?.[1]?.toLowerCase() || 'png';

  return {
    id,
    name_zh: String(raw.name || '').trim(),
    type_zh: String(raw.belongsType || '').trim(),
    level_zh: String(raw.cardLevel || '').trim(),
    color_zh: String(raw.color || '').trim(),
    form_zh: String(raw.form || '').trim(),
    attribute_zh: String(raw.attribute || '').trim(),
    traits_zh: String(raw.type || '').trim(),
    mainEffect_zh: mainEffect,
    sourceEffect_zh: sourceEffect,
    effectText_zh: [mainEffect, sourceEffect].filter(Boolean).join(' '),
    img_zh: imageUrl ? `/img/zh/${id}.${ext === 'jpeg' ? 'jpg' : ext}` : '',
    remoteImg_zh: imageUrl,
    cnRawId: raw.id,
    cnParallCard: raw.parallCard
  };
}

function preferCnCard(existing, candidate) {
  if (!existing) return candidate;
  // The CN site marks parallel arts with parallCard === "0"; keep regular arts
  // as the default display image/text when both are available.
  if (String(existing.cnParallCard) === '0' && String(candidate.cnParallCard) !== '0') return candidate;
  if (!existing.mainEffect_zh && candidate.mainEffect_zh) return candidate;
  if (!existing.sourceEffect_zh && candidate.sourceEffect_zh) return candidate;
  return existing;
}

async function fetchCnCards(options) {
  const byId = new Map();
  const pageSize = Number(process.env.ZH_CN_PAGE_SIZE || 200);
  let page = 1;
  let totalPage = 1;

  do {
    const data = await fetchJson(`${options.baseUrl}/gamecard/gamecardmanager/weblist`, {
      page,
      limit: pageSize,
      state: 0
    });
    const pageData = data && data.page ? data.page : {};
    totalPage = Number(pageData.totalPage || totalPage || 1);
    console.log(`Fetching CN official cards page ${page}/${totalPage}`);

    for (const raw of pageData.list || []) {
      const card = normalizeCnCard(raw);
      if (!card) continue;
      if (options.categories.length && !options.categories.includes(String(raw.cardGroup || '').trim())) continue;
      if (options.only.size && !options.only.has(card.id)) continue;
      byId.set(card.id, {
        ...preferCnCard(byId.get(card.id), card),
        zhSource: {
          site: 'www.digimoncard.cn',
          api: `${options.baseUrl}/gamecard/gamecardmanager/weblist`,
          cardGroup: raw.cardGroup || '',
          fetchedAt: new Date().toISOString(),
          language: 'zh-CN'
        }
      });
    }

    page++;
  } while (page <= totalPage && (options.limit <= 0 || page <= options.limit));

  return byId;
}

async function fetchHkCards(options) {
  const indexUrl = `${options.baseUrl}/cardlist/?search=true`;
  const indexHtml = await fetchText(indexUrl);
  let categories = parseCategoryOptions(indexHtml);
  if (options.categories.length) {
    const wanted = new Set(options.categories);
    categories = categories.filter(c => wanted.has(c.id));
  }
  if (options.limit > 0) categories = categories.slice(0, options.limit);

  const byId = new Map();
  for (const category of categories) {
    const pageUrl = `${options.baseUrl}/cardlist/?category=${encodeURIComponent(category.id)}&search=true`;
    console.log(`Fetching ${category.label} (${category.id})`);
    const html = await fetchText(pageUrl);
    for (const block of parseCardBlocks(html)) {
      const card = parseZhCard(block, pageUrl);
      if (!card) continue;
      if (options.only.size && !options.only.has(card.id)) continue;
      const existing = byId.get(card.id);
      if (!existing || (!existing.mainEffect_zh && card.mainEffect_zh) || (!existing.sourceEffect_zh && card.sourceEffect_zh)) {
        byId.set(card.id, {
          ...card,
          zhSource: {
            site: options.baseUrl,
            category: category.label,
            categoryId: category.id,
            fetchedAt: new Date().toISOString()
          }
        });
      }
    }
  }
  return byId;
}

async function fetchZhCards(options) {
  return options.source === 'cn' ? fetchCnCards(options) : fetchHkCards(options);
}

function buildOverlay(cardsById, options) {
  const out = {};
  for (const [id, card] of cardsById) {
    out[id] = options.imageSource === 'official' ? card : { ...card, img_zh: '' };
  }
  return out;
}

function mergeIntoLocalCards(localCards, zhById, options) {
  const localIds = new Set(localCards.map(card => canonicalCardId(card.id)));
  let changed = 0;
  let matched = 0;
  const changedIds = [];
  const next = localCards.map(card => {
    const id = canonicalCardId(card.id);
    const zh = zhById.get(id);
    if (!zh) return card;
    matched++;
    const imageZh = options.imageSource === 'none'
      ? ''
      : (options.imageSource === 'local' ? (card.img || '') : (zh.img_zh || ''));
    const updated = {
      ...card,
      name_zh: zh.name_zh || card.name_zh,
      mainEffect_zh: zh.mainEffect_zh || card.mainEffect_zh,
      sourceEffect_zh: zh.sourceEffect_zh || card.sourceEffect_zh,
      effectText_zh: zh.effectText_zh || card.effectText_zh,
      img_zh: imageZh,
      type_zh: zh.type_zh || card.type_zh,
      color_zh: zh.color_zh || card.color_zh,
      form_zh: zh.form_zh || card.form_zh,
      attribute_zh: zh.attribute_zh || card.attribute_zh,
      traits_zh: zh.traits_zh || card.traits_zh,
      _zhCardlistSync: zh.zhSource
    };
    if (JSON.stringify(updated) !== JSON.stringify(card)) {
      changed++;
      changedIds.push(id);
    }
    return updated;
  });

  if (options.addMissing) {
    for (const [id, zh] of zhById) {
      if (localIds.has(id)) continue;
      next.push({
        id,
        name: id,
        type: 'unknown',
        level: null,
        img: '',
        name_zh: zh.name_zh,
        mainEffect_zh: zh.mainEffect_zh,
        sourceEffect_zh: zh.sourceEffect_zh,
        effectText_zh: zh.effectText_zh,
        img_zh: options.imageSource === 'none' ? '' : (zh.img_zh || ''),
        _zhOnly: true,
        _zhCardlistSync: zh.zhSource
      });
      changed++;
      changedIds.push(id);
    }
  }

  return { next, matched, changed, changedIds };
}

async function writeImages(zhById, options, allowedIds = null) {
  if (options.skipImages || options.imageSource === 'local' || options.imageSource === 'none') {
    return { downloaded: 0, skipped: zhById.size, ignored: 0, failed: [] };
  }
  let downloaded = 0;
  let skipped = 0;
  let ignored = 0;
  const failed = [];
  const downloads = [];
  fs.mkdirSync(ZH_IMG_DIR, { recursive: true });

  for (const [id, card] of zhById) {
    if (allowedIds && !allowedIds.has(id)) {
      ignored++;
      continue;
    }
    if (!card.remoteImg_zh || !card.img_zh) continue;
    const filePath = path.join(ROOT, card.img_zh.replace(/^\//, '').replace(/\//g, path.sep));
    if (!options.forceImages && fs.existsSync(filePath)) {
      skipped++;
      continue;
    }
    if (options.dryRun) {
      downloaded++;
      continue;
    }
    downloads.push({ id, url: card.remoteImg_zh, filePath });
  }

  if (downloads.length) {
    const scope = allowedIds ? ', limited to local English cards' : '';
    console.log(`Starting image downloads: ${downloads.length} needed, ${skipped} already present${scope}.`);
  }

  for (const item of downloads) {
    const result = await downloadFileWithRetries(item.id, item.url, item.filePath, options);
    if (!result.ok) {
      failed.push({ id: item.id, url: item.url, error: result.error });
      console.warn(`Skipped ${item.id}: ${result.error}`);
      continue;
    }
    downloaded++;
    if (downloaded % 50 === 0) console.log(`Downloaded ${downloaded} zh card images...`);
  }

  return { downloaded, skipped, ignored, failed };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const zhById = await fetchZhCards(options);
  let cards = null;
  let localIds = null;
  if (options.merge || !options.downloadAllImages) {
    cards = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
    localIds = new Set(cards.map(card => canonicalCardId(card.id)));
  }
  const imageAllowedIds = options.downloadAllImages ? null : localIds;
  const imageStats = await writeImages(zhById, options, imageAllowedIds);
  const overlay = buildOverlay(zhById, options);

  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(ZH_OVERLAY_FILE), { recursive: true });
    fs.writeFileSync(ZH_OVERLAY_FILE, JSON.stringify(overlay, null, 2), 'utf8');
  }

  let mergeStats = null;
  if (options.merge) {
    mergeStats = mergeIntoLocalCards(cards, zhById, options);
    if (!options.dryRun) {
      const backup = path.join(ROOT, `cards_backup_before_zh_sync_${Date.now()}.json`);
      fs.copyFileSync(CARDS_FILE, backup);
      fs.writeFileSync(CARDS_FILE, JSON.stringify(mergeStats.next, null, 2), 'utf8');
      console.log(`Backup: ${path.basename(backup)}`);
    }
  }

  console.log(`Chinese official records: ${zhById.size}`);
  console.log(`Images: ${options.dryRun ? 'would download' : 'downloaded'} ${imageStats.downloaded}, skipped ${imageStats.skipped}, ignored ${imageStats.ignored}, failed ${imageStats.failed.length}`);
  if (imageStats.failed.length) {
    console.log('Failed image downloads:');
    for (const item of imageStats.failed.slice(0, 30)) {
      console.log(`- ${item.id}: ${item.error} (${item.url})`);
    }
    if (imageStats.failed.length > 30) {
      console.log(`...and ${imageStats.failed.length - 30} more.`);
    }
  }
  if (mergeStats) {
    console.log(`Matched local English cards: ${mergeStats.matched}`);
    console.log(`${options.dryRun ? 'Would update' : 'Updated'} cards.json display fields: ${mergeStats.changed}`);
    console.log(mergeStats.changedIds.slice(0, 80).join(', '));
  } else {
    console.log(`${options.dryRun ? 'Would write' : 'Wrote'} ${path.relative(ROOT, ZH_OVERLAY_FILE)} only.`);
  }
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
