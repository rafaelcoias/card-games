import { CARD_WIDTH, cardHeight, type CardSize } from '@cardroom/ui';
import type { Box } from '../fodinha/layout';
import type { TableLayout } from '../shared/use-media';

export interface Sizes {
  /** The viewer's own grid, at the bottom. */
  mine: CardSize;
  /** The other players' grids. */
  theirs: CardSize;
  /** Deck, drawn card and discard pile. */
  center: CardSize;
  /** Phones with more than two opponents: their grids in a strip across the top (UI §9). */
  strip: boolean;
}

/** Up to 10 at the table: the viewer's grid big, the others' small, the middle in between. */
export function gringoSizes(layout: TableLayout, height: number, playerCount: number): Sizes {
  const opponents = playerCount - 1;
  if (layout === 'desktop') {
    return {
      mine: height >= 960 ? 'ml' : height >= 820 ? 'md' : 'ms',
      theirs: opponents <= 4 && height >= 860 ? 'sm' : 'xs',
      center: height >= 900 ? 'md' : 'ms',
      strip: false,
    };
  }
  if (layout === 'tablet') {
    return {
      mine: height >= 1000 ? 'ml' : 'md',
      theirs: opponents <= 3 && height >= 900 ? 'sm' : 'xs',
      center: 'ms',
      strip: false,
    };
  }
  return {
    mine: height >= 780 ? 'ms' : 'sm',
    theirs: 'xs',
    center: height >= 700 ? 'sm' : 'xs',
    strip: opponents > 2,
  };
}

/** Space between the slots of a grid. */
export const slotGap = (size: CardSize) => (CARD_WIDTH[size] >= 68 ? 8 : 4);

/**
 * Where a slot sits (UI §2): `[1] [2]` on top, `[3] [4]` below, and the
 * penalty slots `[5] [6]…` in new columns to the right — nothing else moves.
 */
export function slotCell(index: number): { col: number; row: number } {
  if (index < 4) return { col: index % 2, row: Math.floor(index / 2) };
  return { col: 2 + Math.floor((index - 4) / 2), row: (index - 4) % 2 };
}

/** A grid's size for its highest slot index. */
export function gridBox(maxIndex: number, size: CardSize): Box {
  const gap = slotGap(size);
  const cols = Math.max(2, slotCell(Math.max(3, maxIndex)).col + 1);
  return {
    width: cols * CARD_WIDTH[size] + (cols - 1) * gap,
    height: 2 * cardHeight(size) + gap,
  };
}

/** An opponent's seat around the table: name over a 2 × 2 grid with room for a penalty column. */
export function seatBox(size: CardSize): Box {
  const grid = gridBox(5, size);
  return { width: Math.max(130, grid.width), height: grid.height + 46 };
}
