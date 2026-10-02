'use client';

import { points as cardPoints } from '@cardroom/gringo';
import { CARD_WIDTH, MotionCard, cardHeight, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, type KeyboardEvent } from 'react';
import { points } from './copy';
import { gridBox, slotCell, slotGap } from './layout';
import { ANCHORS, cardLayoutId, dealDelaySeconds, type Scene, type SeatScene } from './scene';

/**
 * How a slot reacts: `target` glows and takes a tap (a choice to make),
 * `selected` is the first half of a two-tap choice (a jack's swap), `armed`
 * waits for the second tap that confirms a snap (UI §6).
 */
export type SlotMode = 'none' | 'target' | 'selected' | 'armed';

export interface GridProps {
  seat: SeatScene;
  size: CardSize;
  /** For the opening deal: where every card flies in from, and when. */
  deal: Pick<Scene, 'seats'> | null;
  /** The grid, for assistive tech: "As tuas cartas", "Cartas de Ana". */
  label: string;
  /** How to name a slot to assistive tech: "A tua carta [3]", "Carta [2] de Ana". */
  labelOf: (index: number) => string;
  modeOf?: (index: number) => SlotMode;
  onSelect?: (index: number) => void;
  /** Slots raised a little: the bottom row while it is being memorised, a card being looked at. */
  raised?: ReadonlySet<number>;
  /** A slot someone is looking at with a power: everyone sees the eye (UI §5). */
  watched?: number | null;
  /** At the end: the value printed over every card (UI §8). */
  redKingValue?: -3 | -1 | null;
  /** The slot of a snap just made: green or red outline. */
  flash?: { index: number; hit: boolean } | null;
}

/**
 * A player's grid with fixed, numbered positions (UI §2): `[1] [2]` on top,
 * `[3] [4]` below, penalty slots to the right. An empty slot keeps its dashed
 * outline. Cards glide in and out of slots through their shared layout ids.
 */
export const Grid = memo(function Grid({
  seat,
  size,
  deal,
  label,
  labelOf,
  modeOf,
  onSelect,
  raised,
  watched = null,
  redKingValue = null,
  flash = null,
}: GridProps) {
  const reduced = useReducedMotion() ?? false;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const gap = slotGap(size);
  const maxIndex = Math.max(3, ...seat.slots.map((s) => s.index));
  const box = gridBox(maxIndex, size);
  const small = width < 56;

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(index);
    }
  };

  return (
    <div
      className="relative"
      style={{ width: box.width, height: box.height }}
      role="group"
      aria-label={label}
    >
      {seat.slots.map((slot) => {
        const { col, row } = slotCell(slot.index);
        const mode = modeOf?.(slot.index) ?? 'none';
        const interactive = mode !== 'none' && slot.token !== null;
        const lifted = raised?.has(slot.index) ?? false;
        const value = redKingValue !== null && slot.face ? cardPoints(slot.face, redKingValue) : null;
        return (
          <div
            key={slot.index}
            className="absolute"
            style={{ left: col * (width + gap), top: row * (height + gap), width, height }}
          >
            {/* The position's fixed outline: it stays when the card is gone. */}
            <div
              className={clsx(
                'absolute inset-0 rounded-[var(--radius-card)] border-[1.5px] border-dashed transition-colors',
                slot.token ? 'border-transparent' : 'border-white/20 bg-black/15',
              )}
            >
              {!slot.token && (
                <span
                  className={clsx(
                    'absolute inset-0 flex items-center justify-center text-success/60',
                    small ? 'text-sm' : 'text-xl',
                  )}
                  aria-hidden="true"
                >
                  ✓
                </span>
              )}
            </div>
            {mode !== 'none' && slot.token && (
              <span
                aria-hidden="true"
                className={clsx(
                  'pointer-events-none absolute -inset-1 rounded-[calc(var(--radius-card)+4px)] ring-2',
                  mode === 'target' && 'animate-pulse ring-gold/80',
                  mode === 'selected' && 'ring-gold shadow-[0_0_18px_rgb(232_193_112/0.6)]',
                  mode === 'armed' && 'ring-danger shadow-[0_0_20px_rgb(240_104_107/0.7)]',
                )}
              />
            )}
            {slot.token && (
              <MotionCard
                key={slot.token}
                id={slot.face?.id}
                faceDown={deal !== null || !slot.face}
                size={size}
                layoutId={cardLayoutId(slot.token)}
                enter={
                  deal
                    ? { from: ANCHORS.deck, kind: 'deal', delay: dealDelaySeconds(deal, seat.id, slot.index) }
                    : slot.enter
                }
                lifted={lifted || mode === 'selected' || mode === 'armed'}
                interactive={interactive}
                state={mode === 'selected' || mode === 'armed' ? 'selected' : 'normal'}
                label={labelOf(slot.index)}
                onClick={interactive ? () => onSelect?.(slot.index) : undefined}
                onKeyDown={interactive ? onKeyDown(slot.index) : undefined}
              />
            )}
            <span
              aria-hidden="true"
              className={clsx(
                'pointer-events-none absolute z-[2] rounded-bl-[var(--radius-card)] rounded-tr-md bg-black/55 font-semibold tabular-nums leading-none text-ivory/85',
                small
                  ? 'bottom-0 left-0 px-[3px] py-[2px] text-[8px]'
                  : 'bottom-0 left-0 px-1 py-[3px] text-[10px]',
              )}
            >
              {slot.index + 1}
            </span>
            <AnimatePresence>
              {watched === slot.index && (
                <motion.span
                  key="eye"
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-1.5 -top-2 z-[3] flex size-6 items-center justify-center rounded-full bg-ink/90 text-sm shadow-lg ring-1 ring-gold/60"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                >
                  👁
                </motion.span>
              )}
            </AnimatePresence>
            {flash?.index === slot.index && (
              <motion.span
                key={`${flash.hit}`}
                aria-hidden="true"
                className={clsx(
                  'pointer-events-none absolute -inset-1 z-[1] rounded-[calc(var(--radius-card)+4px)] ring-[3px]',
                  flash.hit ? 'ring-success' : 'ring-danger',
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.4, times: [0, 0.1, 0.75, 1] }}
              />
            )}
            {value !== null && (
              <motion.span
                aria-hidden="true"
                className={clsx(
                  'pointer-events-none absolute -bottom-2 left-1/2 z-[3] -translate-x-1/2 rounded-full px-1.5 font-display font-bold tabular-nums leading-5 shadow-lg',
                  small ? 'text-[11px]' : 'text-sm',
                  value <= 0 ? 'bg-gold text-gold-ink' : 'bg-ink/90 text-ivory ring-1 ring-white/15',
                )}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.6 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              >
                {points(value)}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
});
