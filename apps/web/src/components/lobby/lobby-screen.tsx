'use client';

import type { PublicRoomSummary } from '@cardroom/shared';
import { Card } from '@cardroom/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { browserApi } from '@/lib/auth/client-token';
import { CreateRoomDialog } from './create-room-dialog';
import { JoinByCode } from './join-by-code';

const POLL_MS = 4_000;

export function LobbyScreen() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const rooms = usePublicRooms();

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

      <section className="mt-10" aria-labelledby="public-rooms">
        <div className="flex items-center gap-3">
          <h2 id="public-rooms" className="text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
            Salas públicas
          </h2>
          {rooms.loading && <Spinner className="size-4 text-subtle" />}
        </div>

        {rooms.error ? (
          <p className="mt-4 text-sm text-danger">Não foi possível carregar as salas. A tentar novamente…</p>
        ) : rooms.data && rooms.data.length === 0 ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    <p className="font-semibold">{room.gameName}</p>
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

function usePublicRooms() {
  const [state, setState] = useState<{ data: PublicRoomSummary[] | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: true,
  });
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const data = await browserApi.publicRooms();
        if (active) setState({ data, error: false, loading: false });
      } catch {
        if (active) setState((s) => ({ ...s, error: true, loading: false }));
      }
      if (active && document.visibilityState === 'visible')
        timer = window.setTimeout(() => void load(), POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return state;
}
