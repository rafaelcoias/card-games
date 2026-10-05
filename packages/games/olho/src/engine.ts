import {
  JOKER,
  SYSTEM_PLAYER_ID,
  createDeck,
  createSeededRng,
  ok,
  shuffle,
  type ActionResult,
  type Card,
  type CardId,
  type PlayerId,
  type Rank,
  type Rng,
  type ScheduledAction,
  type SetupOptions,
} from '@cardroom/game-core';
import { getDefaultAction } from './moves';
import {
  DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PACE,
  PLAY_ERRORS,
  POINTS,
  SEAT_COUNT,
  STARTER_CARD,
  assignRoles,
  bestCards,
  checkPlay,
  lowestCards,
} from './rules';
import {
  canAct,
  canEscape,
  currentPlayerId,
  handOf,
  inGame,
  inTrick,
  isBlocked,
  nextInTrick,
  openerFrom,
  playContext,
  positionOf,
  rosterEntry,
  seatsAfter,
} from './state';
import type {
  CloseReason,
  CutReason,
  ExchangePair,
  OlhoAction,
  OlhoClientAction,
  OlhoConfig,
  OlhoEvent,
  OlhoState,
  OlhoSystemAction,
  SessionPlayer,
  Trick,
} from './types';

type Result = ActionResult<OlhoState, OlhoEvent>;
type Failure = Extract<Result, { ok: false }>;
const failure = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });

export interface DealInput {
  gameNumber: number;
  /** Clockwise. */
  seats: readonly PlayerId[];
  seed: string;
}

/** Produces every player's hand for a game. Injectable so tests can play fixed (even reduced) decks. */
export type Dealer = (input: DealInput) => Record<PlayerId, Card[]>;

/**
 * Rules §5: all 54 cards, one at a time, from a player drawn for each game —
 * so who gets one card more is random. The order derives from the session's
 * secret seed and the game number, so the session replays from its log.
 */
export const shuffledDealer: Dealer = ({ gameNumber, seats, seed }) => {
  const rng = createSeededRng(`${seed}:game:${gameNumber}`);
  const deck = shuffle(createDeck({ jokers: 2 }), rng);
  const start = rng.nextInt(seats.length);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(seats.map((id) => [id, []]));
  deck.forEach((card, i) => {
    (hands[seats[(start + i) % seats.length] as PlayerId] as Card[]).push(card);
  });
  return hands;
};

/** A state being changed by one action, and the events it produced so far. */
interface Draft {
  s: OlhoState;
  events: OlhoEvent[];
  dealer: Dealer;
}

const freshTrick = (number: number, isFirstOfGame: boolean, leaderId: PlayerId | null = null): Trick => ({
  number,
  isFirstOfGame,
  leaderId,
  count: null,
  topRank: null,
  plays: [],
  passed: [],
  sameRankRun: null,
  skip: null,
  lastPlayerId: null,
  closing: null,
});

export function setup(
  players: readonly PlayerId[],
  config: OlhoConfig,
  rng: Rng,
  options: SetupOptions = {},
  dealer: Dealer = shuffledDealer,
): OlhoState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Olho needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');
  const seatIndexes = options.seats ?? players.map((_, i) => i);
  if (
    seatIndexes.length !== players.length ||
    new Set(seatIndexes).size !== seatIndexes.length ||
    seatIndexes.some((i) => !Number.isInteger(i) || i < 0 || i >= SEAT_COUNT)
  ) {
    throw new RangeError(`Invalid seats: ${seatIndexes.join(', ')}`);
  }
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');
  const roster = players
    .map((playerId, i) => newPlayer(playerId, seatIndexes[i] as number))
    .sort((a, b) => a.seatIndex - b.seatIndex);
  const state: OlhoState = {
    phase: 'WAITING',
    config: { ...config },
    gameNumber: 0,
    gamesCompleted: 0,
    roster,
    seats: [],
    waiting: roster.map((p) => p.playerId),
    hands: {},
    exchange: null,
    trick: freshTrick(1, true),
    discard: [],
    currentPlayerId: null,
    finishOrder: [],
    leaving: [],
    bottomOrder: [],
    blocked: [],
    lastGame: null,
    seed,
  };
  const d: Draft = { s: state, events: [], dealer };
  startGame(d);
  return d.s;
}

