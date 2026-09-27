import { fodinha } from '@cardroom/fodinha';
import type { ConfigValue } from '@cardroom/game-core';
import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';
import { FodinhaTable } from './fodinha/table';
import { HighCardTable } from './high-card/table';
import { MexicanaTable } from './mexicana/table';
import type { GameClientDefinition, GameRules } from './types';

type Presentation = Pick<
  GameClientDefinition,
  'tagline' | 'defaultMaxPlayers' | 'resultStyle' | 'resultDelayMs' | 'Table'
>;

/** Rules, player counts and settings come from the game's own module; the client adds the looks. */
function define(rules: GameRules, presentation: Presentation): GameClientDefinition {
  return {
    id: rules.id,
    name: rules.name,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
    settings: rules.configUi,
    defaults: rules.configSchema.parse({}) as Record<string, ConfigValue>,
    validateTable: (config, playerCount) => rules.validateTable?.(config as never, playerCount) ?? null,
    ...presentation,
  };
}

/**
 * Client-side game catalogue. The platform UI (lobby, rooms) is generic; each
 * entry only contributes its table and presentation.
 */
export const GAME_CLIENTS: GameClientDefinition[] = [
  define(mexicana, {
    tagline: 'Livra-te de todas as cartas — sem ficar em último.',
    defaultMaxPlayers: 4,
    resultStyle: 'placement',
    resultDelayMs: 0,
    Table: MexicanaTable,
  }),
  define(fodinha, {
    tagline: 'Aposta quantas vazas fazes. Quem falha leva pontos — e quem chega ao limite perde.',
    defaultMaxPlayers: 5,
    resultStyle: 'survival',
    resultDelayMs: 2600,
    Table: FodinhaTable,
  }),
  define(highCard, {
    tagline: 'Um aquecimento rápido: a carta mais alta ganha a ronda.',
    defaultMaxPlayers: 4,
    resultStyle: 'placement',
    resultDelayMs: 0,
    Table: HighCardTable,
  }),
];

export function findGameClient(id: string): GameClientDefinition | undefined {
  return GAME_CLIENTS.find((game) => game.id === id);
}
