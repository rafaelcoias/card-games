'use client';

import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { TableGeometry } from './layout';
import { ANCHORS, type Scene, type TrickCard } from './scene';

export interface TrickAreaProps {
  scene: Pick<Scene, 'trick' | 'trickOutcome' | 'clearing' | 'dealing'>;
  geometry: TableGeometry;
  size: CardSize;
  caption: string | null;
}

/** Cards played this trick, each in front of its owner and turned towards the middle (UI §1, §6). */
export function TrickArea({ scene, geometry, size, caption }: TrickAreaProps) {
  const outcome = scene.trickOutcome;
  return (
    <>
      <TableTop geometry={geometry} />
      <Deck center={geometry.center} size={size} visible={scene.dealing} />
      {scene.trick.map((play) => {
        const spot = geometry.trick.get(play.playerId);
        if (!spot) return null;
        const state = !outcome
          ? 'live'
          : outcome.winner === play.playerId
            ? 'winner'
            : outcome.tiedPlayerIds.includes(play.playerId)
              ? 'tied'
              : 'beaten';
        return <TrickSlot key={play.card.id} play={play} spot={spot} size={size} state={state} />;
      })}
      <ClearedTie scene={scene} geometry={geometry} size={size} />
      <Caption text={caption} center={geometry.center} />
    </>
  );
}

type SlotState = 'live' | 'winner' | 'tied' | 'beaten';

function TrickSlot({
  play,
  spot,
  size,
  state,
}: {
  play: TrickCard;
  spot: { x: number; y: number; rotate: number };
  size: CardSize;
  state: SlotState;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.trick(play.playerId));
  const reduced = useReducedMotion() ?? false;
  // The viewer's blind card travels face down and only turns over on the table (UI §3).
  const [hidden, setHidden] = useState(play.revealOnLand === true);
  useEffect(() => {
    if (!hidden) return;
    const timer = window.setTimeout(() => setHidden(false), reduced ? 0 : 280);
    return () => window.clearTimeout(timer);
  }, [hidden, reduced]);

  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <div
      ref={anchorRef}
      className="absolute"
      style={{
        left: spot.x - width / 2,
        top: spot.y - height / 2,
        width,
        height,
        zIndex: state === 'winner' ? 5 : 1,
      }}
    >
      <motion.div
        className={clsx(
          'rounded-[var(--radius-card)] transition-[filter,opacity] duration-300',
          state === 'winner' && 'shadow-[0_0_0_2px_var(--color-gold),0_0_22px_4px_rgb(232_193_112/0.45)]',
          state === 'tied' && 'opacity-70 grayscale',
          state === 'beaten' && 'opacity-80',
        )}
        animate={
          state === 'winner'
            ? { scale: 1.05 }
            : state === 'tied' && !reduced
              ? { x: [0, -4, 4, -3, 3, 0], scale: 1 }
              : { scale: 1, x: 0 }
        }
        transition={{ duration: state === 'tied' ? 0.4 : 0.25, ease: 'easeOut' }}
      >
        <MotionCard
          id={play.card.id}
          faceDown={hidden}
          size={size}
          layoutId={`card-${play.card.id}`}
          enter={play.enter}
          rotate={spot.rotate}
        />
      </motion.div>
    </div>
  );
}

/** A trick nobody won slides off the table, greyed out (UI §6). */
function ClearedTie({ scene, geometry, size }: Pick<TrickAreaProps, 'scene' | 'geometry' | 'size'>) {
  const clearing = scene.clearing;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <AnimatePresence>
      {clearing && (
        <motion.div
          key={clearing.key}
          className="pointer-events-none absolute inset-0 grayscale"
          initial={{ opacity: 0.85, y: 0 }}
          animate={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.45, ease: 'easeIn' }}
          aria-hidden="true"
        >
          {clearing.cards.map((play) => {
            const spot = geometry.trick.get(play.playerId);
            if (!spot) return null;
            return (
              <div
                key={play.card.id}
                className="absolute"
                style={{
                  left: spot.x - width / 2,
                  top: spot.y - height / 2,
                  transform: `rotate(${spot.rotate}deg)`,
                }}
              >
                <Card id={play.card.id} size={size} label="" />
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The oval table the seats sit around. */
function TableTop({ geometry }: { geometry: TableGeometry }) {
  const rx = geometry.radii.x * 0.74;
  const ry = geometry.radii.y * 0.74;
  if (rx < 40 || ry < 40) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute rounded-[50%] border border-white/[0.07] bg-black/[0.07] shadow-[inset_0_0_60px_rgb(0_0_0/0.25),0_0_0_10px_rgb(0_0_0/0.06)]"
      style={{ left: geometry.center.x - rx, top: geometry.center.y - ry, width: rx * 2, height: ry * 2 }}
    />
  );
}

/** Where dealt cards come from: a small deck in the middle, shown while dealing. */
function Deck({
  center,
  size,
  visible,
}: {
  center: { x: number; y: number };
  size: CardSize;
  visible: boolean;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.deck);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <div
      ref={anchorRef}
      className={clsx('absolute transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')}
      style={{ left: center.x - width / 2, top: center.y - height / 2, width, height }}
      aria-hidden="true"
    >
      {[2, 1, 0].map((i) => (
        <div key={i} className="absolute" style={{ left: -i * 1.5, top: -i * 1.5 }}>
          <Card faceDown size={size} label="" />
        </div>
      ))}
    </div>
  );
}

/** Outcome of the trick or a short announcement, in the middle of the table. */
function Caption({ text, center }: { text: string | null; center: { x: number; y: number } }) {
  return (
    <div
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 justify-center"
      style={{ left: center.x, top: center.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="whitespace-nowrap rounded-full bg-black/55 px-3 py-1 text-sm font-semibold text-ivory shadow-lg backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
