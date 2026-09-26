'use client';

import type { Card } from '@cardroom/game-core';
import { CARD_WIDTH, cardHeight, cardLabel, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import { dealDelaySeconds, ANCHORS, type SeatScene } from './scene';

export interface TableCardsProps {
  seat: SeatScene;
  size: CardSize;
  /** Deal animation parameters, when the opening deal is running. */
  deal?: { seatIndex: number; seatCount: number } | null;
  /** Which layer is clickable (self only). */
  interactiveLayer?: 'faceUp' | 'faceDown' | null;
  playableFaceUp?: Set<string>;
  playableFaceDown?: Set<number>;
  onPlayFaceUp?: (card: Card) => void;
  onPlayFaceDown?: (position: number) => void;
}

/**
 * The three table slots of a seat: a face-down card with the face-up card
 * resting on top of it, offset so the hidden card's edge stays visible.
 */
export function TableCards({
  seat,
  size,
  deal,
  interactiveLayer = null,
  playableFaceUp,
  playableFaceDown,
  onPlayFaceUp,
  onPlayFaceDown,
}: TableCardsProps) {
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const offset = Math.round(height * 0.16);
  const gap = Math.max(4, Math.round(width * 0.12));

  return (
    <div className="flex" style={{ gap }} role="group" aria-label="Cartas na mesa">
      {seat.faceDown.map((slot, position) => {
        const faceUp = seat.faceUp[position] ?? null;
        const revealed = slot && slot !== 'hidden' ? slot : null;
        const faceDownPlayable =
          interactiveLayer === 'faceDown' && slot !== null && playableFaceDown?.has(position);
        const faceUpPlayable =
          interactiveLayer === 'faceUp' && faceUp !== null && playableFaceUp?.has(faceUp.id);
        return (
          <div key={position} className="relative" style={{ width, height: height + offset }}>
            {slot === null && faceUp === null && (
              <div className="cr-slot absolute left-0 top-0" style={{ width, height }} aria-hidden="true" />
            )}
            <SlotAnchor id={ANCHORS.slot(seat.id, position)} width={width} height={height} />
            {slot !== null && (
              <div className="absolute left-0 top-0" data-table-card="faceDown">
                <MotionCard
                  id={revealed?.id}
                  faceDown={!revealed}
                  size={size}
                  enter={
                    deal
                      ? {
                          from: ANCHORS.draw,
                          kind: 'deal',
                          delay: dealDelaySeconds(position, deal.seatIndex, deal.seatCount),
                        }
                      : undefined
                  }
                  interactive={Boolean(faceDownPlayable)}
                  state={
                    interactiveLayer === 'faceDown' ? (faceDownPlayable ? 'playable' : 'disabled') : 'normal'
                  }
                  label={revealed ? cardLabel(revealed.id) : `Carta escondida ${position + 1}`}
                  onClick={faceDownPlayable ? () => onPlayFaceDown?.(position) : undefined}
                  onKeyDown={
                    faceDownPlayable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onPlayFaceDown?.(position);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            )}
            {faceUp && (
              <div className="absolute left-0" style={{ top: offset }} data-table-card="faceUp">
                <MotionCard
                  key={faceUp.id}
                  id={faceUp.id}
                  size={size}
                  layoutId={`card-${faceUp.id}`}
                  interactive={Boolean(faceUpPlayable)}
                  state={
                    interactiveLayer === 'faceUp' ? (faceUpPlayable ? 'playable' : 'disabled') : 'normal'
                  }
                  onClick={faceUpPlayable ? () => onPlayFaceUp?.(faceUp) : undefined}
                  onKeyDown={
                    faceUpPlayable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onPlayFaceUp?.(faceUp);
                          }
                        }
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Invisible anchor marking a face-down slot; origin for revealed cards leaving it. */
function SlotAnchor({ id, width, height }: { id: string; width: number; height: number }) {
  const ref = useAnchorRef<HTMLDivElement>(id);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0"
      style={{ width, height }}
    />
  );
}
