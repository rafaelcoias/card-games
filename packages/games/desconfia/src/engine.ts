import {
  STANDARD_RANKS,
  SYSTEM_PLAYER_ID,
  createDeck,
  fail,
  shuffle,
  type ActionResult,
  type Card,
  type CardId,
  type PlayerId,
  type Rng,
  type ScheduledAction,
  type StandardRank,
} from '@cardroom/game-core';
import { getDefaultAction } from './moves';
import {
  DECK_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTER_CARD,
  activeAfter,
  activePlayers,
  isTruthful,
  splitPeixinhos,
} from './rules';
import { canPlayNow, currentPlayerId, handOf } from './state';
import type { DesconfiaAction, DesconfiaConfig, DesconfiaEvent, DesconfiaState } from './types';

type Result = ActionResult<DesconfiaState, DesconfiaEvent>;

export interface DealInput {
  seats: readonly PlayerId[];
  rng: Rng;
}

/** Produces every player's hand. Injectable so tests can play with a fixed (even reduced) deck. */
export type Dealer = (input: DealInput) => Record<PlayerId, Card[]>;

/** The 54 cards shuffled by the server's DRBG and dealt one at a time, all of them (rules §3). */
export const shuffledDealer: Dealer = ({ seats, rng }) => {
  const deck = shuffle(createDeck({ jokers: 2 }), rng);
  const hands: Record<PlayerId, Card[]> = Object.fromEntries(seats.map((id) => [id, []]));
  deck.forEach((card, i) => (hands[seats[i % seats.length] as PlayerId] as Card[]).push(card));
  return hands;
};

export function setup(
  players: readonly PlayerId[],
  config: DesconfiaConfig,
  rng: Rng,
  dealer: Dealer = shuffledDealer,
): DesconfiaState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Desconfia needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');

  const dealt = dealer({ seats: players, rng });
  const ids = players.flatMap((id) => (dealt[id] ?? []).map((c) => c.id));
  if (new Set(ids).size !== ids.length || ids.length > DECK_SIZE) {
    throw new Error('A deal must use each card of the deck at most once');
  }
  // Whoever is dealt the 3 of clubs starts, even if it leaves in a peixinho (rules §3).
  const starter = Math.max(
    0,
    players.findIndex((id) => (dealt[id] ?? []).some((c) => c.id === STARTER_CARD)),
  );
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');

  const state: DesconfiaState = {
    phase: 'PLAYING',
    config: { ...config },
    seats: [...players],
    currentIndex: starter,
    hands: {},
    pile: [],
    claimRank: null,
    doubtWindow: null,
    lastReveal: null,
    removed: [],
    finishedOrder: [],
    nextPlayId: 1,
    seed,
  };
  for (const id of players) {
    const { hand, made } = splitPeixinhos(dealt[id] ?? []);
    state.hands[id] = hand;
    state.removed.push(...made.map(({ rank }) => ({ rank, playerId: id })));
  }
  // A hand made only of peixinhos is out of cards from the start (practically never with 54 cards).
  for (const id of players) if (handOf(state, id).length === 0) state.finishedOrder.push(id);
  if (state.finishedOrder.length > 0) {
    if (!config.playUntilEnd || activePlayers(state).length <= 1) state.phase = 'FINISHED';
    else if (state.finishedOrder.includes(players[starter] as PlayerId)) {
      state.currentIndex = activeAfter(state, starter)[0] as number;
    }
  }
  return state;
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: DesconfiaState): DesconfiaState {
  return {
    ...state,
    config: { ...state.config },
    seats: [...state.seats],
    hands: Object.fromEntries(Object.entries(state.hands).map(([id, hand]) => [id, [...hand]])),
    pile: state.pile.map((play) => ({ ...play, cards: [...play.cards] })),
    doubtWindow: state.doubtWindow ? { ...state.doubtWindow } : null,
    lastReveal: state.lastReveal ? { ...state.lastReveal, cards: [...state.lastReveal.cards] } : null,
    removed: state.removed.map((r) => ({ ...r })),
    finishedOrder: [...state.finishedOrder],
  };
}

interface Draft {
  s: DesconfiaState;
  events: DesconfiaEvent[];
  schedule: ScheduledAction[];
}

const draftOf = (state: DesconfiaState): Draft => ({ s: cloneState(state), events: [], schedule: [] });
const done = ({ s, events, schedule }: Draft): Result =>
  schedule.length > 0 ? { ok: true, state: s, events, schedule } : { ok: true, state: s, events };

