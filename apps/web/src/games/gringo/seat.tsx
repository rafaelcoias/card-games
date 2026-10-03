'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { SpeechBubble, type Bubble } from '../desconfia/seat';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { plural, points, slotLabel } from './copy';
import { Grid, type SlotMode } from './grid';
import { ANCHORS, type Scene, type SeatScene } from './scene';

export interface Stamp {
  key: number;
  hit: boolean;
  index: number;
}

export interface SeatProps {
  seat: SeatScene;
  player: RoomPlayer | undefined;
  size: CardSize;
  deal: Pick<Scene, 'seats'> | null;
  isTurn: boolean;
  timer: TimerLike | null;
  bubble: Bubble | null;
  /** Said "Gringo": the stamp stays on the avatar for the rest of the game (UI §7). */
  gringo: boolean;
  /** Still to play in the last round after a "Gringo". */
  lastTurn: boolean;
  /** During the initial peek: their bottom row lifts a little, without showing its faces (UI §3). */
  peeking: boolean;
  watched: number | null;
  /** Slots whose card just changed (a swap): outlined until the next turn. */
  moved: ReadonlySet<number>;
  stamp: Stamp | null;
  final: { total: number; winner: boolean } | null;
  redKingValue: -3 | -1 | null;
  modeOf?: (index: number) => SlotMode;
  onSelect?: (index: number) => void;
}

const BOTTOM_ROW: ReadonlySet<number> = new Set([2, 3]);

/** Another player around the table: avatar, name, and their fixed grid of face-down cards. */
export const Seat = memo(function Seat({
  seat,
  player,
  size,
  deal,
  isTurn,
  timer,
  bubble,
  gringo,
  lastTurn,
  peeking,
  watched,
  moved,
  stamp,
  final,
  redKingValue,
  modeOf,
  onSelect,
}: SeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const status = player?.away ? 'ausente' : offline ? 'desligado' : null;
  const out = seat.cardCount === 0;
  return (
    <section
      aria-label={`${name}: ${out ? 'sem cartas' : plural(seat.cardCount, 'carta', 'cartas')}${status ? `, ${status}` : ''}`}
      className={clsx(
        'relative flex flex-col items-center gap-1 rounded-2xl px-2 pb-2 pt-1 transition-colors duration-200',
        isTurn ? 'bg-black/30 ring-1 ring-gold/40' : 'bg-black/10',
      )}
    >
      <div className="flex max-w-full items-center gap-1.5">
        <div ref={anchorRef} className="relative shrink-0">
          <TurnRing active={isTurn} timer={timer} size={26}>
            <Avatar
              name={name}
              src={player?.avatarUrl}
              size={26}
              dimmed={offline}
              className={clsx(final?.winner && 'ring-gold!')}
            />
          </TurnRing>
          {final?.winner && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-sm" aria-hidden="true">
              👑
            </span>
          )}
          <SpeechBubble bubble={bubble} />
        </div>
        <span className="max-w-[90px] truncate text-xs font-semibold leading-tight">{name}</span>
        {gringo && <GringoBadge />}
        {!gringo && lastTurn && (
          <span className="whitespace-nowrap rounded-full bg-gold/20 px-1.5 text-[10px] font-semibold leading-4 text-gold">
            última
          </span>
        )}
        {final ? (
          <Total value={final.total} winner={final.winner} />
        ) : out ? (
          <span className="whitespace-nowrap rounded-full bg-success/20 px-1.5 text-[10px] font-semibold leading-4 text-success">
            sem cartas
          </span>
        ) : null}
        {status && <span className="text-[10px] text-ivory/50">{status}</span>}
      </div>
      <div className="relative">
        <Grid
          seat={seat}
          size={size}
          deal={deal}
          label={`Cartas de ${name}`}
          labelOf={(index) => `Carta ${slotLabel(index)} de ${name}`}
          modeOf={modeOf}
          onSelect={onSelect}
          raised={peeking && !seat.peekDone ? BOTTOM_ROW : undefined}
          watched={watched}
          moved={moved}
          redKingValue={redKingValue}
          flash={stamp}
        />
        <StampMark stamp={stamp} />
      </div>
    </section>
  );
});

/** "GRINGO!" on whoever said it (UI §7). */
export function GringoBadge({ big = false }: { big?: boolean }) {
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-md bg-danger font-display font-black uppercase tracking-wide text-white shadow -rotate-6',
        big ? 'px-2 text-xs leading-5' : 'px-1 text-[10px] leading-4',
      )}
    >
      Gringo!
    </span>
  );
}

/** "Bateu!" in green or "Errou!" in red, slammed over the grid (UI §6). */
export function StampMark({ stamp }: { stamp: Stamp | null }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {stamp && (
        <motion.p
          key={stamp.key}
          role="status"
          className={clsx(
            'pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border-[3px] px-2 font-display text-lg font-black uppercase tracking-wider shadow-2xl',
            stamp.hit
              ? 'border-success bg-success/25 text-success'
              : 'border-danger bg-danger/25 text-danger',
          )}
          style={{ textShadow: '0 2px 8px rgb(0 0 0 / 0.6)', backdropFilter: 'blur(2px)' }}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2, rotate: -14 }}
          animate={{ opacity: 1, scale: 1, rotate: -8 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 22 }}
        >
          {stamp.hit ? 'Bateu!' : 'Errou!'}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

/** The final total, counted up (UI §8). */
export function Total({ value, winner, big = false }: { value: number; winner: boolean; big?: boolean }) {
  const shown = useCountUp(value);
  return (
    <span
      className={clsx(
        'whitespace-nowrap rounded-full px-1.5 font-display font-bold tabular-nums',
        big ? 'text-sm leading-6' : 'text-[11px] leading-4',
        winner ? 'bg-gold text-gold-ink' : 'bg-black/40 text-ivory',
      )}
    >
      {points(shown)} pts
    </span>
  );
}

/** Counts from 0 up (or down) to `target` in 0.7 s; straight to it with reduced motion. */
function useCountUp(target: number): number {
  const reduced = useReducedMotion() ?? false;
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return reduced ? target : value;
}
