import { CARD_WIDTH, cardHeight, type CardSize } from '@cardroom/ui';

const ORDER: CardSize[] = ['xl', 'lg', 'ml', 'md', 'ms', 'sm', 'xs'];

export interface PepeSizes {
  /** The viewer's columns and the centre piles. */
  mine: CardSize;
  /** The other player's columns and both reserves. */
  theirs: CardSize;
  /** How much of each face-down card under a top shows. */
  peek: (size: CardSize) => number;
  gap: number;
}

const peek = (size: CardSize) => Math.max(4, Math.round(CARD_WIDTH[size] * 0.12));
const stack = (size: CardSize) => cardHeight(size) + 4 * peek(size);

/**
 * The biggest cards that fit (UI §1, §8): five columns across, the centre row
 * (two piles and two reserves) and three rows down — yours, the centre with
 * its button, the other player's (one size smaller).
 */
export function pepeSizes(width: number, height: number): PepeSizes {
  const gap = width < 420 ? 6 : 10;
  for (let i = 0; i < ORDER.length; i++) {
    const mine = ORDER[i] as CardSize;
    const theirs = ORDER[Math.min(i + 1, ORDER.length - 1)] as CardSize;
    const wm = CARD_WIDTH[mine];
    const wt = CARD_WIDTH[theirs];
    const across = 5 * wm + 4 * gap + 24;
    const centre = 2 * wm + 2 * wt + 3 * 16 + 24;
    const down = stack(theirs) + 28 + stack(mine) + cardHeight(mine) + 76 + 3 * 14;
    if (across <= width && centre <= width && down <= height) return { mine, theirs, peek, gap };
  }
  return { mine: 'xs', theirs: 'xs', peek, gap };
}
