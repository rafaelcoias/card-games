'use client';

import type { PlayerId } from '@cardroom/game-core';
import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { trickKind } from './copy';
import { playSpot } from './layout';
import { ANCHORS, type PlayScene, type Scene } from './scene';

export interface CenterProps {
  scene: Scene;
  center: { x: number; y: number };
  /** Half-axes of the seats' oval (the felt's inner table is drawn inside it). */
  radii: { x: number; y: number };
  size: CardSize;
  caption: string | null;
  stamp: { key: number; text: string } | null;
  nameOf: (id: PlayerId) => string;
}

/** Plays shown on the trick; older ones lie underneath and only add bulk. */
const VISIBLE_PLAYS = 6;

/** The middle of the table (UI §1, §4, §5): the trick, the discard pile and what just happened. */
export function Center({ scene, center, radii, size, caption, stamp, nameOf }: CenterProps) {
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const playing = scene.phase === 'PLAYING';
  // A narrow table (phones) has no room beside the trick: the discard pile joins the row below it.
  const narrow = radii.x < 260;
  const infoY = center.y + height / 2 + 22;
  const discard = narrow
    ? { x: center.x - 70, y: infoY + 34 }
    : { x: center.x - Math.min(radii.x * 0.55, width * 2.6), y: center.y };
  const kind = playing ? trickKind(scene.trick.count) : null;
  const firstTrick = scene.trick.isFirstOfGame && scene.rules.firstTrickNoPower && playing;
  const top = scene.trick.plays.at(-1);
  return (
    <>
      <TableTop center={center} radii={radii} />
      <Deck center={center} size={size} visible={scene.dealing} />
      {!narrow && <Discard x={discard.x} y={discard.y} count={scene.discardCount} />}
      <TrickPile scene={scene} center={center} size={size} />
      <Clearing scene={scene} center={center} size={size} to={discard} />
      <div
        className="pointer-events-none absolute z-20 flex -translate-x-1/2 flex-col items-center gap-1"
        style={{ left: center.x, top: infoY }}
      >
        {top && !scene.trick.closing && playing && (
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-semibold text-ivory/80">
            {nameOf(top.playerId)}
          </span>
        )}
        <div className="flex flex-wrap items-center justify-center gap-1">
          {narrow && <DiscardPill count={scene.discardCount} />}
          {kind && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-ivory/85">
              {kind}
            </span>
          )}
          {firstTrick && (
            <span className="whitespace-nowrap rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold">
              Primeira vaza: sem 2 nem joker
            </span>
          )}
        </div>
      </div>
      <Stamp stamp={stamp} center={center} />
      <Caption text={caption} center={{ x: center.x, y: center.y - height / 2 - 26 }} />
    </>
  );
}

