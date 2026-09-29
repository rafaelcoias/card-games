import {
  STANDARD_RANKS,
  type Card,
  type GameResult,
  type GameStanding,
  type PlayerId,
  type StandardRank,
  type Suit,
} from '@cardroom/game-core';
import { peixinhosOf } from './state';
import type { AskEntry, PeixinhoState, TableMemory } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const DECK_SIZE = 52;
/** One per rank (rules §1). */
export const TOTAL_PEIXINHOS = STANDARD_RANKS.length;

/**
 * Time to tap a card of the pond after "Vai à pesca!" (open point #2): the 5 s
 * of the kit plus the second the answer's bubble is on screen.
 */
export const FISH_TIMEOUT_MS = 6_000;
/** Asks shown with the default table memory (open point #3). */
export const MEMORY_LAST = 5;

/** 7 cards each with two players, 5 with three or more (rules §3). */
export function handSizeFor(playerCount: number): number {
  return playerCount === 2 ? 7 : 5;
}

const SUIT_ORDER: Readonly<Record<Suit, number>> = { S: 0, H: 1, C: 2, D: 3 };

/** Position in the hand's order; the Peixinho deck has no jokers. */
const order = (card: Card) =>
  STANDARD_RANKS.indexOf(card.rank as StandardRank) * 4 + SUIT_ORDER[card.suit as Suit];

/** Hand order: grouped by rank, 2 … A, suits in a fixed order inside a group. */
export function compareCards(a: Card, b: Card): number {
  return order(a) - order(b);
}

export function ranksIn(hand: readonly Card[]): StandardRank[] {
  return STANDARD_RANKS.filter((rank) => hand.some((c) => c.rank === rank));
}

/** Splits every complete set of four out of a hand (rules §5). */
export function splitPeixinhos(hand: readonly Card[]): {
  hand: Card[];
  made: { rank: StandardRank; cards: Card[] }[];
} {
  const made: { rank: StandardRank; cards: Card[] }[] = [];
  let rest = [...hand];
  for (const rank of STANDARD_RANKS) {
    const cards = rest.filter((c) => c.rank === rank);
    if (cards.length === 4) {
      made.push({ rank, cards: [...cards].sort(compareCards) });
      rest = rest.filter((c) => c.rank !== rank);
    }
  }
  return { hand: rest, made };
}

export function totalPeixinhos(state: Pick<PeixinhoState, 'peixinhos'>): number {
  return Object.values(state.peixinhos).reduce((sum, ranks) => sum + ranks.length, 0);
}

/** The asks a table shows (open point #3). */
export function visibleLog(log: readonly AskEntry[], memory: TableMemory): AskEntry[] {
  if (memory === 'NONE') return [];
  return (memory === 'LAST_5' ? log.slice(-MEMORY_LAST) : log).map((entry) => ({
    ...entry,
    result: { ...entry.result },
    peixinhosMade: [...entry.peixinhosMade],
  }));
}

/**
 * Most peixinhos first. Ties share the position; everyone in first place wins
 * (open point #5), the others are placed (contract §7).
 */
export function standings(state: Pick<PeixinhoState, 'seats' | 'peixinhos'>): GameStanding[] {
  const scored = state.seats
    .map((playerId, seat) => ({ playerId, seat, score: peixinhosOf(state, playerId).length }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  return scored.map(({ playerId, score }) => {
    const position = 1 + scored.filter((other) => other.score > score).length;
    return { playerId, position, outcome: position === 1 ? 'WINNER' : 'PLACED', score };
  });
}

export function resultOf(state: PeixinhoState): GameResult {
  return {
    standings: standings(state),
    summary: { peixinhos: Object.fromEntries(state.seats.map((id) => [id, [...peixinhosOf(state, id)]])) },
  };
}

/** Everyone with the most peixinhos. */
export function winnersOf(state: Pick<PeixinhoState, 'seats' | 'peixinhos'>): PlayerId[] {
  return standings(state)
    .filter((s) => s.outcome === 'WINNER')
    .map((s) => s.playerId);
}
