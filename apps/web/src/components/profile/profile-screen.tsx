'use client';

import type { MatchHistoryEntry } from '@cardroom/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/app/profile-context';
import { MatchHistory } from '@/components/players/match-history';
import { playerHref } from '@/components/players/player-link';
import { StatsSummary } from '@/components/players/stats-summary';
import { usePlayer } from '@/components/players/use-player';
import { browserApi } from '@/lib/auth/client-token';
import { ProfileForm } from './profile-form';

const memberSince = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });

/** Own profile: edit form, plus the same stats/history everyone sees on the public page. */
export function ProfileScreen() {
  const profile = useProfile();
  return profile.guest ? <GuestProfile /> : <AccountProfile />;
}

function AccountProfile() {
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

/**
 * A guest has no public profile: their own history comes from `/me/matches`,
 * and creating an account keeps it (the account is attached to this identity).
 */
function GuestProfile() {
  const profile = useProfile();
  const [matches, setMatches] = useState<{ list: MatchHistoryEntry[] | null; failed: boolean }>({
    list: null,
    failed: false,
  });
  useEffect(() => {
    let active = true;
    browserApi
      .history()
      .then((list) => active && setMatches({ list, failed: false }))
      .catch(() => active && setMatches({ list: [], failed: true }));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[380px_1fr]">
      <section className="panel h-fit p-6" aria-labelledby="profile-heading">
        <h1 id="profile-heading" className="font-display text-3xl font-semibold tracking-tight">
          Convidado
        </h1>
        <p className="mt-1 text-sm text-muted">
          Estás a jogar sem conta. O teu nome não fica reservado e, se saíres, não voltas a esta sessão.
        </p>
        <Link
          href="/register"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gold font-semibold text-gold-ink hover:bg-gold-strong"
        >
          Criar conta e guardar o histórico
        </Link>
        <div className="mt-6">
          <ProfileForm initial={profile} submitLabel="Mudar de nome" />
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-label="Estatísticas e histórico">
        <StatsSummary stats={profile.stats} />
        <MatchHistory
          matches={matches.list}
          failed={matches.failed}
          emptyText="Ainda não jogaste nenhuma partida. A mesa espera por ti!"
        />
      </section>
    </div>
  );
}
