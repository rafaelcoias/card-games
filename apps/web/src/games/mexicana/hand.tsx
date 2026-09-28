'use client';

import { CardFan, fanStep, fanWidth, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import { useRef, type KeyboardEvent } from 'react';
import { useElementWidth } from '../shared/use-element-width';
import { ANCHORS, dealDelaySeconds, type SceneCard } from './scene';

const OVERLAP = 0.55;
/** Room for the fan's rotation and the lifted (selected) card's shadow. */
const FAN_GUTTER = 12;

export interface HandProps {
  cards: SceneCard[];
  size: CardSize;
  selected: ReadonlySet<string>;
  /** Cards that may be (part of) a legal selection; others are dimmed. `null` = not your decision. */
  selectable: ReadonlySet<string> | null;
  deal: { seatIndex: number; seatCount: number } | null;
  /** A tap or click on a selectable card (the table decides whether it selects, deselects or plays). */
  onTap: (cardId: string) => void;
  onToggle: (cardId: string) => void;
  onSubmit: () => void;
}

/**
 * The player's hand as a fan that tightens to fit the screen width; only when
 * even the tightest fan does not fit does it become a flat, scrollable strip.
 * Tap/click follows the table's rule (`onTap`); on the keyboard Enter selects,
 * Space plays and arrows move focus between cards.
 */
export function Hand({ cards, size, selected, selectable, deal, onTap, onToggle, onSubmit }: HandProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.selfHand);
  const containerRef = useRef<HTMLDivElement>(null);
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const available = measured === null ? undefined : Math.max(0, measured - FAN_GUTTER);
  const scroll =
    available !== undefined &&
    fanWidth(cards.length, size, fanStep(cards.length, size, OVERLAP, available)) > available;

  const focusSibling = (from: HTMLElement, delta: number) => {
    const items = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[data-hand-card] [role="button"]') ?? [],
    );
    const index = items.findIndex((el) => el === from);
    items[Math.max(0, Math.min(items.length - 1, index + delta))]?.focus();
  };

  const onKeyDown = (cardId: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        focusSibling(event.currentTarget, 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        focusSibling(event.currentTarget, -1);
        break;
      case 'Enter':
        event.preventDefault();
        onToggle(cardId);
        break;
      case ' ':
        event.preventDefault();
        onSubmit();
        break;
    }
  };

  return (
    <div ref={measureRef} className="w-full">
      <div
        ref={(el) => {
          containerRef.current = el;
          anchorRef(el);
        }}
        className={scroll ? 'scrollbar-none overflow-x-auto px-1 pb-1 pt-4' : 'flex justify-center pt-4'}
        role="group"
        aria-label={`A tua mão: ${cards.length} cartas`}
      >
        <CardFan
          items={cards}
          size={size}
          flat={scroll}
          overlap={OVERLAP}
          maxWidth={scroll ? undefined : available}
          getKey={(c) => c.card.id}
          renderItem={({ card, enter }, placement, index) => {
            const isSelectable = selectable?.has(card.id) ?? false;
            const isSelected = selected.has(card.id);
            return (
              <div data-hand-card>
                <MotionCard
                  id={card.id}
                  size={size}
                  layoutId={`card-${card.id}`}
                  enter={
                    deal
                      ? {
                          from: ANCHORS.draw,
                          kind: 'deal',
                          delay: dealDelaySeconds(3 + index, deal.seatIndex, deal.seatCount),
                        }
                      : enter
                  }
                  rotate={placement.rotate}
                  lifted={isSelected}
                  interactive={selectable !== null}
                  state={
                    selectable === null
                      ? 'normal'
                      : isSelected
                        ? 'selected'
                        : isSelectable
                          ? 'playable'
                          : 'disabled'
                  }
                  onClick={() => {
                    if (isSelectable) onTap(card.id);
                  }}
                  onKeyDown={onKeyDown(card.id)}
                />
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
