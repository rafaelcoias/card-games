import type { AskEntry } from '@cardroom/peixinho';
import type { StandardRank } from '@cardroom/game-core';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const RANK_PLURALS: Record<StandardRank, string> = {
  A: 'Ases',
  '2': 'Doises',
  '3': 'Treses',
  '4': 'Quatros',
  '5': 'Cincos',
  '6': 'Seises',
  '7': 'Setes',
  '8': 'Oitos',
  '9': 'Noves',
  '10': 'Dezes',
  J: 'Valetes',
  Q: 'Damas',
  K: 'Reis',
};

/** "Setes", "Reis": how you ask for a rank at the table. */
export const rankPlural = (rank: StandardRank): string => RANK_PLURALS[rank];

/** "Tens Setes?" */
export const askLine = (rank: StandardRank) => `Tens ${rankPlural(rank)}?`;

/** The answer in the bubble (UI §3). */
export const answerLine = (count: number | null) =>
  count === null ? 'Vai à pesca! 🐟' : `Tenho! Toma ${count === 1 ? '1' : count}.`;

/** One line of the table's memory (UI §7), from the viewer's point of view. */
export function logLine(
  entry: AskEntry,
  selfId: string | null,
  nameOf: (id: string) => string,
): { who: string; verb: string; rank: string; to: string; outcome: string } {
  const mine = entry.askerId === selfId;
  const who = mine ? 'Tu' : nameOf(entry.askerId);
  const to = entry.targetId === selfId ? 'a ti' : `a ${nameOf(entry.targetId)}`;
  const result = entry.result;
  let outcome: string;
  if (result.type === 'GIVEN') outcome = `${mine ? 'levaste' : 'levou'} ${result.count}`;
  else if (result.pondEmpty) outcome = 'lago vazio';
  else if (result.caughtAsked === null) outcome = 'a pescar…';
  else if (result.caughtAsked)
    outcome = `${mine ? 'pescaste' : 'pescou'} o que ${mine ? 'pediste' : 'pediu'}!`;
  else outcome = `${mine ? 'foste' : 'foi'} à pesca`;
  if (entry.peixinhosMade.length > 0) outcome += ` · 🐟 ${entry.peixinhosMade.map(rankPlural).join(', ')}`;
  return { who, verb: mine ? 'pediste' : 'pediu', rank: rankPlural(entry.rank), to, outcome };
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
