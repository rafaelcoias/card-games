'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { Card, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { memo } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { BidChip, PointsPips } from './badges';
import { atRisk } from './copy';
import { ANCHORS, dealDelaySeconds, type Scene, type SeatScene } from './scene';

export type SeatVariant = 'regular' | 'compact';

export interface SeatProps {
  seat: SeatScene;
  seatIndex: number;
  scene: Pick<
    Scene,
    'phase' | 'blind' | 'maxPoints' | 'handSize' | 'tricksPlayed' | 'dealing' | 'seats' | 'losers'
  >;
  player: RoomPlayer | undefined;
  isTurn: boolean;
  timer: TimerLike | null;
  variant: SeatVariant;
  cardSize: CardSize;
}

/**
 * An opponent around the table (UI §1): avatar, name, penalty pips, bid and
 * tricks, and their cards — backs normally, face up in blind rounds.
 */
export const Seat = memo(function Seat({
  seat,
  seatIndex,
  scene,
  player,
  isTurn,
  timer,
  variant,
  cardSize,
}: SeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat.id));
  const name = player?.username ?? '—';
  const offline = player ? !player.connected || player.away : false;
  const compact = variant === 'compact';
  const avatar = compact ? 30 : 40;
  const danger = atRisk(seat.points, scene.maxPoints);
  const lost = scene.losers.includes(seat.id);
  const status = player?.away ? 'ausente' : offline ? 'desligado' : null;

  const avatarBlock = (
    <div ref={anchorRef} className="relative">
      <TurnRing active={isTurn} timer={isTurn ? timer : null} size={avatar}>
        <Avatar
          name={name}
          src={player?.avatarUrl}
          size={avatar}
          dimmed={offline}
          className={clsx(danger && 'ring-danger!')}
        />
      </TurnRing>
      {seat.isStarter && (
        <span
          className="absolute -bottom-1 -right-1 rounded-full bg-gold px-1 text-[9px] font-bold leading-4 text-gold-ink shadow"
          title="Começou a ronda"
        >
          1.º
        </span>
      )}
    </div>
  );
  const chip = (
    <BidChip
      bid={seat.bid}
      won={seat.tricksWon}
      tricksLeft={scene.handSize - scene.tricksPlayed}
      playing={scene.phase !== 'BIDDING'}
      bidding={isTurn && scene.phase === 'BIDDING'}
      compact={compact}
    />
  );
  const cards = <SeatCards seat={seat} seatIndex={seatIndex} scene={scene} cardSize={cardSize} />;

  return (
    <section
      aria-label={`${name}: ${seat.points} de ${scene.maxPoints} pontos${seat.bid !== null ? `, aposta ${seat.bid}, feitas ${seat.tricksWon}` : ''}${status ? `, ${status}` : ''}`}
      className={clsx(
        'flex items-center gap-2 rounded-2xl px-1.5 py-1 transition-colors duration-300',
        compact ? 'flex-col' : 'flex-row',
        isTurn && 'bg-black/20',
        lost && 'opacity-60',
      )}
    >
      {compact ? (
        <>
          {seat.visibleHand ? (
            // Blind round, crowded table: the card itself is the seat, with the avatar pinned to it.
            <div className="relative pl-2 pt-2">
              {cards}
              <div className="absolute left-0 top-0 z-10 scale-[0.8]">{avatarBlock}</div>
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              {avatarBlock}
              {cards}
            </div>
          )}
          <p className="-mt-1 max-w-[96px] truncate text-xs font-semibold leading-tight">{name}</p>
          <div className="-mt-1 flex items-center gap-1">
            <PointsPips points={seat.points} max={scene.maxPoints} compact />
            {chip}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-2">
              {avatarBlock}
              <div className="min-w-0">
                <p className="max-w-[92px] truncate text-sm font-semibold leading-tight">{name}</p>
                <PointsPips points={seat.points} max={scene.maxPoints} />
              </div>
            </div>
            {chip}
          </div>
          {cards}
        </>
      )}
      {status && <span className="text-[10px] leading-none text-ivory/50">{status}</span>}
    </section>
  );
});

/** Face-up cards in blind rounds (they glide to the table when played); small backs otherwise. */
function SeatCards({
  seat,
  seatIndex,
  scene,
  cardSize,
}: {
  seat: SeatScene;
  seatIndex: number;
  scene: SeatProps['scene'];
  cardSize: CardSize;
}) {
  if (seat.visibleHand) {
    return (
      <div className="flex gap-1" role="group" aria-label="Carta na testa">
        {seat.visibleHand.map((card) => (
          <MotionCard
            key={card.id}
            id={card.id}
            size={cardSize}
            layoutId={`card-${card.id}`}
            enter={
              scene.dealing
                ? { from: ANCHORS.deck, kind: 'deal', delay: dealDelaySeconds(0, seatIndex, scene) }
                : undefined
            }
          />
        ))}
      </div>
    );
  }
  if (seat.handCount === 0) return <div className="h-[25px]" aria-hidden="true" />;
  return (
    <div className="flex h-[25px] items-center" title={`${seat.handCount} cartas na mão`} aria-hidden="true">
      {Array.from({ length: seat.handCount }, (_, i) => (
        <span key={i} className="inline-block" style={{ marginLeft: i === 0 ? 0 : -11 }}>
          <Card faceDown size="xs" style={{ width: 18, height: 25, borderRadius: 3 }} label="" />
        </span>
      ))}
    </div>
  );
}
