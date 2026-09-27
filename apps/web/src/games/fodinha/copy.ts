import { compareCards } from '@cardroom/fodinha';
import type { Card } from '@cardroom/game-core';

/** Hand order: weakest to strongest (A♦ last), for easy scanning. */
export function sortHand<T extends { card: Card }>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => compareCards(a.card, b.card));
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Faltam 2" / "Excesso de 1" / "Soma igual às vazas", comparing bids with the tricks at stake. */
export function bidsBalance(sum: number, tricks: number): { text: string; tone: 'under' | 'over' | 'even' } {
  if (sum < tricks) return { text: `Faltam ${tricks - sum}`, tone: 'under' };
  if (sum > tricks) return { text: `Excesso de ${sum - tricks}`, tone: 'over' };
  return { text: 'Soma igual às vazas', tone: 'even' };
}

/**
 * How a player's round is going (UI §5): on target, still short, or already
 * failed for good (over the bid, or too few tricks left to reach it).
 */
export function bidTone(bid: number, won: number, tricksLeft: number): 'hit' | 'short' | 'failed' {
  if (won > bid || bid - won > tricksLeft) return 'failed';
  return won === bid ? 'hit' : 'short';
}

/** One point from the limit (UI §8). */
export const atRisk = (points: number, maxPoints: number) => points >= maxPoints - 1;
