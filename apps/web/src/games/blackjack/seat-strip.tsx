'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { outcomeLabel, outcomeTone, totalLabel } from './copy';
import { ANCHORS, type Scene, type SceneSeat } from './scene';
import { SeatSpot, circleAmount } from './seat';

/**
 * Phones (UI §11): seven places do not fit in an arc, so the other players sit
 * in a compact strip — chips and totals — that expands into full seats.
 */
export function SeatStrip({
  seats,
  scene,
  nameOf,
  players,
  timerFor,
}: {
  seats: SceneSeat[];
  scene: Scene;
  nameOf: (id: string) => string;
  players: Map<string, RoomPlayer>;
  timerFor: (seat: SceneSeat) => TimerLike | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (seats.length === 0) return null;
  return (
    <div className="w-full">
      {expanded ? (
        <div className="flex flex-wrap items-end justify-center gap-x-3 gap-y-2 rounded-2xl bg-black/20 p-2">
          {seats.map((seat) => (
            <SeatSpot
              key={seat.playerId}
              seat={seat}
              scene={scene}
              player={players.get(seat.playerId)}
              name={nameOf(seat.playerId)}
              isSelf={false}
              timer={timerFor(seat)}
              cardSize="xs"
              variant="arc"
            />
          ))}
        </div>
      ) : (
        <ul className="scrollbar-none flex gap-1.5 overflow-x-auto pb-1" aria-label="Outros jogadores">
          {seats.map((seat) => (
            <StripSeat
              key={seat.playerId}
              seat={seat}
              scene={scene}
              name={nameOf(seat.playerId)}
              player={players.get(seat.playerId)}
              timer={timerFor(seat)}
            />
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="mx-auto mt-0.5 block text-[11px] font-semibold text-ivory/60 hover:text-ivory"
        aria-expanded={expanded}
      >
        {expanded ? 'Recolher' : 'Ver as mãos'}
      </button>
    </div>
  );
}

function StripSeat({
  seat,
  scene,
  name,
  player,
  timer,
}: {
  seat: SceneSeat;
  scene: Pick<Scene, 'turn' | 'phase'>;
  name: string;
  player: RoomPlayer | undefined;
  timer: TimerLike | null;
}) {
  const anchorRef = useAnchorRef<HTMLLIElement>(ANCHORS.seat(seat.seatIndex));
  const onTurn = scene.phase === 'PLAYER_TURNS' && scene.turn?.seatIndex === seat.seatIndex;
  const amount = circleAmount(seat);
  return (
    <li
      ref={anchorRef}
      className={clsx(
        'flex shrink-0 items-center gap-1.5 rounded-full bg-black/30 py-1 pl-1 pr-2.5',
        onTurn && 'ring-2 ring-gold/70',
        seat.leaving && 'opacity-60',
      )}
    >
      <TurnRing active={onTurn} timer={onTurn ? timer : null} size={22}>
        <Avatar
          name={name}
          src={player?.avatarUrl}
          size={22}
          dimmed={player ? !player.connected || player.away : false}
        />
      </TurnRing>
      <div className="leading-tight">
        <p className="max-w-20 truncate text-[11px] font-semibold">{name}</p>
        <p className="flex gap-1 text-[10px] tabular-nums text-ivory/75">
          {amount > 0 && <span className="text-gold">● {amount}</span>}
          {seat.hands.map((hand) => {
            const tone = hand.outcome ? outcomeTone(hand.outcome) : null;
            return (
              <span
                key={hand.id}
                className={clsx(
                  'rounded px-1 font-bold',
                  tone === 'win' && 'bg-success/80 text-ink',
                  tone === 'lose' && 'bg-danger/80 text-white',
                  tone === 'push' && 'bg-ivory/70 text-ink',
                  !tone && 'bg-black/40',
                )}
              >
                {hand.outcome && hand.payout !== null
                  ? outcomeLabel(hand.outcome, hand.bet, hand.payout)
                  : hand.cards.length > 0
                    ? totalLabel(hand)
                    : '…'}
              </span>
            );
          })}
          {seat.hands.length === 0 && amount === 0 && <span>{seat.stack}</span>}
        </p>
      </div>
    </li>
  );
}
