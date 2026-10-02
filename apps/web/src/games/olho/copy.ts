import type { Rank } from '@cardroom/game-core';
import type { CutReason, Role } from '@cardroom/olho';
import { signed } from '../score';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  PRESIDENTE: 'Presidente',
  VICE_PRESIDENTE: 'Vice-Presidente',
  NEUTRO: 'Neutro',
  VICE_OLHO: 'Vice-olho',
  OLHO: 'Olho',
};

/** Best first, for sorting and colouring. */
export const ROLE_ORDER: readonly Role[] = ['PRESIDENTE', 'VICE_PRESIDENTE', 'NEUTRO', 'VICE_OLHO', 'OLHO'];

const NAMES: Partial<Record<Rank, readonly [string, string]>> = {
  J: ['Valete', 'Valetes'],
  Q: ['Dama', 'Damas'],
  K: ['Rei', 'Reis'],
  A: ['Ás', 'Ases'],
  JOKER: ['Joker', 'Jokers'],
};

/** "7", "Rei", "Ás", "Joker". */
export const rankName = (rank: Rank): string => NAMES[rank]?.[0] ?? rank;
/** "7", "Reis", "Ases". */
export const rankNames = (rank: Rank): string => NAMES[rank]?.[1] ?? rank;

/** "um 7", "uma Dama", "um Ás". */
export const oneOf = (rank: Rank): string => `${rank === 'Q' ? 'uma' : 'um'} ${rankName(rank)}`;

const NUMBER_WORDS = ['', 'um', 'dois', 'três', 'quatro'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** "7", "par de Reis", "tripla de 7", "quatro Ases". */
export function comboName(rank: Rank, count: number): string {
  if (count <= 1) return rankName(rank);
  if (count === 2) return `par de ${rankNames(rank)}`;
  if (count === 3) return `tripla de ${rankNames(rank)}`;
  return `${numberWord(count)} ${rankNames(rank)}`;
}

/** With its article: "o Rei", "a Dama", "o par de 7", "a tripla de Ases". */
export function comboWithArticle(rank: Rank, count: number): string {
  if (count <= 1) return `${rank === 'Q' ? 'a' : 'o'} ${rankName(rank)}`;
  if (count === 2) return `o ${comboName(rank, count)}`;
  if (count === 3) return `a ${comboName(rank, count)}`;
  return `os ${comboName(rank, count)}`;
}

/** What the trick asks for (UI §1). */
export function trickKind(count: number | null): string | null {
  if (count === 1) return 'Cartas únicas';
  if (count === 2) return 'Pares';
  if (count === 3) return 'Triplas';
  return null;
}

const TARGET = ['', 'a carta', 'o par', 'a tripla'];

/**
 * The play button (UI §2): "Jogar par de 7", "Cortar o par com um 2",
 * "Cortar com o Joker", "Jogar quatro 5 — corta!".
 */
export function playLabel(trick: { count: number | null; topRank: Rank | null }, rank: Rank, count: number) {
  const { count: onTable, topRank } = trick;
  if (rank === 'JOKER') return onTable === null ? 'Abrir com o Joker — corta!' : 'Cortar com o Joker';
  if (count === 4) return `Jogar ${comboName(rank, 4)} — corta!`;
  if (rank === '2' && onTable !== null && topRank !== null) {
    if (topRank !== '2' && count !== onTable)
      return `Cortar ${TARGET[onTable] ?? ''} com ${numberWord(count)} 2`;
    if (topRank === '2' && count > onTable) return `Bater com ${numberWord(count)} 2`;
  }
  return `Jogar ${comboName(rank, count)}`;
}

export const CUT_STAMP: Readonly<Record<CutReason, string>> = {
  JOKER: 'CORTOU!',
  QUAD: 'QUATRO IGUAIS — CORTOU!',
  FOUR_IN_A_ROW: 'QUATRO IGUAIS — CORTOU!',
};

/** "+2", "−1", "0". */
export const signedPoints = (points: number) => signed(points);

/** "1.º". */
export const ordinal = (position: number) => `${position}.º`;

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
