'use client';

import type { ReactNode } from 'react';
import { useAnchorRef } from './anchors';
import { Card } from './card';
import { CARD_WIDTH, cardHeight, stableJitter, type CardSize } from './cards';

export interface FanPlacement {
  left: number;
  rotate: number;
  y: number;
  zIndex: number;
}

export interface CardFanProps<T> {
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, placement: FanPlacement, index: number) => ReactNode;
  size: CardSize;
  /** Fraction of each card covered by the next one (spec: ~0.55). */
  overlap?: number;
  maxRotation?: number;
  /** Lay cards flat in a scrollable strip (phones with many cards). */
  flat?: boolean;
  className?: string;
}

/** Hand fan: overlapping cards on a gentle arc, from −maxRotation° to +maxRotation°. */
export function CardFan<T>({
  items,
  getKey,
  renderItem,
  size,
  overlap = 0.55,
  maxRotation = 10,
  flat = false,
  className,
}: CardFanProps<T>) {
  const width = CARD_WIDTH[size];
  const step = width * (1 - overlap);
  const count = items.length;
  const total = count === 0 ? 0 : width + step * (count - 1);
  const arc = flat ? 0 : Math.min(maxRotation, count * 2.5);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: total, height: cardHeight(size) + (flat ? 0 : 14), flex: 'none' }}
    >
      {items.map((item, index) => {
        const t = count <= 1 ? 0 : index / (count - 1) - 0.5; // −0.5 … 0.5
        const placement: FanPlacement = {
          left: index * step,
          rotate: t * 2 * arc,
          y: flat ? 0 : t * t * 4 * 10,
          zIndex: index + 1,
        };
        return (
          <div
            key={getKey(item)}
            style={{ position: 'absolute', left: placement.left, top: placement.y, zIndex: placement.zIndex }}
          >
            {renderItem(item, placement, index)}
          </div>
        );
      })}
    </div>
  );
}

/** Deterministic "tossed" rotation for a pile card (−6° … +6°). */
export function pileRotation(cardId: string): number {
  return Math.round(stableJitter(cardId) * 6 * 10) / 10;
}

export function pileOffset(cardId: string): { x: number; y: number } {
  return { x: Math.round(stableJitter(`${cardId}x`) * 5), y: Math.round(stableJitter(`${cardId}y`) * 4) };
}

export interface DrawPileProps {
  count: number;
  size: CardSize;
  anchorId?: string;
  label?: string;
}

/** Face-down stock with a thickness hint and a count badge. Registers the "draw" anchor. */
export function DrawPile({ count, size, anchorId = 'draw', label }: DrawPileProps) {
  const ref = useAnchorRef<HTMLDivElement>(anchorId);
  const layers = Math.min(4, Math.ceil(count / 8));
  return (
    <div className="cr-stack" ref={ref} aria-label={label ?? `Baralho: ${count} cartas`} role="group">
      <div style={{ position: 'relative', width: CARD_WIDTH[size], height: cardHeight(size) }}>
        {count === 0 ? (
          <div className="cr-slot" style={{ width: '100%', height: '100%' }} />
        ) : (
          Array.from({ length: layers }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: -i * 1.5, top: -i * 1.5 }}>
              <Card faceDown size={size} label={i === layers - 1 ? undefined : ''} />
            </div>
          ))
        )}
      </div>
      <span className="cr-count" aria-hidden="true">
        {count}
      </span>
    </div>
  );
}
