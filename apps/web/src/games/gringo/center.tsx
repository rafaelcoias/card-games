'use client';

import type { CardInstance } from '@cardroom/game-core';
import {
  Card,
  CARD_WIDTH,
  MotionCard,
  cardHeight,
  stableJitter,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CSSProperties } from 'react';
import { plural } from './copy';
import { ANCHORS, cardLayoutId, type Scene } from './scene';

interface Point {
  x: number;
  y: number;
}

/** A card the viewer is looking at with a power, and where it lies ("A [2] de Ana"). */
export interface Spotlight {
  card: CardInstance;
  label: string;
}

export interface CenterProps {
  scene: Pick<Scene, 'matchId' | 'drawn' | 'deckCount' | 'discard' | 'snap' | 'selfId' | 'rules' | 'phase'>;
  center: Point;
  size: CardSize;
  /** Tap the deck to draw (UI §4). */
  onDraw: (() => void) | null;
  /** Shown big in the middle while it is turned, however small its grid is on screen (UI §5). */
  spotlight: Spotlight | null;
}

/** One size up from the middle's cards, for the card being looked at. */
const SPOTLIGHT_SIZE: Record<CardSize, CardSize> = {
  xs: 'sm',
  sm: 'ms',
  ms: 'md',
  md: 'ml',
  ml: 'lg',
  lg: 'xl',
  xl: 'xl',
};

/**
 * The middle of the table (UI §1): the deck with its count, the card just
 * drawn next to it (face up for the one who drew it), and the discard pile
 * with only its top card well in view — ringed while a snap is possible.
 */
