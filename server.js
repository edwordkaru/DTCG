const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const GameState = require('./game-state.js'); 
const TournamentAdmin = require('./tournament-admin.js');

// Round 22DE: load local .env before any process.env-derived server config.
// Keep this optional so stripped Codex/CI folders without dotenv still run.
let DOTENV_BOOTSTRAP = { attempted: false, loaded: false, error: null };
try {
    DOTENV_BOOTSTRAP.attempted = true;
    const dotenvResult = require('dotenv').config(); // MODULE_NOT_FOUND is handled below for stripped runners.
    DOTENV_BOOTSTRAP.loaded = Boolean(dotenvResult && dotenvResult.parsed);
    if (dotenvResult && dotenvResult.error && dotenvResult.error.code !== 'ENOENT') {
        DOTENV_BOOTSTRAP.error = dotenvResult.error.message;
    }
} catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') {
        DOTENV_BOOTSTRAP.error = 'dotenv module not installed';
    } else {
        DOTENV_BOOTSTRAP.error = err ? err.message : 'unknown dotenv load error';
        console.warn(`⚠️  dotenv bootstrap failed: ${DOTENV_BOOTSTRAP.error}`);
    }
}

const app = express();
app.set('trust proxy', 1);

// Round 11H: production/deployment hardening. Keep local dev usable while
// making Render/HTTPS deployments explicit and safe.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dtcg-dev-session-secret-change-me';
const COOKIE_SECURE = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : IS_PRODUCTION;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean);

function isOriginAllowed(origin) {
    if (!origin) return true; // same-origin, curl, health checks
    if (ALLOWED_ORIGINS.length === 0) return true; // dev/default: permissive
    return ALLOWED_ORIGINS.includes(origin);
}

