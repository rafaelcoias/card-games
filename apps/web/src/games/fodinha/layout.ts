import type { PlayerId } from '@cardroom/game-core';

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  width: number;
  height: number;
}

export interface TableGeometry {
  /** Centre of each opponent's seat, clockwise from the viewer's left. */
  seats: Map<PlayerId, Point>;
  /** Where each player's card lands in the middle, tilted towards its owner. */
  trick: Map<PlayerId, Point & { rotate: number }>;
  center: Point;
  /** Half-axes of the seats' oval (the table's felt is drawn inside it). */
  radii: Point;
  /** Seats shrink (never below 0.7) when the table is too crowded for the screen. */
  seatScale: number;
}

const PAD = 6;
/** Opponents spread over the top of the table, from just below the left side to just below the right. */
const ARC_START = 165;
const ARC_END = 375;
/** Trick cards sit at most this far from the centre towards their owner… */
const MAX_REACH = 0.55;
/** …and never closer to their seat than this. */
const CLEARANCE = 10;
/** 2 = ellipse; higher = a rounder rectangle that uses the screen's edges (phones are tall). */
const SQUARENESS = 3.2;
const SAMPLES = 240;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Point of a superellipse of half-axes (1, 1) at parameter angle `deg`. */
function shape(deg: number): Point {
  const t = rad(deg);
  const e = 2 / SQUARENESS;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: Math.sign(c) * Math.abs(c) ** e, y: Math.sign(s) * Math.abs(s) ** e };
}

/** Parameter angles that split the arc into `count` pieces of equal length (on screen), and that length. */
function evenAngles(count: number, rx: number, ry: number): { angles: number[]; length: number } {
  const angles: number[] = [];
  const lengths: number[] = [0];
  let previous = shape(ARC_START);
  for (let i = 0; i <= SAMPLES; i++) {
    const angle = ARC_START + ((ARC_END - ARC_START) * i) / SAMPLES;
    const point = shape(angle);
    if (i > 0)
      lengths.push(
        (lengths.at(-1) as number) + Math.hypot((point.x - previous.x) * rx, (point.y - previous.y) * ry),
      );
    angles.push(angle);
    previous = point;
  }
  const total = lengths.at(-1) as number;
  const picked = Array.from({ length: count }, (_, k) => {
    const target = (total * (k + 0.5)) / count;
    const i = Math.max(
      0,
      lengths.findIndex((length) => length >= target),
    );
    return angles[i] as number;
  });
  return { angles: picked, length: total };
}

/** Half-axes of the seats' path for a seat box, and where the seats go on it. */
function seatPath(arena: Box, seat: Box, count: number) {
  const cy = arena.height * 0.58;
  const rx = Math.max(0, arena.width / 2 - seat.width / 2 - PAD);
  let ry = Math.max(0, cy - seat.height / 2 - PAD);
  const { angles, length } = evenAngles(count, rx, ry);
  // Seats low on the sides must stay inside the arena too.
  const lowest = Math.max(0, ...angles.map((a) => shape(a).y));
  if (lowest > 0) ry = Math.min(ry, (arena.height - seat.height / 2 - PAD - cy) / lowest);
  return { cy, rx, ry, angles, length };
}

/**
 * Seats around an oval table (UI §1). The viewer sits at the bottom, outside
 * the arena; opponents follow clockwise — left side, top, right side — so the
 * next player to act after you is on your left, as at a real table.
 */
export function tableGeometry(input: {
  arena: Box;
  seatIds: readonly PlayerId[];
  selfId: PlayerId | null;
  seat: Box;
  card: Box;
}): TableGeometry {
  const { arena, seatIds, selfId, seat, card } = input;
  const selfIndex = selfId ? seatIds.indexOf(selfId) : -1;
  const opponents =
    selfIndex >= 0 ? [...seatIds.slice(selfIndex + 1), ...seatIds.slice(0, selfIndex)] : [...seatIds];

  const cx = arena.width / 2;
  // Each seat needs about its own size along the path; shrink them when there is not enough.
  const room = seatPath(arena, seat, opponents.length).length;
  const needed = opponents.length * ((seat.width + seat.height) / 2 + 4);
  const seatScale = Math.max(0.7, Math.min(1, room / Math.max(1, needed)));
  const scaled = { width: seat.width * seatScale, height: seat.height * seatScale };
  // A little below the middle: the top edge holds seats, the bottom only the viewer's card.
  const { cy, rx, ry, angles } = seatPath(arena, scaled, opponents.length);

  // Trick cards go on an inner ellipse that keeps every card clear of the seats' boxes.
  const tx = Math.max(
    card.width / 2,
    Math.min(rx * MAX_REACH, rx - (scaled.width + card.width) / 2 - CLEARANCE),
  );
  const ty = Math.max(
    card.height / 3,
    Math.min(ry * MAX_REACH, ry - (scaled.height + card.height) / 2 - CLEARANCE),
  );

  const seats = new Map<PlayerId, Point>();
  const trick = new Map<PlayerId, Point & { rotate: number }>();
  opponents.forEach((id, i) => {
    const angle = angles[i] as number;
    const p = shape(angle);
    seats.set(id, { x: cx + rx * p.x, y: cy + ry * p.y });
    trick.set(id, {
      x: cx + tx * Math.cos(rad(angle)),
      y: cy + ty * Math.sin(rad(angle)),
      rotate: (angle - 270) * 0.1,
    });
  });
  if (selfId && selfIndex >= 0) {
    // Below the middle, clear of the cards that come from the top of the table.
    const below = Math.max(ty, card.height + CLEARANCE);
    const y = Math.min(cy + below, arena.height - card.height / 2 - PAD);
    trick.set(selfId, { x: cx, y, rotate: 0 });
  }
  return { seats, trick, center: { x: cx, y: cy }, radii: { x: rx, y: ry }, seatScale };
}
