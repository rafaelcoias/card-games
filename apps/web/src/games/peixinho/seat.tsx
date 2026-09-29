'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { Card, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { memo } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { Bucket } from './bucket';
import { plural } from './copy';
import type { SeatVariant } from './layout';
import { ANCHORS, type SeatScene } from './scene';

export interface Bubble {
  key: number;
  text: string;
  tone: 'ask' | 'yes' | 'no';
}

/** How a seat takes part in the viewer's ask. */
export type TargetState = 'none' | 'available' | 'selected' | 'hovered';

export interface SeatProps {
  seat: SeatScene;
  player: RoomPlayer | undefined;
  isTurn: boolean;
  timer: TimerLike | null;
  variant: SeatVariant;
  target: TargetState;
  onTarget: (playerId: string) => void;
  bubble: Bubble | null;
  winner: boolean;
  /** The game is over: hands are empty, only the buckets matter. */
  finished: boolean;
}

/**
 * An opponent around the table (UI §1): avatar, name, card count and bucket.
 * While the viewer asks, the seats with cards can be tapped (or have a card
 * dropped on them) to choose whom to ask (UI §2).
 */
export const Seat = memo(function Seat({
  seat,
  player,
  isTurn,
  timer,
  variant,
  target,
  onTarget,
  bubble,
  winner,
  finished,
}: SeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const compact = variant === 'compact';
  const avatar = compact ? 34 : 42;
  const status = player?.away ? 'ausente' : offline ? 'desligado' : null;
  const targetable = target !== 'none';

  const body = (
    <>
      <div className={clsx('flex items-center gap-2', compact && 'flex-col gap-1')}>
        <div ref={anchorRef} className="relative">
          <TurnRing active={isTurn} timer={isTurn ? timer : null} size={avatar}>
            <Avatar
              name={name}
              src={player?.avatarUrl}
              size={avatar}
              dimmed={offline || seat.out}
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
              'truncate text-sm font-semibold leading-tight',
              compact ? 'max-w-[92px] text-xs' : 'max-w-[110px]',
            )}
          >
            {name}
          </p>
          {!finished && <HandBacks count={seat.handCount} out={seat.out} />}
        </div>
      </div>
      <Bucket playerId={seat.id} peixinhos={seat.peixinhos} compact={compact} highlight={winner} />
      {status && <span className="text-[10px] leading-none text-ivory/50">{status}</span>}
    </>
  );

  const className = clsx(
    'relative flex flex-col items-center gap-1 rounded-2xl px-2 py-1.5 transition-[background-color,box-shadow,opacity] duration-200',
    isTurn && 'bg-black/20',
    seat.out && 'opacity-60',
    target === 'available' &&
      'cursor-pointer bg-white/[0.06] shadow-[0_0_0_1.5px_rgb(255_255_255/0.25)] hover:bg-white/10',
    target === 'hovered' && 'bg-gold/15 shadow-[0_0_0_2px_var(--color-gold)]',
    target === 'selected' && 'bg-gold/20 shadow-[0_0_0_2px_var(--color-gold),0_0_18px_rgb(232_193_112/0.35)]',
  );
  const hand = finished ? '' : seat.out ? 'fora de jogo, ' : `${plural(seat.handCount, 'carta', 'cartas')}, `;
  const label = `${name}: ${hand}${plural(seat.peixinhos.length, 'peixinho', 'peixinhos')}${status ? `, ${status}` : ''}`;

  return (
    <div className="relative">
      {targetable ? (
        <button
          type="button"
          data-ask-target={seat.id}
          aria-pressed={target === 'selected'}
          aria-label={`Pedir a ${label}`}
          className={className}
          onClick={() => onTarget(seat.id)}
        >
          {body}
        </button>
      ) : (
        <section aria-label={label} className={className}>
          {body}
        </section>
      )}
      <SpeechBubble bubble={bubble} />
    </div>
  );
});

/** Small card backs and the count, or "Fora de jogo" once out (UI §6). */
function HandBacks({ count, out }: { count: number; out: boolean }) {
  if (out) {
    return (
      <span className="mt-0.5 inline-block whitespace-nowrap rounded-full bg-black/40 px-2 text-[10px] font-semibold uppercase leading-4 tracking-wide text-ivory/70">
        Fora de jogo
      </span>
    );
  }
  const shown = Math.min(count, 8);
  return (
    <div className="mt-0.5 flex items-center gap-1" aria-hidden="true">
      <div className="flex h-[22px] items-center">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="inline-block" style={{ marginLeft: i === 0 ? 0 : -11 }}>
            <Card faceDown size="xs" style={{ width: 16, height: 22, borderRadius: 3 }} label="" />
          </span>
        ))}
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-ivory/70">{count}</span>
    </div>
  );
}

/** "Tens Setes?" / "Tenho! Toma 2." / "Vai à pesca! 🐟" (UI §3), under the seat. */
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
              bubble.tone === 'ask' && 'bg-ivory text-ink',
              bubble.tone === 'yes' && 'bg-success text-ink',
              bubble.tone === 'no' && 'bg-[#9fe3e0] text-ink',
            )}
          >
            {bubble.text}
            <span
              aria-hidden="true"
              className={clsx(
                'absolute left-1/2 size-2.5 -translate-x-1/2 rotate-45',
                placement === 'below' ? '-top-1' : '-bottom-1',
                bubble.tone === 'ask' && 'bg-ivory',
                bubble.tone === 'yes' && 'bg-success',
                bubble.tone === 'no' && 'bg-[#9fe3e0]',
              )}
            />
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
