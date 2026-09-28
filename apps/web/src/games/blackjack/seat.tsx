'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react';
import { memo, useEffect } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { ChipStack } from './chips';
import { Hand } from './hand';
import { ANCHORS, type Scene, type SceneSeat } from './scene';

/** Chips in the bet circle: the pending bet, the stakes in play, then what the dealer paid back. */
export function circleAmount(seat: SceneSeat): number {
  if (seat.hands.length === 0) return seat.bet ?? 0;
  return seat.hands.reduce((sum, hand) => sum + (hand.outcome === null ? hand.bet : (hand.payout ?? 0)), 0);
}

/** Number that runs to its new value (UI §8: 400 ms count-up), without re-rendering React on each frame. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  const shown = useMotionValue(value);
  const rounded = useTransform(shown, (v) => Math.round(v));
  useEffect(() => {
    if (reduced) {
      shown.jump(value);
      return;
    }
    const controls = animate(shown, value, { duration: 0.4, ease: 'easeOut' });
    return () => controls.stop();
  }, [shown, value, reduced]);
  return <motion.span className={clsx('tabular-nums', className)}>{rounded}</motion.span>;
}

export type SeatVariant = 'arc' | 'self';

export interface SeatSpotProps {
  seat: SceneSeat;
  scene: Pick<Scene, 'turn' | 'phase'>;
  player: RoomPlayer | undefined;
  name: string;
  isSelf: boolean;
  timer: TimerLike | null;
  cardSize: CardSize;
  variant: SeatVariant;
}

/**
 * A place at the table (UI §4, §8): the hands, the bet circle and the player's
 * plate. Chips leave towards the dealer when lost and come from the dealer when won.
 */
export const SeatSpot = memo(function SeatSpot({
  seat,
  scene,
  player,
  name,
  isSelf,
  timer,
  cardSize,
  variant,
}: SeatSpotProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.seatIndex));
  const onTurn = scene.phase === 'PLAYER_TURNS' && scene.turn?.seatIndex === seat.seatIndex;
  const offline = player ? !player.connected || player.away : false;
  const amount = circleAmount(seat);
  const self = variant === 'self';
  const status = seat.leaving
    ? 'sai no fim da ronda'
    : player?.away
      ? 'ausente'
      : seat.sittingOut
        ? 'de fora'
        : offline
          ? 'desligado'
          : null;

  return (
    <section
      aria-label={`${name}: ${seat.stack} fichas${status ? `, ${status}` : ''}`}
      className={clsx('flex flex-col items-center gap-1.5', seat.leaving && 'opacity-60')}
    >
      <div ref={anchorRef} className="flex min-h-4 items-end justify-center gap-2">
        {seat.hands.map((hand, handIndex) => (
          <Hand
            key={hand.id}
            hand={hand}
            size={cardSize}
            active={onTurn && scene.turn?.handIndex === handIndex}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <div
          className={clsx(
            'relative flex items-center justify-center rounded-full border-2 border-dashed',
            self ? 'size-16' : 'size-12',
            amount > 0 ? 'border-gold/60 bg-black/15' : 'border-ivory/20',
          )}
          aria-label={amount > 0 ? `Aposta: ${amount}` : 'Sem aposta'}
        >
          <AnimatePresence>
            {amount > 0 && (
              <motion.div
                key={amount}
                className="absolute"
                initial={{ y: -46, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -46, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <ChipStack amount={amount} size={self ? 30 : 24} />
              </motion.div>
            )}
          </AnimatePresence>
          {amount > 0 && (
            <span className="absolute -bottom-2 rounded-full bg-black/70 px-1.5 text-[10px] font-bold tabular-nums leading-4 text-ivory">
              {amount}
            </span>
          )}
        </div>
        {seat.insurance?.decision === 'TAKEN' && !seat.insurance.evenMoney && (
          <div className="flex flex-col items-center" title="Seguro">
            <ChipStack amount={seat.insurance.payout ?? seat.insurance.amount} size={18} />
            <span className="text-[9px] font-semibold uppercase text-ivory/70">seguro</span>
          </div>
        )}
      </div>

      <div
        className={clsx(
          'flex items-center gap-2 rounded-full px-2 py-1 backdrop-blur-sm',
          isSelf ? 'bg-gold/15 ring-1 ring-gold/40' : 'bg-black/35',
        )}
      >
        <TurnRing active={onTurn} timer={onTurn ? timer : null} size={self ? 30 : 24}>
          <Avatar name={name} src={player?.avatarUrl} size={self ? 30 : 24} dimmed={offline} />
        </TurnRing>
        <div className="min-w-0 leading-tight">
          <p className={clsx('max-w-[92px] truncate font-semibold', self ? 'text-sm' : 'text-xs')}>{name}</p>
          <p className="text-[11px] text-ivory/75">
            <span aria-hidden="true">● </span>
            <CountUp value={seat.stack} />
            {status && <span className="ml-1 text-ivory/50">· {status}</span>}
          </p>
        </div>
      </div>
    </section>
  );
});
