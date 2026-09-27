'use client';

import type { OnlinePlayer, PresenceStatus } from '@cardroom/shared';
import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/app/profile-context';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { browserApi } from '@/lib/auth/client-token';
import { useRealtime } from '@/lib/realtime/store';
import { usePolling } from '@/lib/use-polling';
import { playerHref } from './player-link';
import { OnlineDot, presenceLabel } from './presence';

const REFRESH_MS = 10_000;
const COLLAPSED = 8;

const GROUPS: { status: PresenceStatus; title: string }[] = [
  { status: 'playing', title: 'A jogar' },
  { status: 'room', title: 'Em salas' },
  { status: 'lobby', title: 'No lobby' },
];

/** Who is online right now and where they are. */
export function OnlinePanel({ className }: { className?: string }) {
  const me = useProfile();
  const presence = usePolling(() => browserApi.presence(), REFRESH_MS);
  const connected = useRealtime((s) => s.status === 'connected');
  const [expanded, setExpanded] = useState(false);

  // Our own socket just (re)connected: we are online now, refresh immediately.
  const { reload } = presence;
  useEffect(() => {
    if (connected) reload();
  }, [connected, reload]);

  const players = presence.data?.players ?? [];
  const visible = expanded ? players : players.slice(0, COLLAPSED);

  return (
    <section className={clsx('panel p-4', className)} aria-labelledby="online-heading">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-success" />
        </span>
        <h2 id="online-heading" className="font-semibold">
          Online agora
        </h2>
        <span className="ml-auto rounded-full bg-white/8 px-2 text-sm font-semibold tabular-nums">
          {presence.data?.count ?? '–'}
        </span>
      </div>

      {presence.loading && !presence.data ? (
        <div className="flex justify-center py-6 text-subtle" role="status">
          <Spinner className="size-4" />
        </div>
      ) : presence.error && !presence.data ? (
        <p className="mt-3 text-sm text-danger">Não foi possível ver quem está online.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {GROUPS.map(({ status, title }) => {
            const group = visible.filter((p) => p.status === status);
            if (group.length === 0) return null;
            return (
              <div key={status}>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-subtle">
                  {title}
                </h3>
                <ul className="flex flex-col">
                  {group.map((player) => (
                    <OnlineRow key={player.id} player={player} isMe={player.id === me.id} />
                  ))}
                </ul>
              </div>
            );
          })}
          {players.length > COLLAPSED && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="self-start text-sm font-semibold text-gold hover:text-gold-strong"
            >
              {expanded ? 'Mostrar menos' : `Ver todos (${players.length})`}
            </button>
          )}
          {players.length <= 1 && (
            <p className="text-sm text-muted">Por agora estás só tu. Partilha o link com os teus amigos!</p>
          )}
        </div>
      )}
    </section>
  );
}

function OnlineRow({ player, isMe }: { player: OnlinePlayer; isMe: boolean }) {
  return (
    <li className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
      <Link href={playerHref(player.username)} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative shrink-0">
          <Avatar name={player.username} src={player.avatarUrl} size={32} />
          <OnlineDot
            online
            playing={player.status === 'playing'}
            className="absolute -bottom-0.5 -right-0.5 size-2.5"
          />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {player.username} {isMe && <span className="text-subtle">(tu)</span>}
          </span>
          <span className="block truncate text-xs text-muted">{presenceLabel(player)}</span>
        </span>
      </Link>
      {player.roomCode && !isMe && (
        <Link
          href={`/room/${player.roomCode}`}
          className="shrink-0 rounded-lg border border-line-strong px-2 py-1 text-xs font-semibold hover:border-gold/60 hover:text-gold"
        >
          Entrar
        </Link>
      )}
    </li>
  );
}
