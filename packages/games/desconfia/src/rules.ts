import {
  JOKER,
  STANDARD_RANKS,
  type Card,
  type GameResult,
  type GameStanding,
  type PlayerId,
  type StandardRank,
  type Suit,
} from '@cardroom/game-core';
import type { DesconfiaState } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** 52 cards and both jokers (rules §2). */
export const DECK_SIZE = 54;
/** Whoever is dealt it starts (rules §3). */
export const STARTER_CARD = '3C';

const SUIT_ORDER: Readonly<Record<Suit, number>> = { S: 0, H: 1, C: 2, D: 3 };

/** Position in the hand's order: by rank (2 … A), jokers last. */
function order(card: Card): number {
  if (card.rank === JOKER) return 100 + Number(card.id.slice(2));
  return STANDARD_RANKS.indexOf(card.rank) * 4 + SUIT_ORDER[card.suit as Suit];
}

export function compareCards(a: Card, b: Card): number {
  return order(a) - order(b);
}

/** A joker is always the rank claimed (rules §4.5): a play is true when every card is one or the other. */
export function isTruthful(cards: readonly Card[], claimRank: StandardRank): boolean {
  return cards.every((c) => c.rank === JOKER || c.rank === claimRank);
}

/** Every set of four natural cards of a rank; jokers never count (open point #2). */
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

/** Players still in the game, clockwise from `fromIndex` (excluded) — the next one first. */
export function activeAfter(
  state: Pick<DesconfiaState, 'seats' | 'finishedOrder'>,
  fromIndex: number,
): number[] {
  const n = state.seats.length;
  return Array.from({ length: n - 1 }, (_, step) => (fromIndex + step + 1) % n).filter(
    (index) => !state.finishedOrder.includes(state.seats[index] as PlayerId),
  );
}

export function activePlayers(state: Pick<DesconfiaState, 'seats' | 'finishedOrder'>): PlayerId[] {
  return state.seats.filter((id) => !state.finishedOrder.includes(id));
}

/**
 * Contract §8. The first out of cards wins. Playing to the end, the others are
 * placed in the order they finished and the last one loses; otherwise they are
 * placed by fewest cards left (ties share the place). `score` = cards left.
 */
export function standings(
  state: Pick<DesconfiaState, 'seats' | 'hands' | 'finishedOrder' | 'config'>,
): GameStanding[] {
  const cardsLeft = (id: PlayerId) => state.hands[id]?.length ?? 0;
  const finished = state.finishedOrder.map((playerId, i) => ({
    playerId,
    position: i + 1,
    outcome: i === 0 ? ('WINNER' as const) : ('PLACED' as const),
    score: cardsLeft(playerId),
  }));
  const rest = state.seats
    .filter((id) => !state.finishedOrder.includes(id))
    .map((playerId, seat) => ({ playerId, seat, score: cardsLeft(playerId) }))
    .sort((a, b) => a.score - b.score || a.seat - b.seat);
  const placed: GameStanding[] = rest.map(({ playerId, score }) => {
    const position = finished.length + 1 + rest.filter((other) => other.score < score).length;
    const last = state.config.playUntilEnd && rest.length === 1;
    return { playerId, position, outcome: last ? 'LOSER' : 'PLACED', score };
  });
  return [...finished, ...placed];
}

export function resultOf(state: DesconfiaState): GameResult {
  return {
    standings: standings(state),
    summary: { removedRanks: state.removed.map((r) => r.rank) },
  };
}
