'use client';

import type { Seat } from '@cardroom/sueca';
import { CardFan, cardHeight, cardLabel, fanStep, fanWidth, MotionCard, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { motion, type PanInfo } from 'motion/react';
import { useState, type KeyboardEvent } from 'react';
import { useElementWidth } from '../shared/use-element-width';
import { plural } from './copy';
import { ANCHORS, dealDelaySeconds, type SceneCard } from './scene';

const OVERLAP = 0.5;
const FAN_GUTTER = 12;
/** How far up a card must be dragged to go to the table. */
const DRAG_TO_PLAY = 70;

export interface HandProps {
  cards: SceneCard[];
  size: CardSize;
  mySeat: Seat | null;
  dealer: Seat;
  dealing: boolean;
  /** The cards that may be played now; `null` when it is not the viewer's turn. */
  playable: ReadonlySet<string> | null;
  /** The face-up trump card, while the viewer (the dealer) still holds it. */
  trumpUid: string | null;
  onPlay: (cardUid: string) => void;
}

/**
 * The viewer's hand, in the order of Sueca (UI §5). On your turn only the
 * legal cards respond; the others are dimmed and do nothing. Tap a card to
 * raise it and again to play it, or drag it up to the table.
 */
export function Hand({ cards, size, mySeat, dealer, dealing, playable, trumpUid, onPlay }: HandProps) {
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const [selected, setSelected] = useState<string | null>(null);
  const available = measured === null ? undefined : Math.max(0, measured - FAN_GUTTER);
  const scroll =
    available !== undefined &&
    fanWidth(cards.length, size, fanStep(cards.length, size, OVERLAP, available)) > available;
  const raised = selected && playable?.has(selected) ? selected : null;

  const choose = (uid: string) => {
    if (!playable?.has(uid)) return;
    if (raised === uid) {
      setSelected(null);
      onPlay(uid);
    } else setSelected(uid);
  };
  const onKeyDown = (uid: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(uid);
    } else if (event.key === 'Escape') setSelected(null);
  };
  const onDragEnd = (uid: string) => (_: unknown, info: PanInfo) => {
    if (info.offset.y < -DRAG_TO_PLAY && playable?.has(uid)) {
      setSelected(null);
      onPlay(uid);
    }
  };

  return (
    <div
      ref={measureRef}
      // Cards that may not be played are slightly faded (UI §5) — darker, not see-through.
      className="w-full [&_.cr-card[data-card-state=disabled]]:opacity-100 [&_.cr-card[data-card-state=disabled]]:brightness-[.62] [&_.cr-card[data-card-state=disabled]]:saturate-[.7]"
    >
      <div
        className={scroll ? 'scrollbar-none overflow-x-auto px-1 pb-1 pt-4' : 'flex justify-center pt-4'}
        role="group"
        aria-label={`A tua mão: ${plural(cards.length, 'carta', 'cartas')}`}
        style={{ minHeight: cardHeight(size) + 30 }}
      >
        <CardFan
          items={cards}
          size={size}
          flat={scroll}
          overlap={OVERLAP}
          maxWidth={scroll ? undefined : available}
          maxRotation={6}
          getKey={(c) => c.card.uid}
          renderItem={({ card, enter }, placement, index) => {
            const canPlay = playable?.has(card.uid) ?? false;
            const isTrump = card.uid === trumpUid;
            return (
              <motion.div
                data-hand-card
                drag={canPlay}
                dragSnapToOrigin
                dragElastic={0.6}
                dragMomentum={false}
                whileDrag={{ scale: 1.06, zIndex: 50 }}
                onDragEnd={onDragEnd(card.uid)}
                className={clsx(
                  'relative',
                  canPlay && 'touch-none',
                  // The face-up trump card the others still see: a thin gold edge on the card itself.
                  isTrump && '[&_.cr-card]:shadow-[0_0_0_2px_var(--color-gold),var(--shadow-card)]',
                )}
              >
                <MotionCard
                  id={card.id}
                  size={size}
                  layoutId={`card-${card.uid}`}
                  enter={
                    dealing && mySeat && !isTrump
                      ? { from: ANCHORS.deck, kind: 'deal', delay: dealDelaySeconds(index, mySeat, dealer) }
                      : enter
                  }
                  rotate={placement.rotate}
                  lifted={raised === card.uid}
                  interactive={playable !== null}
                  state={
                    playable === null
                      ? 'normal'
                      : raised === card.uid
                        ? 'selected'
                        : canPlay
                          ? 'playable'
                          : 'disabled'
                  }
                  label={isTrump ? `${cardLabel(card.id)}, trunfo à vista` : undefined}
                  onClick={() => choose(card.uid)}
                  onKeyDown={onKeyDown(card.uid)}
                />
              </motion.div>
            );
          }}
        />
      </div>
    </div>
  );
}
