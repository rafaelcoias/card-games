import {
  SYSTEM_PLAYER_ID,
  createDeck,
  createSeededRng,
  fail,
  losersOf,
  ok,
  pickOne,
  shuffle,
  type ActionResult,
  type Card,
  type CardId,
  type PlayerId,
  type Rng,
  type ScheduledAction,
  type SetupOptions,
} from '@cardroom/game-core';
import { getDefaultAction } from './moves';
import {
  AUTO_PLAY_DELAY_MS,
  FIRST_AUTO_PLAY_DELAY_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUND_SUMMARY_MS,
  TRICK_PAUSE_MS,
  bidsSum,
  fitsInDeck,
  handSizeForRound,
  resolveTrick,
  roundValue,
  scoreRound,
  validBids,
} from './rules';
import { currentPlayerId, isBlind } from './state';
import type { FodinhaAction, FodinhaConfig, FodinhaEvent, FodinhaState, FodinhaSystemAction } from './types';

type Result = ActionResult<FodinhaState, FodinhaEvent>;

export interface DealInput {
  round: number;
  seats: readonly PlayerId[];
  starterIndex: number;
  handSize: number;
  seed: string;
}

/** Produces every player's hand for a round. Injectable so tests can fix the cards. */
export type Dealer = (input: DealInput) => Record<PlayerId, Card[]>;

/**
 * Fresh 52-card deck per round, shuffled by a PRNG keyed by the match's secret
 * seed and the round number, dealt one card at a time clockwise from the starter.
 */
export const shuffledDealer: Dealer = ({ round, seats, starterIndex, handSize, seed }) => {
  const deck = shuffle(createDeck({ jokers: 0 }), createSeededRng(`${seed}:${round}`));
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(seats.map((id) => [id, []]));
  let next = 0;
  for (let card = 0; card < handSize; card++) {
    for (let offset = 0; offset < seats.length; offset++) {
      const id = seats[(starterIndex + offset) % seats.length] as PlayerId;
      (hands[id] as Card[]).push(deck[next++] as Card);
    }
  }
  return hands;
};

export function assertTable(playerCount: number, config: FodinhaConfig): void {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`Fodinha needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${playerCount}`);
  }
  if (!fitsInDeck(playerCount, config.maxHandSize)) {
    throw new RangeError(`${playerCount} players × ${config.maxHandSize} cards do not fit in a 52-card deck`);
  }
}

export function setup(
  players: readonly PlayerId[],
  config: FodinhaConfig,
  rng: Rng,
  options: SetupOptions = {},
  dealer: Dealer = shuffledDealer,
): FodinhaState {
  assertTable(players.length, config);
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');

  const starterIndex = players.indexOf(pickStarter(players, rng, options));
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');
  const zero = () => Object.fromEntries(players.map((id) => [id, 0]));
  const base: FodinhaState = {
    phase: 'BIDDING',
    config: { ...config },
    seats: [...players],
    round: 1,
    handSize: 0,
    starterIndex,
    currentIndex: starterIndex,
    hands: {},
    bids: {},
    tricksWon: {},
    trick: { leaderIndex: starterIndex, plays: [], outcome: null },
    lastTrick: null,
    tricksPlayed: 0,
    points: zero(),
    carry: 0,
    history: [],
    losers: [],
    seed,
  };
  return dealRound(base, 1, starterIndex, dealer);
}

/** First match: random. Afterwards one of the previous losers, drawn when there are several (open point #4). */
function pickStarter(players: readonly PlayerId[], rng: Rng, options: SetupOptions): PlayerId {
  const losers = losersOf(options.previousResult).filter((id) => players.includes(id));
  if (losers.length === 1) return losers[0] as PlayerId;
  return pickOne(losers.length > 0 ? losers : players, rng);
}

