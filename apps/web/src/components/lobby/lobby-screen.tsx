'use client';

import { Card } from '@cardroom/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { OnlinePanel } from '@/components/players/online-panel';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { browserApi } from '@/lib/auth/client-token';
import { usePolling } from '@/lib/use-polling';
import { CreateRoomDialog } from './create-room-dialog';
import { JoinByCode } from './join-by-code';

const POLL_MS = 4_000;

export function LobbyScreen() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const rooms = usePolling(() => browserApi.publicRooms(), POLL_MS);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Salas</h1>
          <p className="mt-1 text-muted">Cria uma mesa para os teus amigos ou junta-te a uma sala aberta.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <JoinByCode />
          <Button size="lg" onClick={() => setCreating(true)}>
            Criar sala
          </Button>
        </div>
      </div>

      <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <OnlinePanel className="lg:sticky lg:top-24 lg:order-last" />
        <section aria-labelledby="public-rooms">
          <div className="flex items-center gap-3">
            <h2 id="public-rooms" className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
              Salas públicas
            </h2>
            {rooms.loading && <Spinner className="size-4 text-subtle" />}
          </div>

          {rooms.error ? (
            <p className="mt-4 text-sm text-danger">
              Não foi possível carregar as salas. A tentar novamente…
            </p>
          ) : rooms.data && rooms.data.length === 0 ? (
            <EmptyState onCreate={() => setCreating(true)} />
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {(rooms.data ?? []).map((room) => (
                <li key={room.code}>
                  <button
                    type="button"
                    onClick={() => router.push(`/room/${room.code}`)}
                    className="panel group flex w-full items-center gap-4 p-4 text-left transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-gold/40"
                  >
                    <div className="relative h-14 w-12 shrink-0" aria-hidden="true">
                      <Card faceDown size="xs" className="absolute left-0 top-0 -rotate-6" label="" />
                      <Card faceDown size="xs" className="absolute left-2 top-0.5 rotate-6" label="" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {room.gameName}
                        {room.inProgress && (
                          <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-success">
                            A decorrer · há lugar
                          </span>
                        )}
                      </p>
                      <p className="truncate text-sm text-muted">Anfitrião: {room.hostName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {room.playerCount}/{room.maxPlayers}
                      </p>
                      <p className="text-xs text-gold opacity-0 transition-opacity group-hover:opacity-100">
                        Entrar →
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CreateRoomDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="panel mt-4 flex flex-col items-center gap-4 px-6 py-14 text-center">
      <div className="relative h-24 w-32" aria-hidden="true">
        <Card id="AS" size="sm" className="absolute left-2 top-2 -rotate-12" label="" />
        <Card id="KH" size="sm" className="absolute left-9 top-0" label="" />
        <Card id="JK1" size="sm" className="absolute left-16 top-2 rotate-12" label="" />
      </div>
      <div>
        <p className="font-display text-xl font-semibold">Ainda não há mesas abertas</p>
        <p className="mt-1 text-sm text-muted">Cria uma e partilha o código com os teus amigos.</p>
      </div>
      <Button variant="secondary" onClick={onCreate}>
        Criar a primeira sala
      </Button>
    </div>
  );
}