const corsOptions = {
    credentials: true,
    origin(origin, callback) {
        if (isOriginAllowed(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked origin: ${origin}`));
    }
};

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET is not set. Set it in production for stable secure sessions.');
}

app.use(cors(corsOptions));

const sessionMiddleware = session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: { 
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    } 
});

app.use(sessionMiddleware);
if (typeof express.json === 'function') {
    app.use(express.json({ limit: '2mb' }));
}

app.use('/img', express.static(path.join(__dirname, 'img')));
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) res.json(req.session.user);
    else res.json({ loggedIn: false, guest: true, user: null });
});
app.use(express.static(__dirname));

const server = http.createServer(app);
const io = new Server(server, { 
    cors: {
        origin(origin, callback) {
            if (isOriginAllowed(origin)) return callback(null, true);
            return callback(new Error(`Socket.IO CORS blocked origin: ${origin}`));
        },
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000 
});

// Round 11I: allow Socket.IO handlers to read the same express-session data
// used by Discord OAuth. A Discord user id is the strongest resume identity;
// browser-local resume tokens are the fallback for guest mode.
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

// 🔥 使用环境变量读取密钥（安全！）
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

function getDiscordRedirectUri(req) {
    if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${proto}://${req.get('host')}/auth/discord/callback`;
}

function hasDiscordConfig() {
    return Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET);
}

if (!hasDiscordConfig()) {
    console.error("❌ 缺少 Discord 环境变量！请设置 DISCORD_CLIENT_ID 和 DISCORD_CLIENT_SECRET");
    console.error("   Discord 登录会返回 503，但本地游客/房间测试仍可使用。");
}

app.get('/healthz', (req, res) => {
    res.json({
        ok: true,
        uptime: process.uptime(),
        rooms: Object.keys(rooms || {}).length,
        nodeEnv: process.env.NODE_ENV || 'development',
        discordConfigured: hasDiscordConfig(),
        dotenvAttempted: DOTENV_BOOTSTRAP.attempted,
        dotenvLoaded: DOTENV_BOOTSTRAP.loaded,
        dotenvError: DOTENV_BOOTSTRAP.error,
        cookieSecure: COOKIE_SECURE
    });
});

// Discord OAuth2 管线
app.get('/auth/discord', (req, res) => {
    if (!hasDiscordConfig()) {
        return res.status(503).send('Discord login is not configured. Set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.');
    }
    const redirectUri = getDiscordRedirectUri(req);
    const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify`;
    res.redirect(url);
});

// 🔥 3. 给前端查询登录状态的接口
app.get('/auth/status', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/'); 
    if (!hasDiscordConfig()) {
        return res.status(503).send('Discord login is not configured.');
    }
    try {
        const redirectUri = getDiscordRedirectUri(req);
        const params = new URLSearchParams({
            client_id: DISCORD_CLIENT_ID, 
            client_secret: DISCORD_CLIENT_SECRET,
            grant_type: 'authorization_code', 
            code: code, 
            redirect_uri: redirectUri
        });
        const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', params.toString(), { 
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
        });
        const userResponse = await axios.get('https://discord.com/api/users/@me', { 
            headers: { Authorization: `Bearer ${tokenResponse.data.access_token}` } 
        });
        
        req.session.user = {
            id: userResponse.data.id, 
            username: userResponse.data.username,
            global_name: userResponse.data.global_name, 
            avatar: userResponse.data.avatar
        };
        res.redirect('/'); 
    } catch (err) { 
        console.error(err);
        res.redirect('/'); 
    }
});

app.get('/api/me', (req, res) => {
    if (req.session && req.session.user) res.json(req.session.user);
    else res.status(401).json({ error: '未登录' });
});

// ==========================================
// ⚔️ 赛博大厅与对战引擎 (备战室升维版)
// ==========================================
let rooms = {};
let tournaments = {};
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 100);

function sanitizePlayerName(name) {
    return String(name || 'Anonymous').trim().slice(0, 32) || 'Anonymous';
}

function normalizeRoomId(roomId) {
    return String(roomId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function sanitizeAvatar(avatar) {
    const value = String(avatar || '').trim();
    if (!value) return null;
    if (value.startsWith('https://cdn.discordapp.com/') || value.startsWith('/img/') || value === 'placeholder.jpg') return value;
    return null;
}

// Round 11J: central deck payload validator used by ready/updateDeck tests and live rooms.
function isDigiEggCard(card) {
    if (!card) return false;
    const type = String(card.type || card.cardType || '').toLowerCase();
    return Number(card.level) === 2 || type.includes('egg') || type.includes('digi-egg');
}

// Round 22DH/22DJ: official Token cardlist entries are searchable assets, not deck material.
function isTokenDeckCard(card) {
    const id = normalizeDeckCardNumber(card);
    const kind = String(card?.cardKind || '').toLowerCase();
    return card?.isToken === true || kind === 'token' || id === 'TOKEN' || /(^|-)TOKEN(?:\d+)?$/.test(id);
}

function findTokenDeckCards(cards = []) {
    return cards.filter(isTokenDeckCard).map(card => normalizeDeckCardNumber(card)).filter(Boolean);
}

function normalizeDeckCard(card) {
    if (!card || typeof card !== 'object') return null;
    const id = String(card.id || '').trim();
    if (!id) return null;
    return {
        ...card,
        id,
        name: String(card.name || id).slice(0, 96),
        type: String(card.type || '').toLowerCase(),
        level: card.level === null || card.level === undefined || card.level === '' ? null : Number(card.level),
        playCost: card.playCost === undefined ? card.play_cost : card.playCost,
        digivolveCost: card.digivolveCost === undefined ? card.evolution_cost : card.digivolveCost,
        img: String(card.img || '').slice(0, 256),
        instanceId: card.instanceId || `${id}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
    };
}

function hasSideDeckPayload(deck) {
    // Round 18O: Bandai Organized Play Tournament Rules Manual (Jun. 6, 2024)
    // states that side decks are not permitted. Keep online BO3 deck handling
    // closer to official tournament flow: one registered deck for the match.
    if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return false;
    const candidates = [deck.sideDeck, deck.side, deck.sides, deck.sideboard, deck.side_deck];
    return candidates.some(value => Array.isArray(value) ? value.length > 0 : !!value);
}



// Round 22BN: official tournament deck legality guard (Banned / Restricted Card Announcement, Mar. 16, 2026).
// This is deck-construction validation only. Keep it outside GameState so battle runtime stays unaffected.
const OFFICIAL_DECK_LEGALITY_SOURCE = 'Banned and Restricted Card Announcement (Mar. 16, 2026) / current affected list';
const OFFICIAL_BANNED_CARD_IDS = new Set([
    'BT5-109', 'BT2-090', 'EX5-065'
]);
const OFFICIAL_RESTRICTED_CARD_LIMITS = new Map([
    ['BT23-032', 1], ['BT3-092', 1], ['BT10-080', 1], ['EX5-059', 1], ['EX5-061', 1],
    ['BT1-090', 1], ['BT6-104', 1], ['BT13-110', 1], ['BT16-011', 1], ['EX3-057', 1],
    ['EX4-006', 1], ['EX1-021', 1], ['BT19-040', 1], ['EX2-070', 1], ['BT4-111', 1],
    ['BT17-069', 1], ['BT4-104', 1], ['P-029', 1], ['P-030', 1], ['BT11-033', 1],
    ['ST9-09', 1], ['EX4-030', 1], ['P-123', 1], ['P-130', 1], ['BT15-057', 1],
    ['BT9-098', 1], ['ST2-13', 1], ['BT14-084', 1], ['BT14-002', 1], ['BT15-102', 1],
    ['EX5-015', 1], ['EX5-018', 1], ['EX5-062', 1], ['BT13-012', 1], ['BT2-069', 1],
    ['BT7-069', 1], ['BT3-054', 1], ['EX2-039', 1], ['P-008', 1], ['P-025', 1],
    ['BT11-064', 1], ['BT7-107', 1], ['BT10-009', 1], ['BT7-038', 1], ['BT7-064', 1],
    ['BT2-047', 1], ['BT3-103', 1], ['BT6-100', 1], ['EX1-068', 1], ['BT7-072', 1]
]);
const OFFICIAL_BANNED_PAIRS = [
    { a: 'EX2-007', b: ['EX7-064'] },
    { a: 'BT20-037', b: ['BT17-035', 'EX8-037'] }
];

function normalizeDeckCardNumber(value) {
    if (value && typeof value === 'object') value = value.id;
    return String(value || '').trim().toUpperCase();
}

function countDeckCardNumbers(cards = []) {
    const counts = new Map();
    for (const card of cards) {
        const id = normalizeDeckCardNumber(card);
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
}

function validateOfficialDeckLegality(cards = []) {
    const counts = countDeckCardNumbers(cards);
    for (const id of OFFICIAL_BANNED_CARD_IDS) {
        if ((counts.get(id) || 0) > 0) {
            return { ok: false, error: `${id} is banned in official tournament decks and can't be included.` };
        }
    }
    for (const [id, limit] of OFFICIAL_RESTRICTED_CARD_LIMITS.entries()) {
        const count = counts.get(id) || 0;
        if (count > limit) {
            return { ok: false, error: `${id} is restricted to ${limit} copy in official tournament decks. Current: ${count}.` };
        }
    }
    for (const pair of OFFICIAL_BANNED_PAIRS) {
        if ((counts.get(pair.a) || 0) <= 0) continue;
        const hit = pair.b.find(id => (counts.get(id) || 0) > 0);
        if (hit) {
            return { ok: false, error: `Official banned pair violation: ${pair.a} can't be included with ${hit}.` };
        }
    }
    return { ok: true, source: OFFICIAL_DECK_LEGALITY_SOURCE };
}

function splitDeckPayload(deck) {
    const cards = Array.isArray(deck) ? deck.map(normalizeDeckCard).filter(Boolean) : [];
    const eggs = cards.filter(isDigiEggCard);
    const main = cards.filter(card => !isDigiEggCard(card));
    return { cards, main, eggs };
}

function validateDeckForReady(deck) {
    if (hasSideDeckPayload(deck)) return { ok: false, error: 'Official Digimon tournaments do not permit side decks. Export only the 50-card main deck plus up to 5 Digi-Eggs.' };
    if (!Array.isArray(deck)) return { ok: false, error: 'Deck is missing.' };
    const { cards, main, eggs } = splitDeckPayload(deck);
    if (cards.length !== deck.length) return { ok: false, error: 'Deck contains invalid card data. Please re-export the deck.' };
    if (cards.length === 0) return { ok: false, error: 'Deck is empty. Please load a deck before readying up.' };
    if (cards.length > 55) return { ok: false, error: 'Deck payload is too large. Main deck must be 50 plus up to 5 Digi-Eggs.' };
    if (main.length !== 50) return { ok: false, error: `Main deck must contain exactly 50 cards. Current: ${main.length}.` };
    if (eggs.length > 5) return { ok: false, error: `Digi-Egg deck can contain at most 5 cards. Current: ${eggs.length}.` };
    const counts = new Map();
    for (const card of cards) {
        const id = normalizeDeckCardNumber(card);
        const n = (counts.get(id) || 0) + 1;
        counts.set(id, n);
        if (n > 4) return { ok: false, error: `Too many copies of ${id}. Maximum is 4.` };
    }
    const tokenCards = findTokenDeckCards(cards);
    if (tokenCards.length) return { ok: false, error: `Official Token cards cannot be included in decks: ${[...new Set(tokenCards)].join(', ')}.` };
    const officialLegality = validateOfficialDeckLegality(cards);
    if (!officialLegality.ok) return officialLegality;
    return { ok: true, mainCount: main.length, eggCount: eggs.length, cardCount: cards.length, officialLegality: officialLegality.source };
}


// Round 22CX: official report helpers for Codex/live-bot match writers.
// The guarded server path already knows the true action phase, end snapshot
// phase, and official deck legality. Keep these helpers in server.js so report
// writers do not infer success from stale logs or confuse end-of-turn HATCH
// snapshots with the official Main Phase action window.
function buildOfficialDeckLegalityReport(deck) {
    const checks = [];
    const push = (id, label, ok, detail = '') => checks.push({ id, label, ok: !!ok, detail: String(detail || '') });

    if (hasSideDeckPayload(deck)) {
        push('sideDeck', 'No side deck payload', false, 'Official Digimon tournament decks do not permit side decks.');
        return { ok: false, source: OFFICIAL_DECK_LEGALITY_SOURCE, checks, error: 'Official Digimon tournaments do not permit side decks.' };
    }
    if (!Array.isArray(deck)) {
        push('payload', 'Deck payload exists', false, 'Deck is missing or not an array.');
        return { ok: false, source: OFFICIAL_DECK_LEGALITY_SOURCE, checks, error: 'Deck is missing.' };
    }

    const { cards, main, eggs } = splitDeckPayload(deck);
    push('payload', 'Deck payload valid', cards.length === deck.length && cards.length > 0 && cards.length <= 55, `${cards.length}/${deck.length} cards normalized`);
    push('main50', 'Main deck exactly 50', main.length === 50, `Current: ${main.length}`);
    push('eggMax5', 'Digi-Egg deck at most 5', eggs.length <= 5, `Current: ${eggs.length}`);

    const counts = countDeckCardNumbers(cards);
    let copyOk = true;
    let copyDetail = 'All card numbers are at 4 copies or fewer.';
    for (const [id, n] of counts.entries()) {
        if (n > 4) {
            copyOk = false;
            copyDetail = `${id} has ${n} copies.`;
            break;
        }
    }
    push('copyCount', 'Copy count at most 4', copyOk, copyDetail);

    const tokenCards = findTokenDeckCards(cards);
    push('tokenCards', 'Official Token cards cannot be included in decks', tokenCards.length === 0, tokenCards.length ? [...new Set(tokenCards)].join(', ') : 'No Token cards present.');

    let bannedOk = true;
    let bannedDetail = 'No banned cards present.';
    for (const id of OFFICIAL_BANNED_CARD_IDS) {
        const n = counts.get(id) || 0;
        if (n > 0) {
            bannedOk = false;
            bannedDetail = `${id} is banned and appears ${n} time(s).`;
            break;
        }
    }
    push('banned', 'Official banned list', bannedOk, bannedDetail);

    let restrictedOk = true;
    let restrictedDetail = 'All restricted cards are within official limits.';
    for (const [id, limit] of OFFICIAL_RESTRICTED_CARD_LIMITS.entries()) {
        const n = counts.get(id) || 0;
        if (n > limit) {
            restrictedOk = false;
            restrictedDetail = `${id} is restricted to ${limit}; current ${n}.`;
            break;
        }
    }
    push('restricted', 'Official restricted list', restrictedOk, restrictedDetail);

    let pairOk = true;
    let pairDetail = 'No official banned-pair conflict present.';
    for (const pair of OFFICIAL_BANNED_PAIRS) {
        if ((counts.get(pair.a) || 0) <= 0) continue;
        const hit = pair.b.find(id => (counts.get(id) || 0) > 0);
        if (hit) {
            pairOk = false;
            pairDetail = `${pair.a} cannot be included with ${hit}.`;
            break;
        }
    }
    push('bannedPair', 'Official banned-pair list', pairOk, pairDetail);

    const ok = checks.every(c => c.ok);
    const failed = checks.find(c => !c.ok);
    return {
        ok,
        source: OFFICIAL_DECK_LEGALITY_SOURCE,
        mainCount: main.length,
        eggCount: eggs.length,
        cardCount: cards.length,
        checks,
        error: failed ? `${failed.label}: ${failed.detail}` : null
    };
}

function formatOfficialDeckValidationForReport(deck) {
    const report = buildOfficialDeckLegalityReport(deck);
    const lines = report.checks.map(check => `- ${check.label}: ${check.ok ? 'PASS' : 'FAIL'}${check.detail ? ` (${check.detail})` : ''}`);
    if (report.source) lines.push(`- Official legality source: ${report.source}`);
    return { ...report, markdown: lines.join('\n') };
}

function getOfficialActionReportEntry(actionResult = {}, fallbackDecision = '') {
    const telemetry = actionResult.actionTelemetry || actionResult.telemetry || {};
    const ok = actionResult.ok !== false;
    const actionApplied = telemetry.actionApplied !== undefined ? telemetry.actionApplied : ok;
    const status = ok && actionApplied ? 'APPLIED' : (ok ? 'NO_CHANGE' : 'REJECTED');
    return {
        decision: String(fallbackDecision || telemetry.type || actionResult.type || 'action'),
        includeInSuccessfulDecisions: ok && actionApplied,
        status,
        ok,
        actionApplied: !!actionApplied,
        actionPhase: telemetry.actionPhase || null,
        endSnapshotPhase: telemetry.endSnapshotPhase || telemetry.afterPhase || null,
        reason: ok ? null : (actionResult.error || 'Action rejected by official guarded action path.'),
        telemetry
    };
}

function formatOfficialTurnStateForReport(turn = {}) {
    const telemetry = turn.actionTelemetry || turn.lastGuardedActionTelemetry || turn.summary?.lastGuardedActionTelemetry || {};
    const actionPhase = turn.actionPhase || telemetry.actionPhase || turn.officialActionPhase || null;
    const endSnapshotPhase = turn.endSnapshotPhase || telemetry.endSnapshotPhase || telemetry.afterPhase || turn.phase || null;
    const memory = turn.memory ?? turn.summary?.memory ?? telemetry.memoryAfter ?? null;
    const nextPlayer = turn.nextPlayer || turn.summary?.turnPlayer || telemetry.afterTurnPlayer || null;
    const security = turn.security || null;
    const line = [
        `memory ${memory}`,
        `next ${nextPlayer || 'unknown'}`,
        `actionPhase ${actionPhase || 'unknown'}`,
        `endSnapshotPhase ${endSnapshotPhase || 'unknown'}`
    ].join(', ');
    return { actionPhase, endSnapshotPhase, memory, nextPlayer, security, line: `State: ${line}` };
}

function buildOfficialSuccessfulDecisions(actionResults = []) {
    return (Array.isArray(actionResults) ? actionResults : [])
        .map(entry => getOfficialActionReportEntry(entry.result || entry, entry.decision || entry.label || ''))
        .filter(entry => entry.includeInSuccessfulDecisions)
        .map(entry => entry.decision);
}


function sanitizeResumeToken(value) {
    const token = String(value || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
    return token || null;
}


// Round 18B: Official setup gate. Manual 6.0 / CRM 4.0 require players to
// determine the starting player before drawing opening hands; the winner of
// rock-paper-scissors automatically goes first.
const RPS_CHOICES = new Set(['rock', 'paper', 'scissors']);
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

function normalizeRpsChoice(choice) {
    const value = String(choice || '').trim().toLowerCase();
    return RPS_CHOICES.has(value) ? value : null;
}

function getRpsWinner(p1Choice, p2Choice) {
    p1Choice = normalizeRpsChoice(p1Choice);
    p2Choice = normalizeRpsChoice(p2Choice);
    if (!p1Choice || !p2Choice) return null;
    if (p1Choice === p2Choice) return 'tie';
    return RPS_BEATS[p1Choice] === p2Choice ? 'p1' : 'p2';
}

function resetSetupRps(room) {
    if (!room) return;
    room.setupRps = null;
}

function beginSetupRps(room) {
    if (!room) return null;
    room.setupRps = {
        active: true,
        choices: { p1: null, p2: null },
        winner: null,
        lastResult: null,
        tieCount: 0,
        startedAt: Date.now()
    };
    return room.setupRps;
}

function getPublicSetupRps(setupRps) {
    if (!setupRps?.active) return null;
    return {
        active: true,
        choicesMade: {
            p1: !!setupRps.choices?.p1,
            p2: !!setupRps.choices?.p2
        },
        winner: setupRps.winner || null,
        lastResult: setupRps.lastResult || null,
        tieCount: Number(setupRps.tieCount || 0)
    };
}

function getSocketUserKey(socket, payload = {}) {
    const discordId = socket.request?.session?.user?.id;
    if (discordId) return `discord:${discordId}`;
    const clientResumeId = sanitizeResumeToken(payload.clientResumeId || payload.resumeId || socket.handshake?.auth?.clientResumeId);
    if (clientResumeId) return `guest:${clientResumeId}`;
    return `socket:${socket.id}`;
}

function publicGameSeatMeta(room) {
    return {
        p1: room.players?.p1 ? { connected: room.players.p1.connected !== false, disconnectedAt: room.players.p1.disconnectedAt || null } : null,
        p2: room.players?.p2 ? { connected: room.players.p2.connected !== false, disconnectedAt: room.players.p2.disconnectedAt || null } : null
    };
}

function findSeatBySocket(room, socketId) {
    if (!room?.players) return null;
    if (room.players.p1?.id === socketId) return 'p1';
    if (room.players.p2?.id === socketId) return 'p2';
    return null;
}

function findSeatByUserKey(room, userKey) {
    if (!room?.players || !userKey) return null;
    if (room.players.p1?.userKey === userKey) return 'p1';
    if (room.players.p2?.userKey === userKey) return 'p2';
    return null;
}

function makePlayerSeat(socket, payload = {}, existing = {}) {
    return {
        ...existing,
        id: socket.id,
        userKey: getSocketUserKey(socket, payload),
        name: sanitizePlayerName(payload.playerName || existing.name),
        avatar: sanitizeAvatar(payload.avatar) || existing.avatar || null,
        deck: Array.isArray(payload.deck) ? splitDeckPayload(payload.deck).cards : (existing.deck || null),
        ready: existing.ready || false,
        connected: true,
        disconnectedAt: null
    };
}



// Round 11M: reusable room lifecycle helpers for smoke tests and live cleanup.
function getRoomOccupancy(room) {
    const spectators = Array.isArray(room?.spectators) ? room.spectators.length : 0;
    return {
        p1: !!room?.players?.p1,
        p2: !!room?.players?.p2,
        spectators,
        total: (room?.players?.p1 ? 1 : 0) + (room?.players?.p2 ? 1 : 0) + spectators
    };
}

function cleanupRoomIfEmpty(roomId) {
    roomId = normalizeRoomId(roomId);
    const room = rooms[roomId];
    if (!room || room.game) return false;
    const occupancy = getRoomOccupancy(room);
    if (occupancy.total > 0) return false;
    delete rooms[roomId];
    return true;
}

function pruneStaleRooms(now = Date.now(), maxIdleMs = Number(process.env.ROOM_IDLE_MS || 1000 * 60 * 60 * 6)) {
    let removed = 0;
    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        if (!room) return;
        const occupancy = getRoomOccupancy(room);
        const lastActivityAt = Number(room.lastActivityAt || room.createdAt || now);
        if (!room.game && (occupancy.total === 0 || now - lastActivityAt > maxIdleMs)) {
            delete rooms[roomId];
            removed++;
        }
    });
    return removed;
}


// Round 11N: private state payloads. Never send hidden zones (hands/decks/security/egg deck)
// to spectators or the opposing player. The client still receives zone counts via masked arrays.
function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || null));
}

