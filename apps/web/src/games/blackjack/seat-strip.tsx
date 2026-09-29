'use client';

import type { RoomPlayer } from '@cardroom/shared';
import { cardHeight, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { Avatar } from '@/components/ui/avatar';
import { TurnRing, type TimerLike } from '../shared/turn-ring';
import { outcomeTone, totalLabel } from './copy';
import { Hand } from './hand';
import { ANCHORS, type Scene, type SceneSeat } from './scene';
import { circleAmount } from './seat';

/**
 * Phones (UI §11): seven places do not fit in an arc, so the other players sit
 * in a compact strip — their cards, chips and totals — that scrolls sideways.
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
  if (seats.length === 0) return null;
  return (
    // Room above the cards for the result tags, which sit on top of each hand.
    <ul
      className="scrollbar-none flex w-full items-end gap-2 overflow-x-auto px-1 pb-1 pt-2.5"
      aria-label="Outros jogadores"
    >
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
      className={clsx('flex shrink-0 flex-col items-center gap-1', seat.leaving && 'opacity-60')}
    >
      <div className="flex items-end gap-1.5" style={{ minHeight: cardHeight('xs') }}>
        {seat.hands.map((hand, handIndex) => (
          <Hand
            key={hand.id}
            hand={hand}
            size="xs"
            active={onTurn && scene.turn?.handIndex === handIndex}
            showTotal={false}
          />
        ))}
      </div>
      <div
        className={clsx(
          'flex items-center gap-1.5 rounded-full bg-black/30 py-1 pl-1 pr-2.5',
          onTurn && 'ring-2 ring-gold/70',
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
              if (hand.cards.length === 0) return null;
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
                  {totalLabel(hand)}
                </span>
              );
            })}
            {seat.hands.length === 0 && amount === 0 && <span>{seat.stack}</span>}
          </p>
        </div>
      </div>
    </li>
  );
}