export function applyAction(state: DesconfiaState, action: DesconfiaAction, playerId: PlayerId): Result {
  if (action.type.startsWith('SYS_') && playerId !== SYSTEM_PLAYER_ID) {
    return fail('SYSTEM_ONLY', 'Only the server can do that');
  }
  switch (action.type) {
    case 'SYS_WINDOW_MIN_ELAPSED':
      return windowMinElapsed(state, action.playId);
    case 'SYS_LAST_CARD_WINDOW_CLOSED':
      return lastCardWindowClosed(state, action.playId);
    case 'SYS_TIMEOUT':
      return timeout(state);
    case 'PLAY':
    case 'DOUBT': {
      if (!state.seats.includes(playerId)) return fail('UNKNOWN_PLAYER', 'Player is not part of this game');
      if (state.phase !== 'PLAYING') return fail('GAME_OVER', 'The game is over');
      if (state.finishedOrder.includes(playerId)) return fail('NOT_PLAYING', 'You are already out of cards');
      return action.type === 'PLAY'
        ? play(state, playerId, action.cardIds, action.claimRank)
        : doubt(state, playerId, action.playId);
    }
  }
}

/**
 * Any cards, face down, claimed as one rank: free on a new pile, otherwise the
 * pile's rank. Lies are accepted — that is the game (kit, requirement 1).
 */
function play(
  state: DesconfiaState,
  playerId: PlayerId,
  cardIds: readonly CardId[],
  claimRank: StandardRank,
): Result {
  if (state.doubtWindow?.lastCard) return fail('LAST_CARD_OPEN', 'Wait: a last card is open to doubts');
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn');
  if (!canPlayNow(state, playerId)) return fail('TOO_SOON', 'Give the others a moment to doubt');
  if (cardIds.length === 0) return fail('NO_CARDS', 'Play at least one card');
  const hand = handOf(state, playerId);
  const cards = cardIds.map((id) => hand.find((c) => c.id === id));
  if (new Set(cardIds).size !== cardIds.length || cards.some((c) => c === undefined)) {
    return fail('INVALID_CARD', 'Those cards are not in your hand');
  }
  if (!(STANDARD_RANKS as readonly string[]).includes(claimRank))
    return fail('INVALID_CLAIM', 'Claim a rank');
  if (state.claimRank !== null && claimRank !== state.claimRank) {
    return fail('WRONG_CLAIM', `The pile is in ${state.claimRank}`);
  }

  const draft = draftOf(state);
  const { s } = draft;
  const playId = s.nextPlayId++;
  const played = new Set(cardIds);
  s.hands[playerId] = hand.filter((c) => !played.has(c.id));
  s.pile.push({ playId, playerId, cards: cards as Card[], claimRank });
  s.claimRank = claimRank;
  s.lastReveal = null;
  const lastCard = handOf(s, playerId).length === 0;
  s.doubtWindow = { playId, playerId, minElapsed: false, lastCard };
  draft.events.push({ type: 'Played', playId, playerId, count: cardIds.length, claimRank, lastCard });
  if (lastCard) {
    draft.schedule.push({
      action: { type: 'SYS_LAST_CARD_WINDOW_CLOSED', playId },
      delayMs: s.config.lastCardWindowMs,
    });
  } else {
    // The next player is on turn but waits for the window's minimum (rules §5).
    s.currentIndex = activeAfter(s, s.seats.indexOf(playerId))[0] as number;
    draft.schedule.push({
      action: { type: 'SYS_WINDOW_MIN_ELAPSED', playId },
      delayMs: s.config.doubtMinWindowMs,
    });
  }
  return done(draft);
}

function windowMinElapsed(state: DesconfiaState, playId: number): Result {
  const window = state.doubtWindow;
  if (!window || window.playId !== playId || window.lastCard || window.minElapsed) {
    return fail('STALE_WINDOW', 'That window is no longer open');
  }
  const draft = draftOf(state);
  (draft.s.doubtWindow as NonNullable<DesconfiaState['doubtWindow']>).minElapsed = true;
  draft.events.push({ type: 'WindowMinElapsed', playId, nextPlayerId: currentPlayerId(draft.s) as PlayerId });
  return done(draft);
}