function maskHiddenCard(card, zoneName, index) {
    return {
        id: 'HIDDEN',
        name: 'Hidden Card',
        type: 'hidden',
        img: 'cardback.png',
        hidden: true,
        zone: zoneName,
        // Keep a stable-looking placeholder id for UI diffing without leaking the real card id/name.
        instanceId: `hidden-${zoneName}-${index}`
    };
}

function maskZone(cards, zoneName) {
    return Array.isArray(cards) ? cards.map((card, index) => maskHiddenCard(card, zoneName, index)) : [];
}

function maskPrivatePendingSearch(pending, viewer) {
    if (!pending || pending.privateSearch !== true) return pending;
    const owner = pending.playerId;
    if (viewer === owner) return pending;
    const maskCards = cards => Array.isArray(cards) ? cards.map((card, index) => maskHiddenCard(card, `${owner || 'unknown'}-${pending.privateZone || 'private-search'}`, index)) : cards;
    return {
        ...pending,
        cards: maskCards(pending.cards),
        choices: maskCards(pending.choices),
        candidates: maskCards(pending.candidates),
        revealedCards: maskCards(pending.revealedCards),
        uiPrompt: pending.uiPrompt ? 'Private search in progress.' : pending.uiPrompt,
        instruction: pending.instruction ? 'Private search in progress.' : pending.instruction
    };
}

function sanitizeGameStateForRole(game, role = 'spectator') {
    const state = clonePlain(game);
    if (!state || !state.zones) return state;
    const viewer = (role === 'p1' || role === 'p2') ? role : 'spectator';

    for (const playerId of ['p1', 'p2']) {
        const zone = state.zones[playerId];
        if (!zone) continue;

        // Deck order, egg deck order, and security contents are private to everyone in a live match.
        zone.deck = maskZone(zone.deck, `${playerId}-deck`);
        zone.eggDeck = maskZone(zone.eggDeck, `${playerId}-eggDeck`);
        zone.security = maskZone(zone.security, `${playerId}-security`);

        // A player sees only their own hand. Spectators see no hands.
        if (viewer !== playerId) {
            zone.hand = maskZone(zone.hand, `${playerId}-hand`);
        }
    }

    // Round 22EO: effects that search private zones (for example BT11-042
    // Angewomon searching security) must show the choices only to the acting
    // player. Opponents/spectators may see that a pending search exists, but
    // never the hidden security contents being searched.
    state.pendingChoice = maskPrivatePendingSearch(state.pendingChoice, viewer);
    state.pendingReveal = maskPrivatePendingSearch(state.pendingReveal, viewer);

    state.privateViewRole = viewer;
    return state;
}

function emitPrivateStateToSocket(socket, room, role, eventName = 'gameStateUpdate') {
    if (!socket || !room?.game) return;
    socket.emit(eventName, decoratePrivateGamePayload(room, role));
}

function decoratePrivateGamePayload(room, role) {
    const payload = sanitizeGameStateForRole(room.game, role);
    if (payload) {
        payload.match = publicMatchState(room);
        payload.rematch = publicRematchState(room);
    }
    return payload;
}

function emitPrivateGameStartToSocket(socket, roomId, room, role, resumed = false) {
    if (!socket || !room?.game) return;
    socket.emit(resumed ? 'gameResumed' : 'gameStart', {
        p1Id: room.players.p1?.id,
        p2Id: room.players.p2?.id,
        roomId,
        role,
        resumed,
        seatMeta: publicGameSeatMeta(room),
        match: publicMatchState(room),
        state: decoratePrivateGamePayload(room, role)
    });
    emitPrivateStateToSocket(socket, room, role);
}

function emitPrivateStateToRoom(roomId, room) {
    if (!room?.game) return;
    const emitSeat = (role) => {
        const seat = room.players?.[role];
        if (seat?.id) io.to(seat.id).emit('gameStateUpdate', decoratePrivateGamePayload(room, role));
    };
    emitSeat('p1');
    emitSeat('p2');
    (room.spectators || []).forEach(s => {
        if (s?.id) io.to(s.id).emit('gameStateUpdate', decoratePrivateGamePayload(room, 'spectator'));
    });
}


// Round 11V: Socket event contract plus manual coverage documentation exposed for regression tests.
// This keeps the online flow explicit: every live-match state payload must be
// role-private, every gameplay action must pass the server-side action guard,
// and the contract is covered by npm test / test-all.js plus the true Socket.IO harness.
const SOCKET_EVENT_CONTRACT = Object.freeze({
    clientToServer: Object.freeze([
        'createRoom', 'joinRoom', 'resumeRoom', 'switchRole', 'leaveRoom',
        'updatePlayerDeck', 'toggleReady', 'sendChat', 'requestRematch', 'requestNewMatch', 'action'
    ]),
    serverToClient: Object.freeze([
        'roomJoined', 'roomClosed', 'roleSwitched', 'stagingUpdate', 'roomListUpdate',
        'gameStart', 'gameResumed', 'gameStateUpdate', 'playerConnectionUpdate',
        'systemMessage', 'chatMessage', 'rematchUpdate', 'rematchReady', 'matchUpdate'
    ]),
    privateStateEvents: Object.freeze(['gameStart', 'gameResumed', 'gameStateUpdate']),
    actionGuardedEvent: 'action',
    botActionPathGuard: 'executeGuardedRoomAction',
    roomIdNormalizedEvents: Object.freeze([
        'joinRoom', 'resumeRoom', 'switchRole', 'leaveRoom', 'updatePlayerDeck', 'toggleReady', 'requestRematch', 'requestNewMatch', 'action'
    ]),
    payloadPrivacy: Object.freeze({
        p1: 'p1 hand visible; p2 hand/decks/egg/security masked',
        p2: 'p2 hand visible; p1 hand/decks/egg/security masked',
        spectator: 'both hands/decks/egg/security masked'
    })
});

function getSocketEventContractDebug() {
    return {
        round: '11V',
        ...SOCKET_EVENT_CONTRACT,
        exports: {
            sanitizeGameStateForRole: typeof sanitizeGameStateForRole === 'function',
            emitPrivateGameStartToSocket: typeof emitPrivateGameStartToSocket === 'function',
            emitPrivateStateToRoom: typeof emitPrivateStateToRoom === 'function',
            canSocketPerformAction: typeof canSocketPerformAction === 'function',
            normalizeRoomId: typeof normalizeRoomId === 'function',
            trueSocketIoHarness: true,
            oneClickRegressionRunner: fs.existsSync(path.join(__dirname, 'test-all.js')),
            manualCoverageChecklist: fs.existsSync(path.join(__dirname, 'manual-rule-coverage-11v.json'))
        }
    };
}

function getRoomLifecycleDebug(roomId) {
    roomId = normalizeRoomId(roomId);
    const room = rooms[roomId];
    if (!room) return null;
    return {
        roomId,
        isStarted: !!room.game,
        createdAt: room.createdAt || null,
        lastActivityAt: room.lastActivityAt || null,
        occupancy: getRoomOccupancy(room),
        seats: publicGameSeatMeta(room),
        match: publicMatchState(room),
        rematch: publicRematchState(room),
        spectators: Array.isArray(room.spectators) ? room.spectators.map(s => ({ id: s.id, name: s.name })) : []
    };
}

function emitGameResume(socket, roomId, room, role, resumed = false) {
    if (!room?.game) return false;
    emitPrivateGameStartToSocket(socket, roomId, room, role, resumed);
    socket.to(roomId).emit('playerConnectionUpdate', publicGameSeatMeta(room));
    return true;
}


// Round 11O: central online action permission guard. Frontend checks are only UX;
// server authorization is the source of truth for turn actions, pending choices,
// counter/block windows, and reconnect seat ownership.
const TURN_PLAYER_ACTIONS = new Set([
    'hatch', 'play', 'moveBreeding', 'activateBreeding', 'pass', 'activateDelay',
    'declareAttack', 'dnaDigivolve', 'attachToStack', 'digiXros', 'appFusion', 'assembly', 'resolveManualEffect'
]);

const PENDING_ACTION_TO_FIELD = {
    submitTarget: 'pendingTarget',
    submitChoice: 'pendingChoice',
    submitRevealChoice: 'pendingReveal',
    submitTrashRevive: 'pendingTrashRevive',
    submitProtectionChoice: 'pendingProtection'
};

