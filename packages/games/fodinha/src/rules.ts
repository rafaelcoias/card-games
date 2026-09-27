import type { Card, PlayerId, Rank } from '@cardroom/game-core';
import type { FodinhaState, Play, RoundSummary, TrickOutcome } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const DECK_SIZE = 52;

/** Pause with the finished trick on the table before it is cleared (UI §6). */
export const TRICK_PAUSE_MS = 1200;
/** Round summary on screen before the next deal (UI §7). */
export const ROUND_SUMMARY_MS = 3500;
/** Gap between automatic plays in a blind round (open point #6). */
export const AUTO_PLAY_DELAY_MS = 700;
/** First automatic play of a blind round, so the last bid registers first. */
export const FIRST_AUTO_PLAY_DELAY_MS = 900;

const RANK_STRENGTH: Readonly<Record<Rank, number>> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  JOKER: 0, // Not in the Fodinha deck.
};

/** `2 < … < K < A < A♦` — suits do not count, except for the ace of diamonds (rules §3). */
export function strength(card: Card): number {
  return card.rank === 'A' && card.suit === 'D' ? 15 : RANK_STRENGTH[card.rank];
}

const SUIT_ORDER = { C: 0, D: 1, H: 2, S: 3 } as const;

/** Weakest first; suit only breaks ties so the order is stable. */
export function compareCards(a: Card, b: Card): number {
  return strength(a) - strength(b) || SUIT_ORDER[a.suit ?? 'C'] - SUIT_ORDER[b.suit ?? 'C'];
}

/** `max = 5` → `[1, 2, 3, 4, 5, 4, 3, 2]`, repeated (rules §4). */
export function handSizeCycle(max: number): number[] {
  if (max <= 1) return [1];
  const up = Array.from({ length: max }, (_, i) => i + 1);
  const down = Array.from({ length: max - 2 }, (_, i) => max - 1 - i);
  return [...up, ...down];
}

export function handSizeForRound(round: number, max: number): number {
  const cycle = handSizeCycle(max);
  return cycle[(round - 1) % cycle.length] as number;
}

/** Highest card wins, unless two or more share the highest strength: then nobody does (rules §9). */
export function resolveTrick(plays: readonly Play[]): TrickOutcome {
  const top = Math.max(...plays.map((p) => strength(p.card)));
  const best = plays.filter((p) => strength(p.card) === top);
  if (best.length === 1) return { winner: (best[0] as Play).playerId, tiedPlayerIds: [] };
  return { winner: null, tiedPlayerIds: best.map((p) => p.playerId) };
}

export const roundValue = (carry: number): number => 1 + carry;

export function bidsSum(state: Pick<FodinhaState, 'seats' | 'bids'>): number {
  return state.seats.reduce((sum, id) => sum + (state.bids[id] ?? 0), 0);
}

/**
 * Bids open to `playerId` (assumed to be on turn): `0…handSize`, minus the one
 * that would make the bids add up to the tricks when the last bidder is restricted.
 */
export function validBids(state: FodinhaState, playerId: PlayerId): number[] {
  const all = Array.from({ length: state.handSize + 1 }, (_, bid) => bid);
  const pending = state.seats.filter((id) => state.bids[id] === null);
  const isLast = pending.length === 1 && pending[0] === playerId;
  if (!state.config.lastBidderRestriction || !isLast) return all;
  const sum = bidsSum(state);
  return all.filter((bid) => sum + bid !== state.handSize);
}

/**
 * Everyone who missed their bid (by any amount) takes the round's value; if
 * nobody missed, the value carries over to the next round (rules §10).
 */
export function scoreRound(state: FodinhaState): {
  summary: RoundSummary;
  points: Record<PlayerId, number>;
  carry: number;
} {
  const value = roundValue(state.carry);
  const failed = new Set(state.seats.filter((id) => state.tricksWon[id] !== state.bids[id]));
  const carry = failed.size > 0 ? 0 : state.carry + 1;
  const points = { ...state.points };
  const rows = state.seats.map((playerId) => {
    const pointsAdded = failed.has(playerId) ? value : 0;
    points[playerId] = (points[playerId] ?? 0) + pointsAdded;
    return {
      playerId,
      bid: state.bids[playerId] ?? 0,
      won: state.tricksWon[playerId] ?? 0,
      failed: failed.has(playerId),
      pointsAdded,
    };
  });
  return {
    summary: { round: state.round, handSize: state.handSize, value, rows, carryAfter: carry },
    points,
    carry,
  };
}

/** Rules §2: everyone must be dealt the biggest hand from one 52-card deck. */
export function fitsInDeck(playerCount: number, maxHandSize: number): boolean {
  return playerCount * maxHandSize <= DECK_SIZE;
}
