import type { PowerSet, PowerType } from '@cardroom/gringo';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

/** Positions read from 1, as on the table: `[1]`, `[5]`. */
export const slotLabel = (index: number) => `[${index + 1}]`;

/** What a power does, for the button and the captions (UI §4, §5). */
export const POWER_LABEL: Record<PowerType, string> = {
  PEEK_OTHER: 'espreitar uma carta de outro',
  BLIND_SWAP: 'trocar às cegas',
  PEEK_OWN: 'espreitar uma carta tua',
  PEEK_AND_SWAP: 'espreitar e decidir trocar',
};

/** The power of a card, spelled out (the coach over the player's cards). */
export const POWER_TITLE: Record<PowerType, string> = {
  PEEK_OTHER: 'espreitar uma carta de outro jogador',
  BLIND_SWAP: 'trocar uma carta tua com uma de outro, às cegas',
  PEEK_OWN: 'espreitar uma carta tua',
  PEEK_AND_SWAP: 'espreitar uma carta de outro e decidir se a trocas',
};

/** What the player must do once the power is on (status line). */
export const POWER_PROMPT: Record<PowerType, string> = {
  PEEK_OTHER: 'Toca numa carta de outro jogador para a espreitar',
  BLIND_SWAP: 'Troca às cegas: toca numa carta tua e numa de outro',
  PEEK_OWN: 'Toca numa carta tua para a espreitar',
  PEEK_AND_SWAP: 'Toca numa carta de outro jogador para a espreitar',
};

/** "10 · Valete · Dama · Rei" — the ranks with a power in this room. */
export const POWER_RANKS: Record<PowerSet, string> = {
  FIGURAS: '10 · V · D · R',
  SETE_A_DEZ: '7 · 8 · 9 · 10',
};

/** A signed points total: `−3`, `0`, `14`. */
export const points = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `${n}`);

/** "falta Bruno" / "faltam Bruno e Carla". */
export function missing(names: readonly string[]): string {
  return `${names.length === 1 ? 'falta' : 'faltam'} ${listNames(names)}`;
}
