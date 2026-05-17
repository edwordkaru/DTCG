// Round 22DL: Bandai Organized Play tournament administration layer.
// Baseline: BANDAI ORGANIZED PLAY Tournament Rules Manual, Jun. 6, 2024.

const OFFICIAL_TOURNAMENT_ADMIN_SOURCE = {
  name: 'BANDAI ORGANIZED PLAY Tournament Rules Manual',
  url: 'https://world.digimoncard.com/event/online_event/pdf/tournament_rules.pdf?20240606=',
  lastUpdated: '2024-06-06'
};

const MATCH_POINTS = Object.freeze({
  WIN: 3,
  BYE: 3,
  DRAW: 1,
  LOSS: 0
});

const PENALTY_TYPES = Object.freeze([
  'CAUTION',
  'WARNING',
  'GAME_LOSS',
  'MATCH_LOSS',
  'DISQUALIFICATION',
  'SUSPENSION'
]);

function normalizePlayerId(value) {
  return String(value || '').trim();
}

function makeSeededRandom(seed = 1) {
  let state = Number(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffleStable(list, seed = 1) {
  const random = makeSeededRandom(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function recommendedSwissRounds(playerCount) {
  const n = Math.max(0, Number(playerCount || 0));
  if (n <= 1) return 0;
  if (n <= 8) return 3;
  if (n <= 16) return 4;
  if (n <= 32) return 5;
  if (n <= 64) return 6;
  if (n <= 128) return 7;
  if (n <= 226) return 8;
  if (n <= 409) return 9;
  return 10;
}

function recommendedTopCut(playerCount) {
  const n = Math.max(0, Number(playerCount || 0));
  if (n < 16) return 0;
  if (n < 32) return 4;
  if (n < 128) return 8;
  return 16;
}

function createTournament(players = [], options = {}) {
  const unique = [];
  const seen = new Set();
  for (const raw of players) {
    const id = normalizePlayerId(raw?.id || raw?.playerId || raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({
      id,
      name: String(raw?.name || id),
      seed: Number(raw?.seed || unique.length + 1),
      dropped: false,
      disqualified: false,
      penalties: []
    });
  }
  const roundCount = Number(options.roundCount || recommendedSwissRounds(unique.length));
  return {
    source: OFFICIAL_TOURNAMENT_ADMIN_SOURCE,
    id: String(options.id || `event-${Date.now()}`),
    format: String(options.format || 'SWISS').toUpperCase(),
    matchStructure: String(options.matchStructure || 'BEST_OF_3').toUpperCase(),
    roundCount,
    topCut: Number(options.topCut ?? recommendedTopCut(unique.length)),
    currentRound: 0,
    pairingsPostedRound: 0,
    players: unique,
    rounds: [],
    penalties: [],
    judgeCalls: []
  };
}

function getPlayer(event, playerId) {
  const id = normalizePlayerId(playerId);
  return (event?.players || []).find(p => p.id === id) || null;
}

function hasPlayed(event, a, b) {
  return (event?.rounds || []).some(round => (round.pairings || []).some(pairing => {
    return !pairing.bye && ((pairing.p1 === a && pairing.p2 === b) || (pairing.p1 === b && pairing.p2 === a));
  }));
}

function getPlayerMatches(event, playerId) {
  const id = normalizePlayerId(playerId);
  const rows = [];
  for (const round of event?.rounds || []) {
    for (const pairing of round.pairings || []) {
      if (pairing.p1 === id || pairing.p2 === id) rows.push({ round: round.round, pairing });
    }
  }
  return rows;
}

function resultPointsForPlayer(pairing, playerId) {
  if (!pairing || !pairing.result) return 0;
  if (pairing.bye && pairing.p1 === playerId) return MATCH_POINTS.BYE;
  if (pairing.result.type === 'DRAW') return MATCH_POINTS.DRAW;
  if (pairing.result.winner === playerId) return MATCH_POINTS.WIN;
  if (pairing.result.loser === playerId) return MATCH_POINTS.LOSS;
  return 0;
}

function calculatePlayerRecord(event, playerId) {
  const id = normalizePlayerId(playerId);
  const record = { playerId: id, points: 0, wins: 0, losses: 0, draws: 0, byes: 0, playedRounds: 0, nonByePoints: 0 };
  for (const { pairing } of getPlayerMatches(event, id)) {
    if (!pairing.result) continue;
    const pts = resultPointsForPlayer(pairing, id);
    record.points += pts;
    if (pairing.bye) {
      record.byes += 1;
      continue;
    }
    record.playedRounds += 1;
    record.nonByePoints += pts;
    if (pairing.result.type === 'DRAW') record.draws += 1;
    else if (pairing.result.winner === id) record.wins += 1;
    else if (pairing.result.loser === id) record.losses += 1;
  }
  return record;
}

function playerAverageMatchWinRate(event, playerId) {
  const record = calculatePlayerRecord(event, playerId);
  if (record.playedRounds <= 0) return 0.33;
  return Math.max(0.33, record.nonByePoints / (record.playedRounds * 3));
}

function opponentsFor(event, playerId) {
  const id = normalizePlayerId(playerId);
  return getPlayerMatches(event, id)
    .map(({ pairing }) => {
      if (pairing.bye) return null;
      return pairing.p1 === id ? pairing.p2 : pairing.p1;
    })
    .filter(Boolean);
}

function opponentAverageMatchWinRate(event, playerId) {
  const opponents = opponentsFor(event, playerId);
  if (opponents.length === 0) return 0.33;
  const total = opponents.reduce((sum, id) => sum + playerAverageMatchWinRate(event, id), 0);
  return Math.max(0.33, total / opponents.length);
}

function headToHeadWinner(event, a, b) {
  for (const round of event?.rounds || []) {
    for (const pairing of round.pairings || []) {
      if (pairing.bye || !pairing.result) continue;
      const sameMatch = (pairing.p1 === a && pairing.p2 === b) || (pairing.p1 === b && pairing.p2 === a);
      if (sameMatch && pairing.result.winner) return pairing.result.winner;
    }
  }
  return null;
}

function calculateStandings(event) {
  const rows = (event?.players || []).map(player => {
    const record = calculatePlayerRecord(event, player.id);
    return {
      playerId: player.id,
      name: player.name,
      seed: player.seed,
      dropped: !!player.dropped,
      disqualified: !!player.disqualified,
      points: record.points,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
      byes: record.byes,
      amw: Number(playerAverageMatchWinRate(event, player.id).toFixed(6)),
      omw: Number(opponentAverageMatchWinRate(event, player.id).toFixed(6))
    };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.amw !== a.amw) return b.amw - a.amw;
    if (b.omw !== a.omw) return b.omw - a.omw;
    const h2h = headToHeadWinner(event, a.playerId, b.playerId);
    if (h2h === a.playerId) return -1;
    if (h2h === b.playerId) return 1;
    return a.seed - b.seed;
  });
  rows.forEach((row, index) => row.rank = index + 1);
  return rows;
}

function eligiblePlayersForPairing(event) {
  return (event?.players || []).filter(p => !p.dropped && !p.disqualified);
}

function hasReceivedBye(event, playerId) {
  return getPlayerMatches(event, playerId).some(({ pairing }) => pairing.bye);
}

function chooseByePlayer(event, players) {
  const standings = calculateStandings(event);
  const rank = new Map(standings.map(row => [row.playerId, row.rank]));
  return players
    .filter(p => !hasReceivedBye(event, p.id))
    .sort((a, b) => (rank.get(b.id) || 999) - (rank.get(a.id) || 999) || b.seed - a.seed)[0]
    || players.slice().sort((a, b) => (rank.get(b.id) || 999) - (rank.get(a.id) || 999) || b.seed - a.seed)[0];
}

function pairSwissRound(event, options = {}) {
  if (!event || !Array.isArray(event.players)) throw new Error('Invalid tournament event.');
  const roundNo = Number(options.round || event.currentRound + 1);
  if ((event.rounds || []).some(r => r.round === roundNo)) throw new Error(`Round ${roundNo} already exists.`);

  let active = eligiblePlayersForPairing(event);
  if (roundNo === 1) active = shuffleStable(active.slice().sort((a, b) => a.seed - b.seed), options.seed || 1);
  else {
    const standings = calculateStandings(event);
    const rank = new Map(standings.map(row => [row.playerId, row.rank]));
    active = active.slice().sort((a, b) => (rank.get(a.id) || 999) - (rank.get(b.id) || 999));
  }

  const pairings = [];
  if (active.length % 2 === 1) {
    const byePlayer = chooseByePlayer(event, active);
    active = active.filter(p => p.id !== byePlayer.id);
    pairings.push({
      table: Math.ceil((active.length + 1) / 2),
      round: roundNo,
      p1: byePlayer.id,
      p2: null,
      bye: true,
      result: { type: 'BYE', winner: byePlayer.id, loser: null, submitted: true, locked: true }
    });
  }

  const unpaired = active.slice();
  while (unpaired.length) {
    const first = unpaired.shift();
    let idx = unpaired.findIndex(candidate => !hasPlayed(event, first.id, candidate.id));
    if (idx < 0) idx = 0;
    const second = unpaired.splice(idx, 1)[0];
    pairings.push({
      table: pairings.length + 1,
      round: roundNo,
      p1: first.id,
      p2: second.id,
      bye: false,
      result: null,
      penalties: []
    });
  }

  pairings.sort((a, b) => a.table - b.table);
  const round = {
    round: roundNo,
    pairings,
    postedAt: Date.now(),
    status: 'POSTED'
  };
  event.rounds.push(round);
  event.currentRound = Math.max(event.currentRound || 0, roundNo);
  event.pairingsPostedRound = roundNo;
  return round;
}

function findPairing(event, roundNo, tableOrPlayers) {
  const round = (event?.rounds || []).find(r => Number(r.round) === Number(roundNo));
  if (!round) return null;
  if (typeof tableOrPlayers === 'number') return (round.pairings || []).find(p => Number(p.table) === tableOrPlayers) || null;
  const a = normalizePlayerId(tableOrPlayers?.p1 || tableOrPlayers?.playerId || tableOrPlayers?.a);
  const b = normalizePlayerId(tableOrPlayers?.p2 || tableOrPlayers?.opponentId || tableOrPlayers?.b);
  return (round.pairings || []).find(p => (p.p1 === a && p.p2 === b) || (p.p1 === b && p.p2 === a)) || null;
}

function canAlterRoundResult(event, roundNo) {
  return Number(roundNo) > Number(event?.pairingsPostedRound || 0) - 2;
}

function normalizeResultForPairing(pairing, result = {}) {
  if (pairing.bye) return { type: 'BYE', winner: pairing.p1, loser: null, submitted: true, locked: true };
  const type = String(result.type || (result.winner ? 'WIN' : 'DRAW')).toUpperCase();
  if (type === 'DRAW') return { type: 'DRAW', winner: null, loser: null, submitted: true, submittedAt: Date.now() };
  const winner = normalizePlayerId(result.winner);
  if (winner !== pairing.p1 && winner !== pairing.p2) throw new Error('Winner must be one of the paired players.');
  const loser = winner === pairing.p1 ? pairing.p2 : pairing.p1;
  return { type: 'WIN', winner, loser, submitted: true, submittedAt: Date.now(), source: result.source || 'match_slip' };
}

function recordMatchResult(event, roundNo, tableOrPlayers, result = {}, options = {}) {
  const pairing = findPairing(event, roundNo, tableOrPlayers);
  if (!pairing) throw new Error('Pairing not found.');
  if (pairing.result && !options.force && !canAlterRoundResult(event, roundNo)) {
    throw new Error('Match results cannot be altered after the second subsequent round has been paired.');
  }
  pairing.result = normalizeResultForPairing(pairing, result);
  return pairing.result;
}

function resolveBetweenGamesTimeout(match = {}) {
  const p1 = Number(match.gameWins?.p1 || 0);
  const p2 = Number(match.gameWins?.p2 || 0);
  if (p1 === p2) return { type: 'MATCH_DRAW', winner: null, reason: 'TIME_BETWEEN_GAMES_EQUAL_GAME_WINS' };
  return { type: 'MATCH_WIN', winner: p1 > p2 ? 'p1' : 'p2', reason: 'TIME_BETWEEN_GAMES_MORE_GAME_WINS' };
}

function resolveOngoingGameTimeout(game = {}, options = {}) {
  const structure = String(options.structure || 'SWISS').toUpperCase();
  const championship = !!options.championship;
  if (championship) return { type: 'PLAY_TO_COMPLETION', winner: null, reason: 'CHAMPIONSHIP_MATCH_NO_TIME_LIMIT' };
  const extraTurnsElapsed = Number(game.extraTurnsElapsed || 0);
  if (extraTurnsElapsed < 3 && structure !== 'TOP_CUT' && structure !== 'SINGLE_ELIMINATION') {
    return { type: 'EXTRA_TURNS', turnsRemaining: 3 - extraTurnsElapsed, activeTurnIsTurnZero: true };
  }
  if (structure !== 'TOP_CUT' && structure !== 'SINGLE_ELIMINATION') {
    return { type: 'GAME_DRAW', winner: null, reason: 'NO_WINNER_AFTER_THREE_EXTRA_TURNS' };
  }
  const p1Sec = Number(game.security?.p1 ?? game.securityP1 ?? 0);
  const p2Sec = Number(game.security?.p2 ?? game.securityP2 ?? 0);
  if (p1Sec !== p2Sec && (p1Sec < 5 || p2Sec < 5)) return { type: 'GAME_WIN', winner: p1Sec > p2Sec ? 'p1' : 'p2', reason: 'MORE_SECURITY' };
  const p1Deck = Number(game.deck?.p1 ?? game.deckP1 ?? 0);
  const p2Deck = Number(game.deck?.p2 ?? game.deckP2 ?? 0);
  if (p1Deck !== p2Deck) return { type: 'GAME_WIN', winner: p1Deck > p2Deck ? 'p1' : 'p2', reason: 'MORE_DECK_CARDS' };
  const p1Battle = Number(game.battleDigimon?.p1 ?? game.battleDigimonP1 ?? 0);
  const p2Battle = Number(game.battleDigimon?.p2 ?? game.battleDigimonP2 ?? 0);
  if (p1Battle !== p2Battle) return { type: 'GAME_WIN', winner: p1Battle > p2Battle ? 'p1' : 'p2', reason: 'MORE_BATTLE_AREA_DIGIMON' };
  const lastSecurityDraw = game.lastSecurityDraw === 'p1' || game.lastSecurityDraw === 'p2' ? game.lastSecurityDraw : null;
  if (lastSecurityDraw) return { type: 'GAME_WIN', winner: lastSecurityDraw, reason: 'LAST_TO_DRAW_FROM_SECURITY' };
  return { type: 'HEAD_JUDGE_RANDOM_REQUIRED', winner: null, reason: 'IDENTICAL_TOP_CUT_TIEBREAKERS' };
}

function recordJudgeCall(event, payload = {}) {
  const call = {
    id: String(payload.id || `judge-${Date.now()}-${(event?.judgeCalls || []).length + 1}`),
    round: Number(payload.round || event?.currentRound || 0),
    table: payload.table === undefined ? null : Number(payload.table),
    judge: String(payload.judge || payload.floorJudge || 'Judge'),
    headJudgeAppeal: !!payload.headJudgeAppeal,
    question: String(payload.question || ''),
    ruling: String(payload.ruling || ''),
    startedAt: Number(payload.startedAt ?? Date.now()),
    resolvedAt: Number(payload.resolvedAt ?? Date.now()),
    timeExtensionMinutes: Math.max(0, Number(payload.timeExtensionMinutes || 0))
  };
  if (call.timeExtensionMinutes === 0 && call.resolvedAt > call.startedAt) {
    const elapsedMinutes = Math.ceil((call.resolvedAt - call.startedAt) / 60000);
    if (elapsedMinutes > 2) call.timeExtensionMinutes = elapsedMinutes;
  }
  event.judgeCalls = event.judgeCalls || [];
  event.judgeCalls.push(call);
  return call;
}

function nextPenaltyForRepeat(existingPenalties, infraction, requestedPenalty) {
  const wanted = String(requestedPenalty || 'WARNING').toUpperCase();
  const repeatCount = (existingPenalties || []).filter(p => String(p.infraction || '').toUpperCase() === String(infraction || '').toUpperCase()).length;
  if (repeatCount <= 0) return wanted;
  if (wanted === 'CAUTION') return 'WARNING';
  if (wanted === 'WARNING') return 'GAME_LOSS';
  return wanted;
}

function issuePenalty(event, payload = {}) {
  const playerId = normalizePlayerId(payload.playerId || payload.player);
  const player = getPlayer(event, playerId);
  if (!player) throw new Error('Penalty player not found.');
  const infraction = String(payload.infraction || 'UNSPECIFIED_INFRACTION').toUpperCase();
  const penalty = nextPenaltyForRepeat(player.penalties, infraction, payload.penalty);
  if (!PENALTY_TYPES.includes(penalty)) throw new Error(`Unsupported penalty type: ${penalty}`);
  const record = {
    playerId,
    playerName: player.name,
    infraction,
    penalty,
    reason: String(payload.reason || ''),
    judge: String(payload.judge || 'Judge'),
    headJudgeNotified: !!payload.headJudgeNotified || ['GAME_LOSS', 'MATCH_LOSS', 'DISQUALIFICATION', 'SUSPENSION'].includes(penalty),
    round: Number(payload.round || event?.currentRound || 0),
    table: payload.table === undefined ? null : Number(payload.table),
    issuedAt: Number(payload.issuedAt || Date.now())
  };
  player.penalties.push(record);
  event.penalties = event.penalties || [];
  event.penalties.push(record);
  if (penalty === 'DISQUALIFICATION' || penalty === 'SUSPENSION') {
    player.disqualified = true;
    player.dropped = true;
  }
  return record;
}

function dropPlayer(event, playerId, options = {}) {
  const player = getPlayer(event, playerId);
  if (!player) throw new Error('Player not found.');
  player.dropped = true;
  player.dropRound = Number(options.round || event.currentRound || 0);
  player.dropReason = String(options.reason || 'PLAYER_DROP');
  if (options.concedeCurrentMatch) {
    const round = (event.rounds || []).find(r => r.round === player.dropRound);
    const pairing = (round?.pairings || []).find(p => !p.bye && (p.p1 === player.id || p.p2 === player.id));
    if (pairing && !pairing.result) {
      const opponent = pairing.p1 === player.id ? pairing.p2 : pairing.p1;
      pairing.result = { type: 'WIN', winner: opponent, loser: player.id, submitted: true, submittedAt: Date.now(), source: 'drop_concession' };
    }
  }
  return player;
}

module.exports = {
  OFFICIAL_TOURNAMENT_ADMIN_SOURCE,
  MATCH_POINTS,
  PENALTY_TYPES,
  recommendedSwissRounds,
  recommendedTopCut,
  createTournament,
  pairSwissRound,
  recordMatchResult,
  calculateStandings,
  calculatePlayerRecord,
  playerAverageMatchWinRate,
  opponentAverageMatchWinRate,
  resolveBetweenGamesTimeout,
  resolveOngoingGameTimeout,
  recordJudgeCall,
  issuePenalty,
  dropPlayer,
  canAlterRoundResult,
  headToHeadWinner
};
