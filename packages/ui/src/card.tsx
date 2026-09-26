import type { CardId } from '@cardroom/game-core';
import type { CSSProperties } from 'react';
import { CARD_WIDTH, cardHeight, cardLabel, type CardSize } from './cards';

export type CardState = 'normal' | 'selected' | 'playable' | 'disabled';

export interface CardProps {
  /** Card id (e.g. "10H"); ignored when `faceDown`. */
  id?: CardId | null;
  faceDown?: boolean;
  size?: CardSize;
  state?: CardState;
  className?: string;
  style?: CSSProperties;
  /** Overrides the accessible name (e.g. to add context like "carta escondida 2"). */
  label?: string;
}

/**
 * Static card face/back rendered from the injected SVG sprite
 * (`<use href="#card-10H"/>`). Pure and cheap: animation lives in `MotionCard`.
 */
export function Card({
  id,
  faceDown = false,
  size = 'md',
  state = 'normal',
  className,
  style,
  label,
}: CardProps) {
  const showBack = faceDown || !id;
  const width = CARD_WIDTH[size];
  // An empty label marks a purely decorative card.
  const decorative = label === '';
  return (
    <div
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : (label ?? cardLabel(showBack ? null : id))}
      data-card-state={state}
      className={['cr-card', className].filter(Boolean).join(' ')}
      style={{ width, height: cardHeight(size), ...style }}
    >
      <svg viewBox="0 0 250 350" width="100%" height="100%" aria-hidden="true" focusable="false">
        <use href={showBack ? '#card-back' : `#card-${id}`} />
      </svg>
    </div>
  );
}
