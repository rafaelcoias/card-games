import type { MatchHistoryEntry } from '@cardroom/shared';
import clsx from 'clsx';
import { Fragment } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { PlayerLink } from './player-link';

const dateFormat = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });

export interface MatchHistoryProps {
  matches: MatchHistoryEntry[] | null;
  failed?: boolean;
  emptyText: string;
}

/** Recent matches: finishing position, game, opponents (linked) and date. */
export function MatchHistory({ matches, failed = false, emptyText }: MatchHistoryProps) {
  return (
    <div className="panel p-5">
      <h2 className="font-semibold">Histórico</h2>
      {failed ? (
        <p className="mt-4 text-sm text-danger">Não foi possível carregar o histórico.</p>
      ) : !matches ? (
        <div className="mt-6 flex justify-center text-muted" role="status">
          <Spinner className="size-5" />
        </div>
      ) : matches.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {matches.map((match) => {
            const last = match.position !== null && match.position === match.players.length;
            return (
              <li key={match.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span
                  className={clsx(
                    'inline-flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                    match.position === 1
                      ? 'bg-gold text-gold-ink'
                      : last
                        ? 'bg-danger/20 text-danger'
                        : 'bg-surface-3 text-ivory',
                  )}
                  aria-label={match.position ? `${match.position}.º lugar` : 'Sem posição'}
                >
                  {match.position ?? '–'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{match.gameName}</p>
                  <p className="truncate text-sm text-muted">
                    {[...match.players]
                      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
                      .map((p, i) => (
                        <Fragment key={p.username}>
                          {i > 0 && ' · '}
                          <PlayerLink username={p.username} />
                        </Fragment>
                      ))}
                  </p>
                </div>
                <time className="text-xs text-subtle" dateTime={match.startedAt}>
                  {dateFormat.format(new Date(match.startedAt))}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