function newPlayer(playerId: PlayerId, seatIndex: number): SessionPlayer {
  return {
    playerId,
    seatIndex,
    points: 0,
    gamesPlayed: 0,
    presidentCount: 0,
    olhoCount: 0,
    role: null,
    seated: true,
  };
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: OlhoState): OlhoState {
  const { trick, exchange } = state;
  return {
    ...state,
    config: { ...state.config },
    roster: state.roster.map((p) => ({ ...p })),
    seats: [...state.seats],
    waiting: [...state.waiting],
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]])),
    exchange: exchange
      ? {
          ...exchange,
          pairs: exchange.pairs.map((p) => ({
            ...p,
            given: [...p.given],
            returned: p.returned ? [...p.returned] : null,
          })),
        }
      : null,
    trick: {
      ...trick,
      plays: trick.plays.map((p) => ({ ...p, cards: [...p.cards] })),
      passed: [...trick.passed],
      sameRankRun: trick.sameRankRun ? { ...trick.sameRankRun } : null,
      skip: trick.skip ? { ...trick.skip } : null,
      closing: trick.closing ? { ...trick.closing } : null,
    },
    discard: [...state.discard],
    finishOrder: [...state.finishOrder],
    leaving: [...state.leaving],
    bottomOrder: [...state.bottomOrder],
    blocked: [...state.blocked],
  };
}

const SYSTEM_ACTIONS = new Set<OlhoAction['type']>([
  'SYS_TIMEOUT',
  'SYS_EXCHANGE_GIVE',
  'SYS_EXCHANGE_TIMEOUT',
  'SYS_CLOSE_TRICK',
  'SYS_NEXT_GAME',
  'SYS_PLAYER_JOINED',
  'SYS_PLAYER_LEFT',
  'SYS_END_SESSION',
]);

export function isSystemAction(action: OlhoAction): action is OlhoSystemAction {
  return SYSTEM_ACTIONS.has(action.type);
}

export function applyAction(
  state: OlhoState,
  action: OlhoAction,
  playerId: PlayerId,
  dealer: Dealer = shuffledDealer,
): Result {
  const d: Draft = { s: cloneState(state), events: [], dealer };
  const error = isSystemAction(action)
    ? playerId === SYSTEM_PLAYER_ID
      ? applySystem(d, action)
      : failure('SYSTEM_ONLY', 'Only the server can do that')
    : applyPlayer(d, action, playerId);
  if (error) return error;
  return ok(d.s, d.events, scheduleFor(d.s));
}

