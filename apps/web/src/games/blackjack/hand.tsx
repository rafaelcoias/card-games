'use client';

import { CARD_WIDTH, cardHeight, MotionCard, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { outcomeLabel, outcomeTone, totalLabel } from './copy';
import type { SceneCard, SceneHand } from './scene';

/** Cards cascade up and to the right (UI §4). */
function cascade(size: CardSize) {
  const width = CARD_WIDTH[size];
  return { step: Math.round(width * 0.32), rise: Math.round(width * 0.22) };
}

export function handBox(cards: number, size: CardSize, doubled = false): { width: number; height: number } {
  const { step, rise } = cascade(size);
  const n = Math.max(1, cards);
  const width = CARD_WIDTH[size] + step * (n - 1) + (doubled ? cardHeight(size) - CARD_WIDTH[size] : 0);
  return { width, height: cardHeight(size) + rise * (n - 1) };
}

const TONE_CLASS = {
  win: 'bg-success text-ink',
  lose: 'bg-danger text-white',
  push: 'bg-ivory/85 text-ink',
} as const;

export interface HandProps {
  hand: SceneHand;
  size: CardSize;
  active: boolean;
  /** Label under the cards (the viewer's hands say more). */
  showTotal?: boolean;
}

/** One hand: cascading cards, its total, the result once settled, and a glow while on turn. */
export const Hand = memo(function Hand({ hand, size, active, showTotal = true }: HandProps) {
  const { step, rise } = cascade(size);
  const box = handBox(hand.cards.length, size, hand.doubled);
  const label = totalLabel(hand);
  const tone = hand.outcome ? outcomeTone(hand.outcome) : null;
  return (
    <div className="flex flex-col items-center gap-1" data-hand={hand.id}>
      <div
        className={clsx(
          'relative rounded-[0.6rem] transition-shadow duration-300',
          active && 'shadow-[0_0_0_2px_var(--color-gold),0_0_22px_4px_rgb(232_193_112/0.45)]',
        )}
        style={{ width: box.width, height: box.height }}
      >
        {hand.cards.map((sceneCard, i) => (
          <HandCard
            key={sceneCard.key}
            sceneCard={sceneCard}
            size={size}
            left={i * step}
            bottom={i * rise}
            // Doubling: the third card lies across the hand, as at a casino (UI §4).
            sideways={hand.doubled && i === 2}
          />
        ))}
        <AnimatePresence>
          {hand.outcome && tone && hand.payout !== null && (
            <motion.span
              key={hand.outcome}
              className={clsx(
                'absolute -top-2 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums shadow',
                TONE_CLASS[tone],
                hand.outcome === 'BLACKJACK' &&
                  'bg-gold! text-gold-ink! shadow-[0_0_14px_rgb(232_193_112/0.8)]',
              )}
              initial={{ scale: 0.4, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            >
              {outcomeLabel(hand.outcome, hand.bet, hand.payout)}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {showTotal && hand.cards.length > 0 && (
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums leading-none',
            hand.status === 'BLACKJACK'
              ? 'bg-gold text-gold-ink'
              : hand.status === 'BUSTED'
                ? 'bg-danger text-white'
                : 'bg-black/45 text-ivory',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
});

function HandCard({
  sceneCard,
  size,
  left,
  bottom,
  sideways,
}: {
  sceneCard: SceneCard;
  size: CardSize;
  left: number;
  bottom: number;
  sideways: boolean;
}) {
  const offset = sideways ? (cardHeight(size) - CARD_WIDTH[size]) / 2 : 0;
  return (
    <div className="absolute" style={{ left: left + offset, bottom: bottom - offset }}>
      <MotionCard
        id={sceneCard.card?.id}
        faceDown={!sceneCard.card}
        size={size}
        layoutId={`card-${sceneCard.key}`}
        enter={sceneCard.enter}
        rotate={sideways ? 90 : 0}
      />
    </div>
  );
}
