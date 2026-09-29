import { blackjack } from '@cardroom/blackjack';
import { fodinha } from '@cardroom/fodinha';
import type { ConfigValue } from '@cardroom/game-core';
// High Card is retired: Peixinho took its place. Uncomment (here and in the server registry) to bring it back.
// import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';
import { peixinho } from '@cardroom/peixinho';
import { BlackjackTable } from './blackjack/table';
import { FodinhaTable } from './fodinha/table';
// import { HighCardTable } from './high-card/table';
import { MexicanaTable } from './mexicana/table';
import { PeixinhoTable } from './peixinho/table';
import type { GameClientDefinition, GameRules } from './types';

type Presentation = Pick<
  GameClientDefinition,
  'tagline' | 'defaultMaxPlayers' | 'resultStyle' | 'resultDelayMs' | 'scoreUnit' | 'resultNote' | 'Table'
>;

/** Rules, player counts and settings come from the game's own module; the client adds the looks. */
function define(rules: GameRules, presentation: Presentation): GameClientDefinition {
  return {
    id: rules.id,
    name: rules.name,
    minPlayers: rules.minPlayers,
    maxPlayers: rules.maxPlayers,
    lifecycle: rules.lifecycle,
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
  define(blackjack, {
    tagline: 'Contra a banca, até 7 à mesa. Fichas virtuais, sem valor real; entra e sai quando quiseres.',
    defaultMaxPlayers: 7,
    resultStyle: 'chips',
    resultDelayMs: 1200,
    Table: BlackjackTable,
  }),
  define(peixinho, {
    tagline:
      'Pede cartas aos outros, vai à pesca e junta peixinhos — quatro do mesmo valor. Ganha quem fizer mais.',
    defaultMaxPlayers: 4,
    resultStyle: 'placement',
    resultDelayMs: 2400,
    scoreUnit: ['peixinho', 'peixinhos'],
    resultNote: 'Quem fez menos peixinhos começa a próxima partida.',
    Table: PeixinhoTable,
  }),
  // define(highCard, {
  //   tagline: 'Um aquecimento rápido: a carta mais alta ganha a ronda.',
  //   defaultMaxPlayers: 4,
  //   resultStyle: 'placement',
  //   resultDelayMs: 0,
  //   Table: HighCardTable,
  // }),
];

export function findGameClient(id: string): GameClientDefinition | undefined {
  return GAME_CLIENTS.find((game) => game.id === id);
}
