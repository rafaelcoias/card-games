import { JOKER, type Card, type GameStanding, type PlayerId, type Rank } from '@cardroom/game-core';
import type { GringoConfig, PowerSet, PowerType, Slot } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
/** Cards dealt to each player, face down, in a 2 × 2 grid (rules §4). */
export const GRID_SIZE = 4;
/** The bottom row, `[3]` and `[4]`: the two cards everyone looks at first (open point #2). */
export const INITIAL_PEEK_INDEXES: readonly number[] = [2, 3];
/** 52 cards and both jokers per deck (rules §2). */
export const CARDS_PER_DECK = 54;
/** From this many players on, `AUTO` plays with two decks (open point #11). */
export const TWO_DECKS_FROM = 7;

/** Pauses the engine schedules itself (UI §10). */
export const PACE = {
  /** A card looked at with a power stays turned for its owner this long (unless they say they memorised it). */
  peek: 5000,
  /** Two cards trading places (jack, king): both slots light up, the cards glide, and land. */
  swap: 2200,
  /** A good snap: the card flies to the discard pile and the slot empties. */
  snapHit: 1100,
  /** A missed snap: the card is shown to everyone (1.5 s), goes back, a penalty card comes in. */
  snapMiss: 2300,
  /** After snapping another player's card: the card given glides into their empty slot, and lands. */
  give: 1400,
} as const;

/** Rules §6: the default "figures" set, or the same four powers on 7 to 10. */
export const POWERS: Readonly<Record<PowerSet, Partial<Record<Rank, PowerType>>>> = {
  FIGURAS: { '10': 'PEEK_OTHER', J: 'BLIND_SWAP', Q: 'PEEK_OWN', K: 'PEEK_AND_SWAP' },
  SETE_A_DEZ: { '7': 'PEEK_OTHER', '8': 'BLIND_SWAP', '9': 'PEEK_OWN', '10': 'PEEK_AND_SWAP' },
};

export function powerOf(card: Pick<Card, 'rank'>, set: PowerSet): PowerType | null {
  return POWERS[set][card.rank] ?? null;
}

/** The two decks from 7 players on with `AUTO` (open point #11). */
export function deckCount(config: Pick<GringoConfig, 'decks'>, playerCount: number): number {
  if (config.decks === 'AUTO') return playerCount >= TWO_DECKS_FROM ? 2 : 1;
  return config.decks;
}

const FACE_POINTS: Partial<Record<Rank, number>> = { A: 1, J: 11, Q: 12, K: 13 };

/**
 * Rules §3 and open point #1: ace 1, 2–10 their value, jack 11, queen 12,
 * black king 13, red king −3 (or −1), joker 0.
 */
export function points(
  card: Pick<Card, 'rank' | 'suit'>,
  redKingValue: GringoConfig['redKingValue'],
): number {
  if (card.rank === JOKER) return 0;
  if (card.rank === 'K' && (card.suit === 'H' || card.suit === 'D')) return redKingValue;
  return FACE_POINTS[card.rank] ?? Number(card.rank);
}

/** A grid's total: empty slots count 0. */
export function gridPoints(grid: readonly Slot[], redKingValue: GringoConfig['redKingValue']): number {
  return grid.reduce((sum, slot) => sum + (slot.card ? points(slot.card, redKingValue) : 0), 0);
}

/** A snap matches on the rank alone: a red king snaps a black one, a joker a joker (open point #6). */
export const sameRank = (a: Pick<Card, 'rank'>, b: Pick<Card, 'rank'>): boolean => a.rank === b.rank;

/**
 * Contract §8: the fewest points win (ties share the win); everyone else is
 * placed by points, equal points sharing a place. `score` = points.
 */
export function standings(
  scores: Readonly<Record<PlayerId, number>>,
  seats: readonly PlayerId[],
): GameStanding[] {
  const rows = seats.map((playerId, seat) => ({ playerId, seat, score: scores[playerId] ?? 0 }));
  rows.sort((a, b) => a.score - b.score || a.seat - b.seat);
  const best = rows[0]?.score ?? 0;
  return rows.map(({ playerId, score }) => ({
    playerId,
    position: 1 + rows.filter((other) => other.score < score).length,
    outcome: score === best ? 'WINNER' : 'PLACED',
    score,
  }));
}
