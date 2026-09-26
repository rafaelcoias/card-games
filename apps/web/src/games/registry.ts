import { HighCardTable } from './high-card/table';
import { MexicanaTable } from './mexicana/table';
import type { GameClientDefinition } from './types';

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

/**
 * Client-side game catalogue. The platform UI (lobby, rooms) is generic; each
 * entry only contributes its table and settings.
 */
export const GAME_CLIENTS: GameClientDefinition[] = [
  {
    id: 'mexicana',
    name: 'Mexicana',
    tagline: 'Livra-te de todas as cartas — sem ficar em último.',
    minPlayers: 2,
    maxPlayers: 6,
    defaultMaxPlayers: 4,
    settings: [
      { key: 'turnTimeoutMs', label: 'Tempo por jogada', options: TIMER_OPTIONS, defaultValue: 30_000 },
    ],
    Table: MexicanaTable,
  },
  {
    id: 'high-card',
    name: 'Carta Mais Alta',
    tagline: 'Um aquecimento rápido: a carta mais alta ganha a ronda.',
    minPlayers: 2,
    maxPlayers: 6,
    defaultMaxPlayers: 4,
    settings: [
      {
        key: 'rounds',
        label: 'Rondas',
        options: [3, 5, 7].map((n) => ({ label: `${n}`, value: n })),
        defaultValue: 5,
      },
      { key: 'turnTimeoutMs', label: 'Tempo por ronda', options: TIMER_OPTIONS, defaultValue: 30_000 },
    ],
    Table: HighCardTable,
  },
];

export function findGameClient(id: string): GameClientDefinition | undefined {
  return GAME_CLIENTS.find((game) => game.id === id);
}
