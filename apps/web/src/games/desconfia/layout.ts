import { stableJitter, type CardSize } from '@cardroom/ui';
import type { TableLayout } from '../shared/use-media';

export type SeatVariant = 'regular' | 'compact';

export interface Sizes {
  seat: SeatVariant;
  hand: CardSize;
  pile: CardSize;
  /** Doubted plays turned over, and peixinhos fanned out, in the middle. */
  reveal: CardSize;
}

/** Up to 8 at the table: compact seats as it fills up; cards as big as the screen's height allows. */
export function desconfiaSizes(layout: TableLayout, height: number, playerCount: number): Sizes {
  const opponents = playerCount - 1;
  const seat: SeatVariant =
    opponents > (layout === 'desktop' ? 5 : layout === 'tablet' ? 3 : 2) ? 'compact' : 'regular';
  if (layout === 'desktop') {
    return {
      seat,
      hand: height >= 1000 ? 'xl' : height >= 860 ? 'lg' : 'ml',
      pile: height >= 900 ? 'sm' : 'xs',
      reveal: height >= 900 ? 'md' : 'ms',
    };
  }
  if (layout === 'tablet') return { seat, hand: height >= 1000 ? 'lg' : 'ml', pile: 'sm', reveal: 'md' };
  return {
    seat,
    // Hands run to 27 cards and more: one size down from the other games, so they fan instead of scroll.
    hand: height >= 780 ? 'md' : height >= 680 ? 'ms' : 'sm',
    pile: 'xs',
    reveal: height >= 680 ? 'ms' : 'sm',
  };
}

export interface PileSpot {
  x: number;
  y: number;
  rotate: number;
}

/**
 * Where a card lies on the messy pile (UI §1): a little off the centre and
 * turned, derived from the match and the card's place, so every screen shows
 * the same pile and a card never jumps.
 */
export function pileSpot(matchId: string, key: string, spread: number): PileSpot {
  return {
    x: Math.round(stableJitter(`${matchId}:${key}:x`) * spread),
    y: Math.round(stableJitter(`${matchId}:${key}:y`) * spread * 0.55),
    rotate: Math.round(stableJitter(`${matchId}:${key}:r`) * 40),
  };
}
