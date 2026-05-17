const fs = require('fs');
const path = require('path');

// Round 22CY: official Codex/live-bot match report writer.
// Round 22CZ: CLI/runner adapter. This file must run even in a stripped Codex
// report folder where Express/Socket.IO dependencies are not installed, so it
// falls back to standalone copies of the pure report/deck helper semantics.
// The guarded action path returns per-action telemetry. This writer consumes
// actionApplied/includeInSuccessfulDecisions instead of inferring success from
// logs, so rejected/no-op actions stay out of successful decisions and
// actionPhase is never confused with the after-action/endSnapshot phase.
const OFFICIAL_DECK_LEGALITY_SOURCE = 'Banned and Restricted Card Announcement (Mar. 16, 2026) / current affected list';
const OFFICIAL_BANNED_CARD_IDS = new Set(['BT5-109', 'BT2-090', 'EX5-065']);
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

function isDigiEggCard(card) {
    if (!card) return false;
    const type = String(card.type || card.cardType || '').toLowerCase();
    return Number(card.level) === 2 || type.includes('egg') || type.includes('digi-egg');
}

// Round 22DH/22DJ: Token cardlist records are searchable assets only, never deck material.
function isTokenDeckCard(card) {
    const id = normalizeDeckCardNumber(card);
    const kind = String(card?.cardKind || '').toLowerCase();
    return card?.isToken === true || kind === 'token' || id === 'TOKEN' || /(^|-)TOKEN(?:\d+)?$/.test(id);
}

function findTokenDeckCards(cards = []) {
    return cards.filter(isTokenDeckCard).map(card => normalizeDeckCardNumber(card)).filter(Boolean);
}

function hasSideDeckPayload(deck) {
    if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return false;
    return [deck.sideDeck, deck.side, deck.sides, deck.sideboard, deck.side_deck]
        .some(value => Array.isArray(value) ? value.length > 0 : !!value);
}

function splitDeckPayload(deck) {
    const cards = Array.isArray(deck) ? deck.filter(card => card && typeof card === 'object' && normalizeDeckCardNumber(card)) : [];
    const eggs = cards.filter(isDigiEggCard);
    const main = cards.filter(card => !isDigiEggCard(card));
    return { cards, main, eggs };
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

function fallbackBuildOfficialDeckLegalityReport(deck) {
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
        if (n > 4) { copyOk = false; copyDetail = `${id} has ${n} copies.`; break; }
    }
    push('copyCount', 'Copy count at most 4', copyOk, copyDetail);
    const tokenCards = findTokenDeckCards(cards);
    push('tokenCards', 'Official Token cards cannot be included in decks', tokenCards.length === 0, tokenCards.length ? [...new Set(tokenCards)].join(', ') : 'No Token cards present.');
    let bannedOk = true;
    let bannedDetail = 'No banned cards present.';
    for (const id of OFFICIAL_BANNED_CARD_IDS) {
        const n = counts.get(id) || 0;
        if (n > 0) { bannedOk = false; bannedDetail = `${id} is banned and appears ${n} time(s).`; break; }
    }
    push('banned', 'Official banned list', bannedOk, bannedDetail);
    let restrictedOk = true;
    let restrictedDetail = 'All restricted cards are within official limits.';
    for (const [id, limit] of OFFICIAL_RESTRICTED_CARD_LIMITS.entries()) {
        const n = counts.get(id) || 0;
        if (n > limit) { restrictedOk = false; restrictedDetail = `${id} is restricted to ${limit}; current ${n}.`; break; }
    }
    push('restricted', 'Official restricted list', restrictedOk, restrictedDetail);
    let pairOk = true;
    let pairDetail = 'No official banned-pair conflict present.';
    for (const pair of OFFICIAL_BANNED_PAIRS) {
        if ((counts.get(pair.a) || 0) <= 0) continue;
        const hit = pair.b.find(id => (counts.get(id) || 0) > 0);
        if (hit) { pairOk = false; pairDetail = `${pair.a} cannot be included with ${hit}.`; break; }
    }
    push('bannedPair', 'Official banned-pair list', pairOk, pairDetail);
    const ok = checks.every(c => c.ok);
    const failed = checks.find(c => !c.ok);
    return { ok, source: OFFICIAL_DECK_LEGALITY_SOURCE, mainCount: main.length, eggCount: eggs.length, cardCount: cards.length, checks, error: failed ? `${failed.label}: ${failed.detail}` : null };
}