/** Nobody doubted the last card in time: its author is out of cards and wins (rules §7). */
function lastCardWindowClosed(state: DesconfiaState, playId: number): Result {
  const window = state.doubtWindow;
  if (!window || window.playId !== playId || !window.lastCard) {
    return fail('STALE_WINDOW', 'That window is no longer open');
  }
  const draft = draftOf(state);
  draft.s.doubtWindow = null;
  if (declareOut(draft, window.playerId)) return done(draft);
  // Playing to the end: the pile and its rank stay, the next player goes on.
  const next = activeAfter(draft.s, draft.s.seats.indexOf(window.playerId))[0] as number;
  draft.s.currentIndex = next;
  draft.events.push({ type: 'TurnPassed', to: draft.s.seats[next] as PlayerId });
  return done(draft);
}

/**
 * The first valid doubt wins; it names its play so a late one never lands on a
 * newer play (contract §4). The last play is turned over: a lie sends the whole
 * pile to its author, the truth to the doubter. The winner starts a new pile.
 */
function doubt(state: DesconfiaState, doubterId: PlayerId, playId: number): Result {
  const window = state.doubtWindow;
  if (!window || window.playId !== playId) return fail('DOUBT_CLOSED', 'That play can no longer be doubted');
  if (window.playerId === doubterId) return fail('CANNOT_DOUBT_SELF', 'You cannot doubt your own play');

  const draft = draftOf(state);
  const { s, events } = draft;
  const last = s.pile.at(-1) as DesconfiaState['pile'][number];
  const authorId = last.playerId;
  const truthful = isTruthful(last.cards, last.claimRank);
  const loserId = truthful ? doubterId : authorId;
  const winnerId = truthful ? authorId : doubterId;
  events.push(
    { type: 'DoubtCalled', playId, doubterId, authorId },
    {
      type: 'Revealed',
      playId,
      authorId,
      doubterId,
      claimRank: last.claimRank,
      cards: [...last.cards],
      truthful,
    },
  );

  const taken = s.pile.flatMap((p) => p.cards);
  s.hands[loserId] = [...handOf(s, loserId), ...taken];
  events.push({ type: 'PileTaken', playerId: loserId, count: taken.length });
  s.pile = [];
  s.claimRank = null;
  s.doubtWindow = null;
  s.lastReveal = {
    playId,
    playerId: authorId,
    doubterId,
    claimRank: last.claimRank,
    cards: [...last.cards],
    truthful,
    loserId,
    winnerId,
  };
  removePeixinhos(draft, loserId);

  // Out of cards: the author whose last card stood (or, rarely, a loser emptied by a peixinho).
  for (const id of [authorId, loserId]) {
    if (!s.finishedOrder.includes(id) && handOf(s, id).length === 0 && declareOut(draft, id))
      return done(draft);
  }
  const winnerIndex = s.seats.indexOf(winnerId);
  s.currentIndex = s.finishedOrder.includes(winnerId)
    ? (activeAfter(s, winnerIndex)[0] as number)
    : winnerIndex;
  events.push({ type: 'NewPile', starterId: s.seats[s.currentIndex] as PlayerId });
  return done(draft);
}

/** Four natural cards of a rank in a hand leave the game, face up (rules §6). */
function removePeixinhos(draft: Draft, playerId: PlayerId): void {
  const { hand, made } = splitPeixinhos(handOf(draft.s, playerId));
  draft.s.hands[playerId] = hand;
  for (const { rank, cards } of made) {
    draft.s.removed.push({ rank, playerId });
    draft.events.push({ type: 'PeixinhoRemoved', playerId, rank, cards });
  }
}

/**
 * A player is out of cards. Returns `true` when that ends the game: at the
 * first winner, or playing to the end once a single player is left (open point #4).
 */
function declareOut(draft: Draft, playerId: PlayerId): boolean {
  const { s, events } = draft;
  s.finishedOrder.push(playerId);
  events.push({ type: 'PlayerWon', playerId, position: s.finishedOrder.length });
  if (s.config.playUntilEnd && activePlayers(s).length > 1) return false;
  s.phase = 'FINISHED';
  s.doubtWindow = null;
  events.push({
    type: 'GameFinished',
    finishedOrder: [...s.finishedOrder],
    handCounts: Object.fromEntries(s.seats.map((id) => [id, handOf(s, id).length])),
  });
  return true;
}

/** The turn timer ran out: one card, of the pile's rank if possible (open point #5). */
function timeout(state: DesconfiaState): Result {
  const current = currentPlayerId(state);
  const action = current ? getDefaultAction(state, current) : null;
  if (!current || !action) return fail('WRONG_PHASE', 'Nobody is on the clock');
  return applyAction(state, action, current);
}
