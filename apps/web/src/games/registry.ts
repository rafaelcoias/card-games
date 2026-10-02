import { blackjack } from '@cardroom/blackjack';
import { desconfia } from '@cardroom/desconfia';
import { fodinha } from '@cardroom/fodinha';
import type { ConfigValue } from '@cardroom/game-core';
import { gringo } from '@cardroom/gringo';
// High Card is retired: Peixinho took its place. Uncomment (here and in the server registry) to bring it back.
// import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';
import { olho } from '@cardroom/olho';
import { peixinho } from '@cardroom/peixinho';
import { BlackjackTable } from './blackjack/table';
import { DesconfiaTable } from './desconfia/table';
import { FodinhaTable } from './fodinha/table';
import { GringoTable } from './gringo/table';
// import { HighCardTable } from './high-card/table';
import { MexicanaTable } from './mexicana/table';
import { OlhoTable } from './olho/table';
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
  define(desconfia, {
    tagline:
      'O jogo da mentira: pousa cartas viradas para baixo, anuncia o valor — verdade ou não — e desconfia dos outros.',
    defaultMaxPlayers: 5,
    resultStyle: 'placement',
    resultDelayMs: 2600,
    scoreUnit: ['carta', 'cartas'],
    resultNote: 'Começa a próxima partida quem receber o 3 de paus.',
    Table: DesconfiaTable,
  }),
  define(olho, {
    tagline:
      'Livra-te das cartas primeiro e ganha um cargo: no jogo seguinte o Olho tem de dar as melhores ao Presidente. Mesa contínua; entra e sai quando quiseres.',
    defaultMaxPlayers: 5,
    resultStyle: 'points',
    resultDelayMs: 600,
    Table: OlhoTable,
  }),
  define(gringo, {
    tagline:
      'Quatro cartas viradas para baixo e só conheces duas: troca, espreita e bate cartas iguais. Ganha quem acabar com menos pontos.',
    defaultMaxPlayers: 4,
    resultStyle: 'placement',
    // The grids turn over one player after the other, then the totals count up.
    resultDelayMs: 3600,
    scoreUnit: ['ponto', 'pontos'],
    resultNote: 'Ganha quem tiver menos pontos; os empates partilham o lugar.',
    Table: GringoTable,
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
