import { SEAT_COUNT } from '@cardroom/blackjack';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

/**
 * The seven places of the half-moon, turned so the viewer always sits in the
 * middle one (UI §1): the real order is kept, only rotated. Place 0 is the
 * dealer's left, drawn on the viewer's right (first base), as at a casino.
 */
export function visualSlot(seatIndex: number, selfSeat: number | null): number {
  const middle = Math.floor(SEAT_COUNT / 2);
  const shift = selfSeat === null ? 0 : middle - selfSeat;
  return (((seatIndex + shift) % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT;
}

export interface TableGeometry {
  /** Centre of each of the seven places, by visual slot. */
  slots: Point[];
  dealer: Point;
  /** Half-axes of the arc (the felt's rail is drawn along it). */
  arc: { center: Point; rx: number; ry: number };
  /** Seats shrink when the screen is narrow. */
  seatScale: number;
}

const ARC_FROM = 12; // degrees below the horizontal, on the right…
const ARC_TO = 168; // …to the left

/** A half-moon is wider than tall: on portrait screens the arc keeps to the lower part. */
const MAX_ROUNDNESS = 0.95;

/**
 * Places on the lower arc of an ellipse centred under the dealer: slot 0 on the
 * right, slot 6 on the left, slot 3 at the bottom middle.
 */
export function tableGeometry(arena: Box, seat: Box): TableGeometry {
  const seatScale = Math.max(0.62, Math.min(1, arena.width / (SEAT_COUNT * (seat.width + 8))));
  const w = seat.width * seatScale;
  const h = seat.height * seatScale;
  const rx = Math.max(0, arena.width / 2 - w / 2 - 6);
  const bottom = arena.height - h / 2 - 6;
  const ry = Math.max(0, Math.min(bottom - arena.height * 0.2, rx * MAX_ROUNDNESS));
  const center = { x: arena.width / 2, y: bottom - ry };
  const slots = Array.from({ length: SEAT_COUNT }, (_, slot) => {
    const angle = ((ARC_FROM + ((ARC_TO - ARC_FROM) * slot) / (SEAT_COUNT - 1)) * Math.PI) / 180;
    return { x: center.x + rx * Math.cos(angle), y: center.y + ry * Math.sin(angle) };
  });
  return { slots, dealer: { x: center.x, y: arena.height * 0.1 }, arc: { center, rx, ry }, seatScale };
}
