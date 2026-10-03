import type { MatchHistoryEntry, MatchHistoryPlayer } from '@cardroom/shared';
import clsx from 'clsx';
import { Fragment } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { findGameClient } from '@/games/registry';
import { signed } from '@/games/score';
import { PlayerLink } from './player-link';

const dateFormat = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' });

export interface MatchHistoryProps {
  matches: MatchHistoryEntry[] | null;
  failed?: boolean;
  emptyText: string;
}

/** Badge for the viewer's result: position, or the outcome in games without positions. */
function resultBadge(match: MatchHistoryEntry): {
  text: string;
  label: string;
  tone: 'win' | 'lose' | 'neutral';
} {
  if (match.position !== null) {
    const tone = match.outcome === 'WINNER' ? 'win' : match.outcome === 'LOSER' ? 'lose' : 'neutral';
    return { text: String(match.position), label: `${match.position}.º lugar`, tone };
  }
  if (match.outcome === 'LOSER') return { text: '✗', label: 'Perdeu', tone: 'lose' };
  if (match.outcome === 'SURVIVOR') return { text: '✓', label: 'Sobreviveu', tone: 'neutral' };
  if (match.outcome === 'WINNER') return { text: '1', label: 'Venceu', tone: 'win' };
  return { text: '–', label: 'Sem resultado', tone: 'neutral' };
}

/** Best first: by position, else winners first (team games), else by score (fewest points first). */
function byResult(a: MatchHistoryPlayer, b: MatchHistoryPlayer): number {
  const won = (p: MatchHistoryPlayer) => (p.outcome === 'WINNER' ? 0 : 1);
  return (a.position ?? 99) - (b.position ?? 99) || won(a) - won(b) || (a.score ?? 0) - (b.score ?? 0);
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
            const badge = resultBadge(match);
            const style = findGameClient(match.gameId)?.resultStyle;
            const chips = style === 'chips' || style === 'points';
            return (
              <li key={match.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span
                  className={clsx(
                    'inline-flex size-9 items-center justify-center rounded-full text-sm font-bold tabular-nums',
                    badge.tone === 'win'
                      ? 'bg-gold text-gold-ink'
                      : badge.tone === 'lose'
                        ? 'bg-danger/20 text-danger'
                        : 'bg-surface-3 text-ivory',
                  )}
                  aria-label={badge.label}
                  title={badge.label}
                >
                  {badge.text}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{match.gameName}</p>
                  <p className="truncate text-sm text-muted">
                    {[...match.players].sort(byResult).map((p, i) => (
                      <Fragment key={p.username}>
                        {i > 0 && ' · '}
                        <PlayerLink username={p.username} guest={p.guest} />
                        {p.score !== null && (
                          <span className={p.outcome === 'LOSER' ? 'text-danger' : 'text-subtle'}>
                            {' '}
                            ({chips ? signed(p.score) : p.score})
                          </span>
                        )}
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
