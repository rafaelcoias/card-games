'use client';

import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useMemo } from 'react';
import { plural } from './copy';
import { pondSpots, type PondSpot } from './layout';
import { ANCHORS, type Scene } from './scene';

interface Point {
  x: number;
  y: number;
}

export interface PondProps {
  scene: Pick<Scene, 'matchId' | 'pondSlots' | 'pondSize' | 'fishSpot' | 'showcase' | 'dealing'>;
  center: Point;
  /** Half-axes of the oval the cards are tossed over. */
  radii: Point;
  size: CardSize;
  showcaseSize: CardSize;
  /** The viewer was told "Vai à pesca!" and may tap a card. */
  pickable: boolean;
  onPick: (slot: number) => void;
  caption: string | null;
}

/** The middle of the table: the lake, its cards "à balda", a peixinho being shown, and the caption. */
export function Pond({ scene, center, radii, size, showcaseSize, pickable, onPick, caption }: PondProps) {
  const spots = useMemo(
    () => pondSpots(scene.matchId, scene.pondSize, radii),
    [scene.matchId, scene.pondSize, radii],
  );
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const count = scene.pondSlots.length;
  const fish = scene.fishSpot !== null ? spots[scene.fishSpot] : undefined;
  const lake = { x: radii.x + width * 0.9, y: radii.y + height * 0.62 };

  return (
    <>
      <Lake center={center} radii={lake} glowing={pickable} />
      <Anchor id={ANCHORS.pond} at={center} width={width} height={height} />
      <Anchor
        id={ANCHORS.fish}
        at={fish ? { x: center.x + fish.x, y: center.y + fish.y } : center}
        width={width}
        height={height}
      />
      <div
        role={pickable ? 'group' : undefined}
        aria-label={pickable ? 'Lago: toca numa carta para pescar' : undefined}
        className="contents"
      >
        {scene.pondSlots.map((slot, i) => {
          const spot = spots[slot];
          if (!spot) return null;
          return (
            <PondCard
              key={slot}
              slot={slot}
              spot={spot}
              center={center}
              size={size}
              pickable={pickable}
              appearDelay={scene.dealing ? i * 0.008 : null}
              onPick={onPick}
            />
          );
        })}
      </div>
      <p
        className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-ivory/80 backdrop-blur-sm"
        style={{ left: center.x, top: center.y - lake.y }}
      >
        {count === 0 ? 'Lago vazio' : `Lago · ${plural(count, 'carta', 'cartas')}`}
      </p>
      <ShowcaseFan scene={scene} center={center} size={showcaseSize} />
      <Caption text={caption} at={{ x: center.x, y: center.y + lake.y }} />
    </>
  );
}

/** A still, watery oval under the cards; it glows while the viewer has to fish (UI §4). */
function Lake({ center, radii, glowing }: { center: Point; radii: Point; glowing: boolean }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute rounded-[50%] border',
        glowing ? 'border-[#9fe3e0]/60' : 'border-white/[0.08]',
      )}
      style={{
        left: center.x - radii.x,
        top: center.y - radii.y,
        width: radii.x * 2,
        height: radii.y * 2,
        background:
          'radial-gradient(ellipse at 45% 35%, rgb(160 225 220 / 0.14), rgb(10 40 45 / 0.28) 70%, rgb(0 0 0 / 0.3))',
        boxShadow: 'inset 0 0 40px rgb(0 0 0 / 0.3)',
      }}
      animate={
        glowing && !reduced
          ? {
              boxShadow: [
                'inset 0 0 40px rgb(0 0 0 / 0.3), 0 0 0px 0px rgb(159 227 224 / 0)',
                'inset 0 0 40px rgb(0 0 0 / 0.3), 0 0 26px 6px rgb(159 227 224 / 0.35)',
              ],
            }
          : { boxShadow: 'inset 0 0 40px rgb(0 0 0 / 0.3), 0 0 0px 0px rgb(159 227 224 / 0)' }
      }
      transition={glowing ? { duration: 1.1, repeat: Infinity, repeatType: 'reverse' } : { duration: 0.3 }}
    />
  );
}

/** An invisible, always-mounted point that animations fly from. */
function Anchor({ id, at, width, height }: { id: string; at: Point; width: number; height: number }) {
  const ref = useAnchorRef<HTMLDivElement>(id);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{ left: at.x - width / 2, top: at.y - height / 2, width, height }}
    />
  );
}

const PondCard = memo(function PondCard({
  slot,
  spot,
  center,
  size,
  pickable,
  appearDelay,
  onPick,
}: {
  slot: number;
  spot: PondSpot;
  center: Point;
  size: CardSize;
  pickable: boolean;
  appearDelay: number | null;
  onPick: (slot: number) => void;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.pondSlot(slot));
  const reduced = useReducedMotion() ?? false;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <div
      ref={anchorRef}
      className="absolute"
      style={{ left: center.x + spot.x - width / 2, top: center.y + spot.y - height / 2, width, height }}
    >
      <motion.div
        initial={appearDelay !== null && !reduced ? { opacity: 0, scale: 0.6 } : false}
        animate={{ opacity: 1, scale: 1, rotate: spot.rotate }}
        whileHover={pickable ? { scale: 1.12, y: -4, zIndex: 5 } : undefined}
        transition={{ duration: 0.22, delay: appearDelay ?? 0 }}
        style={{ position: 'relative' }}
      >
        {pickable ? (
          <button
            type="button"
            onClick={() => onPick(slot)}
            aria-label={`Pescar esta carta do lago (${slot + 1})`}
            className="block cursor-pointer rounded-[var(--radius-card)] shadow-[0_0_0_1.5px_rgb(159_227_224/0.7),0_0_12px_rgb(159_227_224/0.35)]"
          >
            <Card faceDown size={size} label="" />
          </button>
        ) : (
          <Card faceDown size={size} label="" />
        )}
      </motion.div>
    </div>
  );
});

/**
 * A peixinho just made: its four cards fan out in the middle (UI §5) before
 * they go to the owner's bucket. The viewer's own cards glide out of the hand.
 */
function ShowcaseFan({
  scene,
  center,
  size,
}: {
  scene: Pick<Scene, 'showcase'>;
  center: Point;
  size: CardSize;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.showcase);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const showcase = scene.showcase;
  const spread = width * 0.62;
  return (
    <div
      ref={anchorRef}
      className="pointer-events-none absolute z-30"
      style={{ left: center.x - width / 2, top: center.y - height / 2, width, height }}
    >
      {showcase?.cards.map(({ card, enter }, i) => (
        <div
          key={`${showcase.key}:${card.id}`}
          className="absolute left-0 top-0"
          style={{ transform: `translateX(${(i - 1.5) * spread}px)` }}
        >
          <MotionCard
            id={card.id}
            size={size}
            layoutId={`card-${card.id}`}
            enter={enter}
            rotate={(i - 1.5) * 9}
          />
        </div>
      ))}
    </div>
  );
}

/** Short announcements over the lake ("Vai à pesca!", "Peixinho de Setes!"…). */
function Caption({ text, at }: { text: string | null; at: Point }) {
  return (
    <div
      className="pointer-events-none absolute z-40 flex -translate-x-1/2 -translate-y-1/2 justify-center"
      style={{ left: at.x, top: at.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="w-max max-w-[min(88vw,26rem)] rounded-2xl bg-black/65 px-3 py-1 text-center text-sm font-semibold text-ivory shadow-lg backdrop-blur-sm"
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
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
