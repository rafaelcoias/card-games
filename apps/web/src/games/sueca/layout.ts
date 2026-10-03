import { PLAY_ORDER, type Seat } from '@cardroom/sueca';
import { CARD_WIDTH, cardHeight, type CardSize } from '@cardroom/ui';
import type { TableLayout } from '../shared/use-media';

/** Where a seat sits on the viewer's screen (UI §2). */
export type Side = 'bottom' | 'right' | 'top' | 'left';

const SIDES: readonly Side[] = ['bottom', 'right', 'top', 'left'];

/**
 * You are always at the bottom and your partner at the top. Play goes
 * counter-clockwise, so whoever plays after you sits on your right.
 */
export function sideOf(seat: Seat, mySeat: Seat | null): Side {
  const steps = (PLAY_ORDER.indexOf(seat) - PLAY_ORDER.indexOf(mySeat ?? 'S') + 4) % 4;
  return SIDES[steps] as Side;
}

export function seatAt(side: Side, mySeat: Seat | null): Seat {
  const steps = SIDES.indexOf(side);
  return PLAY_ORDER[(PLAY_ORDER.indexOf(mySeat ?? 'S') + steps) % 4] as Seat;
}

export interface Point {
  x: number;
  y: number;
}

export interface Sizes {
  trick: CardSize;
  hand: CardSize;
  /** Names and backs of the other three. */
  compact: boolean;
}

/** Cards as big as the screen allows; the hand of ten always fits a phone's width. */
export function suecaSizes(layout: TableLayout, height: number): Sizes {
  if (layout === 'desktop') {
    return {
      trick: height >= 940 ? 'lg' : height >= 800 ? 'ml' : 'md',
      hand: height >= 940 ? 'lg' : 'ml',
      compact: false,
    };
  }
  if (layout === 'tablet') return { trick: height >= 900 ? 'ml' : 'md', hand: 'ml', compact: false };
  return { trick: height >= 760 ? 'ms' : 'sm', hand: height >= 740 ? 'md' : 'ms', compact: true };
}

export interface Geometry {
  center: Point;
  /** Each side's card in the trick, in a cross facing the middle (UI §6). */
  trick: Record<Side, Point & { rotate: number }>;
  /** Name tags of the three others (the viewer's own sits under the arena). */
  seats: Record<Exclude<Side, 'bottom'>, Point>;
  /** The face-up trump card beside its holder (UI §4). */
  trump: Record<Side, Point & { rotate: number }>;
  /** Tricks taken: ours on the left, theirs on the right, in the bottom corners. */
  piles: { us: Point; them: Point };
}

const PAD = 10;

export function tableGeometry(
  arena: { width: number; height: number },
  size: CardSize,
  compact: boolean,
): Geometry {
  const w = CARD_WIDTH[size];
  const h = cardHeight(size);
  const tag = compact ? { width: 84, height: 54 } : { width: 140, height: 60 };
  const center = { x: arena.width / 2, y: Math.max(h * 1.2, arena.height * 0.48) };
  // The cross: far enough that the cards do not cover each other, never into the side seats.
  const sideRoom = arena.width / 2 - tag.width - PAD - w / 2;
  const dx = Math.max(w * 0.7, Math.min(w * 1.1, sideRoom));
  const dy = h * 0.62;
  const seats = {
    top: { x: center.x, y: PAD + tag.height / 2 },
    left: { x: PAD + tag.width / 2, y: center.y },
    right: { x: arena.width - PAD - tag.width / 2, y: center.y },
  };
  const beside = compact ? w * 0.45 : w * 0.6;
  return {
    center,
    trick: {
      bottom: { x: center.x, y: center.y + dy, rotate: 0 },
      top: { x: center.x, y: center.y - dy, rotate: 0 },
      left: { x: center.x - dx, y: center.y, rotate: -3 },
      right: { x: center.x + dx, y: center.y, rotate: 3 },
    },
    seats,
    trump: {
      // Left of the top seat: the score sits in the top-right corner.
      top: { x: seats.top.x - tag.width / 2 - beside, y: seats.top.y + h * 0.18, rotate: -12 },
      left: { x: seats.left.x + (compact ? 0 : 6), y: seats.left.y + tag.height / 2 + h * 0.62, rotate: -10 },
      right: {
        x: seats.right.x - (compact ? 0 : 6),
        y: seats.right.y + tag.height / 2 + h * 0.62,
        rotate: 10,
      },
      // Only while the deal runs: then it joins the viewer's hand.
      bottom: { x: center.x + w * 1.3, y: center.y + dy + h * 0.15, rotate: 8 },
    },
    piles: {
      us: { x: PAD + 34, y: arena.height - PAD - 30 },
      them: { x: arena.width - PAD - 34, y: arena.height - PAD - 30 },
    },
  };
}
