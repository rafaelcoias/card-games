import { CARD_WIDTH, cardHeight, type CardSize } from '@cardroom/ui';
import { STAGE_HEADER, type Viewport } from '../shared/use-media';

export interface Sizes {
  hand: CardSize;
  selfTable: CardSize;
  opponents: CardSize;
  center: CardSize;
}

/**
 * Card sets from biggest to smallest. The hand (what you read most) keeps its
 * size longest; the others shrink first. `ml/ml/sm/ml` is the phone's set:
 * a phone hand stays at `ml`, but its pile and table cards can still grow.
 */
const TIERS: readonly Sizes[] = [
  { hand: 'xl', selfTable: 'lg', opponents: 'md', center: 'lg' },
  { hand: 'xl', selfTable: 'ml', opponents: 'ms', center: 'ml' },
  { hand: 'lg', selfTable: 'ml', opponents: 'ms', center: 'ml' },
  { hand: 'lg', selfTable: 'md', opponents: 'sm', center: 'md' },
  { hand: 'lg', selfTable: 'ms', opponents: 'sm', center: 'ms' },
  { hand: 'lg', selfTable: 'sm', opponents: 'xs', center: 'ms' },
  { hand: 'ml', selfTable: 'ml', opponents: 'sm', center: 'ml' },
  { hand: 'ml', selfTable: 'md', opponents: 'sm', center: 'md' },
  { hand: 'md', selfTable: 'ms', opponents: 'sm', center: 'ms' },
  { hand: 'md', selfTable: 'sm', opponents: 'xs', center: 'sm' },
  { hand: 'ms', selfTable: 'sm', opponents: 'xs', center: 'sm' },
];

const SMALLEST = TIERS[TIERS.length - 1] as Sizes;

/** Three table slots side by side (the gap grows with the card). */
const tableRowWidth = (size: CardSize) => CARD_WIDTH[size] * 3.24;
/** Face-down cards sit a little below the face-up ones. */
const tableRowHeight = (size: CardSize) => cardHeight(size) * 1.16;

/**
 * Height the table needs with a set of cards, measured on the rendered table:
 * opponents (seat, name and arc), the pile and its badge, own table cards, the
 * fanned hand, the action bar, and the gaps between them (with a small margin).
 */
export function mexicanaHeight(sizes: Sizes, compact: boolean): number {
  const opponents = (compact ? 70 : 94) + tableRowHeight(sizes.opponents);
  const center = cardHeight(sizes.center) + 40;
  const self = tableRowHeight(sizes.selfTable);
  const hand = cardHeight(sizes.hand) + 20;
  return opponents + center + self + hand + 68 + 20;
}

function fits(sizes: Sizes, viewport: Viewport, opponentCount: number, compact: boolean): boolean {
  const width = viewport.width - 24;
  // A hand this big still fans a few cards across the screen instead of scrolling.
  if (CARD_WIDTH[sizes.hand] > viewport.width / 3.5) return false;
  if (tableRowWidth(sizes.selfTable) > width) return false;
  // Phones scroll the opponents sideways; bigger screens keep them in one row.
  if (!compact) {
    const seat = Math.max(tableRowWidth(sizes.opponents), 150) + 16;
    if (opponentCount * seat + (opponentCount - 1) * 24 > width) return false;
  }
  return mexicanaHeight(sizes, compact) <= viewport.height - STAGE_HEADER;
}

/** The biggest cards that fit the screen: nothing overlaps, and none are smaller than they need be. */
export function fitMexicanaSizes(viewport: Viewport, opponentCount: number, compact: boolean): Sizes {
  if (viewport.width === 0) return TIERS[3] as Sizes; // before the first measure (SSR)
  return TIERS.find((sizes) => fits(sizes, viewport, opponentCount, compact)) ?? SMALLEST;
}