const DEFENDER_WINDOW_ACTIONS = new Set(['resolveCounter', 'performBlock', 'skipBlock']);
const ALWAYS_SEATED_ACTIONS = new Set(['mulligan', 'resolveEffect', 'surrender']);
const KNOWN_GAME_ACTIONS = new Set([
    ...TURN_PLAYER_ACTIONS,
    ...Object.keys(PENDING_ACTION_TO_FIELD),
    ...DEFENDER_WINDOW_ACTIONS,
    ...ALWAYS_SEATED_ACTIONS
]);

// Round 22CU: official phase/reporting guard. A live driver may issue the
// first Main Phase action while the engine is still parked at HATCH/Breeding
// because the player has nothing to hatch or simply skipped breeding. Officially
// that action happens after entering Main Phase, so normalize HATCH -> MAIN
// before Main Phase actions and expose telemetry for Codex/match reports.
const MAIN_PHASE_GUARDED_ACTIONS = new Set([
    'play', 'declareAttack', 'pass', 'activateDelay', 'activateBreeding',
    'dnaDigivolve', 'attachToStack', 'digiXros', 'appFusion', 'assembly'
]);

function shouldEnterMainBeforeGuardedAction(type) {
    return MAIN_PHASE_GUARDED_ACTIONS.has(String(type || ''));
}

function buildGuardedActionTelemetry(type, permission, beforeSummary, actionSummary, afterSummary, normalization = null, extra = {}) {
    const before = beforeSummary || {};
    const action = actionSummary || before || {};
    const after = afterSummary || action || before || {};
    return {
        round: '22CW',
        type: String(type || ''),
        actorRole: permission?.actorRole || null,
        playerId: permission?.playerId || null,
        requestTurnPlayer: before.turnPlayer || null,
        requestTurnCount: before.turnCount ?? null,
        requestPhase: before.phase || null,
        actionTurnPlayer: action.turnPlayer || before.turnPlayer || null,
        actionTurnCount: action.turnCount ?? before.turnCount ?? null,
        actionPhase: action.phase || before.phase || null,
        afterTurnPlayer: after.turnPlayer || null,
        afterTurnCount: after.turnCount ?? null,
        afterPhase: after.phase || null,
        endSnapshotPhase: after.phase || null,
        memoryBefore: before.memory ?? null,
        memoryAtAction: action.memory ?? before.memory ?? null,
        memoryAfter: after.memory ?? null,
        normalizedFromBreeding: normalization?.from === 'HATCH' && normalization?.to === 'MAIN',
        normalization: normalization || null,
        turnTransitioned: (before.turnPlayer && after.turnPlayer && before.turnPlayer !== after.turnPlayer) || (before.turnCount !== undefined && after.turnCount !== undefined && before.turnCount !== after.turnCount),
        phaseTransitioned: before.phase !== after.phase,
        reportGuidance: 'Use actionPhase/actionTurnCount for per-action or per-turn official action summaries; use endSnapshotPhase only for the after-action board snapshot.',
        ...extra
    };
}

function getSocketActorRole(room, socketId) {
    if (!room || !socketId) return 'spectator';
    if (room.players?.p1?.id === socketId) return 'p1';
    if (room.players?.p2?.id === socketId) return 'p2';
    return 'spectator';
}

function hasBlockingPending(game) {
    return Boolean(
        game?.pendingTarget ||
        game?.pendingReveal ||
        game?.pendingChoice ||
        game?.pendingTrashRevive ||
        game?.pendingProtection ||
        game?.pendingEffectSelection
    );
}

function getEffectOwnerForRequest(game, data = {}) {
    const queue = Array.isArray(game?.effectQueue) ? game.effectQueue : [];
    if (queue.length === 0) return null;
    const effectId = data.effectId;
    const effect = effectId ? queue.find(e => e?.id === effectId) : queue[0];
    return effect?.playerId || null;
}

function getPendingOwnerForAction(game, type) {
    const field = PENDING_ACTION_TO_FIELD[type];
    if (!field) return null;
    const pending = game?.[field];
    return pending?.playerId || null;
}

function canSocketPerformAction(room, socketId, data = {}) {
    const game = room?.game;
    const type = String(data.type || '');
    const actorRole = getSocketActorRole(room, socketId);

    if (!game) return { ok: false, actorRole, error: 'Game is not active.' };
    if (!KNOWN_GAME_ACTIONS.has(type)) return { ok: false, actorRole, error: `Unknown action: ${type}` };
    if (actorRole !== 'p1' && actorRole !== 'p2') {
        return { ok: false, actorRole, error: `Spectators cannot perform gameplay action: ${type}` };
    }

    const requestedPlayerId = data.playerId ? String(data.playerId) : actorRole;
    if (requestedPlayerId !== actorRole) {
        return { ok: false, actorRole, playerId: requestedPlayerId, error: `Action spoof rejected: ${requestedPlayerId} != ${actorRole}` };
    }

    if (type === 'surrender') {
        return { ok: true, actorRole, playerId: actorRole };
    }

    if (type === 'mulligan') {
        if (game.phase !== 'MULLIGAN') return { ok: false, actorRole, playerId: actorRole, error: 'Mulligan is not active.' };
        return { ok: true, actorRole, playerId: actorRole };
    }

    if (type in PENDING_ACTION_TO_FIELD) {
        const owner = getPendingOwnerForAction(game, type);
        if (!owner) return { ok: false, actorRole, playerId: actorRole, error: `${type} has no active pending request.` };
        if (owner !== actorRole) return { ok: false, actorRole, playerId: actorRole, error: `${type} belongs to ${owner}, not ${actorRole}.` };
        return { ok: true, actorRole, playerId: actorRole };
    }

    if (DEFENDER_WINDOW_ACTIONS.has(type)) {
        const step = game.counterTiming?.step || 'IDLE';
        const defenderId = game.counterTiming?.defenderId || null;
        if (!game.counterTiming?.isActive || defenderId !== actorRole) {
            return { ok: false, actorRole, playerId: actorRole, error: `${type} is only available to the defending player.` };
        }
        if (type === 'resolveCounter' && step !== 'COUNTER') {
            return { ok: false, actorRole, playerId: actorRole, error: 'Counter timing is not active.' };
        }
        if ((type === 'performBlock' || type === 'skipBlock') && step !== 'BLOCKER') {
            return { ok: false, actorRole, playerId: actorRole, error: 'Blocker timing is not active.' };
        }
        return { ok: true, actorRole, playerId: actorRole };
    }

    if (type === 'resolveEffect') {
        const owner = getEffectOwnerForRequest(game, data);
        if (owner && owner !== actorRole) {
            return { ok: false, actorRole, playerId: actorRole, error: `Effect resolution belongs to ${owner}, not ${actorRole}.` };
        }
        return { ok: true, actorRole, playerId: actorRole };
    }

    if (TURN_PLAYER_ACTIONS.has(type)) {
        if (hasBlockingPending(game)) {
            return { ok: false, actorRole, playerId: actorRole, error: `${type} blocked while a pending flow is active.` };
        }
        if (game.counterTiming?.isActive) {
            return { ok: false, actorRole, playerId: actorRole, error: `${type} blocked during counter/block timing.` };
        }
        if (game.turnPlayer !== actorRole) {
            return { ok: false, actorRole, playerId: actorRole, error: `${type} is only available to the turn player.` };
        }
        if (type !== 'pass' && typeof game.isMemoryOnOpponentSide === 'function' && game.isMemoryOnOpponentSide(actorRole)) {
            game.checkTurnEnd?.();
            return { ok: false, actorRole, playerId: actorRole, error: `${type} blocked: memory is already on opponent side.` };
        }
        return { ok: true, actorRole, playerId: actorRole };
    }

    return { ok: false, actorRole, playerId: actorRole, error: `Unhandled action permission: ${type}` };
}




// Round 20B: shared guarded action dispatcher for live bots/tools.
// Automation must go through the same server permission gate and action switch
// as a real Socket.IO client. Do not call GameState methods directly from a
// spectator bot or test driver, or it can bypass turn, memory, pending, and
// match-recording guards.
function getSelectedChoicePayloadForAction(data = {}) {
    const { selectedCardInstanceId, targetInstanceId } = data;
    return Array.isArray(data.selectedCardInstanceIds) ? data.selectedCardInstanceIds
        : (Array.isArray(data.choiceIds) ? data.choiceIds
        : (Array.isArray(data.selectedIds) ? data.selectedIds
        : (Object.prototype.hasOwnProperty.call(data, 'selectedCardInstanceId') ? selectedCardInstanceId : targetInstanceId)));
}

function normalizeGuardedGameActionResult(type, result) {
    // Round 22CW: GameState methods return false for official illegal/no-op
    // actions (for example, a DUAL card being normally played/digivolved from
    // hand). Do not let the server guard/report convert that false into
    // action:...:true; Codex/live bots must see the action as rejected.
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'ok')) {
        return result.ok ? { ok: true, ...result } : { ok: false, ...result };
    }
    if (result === false) {
        return { ok: false, error: `${String(type || 'action')} was rejected by official GameState rules or made no legal change.` };
    }
    return { ok: true };
}

function applyGameAction(game, data = {}, socketLike = null) {
    if (!game) return { ok: false, error: 'Game is not active.' };
    const { type, playerId, card, zone, targetInstanceId, actionType, blastData, attackerInstanceId, targetType, effectId, blockerInstanceId, handCard, targetId1, targetId2, selectedCardInstanceId, choice, targetIds, sourceInstanceId } = data;
    const selectedChoiceId = getSelectedChoicePayloadForAction(data);
    let result;
    switch (type) {
        case 'surrender': result = game.surrender(playerId); break;
        case 'mulligan': {
            const accepted = game.decideMulligan(playerId, data.doMulligan);
            if (!accepted && game.phase === 'MULLIGAN' && socketLike?.emit) socketLike.emit('systemMessage', `Waiting for ${String(game.nextMulliganPlayer || game.getExpectedMulliganPlayer?.() || 'the other player').toUpperCase()} to decide mulligan first.`);
            result = accepted;
            break;
        }
        case 'hatch': result = game.hatchEgg(playerId); break;
        case 'play': result = game.playOrEvolve(playerId, card, zone, targetInstanceId); break;
        case 'moveBreeding': result = game.moveBreedingToBattle(playerId); break;
        case 'activateBreeding': result = game.activateBreedingEffect(playerId, data.instanceId || targetInstanceId); break;
        case 'pass':
            if (game.turnPlayer === playerId) result = game.passTurn();
            else return { ok: false, error: `${playerId} cannot pass outside their own turn.` };
            break;
        case 'activateDelay': result = game.activateDelay(playerId, data.instanceId); break;
        case 'declareAttack': result = game.declareAttack(playerId, attackerInstanceId, targetType, targetInstanceId); break;
        case 'resolveCounter': result = game.resolveCounter(playerId, actionType, blastData); break;
        case 'performBlock': result = game.performBlock(playerId, blockerInstanceId); break;
        case 'skipBlock': result = game.skipBlock(playerId); break;
        case 'resolveEffect': result = game.resolveEffect(effectId); break;
        case 'dnaDigivolve': result = game.dnaEvolve(playerId, handCard, targetId1, targetId2); break;
        case 'digiXros': result = game.digiXros(playerId, handCard || card, Array.isArray(targetIds) ? targetIds : [targetId1, targetId2].filter(Boolean)); break;
        case 'appFusion': result = game.appFusion(playerId, handCard || card, targetInstanceId || targetId1); break;
        case 'assembly': result = game.assembly(playerId, sourceInstanceId || selectedCardInstanceId, targetInstanceId || targetId1); break;
        case 'attachToStack': result = game.attachToStack(playerId, data.sourceInstanceId, data.targetInstanceId); break;
        case 'submitTarget': result = game.submitTarget(playerId, targetInstanceId); break;
        case 'submitChoice': result = game.submitChoice(playerId, selectedChoiceId); break;
        case 'submitRevealChoice': result = game.submitRevealChoice(playerId, selectedCardInstanceId); break;
        case 'submitTrashRevive': result = game.submitTrashRevive(playerId, selectedCardInstanceId); break;
        case 'submitProtectionChoice': result = game.submitProtectionChoice(playerId, choice); break;
        case 'resolveManualEffect': result = game.resolveManualEffect(playerId, data.effectIndex, data.confirmed); break;
        default: return { ok: false, error: `Unhandled action: ${type}` };
    }
    return normalizeGuardedGameActionResult(type, result);
}

