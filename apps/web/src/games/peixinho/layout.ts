import { CARD_WIDTH, stableJitter, type CardSize } from '@cardroom/ui';
import type { TableLayout } from '../shared/use-media';
import type { SceneCard } from './scene';

export type SeatVariant = 'regular' | 'compact';

export interface Sizes {
  seat: SeatVariant;
  hand: CardSize;
  pond: CardSize;
  showcase: CardSize;
}

/** Up to 6 at the table: compact seats as it fills up; cards as big as the screen's height allows. */
export function peixinhoSizes(layout: TableLayout, height: number, playerCount: number): Sizes {
  const opponents = playerCount - 1;
  const seat: SeatVariant =
    opponents > (layout === 'desktop' ? 5 : layout === 'tablet' ? 3 : 2) ? 'compact' : 'regular';
  if (layout === 'desktop') {
    return {
      seat,
      hand: height >= 1000 ? 'xl' : height >= 860 ? 'lg' : 'ml',
      pond: height >= 900 ? 'sm' : 'xs',
      showcase: height >= 900 ? 'md' : 'ms',
    };
  }
  if (layout === 'tablet') {
    return { seat, hand: height >= 1000 ? 'lg' : 'ml', pond: 'sm', showcase: 'md' };
  }
  return {
    seat,
    hand: height >= 780 ? 'ml' : height >= 680 ? 'md' : 'ms',
    pond: 'xs',
    showcase: height >= 680 ? 'ms' : 'sm',
  };
}

export interface PondSpot {
  /** Offset from the pond's centre. */
  x: number;
  y: number;
  rotate: number;
}

/**
 * The pond "à balda" (UI §1): cards tossed face down over an oval, each with
 * its own position and rotation. Derived from the match id, so they are the
 * same on every screen and stay put for the whole match.
 */
export function pondSpots(matchId: string, count: number, radii: { x: number; y: number }): PondSpot[] {
  return Array.from({ length: count }, (_, slot) => {
    const angle = (stableJitter(`${matchId}:pond:${slot}:a`) + 1) * Math.PI;
    // √ spreads them evenly over the oval instead of bunching them in the middle.
    const reach = Math.sqrt((stableJitter(`${matchId}:pond:${slot}:r`) + 1) / 2);
    return {
      x: Math.round(Math.cos(angle) * reach * radii.x),
      y: Math.round(Math.sin(angle) * reach * radii.y),
      rotate: Math.round(stableJitter(`${matchId}:pond:${slot}:t`) * 50),
    };
  });
}

/** Cards of one rank overlap a lot; groups keep a clear gap between them (UI §1: grouped by rank). */
const INNER = 0.26;
const OUTER = 0.6;
const MIN_INNER = 0.16;
const MIN_OUTER = 0.34;
interface Placed {
  item: SceneCard;
  left: number;
  rotate: number;
  y: number;
}

/** A group of 2+ cards of one rank shows its count above it. */
interface GroupBadge {
  rank: string;
  count: number;
  /** Centre of the group. */
  x: number;
  top: number;
}

/**
 * Positions for a hand grouped by rank (UI §1): cards of a rank overlap a lot,
 * groups keep a gap. Squeezes to the width available, first the gaps between
 * groups' cards, then between groups; past the minimum it lies flat and scrolls.
 */
export function placeHand(cards: readonly SceneCard[], size: CardSize, available: number | undefined) {
  const width = CARD_WIDTH[size];
  const gaps = cards.slice(1).map((c, i) => (c.card.rank === cards[i]?.card.rank ? 'inner' : 'outer'));
  const inners = gaps.filter((g) => g === 'inner').length;
  const outers = gaps.length - inners;
  let inner = INNER;
  let outer = OUTER;
  let flat = false;
  const fit = available === undefined ? Infinity : (available - width) / width;
  if (INNER * inners + OUTER * outers > fit) {
    const scale = fit / (INNER * inners + OUTER * outers);
    inner = Math.max(MIN_INNER, INNER * scale);
    outer = outers > 0 ? Math.max(MIN_OUTER, Math.min(OUTER, (fit - inner * inners) / outers)) : OUTER;
    if (inner * inners + outer * outers > fit + 1e-6) {
      [inner, outer, flat] = [MIN_INNER, MIN_OUTER, true];
    }
  }
  const arc = flat ? 0 : Math.min(8, cards.length * 1.4);
  let left = 0;
  const placed: Placed[] = cards.map((item, i) => {
    if (i > 0) left += width * (gaps[i - 1] === 'inner' ? inner : outer);
    const t = cards.length <= 1 ? 0 : i / (cards.length - 1) - 0.5;
    return { item, left, rotate: t * 2 * arc, y: flat ? 0 : t * t * 4 * 8 };
  });
  const badges: GroupBadge[] = [];
  placed.forEach((p, i) => {
    const rank = p.item.card.rank;
    if (placed[i - 1]?.item.card.rank === rank) return;
    // Sorted by rank: a group is contiguous.
    const group = placed.filter((q) => q.item.card.rank === rank);
    if (group.length < 2) return;
    const last = group.at(-1) as Placed;
    badges.push({
      rank,
      count: group.length,
      x: (p.left + last.left + width) / 2,
      top: Math.min(...group.map((q) => q.y)),
    });
  });
  return { placed, badges, total: left + width, flat };
}
