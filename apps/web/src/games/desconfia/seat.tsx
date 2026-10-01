'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { Card, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { plural } from './copy';
import type { SeatVariant } from './layout';
import { ANCHORS, type SeatScene } from './scene';

export interface Bubble {
  key: number;
  text: string;
  tone: 'claim' | 'doubt';
}

export interface SeatProps {
  seat: SeatScene;
  player: RoomPlayer | undefined;
  isTurn: boolean;
  timer: TimerLike | null;
  variant: SeatVariant;
  bubble: Bubble | null;
  winner: boolean;
}

/** An opponent around the table (UI §1): avatar, name and — above all — how many cards they hold. */
export const Seat = memo(function Seat({ seat, player, isTurn, timer, variant, bubble, winner }: SeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const compact = variant === 'compact';
  const avatar = compact ? 34 : 42;
  const status = player?.away ? 'ausente' : offline ? 'desligado' : null;
  const out = seat.finishedPosition !== null;
  return (
    <div className="relative">
      <section
        aria-label={`${name}: ${out ? `${seat.finishedPosition}.º, sem cartas` : plural(seat.handCount, 'carta', 'cartas')}${status ? `, ${status}` : ''}`}
        className={clsx(
          'flex items-center gap-2 rounded-2xl px-2 py-1.5 transition-colors duration-200',
          compact && 'flex-col gap-1',
          isTurn && 'bg-black/25',
        )}
      >
        <div ref={anchorRef} className="relative">
          <TurnRing active={isTurn} timer={isTurn ? timer : null} size={avatar}>
            <Avatar
              name={name}
              src={player?.avatarUrl}
              size={avatar}
              dimmed={offline}
              className={clsx(winner && 'ring-gold!')}
            />
          </TurnRing>
          {winner && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-base" aria-hidden="true">
              👑
            </span>
          )}
        </div>
        <div className={clsx('min-w-0', compact && 'flex flex-col items-center')}>
          <p
            className={clsx(
              'truncate font-semibold leading-tight',
              compact ? 'max-w-[92px] text-xs' : 'max-w-[110px] text-sm',
            )}
          >
            {name}
          </p>
          {out ? (
            <span className="mt-0.5 inline-block whitespace-nowrap rounded-full bg-gold px-2 text-[11px] font-bold leading-5 text-gold-ink">
              {seat.finishedPosition}.º · sem cartas
            </span>
          ) : (
            <HandCount count={seat.handCount} compact={compact} />
          )}
          {status && <span className="block text-[10px] leading-none text-ivory/50">{status}</span>}
        </div>
      </section>
      <SpeechBubble bubble={bubble} />
    </div>
  );
});

/** The number that matters most, big, with a little fan of backs (UI §1). It pops when it changes. */
function HandCount({ count, compact }: { count: number; compact: boolean }) {
  return (
    <div className="mt-0.5 flex items-center gap-1.5" aria-hidden="true">
      <div className="flex h-[22px] items-center">
        {Array.from({ length: Math.min(count, compact ? 4 : 6) }, (_, i) => (
          <span key={i} className="inline-block" style={{ marginLeft: i === 0 ? 0 : -12 }}>
            <Card faceDown size="xs" style={{ width: 16, height: 22, borderRadius: 3 }} label="" />
          </span>
        ))}
      </div>
      <motion.span
        key={count}
        className={clsx(
          'font-display font-semibold tabular-nums text-ivory',
          compact ? 'text-lg' : 'text-2xl',
        )}
        initial={{ scale: 1.6, color: 'var(--color-gold)' }}
        animate={{ scale: 1, color: 'var(--color-ivory)' }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
      >
        {count}
      </motion.span>
    </div>
  );
}

/** "Três Setes" / "Desconfia!" (UI §4, §5). */
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
            placement === 'below' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
          )}
          initial={{ opacity: 0, scale: 0.7, y: placement === 'below' ? -6 : 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          <p
            role="status"
            className={clsx(
              'relative whitespace-nowrap rounded-2xl px-3 py-1.5 text-sm font-bold shadow-lg',
              bubble.tone === 'claim' ? 'bg-ivory text-ink' : 'bg-danger text-white',
            )}
          >
            {bubble.text}
            <span
              aria-hidden="true"
              className={clsx(
                'absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45',
                placement === 'below' ? '-top-1' : '-bottom-1',
                bubble.tone === 'claim' ? 'bg-ivory' : 'bg-danger',
              )}
            />
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