/** Plays stacked a little askew, the last one on top and lit (UI §1). Four in a row line up (UI §4). */
function TrickPile({
  scene,
  center,
  size,
}: {
  scene: Scene;
  center: { x: number; y: number };
  size: CardSize;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.trick);
  const plays = scene.trick.plays;
  const aligned = scene.trick.closing?.reason === 'FOUR_IN_A_ROW';
  const run = aligned ? runOf(plays) : [];
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const spread = width * 0.55;
  const step = width * 0.32;
  const shown = plays.slice(-VISIBLE_PLAYS);
  // Four in a row line up left to right, each play after the one before.
  const slot = width * 0.62;
  const lineWidth = run.reduce((sum, p) => sum + p.cards.length, 0) * slot + width * 0.38;
  const lineStart = new Map<PlayScene, number>();
  run.reduce((offset, play) => {
    lineStart.set(play, offset);
    return offset + play.cards.length * slot;
  }, -lineWidth / 2);
  return (
    <div
      ref={anchorRef}
      className="absolute"
      style={{ left: center.x - width / 2, top: center.y - height / 2, width, height }}
    >
      {shown.map((play, index) => {
        const isTop = index === shown.length - 1;
        const start = lineStart.get(play);
        const inRun = start !== undefined;
        const spot = inRun
          ? { x: start + (play.cards.length * slot) / 2 - width * 0.12, y: 0, rotate: 0 }
          : playSpot(play.key, spread);
        const groupWidth = width + step * (play.cards.length - 1);
        return (
          <motion.div
            key={play.key}
            className="absolute"
            style={{ left: -(groupWidth - width) / 2, top: 0, zIndex: index + 1 }}
            initial={false}
            animate={{ x: spot.x, y: spot.y, rotate: spot.rotate, opacity: isTop || inRun ? 1 : 0.86 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <PlayGroup
              play={play}
              size={size}
              step={step}
              lit={isTop || inRun}
              cut={isTop && !!scene.trick.closing && scene.trick.closing.reason !== 'ALL_PASSED'}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

/** The plays of the closing four-in-a-row: the last ones, all of the run's rank. */
function runOf(plays: readonly PlayScene[]): PlayScene[] {
  const rank = plays.at(-1)?.cards[0]?.rank;
  const run: PlayScene[] = [];
  for (let i = plays.length - 1; i >= 0; i--) {
    const play = plays[i] as PlayScene;
    if (play.cards[0]?.rank !== rank) break;
    run.unshift(play);
  }
  return run;
}

function PlayGroup({
  play,
  size,
  step,
  lit,
  cut,
}: {
  play: PlayScene;
  size: CardSize;
  step: number;
  lit: boolean;
  cut: boolean;
}) {
  const reduced = useReducedMotion() ?? false;
  const joker = play.cards[0]?.rank === 'JOKER';
  return (
    <motion.div
      className={clsx(
        'relative rounded-card transition-shadow duration-300',
        lit && 'shadow-[0_0_0_2px_rgb(232_193_112/0.85),0_0_20px_3px_rgb(232_193_112/0.35)]',
        (cut || joker) && 'shadow-[0_0_0_2px_rgb(255_236_179/0.95),0_0_34px_8px_rgb(255_214_120/0.55)]',
      )}
      initial={joker && !reduced ? { rotate: -24, scale: 1.18 } : false}
      animate={{ rotate: 0, scale: 1 }}
      transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
      style={{ width: CARD_WIDTH[size] + step * (play.cards.length - 1), height: cardHeight(size) }}
    >
      {play.cards.map((card, i) => (
        <div key={card.id} className="absolute top-0" style={{ left: i * step }}>
          <MotionCard
            id={card.id}
            size={size}
            layoutId={`card-${card.id}`}
            enter={play.enter ? { ...play.enter, delay: (play.enter.delay ?? 0) + i * 0.05 } : undefined}
          />
        </div>
      ))}
    </motion.div>
  );
}

/** A cleared trick slides into the discard pile (UI §4, §5). */
function Clearing({
  scene,
  center,
  size,
  to,
}: {
  scene: Scene;
  center: { x: number; y: number };
  size: CardSize;
  to: { x: number; y: number };
}) {
  const clearing = scene.clearing;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <AnimatePresence>
      {clearing && (
        <motion.div
          key={clearing.key}
          className="pointer-events-none absolute"
          style={{ left: center.x - width / 2, top: center.y - height / 2 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: to.x - center.x, y: to.y - center.y, opacity: 0, scale: 0.55 }}
          transition={{ duration: 0.4, ease: 'easeIn' }}
          aria-hidden="true"
        >
          {clearing.plays.slice(-VISIBLE_PLAYS).map((play, index) => {
            const spot = playSpot(play.key, width * 0.55);
            return (
              <div
                key={play.key}
                className="absolute"
                style={{
                  left: spot.x,
                  top: spot.y,
                  transform: `rotate(${spot.rotate}deg)`,
                  zIndex: index + 1,
                }}
              >
                {play.cards.map((card, i) => (
                  <div key={card.id} className="absolute top-0" style={{ left: i * width * 0.32 }}>
                    <Card id={card.id} size={size} label="" />
                  </div>
                ))}
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Discard({ x, y, count }: { x: number; y: number; count: number }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.discard);
  const layers = Math.min(4, Math.ceil(count / 8));
  return (
    <div
      ref={anchorRef}
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: x, top: y }}
      aria-label={`Descarte: ${count} cartas`}
      role="img"
    >
      <div className="relative" style={{ width: 34, height: 48 }}>
        {count === 0 ? (
          <div className="cr-slot size-full opacity-50" />
        ) : (
          Array.from({ length: layers }, (_, i) => (
            <div
              key={i}
              className="absolute"
              style={{ left: -i * 1.2, top: -i * 1.2, transform: `rotate(${(i - 1) * 4}deg)` }}
            >
              <Card faceDown size="xs" style={{ width: 34, height: 48, borderRadius: 5 }} label="" />
            </div>
          ))
        )}
      </div>
      {count > 0 && <span className="cr-count">{count}</span>}
    </div>
  );
}

/** The discard pile on a narrow table: a small back and its count, in the row under the trick. */
function DiscardPill({ count }: { count: number }) {
  const anchorRef = useAnchorRef<HTMLSpanElement>(ANCHORS.discard);
  if (count === 0) return null;
  return (
    <span
      ref={anchorRef}
      className="flex items-center gap-1 rounded-full bg-black/35 py-0.5 pl-1 pr-2 text-xs font-semibold text-ivory/75"
      aria-label={`Descarte: ${count} cartas`}
    >
      <Card faceDown size="xs" style={{ width: 12, height: 17, borderRadius: 2 }} label="" />
      {count}
    </span>
  );
}

/** Where dealt cards come from: a deck in the middle, shown while dealing. */
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
      className={clsx('absolute z-30 transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')}
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

function TableTop({ center, radii }: { center: { x: number; y: number }; radii: { x: number; y: number } }) {
  const rx = radii.x * 0.74;
  const ry = radii.y * 0.74;
  if (rx < 40 || ry < 40) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute rounded-[50%] border border-white/[0.07] bg-black/8 shadow-[inset_0_0_60px_rgb(0_0_0/0.28),0_0_0_10px_rgb(0_0_0/0.06)]"
      style={{ left: center.x - rx, top: center.y - ry, width: rx * 2, height: ry * 2 }}
    />
  );
}

/** "CORTOU!" (UI §4): a rubber stamp over the trick. */
function Stamp({
  stamp,
  center,
}: {
  stamp: { key: number; text: string } | null;
  center: { x: number; y: number };
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={{ left: center.x, top: center.y }}
      aria-live="assertive"
    >
      <AnimatePresence>
        {stamp && (
          <motion.p
            key={stamp.key}
            className="w-max max-w-[78vw] rounded-lg border-[3px] border-danger bg-black/55 px-3 py-1 text-center font-display text-lg leading-tight font-black uppercase tracking-wide text-danger shadow-[0_0_30px_rgb(240_104_107/0.45)] sm:text-3xl"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2.2, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
          >
            {stamp.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** What just happened, above the trick (UI §4, §5). */
function Caption({ text, center }: { text: string | null; center: { x: number; y: number } }) {
  return (
    <div
      className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-1/2 justify-center"
      style={{ left: center.x, top: center.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="max-w-[86vw] rounded-full bg-black/60 px-3 py-1 text-center text-sm font-semibold text-ivory shadow-lg backdrop-blur-sm"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
