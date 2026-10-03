'use client';

import type { RoomPlayer, RoomState } from '@cardroom/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { SeatingPresentation } from '@/games/types';
import { describeError } from '@/lib/errors';
import type { RoomCommands } from '@/lib/realtime/socket-provider';
import { toast } from '@/lib/toast';

/**
 * Where seat `index` of `count` sits around the table, as fractions of the
 * square (0–1): the first at the bottom, the next ones counter-clockwise —
 * the order of play of a Sueca table (South, East, North, West).
 */
function seatPosition(index: number, count: number): { x: number; y: number } {
  const angle = Math.PI / 2 - (index * 2 * Math.PI) / count;
  return { x: 0.5 + 0.33 * Math.cos(angle), y: 0.5 + 0.38 * Math.sin(angle) };
}

/**
 * Games with named seats (core §1, UI §1): the table seen from above. Tap a
 * free seat to sit there — and so pick your partner. The host swaps any two
 * seats, or draws them all.
 */
export function SeatPicker({
  room,
  selfId,
  seating,
  isHost,
  onKick,
  commands,
}: {
  room: Pick<RoomState, 'players' | 'hostId'>;
  selfId: string;
  seating: SeatingPresentation;
  isHost: boolean;
  onKick: (player: RoomPlayer) => void;
  commands: Pick<RoomCommands, 'takeSeat' | 'swapSeats' | 'shuffleSeats'>;
}) {
  const [swapping, setSwapping] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const count = seating.seats.length;
  const teamOf = (seat: string) =>
    Object.entries(seating.teams).find(([, seats]) => seats.includes(seat))?.[0];

  const run = async (action: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>) => {
    setBusy(true);
    const ack = await action();
    setBusy(false);
    if (!ack.ok && ack.error) toast.error(describeError(ack.error));
  };

  const tap = (index: number, player: RoomPlayer | null) => {
    if (swapping) {
      if (picked === null) {
        setPicked(index);
        return;
      }
      if (picked !== index) void run(() => commands.swapSeats(picked, index));
      setPicked(null);
      setSwapping(false);
      return;
    }
    if (!player) void run(() => commands.takeSeat(index));
  };

  // Partners face each other: a line of their team's colour joins their seats across the table.
  const lines = Object.entries(seating.teams).flatMap(([team, seats]) => {
    const [a, b] = seats.map((seat) => seatPosition(seating.seats.indexOf(seat), count));
    return a && b ? [{ team, a, b }] : [];
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto aspect-square w-full max-w-[440px]">
        <div
          aria-hidden="true"
          className="felt absolute inset-[17%] rounded-[28%] shadow-[inset_0_0_40px_rgb(0_0_0/0.35)]"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          className="pointer-events-none absolute inset-0 size-full"
        >
          {lines.map(({ team, a, b }) => (
            <line
              key={team}
              x1={a.x * 100}
              y1={a.y * 100}
              x2={b.x * 100}
              y2={b.y * 100}
              stroke={seating.teamColors[team]}
              strokeWidth="1.2"
              strokeDasharray="2 2.4"
              opacity="0.75"
            />
          ))}
        </svg>
        {seating.seats.map((seat, index) => {
          const player = room.players.find((p) => p.seat === index) ?? null;
          const { x, y } = seatPosition(index, count);
          const team = teamOf(seat);
          const color = team ? seating.teamColors[team] : undefined;
          return (
            <div
              key={seat}
              className="absolute w-[32%] min-w-[112px] max-w-[150px] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
            >
              <SeatSlot
                label={seating.labels[seat] ?? seat}
                color={color}
                player={player}
                isSelf={player?.id === selfId}
                isHost={player?.id === room.hostId}
                picked={picked === index}
                swapping={swapping}
                disabled={busy || (!swapping && player !== null)}
                canKick={isHost && !swapping && player !== null && player.id !== selfId}
                onTap={() => tap(index, player)}
                onKick={() => player && onKick(player)}
              />
            </div>
          );
        })}
      </div>
      <ul className="-mt-2 flex flex-wrap justify-center gap-1.5 text-xs font-semibold">
        {Object.entries(seating.teams).map(([team, seats]) => (
          <li key={team} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: seating.teamColors[team] }}
            />
            {seating.teamNames[team]}
            <span className="font-normal text-muted">
              {seats.map((seat) => seating.labels[seat]).join(' e ')}
            </span>
          </li>
        ))}
      </ul>
      {isHost && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            size="sm"
            variant={swapping ? 'primary' : 'secondary'}
            onClick={() => {
              setSwapping((on) => !on);
              setPicked(null);
            }}
            disabled={room.players.length < 2}
          >
            {swapping ? 'Cancelar troca' : 'Trocar lugares'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy && !swapping}
            onClick={() => void run(commands.shuffleSeats)}
            disabled={swapping || room.players.length < 2}
          >
            Sortear equipas
          </Button>
          {swapping && (
            <p className="w-full text-center text-xs text-muted" role="status">
              {picked === null ? 'Toca no primeiro lugar…' : '…e agora no lugar para onde vai.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SeatSlot({
  label,
  color,
  player,
  isSelf,
  isHost,
  picked,
  swapping,
  disabled,
  canKick,
  onTap,
  onKick,
}: {
  label: string;
  color: string | undefined;
  player: RoomPlayer | null;
  isSelf: boolean;
  isHost: boolean;
  picked: boolean;
  swapping: boolean;
  disabled: boolean;
  canKick: boolean;
  onTap: () => void;
  onKick: () => void;
}) {
  const state = !player
    ? null
    : !player.connected
      ? 'Desligado'
      : isHost
        ? 'Anfitrião'
        : player.ready
          ? 'Pronto'
          : 'A preparar-se';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onTap}
        disabled={disabled}
        aria-pressed={swapping ? picked : undefined}
        aria-label={
          player
            ? `${label}: ${isSelf ? 'tu' : player.username}${swapping ? '. Trocar' : ''}`
            : `${label}: lugar livre. ${swapping ? 'Trocar' : 'Sentar aqui'}`
        }
        className={clsx(
          'flex w-full items-center gap-2 rounded-2xl border-2 px-2.5 py-2 text-left transition-colors disabled:cursor-default',
          player ? 'bg-surface-2' : 'border-dashed bg-ink/50 hover:bg-white/5',
          picked && 'ring-2 ring-gold',
          swapping && 'hover:ring-2 hover:ring-gold/60',
          isSelf && 'bg-gold/10',
        )}
        style={{ borderColor: player ? color : undefined }}
      >
        {player ? (
          <>
            <Avatar name={player.username} src={player.avatarUrl} size={32} dimmed={!player.connected} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {player.username}
                {isSelf && <span className="font-normal text-subtle"> (tu)</span>}
              </span>
              <span
                className={clsx(
                  'block truncate text-[11px]',
                  !player.connected ? 'text-danger' : player.ready || isHost ? 'text-success' : 'text-subtle',
                )}
              >
                {isHost && '👑 '}
                {state}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-center text-sm text-subtle">
            {swapping ? 'Lugar livre' : 'Sentar aqui'}
          </span>
        )}
      </button>
      <span
        className="pointer-events-none absolute -top-2 left-3 rounded-full bg-ink px-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: color ?? undefined }}
      >
        {label}
      </span>
      {canKick && player && (
        <button
          type="button"
          onClick={onKick}
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-surface-3 text-[11px] text-muted shadow hover:bg-danger/30 hover:text-danger"
          aria-label={`Expulsar ${player.username}`}
          title={`Expulsar ${player.username}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}
