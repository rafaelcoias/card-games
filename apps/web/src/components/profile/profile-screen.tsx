'use client';

import type { MatchHistoryEntry } from '@cardroom/shared';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/app/profile-context';
import { Spinner } from '@/components/ui/spinner';
import { browserApi } from '@/lib/auth/client-token';
import { ProfileForm } from './profile-form';

const dateFormat = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });

export function ProfileScreen() {
  const profile = useProfile();
  const [history, setHistory] = useState<MatchHistoryEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    browserApi
      .history()
      .then(setHistory)
      .catch(() => setFailed(true));
  }, []);

  const played = history?.length ?? 0;
  const wins = history?.filter((m) => m.position === 1).length ?? 0;
  const losses = history?.filter((m) => m.position !== null && m.position === m.players.length).length ?? 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[380px_1fr]">
      <section className="panel h-fit p-6" aria-labelledby="profile-heading">
        <h1 id="profile-heading" className="font-display text-3xl font-semibold tracking-tight">
          Perfil
        </h1>
        <p className="mt-1 text-sm text-muted">
          Membro desde{' '}
          {new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(
            new Date(profile.createdAt),
          )}
        </p>
        <div className="mt-6">
          <ProfileForm initial={profile} submitLabel="Guardar alterações" />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="history-heading">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Partidas" value={played} />
          <Stat label="Vitórias" value={wins} />
          <Stat label="Derrotas" value={losses} />
        </div>
        <div className="panel p-5">
          <h2 id="history-heading" className="font-semibold">
            Histórico
          </h2>
          {failed ? (
            <p className="mt-4 text-sm text-danger">Não foi possível carregar o histórico.</p>
          ) : !history ? (
            <div className="mt-6 flex justify-center text-muted">
              <Spinner className="size-5" />
            </div>
          ) : history.length === 0 ? (
            <p className="mt-4 text-sm text-muted">
              Ainda não jogaste nenhuma partida. A mesa espera por ti!
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {history.map((match) => (
                <li key={match.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span
                    className={`inline-flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                      match.position === 1 ? 'bg-gold text-gold-ink' : 'bg-surface-3 text-ivory'
                    }`}
                    aria-label={match.position ? `${match.position}.º lugar` : 'Sem posição'}
                  >
                    {match.position ?? '–'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{match.gameName}</p>
                    <p className="truncate text-sm text-muted">
                      {match.players
                        .slice()
                        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
                        .map((p) => p.username)
                        .join(' · ')}
                    </p>
                  </div>
                  <time className="text-xs text-subtle" dateTime={match.startedAt}>
                    {dateFormat.format(new Date(match.startedAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