export function Center({ scene, center, size, onDraw, spotlight }: CenterProps) {
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const step = width + Math.max(12, width * 0.22);
  const deck = { x: center.x - step, y: center.y };
  const discard = { x: center.x + step, y: center.y };
  const drawn = scene.drawn;
  const mine = drawn?.by === scene.selfId;
  const snap = scene.snap;
  return (
    <>
      <Deck at={deck} size={size} count={scene.deckCount} onDraw={onDraw} />
      <div
        className="pointer-events-none absolute z-20"
        style={{ left: center.x - width / 2, top: center.y - height / 2 - (mine ? 14 : 6), width, height }}
      >
        {drawn && (
          <div
            className={clsx(
              'rounded-[var(--radius-card)]',
              mine && 'shadow-[0_0_28px_rgb(232_193_112/0.55)]',
            )}
          >
            <MotionCard
              key={drawn.token}
              id={drawn.face?.id}
              faceDown={!drawn.face}
              size={size}
              layoutId={cardLayoutId(drawn.token)}
              enter={drawn.enter}
              label={drawn.face ? undefined : 'Carta tirada'}
            />
          </div>
        )}
      </div>
      <DiscardPile at={discard} size={size} scene={scene} />
      <AnimatePresence>
        {snap?.open && (
          <SnapRing
            key={snap.discardId}
            center={discard}
            radius={Math.max(width, height) * 0.82}
            ms={scene.rules.snapWindowMs}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {spotlight && (
          <PeekSpotlight
            key={spotlight.card.uid}
            spotlight={spotlight}
            at={center}
            size={SPOTLIGHT_SIZE[size]}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** The card looked at with a power, big between the deck and the discard pile, with where it lies. */
function PeekSpotlight({ spotlight, at, size }: { spotlight: Spotlight; at: Point; size: CardSize }) {
  const reduced = useReducedMotion() ?? false;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <motion.div
      className="pointer-events-none absolute z-30 flex flex-col items-center gap-1.5"
      style={{ left: at.x - width / 2, top: at.y - height / 2 - 30, width }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
    >
      <span className="whitespace-nowrap rounded-full bg-ink/90 px-2.5 py-0.5 text-xs font-bold text-ivory shadow-lg ring-1 ring-gold/60">
        <span aria-hidden="true">👁</span> {spotlight.label}
      </span>
      <div className="rounded-[var(--radius-card)] shadow-[0_0_32px_rgb(232_193_112/0.6)]">
        {/* Decorative: the slot itself names the card to assistive tech. */}
        <Card id={spotlight.card.id} size={size} label="" />
      </div>
    </motion.div>
  );
}

/** Face down, with a thickness hint and its count; glows and takes a tap when it is time to draw. */
function Deck({
  at,
  size,
  count,
  onDraw,
}: {
  at: Point;
  size: CardSize;
  count: number;
  onDraw: (() => void) | null;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.deck);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const layers = Math.min(4, Math.ceil(count / 10));
  return (
    <div className="absolute z-10" style={{ left: at.x - width / 2, top: at.y - height / 2, width, height }}>
      <div ref={anchorRef} className="absolute inset-0" aria-hidden="true" />
      {count === 0 ? (
        <div className="cr-slot size-full" />
      ) : (
        Array.from({ length: layers }, (_, i) => (
          <div key={i} className="absolute" style={{ left: -i * 1.5, top: -i * 1.5 }}>
            <Card faceDown size={size} label="" />
          </div>
        ))
      )}
      {onDraw && (
        <button
          type="button"
          onClick={onDraw}
          aria-label="Tirar carta do baralho"
          className="absolute -inset-1 animate-pulse rounded-[calc(var(--radius-card)+4px)] ring-2 ring-gold/80 hover:bg-white/5"
        />
      )}
      <span
        className="cr-count absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap"
        role="status"
        aria-label={`Baralho: ${plural(count, 'carta', 'cartas')}`}
      >
        {count}
      </span>
    </div>
  );
}

/** Face up: the top card well in view, a couple of the ones under it turned a little (UI §1). */
function DiscardPile({
  at,
  size,
  scene,
}: {
  at: Point;
  size: CardSize;
  scene: Pick<Scene, 'matchId' | 'discard'>;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.discard);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const { top, under, count } = scene.discard;
  const tilt = (uid: string) => Math.round(stableJitter(`${scene.matchId}:${uid}`) * 9);
  return (
    <div
      className="absolute z-10"
      style={{ left: at.x - width / 2, top: at.y - height / 2, width, height }}
      aria-label={top ? `Descarte: ${count} cartas` : 'Descarte vazio'}
      role="group"
    >
      <div ref={anchorRef} className="absolute inset-0" aria-hidden="true" />
      {!top && <div className="cr-slot size-full opacity-60" />}
      {under.map((card) => (
        <div
          key={card.uid}
          className="absolute inset-0"
          style={{ transform: `rotate(${tilt(card.uid)}deg)` }}
        >
          <Card id={card.id} size={size} label="" />
        </div>
      ))}
      {top && (
        <div className="absolute inset-0 z-[1]">
          <MotionCard
            key={top.token}
            id={top.card.id}
            size={size}
            layoutId={cardLayoutId(top.token)}
            rotate={tilt(top.card.uid) / 3}
          />
        </div>
      )}
      {count > 0 && (
        <span className="cr-count absolute -bottom-6 left-1/2 -translate-x-1/2" aria-hidden="true">
          {count}
        </span>
      )}
    </div>
  );
}

/** The snap window (UI §6): a ring that empties around the discard pile, and "Bater?". */
function SnapRing({ center, radius, ms }: { center: Point; radius: number; ms: number }) {
  const reduced = useReducedMotion() ?? false;
  const box = radius * 2 + 10;
  const circumference = 2 * Math.PI * radius;
  return (
    <motion.div
      // Over the grids (it takes no taps), so its "Bater?" shows even where a seat comes close.
      className="pointer-events-none absolute z-[15]"
      style={{ left: center.x - box / 2, top: center.y - box / 2, width: box, height: box }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.18 }}
    >
      <svg aria-hidden="true" width={box} height={box} className="-rotate-90">
        <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke="rgb(0 0 0 / 0.3)" strokeWidth={5} />
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          className="stroke-gold"
          style={
            {
              strokeDashoffset: 0,
              animation: reduced ? undefined : `cr-countdown ${ms}ms linear forwards`,
              '--cr-from': '0px',
              '--cr-to': `${circumference}px`,
            } as CSSProperties
          }
        />
      </svg>
      <span className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-gold px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-gold-ink shadow-lg">
        Bater?
      </span>
    </motion.div>
  );
}