/** Resets the table for `round` and deals it (mutates and returns `draft`). */
function dealRound(draft: FodinhaState, round: number, starterIndex: number, dealer: Dealer): FodinhaState {
  const handSize = handSizeForRound(round, draft.config.maxHandSize);
  const dealt = dealer({ round, seats: draft.seats, starterIndex, handSize, seed: draft.seed });
  draft.round = round;
  draft.handSize = handSize;
  draft.starterIndex = starterIndex;
  draft.currentIndex = starterIndex;
  draft.hands = Object.fromEntries(draft.seats.map((id) => [id, [...(dealt[id] ?? [])]]));
  draft.bids = Object.fromEntries(draft.seats.map((id) => [id, null]));
  draft.tricksWon = Object.fromEntries(draft.seats.map((id) => [id, 0]));
  draft.trick = { leaderIndex: starterIndex, plays: [], outcome: null };
  draft.lastTrick = null;
  draft.tricksPlayed = 0;
  draft.phase = 'BIDDING';
  for (const id of draft.seats) {
    if (draft.hands[id]?.length !== handSize) throw new Error(`Dealer gave ${id} a wrong hand size`);
  }
  return draft;
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: FodinhaState): FodinhaState {
  const copyHands = Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]]));
  return {
    ...state,
    seats: [...state.seats],
    hands: copyHands,
    bids: { ...state.bids },
    tricksWon: { ...state.tricksWon },
    trick: { ...state.trick, plays: [...state.trick.plays] },
    points: { ...state.points },
    history: [...state.history],
    losers: [...state.losers],
  };
}

const SYSTEM_ACTIONS = new Set<FodinhaAction['type']>([
  'SYS_RESOLVE_TRICK_DONE',
  'SYS_NEXT_ROUND',
  'SYS_TIMEOUT',
  'SYS_AUTO_PLAY',
]);

export function isSystemAction(action: FodinhaAction): action is FodinhaSystemAction {
  return SYSTEM_ACTIONS.has(action.type);
}

export function applyAction(
  state: FodinhaState,
  action: FodinhaAction,
  playerId: PlayerId,
  dealer: Dealer = shuffledDealer,
): Result {
  if (isSystemAction(action)) {
    if (playerId !== SYSTEM_PLAYER_ID) return fail('SYSTEM_ONLY', 'Only the server can do that');
    switch (action.type) {
      case 'SYS_RESOLVE_TRICK_DONE':
        return clearTrick(state);
      case 'SYS_NEXT_ROUND':
        return nextRound(state, dealer);
      case 'SYS_TIMEOUT':
        return timeout(state);
      case 'SYS_AUTO_PLAY':
        return autoPlay(state);
    }
  }
  if (!state.seats.includes(playerId)) return fail('UNKNOWN_PLAYER', 'Player is not part of this game');
  switch (action.type) {
    case 'PLACE_BID':
      return placeBid(state, playerId, action.bid);
    case 'PLAY_CARD':
      return playCard(state, playerId, action.cardId);
  }
}

function placeBid(state: FodinhaState, playerId: PlayerId, bid: number): Result {
  if (state.phase !== 'BIDDING') return fail('WRONG_PHASE', 'Bids are closed');
  if (state.bids[playerId] !== null) return fail('ALREADY_BID', 'Your bid is locked');
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn to bid');
  if (!Number.isInteger(bid) || bid < 0 || bid > state.handSize) {
    return fail('INVALID_BID', `Bid between 0 and ${state.handSize}`);
  }
  if (!validBids(state, playerId).includes(bid)) {
    return fail('FORBIDDEN_BID', 'The last bid cannot make the bids add up to the tricks');
  }

  const next = cloneState(state);
  next.bids[playerId] = bid;
  const events: FodinhaEvent[] = [{ type: 'BidPlaced', playerId, bid, bidsSum: bidsSum(next) }];
  const schedule: ScheduledAction[] = [];

  if (next.seats.every((id) => next.bids[id] !== null)) {
    next.phase = 'PLAYING';
    next.currentIndex = next.starterIndex;
    next.trick = { leaderIndex: next.starterIndex, plays: [], outcome: null };
    if (isBlind(next))
      schedule.push({ action: { type: 'SYS_AUTO_PLAY' }, delayMs: FIRST_AUTO_PLAY_DELAY_MS });
  } else {
    next.currentIndex = (next.currentIndex + 1) % next.seats.length;
  }
  return ok(next, events, schedule);
}

function playCard(state: FodinhaState, playerId: PlayerId, cardId: CardId): Result {
  if (state.phase !== 'PLAYING') return fail('WRONG_PHASE', 'You cannot play a card now');
  if (isBlind(state)) return fail('BLIND_ROUND', 'In a blind round cards are played automatically');
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn');
  const card = state.hands[playerId]?.find((c) => c.id === cardId);
  if (!card) return fail('INVALID_CARD', 'That card is not in your hand');
  return commitPlay(state, playerId, card);
}

