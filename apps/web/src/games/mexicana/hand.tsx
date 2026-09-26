'use client';

import { CardFan, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import { useRef, type KeyboardEvent } from 'react';
import { ANCHORS, dealDelaySeconds, type SceneCard } from './scene';

export interface HandProps {
  cards: SceneCard[];
  size: CardSize;
  selected: ReadonlySet<string>;
  /** Cards that may be (part of) a legal selection; others are dimmed. `null` = not your decision. */
  selectable: ReadonlySet<string> | null;
  flat: boolean;
  deal: { seatIndex: number; seatCount: number } | null;
  /** What tapping an already selected card does: play the selection, or deselect it. */
  reclick: 'submit' | 'toggle';
  onToggle: (cardId: string) => void;
  onSubmit: () => void;
}

/**
 * The player's hand as a fan. Tap/click or Enter selects, tapping a selected
 * card again (or Space) plays; arrows move focus between cards.
 */
export function Hand({
  cards,
  size,
  selected,
  selectable,
  flat,
  deal,
  reclick,
  onToggle,
  onSubmit,
}: HandProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.selfHand);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div
      ref={(el) => {
        containerRef.current = el;
        anchorRef(el);
      }}
      className={flat ? 'scrollbar-none -mx-4 max-w-[100vw] overflow-x-auto px-4 pb-1 pt-4' : 'pt-4'}
      role="group"
      aria-label={`A tua mão: ${cards.length} cartas`}
    >
      <CardFan
        items={cards}
        size={size}
        flat={flat}
        overlap={flat ? 0.5 : 0.55}
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
                  if (!isSelectable) return;
                  if (isSelected && reclick === 'submit') onSubmit();
                  else onToggle(card.id);
                }}
                onKeyDown={onKeyDown(card.id)}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
