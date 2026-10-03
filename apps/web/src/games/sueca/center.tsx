'use client';

import type { ClosedTrick, Seat, Team } from '@cardroom/sueca';
import {
  Card,
  CARD_WIDTH,
  cardHeight,
  cardLabel,
  MotionCard,
  stableJitter,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { sideOf, type Geometry, type Point } from './layout';
import { ANCHORS, type TrickCard, type TrumpScene } from './scene';

const box = (at: Point, size: CardSize) => {
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return { left: at.x - width / 2, top: at.y - height / 2, width, height };
};

/** The deck in the middle: for the cut, and where the cards are dealt from (UI §3). */
export function Deck({
  at,
  size,
  visible,
  parted,
}: {
  at: Point;
  size: CardSize;
  visible: boolean;
  /** The cut is being made: the deck splits in two. */
  parted: boolean;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.deck);
  const reduced = useReducedMotion() ?? false;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const half = (top: boolean) =>
    parted && !reduced
      ? {
          x: top ? width * 0.42 : -width * 0.42,
          y: top ? -height * 0.12 : height * 0.08,
          rotate: top ? 7 : -5,
        }
      : { x: 0, y: 0, rotate: 0 };
  return (
    <div
      ref={anchorRef}
      className={clsx('absolute transition-opacity duration-300', visible ? 'opacity-100' : 'opacity-0')}
      style={box(at, size)}
      aria-hidden="true"
    >
      {[false, true].map((top) => (
        <motion.div
          key={String(top)}
          className="absolute inset-0"
          initial={false}
          animate={half(top)}
          transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        >
          {[2, 1, 0].map((i) => (
            <div key={i} className="absolute" style={{ left: -i * 1.5, top: -i * 1.5 }}>
              <Card faceDown size={size} label="" />
            </div>
          ))}
        </motion.div>
      ))}
    </div>
  );
}

/** For the cutter: two big choices under the deck (UI §3). */
export function CutChoice({
  at,
  size,
  timer,
  busy,
  onChoose,
}: {
  at: Point;
  size: CardSize;
  timer: TimerLike | null;
  busy: boolean;
  onChoose: (from: 'TOP' | 'BOTTOM') => void;
}) {
  const seconds = useSecondsLeft(timer);
  return (
    <motion.div
      className="absolute z-30 flex -translate-x-1/2 flex-col items-center gap-2"
      style={{ left: at.x, top: at.y + cardHeight(size) / 2 + 14 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      role="group"
      aria-label="Cortar"
    >
      <p className="text-sm font-semibold text-ivory">
        Cortas tu · de onde sai o trunfo?
        {seconds !== null && (
          <span className={clsx('ml-2 tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/50')}>
            {seconds}s
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <Button size="lg" disabled={busy} onClick={() => onChoose('TOP')}>
          De cima
        </Button>
        <Button size="lg" disabled={busy} onClick={() => onChoose('BOTTOM')}>
          De baixo
        </Button>
      </div>
    </motion.div>
  );
}

/** The cards of the trick, in a cross in front of whoever played them (UI §6). */
export function Trick({
  trick,
  winner,
  mySeat,
  geometry,
  size,
}: {
  trick: TrickCard[];
  winner: Seat | null;
  mySeat: Seat | null;
  geometry: Geometry;
  size: CardSize;
}) {
  return (
    <>
      {trick.map((play) => {
        const spot = geometry.trick[sideOf(play.seat, mySeat)];
        const state = winner === null ? 'live' : winner === play.seat ? 'winner' : 'beaten';
        return <TrickSlot key={play.card.uid} play={play} spot={spot} size={size} state={state} />;
      })}
    </>
  );
}

function TrickSlot({
  play,
  spot,
  size,
  state,
}: {
  play: TrickCard;
  spot: Point & { rotate: number };
  size: CardSize;
  state: 'live' | 'winner' | 'beaten';
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.trick(play.seat));
  const jitter = stableJitter(play.card.uid) * 2.5;
  return (
    <div
      ref={anchorRef}
      className="absolute"
      style={{ ...box(spot, size), zIndex: state === 'winner' ? 6 : 2 }}
    >
      <motion.div
        className={clsx(
          'rounded-[var(--radius-card)] transition-[box-shadow,opacity] duration-300',
          state === 'winner' && 'shadow-[0_0_0_2px_var(--color-gold),0_0_22px_4px_rgb(232_193_112/0.45)]',
          state === 'beaten' && 'opacity-80',
        )}
        animate={{ scale: state === 'winner' ? 1.06 : 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <MotionCard
          id={play.card.id}
          size={size}
          layoutId={`card-${play.card.uid}`}
          enter={play.enter}
          rotate={spot.rotate + jitter}
        />
      </motion.div>
    </div>
  );
}

/**
 * The trump card, face up and a little turned, beside the dealer until they
 * play it (UI §4); right after the cut, on the deck where it turned over.
 */
export function TrumpCard({
  trump,
  mySeat,
  geometry,
  size,
}: {
  trump: TrumpScene | null;
  mySeat: Seat | null;
  geometry: Geometry;
  size: CardSize;
}) {
  if (!trump?.card) return null;
  const spot =
    trump.at === 'deck' ? { ...geometry.center, rotate: 0 } : geometry.trump[sideOf(trump.holder, mySeat)];
  return (
    <div className="absolute z-[5]" style={box(spot, size)}>
      <MotionCard
        id={trump.card.id}
        faceDown={trump.faceDown}
        size={size}
        layoutId={`card-${trump.card.uid}`}
        glide={0.55}
        rotate={spot.rotate}
        label={`Trunfo: ${cardLabel(trump.card.id)}`}
      />
    </div>
  );
}

/** A team's tricks, face down, with only their number beside them (UI §6). */
export function Pile({ team, count, at, ours }: { team: Team; count: number; at: Point; ours: boolean }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.pile(team));
  const layers = Math.min(count, 4);
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: at.x, top: at.y }}
      aria-label={`${ours ? 'As nossas vazas' : 'As vazas deles'}: ${count}`}
      role="img"
    >
      <div ref={anchorRef} className="relative" style={{ width: 36, height: 50 }}>
        {Array.from({ length: layers }, (_, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: -i * 1.5, top: -i * 1.5, transform: `rotate(${(i % 2 ? 1 : -1) * (2 + i)}deg)` }}
          >
            <Card faceDown size="xs" style={{ width: 36, height: 50, borderRadius: 4 }} label="" />
          </div>
        ))}
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-ivory/60">
        {ours ? 'Nós' : 'Eles'} · {count}
      </span>
    </div>
  );
}

/** "Última vaza", once per hand (UI §7). */
export function LastTrickButton({ at, onClick, busy }: { at: Point; onClick: () => void; busy: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="absolute z-20 flex items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-xs font-semibold text-ivory/85 hover:bg-black/50 disabled:opacity-50"
      style={{ left: at.x - 26, top: at.y - 68 }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      aria-label="Ver a última vaza (uma vez por mão)"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" />
        <circle cx="10" cy="10" r="2.5" />
      </svg>
      Última vaza
      <span className="rounded bg-white/10 px-1 text-[10px] text-ivory/70">1×</span>
    </motion.button>
  );
}

/** The last trick, in a cross in the middle, its winner lit, for 3 s (UI §7). */
export function LastTrickOverlay({
  trick,
  mySeat,
  size,
  center,
  nameOf,
}: {
  trick: ClosedTrick | null;
  mySeat: Seat | null;
  size: CardSize;
  center: Point;
  nameOf: (seat: Seat) => string;
}) {
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const dx = width * 1.08;
  const dy = height * 0.62;
  const offset = { bottom: [0, dy], top: [0, -dy], left: [-dx, 0], right: [dx, 0] } as const;
  return (
    <AnimatePresence>
      {trick && (
        <motion.div
          key="last-trick"
          className="pointer-events-none absolute inset-0 z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-label={`Última vaza: ganhou ${nameOf(trick.winner)}`}
        >
          <div
            className="absolute rounded-3xl bg-black/70 shadow-2xl backdrop-blur-sm"
            style={{
              left: center.x - dx - width / 2 - 18,
              top: center.y - dy - height / 2 - 48,
              width: dx * 2 + width + 36,
              height: dy * 2 + height + 78,
            }}
          />
          <p
            className="absolute -translate-x-1/2 text-xs font-bold uppercase tracking-[0.16em] text-ivory/70"
            style={{ left: center.x, top: center.y - dy - height / 2 - 42 }}
          >
            Última vaza
          </p>
          {trick.plays.map((play) => {
            const side = sideOf(play.seat, mySeat);
            const [x, y] = offset[side];
            const won = play.seat === trick.winner;
            return (
              <div
                key={play.card.uid}
                className={clsx(
                  'absolute rounded-[var(--radius-card)]',
                  won
                    ? 'z-10 shadow-[0_0_0_2px_var(--color-gold),0_0_22px_4px_rgb(232_193_112/0.45)]'
                    : 'opacity-85',
                )}
                style={box({ x: center.x + x, y: center.y + y }, size)}
              >
                <Card id={play.card.id} size={size} />
                <span
                  className={clsx(
                    'absolute inset-x-0 truncate text-center text-[10px] font-semibold text-ivory/80',
                    side === 'top' ? '-top-4' : '-bottom-4',
                  )}
                >
                  {nameOf(play.seat)}
                </span>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A short line in the middle of the table (whose cut it is). */
export function Caption({ text, at }: { text: string | null; at: Point }) {
  return (
    <div
      className="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 justify-center"
      style={{ left: at.x, top: at.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="whitespace-nowrap rounded-full bg-black/45 px-3 py-1 text-sm font-medium text-ivory/90"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
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