function executeGuardedRoomAction(room, socketId, data = {}, options = {}) {
    const game = room?.game;
    if (!room || !game) return { ok: false, error: 'Room/game is not active.' };
    if (game.gameOver) return { ok: false, error: 'Game is already over.' };
    const permission = canSocketPerformAction(room, socketId, data);
    if (!permission.ok) return { ...permission, ok: false };

    const type = String(data.type || '');
    const beforeSummary = typeof game.getDebugSummary === 'function' ? game.getDebugSummary() : { turnPlayer: game.turnPlayer, turnCount: game.turnCount, phase: game.phase, memory: game.memory };
    let normalization = null;

    if (game.phase === 'HATCH' && game.turnPlayer === permission.playerId && shouldEnterMainBeforeGuardedAction(type)) {
        const fromPhase = game.phase;
        if (typeof game.enterMainPhase === 'function') game.enterMainPhase(permission.playerId);
        normalization = {
            from: fromPhase,
            to: game.phase,
            reason: 'Round 22CU official Breeding/Hatch skip before Main Phase action'
        };

        // Entering Main Phase can itself create mandatory/optional windows
        // or move memory to the opponent side. Do not let the originally
        // requested action bypass those official windows.
        if (hasBlockingPending(game) || game.counterTiming?.isActive || (Array.isArray(game.effectQueue) && game.effectQueue.length > 0)) {
            const blockedSummary = typeof game.getDebugSummary === 'function' ? game.getDebugSummary() : { turnPlayer: game.turnPlayer, turnCount: game.turnCount, phase: game.phase, memory: game.memory };
            const actionTelemetry = buildGuardedActionTelemetry(type, permission, beforeSummary, blockedSummary, blockedSummary, normalization, { blockedAfterMainEntry: true });
            game.lastGuardedActionTelemetry = actionTelemetry;
            return { ...permission, actionTelemetry, ok: false, error: `${type} blocked after entering Main Phase because a start-of-main pending/effect window is active.` };
        }
        if (typeof game.isMemoryOnOpponentSide === 'function' && game.isMemoryOnOpponentSide(permission.playerId)) {
            game.checkTurnEnd?.();
            const blockedSummary = typeof game.getDebugSummary === 'function' ? game.getDebugSummary() : { turnPlayer: game.turnPlayer, turnCount: game.turnCount, phase: game.phase, memory: game.memory };
            const actionTelemetry = buildGuardedActionTelemetry(type, permission, beforeSummary, blockedSummary, blockedSummary, normalization, { blockedAfterMainEntry: true });
            game.lastGuardedActionTelemetry = actionTelemetry;
            return { ...permission, actionTelemetry, ok: false, error: `${type} blocked after entering Main Phase: memory is already on opponent side.` };
        }
    }

    const actionSummary = typeof game.getDebugSummary === 'function' ? game.getDebugSummary() : { turnPlayer: game.turnPlayer, turnCount: game.turnCount, phase: game.phase, memory: game.memory };
    const wasGameOver = !!game.gameOver;
    const actionData = { ...data, playerId: permission.playerId };
    const applied = applyGameAction(game, actionData, options.socketLike || null);
    const afterSummary = typeof game.getDebugSummary === 'function' ? game.getDebugSummary() : { turnPlayer: game.turnPlayer, turnCount: game.turnCount, phase: game.phase, memory: game.memory };
    const actionTelemetry = buildGuardedActionTelemetry(type, permission, beforeSummary, actionSummary, afterSummary, normalization, { actionApplied: !!applied?.ok });
    game.lastGuardedActionTelemetry = actionTelemetry;
    if (!applied.ok) return { ...permission, actionTelemetry, ok: false, error: applied.error || 'Action failed.' };
    const matchRecorded = !wasGameOver && game.gameOver && recordFinishedGameForMatch(room);
    if (matchRecorded) game.match = publicMatchState(room);
    return { ok: true, actorRole: permission.actorRole, playerId: permission.playerId, matchRecorded, actionTelemetry };
}

function createLiveBotSocketActionGuard(room, socketId) {
    return Object.freeze({
        dispatch(data = {}) { return executeGuardedRoomAction(room, socketId, data); },
        can(data = {}) { return canSocketPerformAction(room, socketId, data); },
        actorRole() { return getSocketActorRole(room, socketId); }
    });
}

// Round 18M: post-game rematch consensus. A single player requesting rematch
// should not immediately destroy the final board state; both seated players must
// agree, then the room returns to staging and the next game must go through RPS.
function ensureRematchRequests(room) {
    if (!room) return new Set();
    if (!(room.rematchRequests instanceof Set)) {
        const raw = room.rematchRequests;
        room.rematchRequests = new Set(Array.isArray(raw) ? raw.filter(x => x === 'p1' || x === 'p2') : []);
    }
    return room.rematchRequests;
}

function publicRematchState(room) {
    const req = ensureRematchRequests(room);
    return {
        p1: req.has('p1'),
        p2: req.has('p2'),
        readyCount: (req.has('p1') ? 1 : 0) + (req.has('p2') ? 1 : 0),
        requiredCount: 2
    };
}

function clearRematchRequests(room) {
    if (!room) return;
    room.rematchRequests = new Set();
}

function shouldStartRematch(room) {
    const req = ensureRematchRequests(room);
    return !!(room?.players?.p1 && room?.players?.p2 && req.has('p1') && req.has('p2'));
}

// Round 18P: Match History / Replay Log v1. Keep replay data public-safe,
// append-only, and capped so it is useful for disputes without leaking hidden zones
// or growing the live room payload without limit.
const MATCH_HISTORY_LOG_LIMIT = 120;

function sanitizeMatchHistoryLogEntry(entry) {
    return String(entry || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 240);
}

function buildFinishedGameHistoryEntry(room, gameNo, winner) {
    const game = room?.game;
    const logs = Array.isArray(game?.actionLogs) ? game.actionLogs : [];
    return {
        gameNumber: gameNo,
        winner,
        loser: game?.loser || (winner === 'p1' ? 'p2' : 'p1'),
        reason: game?.gameOverReason || 'GAME_OVER',
        finishedAt: Date.now(),
        finalTurn: Number(game?.turnCount || 0),
        finalPhase: game?.phase || null,
        finalMemory: Number(game?.memory || 0),
        logCount: logs.length,
        logs: logs.slice(-MATCH_HISTORY_LOG_LIMIT).map(sanitizeMatchHistoryLogEntry).filter(Boolean)
    };
}

function publicMatchHistory(room) {
    const m = ensureMatchState(room);
    return m.completedGames.map(g => ({
        gameNumber: g.gameNumber,
        winner: g.winner,
        loser: g.loser,
        reason: g.reason,
        finishedAt: g.finishedAt,
        finalTurn: g.finalTurn || 0,
        finalPhase: g.finalPhase || null,
        finalMemory: Number(g.finalMemory || 0),
        logCount: Number(g.logCount || (Array.isArray(g.logs) ? g.logs.length : 0)),
        logs: Array.isArray(g.logs) ? g.logs.map(sanitizeMatchHistoryLogEntry).filter(Boolean) : []
    }));
}

// Round 18N: BO3 match-series shell. Game-level rules remain inside GameState;
// the room tracks only match score / game number / next-game consensus.
function createDefaultMatchState() {
    return {
        bestOf: 3,
        wins: { p1: 0, p2: 0 },
        gameNumber: 1,
        matchOver: false,
        matchWinner: null,
        lastGameWinner: null,
        lastGameReason: null,
        completedGames: [],
        deckLocked: false,
        registeredDeckFingerprints: { p1: null, p2: null }
    };
}

function ensureMatchState(room) {
    if (!room) return createDefaultMatchState();
    const raw = room.match && typeof room.match === 'object' ? room.match : {};
    const wins = raw.wins && typeof raw.wins === 'object' ? raw.wins : {};
    room.match = {
        bestOf: Number(raw.bestOf || 3),
        wins: {
            p1: Math.max(0, Number(wins.p1 || 0)),
            p2: Math.max(0, Number(wins.p2 || 0))
        },
        gameNumber: Math.max(1, Number(raw.gameNumber || 1)),
        matchOver: !!raw.matchOver,
        matchWinner: raw.matchWinner === 'p1' || raw.matchWinner === 'p2' ? raw.matchWinner : null,
        lastGameWinner: raw.lastGameWinner === 'p1' || raw.lastGameWinner === 'p2' ? raw.lastGameWinner : null,
        lastGameReason: raw.lastGameReason || null,
        completedGames: Array.isArray(raw.completedGames) ? raw.completedGames.slice(0, 3).map(g => ({
            gameNumber: Math.max(1, Number(g.gameNumber || 1)),
            winner: g.winner === 'p1' || g.winner === 'p2' ? g.winner : null,
            loser: g.loser === 'p1' || g.loser === 'p2' ? g.loser : null,
            reason: g.reason || 'GAME_OVER',
            finishedAt: Number(g.finishedAt || Date.now()),
            finalTurn: Number(g.finalTurn || 0),
            finalPhase: g.finalPhase || null,
            finalMemory: Number(g.finalMemory || 0),
            logCount: Number(g.logCount || (Array.isArray(g.logs) ? g.logs.length : 0)),
            logs: Array.isArray(g.logs) ? g.logs.slice(-MATCH_HISTORY_LOG_LIMIT).map(sanitizeMatchHistoryLogEntry).filter(Boolean) : []
        })).filter(g => g.winner) : [],
        deckLocked: !!raw.deckLocked,
        registeredDeckFingerprints: {
            p1: raw.registeredDeckFingerprints?.p1 || null,
            p2: raw.registeredDeckFingerprints?.p2 || null
        }
    };
    if (room.match.wins.p1 >= 2 || room.match.wins.p2 >= 2) {
        room.match.matchOver = true;
        room.match.matchWinner = room.match.wins.p1 >= 2 ? 'p1' : 'p2';
    }
    return room.match;
}

