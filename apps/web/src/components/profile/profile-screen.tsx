'use client';

import Link from 'next/link';
import { useProfile } from '@/components/app/profile-context';
import { MatchHistory } from '@/components/players/match-history';
import { playerHref } from '@/components/players/player-link';
import { StatsSummary } from '@/components/players/stats-summary';
import { usePlayer } from '@/components/players/use-player';
import { ProfileForm } from './profile-form';

const memberSince = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });

/** Own profile: edit form, plus the same stats/history everyone sees on the public page. */
export function ProfileScreen() {
  const profile = useProfile();
  const state = usePlayer(profile.username);
  const player = state.kind === 'ready' ? state.player : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[380px_1fr]">
      <section className="panel h-fit p-6" aria-labelledby="profile-heading">
        <h1 id="profile-heading" className="font-display text-3xl font-semibold tracking-tight">
          Perfil
        </h1>
        <p className="mt-1 text-sm text-muted">
          Membro desde {memberSince.format(new Date(profile.createdAt))}
        </p>
        <div className="mt-6">
          <ProfileForm initial={profile} submitLabel="Guardar alterações" />
        </div>
        <Link
          href={playerHref(profile.username)}
          className="mt-4 inline-block text-sm font-semibold text-gold hover:text-gold-strong"
        >
          Ver o meu perfil público →
        </Link>
      </section>

      <section className="flex flex-col gap-4" aria-label="Estatísticas e histórico">
        <StatsSummary stats={player?.stats ?? profile.stats} />
        <MatchHistory
          matches={player?.recentMatches ?? null}
          failed={state.kind === 'error'}
          emptyText="Ainda não jogaste nenhuma partida. A mesa espera por ti!"
        />
      </section>
    </div>
  );
}
