'use client';

import { winRate, type PlayerSummary } from '@cardroom/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Spinner } from '@/components/ui/spinner';
import { browserApi } from '@/lib/auth/client-token';
import { playerHref } from './player-link';
import { OnlineDot } from './presence';

const DEBOUNCE_MS = 250;
const VALID = /^[A-Za-z0-9_]{0,20}$/;

type Results = { query: string; players: PlayerSummary[] | null; failed: boolean };

export function PlayersScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [input, setInput] = useState(params.get('q') ?? '');
  const query = input.trim();
  const valid = VALID.test(query);
  const [results, setResults] = useState<Results>({ query: '\u0000', players: null, failed: false });

  useEffect(() => {
    if (!valid) return;
    let active = true;
    const timer = window.setTimeout(() => {
      router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false });
      browserApi
        .players(query)
        .then((players) => active && setResults({ query, players, failed: false }))
        .catch(() => active && setResults({ query, players: null, failed: true }));
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, valid, pathname, router]);

  const current = results.query === query ? results : null;
  const players = current?.players ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">Jogadores</h1>
      <p className="mt-1 text-muted">Procura amigos e vê as estatísticas de cada um.</p>

      <div className="relative mt-6">
        <label htmlFor="player-search" className="sr-only">
          Procurar por nome de utilizador
        </label>
        <input
          id="player-search"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Procurar por nome…"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={!valid || undefined}
          className="h-12 w-full rounded-xl border border-line-strong bg-ink/60 px-4 text-[15px] outline-none placeholder:text-subtle focus:border-gold/70"
        />
        {valid && !current && (
          <Spinner className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
        )}
      </div>
      {!valid && <p className="mt-2 text-sm text-danger">Os nomes só têm letras, números e _.</p>}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-[0.14em] text-subtle">
        {query ? 'Resultados' : 'Mais ativos'}
      </h2>
      {current?.failed ? (
        <p className="mt-4 text-sm text-danger">Não foi possível procurar. Tenta de novo.</p>
      ) : players && players.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {query ? `Ninguém com um nome começado por “${query}”.` : 'Ainda não há jogadores.'}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2" aria-busy={!players}>
          {(players ?? []).map((player) => (
            <li key={player.id}>
              <Link
                href={playerHref(player.username)}
                className="panel flex items-center gap-4 p-3 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-gold/40"
              >
                <span className="relative">
                  <Avatar name={player.username} src={player.avatarUrl} size={44} />
                  <OnlineDot online={player.online} className="absolute -bottom-0.5 -right-0.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{player.username}</span>
                  <span className="block text-sm text-muted">
                    {player.online ? 'Online' : 'Offline'} · {player.stats.played}{' '}
                    {player.stats.played === 1 ? 'partida' : 'partidas'}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-xl font-semibold tabular-nums">
                    {winRate(player.stats)}%
                  </span>
                  <span className="block text-xs text-subtle">vitórias</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