function publicMatchState(room) {
    const m = ensureMatchState(room);
    return {
        bestOf: m.bestOf,
        wins: { p1: m.wins.p1, p2: m.wins.p2 },
        gameNumber: m.gameNumber,
        matchOver: !!m.matchOver,
        matchWinner: m.matchWinner || null,
        lastGameWinner: m.lastGameWinner || null,
        lastGameReason: m.lastGameReason || null,
        completedGames: publicMatchHistory(room),
        historyLogLimit: MATCH_HISTORY_LOG_LIMIT,
        deckLocked: !!m.deckLocked
    };
}

function clearMatchState(room) {
    if (!room) return createDefaultMatchState();
    room.match = createDefaultMatchState();
    clearRematchRequests(room);
    return room.match;
}

function canonicalDeckFingerprint(deck) {
    // Round 18O: registered-deck fingerprint ignores physical order/instance ids
    // but preserves the exact main/egg card id counts used for the match.
    const { main, eggs } = splitDeckPayload(Array.isArray(deck) ? deck : []);
    const countIds = list => list
        .map(c => String(c.id || '').trim())
        .filter(Boolean)
        .sort()
        .reduce((rows, id) => {
            const last = rows[rows.length - 1];
            if (last && last.id === id) last.count += 1;
            else rows.push({ id, count: 1 });
            return rows;
        }, []);
    return JSON.stringify({ main: countIds(main), eggs: countIds(eggs) });
}

function registerMatchDecks(room) {
    const m = ensureMatchState(room);
    if (!room?.players?.p1?.deck || !room?.players?.p2?.deck) return false;
    if (!m.deckLocked) {
        m.registeredDeckFingerprints = {
            p1: canonicalDeckFingerprint(room.players.p1.deck),
            p2: canonicalDeckFingerprint(room.players.p2.deck)
        };
        m.deckLocked = true;
        return true;
    }
    return false;
}

function isDeckChangeLockedForMatch(room) {
    const m = ensureMatchState(room);
    return !!(m.deckLocked && !m.matchOver);
}

function validateRegisteredDecksStillMatch(room) {
    const m = ensureMatchState(room);
    if (!m.deckLocked) return { ok: true };
    for (const role of ['p1', 'p2']) {
        const expected = m.registeredDeckFingerprints?.[role];
        const actual = canonicalDeckFingerprint(room?.players?.[role]?.deck || []);
        if (expected && actual !== expected) {
            return { ok: false, error: `${role.toUpperCase()} deck differs from the registered match deck. Start a new match before changing decks.` };
        }
    }
    return { ok: true };
}

function recordFinishedGameForMatch(room) {
    if (!room?.game?.gameOver) return false;
    const m = ensureMatchState(room);
    if (m.matchOver && m.matchWinner) return false;
    const winner = room.game.winner;
    if (winner !== 'p1' && winner !== 'p2') return false;
    const gameNo = Math.max(1, Number(m.gameNumber || 1));
    if (m.completedGames.some(g => Number(g.gameNumber) === gameNo)) return false;
    m.wins[winner] = Number(m.wins[winner] || 0) + 1;
    m.lastGameWinner = winner;
    m.lastGameReason = room.game.gameOverReason || 'GAME_OVER';
    m.completedGames.push(buildFinishedGameHistoryEntry(room, gameNo, winner));
    if (m.wins[winner] >= 2) {
        m.matchOver = true;
        m.matchWinner = winner;
        if (room.game) {
            room.game.matchOver = true;
            room.game.matchWinner = winner;
        }
    }
    return true;
}

// 提取房间状态用于前端备战室渲染
const getRoomState = (room) => {
    return {
        hostId: room.hostId, 
        p1: room.players.p1 ? { id: room.players.p1.id, name: room.players.p1.name, avatar: room.players.p1.avatar, ready: room.players.p1.ready, connected: room.players.p1.connected !== false } : null,
        p2: room.players.p2 ? { id: room.players.p2.id, name: room.players.p2.name, avatar: room.players.p2.avatar, ready: room.players.p2.ready, connected: room.players.p2.connected !== false } : null,
        spectators: room.spectators.map(s => ({ id: s.id, name: s.name })), 
        setupRps: getPublicSetupRps(room.setupRps),
        rematch: publicRematchState(room),
        match: publicMatchState(room),
        isStarted: room.game !== null
    };
};


// Round 18N: reset a finished game back to staging for the next BO3 game.
function resetRoomForRematch(roomId, room) {
    if (!room || !room.game || !room.game.gameOver) return { ok: false, error: 'Game is not finished yet.' };
    const m = ensureMatchState(room);
    if (m.matchOver) return { ok: false, error: 'Match is already over. Start a new match instead.' };
    room.game = null;
    m.gameNumber = Math.min(3, Number(m.completedGames.length || 0) + 1);
    clearRematchRequests(room);
    resetSetupRps(room);
    if (room.players?.p1) room.players.p1.ready = false;
    if (room.players?.p2) room.players.p2.ready = false;
    room.lastActivityAt = Date.now();
    return { ok: true, state: getRoomState(room) };
}

function resetRoomForNewMatch(roomId, room) {
    if (!room) return { ok: false, error: 'Room not found.' };
    room.game = null;
    clearMatchState(room);
    resetSetupRps(room);
    if (room.players?.p1) room.players.p1.ready = false;
    if (room.players?.p2) room.players.p2.ready = false;
    room.lastActivityAt = Date.now();
    return { ok: true, state: getRoomState(room) };
}

