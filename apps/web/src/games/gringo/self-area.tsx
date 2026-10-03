'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { SpeechBubble, type Bubble } from '../desconfia/seat';
import { TurnRing, useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { plural, slotLabel } from './copy';
import { Grid, type SlotMode } from './grid';
import { ANCHORS, type Scene, type SeatScene } from './scene';
import { GringoBadge, StampMark, Total, type Stamp } from './seat';

/** Time left for what the coach asks; `receivedAt` absent: the full `remainingMs` from when it appears. */
export type Drain = Pick<TimerLike, 'remainingMs' | 'totalMs'> & { receivedAt?: number };

/**
 * What to do right now, over the viewer's own cards: the initial peek, the
 * card just drawn, each step of a power, the second tap of a snap.
 */
export interface Coach {
  /** One decision: the pill (and its bar) restarts only when this changes. */
  key: string;
  title: string;
  detail?: string;
  tone: 'gold' | 'plain' | 'danger';
  drain: Drain | null;
}

export interface MyGridProps {
  seat: SeatScene;
  size: CardSize;
  deal: Pick<Scene, 'seats'> | null;
  modeOf: (index: number) => SlotMode;
  onSelect: (index: number) => void;
  raised: ReadonlySet<number>;
  watched: number | null;
  moved: ReadonlySet<number>;
  stamp: Stamp | null;
  redKingValue: -3 | -1 | null;
  coach: Coach | null;
}

const COACH_TONE: Record<Coach['tone'], { pill: string; bar: string }> = {
  gold: { pill: 'bg-gold text-gold-ink', bar: 'bg-gold-strong' },
  plain: { pill: 'bg-black/70 text-ivory ring-1 ring-white/10', bar: 'bg-white/10' },
  danger: { pill: 'bg-danger text-white', bar: 'bg-black/15' },
};

/** The viewer's own grid, big, at the bottom of the table. */
export function MyGrid({
  seat,
  size,
  deal,
  modeOf,
  onSelect,
  raised,
  watched,
  moved,
  stamp,
  redKingValue,
  coach,
}: MyGridProps) {
  const tone = coach ? COACH_TONE[coach.tone] : null;
  return (
    <div className={clsx('relative flex flex-col items-center', coach?.detail ? 'pt-12' : 'pt-7')}>
      <AnimatePresence mode="popLayout">
        {coach && tone && (
          <motion.div
            key={coach.key}
            className="pointer-events-none absolute top-0 z-[75] flex max-w-[min(92vw,30rem)] flex-col items-center"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className={clsx(
                'relative overflow-hidden rounded-2xl px-3.5 py-1 text-center shadow-lg',
                tone.pill,
              )}
            >
              {coach.drain && <DrainBar drain={coach.drain} className={tone.bar} />}
              <p className="relative text-[13px] font-bold leading-5">{coach.title}</p>
              {coach.detail && (
                <p className="relative text-[11px] font-medium leading-4 opacity-80">{coach.detail}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Grid
        seat={seat}
        size={size}
        deal={deal}
        label="As tuas cartas"
        labelOf={(index) => `A tua carta ${slotLabel(index)}`}
        modeOf={modeOf}
        onSelect={onSelect}
        raised={raised}
        watched={watched}
        moved={moved}
        redKingValue={redKingValue}
        flash={stamp}
      />
      <StampMark stamp={stamp} />
    </div>
  );
}

/** A bar that empties with the time left: started once per decision, so React does no per-frame work. */
function DrainBar({ drain, className }: { drain: Drain; className: string }) {
  const [remaining] = useState(() =>
    Math.max(
      0,
      drain.remainingMs - (drain.receivedAt === undefined ? 0 : performance.now() - drain.receivedAt),
    ),
  );
  return (
    <motion.span
      aria-hidden="true"
      className={clsx('absolute inset-y-0 left-0 w-full origin-left', className)}
      initial={{ scaleX: remaining / drain.totalMs }}
      animate={{ scaleX: 0 }}
      transition={{ duration: remaining / 1000, ease: 'linear' }}
    />
  );
}

export interface ActionBarProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  message: string;
  highlight: boolean;
  timer: TimerLike | null;
  bubble: Bubble | null;
  gringo: boolean;
  final: { total: number; winner: boolean } | null;
  children?: ReactNode;
}

/** The viewer's own seat: avatar with the timer, what to do now, and the buttons for it. */
export function ActionBar({
  scene,
  player,
  message,
  highlight,
  timer,
  bubble,
  gringo,
  final,
  children,
}: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(scene.selfId ?? 'self'));
  const me = scene.seats.find((s) => s.id === scene.selfId);
  return (
    // Above the grid, so the viewer's own bubble is never hidden behind the cards.
    <div className="relative z-[70] flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div ref={anchorRef} className="relative shrink-0">
          <TurnRing active={highlight} timer={timer} size={38}>
            <Avatar
              name={player?.username ?? 'Eu'}
              src={player?.avatarUrl}
              size={38}
              className={clsx(final?.winner && 'ring-gold!')}
            />
          </TurnRing>
          {final?.winner && (
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-base" aria-hidden="true">
              👑
            </span>
          )}
          <SpeechBubble bubble={bubble} placement="above" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx('truncate text-sm font-semibold', highlight ? 'text-gold' : 'text-ivory')}
            role="status"
          >
            {message}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ivory/60">
            {gringo && <GringoBadge />}
            {final ? (
              <Total value={final.total} winner={final.winner} />
            ) : (
              <span className="tabular-nums">
                {me && me.cardCount === 0 ? 'sem cartas' : plural(me?.cardCount ?? 0, 'carta', 'cartas')}
              </span>
            )}
            {seconds !== null && (
              <span className={clsx('tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
                {seconds}s
              </span>
            )}
          </p>
        </div>
      </div>
      {children && <div className="flex gap-2 max-sm:w-full *:max-sm:flex-1">{children}</div>}
    </div>
  );
}
