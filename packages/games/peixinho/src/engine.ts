import {
  SYSTEM_PLAYER_ID,
  createDeck,
  fail,
  pickOne,
  shuffle,
  type ActionResult,
  type Card,
  type PlayerId,
  type Rng,
  type SetupOptions,
  type StandardRank,
} from '@cardroom/game-core';
import { getDefaultAction } from './moves';
import {
  DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  TOTAL_PEIXINHOS,
  handSizeFor,
  splitPeixinhos,
  totalPeixinhos,
  winnersOf,
} from './rules';
import { currentPlayerId, handOf, isOut, opponentsWithCards, peixinhosOf } from './state';
import type { AskEntry, PeixinhoAction, PeixinhoConfig, PeixinhoEvent, PeixinhoState } from './types';

type Result = ActionResult<PeixinhoState, PeixinhoEvent>;

export interface DealInput {
  seats: readonly PlayerId[];
  handSize: number;
  rng: Rng;
}

/** Every hand, and the pond with its top card first. */
export interface Deal {
  hands: Record<PlayerId, Card[]>;
  pond: Card[];
}

/** Produces the deal. Injectable so tests can fix the cards. */
export type Dealer = (input: DealInput) => Deal;

/** One 52-card deck shuffled by the server's DRBG, dealt one card at a time; the rest is the pond. */
export const shuffledDealer: Dealer = ({ seats, handSize, rng }) => {
  const deck = shuffle(createDeck({ jokers: 0 }), rng);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(seats.map((id) => [id, []]));
  let next = 0;
  for (let card = 0; card < handSize; card++) {
    for (const id of seats) (hands[id] as Card[]).push(deck[next++] as Card);
  }
  return { hands, pond: deck.slice(next) };
};

export function setup(
  players: readonly PlayerId[],
  config: PeixinhoConfig,
  rng: Rng,
  options: SetupOptions = {},
  dealer: Dealer = shuffledDealer,
): PeixinhoState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Peixinho needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');

  const starter = pickStarter(players, rng, options);
  const handSize = handSizeFor(players.length);
  const deal = dealer({ seats: players, handSize, rng });
  assertDeal(players, handSize, deal);
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');

  const state: PeixinhoState = {
    phase: 'PLAYING',
    config: { ...config },
    seats: [...players],
    currentIndex: players.indexOf(starter),
    hands: {},
    peixinhos: Object.fromEntries(players.map((id) => [id, []])),
    pond: [...deal.pond],
    pondSlots: deal.pond.map((_, slot) => slot),
    pondSize: deal.pond.length,
    awaitingFish: null,
    askLog: [],
    lastFish: null,
    actionCount: 0,
    winners: [],
    seed,
  };
  // A peixinho dealt straight away is laid down at once, without an extra turn (rules §3).
  for (const id of players) {
    const { hand, made } = splitPeixinhos(deal.hands[id] as Card[]);
    state.hands[id] = hand;
    state.peixinhos[id] = made.map((p) => p.rank);
  }
  return state;
}

/** First match: random. Afterwards whoever made the fewest peixinhos, drawn among ties (open point #4). */
function pickStarter(players: readonly PlayerId[], rng: Rng, options: SetupOptions): PlayerId {
  const previous = (options.previousResult?.standings ?? []).filter((s) => players.includes(s.playerId));
  if (previous.length === 0) return pickOne(players, rng);
  const fewest = Math.min(...previous.map((s) => s.score ?? 0));
  const candidates = previous.filter((s) => (s.score ?? 0) === fewest).map((s) => s.playerId);
  return candidates.length === 1 ? (candidates[0] as PlayerId) : pickOne(candidates, rng);
}

function assertDeal(players: readonly PlayerId[], handSize: number, deal: Deal): void {
  for (const id of players) {
    if (deal.hands[id]?.length !== handSize) throw new Error(`Dealer gave ${id} a wrong hand size`);
  }
  const ids = [...players.flatMap((id) => deal.hands[id] as Card[]), ...deal.pond].map((c) => c.id);
  if (ids.length !== DECK_SIZE || new Set(ids).size !== DECK_SIZE) {
    throw new Error('A deal must use each card of one 52-card deck exactly once');
  }
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: PeixinhoState): PeixinhoState {
  return {
    ...state,
    config: { ...state.config },
    seats: [...state.seats],
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]])),
    peixinhos: Object.fromEntries(Object.entries(state.peixinhos).map(([id, ranks]) => [id, [...ranks]])),
    pond: [...state.pond],
    pondSlots: [...state.pondSlots],
    awaitingFish: state.awaitingFish ? { ...state.awaitingFish } : null,
    askLog: state.askLog.map((entry) => ({
      ...entry,
      result: { ...entry.result },
      peixinhosMade: [...entry.peixinhosMade],
    })),
    lastFish: state.lastFish ? { ...state.lastFish } : null,
    winners: [...state.winners],
  };
}

