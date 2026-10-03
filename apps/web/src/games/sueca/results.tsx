'use client';

import { PLAY_ORDER, teamOf, type HandSummary, type Seat, type Team } from '@cardroom/sueca';
import type { MatchResult } from '@cardroom/shared';
import { HandsTable } from './panels';

interface SuecaSummary {
  teams?: Record<Team, string[]>;
  hands?: HandSummary[];
}

/** Under the results: the hands of the match (UI §12). */
export function SuecaResultDetails({ result, selfId }: { result: MatchResult; selfId: string }) {
  const summary = (result.summary ?? {}) as SuecaSummary;
  const hands = summary.hands ?? [];
  if (!summary.teams || hands.length === 0) return null;
  const teams = summary.teams;
  const myTeam = (['A', 'B'] as const).find((team) => teams[team].includes(selfId)) ?? null;
  const names = new Map(result.standings.map((s) => [s.playerId, s.playerId === selfId ? 'Tu' : s.username]));
  // Seats of each team in the order of play: S and N are team A's, E and W team B's.
  const playerOf = (seat: Seat) => {
    const team = teamOf(seat);
    const index = PLAY_ORDER.filter((s) => teamOf(s) === team).indexOf(seat);
    return teams[team][index] ?? '';
  };
  return (
    <details className="mt-4 rounded-xl bg-white/3 px-4 py-3">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.14em] text-subtle">
        Mãos ({hands.length})
      </summary>
      <div className="mt-2">
        <HandsTable hands={hands} myTeam={myTeam} dealerName={(seat) => names.get(playerOf(seat)) ?? '—'} />
      </div>
    </details>
  );
}
