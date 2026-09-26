'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { Card, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { ordinal } from './copy';
import { ANCHORS, type SeatScene } from './scene';
import { TableCards } from './table-cards';

export interface OpponentSeatProps {
  seat: SeatScene;
  player: RoomPlayer | undefined;
  isTurn: boolean;
  choosing: boolean;
  timer: TimerLike | null;
  skippedKey: number | null;
  compact: boolean;
  cardSize: CardSize;
  deal: { seatIndex: number; seatCount: number } | null;
}

export function OpponentSeat({
  seat,
  player,
  isTurn,
  choosing,
  timer,
  skippedKey,
  compact,
  cardSize,
  deal,
}: OpponentSeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const status = seat.finishedPosition
    ? `Terminou em ${ordinal(seat.finishedPosition)}`
    : choosing
      ? seat.hasChosenFaceUp
        ? 'Pronto'
        : 'A escolher…'
      : player?.away
        ? 'Ausente — jogada automática'
        : offline
          ? 'Desligado'
          : isTurn
            ? 'A jogar…'
            : null;

  return (
    <section
      aria-label={`${name}: ${seat.handCount} cartas na mão${status ? `, ${status}` : ''}`}
      className={clsx(
        'relative flex shrink-0 flex-col items-center gap-2 rounded-2xl px-2 py-2 transition-colors duration-300',
        isTurn && 'bg-black/15',
        seat.finishedPosition && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2.5">
        <div ref={anchorRef} className="relative">
          <TurnRing active={isTurn} timer={isTurn ? timer : null} size={compact ? 34 : 42}>
            <Avatar name={name} src={player?.avatarUrl} size={compact ? 34 : 42} dimmed={offline} />
          </TurnRing>
          <SkipBadge skippedKey={skippedKey} />
          {seat.finishedPosition && (
            <span className="absolute -bottom-1 -right-1 rounded-full bg-gold px-1.5 text-[10px] font-bold text-gold-ink shadow">
              {ordinal(seat.finishedPosition)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="max-w-28 truncate text-sm font-semibold leading-tight">{name}</p>
          <div
            className={clsx(
              'flex items-center text-xs leading-tight',
              isTurn ? 'text-gold' : 'text-ivory/60',
            )}
          >
            <HandCount count={seat.handCount} />
            {status && !compact && <span className="ml-1.5">· {status}</span>}
          </div>
        </div>
      </div>
      <TableCards seat={seat} size={cardSize} deal={deal} />
    </section>
  );
}

function HandCount({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`${count} cartas na mão`}>
      <span aria-hidden="true" className="inline-block">
        <Card faceDown size="xs" style={{ width: 10, height: 14, borderRadius: 2 }} label="" />
      </span>
      {count}
    </span>
  );
}

/** "Saltado" badge for 8s (spec: skip icon over the avatar, 500 ms). */
export function SkipBadge({ skippedKey }: { skippedKey: number | null }) {
  return (
    <AnimatePresence>
      {skippedKey !== null && (
        <motion.span
          key={skippedKey}
          role="status"
          className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white shadow-lg"
          initial={{ opacity: 0, y: 6, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
        >
          ⏭ Saltado
        </motion.span>
      )}
    </AnimatePresence>
  );
}