export function applyAction(state: PeixinhoState, action: PeixinhoAction, playerId: PlayerId): Result {
  if (action.type === 'SYS_TIMEOUT') {
    if (playerId !== SYSTEM_PLAYER_ID) return fail('SYSTEM_ONLY', 'Only the server can do that');
    return timeout(state);
  }
  if (!state.seats.includes(playerId)) return fail('UNKNOWN_PLAYER', 'Player is not part of this game');
  if (state.phase !== 'PLAYING') return fail('GAME_OVER', 'The game is over');
  switch (action.type) {
    case 'ASK':
      return ask(state, playerId, action.targetId, action.rank);
    case 'FISH':
      return fish(state, playerId, action.pondPosition);
  }
}

/**
 * One draft per action: the state being built and the events describing it, so
 * the steps of a turn (give, lay down, refill, fish…) read like the rules.
 */
interface Draft {
  s: PeixinhoState;
  events: PeixinhoEvent[];
  /** Who was already out before this action (for `PlayerOut`). */
  outBefore: ReadonlySet<PlayerId>;
}

function draftOf(state: PeixinhoState): Draft {
  const s = cloneState(state);
  s.actionCount += 1;
  // It only describes the fish of the action that made it.
  s.lastFish = null;
  return { s, events: [], outBefore: new Set(state.seats.filter((id) => isOut(state, id))) };
}

function ask(state: PeixinhoState, asker: PlayerId, target: PlayerId, rank: StandardRank): Result {
  if (state.awaitingFish) return fail('MUST_FISH', 'Go fishing first');
  if (currentPlayerId(state) !== asker) return fail('NOT_YOUR_TURN', 'It is not your turn');
  if (target === asker) return fail('CANNOT_ASK_SELF', 'Ask another player');
  if (!state.seats.includes(target)) return fail('UNKNOWN_TARGET', 'That player is not at the table');
  if (handOf(state, target).length === 0) return fail('TARGET_EMPTY', 'That player has no cards');
  if (!handOf(state, asker).some((c) => c.rank === rank)) {
    return fail('RANK_NOT_IN_HAND', 'You can only ask for a rank you hold');
  }

  const draft = draftOf(state);
  const { s, events } = draft;
  const entry: AskEntry = {
    seq: s.askLog.length + 1,
    askerId: asker,
    targetId: target,
    rank,
    result: { type: 'GIVEN', count: 0 },
    peixinhosMade: [],
  };
  s.askLog.push(entry);
  events.push({ type: 'Asked', askerId: asker, targetId: target, rank });

  const given = (s.hands[target] as Card[]).filter((c) => c.rank === rank);
  if (given.length > 0) {
    // The server answers for them: nobody can hide a card (kit, requirement 1).
    s.hands[target] = (s.hands[target] as Card[]).filter((c) => c.rank !== rank);
    s.hands[asker] = [...(s.hands[asker] as Card[]), ...given];
    entry.result = { type: 'GIVEN', count: given.length };
    events.push({ type: 'CardsGiven', from: target, to: asker, rank, cards: given });
    refill(draft, target, false);
    entry.peixinhosMade.push(...layDown(draft, asker, true), ...refill(draft, asker, true));
    return keepTurn(draft, asker);
  }

  const pondEmpty = s.pond.length === 0;
  const awaitingPick = !pondEmpty && s.config.pondPicking;
  entry.result = { type: 'GO_FISH', caughtAsked: pondEmpty ? false : null, pondEmpty };
  events.push({ type: 'GoFish', askerId: asker, targetId: target, rank, pondEmpty, awaitingPick });
  if (pondEmpty) return passTurn(draft, asker);
  if (awaitingPick) {
    s.awaitingFish = { askerId: asker, targetId: target, rank };
    return { ok: true, state: s, events };
  }
  return drawFish(draft, asker, rank, s.pondSlots.at(-1) as number);
}

