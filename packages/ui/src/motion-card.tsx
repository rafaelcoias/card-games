'use client';

import type { CardId } from '@cardroom/game-core';
import { animate, motion, useAnimate, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { rectCenter, useAnchors } from './anchors';
import { Card, type CardState } from './card';
import { cardLabel, type CardSize } from './cards';
import { EASE_PLAY, motionTokens, transitionFor } from './motion-tokens';

export interface EnterFrom {
  /** Anchor id the card flies in from. */
  from: string;
  /** Seconds. */
  delay?: number;
  kind?: 'deal' | 'draw' | 'play' | 'pickUp';
}

export interface MotionCardProps {
  id?: CardId | null;
  faceDown?: boolean;
  size?: CardSize;
  state?: CardState;
  /** Shared-element id: the card glides between containers that render the same id. */
  layoutId?: string;
  /** Seconds the shared-layout glide takes (a quick play by default); slower when a move must be followed. */
  glide?: number;
  /** One-off entrance animation from a named anchor (only applied on mount). */
  enter?: EnterFrom;
  /** Resting rotation in degrees (piles, fans). */
  rotate?: number;
  /** Raised (selected) position. */
  lifted?: boolean;
  interactive?: boolean;
  label?: string;
  tabIndex?: number;
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}

/**
 * Animated card. Three layers so concerns never fight over the same transform:
 * entrance (outer, imperative) → shared layout (layoutId) → state (lift, hover, flip).
 */
export function MotionCard({
  id,
  faceDown = false,
  size = 'md',
  state = 'normal',
  layoutId,
  glide,
  enter,
  rotate = 0,
  lifted = false,
  interactive = false,
  label,
  tabIndex,
  onClick,
  onKeyDown,
  className,
}: MotionCardProps) {
  const reduced = useReducedMotion() ?? false;
  const entranceRef = useEntrance(enter, reduced);
  const showFace = useFlip(faceDown, reduced);

  return (
    <div ref={entranceRef} className={className}>
      <motion.div
        layoutId={layoutId}
        layout={layoutId ? true : undefined}
        transition={
          glide !== undefined && !reduced
            ? { duration: glide, ease: [...EASE_PLAY] }
            : transitionFor('play', reduced)
        }
      >
        <motion.div
          role={interactive ? 'button' : undefined}
          aria-pressed={interactive ? lifted : undefined}
          aria-label={interactive ? (label ?? cardLabel(faceDown ? null : id)) : undefined}
          aria-disabled={interactive && state === 'disabled' ? true : undefined}
          tabIndex={interactive ? (tabIndex ?? 0) : undefined}
          onClick={onClick}
          onKeyDown={onKeyDown}
          className={interactive ? 'cr-card-hit' : undefined}
          initial={false}
          animate={{ y: lifted ? -12 : 0, rotate }}
          whileHover={interactive && state !== 'disabled' && !lifted ? { y: -6 } : undefined}
          transition={transitionFor('select', reduced)}
          style={{ transformPerspective: 800 }}
        >
          <FlipFace id={id} showFace={showFace} size={size} state={state} label={label} reduced={reduced} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function FlipFace({
  id,
  showFace,
  size,
  state,
  label,
  reduced,
}: {
  id?: CardId | null;
  showFace: { visible: boolean; flipping: boolean };
  size: CardSize;
  state: CardState;
  label?: string;
  reduced: boolean;
}) {
  return (
    <motion.div
      animate={{ rotateY: showFace.flipping ? 90 : 0 }}
      transition={{ duration: reduced ? 0 : motionTokens.reveal.duration / 2, ease: 'easeInOut' }}
    >
      <Card id={id} faceDown={!showFace.visible} size={size} state={state} label={label} />
    </motion.div>
  );
}

/** Turns a `faceDown` change into a two-step 3D flip (edge-on, swap face, back). */
function useFlip(faceDown: boolean, reduced: boolean): { visible: boolean; flipping: boolean } {
  const [visible, setVisible] = useState(!faceDown);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (visible === !faceDown) return;
    if (reduced) {
      setVisible(!faceDown);
      return;
    }
    setFlipping(true);
    const half = (motionTokens.reveal.duration / 2) * 1000;
    const timer = window.setTimeout(() => {
      setVisible(!faceDown);
      setFlipping(false);
    }, half);
    return () => window.clearTimeout(timer);
  }, [faceDown, reduced, visible]);
  return { visible, flipping };
}

/** Flies the element in from an anchor on first mount, animating only transform. */
function useEntrance(enter: EnterFrom | undefined, reduced: boolean) {
  const anchors = useAnchors();
  const [scope] = useAnimate<HTMLDivElement>();
  const enterRef = useRef(enter);

  useLayoutEffect(() => {
    const spec = enterRef.current;
    const element = scope.current;
    if (!spec || !element) return;
    const from = anchors.rect(spec.from);
    if (!from) return;
    const to = element.getBoundingClientRect();
    const start = rectCenter(from);
    const end = rectCenter(to);
    const dx = start.x - end.x;
    const dy = start.y - end.y;
    const scale = Math.min(1.2, Math.max(0.4, from.width / Math.max(1, to.width)));
    element.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    const kind = spec.kind ?? 'play';
    const controls = animate(
      element,
      { x: [dx, 0], y: [dy, 0], scale: [scale, 1] },
      reduced ? { duration: motionTokens.reduced.duration } : transitionFor(kind, false, spec.delay ?? 0),
    );
    return () => controls.stop();
  }, [anchors, reduced, scope]);

  return scope;
}