io.on('connection', (socket) => {
    console.log('玩家连接:', socket.id);

    // 🔥 1. 新增：全服广播大厅状态的专属雷达
    // 📡 全服广播：增加“防御性编程”，防止读取不到 players 导致崩溃
    const broadcastLobby = () => {
        const availableRooms = Object.keys(rooms)
            // 🔥 增加检查：确保房间存在、有 players 且没开打
            .filter(id => rooms[id] && rooms[id].players && !rooms[id].game)
            .map(id => {
                const room = rooms[id];
                return {
                    id,
                    // 使用可选链 ?. 即使数据没到位也不会崩，只会显示 Waiting
                    p1Name: room.players?.p1?.name || "Waiting...",
                    p2Name: room.players?.p2?.name || "Waiting...",
                    count: Object.keys(room.players || {}).length
                };
            });
        io.emit('roomListUpdate', availableRooms);
    };

    // 玩家刚连上时，先给他发一次列表
    broadcastLobby();

    // 1. 创建房间 (挂载 hostId)
    socket.on('createRoom', ({ playerName, deck, avatar }) => {
        const deckCheck = validateDeckForReady(deck);
        if (!deckCheck.ok) {
            socket.emit('systemMessage', deckCheck.error);
            return;
        }
        pruneStaleRooms();
        if (Object.keys(rooms).length >= MAX_ROOMS) {
            socket.emit('systemMessage', 'Server room limit reached. Please try again later.');
            return;
        }
        let roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        while (rooms[roomId]) roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            hostId: socket.id,
            players: { p1: makePlayerSeat(socket, { playerName, deck, avatar }, { ready: false }), p2: null },
            spectators: [], 
            game: null,
            setupRps: null,
            rematchRequests: new Set(),
            match: createDefaultMatchState(),
            createdAt: Date.now(),
            lastActivityAt: Date.now()
        };
        socket.join(roomId);
        socket.emit('roomJoined', { roomId, role: 'p1', state: getRoomState(rooms[roomId]) });
        broadcastLobby();
    });

    // ==========================================
    // 最终修复版 joinRoom（头像 + 卡组一次性解决）
    function joinOrResumeRoom(payload = {}, explicitResume = false) {
        let { roomId, playerName, avatar = null, deck = null } = payload;
        roomId = normalizeRoomId(roomId);
        if (!roomId) {
            socket.emit('systemMessage', 'Invalid room code.');
            return;
        }
        if (!rooms[roomId]) pruneStaleRooms();
        if (!rooms[roomId] && explicitResume) {
            socket.emit('systemMessage', 'Room not found or no resumable seat exists.');
            return;
        }
        if (!rooms[roomId]) {
            const deckCheck = validateDeckForReady(deck);
            if (!deckCheck.ok) {
                socket.emit('systemMessage', deckCheck.error);
                return;
            }
        }
        if (!rooms[roomId] && Object.keys(rooms).length >= MAX_ROOMS) {
            socket.emit('systemMessage', 'Server room limit reached. Please try again later.');
            return;
        }
        socket.join(roomId);

        if (!rooms[roomId]) {
            rooms[roomId] = { 
                hostId: null,
                players: { p1: null, p2: null }, 
                spectators: [], 
                game: null,
                setupRps: null,
                rematchRequests: new Set(),
                match: createDefaultMatchState(),
                readyPlayers: new Map(),
                createdAt: Date.now(),
                lastActivityAt: Date.now()
            };
        }

        const room = rooms[roomId];
        room.lastActivityAt = Date.now();
        const userKey = getSocketUserKey(socket, payload);
        let role = findSeatByUserKey(room, userKey) || findSeatBySocket(room, socket.id);
        const payloadForSeat = { playerName, avatar, deck, clientResumeId: payload.clientResumeId, resumeId: payload.resumeId };

        // Round 11I: reconnect/resume existing seat first, before falling back to open-seat join.
        if (role === 'p1' || role === 'p2') {
            room.players[role] = makePlayerSeat(socket, payloadForSeat, room.players[role]);
            room.spectators = (room.spectators || []).filter(s => s.id !== socket.id && s.userKey !== userKey);
            socket.emit('roomJoined', { roomId, role, resumed: true, state: getRoomState(room) });
            if (room.game) {
                emitGameResume(socket, roomId, room, role, true);
            } else {
                io.to(roomId).emit('stagingUpdate', getRoomState(room));
            }
            broadcastLobby();
            return;
        }

        if (!explicitResume) {
            if (!room.players.p1) {
                const deckCheck = validateDeckForReady(deck);
                if (!deckCheck.ok) {
                    socket.emit('systemMessage', deckCheck.error);
                    cleanupRoomIfEmpty(roomId);
                    return;
                }
                role = 'p1';
                room.players.p1 = makePlayerSeat(socket, payloadForSeat, { ready: false });
            } else if (!room.players.p2 && room.players.p1.id !== socket.id) {
                const deckCheck = validateDeckForReady(deck);
                if (!deckCheck.ok) {
                    socket.emit('systemMessage', deckCheck.error);
                    return;
                }
                role = 'p2';
                room.players.p2 = makePlayerSeat(socket, payloadForSeat, { ready: false });
            } else {
                role = 'spectator';
                room.spectators = (room.spectators || []).filter(s => s.id !== socket.id && s.userKey !== userKey);
                room.spectators.push({ id: socket.id, userKey, name: sanitizePlayerName(playerName) });
            }
        } else {
            // A resume request that cannot match an old seat should not steal an open seat.
            role = 'spectator';
            room.spectators = (room.spectators || []).filter(s => s.id !== socket.id && s.userKey !== userKey);
            room.spectators.push({ id: socket.id, userKey, name: sanitizePlayerName(playerName) });
        }

        socket.emit('roomJoined', { 
            roomId, 
            role,
            resumed: false,
            state: getRoomState(room) 
        });

        if (room.game) {
            emitGameResume(socket, roomId, room, role, false);
        } else {
            io.to(roomId).emit('stagingUpdate', getRoomState(room));
        }
        broadcastLobby();
    }

    socket.on('joinRoom', (payload = {}) => joinOrResumeRoom(payload, false));
    socket.on('resumeRoom', (payload = {}) => joinOrResumeRoom(payload, true));

    // 3. 自由换座
    socket.on('switchRole', ({ roomId, toRole }) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room || room.game || !['p1', 'p2', 'spectator'].includes(toRole)) return;

        const currentRole = room.players.p1?.id === socket.id ? 'p1'
            : room.players.p2?.id === socket.id ? 'p2'
            : (room.spectators || []).some(s => s.id === socket.id) ? 'spectator'
            : null;
        if (!currentRole || currentRole === toRole) return;

        // Round 11G: never remove the player from their current seat until the destination is known to be free.
        if ((toRole === 'p1' || toRole === 'p2') && room.players[toRole]) {
            socket.emit('systemMessage', `Seat ${toRole.toUpperCase()} is already occupied.`);
            return;
        }

        let pData = null;
        if (currentRole === 'p1') { pData = room.players.p1; room.players.p1 = null; }
        else if (currentRole === 'p2') { pData = room.players.p2; room.players.p2 = null; }
        else {
            const specIdx = room.spectators.findIndex(s => s.id === socket.id);
            pData = room.spectators[specIdx];
            room.spectators.splice(specIdx, 1);
        }
        if (!pData) return;

        if (toRole === 'p1' || toRole === 'p2') {
            room.players[toRole] = { ...pData, id: socket.id, userKey: pData.userKey || getSocketUserKey(socket, {}), ready: false, connected: true, disconnectedAt: null };
        } else {
            // Avoid duplicate spectator rows when clients reconnect or double-click.
            const userKey = pData.userKey || getSocketUserKey(socket, {});
            room.spectators = (room.spectators || []).filter(s => s.id !== socket.id && s.userKey !== userKey);
            room.spectators.push({ id: socket.id, userKey, name: pData.name });
        }
        resetSetupRps(room);
        room.lastActivityAt = Date.now();

        io.to(roomId).emit('roleSwitched', { socketId: socket.id, newRole: toRole });
        io.to(roomId).emit('stagingUpdate', getRoomState(room));
        broadcastLobby();
    });
    

    // 4. 退出房间
    socket.on('leaveRoom', ({ roomId }) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room) return;

        if (socket.id === room.hostId) {
            io.to(roomId).emit('roomClosed', 'HOST CLOSED THE ROOM (房主已解散房间).');
            delete rooms[roomId];
            broadcastLobby();
        } else {
            if (room.players.p1 && room.players.p1.id === socket.id) room.players.p1 = null;
            else if (room.players.p2 && room.players.p2.id === socket.id) room.players.p2 = null;
            else room.spectators = room.spectators.filter(s => s.id !== socket.id);

            socket.leave(roomId);
            if (cleanupRoomIfEmpty(roomId)) {
                broadcastLobby();
                return;
            }
            room.lastActivityAt = Date.now();
            io.to(roomId).emit('stagingUpdate', getRoomState(room));
            broadcastLobby();
        }
    });

    // 5. 换牌指令
    socket.on('updatePlayerDeck', ({ roomId, role, deck }) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room || room.game || !['p1', 'p2'].includes(role)) return;

        if (room.players[role] && room.players[role].id === socket.id) {
            if (isDeckChangeLockedForMatch(room)) {
                socket.emit('systemMessage', 'Deck changes are locked for this BO3 match. Official tournament flow permits one registered deck and no side deck between games. Start a new match to change decks.');
                return;
            }
            const deckCheck = validateDeckForReady(deck);
            if (!deckCheck.ok) {
                socket.emit('systemMessage', deckCheck.error);
                return;
            }
            room.players[role].deck = Array.isArray(deck) ? splitDeckPayload(deck).cards : null;
            room.players[role].ready = false; 
            resetSetupRps(room);
            room.lastActivityAt = Date.now();
            io.to(roomId).emit('stagingUpdate', getRoomState(room));
            console.log(`>> [ROOM ${roomId}] ${role} 更换了卡组`);
        }
    });

    // 6. 准备按钮（最终修复版：保证 deck 正确传入 GameState + 立即推送初始状态）
    socket.on('toggleReady', ({ roomId, role }) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room || !['p1', 'p2'].includes(role) || !room.players[role] || room.game) return;
        if (room.players[role].id !== socket.id) {
            console.warn(`🚫 Socket ${socket.id} tried to toggle ready for ${role}`);
            return;
        }
        const deckCheck = validateDeckForReady(room.players[role].deck);
        if (!deckCheck.ok) {
            socket.emit('systemMessage', deckCheck.error);
            return;
        }
        const registeredDeckCheck = validateRegisteredDecksStillMatch(room);
        if (!registeredDeckCheck.ok) {
            socket.emit('systemMessage', registeredDeckCheck.error);
            return;
        }
    
        room.players[role].ready = !room.players[role].ready;
        if (!room.players[role].ready) resetSetupRps(room);
        room.lastActivityAt = Date.now();

        // Round 18B: both players ready opens the official rock-paper-scissors
        // setup gate. The GameState is created only after a non-tie result, so
        // opening hands are drawn after the first player is known.
        if (room.players.p1.ready && room.players.p2 && room.players.p2.ready) {
            beginSetupRps(room);
            io.to(roomId).emit('systemMessage', 'Official setup: choose Rock / Paper / Scissors. Winner goes first; mulligan declarations start with that first player.');
        }
        io.to(roomId).emit('stagingUpdate', getRoomState(room));
    });

    socket.on('submitRps', ({ roomId, role, choice }) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        const seat = ['p1', 'p2'].includes(role) ? role : findSeatBySocket(room, socket.id);
        const normalized = normalizeRpsChoice(choice);
        if (!room || room.game || !room.setupRps?.active || !['p1', 'p2'].includes(seat) || !normalized) return;
        if (!room.players?.[seat] || room.players[seat].id !== socket.id) return;
        if (!room.players.p1?.ready || !room.players.p2?.ready) return;

        room.setupRps.choices[seat] = normalized;
        room.lastActivityAt = Date.now();

        const p1Choice = room.setupRps.choices.p1;
        const p2Choice = room.setupRps.choices.p2;
        if (p1Choice && p2Choice) {
            const result = getRpsWinner(p1Choice, p2Choice);
            if (result === 'tie') {
                room.setupRps.tieCount = Number(room.setupRps.tieCount || 0) + 1;
                room.setupRps.lastResult = { type: 'tie', p1: p1Choice, p2: p2Choice };
                room.setupRps.choices = { p1: null, p2: null };
                io.to(roomId).emit('systemMessage', `Rock-Paper-Scissors tied (${p1Choice}). Choose again.`);
                io.to(roomId).emit('stagingUpdate', getRoomState(room));
                return;
            }

            const deckRegistrationCheck = validateRegisteredDecksStillMatch(room);
            if (!deckRegistrationCheck.ok) {
                io.to(roomId).emit('systemMessage', deckRegistrationCheck.error);
                resetSetupRps(room);
                io.to(roomId).emit('stagingUpdate', getRoomState(room));
                return;
            }
            registerMatchDecks(room);
            const p1 = room.players.p1;
            const p2 = room.players.p2;
            room.setupRps.winner = result;
            room.setupRps.lastResult = { type: 'win', p1: p1Choice, p2: p2Choice, winner: result };
            room.game = new GameState(
                { name: p1.name, avatar: p1.avatar || null },
                { name: p2.name, avatar: p2.avatar || null },
                p1.deck || [],
                p2.deck || [],
                { startingPlayer: result }
            );
            room.game.match = publicMatchState(room);
            room.game.addLog(`✊ Game ${publicMatchState(room).gameNumber} Rock-Paper-Scissors: ${result.toUpperCase()} wins and goes first. Mulligan declarations start with ${result.toUpperCase()}.`);

            emitPrivateGameStartToSocket(io.to(p1.id), roomId, room, 'p1', false);
            emitPrivateGameStartToSocket(io.to(p2.id), roomId, room, 'p2', false);
            (room.spectators || []).forEach(s => {
                if (s?.id) emitPrivateGameStartToSocket(io.to(s.id), roomId, room, 'spectator', false);
            });
            console.log(`✅ [ROOM ${roomId}] RPS winner ${result.toUpperCase()} starts. Choices: P1=${p1Choice}, P2=${p2Choice}`);
            return;
        }

        io.to(roomId).emit('stagingUpdate', getRoomState(room));
    });

    // 7. 聊天
    socket.on('sendChat', ({ roomId, sender, message }) => {
        roomId = normalizeRoomId(roomId);
        if (!rooms[roomId]) return;
        const safeSender = sanitizePlayerName(sender);
        const safeMessage = String(message || '').trim().slice(0, 500);
        if (!safeMessage) return;
        rooms[roomId].lastActivityAt = Date.now();
        io.to(roomId).emit('chatMessage', { sender: safeSender, message: safeMessage });
    });

    // Round 18M: rematch requires both seated players to agree. The first
    // request only marks consent and keeps the final board visible for players
    // and spectators; the second request resets the room back to staging/RPS.
    socket.on('requestRematch', ({ roomId } = {}) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room) return;
        const role = getSocketActorRole(room, socket.id);
        if (role !== 'p1' && role !== 'p2') {
            socket.emit('systemMessage', 'Only seated players can request a rematch.');
            return;
        }
        if (!room.game || !room.game.gameOver) {
            socket.emit('systemMessage', 'Next game is only available after the current game is finished.');
            return;
        }
        if (ensureMatchState(room).matchOver) {
            socket.emit('systemMessage', 'The BO3 match is already over. Start a new match instead.');
            return;
        }

        const requests = ensureRematchRequests(room);
        requests.add(role);
        room.lastActivityAt = Date.now();
        io.to(roomId).emit('rematchUpdate', { roomId, rematch: publicRematchState(room), requestedBy: role });

        if (!shouldStartRematch(room)) {
            io.to(roomId).emit('systemMessage', `${role.toUpperCase()} requested next game. Waiting for the other player.`);
            return;
        }

        const result = resetRoomForRematch(roomId, room);
        if (!result.ok) {
            socket.emit('systemMessage', result.error);
            return;
        }
        io.to(roomId).emit('systemMessage', 'Both players accepted next game. Return to READY, then play Rock / Paper / Scissors again.');
        io.to(roomId).emit('rematchReady', { roomId, state: result.state, requestedBy: role });
        io.to(roomId).emit('stagingUpdate', result.state);
        broadcastLobby();
    });



    // Round 18N: after a BO3 match is over, both seated players must agree
    // before the final match result is cleared and a fresh match starts.
    socket.on('requestNewMatch', ({ roomId } = {}) => {
        roomId = normalizeRoomId(roomId);
        const room = rooms[roomId];
        if (!room) return;
        const role = getSocketActorRole(room, socket.id);
        if (role !== 'p1' && role !== 'p2') {
            socket.emit('systemMessage', 'Only seated players can start a new match.');
            return;
        }
        const match = ensureMatchState(room);
        if (!match.matchOver) {
            socket.emit('systemMessage', 'New match is only available after the BO3 match is over.');
            return;
        }
        const requests = ensureRematchRequests(room);
        requests.add(role);
        room.lastActivityAt = Date.now();
        io.to(roomId).emit('rematchUpdate', { roomId, rematch: publicRematchState(room), requestedBy: role, newMatch: true });
        if (!shouldStartRematch(room)) {
            io.to(roomId).emit('systemMessage', `${role.toUpperCase()} requested a new match. Waiting for the other player.`);
            return;
        }
        const result = resetRoomForNewMatch(roomId, room);
        if (!result.ok) {
            socket.emit('systemMessage', result.error);
            return;
        }
        io.to(roomId).emit('matchUpdate', { roomId, match: publicMatchState(room) });
        io.to(roomId).emit('systemMessage', 'Both players accepted a new match. Ready up, then play Rock / Paper / Scissors again.');
        io.to(roomId).emit('rematchReady', { roomId, state: result.state, requestedBy: role, newMatch: true });
        io.to(roomId).emit('stagingUpdate', result.state);
        broadcastLobby();
    });

    socket.on('disconnect', () => {
        console.log('玩家掉线:', socket.id);
        let lobbyChanged = false;

        for (const roomId of Object.keys(rooms)) {
            const room = rooms[roomId];
            if (!room || !room.players) continue;

            let roomChanged = false;
            const markDisconnected = (role) => {
                if (!room.players[role] || room.players[role].id !== socket.id) return;
                if (room.game) {
                    room.players[role].connected = false;
                    room.players[role].disconnectedAt = Date.now();
                    room.players[role].id = null;
                } else {
                    room.players[role] = null;
                    lobbyChanged = true;
                }
                roomChanged = true;
            };
            markDisconnected('p1');
            markDisconnected('p2');
            const beforeSpecs = (room.spectators || []).length;
            room.spectators = (room.spectators || []).filter(s => s.id !== socket.id);
            if (room.spectators.length !== beforeSpecs) roomChanged = true;

            if (roomChanged && room.game) {
                io.to(roomId).emit('playerConnectionUpdate', publicGameSeatMeta(room));
            }
            if (roomChanged && !room.game) io.to(roomId).emit('stagingUpdate', getRoomState(room));

            if (cleanupRoomIfEmpty(roomId)) {
                lobbyChanged = true;
            }
        }
        if (lobbyChanged) broadcastLobby();
    });

    // 8. 指令分发中心
    socket.on('action', (data = {}) => {
        data.roomId = normalizeRoomId(data.roomId);
        const room = rooms[data.roomId];
        if (!room || !room.game || room.game.gameOver) return;
        room.lastActivityAt = Date.now();
        const game = room.game;
        const wasGameOver = !!game.gameOver;
        const permission = canSocketPerformAction(room, socket.id, data);
        if (!permission.ok) {
            console.warn(`🚫 [ACTION GUARD] ${permission.error}`);
            socket.emit('systemMessage', permission.error);
            return;
        }

        const applied = executeGuardedRoomAction(room, socket.id, data, { socketLike: socket });
        if (!applied.ok) {
            console.warn(`🚫 [ACTION GUARD] ${applied.error}`);
            socket.emit('systemMessage', applied.error || 'Action rejected.');
            // Round 22EO: executeGuardedRoomAction may legitimately mutate state
            // before rejecting the original action, e.g. HATCH -> MAIN opens a
            // Start-of-Main pending/effect window. Emit the updated private state
            // so the owning player sees the required choice instead of a dead UI.
            emitPrivateStateToRoom(data.roomId, room);
            return;
        }
        game.autoResolveSystemEffects?.();
        if (applied.matchRecorded) {
            io.to(data.roomId).emit('matchUpdate', { roomId: data.roomId, match: publicMatchState(room) });
        }
        emitPrivateStateToRoom(data.roomId, room);
    });
});