function fish(state: PeixinhoState, playerId: PlayerId, pondPosition: number | undefined): Result {
  const pending = state.awaitingFish;
  if (!pending) return fail('NOT_FISHING', 'Nobody told you to go fishing');
  if (pending.askerId !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn');
  const slot = pondPosition ?? state.pondSlots.at(-1);
  if (slot === undefined || !state.pondSlots.includes(slot)) {
    return fail('INVALID_POND_POSITION', 'There is no card there');
  }
  const draft = draftOf(state);
  draft.s.awaitingFish = null;
  return drawFish(draft, playerId, pending.rank, slot);
}

/**
 * Takes the pond's top card — whichever spot was tapped, so choosing gives no
 * advantage (contract §3). The asked rank lets the player go again, and so does
 * a peixinho, even one completed by another rank (rules §4–5).
 */
function drawFish(draft: Draft, playerId: PlayerId, rank: StandardRank, slot: number): Result {
  const { s, events } = draft;
  const card = s.pond.shift() as Card;
  s.pondSlots = s.pondSlots.filter((spot) => spot !== slot);
  s.hands[playerId] = [...(s.hands[playerId] as Card[]), card];
  const caughtAsked = card.rank === rank;
  s.lastFish = { playerId, card, caughtAsked, slot };
  const entry = s.askLog.at(-1) as AskEntry;
  entry.result = { type: 'GO_FISH', caughtAsked, pondEmpty: false };
  events.push({ type: 'Fished', playerId, rank, slot, caughtAsked, card: caughtAsked ? card : null });

  const made = [...layDown(draft, playerId, true), ...refill(draft, playerId, true)];
  entry.peixinhosMade.push(...made);
  return caughtAsked || made.length > 0 ? keepTurn(draft, playerId) : passTurn(draft, playerId);
}

/** Lays down every complete set of four in the player's hand (rules §5). */
function layDown(draft: Draft, playerId: PlayerId, extraTurn: boolean): StandardRank[] {
  const { s, events } = draft;
  const { hand, made } = splitPeixinhos(handOf(s, playerId));
  s.hands[playerId] = hand;
  for (const { rank, cards } of made) {
    (s.peixinhos[playerId] as StandardRank[]).push(rank);
    events.push({ type: 'PeixinhoMade', playerId, rank, cards, extraTurn });
  }
  return made.map((p) => p.rank);
}

/**
 * Out of cards: draw up to `refillCount` from the pond at once, again if those
 * make a peixinho (rules §6). Returns the peixinhos made along the way.
 */
function refill(draft: Draft, playerId: PlayerId, extraTurn: boolean): StandardRank[] {
  const { s, events } = draft;
  const made: StandardRank[] = [];
  while ((s.hands[playerId] as Card[]).length === 0 && s.pond.length > 0) {
    const count = Math.min(s.config.refillCount, s.pond.length);
    const cards = s.pond.splice(0, count);
    const slots = s.pondSlots.slice(-count);
    s.pondSlots = s.pondSlots.slice(0, -count);
    s.hands[playerId] = cards;
    events.push({ type: 'Refilled', playerId, count, slots });
    made.push(...layDown(draft, playerId, extraTurn));
  }
  return made;
}

/** Announces the players who just ran out of cards for good. */
function markOut(draft: Draft): void {
  for (const id of draft.s.seats) {
    if (!draft.outBefore.has(id) && isOut(draft.s, id))
      draft.events.push({ type: 'PlayerOut', playerId: id });
  }
}

/** The player goes again, unless the game is over or they have nothing left to ask with. */
function keepTurn(draft: Draft, playerId: PlayerId): Result {
  const { s } = draft;
  if (totalPeixinhos(s) === TOTAL_PEIXINHOS) return finish(draft);
  if ((s.hands[playerId] as Card[]).length === 0) return passTurn(draft, playerId);
  if (opponentsWithCards(s, playerId).length === 0) {
    // Only they hold cards: those are complete peixinhos (rules §7). Kept as a safety net.
    layDown(draft, playerId, false);
    return finish(draft);
  }
  markOut(draft);
  return { ok: true, state: s, events: draft.events };
}

/** The turn goes clockwise to the next player who still holds cards (rules §4, §6). */
function passTurn(draft: Draft, from: PlayerId): Result {
  const { s } = draft;
  if (totalPeixinhos(s) === TOTAL_PEIXINHOS) return finish(draft);
  const n = s.seats.length;
  const fromIndex = s.seats.indexOf(from);
  for (let step = 1; step < n; step++) {
    const index = (fromIndex + step) % n;
    const id = s.seats[index] as PlayerId;
    if (handOf(s, id).length > 0) {
      if (opponentsWithCards(s, id).length === 0) break;
      markOut(draft);
      s.currentIndex = index;
      draft.events.push({ type: 'TurnPassed', from, to: id });
      return { ok: true, state: s, events: draft.events };
    }
  }
  // Nobody else can play: whatever is left in one hand is complete peixinhos (rules §7).
  for (const id of s.seats) layDown(draft, id, false);
  return finish(draft);
}

function finish(draft: Draft): Result {
  const { s, events } = draft;
  s.phase = 'FINISHED';
  s.awaitingFish = null;
  s.winners = winnersOf(s);
  events.push({
    type: 'GameFinished',
    winners: [...s.winners],
    peixinhos: Object.fromEntries(s.seats.map((id) => [id, peixinhosOf(s, id).length])),
  });
  return { ok: true, state: s, events };
}

/** The decision timer ran out: ask for the rank you hold most of, or fish (open point #6). */
function timeout(state: PeixinhoState): Result {
  const current = currentPlayerId(state);
  const action = current ? getDefaultAction(state, current) : null;
  if (!current || !action) return fail('WRONG_PHASE', 'Nobody is on the clock');
  return applyAction(state, action, current);
}
