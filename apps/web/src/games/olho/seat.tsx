'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { Card, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { ROLE_LABEL, ordinal, plural, signedPoints } from './copy';
import { RoleBadge } from './insignia';
import type { SeatVariant } from './layout';
import { ANCHORS, type SeatScene } from './scene';

export interface Bubble {
  key: number;
  text: string;
  tone: 'say' | 'alert';
}

/** Rings for whoever ran out of cards (UI §6): gold, silver, bronze, then ivory. */
const FINISH_RING = ['ring-gold!', 'ring-[#d7dde2]!', 'ring-[#d69a62]!'];

export interface SeatProps {
  seat: SeatScene;
  player: RoomPlayer | undefined;
  isTurn: boolean;
  timer: TimerLike | null;
  variant: SeatVariant;
  bubble: Bubble | null;
  /** About to be skipped and deciding whether to escape (UI §3). */
  skipPending: boolean;
  /** Just skipped: "Perde a vez!" with an arrow over the avatar (keyed per skip). */
  skipped: number | null;
}

/** An opponent around the table (UI §1): avatar, name, role, points and how many cards they hold. */
export const Seat = memo(function Seat({
  seat,
  player,
  isTurn,
  timer,
  variant,
  bubble,
  skipPending,
  skipped,
}: SeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const compact = variant === 'compact';
  const avatar = compact ? 34 : 42;
  const status = seat.leaving ? 'saiu' : player?.away ? 'ausente' : offline ? 'desligado' : null;
  const out = seat.finishedPosition !== null && !seat.leaving;
  return (
    <div className="relative">
      <section
        aria-label={`${name}${seat.role ? `, ${ROLE_LABEL[seat.role]}` : ''}: ${
          out
            ? `${ordinal(seat.finishedPosition as number)}, sem cartas`
            : plural(seat.handCount, 'carta', 'cartas')
        }, ${signedPoints(seat.points)} pontos${status ? `, ${status}` : ''}`}
        className={clsx(
          'flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-[background-color,opacity] duration-200',
          compact && 'flex-col gap-1',
          isTurn && 'bg-black/25',
          (seat.passed || seat.leaving) && !isTurn && 'opacity-70',
        )}
      >
        <div ref={anchorRef} className="relative">
          <TurnRing active={isTurn} timer={isTurn ? timer : null} size={avatar}>
            <Avatar
              name={name}
              src={player?.avatarUrl}
              size={avatar}
              dimmed={offline || seat.leaving}
              className={clsx(
                out && (FINISH_RING[(seat.finishedPosition as number) - 1] ?? 'ring-ivory/70!'),
              )}
            />
          </TurnRing>
          {seat.role && (
            <RoleBadge
              role={seat.role}
              size={compact ? 17 : 19}
              className="absolute -bottom-1 -left-1.5 shadow"
            />
          )}
          {out && (
            <span className="absolute -right-2 -top-1.5 rounded-full bg-gold px-1.5 text-[10px] font-bold leading-4 text-gold-ink shadow">
              {ordinal(seat.finishedPosition as number)}
            </span>
          )}
          <SkipSeal pending={skipPending} skipped={skipped} />
        </div>
        <div className={clsx('min-w-0', compact && 'flex flex-col items-center')}>
          <p
            className={clsx(
              'truncate font-semibold leading-tight',
              compact ? 'max-w-[92px] text-xs' : 'max-w-[112px] text-sm',
            )}
          >
            {name}
          </p>
          <div className={clsx('mt-0.5 flex items-center gap-1.5', compact && 'justify-center')}>
            {!out && <HandCount count={seat.handCount} compact={compact} />}
            <span
              className={clsx(
                'text-[11px] font-semibold tabular-nums',
                seat.points > 0 ? 'text-success' : seat.points < 0 ? 'text-danger' : 'text-ivory/50',
              )}
              title="Pontos da sessão"
            >
              {signedPoints(seat.points)}
            </span>
          </div>
          <Chips seat={seat} status={status} />
        </div>
      </section>
      <SpeechBubble bubble={bubble} />
    </div>
  );
});

