import { stableJitter, type CardSize } from '@cardroom/ui';
import type { TableLayout } from '../shared/use-media';

export type SeatVariant = 'regular' | 'compact';

export interface Sizes {
  seat: SeatVariant;
  hand: CardSize;
  /** Plays in the middle of the table. */
  trick: CardSize;
}

/**
 * Up to 8 at the table, hands of 6 to 18 cards: compact seats as the table
 * fills up, and cards as big as the screen's height allows.
 */
export function olhoSizes(layout: TableLayout, height: number, playerCount: number): Sizes {
  const opponents = playerCount - 1;
  const seat: SeatVariant =
    opponents > (layout === 'desktop' ? 5 : layout === 'tablet' ? 3 : 2) ? 'compact' : 'regular';
  if (layout === 'desktop') {
    return {
      seat,
      hand: height >= 1000 ? 'xl' : height >= 860 ? 'lg' : 'ml',
      trick: height >= 900 ? 'md' : 'ms',
    };
  }
  if (layout === 'tablet') return { seat, hand: height >= 1000 ? 'lg' : 'ml', trick: 'ms' };
  return {
    seat,
    hand: height >= 780 ? 'md' : height >= 680 ? 'ms' : 'sm',
    trick: height >= 700 ? 'sm' : 'xs',
  };
}

export interface PlaySpot {
  x: number;
  y: number;
  rotate: number;
}

/**
 * Where a play lies on the trick (UI §1): stacked a little off the centre and
 * turned, the same on every screen (derived from the play's key).
 */
export function playSpot(key: string, spread: number): PlaySpot {
  return {
    x: Math.round(stableJitter(`${key}:x`) * spread),
    y: Math.round(stableJitter(`${key}:y`) * spread * 0.45),
    rotate: Math.round(stableJitter(`${key}:r`) * 9),
  };
}