function applySystem(d: Draft, action: OlhoSystemAction): Failure | null {
  const { s } = d;
  const wrongPhase = () => failure('WRONG_PHASE', `${action.type} does not apply in ${s.phase}`);
  switch (action.type) {
    case 'SYS_TIMEOUT': {
      const current = currentPlayerId(s);
      const fallback = current ? getDefaultAction(s, current) : null;
      if (!current || !fallback) return failure('WRONG_PHASE', 'Nobody is on the clock');
      return applyPlayer(d, fallback, current);
    }
    case 'SYS_EXCHANGE_GIVE':
      if (s.phase !== 'EXCHANGE' || s.exchange?.stage !== 'DEALT') return wrongPhase();
      give(d);
      return null;
    case 'SYS_EXCHANGE_TIMEOUT':
      if (s.phase !== 'EXCHANGE' || s.exchange?.stage !== 'RETURNING') return wrongPhase();
      for (const pair of s.exchange.pairs) if (pair.returned === null) returnLowest(d, pair);
      finishExchangeIfDone(d);
      return null;
    case 'SYS_CLOSE_TRICK':
      if (s.phase !== 'PLAYING' || !s.trick.closing) return wrongPhase();
      clearTrick(d);
      return null;
    case 'SYS_NEXT_GAME':
      if (s.phase !== 'GAME_SUMMARY' && s.phase !== 'WAITING') return wrongPhase();
      // After a game the table always moves on (to WAITING if too few are left); waiting needs three.
      if (s.phase === 'WAITING' && seatedCount(s) < MIN_PLAYERS) {
        return failure('NOT_ENOUGH_PLAYERS', 'Waiting for more players');
      }
      startGame(d);
      return null;
    case 'SYS_PLAYER_JOINED':
      return playerJoined(d, action.playerId, action.seatIndex);
    case 'SYS_PLAYER_LEFT':
      return playerLeft(d, action.playerId);
    case 'SYS_END_SESSION':
      if (s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
      // The game in play, if any, does not count: the session stands on the games completed.
      s.phase = 'FINISHED';
      s.currentPlayerId = null;
      s.trick.skip = null;
      d.events.push({ type: 'SessionFinished', games: s.gamesCompleted });
      return null;
  }
}

function applyPlayer(d: Draft, action: OlhoClientAction, playerId: PlayerId): Failure | null {
  const { s } = d;
  if (s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
  if (!rosterEntry(s, playerId)?.seated) return failure('NOT_SEATED', 'You have no seat at this table');
  if (action.type === 'RETURN_CARDS') return returnCards(d, playerId, action.cardIds);
  if (s.phase !== 'PLAYING') return failure('WRONG_PHASE', 'Nobody is playing right now');
  if (!s.seats.includes(playerId)) return failure('NEXT_GAME', 'You play from the next game');
  if (currentPlayerId(s) !== playerId) return failure('NOT_YOUR_TURN', 'It is not your turn');
  const skip = s.trick.skip;
  switch (action.type) {
    case 'PLAY': {
      if (skip) return failure('ESCAPE_OR_SKIP', 'Play the same card or let yourself be skipped');
      const cards = cardsInHand(s, playerId, action.cardIds);
      if (!cards) return failure('INVALID_CARD', 'Those cards are not in your hand');
      const error = checkPlay(playContext(s, playerId), cards);
      if (error) return failure(error, PLAY_ERRORS[error]);
      commitPlay(d, playerId, cards, false);
      return null;
    }
    case 'PASS':
      if (skip) return failure('ESCAPE_OR_SKIP', 'Play the same card or let yourself be skipped');
      if (s.trick.count === null) return failure('MUST_OPEN', 'You open this trick: play something');
      s.trick.passed.push(playerId);
      d.events.push({ type: 'Passed', playerId });
      advance(d, playerId);
      return null;
    case 'ESCAPE': {
      if (!skip) return failure('NO_SKIP', 'Nobody is about to skip you');
      const cards = cardsInHand(s, playerId, action.cardIds);
      if (!cards) return failure('INVALID_CARD', 'Those cards are not in your hand');
      if (!canEscape(s, playerId)) return failure('CANNOT_ESCAPE', 'You cannot escape this skip');
      if (cards.length !== skip.count || cards.some((c) => c.rank !== skip.rank)) {
        return failure('ESCAPE_SAME_CARD', 'Escape with the same card, as many as were played');
      }
      commitPlay(d, playerId, cards, true);
      return null;
    }
    case 'ACCEPT_SKIP':
      if (!skip) return failure('NO_SKIP', 'Nobody is about to skip you');
      skipPlayer(d, playerId);
      return null;
  }
}

/** The cards named, each once, all from the player's hand; `null` otherwise. */
function cardsInHand(s: OlhoState, playerId: PlayerId, cardIds: readonly CardId[]): Card[] | null {
  const hand = handOf(s, playerId);
  const cards = cardIds.map((id) => hand.find((c) => c.id === id));
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) return null;
  return cards.every((c): c is Card => c !== undefined) ? cards : null;
}

function removeFromHand(s: OlhoState, playerId: PlayerId, cards: readonly Card[]): void {
  const ids = new Set(cards.map((c) => c.id));
  s.hands[playerId] = handOf(s, playerId).filter((c) => !ids.has(c.id));
}

// ── Deal and exchange ─────────────────────────────────────────

const seatedCount = (s: OlhoState) => s.seats.length + s.waiting.length;

/** Players of the next game: whoever is seated, newcomers included, by seat. */
function startGame(d: Draft): void {
  const { s } = d;
  const seatOf = (id: PlayerId) => rosterEntry(s, id)?.seatIndex ?? 0;
  s.seats = [...s.seats, ...s.waiting].sort((a, b) => seatOf(a) - seatOf(b));
  s.waiting = [];
  s.currentPlayerId = null;
  s.exchange = null;
  if (s.seats.length < MIN_PLAYERS) {
    // The cards of the last game are gathered while the table waits for players.
    s.discard = [...s.discard, ...Object.values(s.hands).flat(), ...s.trick.plays.flatMap((p) => p.cards)];
    s.hands = {};
    s.trick = freshTrick(1, true);
    s.phase = 'WAITING';
    d.events.push({ type: 'WaitingForPlayers', seated: s.seats.length });
    return;
  }

  s.gameNumber += 1;
  const dealt = d.dealer({ gameNumber: s.gameNumber, seats: s.seats, seed: s.seed });
  const ids = s.seats.flatMap((id) => (dealt[id] ?? []).map((c) => c.id));
  if (new Set(ids).size !== ids.length || ids.length > DECK_SIZE) {
    throw new Error('A deal must use each card of the deck at most once');
  }
  s.hands = Object.fromEntries(s.seats.map((id) => [id, [...(dealt[id] ?? [])]]));
  s.discard = [];
  s.finishOrder = [];
  s.leaving = [];
  s.bottomOrder = [];
  s.blocked = [];
  s.trick = freshTrick(1, true);

  const pairs = exchangePairs(s);
  const counts = Object.fromEntries(s.seats.map((id) => [id, handOf(s, id).length]));
  const exchange = pairs.map(({ giver, receiver, count }) => ({ giver, receiver, count }));
  if (pairs.length > 0) {
    s.phase = 'EXCHANGE';
    s.exchange = { stage: 'DEALT', pairs };
    d.events.push({ type: 'GameDealt', gameNumber: s.gameNumber, counts, leaderId: null, exchange });
    return;
  }
  const dealtEvent: Extract<OlhoEvent, { type: 'GameDealt' }> = {
    type: 'GameDealt',
    gameNumber: s.gameNumber,
    counts,
    leaderId: null,
    exchange,
  };
  d.events.push(dealtEvent);
  dealtEvent.leaderId = beginPlay(d);
}

/**
 * Rules §6: the Olho gives the Presidente their 2 best cards, the Vice-olho
 * gives the Vice-Presidente the best one — only between roles still at the
 * table (04: whoever left takes their exchange with them).
 */
function exchangePairs(s: OlhoState): ExchangePair[] {
  const holder = (role: SessionPlayer['role']) =>
    s.seats.find((id) => rosterEntry(s, id)?.role === role) ?? null;
  const pairs: ExchangePair[] = [];
  const add = (giver: PlayerId | null, receiver: PlayerId | null, count: number) => {
    if (!giver || !receiver) return;
    pairs.push({ giver, receiver, count, given: bestCards(handOf(s, giver), count), returned: null });
  };
  add(holder('OLHO'), holder('PRESIDENTE'), 2);
  add(holder('VICE_OLHO'), holder('VICE_PRESIDENTE'), 1);
  return pairs;
}

/** The best cards leave on their own; the receivers now choose what to give back. */
function give(d: Draft): void {
  const { s } = d;
  const exchange = s.exchange as NonNullable<OlhoState['exchange']>;
  for (const pair of exchange.pairs) {
    removeFromHand(s, pair.giver, pair.given);
    s.hands[pair.receiver] = [...handOf(s, pair.receiver), ...pair.given];
    d.events.push({ type: 'ExchangeGiven', giver: pair.giver, receiver: pair.receiver, count: pair.count });
  }
  exchange.stage = 'RETURNING';
  // A receiver who left in the meantime gives back their lowest cards.
  for (const pair of exchange.pairs) if (s.leaving.includes(pair.receiver)) returnLowest(d, pair);
  finishExchangeIfDone(d);
}

function returnCards(d: Draft, playerId: PlayerId, cardIds: readonly CardId[]): Failure | null {
  const { s } = d;
  const pair = s.exchange?.pairs.find((p) => p.receiver === playerId && p.returned === null);
  if (s.phase !== 'EXCHANGE' || s.exchange?.stage !== 'RETURNING' || !pair) {
    return failure('NO_EXCHANGE', 'You have no cards to give back');
  }
  const cards = cardsInHand(s, playerId, cardIds);
  if (!cards) return failure('INVALID_CARD', 'Those cards are not in your hand');
  if (cards.length !== pair.count) return failure('RETURN_COUNT', `Give back ${pair.count}`);
  giveBack(d, pair, cards, false);
  finishExchangeIfDone(d);
  return null;
}

function giveBack(d: Draft, pair: ExchangePair, cards: Card[], auto: boolean): void {
  removeFromHand(d.s, pair.receiver, cards);
  d.s.hands[pair.giver] = [...handOf(d.s, pair.giver), ...cards];
  pair.returned = cards;
  d.events.push({
    type: 'ExchangeReturned',
    giver: pair.giver,
    receiver: pair.receiver,
    count: pair.count,
    auto,
  });
}

/** Time ran out (or the receiver left): the lowest cards go back. */
function returnLowest(d: Draft, pair: ExchangePair): void {
  giveBack(d, pair, lowestCards(handOf(d.s, pair.receiver), pair.count), true);
}

function finishExchangeIfDone(d: Draft): void {
  const exchange = d.s.exchange;
  if (!exchange || exchange.pairs.some((p) => p.returned === null)) return;
  exchange.stage = 'DONE';
  const leaderId = beginPlay(d);
  if (leaderId) d.events.push({ type: 'ExchangeDone', leaderId });
}

// ── Play ──────────────────────────────────────────────────────

/**
 * Rules §7: the first game opens with whoever holds the 3♣, the others with
 * the Olho of the game before (or, if they left, whoever came last among those
 * still here). Returns the opener, or `null` when that ended the game.
 */
function beginPlay(d: Draft): PlayerId | null {
  const { s } = d;
  s.phase = 'PLAYING';
  markBlocked(d);
  if (endIfOver(d)) return null;
  const previous = [...(s.lastGame?.order ?? [])].reverse().find((id) => s.seats.includes(id));
  const holder = s.seats.find((id) => handOf(s, id).some((c) => c.id === STARTER_CARD));
  const starter = previous ?? holder ?? s.seats[0] ?? null;
  const opener = () => (starter === null ? null : openerFrom(s, starter));
  let leader = opener();
  if (!leader && s.trick.isFirstOfGame) {
    // Only 2s and jokers in every hand (a tiny test deck): the first-trick ban cannot hold.
    s.trick.isFirstOfGame = false;
    leader = opener();
  }
  if (!leader) {
    endGame(d, standingOrder(s));
    return null;
  }
  s.trick.leaderId = leader;
  s.currentPlayerId = leader;
  return leader;
}

/** Puts a validated play on the trick (an escape is a play of the same card). */
function commitPlay(d: Draft, playerId: PlayerId, cards: Card[], escape: boolean): void {
  const { s } = d;
  const trick = s.trick;
  const previous = trick.plays.at(-1) ?? null;
  const rank = (cards[0] as Card).rank;
  removeFromHand(s, playerId, cards);
  trick.plays.push({ playerId, cards, escape });
  trick.leaderId ??= playerId;
  trick.count = cards.length;
  trick.topRank = rank;
  trick.lastPlayerId = playerId;
  trick.skip = null;
  trick.sameRankRun =
    rank === JOKER
      ? null
      : trick.sameRankRun?.rank === rank
        ? { rank, cards: trick.sameRankRun.cards + cards.length }
        : { rank, cards: cards.length };
  d.events.push({ type: escape ? 'Escaped' : 'Played', playerId, cards: [...cards] });

  if (handOf(s, playerId).length === 0) {
    s.finishOrder.push(playerId);
    d.events.push({ type: 'PlayerFinished', playerId, position: s.finishOrder.length });
  }
  markBlocked(d);
  if (endIfOver(d)) return;

  const cut: CutReason | null =
    rank === JOKER
      ? 'JOKER'
      : cards.length === 4
        ? 'QUAD'
        : s.config.fourOfAKindCuts && (trick.sameRankRun?.cards ?? 0) >= 4
          ? 'FOUR_IN_A_ROW'
          : null;
  if (cut) {
    d.events.push({ type: 'Cut', playerId, reason: cut });
    closeTrick(d, cut);
    return;
  }
  const equal = previous?.cards[0]?.rank === rank && previous.cards.length === cards.length;
  if (equal) pendSkip(d, playerId, rank, cards.length);
  else advance(d, playerId);
}

/**
 * The turn moves on from `from`. The trick is decided once everybody else
 * still in it has passed (rules §8.5). A player who was only skipped has not:
 * they stay in the trick (§8.3), so when the turn comes back to whoever played
 * last, that player plays again or passes — and the skipped one gets to choose.
 */
function advance(d: Draft, from: PlayerId): void {
  const { s } = d;
  const next = nextInTrick(s, from);
  if (s.trick.count === null) {
    // Nobody opened yet (the opener left): the opening moves on.
    const opener = next ? openerFrom(s, next) : null;
    if (opener) {
      s.trick.leaderId = opener;
      s.currentPlayerId = opener;
    } else endGame(d, standingOrder(s));
    return;
  }
  const lastOneStanding =
    next === s.trick.lastPlayerId && !s.seats.some((id) => id !== next && inTrick(s, id));
  if (next === null || lastOneStanding) {
    closeTrick(d, 'ALL_PASSED');
    return;
  }
  s.currentPlayerId = next;
}

/** Rules §8.3: the same card as the play before skips the next player, unless they play it too. */
function pendSkip(d: Draft, playerId: PlayerId, rank: Rank, count: number): void {
  const { s } = d;
  const target = nextInTrick(s, playerId);
  if (target === null) {
    closeTrick(d, 'ALL_PASSED');
    return;
  }
  s.trick.skip = { targetId: target, rank, count };
  if (canEscape(s, target)) {
    s.currentPlayerId = target;
    d.events.push({ type: 'SkipPending', targetId: target, rank, count });
    return;
  }
  skipPlayer(d, target);
}

/** Skipped: they only lose this turn and stay in the trick. */
function skipPlayer(d: Draft, playerId: PlayerId): void {
  d.s.trick.skip = null;
  d.events.push({ type: 'Skipped', playerId });
  advance(d, playerId);
}

/** The trick is decided; it stays on the table until `SYS_CLOSE_TRICK` clears it. */
function closeTrick(d: Draft, reason: CloseReason): void {
  const { s } = d;
  const winnerId = s.trick.lastPlayerId as PlayerId;
  s.trick.closing = { reason, winnerId };
  s.trick.skip = null;
  s.currentPlayerId = null;
  // After the first trick anyone who takes turns can open: the winner, or the next one able to.
  const leaderId = [winnerId, ...seatsAfter(s, winnerId)].find((id) => canAct(s, id)) ?? null;
  d.events.push({ type: 'TrickClosed', winnerId, leaderId, reason });
}

/** The cards go to the discard pile and the winner — or the next one able to — opens. */
function clearTrick(d: Draft): void {
  const { s } = d;
  const { closing, plays, number } = s.trick;
  s.discard = [...s.discard, ...plays.flatMap((p) => p.cards)];
  if (s.exchange?.stage === 'DONE') s.exchange = null;
  s.trick = freshTrick(number + 1, false);
  const leader = openerFrom(s, (closing as NonNullable<Trick['closing']>).winnerId);
  if (!leader) {
    endGame(d, standingOrder(s));
    return;
  }
  s.trick.leaderId = leader;
  s.currentPlayerId = leader;
  d.events.push({ type: 'TrickCleared', number: s.trick.number, leaderId: leader });
}

/** Rules §9: announces whoever is left with a single 2 or joker while that cannot end a hand. */
function markBlocked(d: Draft): void {
  const { s } = d;
  for (const id of s.seats) {
    if (!s.blocked.includes(id) && inGame(s, id) && isBlocked(s, id)) {
      s.blocked.push(id);
      d.events.push({ type: 'PlayerBlocked', playerId: id });
    }
  }
}

// ── End of a game ─────────────────────────────────────────────

/**
 * Final order: out of cards first; then whoever still holds cards — by fewer
 * cards, ties drawn from the seed (rules §9); then those who left, the first
 * to go last.
 */
function standingOrder(s: OlhoState): PlayerId[] {
  const remaining = s.seats.filter((id) => inGame(s, id));
  const draw = shuffle(remaining, createSeededRng(`${s.seed}:tie:${s.gameNumber}`));
  const ranked = [...remaining].sort(
    (a, b) => handOf(s, a).length - handOf(s, b).length || draw.indexOf(a) - draw.indexOf(b),
  );
  return [...s.finishOrder, ...ranked, ...[...s.bottomOrder].reverse()];
}

/** The game ends with one player left holding cards — the Olho — or when nobody left can play. */
function endIfOver(d: Draft): boolean {
  const { s } = d;
  const remaining = s.seats.filter((id) => inGame(s, id));
  if (remaining.length > 1 && remaining.some((id) => canAct(s, id))) return false;
  endGame(d, standingOrder(s));
  return true;
}

function endGame(d: Draft, order: PlayerId[]): void {
  const { s } = d;
  const roles = assignRoles(order);
  const pointsDelta: Record<PlayerId, number> = {};
  for (const id of order) {
    const role = roles[id] as NonNullable<SessionPlayer['role']>;
    const entry = rosterEntry(s, id) as SessionPlayer;
    pointsDelta[id] = POINTS[role];
    entry.points += POINTS[role];
    entry.gamesPlayed += 1;
    entry.role = role;
    if (role === 'PRESIDENTE') entry.presidentCount += 1;
    if (role === 'OLHO') entry.olhoCount += 1;
  }
  s.lastGame = { gameNumber: s.gameNumber, order, roles, pointsDelta };
  s.gamesCompleted += 1;
  s.phase = 'GAME_SUMMARY';
  s.currentPlayerId = null;
  s.trick.skip = null;
  s.trick.closing = null;
  s.exchange = null;
  d.events.push({
    type: 'GameEnded',
    summary: s.lastGame,
    points: Object.fromEntries(s.roster.filter((p) => p.seated).map((p) => [p.playerId, p.points])),
  });
  // Whoever left during the game gives up their seat now.
  for (const id of s.leaving) {
    (rosterEntry(s, id) as SessionPlayer).seated = false;
    d.events.push({ type: 'PlayerLeft', playerId: id });
  }
  s.seats = s.seats.filter((id) => !s.leaving.includes(id));
  s.leaving = [];
  s.bottomOrder = [];
}

// ── Session ───────────────────────────────────────────────────

/**
 * Someone sits down mid-session: they play from the next game, without a role
 * (04). Whoever got up earlier keeps their points; whoever left the game in
 * play and comes back before it ends picks their cards up again.
 */
function playerJoined(d: Draft, playerId: PlayerId, seatIndex: number): Failure | null {
  const { s } = d;
  if (s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
  const existing = rosterEntry(s, playerId);
  if (existing?.seated) {
    if (!s.leaving.includes(playerId)) return failure('ALREADY_SEATED', 'Already at the table');
    s.leaving = s.leaving.filter((id) => id !== playerId);
    s.bottomOrder = s.bottomOrder.filter((id) => id !== playerId);
    d.events.push({ type: 'PlayerJoined', playerId, seatIndex: existing.seatIndex });
    return null;
  }
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEAT_COUNT) {
    return failure('INVALID_SEAT', `Seats go from 0 to ${SEAT_COUNT - 1}`);
  }
  if (s.roster.some((p) => p.seated && p.seatIndex === seatIndex)) {
    return failure('SEAT_TAKEN', 'That seat is taken');
  }
  if (existing) Object.assign(existing, { seated: true, seatIndex, role: null });
  else s.roster.push(newPlayer(playerId, seatIndex));
  s.waiting.push(playerId);
  d.events.push({ type: 'PlayerJoined', playerId, seatIndex });
  return null;
}

/**
 * A player leaves the room (04). Between games the seat is freed at once.
 * Mid-game they pass automatically from now on and take the worst place still
 * free; the seat is freed when the game ends.
 */
function playerLeft(d: Draft, playerId: PlayerId): Failure | null {
  const { s } = d;
  const entry = rosterEntry(s, playerId);
  if (!entry?.seated) return failure('NOT_SEATED', 'Not at the table');
  const inPlay = (s.phase === 'EXCHANGE' || s.phase === 'PLAYING') && s.seats.includes(playerId);
  if (!inPlay) {
    s.waiting = s.waiting.filter((id) => id !== playerId);
    s.seats = s.seats.filter((id) => id !== playerId);
    entry.seated = false;
    d.events.push({ type: 'PlayerLeft', playerId });
    return null;
  }
  if (s.leaving.includes(playerId)) return null;

  const wasCurrent = currentPlayerId(s) === playerId;
  const holding = inGame(s, playerId);
  s.leaving.push(playerId);
  if (holding) s.bottomOrder.push(playerId);
  d.events.push({ type: 'PlayerLeaving', playerId, position: positionOf(s, playerId) as number });

  if (s.phase === 'EXCHANGE') {
    const pair = s.exchange?.pairs.find((p) => p.receiver === playerId && p.returned === null);
    if (pair && s.exchange?.stage === 'RETURNING') {
      returnLowest(d, pair);
      finishExchangeIfDone(d);
    }
    return null;
  }
  if (endIfOver(d) || s.trick.closing || !wasCurrent) return null;
  if (s.trick.skip?.targetId === playerId) skipPlayer(d, playerId);
  else advance(d, playerId);
  return null;
}

// ── Pace ──────────────────────────────────────────────────────

/**
 * The follow-up the table takes on its own, derived from the state alone.
 * Every result carries it, so an action that lands in between (someone sits
 * down or gets up) re-arms the step instead of stalling the table.
 */
export function scheduleFor(state: OlhoState): ScheduledAction[] {
  const at = (action: OlhoSystemAction, delayMs: number): ScheduledAction[] => [{ action, delayMs }];
  switch (state.phase) {
    case 'EXCHANGE':
      return state.exchange?.stage === 'DEALT' ? at({ type: 'SYS_EXCHANGE_GIVE' }, PACE.exchangeGive) : [];
    case 'PLAYING': {
      const closing = state.trick.closing;
      if (!closing) return [];
      return at({ type: 'SYS_CLOSE_TRICK' }, closing.reason === 'ALL_PASSED' ? PACE.close : PACE.cut);
    }
    case 'GAME_SUMMARY':
      return at({ type: 'SYS_NEXT_GAME' }, PACE.summary);
    case 'WAITING':
      return seatedCount(state) >= MIN_PLAYERS ? at({ type: 'SYS_NEXT_GAME' }, PACE.waiting) : [];
    case 'FINISHED':
      return [];
  }
}