function Chips({ seat, status }: { seat: SeatScene; status: string | null }) {
  const chips: ReactNode[] = [];
  if (seat.blocked && !seat.leaving)
    chips.push(
      <span
        key="blocked"
        className="bg-danger/25 text-[#ffb4b4]"
        title="Só tem 2/joker e não pode acabar com eles: passa sempre"
      >
        Bloqueio · só 2/joker
      </span>,
    );
  else if (seat.passed)
    chips.push(
      <span key="passed" className="bg-white/10 text-ivory/70">
        Passou
      </span>,
    );
  if (status)
    chips.push(
      <span key="status" className="text-ivory/50">
        {status}
      </span>,
    );
  if (chips.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1 [&>span]:whitespace-nowrap [&>span]:rounded-full [&>span]:px-1.5 [&>span]:text-[10px] [&>span]:font-semibold [&>span]:leading-4">
      {chips}
    </div>
  );
}

/** The number that matters, with a little fan of backs; it pops when it changes. */
function HandCount({ count, compact }: { count: number; compact: boolean }) {
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      <div className="flex h-[20px] items-center">
        {Array.from({ length: Math.min(count, compact ? 3 : 5) }, (_, i) => (
          <span key={i} className="inline-block" style={{ marginLeft: i === 0 ? 0 : -11 }}>
            <Card faceDown size="xs" style={{ width: 14, height: 20, borderRadius: 3 }} label="" />
          </span>
        ))}
      </div>
      <motion.span
        key={count}
        className={clsx(
          'font-display font-semibold tabular-nums text-ivory',
          compact ? 'text-base' : 'text-xl',
        )}
        initial={{ scale: 1.5, color: 'var(--color-gold)' }}
        animate={{ scale: 1, color: 'var(--color-ivory)' }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        {count}
      </motion.span>
    </div>
  );
}

/**
 * UI §3: "Perde a vez?" while the target decides, "Perde a vez!" with a curved
 * arrow sweeping over the avatar when they are skipped.
 */
export function SkipSeal({ pending, skipped }: { pending: boolean; skipped: number | null }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <AnimatePresence>
      {skipped !== null ? (
        <motion.div
          key={`skipped-${skipped}`}
          className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 24 }}
        >
          <svg
            width="76"
            height="34"
            viewBox="0 0 76 34"
            className="absolute -top-4 left-1/2 -translate-x-1/2"
            aria-hidden="true"
          >
            <motion.path
              d="M6 30 C 18 2, 58 2, 70 30"
              fill="none"
              stroke="var(--color-danger)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            />
            <path
              d="M64 24 L70 31 L72 22"
              fill="none"
              stroke="var(--color-danger)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="relative whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-[11px] font-black uppercase text-white shadow-lg">
            Perde a vez!
          </span>
        </motion.div>
      ) : pending ? (
        <motion.span
          key="pending"
          className="pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-2 py-0.5 text-[11px] font-black text-gold-ink shadow-lg"
          initial={{ opacity: 0, y: 4 }}
          animate={reduced ? { opacity: 1, y: 0 } : { opacity: 1, y: [0, -2, 0] }}
          exit={{ opacity: 0 }}
          transition={
            reduced
              ? { duration: 0.15 }
              : { y: { duration: 0.9, repeat: Infinity }, default: { duration: 0.2 } }
          }
        >
          Perde a vez?
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

/** "Passo", "Também tenho!" (UI §3). */
export function SpeechBubble({
  bubble,
  placement = 'below',
}: {
  bubble: Bubble | null;
  placement?: 'below' | 'above';
}) {
  return (
    <AnimatePresence>
      {bubble && (
        <motion.div
          key={bubble.key}
          className={clsx(
            'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2',
            placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1.5',
          )}
          initial={{ opacity: 0, scale: 0.7, y: placement === 'below' ? -6 : 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          <p
            role="status"
            className={clsx(
              'relative whitespace-nowrap rounded-2xl px-3 py-1 text-sm font-bold shadow-lg',
              bubble.tone === 'say' ? 'bg-ivory text-ink' : 'bg-danger text-white',
            )}
          >
            {bubble.text}
            <span
              aria-hidden="true"
              className={clsx(
                'absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45',
                placement === 'below' ? '-top-1' : '-bottom-1',
                bubble.tone === 'say' ? 'bg-ivory' : 'bg-danger',
              )}
            />
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
