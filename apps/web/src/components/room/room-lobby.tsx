'use client';

import type { RoomPlayer, RoomState } from '@cardroom/shared';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { findGameClient } from '@/games/registry';
import { formatScore } from '@/games/score';
import type { GameClientDefinition } from '@/games/types';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';
import { PlayerLink } from '@/components/players/player-link';
import { ChatPanel } from './chat-panel';
import { MicButton, MicIcon } from './mic-button';

export function RoomLobby({ room, selfId }: { room: RoomState; selfId: string }) {
  const router = useRouter();
  const commands = useRoomCommands();
  const [busy, setBusy] = useState<string | null>(null);
  const game = findGameClient(room.gameId);
  const isHost = room.hostId === selfId;
  const me = room.players.find((p) => p.id === selfId);
  const others = room.players.filter((p) => p.id !== room.hostId);
  const waitingFor = others.filter((p) => !p.ready || !p.connected);
  const minPlayers = game?.minPlayers ?? 2;
  const canStart = room.players.length >= minPlayers && waitingFor.length === 0;
  const session = room.lifecycle === 'SESSION';

  const run = async (
    key: string,
    action: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>,
  ) => {
    setBusy(key);
    const ack = await action();
    setBusy(null);
    if (!ack.ok && ack.error) toast.error(describeError(ack.error));
    return ack.ok;
  };

  const leave = async () => {
    if (await run('leave', commands.leaveRoom)) {
      useRealtime.getState().leaveRoom();
      gameFeed.reset();
      router.push('/lobby');
    }
  };

  const seats = Array.from(
    { length: room.maxPlayers },
    (_, seat) => room.players.find((p) => p.seat === seat) ?? null,
  );

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
              {room.isPrivate ? 'Sala privada' : 'Sala pública'}
            </p>
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{room.gameName}</h1>
            <SettingsSummary room={room} game={game} />
          </div>
          <div className="flex items-center gap-2">
            <MicButton size="lg" className="border border-line-strong" />
            <ShareCode code={room.code} />
          </div>
        </div>

        {room.lastResult && room.lastResult.standings.length > 0 && (
          <div className="panel flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 text-sm">
            <span className="font-semibold text-gold">Última partida</span>
            {room.lastResult.standings.map((s) => (
              <span key={s.playerId} className={s.outcome === 'LOSER' ? 'text-danger' : 'text-ivory/85'}>
                {s.position !== undefined ? (
                  <span className="tabular-nums text-subtle">{s.position}.º </span>
                ) : null}
                {s.username}
                {s.score !== undefined && (
                  <span className="tabular-nums text-subtle"> · {formatScore(game, s.score)}</span>
                )}
                {s.position === undefined && s.outcome === 'LOSER' && ' · perdeu'}
              </span>
            ))}
          </div>
        )}

        <section className="panel p-5" aria-labelledby="players-heading">
          <div className="flex items-center justify-between">
            <h2 id="players-heading" className="font-semibold">
              Jogadores{' '}
              <span className="text-subtle tabular-nums">
                {room.players.length}/{room.maxPlayers}
              </span>
            </h2>
            {!canStart && (
              <p className="text-sm text-muted">
                {room.players.length < minPlayers
                  ? `Faltam ${minPlayers - room.players.length} jogador(es)`
                  : `À espera de ${waitingFor.map((p) => p.username).join(', ')}`}
              </p>
            )}
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {seats.map((player, seat) => (
              <li key={seat}>
                {player ? (
                  <PlayerRow
                    player={player}
                    isHost={player.id === room.hostId}
                    isSelf={player.id === selfId}
                    canKick={isHost && player.id !== selfId}
                    onKick={() => void run(`kick-${player.id}`, () => commands.kick(player.id))}
                  />
                ) : (
                  <div className="flex h-[60px] items-center rounded-xl border border-dashed border-line-strong px-4 text-sm text-subtle">
                    Lugar livre
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          {isHost ? (
            <Button
              size="lg"
              disabled={!canStart}
              loading={busy === 'start'}
              onClick={() => void run('start', commands.startMatch)}
            >
              {session ? 'Abrir a mesa' : 'Começar partida'}
            </Button>
          ) : (
            <Button
              size="lg"
              variant={me?.ready ? 'secondary' : 'primary'}
              loading={busy === 'ready'}
              onClick={() => void run('ready', () => commands.setReady(!me?.ready))}
            >
              {me?.ready ? 'Afinal, não estou pronto' : 'Estou pronto'}
            </Button>
          )}
          <Button size="lg" variant="ghost" loading={busy === 'leave'} onClick={() => void leave()}>
            Sair da sala
          </Button>
          {isHost && (
            <p className="text-sm text-muted">
              {session
                ? 'Abres quando todos estiverem prontos; quem chegar depois senta-se com a mesa a decorrer.'
                : 'Começas quando todos estiverem prontos.'}
            </p>
          )}
        </div>
      </div>

      <ChatPanel className="h-[420px] lg:h-[calc(100dvh-10rem)] lg:max-h-[640px]" />
    </div>
  );
}

function PlayerRow({
  player,
  isHost,
  isSelf,
  canKick,
  onKick,
}: {
  player: RoomPlayer;
  isHost: boolean;
  isSelf: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  const state = !player.connected
    ? 'Desligado'
    : isHost
      ? 'Anfitrião'
      : player.ready
        ? 'Pronto'
        : 'A preparar-se';
  return (
    <div className="flex h-[60px] items-center gap-3 rounded-xl bg-surface-2 px-3">
      <Avatar name={player.username} src={player.avatarUrl} size={36} dimmed={!player.connected} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          <PlayerLink username={player.username} guest={player.guest} />{' '}
          {isSelf && <span className="text-subtle">(tu)</span>}
          {player.voice && (
            <span className="ml-1 inline-flex align-[-2px] text-gold" title="Microfone ligado">
              <MicIcon className="size-4" />
              <span className="sr-only">Microfone ligado</span>
            </span>
          )}
        </p>
        <p
          className={clsx(
            'text-xs',
            !player.connected ? 'text-danger' : player.ready || isHost ? 'text-success' : 'text-subtle',
          )}
        >
          {isHost && '👑 '}
          {state}
        </p>
      </div>
      {canKick && (
        <button
          type="button"
          onClick={onKick}
          className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-danger/15 hover:text-danger"
          aria-label={`Expulsar ${player.username}`}
        >
          Expulsar
        </button>
      )}
    </div>
  );
}

function ShareCode({ code }: { code: string }) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copy(code, 'Código')}
        className="rounded-xl border border-line-strong bg-ink/60 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.3em] hover:border-gold/60"
        aria-label={`Código da sala ${code.split('').join(' ')}. Copiar`}
      >
        {code}
      </button>
      <Button variant="secondary" onClick={() => void copy(`${window.location.origin}/room/${code}`, 'Link')}>
        Copiar link
      </Button>
    </div>
  );
}

/** The table's rules, read from the game's settings metadata, visible to everyone before starting. */
function SettingsSummary({ room, game }: { room: RoomState; game: GameClientDefinition | undefined }) {
  const settings = (game?.settings ?? []).flatMap((field) => {
    const option = field.options.find((o) => o.value === room.config[field.key]);
    return option ? [{ key: field.key, label: field.label, value: option.label }] : [];
  });
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
      <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-muted">
        Até {room.maxPlayers} jogadores
      </span>
      {settings.map((s) => (
        <span key={s.key} className="rounded-full bg-white/5 px-2.5 py-0.5 text-muted">
          {s.label}: <span className="text-ivory/90">{s.value}</span>
        </span>
      ))}
    </div>
  );
}