/** Puts a validated card on the table; resolves the trick once everyone has played. */
function commitPlay(state: FodinhaState, playerId: PlayerId, card: Card): Result {
  const next = cloneState(state);
  next.hands[playerId] = (next.hands[playerId] ?? []).filter((c) => c.id !== card.id);
  next.trick.plays.push({ playerId, card });
  const events: FodinhaEvent[] = [{ type: 'CardPlayed', playerId, card }];

  if (next.trick.plays.length < next.seats.length) {
    next.currentIndex = (next.currentIndex + 1) % next.seats.length;
    const schedule: ScheduledAction[] = isBlind(next)
      ? [{ action: { type: 'SYS_AUTO_PLAY' }, delayMs: AUTO_PLAY_DELAY_MS }]
      : [];
    return ok(next, events, schedule);
  }

  const outcome = resolveTrick(next.trick.plays);
  if (outcome.winner !== null) next.tricksWon[outcome.winner] = (next.tricksWon[outcome.winner] ?? 0) + 1;
  next.tricksPlayed += 1;
  next.trick.outcome = outcome;
  next.phase = 'TRICK_RESOLVED';
  events.push({ type: 'TrickResolved', ...outcome });
  return ok(next, events, [{ action: { type: 'SYS_RESOLVE_TRICK_DONE' }, delayMs: TRICK_PAUSE_MS }]);
}

function clearTrick(state: FodinhaState): Result {
  if (state.phase !== 'TRICK_RESOLVED' || !state.trick.outcome) {
    return fail('WRONG_PHASE', 'There is no finished trick on the table');
  }
  const next = cloneState(state);
  const outcome = state.trick.outcome;
  next.lastTrick = { plays: [...state.trick.plays], winner: outcome.winner };

  if (next.tricksPlayed < next.handSize) {
    // The round's starter opens every trick, whoever took (or tied) the last one (rules §8).
    const leaderIndex = next.starterIndex;
    next.trick = { leaderIndex, plays: [], outcome: null };
    next.currentIndex = leaderIndex;
    next.phase = 'PLAYING';
    const nextLeaderId = next.seats[leaderIndex] as PlayerId;
    return ok(next, [{ type: 'TrickCleared', winner: outcome.winner, nextLeaderId }]);
  }

  const { summary, points, carry } = scoreRound(next);
  next.points = points;
  next.carry = carry;
  next.history.push(summary);
  next.trick = { leaderIndex: next.starterIndex, plays: [], outcome: null };
  next.losers = next.seats.filter((id) => (points[id] ?? 0) >= next.config.maxPoints);
  const events: FodinhaEvent[] = [
    { type: 'TrickCleared', winner: outcome.winner, nextLeaderId: null },
    { type: 'RoundScored', summary },
  ];

  if (next.losers.length > 0) {
    next.phase = 'FINISHED';
    events.push({
      type: 'GameFinished',
      losers: [...next.losers],
      survivors: next.seats.filter((id) => !next.losers.includes(id)),
      points: { ...points },
    });
    return ok(next, events);
  }
  next.phase = 'ROUND_SCORED';
  return ok(next, events, [{ action: { type: 'SYS_NEXT_ROUND' }, delayMs: ROUND_SUMMARY_MS }]);
}

function nextRound(state: FodinhaState, dealer: Dealer): Result {
  if (state.phase !== 'ROUND_SCORED') return fail('WRONG_PHASE', 'The round is not over');
  const next = dealRound(
    cloneState(state),
    state.round + 1,
    (state.starterIndex + 1) % state.seats.length,
    dealer,
  );
  const counts = Object.fromEntries(next.seats.map((id) => [id, next.handSize]));
  return ok(next, [
    {
      type: 'RoundStarted',
      round: next.round,
      handSize: next.handSize,
      value: roundValue(next.carry),
      starterId: next.seats[next.starterIndex] as PlayerId,
      blind: isBlind(next),
    },
    { type: 'CardsDealt', counts },
  ]);
}

/** The decision timer ran out: bid 0 (or the lowest allowed) / play the lowest card (open point #5). */
function timeout(state: FodinhaState): Result {
  const current = currentPlayerId(state);
  const action = current ? getDefaultAction(state, current) : null;
  if (!current || !action) return fail('WRONG_PHASE', 'Nobody is on the clock');
  return action.type === 'PLACE_BID'
    ? placeBid(state, current, action.bid)
    : playCard(state, current, action.cardId);
}

/** Blind round: the current player's unseen card goes to the table on its own (open point #6). */
function autoPlay(state: FodinhaState): Result {
  const current = currentPlayerId(state);
  const card = current ? state.hands[current]?.[0] : undefined;
  if (state.phase !== 'PLAYING' || !isBlind(state) || !current || !card) {
    return fail('WRONG_PHASE', 'Cards are only played automatically in blind rounds');
  }
  return commitPlay(state, current, card);
}
