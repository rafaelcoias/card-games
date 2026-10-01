import type { StandardRank } from '@cardroom/game-core';
import { rankLabel } from '@cardroom/ui';

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

/** "Setes", "Damas". */
export const rankPlural = (rank: StandardRank): string => RANK_PLURALS[rank];

const NUMBERS = [
  '',
  'Um',
  'Dois',
  'Três',
  'Quatro',
  'Cinco',
  'Seis',
  'Sete',
  'Oito',
  'Nove',
  'Dez',
  'Onze',
  'Doze',
];

/** Agrees with the rank: "Duas Damas", "Uma Dama" (the queen is the only feminine rank). */
function numberWord(count: number, rank: StandardRank): string {
  if (rank === 'Q' && count === 1) return 'Uma';
  if (rank === 'Q' && count === 2) return 'Duas';
  return NUMBERS[count] ?? String(count);
}

/** What a play announces (rules §4): "Três Setes", "Um Rei", "Duas Damas". */
export function claimLine(count: number, rank: StandardRank): string {
  return `${numberWord(count, rank)} ${count === 1 ? rankLabel(rank) : rankPlural(rank)}`;
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
