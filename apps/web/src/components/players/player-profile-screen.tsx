'use client';

import Link from 'next/link';
import { useProfile } from '@/components/app/profile-context';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { ChipsBadge } from './chips-badge';
import { MatchHistory } from './match-history';
import { OnlineDot, presenceLabel } from './presence';
import { StatsSummary } from './stats-summary';
import { usePlayer } from './use-player';

const memberSince = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });

export function PlayerProfileScreen({ username }: { username: string }) {
  const me = useProfile();
  const state = usePlayer(username);

  if (state.kind === 'loading') {
    return (
      <div className="flex justify-center py-32 text-muted" role="status">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="font-display text-2xl font-semibold">
          {state.kind === 'notFound' ? 'Jogador não encontrado' : 'Não foi possível carregar o perfil'}
        </p>
        <Link href="/players" className="font-semibold text-gold hover:text-gold-strong">
          ← Procurar jogadores
        </Link>
      </div>
    );
  }

  const { player } = state;
  const isMe = player.id === me.id;
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="panel h-fit p-6" aria-labelledby="player-heading">
        <div className="relative w-fit">
          <Avatar name={player.username} src={player.avatarUrl} size={72} />
          <OnlineDot
            online={player.online}
            playing={player.presence?.status === 'playing'}
            className="absolute bottom-1 right-1 size-3.5"
          />
        </div>
        <h1
          id="player-heading"
          className="mt-4 break-words font-display text-3xl font-semibold tracking-tight"
        >
          {player.username}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Membro desde {memberSince.format(new Date(player.createdAt))}
        </p>
        <div className="mt-3">
          <ChipsBadge chips={player.chips} />
        </div>
        <p className="mt-3 text-sm font-medium" role="status">
          {player.presence ? (
            <span className="text-success">Online · {presenceLabel(player.presence)}</span>
          ) : (
            <span className="text-subtle">Offline</span>
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {player.presence?.roomCode && !isMe && (
            <Link
              href={`/room/${player.presence.roomCode}`}
              className="inline-flex h-10 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-gold-ink hover:bg-gold-strong"
            >
              Juntar-me à sala
            </Link>
          )}
          {isMe && (
            <Link
              href="/profile"
              className="inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-white/5"
            >
              Editar perfil
            </Link>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-label="Estatísticas e histórico">
        <StatsSummary stats={player.stats} />
        <MatchHistory
          matches={player.recentMatches}
          emptyText={isMe ? 'Ainda não jogaste nenhuma partida.' : 'Ainda não jogou nenhuma partida.'}
        />
      </section>
    </div>
  );
}