// Round 18P: public-safe match history JSON export for dispute/debug review.
app.get('/api/rooms/:roomId/match-history', (req, res) => {
    const roomId = normalizeRoomId(req.params.roomId);
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room_not_found' });
    res.json({ roomId, match: publicMatchState(room), history: publicMatchHistory(room) });
});

// Round 22DL: Bandai Organized Play tournament administration endpoints.
// This is the scorekeeper/judge layer around matches: Swiss pairings, match
// points, AMW/OMW standings, end-of-round procedures, drops, and penalties.
function publicTournamentState(event) {
    if (!event) return null;
    return {
        id: event.id,
        source: event.source,
        format: event.format,
        matchStructure: event.matchStructure,
        roundCount: event.roundCount,
        topCut: event.topCut,
        currentRound: event.currentRound,
        pairingsPostedRound: event.pairingsPostedRound,
        players: event.players.map(p => ({
            id: p.id,
            name: p.name,
            seed: p.seed,
            dropped: !!p.dropped,
            disqualified: !!p.disqualified,
            penaltyCount: Array.isArray(p.penalties) ? p.penalties.length : 0
        })),
        rounds: event.rounds,
        standings: TournamentAdmin.calculateStandings(event),
        penalties: event.penalties || [],
        judgeCalls: event.judgeCalls || []
    };
}

app.get('/api/tournament-admin/rules', (req, res) => {
    res.json({
        source: TournamentAdmin.OFFICIAL_TOURNAMENT_ADMIN_SOURCE,
        matchPoints: TournamentAdmin.MATCH_POINTS,
        penaltyTypes: TournamentAdmin.PENALTY_TYPES,
        features: [
            'Swiss pairings with no-repeat preference and odd-player bye assignment',
            'Match points: win/bye 3, draw 1, loss 0',
            'AMW and OMW tie-breakers with the official 0.33 floor',
            'End-of-round extra-turn and top-cut tiebreak helpers',
            'Judge call, time extension, penalty, disqualification, and drop records'
        ]
    });
});

app.post('/api/tournaments', (req, res) => {
    try {
        const event = TournamentAdmin.createTournament(req.body?.players || [], req.body || {});
        tournaments[event.id] = event;
        res.json(publicTournamentState(event));
    } catch (err) {
        res.status(400).json({ error: err.message || 'tournament_create_failed' });
    }
});

app.get('/api/tournaments/:eventId', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    res.json(publicTournamentState(event));
});

app.post('/api/tournaments/:eventId/pairings', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    try {
        const round = TournamentAdmin.pairSwissRound(event, req.body || {});
        res.json({ round, tournament: publicTournamentState(event) });
    } catch (err) {
        res.status(400).json({ error: err.message || 'pairing_failed' });
    }
});

app.post('/api/tournaments/:eventId/results', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    try {
        const result = TournamentAdmin.recordMatchResult(event, req.body?.round, req.body?.table || req.body?.pairing || req.body || {}, req.body?.result || req.body || {}, { force: !!req.body?.force });
        res.json({ result, standings: TournamentAdmin.calculateStandings(event) });
    } catch (err) {
        res.status(400).json({ error: err.message || 'result_failed' });
    }
});

app.post('/api/tournaments/:eventId/penalties', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    try {
        const penalty = TournamentAdmin.issuePenalty(event, req.body || {});
        res.json({ penalty, tournament: publicTournamentState(event) });
    } catch (err) {
        res.status(400).json({ error: err.message || 'penalty_failed' });
    }
});

app.post('/api/tournaments/:eventId/judge-calls', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    try {
        const judgeCall = TournamentAdmin.recordJudgeCall(event, req.body || {});
        res.json({ judgeCall, tournament: publicTournamentState(event) });
    } catch (err) {
        res.status(400).json({ error: err.message || 'judge_call_failed' });
    }
});

app.post('/api/tournaments/:eventId/drops', (req, res) => {
    const event = tournaments[String(req.params.eventId || '')];
    if (!event) return res.status(404).json({ error: 'tournament_not_found' });
    try {
        const player = TournamentAdmin.dropPlayer(event, req.body?.playerId || req.body?.player, req.body || {});
        res.json({ player, tournament: publicTournamentState(event) });
    } catch (err) {
        res.status(400).json({ error: err.message || 'drop_failed' });
    }
});

app.post('/api/tournament-admin/end-of-round', (req, res) => {
    try {
        if (req.body?.betweenGames) return res.json(TournamentAdmin.resolveBetweenGamesTimeout(req.body?.match || {}));
        res.json(TournamentAdmin.resolveOngoingGameTimeout(req.body?.game || {}, req.body || {}));
    } catch (err) {
        res.status(400).json({ error: err.message || 'end_of_round_failed' });
    }
});

// Round 11M: lightweight debug endpoint for room lifecycle smoke checks.
app.get('/api/rooms/:roomId/debug', (req, res) => {
    const debug = getRoomLifecycleDebug(req.params.roomId);
    if (!debug) return res.status(404).json({ error: 'room_not_found' });
    res.json(debug);
});


// Round 11Q: socket event contract endpoint for automated online regression checks.
app.get('/api/socket-contract', (req, res) => {
    res.json(getSocketEventContractDebug());
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
    server.listen(PORT, () => { 
        console.log(`🚀 DTCG Pro v36.6 Production Hardened on Port ${PORT}`); 
    });
}

module.exports = { app, server, io, rooms, tournaments, TournamentAdmin, publicTournamentState, isTokenDeckCard, findTokenDeckCards, getRoomState, validateDeckForReady, validateOfficialDeckLegality, countDeckCardNumbers, splitDeckPayload, normalizeDeckCard, normalizeRoomId, isOriginAllowed, sanitizeResumeToken, getSocketUserKey, findSeatByUserKey, findSeatBySocket, publicGameSeatMeta, getRoomOccupancy, cleanupRoomIfEmpty, pruneStaleRooms, getRoomLifecycleDebug, normalizeRpsChoice, getRpsWinner, sanitizeGameStateForRole, emitPrivateStateToSocket, emitPrivateGameStartToSocket, emitPrivateStateToRoom, SOCKET_EVENT_CONTRACT, getSocketEventContractDebug, resetRoomForRematch, ensureRematchRequests, publicRematchState, shouldStartRematch, createDefaultMatchState, ensureMatchState, publicMatchState, recordFinishedGameForMatch, publicMatchHistory, resetRoomForNewMatch, getSocketActorRole, canSocketPerformAction, getPendingOwnerForAction, getEffectOwnerForRequest, getSelectedChoicePayloadForAction, applyGameAction, executeGuardedRoomAction, createLiveBotSocketActionGuard, buildOfficialDeckLegalityReport, formatOfficialDeckValidationForReport, getOfficialActionReportEntry, formatOfficialTurnStateForReport, buildOfficialSuccessfulDecisions };
