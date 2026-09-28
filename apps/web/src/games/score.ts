import type { ResultStyle } from './types';

/** A result always reads with its sign: `+30`, `−50`, `0`. */
export function signed(amount: number): string {
  if (amount > 0) return `+${amount}`;
  if (amount < 0) return `−${Math.abs(amount)}`;
  return '0';
}

/** `+20 fichas`, `−30 fichas`, `0 fichas`. */
export function signedChips(amount: number): string {
  return `${signed(amount)} ${Math.abs(amount) === 1 ? 'ficha' : 'fichas'}`;
}

/** A result's score as its game reads it: chips won or lost, or penalty points. */
export function formatScore(style: ResultStyle | undefined, score: number): string {
  return style === 'chips' ? signedChips(score) : `${score} pts`;
}
