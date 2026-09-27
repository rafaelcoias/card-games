import { winRate, type PlayerStats } from '@cardroom/shared';
import { findGameClient as game } from '@/games/registry';

/** Headline numbers plus a per-game breakdown. */
export function StatsSummary({ stats }: { stats: PlayerStats }) {
  const games = Object.entries(stats.byGame)
    .filter(([, s]) => s.played > 0)
    .sort(([, a], [, b]) => b.played - a.played);

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Partidas" value={stats.played} />
        <Stat label="Vitórias" value={stats.wins} />
        <Stat label="Derrotas" value={stats.losses} />
        <Stat label="% vitórias" value={`${winRate(stats)}%`} />
      </dl>
      {games.length > 1 && (
        <ul className="panel divide-y divide-line px-5" aria-label="Por jogo">
          {games.map(([gameId, s]) => (
            <li key={gameId} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="flex-1 font-medium">{game(gameId)?.name ?? gameId}</span>
              <span className="tabular-nums text-muted">
                {game(gameId)?.resultStyle === 'survival'
                  ? `${s.played} partidas · ${s.played - s.losses} sobreviveu · ${s.losses} perdeu`
                  : `${s.played} partidas · ${s.wins} V · ${s.losses} D · ${winRate(s)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