function fallbackFormatOfficialDeckValidationForReport(deck) {
    const report = fallbackBuildOfficialDeckLegalityReport(deck);
    const lines = report.checks.map(check => `- ${check.label}: ${check.ok ? 'PASS' : 'FAIL'}${check.detail ? ` (${check.detail})` : ''}`);
    if (report.source) lines.push(`- Official legality source: ${report.source}`);
    return { ...report, markdown: lines.join('\n') };
}

function fallbackGetOfficialActionReportEntry(actionResult = {}, fallbackDecision = '') {
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

function fallbackFormatOfficialTurnStateForReport(turn = {}) {
    const telemetry = turn.actionTelemetry || turn.lastGuardedActionTelemetry || turn.summary?.lastGuardedActionTelemetry || {};
    const actionPhase = turn.actionPhase || telemetry.actionPhase || turn.officialActionPhase || null;
    const endSnapshotPhase = turn.endSnapshotPhase || telemetry.endSnapshotPhase || telemetry.afterPhase || turn.phase || null;
    const memory = turn.memory ?? turn.summary?.memory ?? telemetry.memoryAfter ?? null;
    const nextPlayer = turn.nextPlayer || turn.summary?.turnPlayer || telemetry.afterTurnPlayer || null;
    const line = [`memory ${memory}`, `next ${nextPlayer || 'unknown'}`, `actionPhase ${actionPhase || 'unknown'}`, `endSnapshotPhase ${endSnapshotPhase || 'unknown'}`].join(', ');
    return { actionPhase, endSnapshotPhase, memory, nextPlayer, line: `State: ${line}` };
}

function fallbackBuildOfficialSuccessfulDecisions(actionResults = []) {
    return (Array.isArray(actionResults) ? actionResults : [])
        .map(entry => fallbackGetOfficialActionReportEntry(entry.result || entry, entry.decision || entry.label || ''))
        .filter(entry => entry.includeInSuccessfulDecisions)
        .map(entry => entry.decision);
}

function loadServerHelpers() {
    try {
        return require('./server.js');
    } catch (e) {
        return {
            buildOfficialDeckLegalityReport: fallbackBuildOfficialDeckLegalityReport,
            formatOfficialDeckValidationForReport: fallbackFormatOfficialDeckValidationForReport,
            getOfficialActionReportEntry: fallbackGetOfficialActionReportEntry,
            formatOfficialTurnStateForReport: fallbackFormatOfficialTurnStateForReport,
            buildOfficialSuccessfulDecisions: fallbackBuildOfficialSuccessfulDecisions,
            _standaloneFallback: true,
            _fallbackReason: e.message
        };
    }
}
const serverHelpers = loadServerHelpers();

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function safeString(value, fallback = '') {
    const out = String(value ?? fallback ?? '').trim();
    return out || String(fallback || '').trim();
}

function expandCountedDeckArray(deck = []) {
    if (!Array.isArray(deck)) return deck;
    const out = [];
    for (const card of deck) {
        const count = Math.max(1, Number(card?.count || 1));
        for (let i = 0; i < count; i++) {
            const copy = card && typeof card === 'object' ? { ...card } : card;
            if (copy && typeof copy === 'object') {
                delete copy.count;
                if (!copy.instanceId && copy.id) copy.instanceId = `${copy.id}-report-${out.length}`;
            }
            out.push(copy);
        }
    }
    return out;
}

function normalizeReportDecklists(decklists) {
    if (!decklists || typeof decklists !== 'object') return decklists;
    const root = decklists.players && (Array.isArray(decklists.players.p1) || Array.isArray(decklists.players.p2))
        ? decklists.players
        : (decklists.decklists && (Array.isArray(decklists.decklists.p1) || Array.isArray(decklists.decklists.p2)) ? decklists.decklists : decklists);
    return {
        ...root,
        p1: Array.isArray(root.p1) ? expandCountedDeckArray(root.p1) : root.p1,
        p2: Array.isArray(root.p2) ? expandCountedDeckArray(root.p2) : root.p2
    };
}

function getPlayerDeck(report = {}, playerId, options = {}) {
    const decklists = normalizeReportDecklists(options.decklists || report.decklists || report.edgeDecklists || report.decks || null);
    if (Array.isArray(decklists?.[playerId])) return decklists[playerId];
    if (Array.isArray(decklists?.players?.[playerId])) return decklists.players[playerId];
    if (Array.isArray(report.players?.[playerId]?.deck)) return report.players[playerId].deck;
    if (Array.isArray(report.players?.[playerId]?.decklist)) return report.players[playerId].decklist;
    return null;
}

function formatDeckValidationBlock(report = {}, options = {}) {
    const lines = ['## Deck Validation'];
    const pids = ['p1', 'p2'];
    let foundDeck = false;

    for (const pid of pids) {
        const deck = getPlayerDeck(report, pid, options);
        const name = report.players?.[pid]?.deckName || report.players?.[pid]?.name || pid.toUpperCase();
        if (!Array.isArray(deck)) continue;
        foundDeck = true;
        const validation = serverHelpers.formatOfficialDeckValidationForReport(deck);
        lines.push('', `### ${pid.toUpperCase()} - ${name}`, validation.markdown);
    }

    if (!foundDeck) {
        lines.push('', '- Full official deck legality: NOT AVAILABLE (runner did not provide decklists to the report writer).');
        lines.push('- Required runner input: pass p1/p2 decklists so banned/restricted/banned-pair checks can be printed.');
        const validations = asArray(report.validations);
        if (validations.length) lines.push('- Legacy validations:', ...validations.map(v => `  - ${typeof v === 'string' ? v : JSON.stringify(v)}`));
    }
    return lines.join('\n');
}

function getTurnActionResults(turn = {}) {
    const candidates = [
        turn.actionResults,
        turn.officialActionResults,
        turn.guardActionResults,
        turn.guardedActionResults,
        turn.actionsApplied,
        turn.actionReportEntries
    ];
    for (const value of candidates) {
        if (Array.isArray(value) && value.length) return value;
    }
    return [];
}

function buildTurnReportModel(turn = {}) {
    const actionResults = getTurnActionResults(turn);
    const actionEntries = actionResults.map((entry, index) => {
        const result = entry?.result || entry;
        const decision = entry?.decision || entry?.label || asArray(turn.decisions)[index] || result?.actionTelemetry?.type || result?.type || 'action';
        return serverHelpers.getOfficialActionReportEntry(result, decision);
    });

    const successfulDecisions = actionEntries.length
        ? actionEntries.filter(e => e.includeInSuccessfulDecisions).map(e => e.decision)
        : asArray(turn.decisions);

    const rejectedOrNoChange = actionEntries.filter(e => !e.includeInSuccessfulDecisions);
    const lastTelemetry = [...actionEntries].reverse().find(e => e.telemetry)?.telemetry || turn.lastGuardedActionTelemetry || turn.summary?.lastGuardedActionTelemetry || null;
    const legacyActionPhase = !lastTelemetry && successfulDecisions.some(d => /^(Main|Attack|End):/i.test(String(d || ''))) ? 'MAIN' : null;
    const state = serverHelpers.formatOfficialTurnStateForReport({
        ...turn,
        actionPhase: turn.actionPhase || legacyActionPhase,
        actionTelemetry: lastTelemetry || turn.actionTelemetry,
        phase: turn.phase
    });

    return {
        turnNo: turn.turnNo || turn.turn || '?',
        player: turn.player || turn.turnPlayer || '?',
        successfulDecisions,
        rejectedOrNoChange,
        actionEntries,
        state,
        guardRejections: asArray(turn.rejections).length
    };
}

function formatTurnMarkdown(turnModel) {
    const lines = [`### Turn ${turnModel.turnNo} - ${String(turnModel.player).toUpperCase()}`];
    if (turnModel.successfulDecisions.length) {
        for (const decision of turnModel.successfulDecisions) lines.push(`- ${decision}`);
    } else {
        lines.push('- No applied gameplay action recorded.');
    }
    if (turnModel.rejectedOrNoChange.length) {
        lines.push('', 'Rejected / no-change actions:');
        for (const entry of turnModel.rejectedOrNoChange) {
            const reason = entry.reason || (entry.status === 'NO_CHANGE' ? 'Action produced no board change.' : 'Action rejected.');
            lines.push(`- ${entry.status}: ${entry.decision}${reason ? ` (${reason})` : ''}`);
        }
    }
    lines.push('', turnModel.state.line);
    lines.push(`Guard rejections: ${turnModel.guardRejections}`);
    return lines.join('\n');
}

function buildOfficialMatchReportPayload(report = {}, options = {}) {
    const turnModels = asArray(report.turns).map(buildTurnReportModel);
    const enriched = {
        ...report,
        officialReport: {
            round: '22CZ',
            guidance: 'Round 22CZ CLI/runner adapter: successful decisions are derived from guarded action telemetry; rejected/no-op actions are excluded. actionPhase is the official action timing; endSnapshotPhase is the after-action board snapshot. The writer can be invoked directly by Codex/live-bot runners after a structured match log is produced.',
            deckValidation: formatDeckValidationBlock(report, options),
            turns: turnModels
        }
    };
    return { json: enriched, markdown: formatOfficialMatchMarkdown(enriched, options) };
}

function formatOfficialMatchMarkdown(report = {}, options = {}) {
    const raw = report.officialReport ? report : buildOfficialMatchReportPayload(report, options).json;
    const final = raw.final || {};
    const lines = [
        '# Guarded Index Official Match Report',
        '',
        `- Created: ${safeString(raw.createdAt, new Date().toISOString())}`,
        raw.indexUrl ? `- Index game URL: ${raw.indexUrl}` : null,
        raw.roomId ? `- Room: ${raw.roomId}` : null,
        raw.profile ? `- Match profile: ${raw.profile}` : null,
        raw.rngSeed ? `- RNG seed: ${raw.rngSeed}` : null,
        `- Result: ${safeString(final.winner || raw.winner || raw.final?.winner, 'unknown')}`,
        `- Reason: ${safeString(final.reason || raw.reason || raw.final?.reason, 'unknown')}`,
        raw.validity?.officialGuardPath ? `- Official guard path: ${raw.validity.officialGuardPath}` : null
    ].filter(Boolean);

    if (Array.isArray(raw.validity?.coverageTargets) && raw.validity.coverageTargets.length) {
        lines.push('', '## Coverage Targets', '', ...raw.validity.coverageTargets.map(x => `- ${x}`));
    }

    const rejected = asArray(raw.turns).reduce((sum, t) => sum + asArray(t.rejections).length, 0);
    lines.push('', '## Bug Report', '', rejected === 0 ? 'No official-action-guard rejections were observed in this run.' : `${rejected} official-action-guard rejection(s) were observed.`);

    lines.push('', raw.officialReport?.deckValidation || formatDeckValidationBlock(raw, options));

    lines.push('', '## Turn Summary');
    for (const model of raw.officialReport?.turns || asArray(raw.turns).map(buildTurnReportModel)) {
        lines.push('', formatTurnMarkdown(model));
    }

    if (raw.fullStructuredLog || options.fullStructuredLog) {
        lines.push('', `Full structured log: ${raw.fullStructuredLog || options.fullStructuredLog}`);
    }
    return lines.join('\n');
}

function writeOfficialMatchReports(report, options = {}) {
    const payload = buildOfficialMatchReportPayload(report, options);
    const outDir = options.outDir || process.cwd();
    fs.mkdirSync(outDir, { recursive: true });
    const baseName = options.baseName || `guarded-index-match-${report.roomId || 'room'}-${Date.now()}`;
    const jsonPath = path.join(outDir, `${baseName}.json`);
    const markdownPath = path.join(outDir, `${baseName}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload.json, null, 2));
    fs.writeFileSync(markdownPath, payload.markdown);
    return { ...payload, jsonPath, markdownPath };
}

function printCliUsage(stream = process.stderr) {
    stream.write([
        'Usage:',
        '  node official-report-writer.js --input <structured-report.json> [--decklists <decklists.json>] [--out-dir <dir>] [--base-name <name>] [--full-structured-log <path>]',
        '  node official-report-writer.js <structured-report.json> [out-dir] [decklists.json]',
        '',
        'Round 22CZ: converts a guarded structured match log into official json/md reports using guarded action telemetry.',
        'Rejected/no-op actions are excluded from successful decisions; actionPhase and endSnapshotPhase are printed separately.'
    ].join('\n') + '\n');
}

function parseCliArgs(argv = process.argv.slice(2)) {
    const out = { input: null, decklists: null, outDir: process.cwd(), baseName: null, fullStructuredLog: null, help: false };
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') { out.help = true; continue; }
        if (arg === '--input' || arg === '-i') { out.input = argv[++i]; continue; }
        if (arg === '--decklists' || arg === '--decks' || arg === '-d') { out.decklists = argv[++i]; continue; }
        if (arg === '--out-dir' || arg === '--output-dir' || arg === '-o') { out.outDir = argv[++i]; continue; }
        if (arg === '--base-name' || arg === '--basename' || arg === '-b') { out.baseName = argv[++i]; continue; }
        if (arg === '--full-structured-log') { out.fullStructuredLog = argv[++i]; continue; }
        positional.push(arg);
    }
    if (!out.input && positional.length) out.input = positional.shift();
    if (positional.length && (!out.outDir || out.outDir === process.cwd())) out.outDir = positional.shift();
    if (!out.decklists && positional.length) out.decklists = positional.shift();
    return out;
}

function readJsonFile(filePath, label = 'JSON') {
    if (!filePath) return null;
    const resolved = path.resolve(filePath);
    try {
        return JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch (e) {
        const err = new Error(`Failed to read ${label} at ${resolved}: ${e.message}`);
        err.cause = e;
        throw err;
    }
}

function normalizeDecklistsForWriter(decklists) {
    if (!decklists) return null;
    return normalizeReportDecklists(decklists);
}

function runCli(argv = process.argv.slice(2)) {
    const args = parseCliArgs(argv);
    if (args.help) {
        printCliUsage(process.stdout);
        return { ok: true, help: true };
    }
    if (!args.input) {
        printCliUsage(process.stderr);
        return { ok: false, error: 'missing_input' };
    }
    const report = readJsonFile(args.input, 'structured report');
    const decklists = normalizeDecklistsForWriter(readJsonFile(args.decklists, 'decklists'));
    const baseName = args.baseName || path.basename(args.input, path.extname(args.input)).replace(/\.official$/i, '') + '.official';
    const written = writeOfficialMatchReports(report, {
        decklists,
        outDir: args.outDir || process.cwd(),
        baseName,
        fullStructuredLog: args.fullStructuredLog || path.basename(args.input)
    });
    const summary = {
        ok: true,
        round: written.json?.officialReport?.round || '22CZ',
        jsonPath: written.jsonPath,
        markdownPath: written.markdownPath,
        turns: Array.isArray(written.json?.officialReport?.turns) ? written.json.officialReport.turns.length : 0,
        deckValidationAvailable: !/NOT AVAILABLE/.test(written.json?.officialReport?.deckValidation || '')
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return summary;
}

if (require.main === module) {
    try {
        const result = runCli(process.argv.slice(2));
        if (!result.ok) process.exitCode = 1;
    } catch (e) {
        console.error(e.stack || e.message);
        process.exitCode = 1;
    }
}

module.exports = {
    buildOfficialMatchReportPayload,
    formatOfficialMatchMarkdown,
    formatDeckValidationBlock,
    buildTurnReportModel,
    formatTurnMarkdown,
    writeOfficialMatchReports,
    parseCliArgs,
    normalizeDecklistsForWriter,
    normalizeReportDecklists,
    expandCountedDeckArray,
    runCli
};
