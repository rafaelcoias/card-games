import { STANDARD_RANKS, type ConfigField, type GameModule } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, setup, shuffledDealer, type Dealer } from './engine';
import { getDefaultAction, getPendingPlayers, getTimeoutMs, getValidActions } from './moves';
import { MAX_PLAYERS, MIN_PLAYERS, resultOf } from './rules';
import { currentPlayerId } from './state';
import type {
  DesconfiaAction,
  DesconfiaConfig,
  DesconfiaEvent,
  DesconfiaState,
  DesconfiaView,
} from './types';
import { getPlayerView, getSpectatorView } from './view';

export const DESCONFIA_ID = 'desconfia';

/** Room settings (contract §1). */
export const desconfiaConfigSchema = z.object({
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  doubtMinWindowMs: z.number().int().min(1_000).max(5_000).default(2_000),
  lastCardWindowMs: z.number().int().min(2_000).max(8_000).default(3_000),
  playUntilEnd: z.boolean().default(false),
}) satisfies z.ZodType<DesconfiaConfig>;

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

export const desconfiaConfigUi: ConfigField[] = [
  {
    key: 'playUntilEnd',
    label: 'Fim da partida',
    help: 'Até ao fim, continua-se a jogar até sobrar um: cada um fica com a sua posição e o último perde.',
    options: [
      { label: 'Ao primeiro sem cartas', value: false },
      { label: 'Até ao fim', value: true },
    ],
  },
  {
    key: 'doubtMinWindowMs',
    label: 'Tempo para desconfiar',
    help: 'Depois de cada jogada, o seguinte espera isto antes de poder jogar.',
    options: [1, 2, 3, 4].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
  { key: 'turnTimeoutMs', label: 'Tempo por jogada', options: TIMER_OPTIONS },
];

const cardIdSchema = z.string().regex(/^(?:(?:10|[2-9JQKA])[SHDC]|JK[12])$/, 'Invalid card id');

/** Actions accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const desconfiaActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('PLAY'),
    cardIds: z.array(cardIdSchema).min(1).max(54),
    claimRank: z.enum(STANDARD_RANKS),
  }),
  z.strictObject({ type: z.literal('DOUBT'), playId: z.number().int().min(1) }),
]);

export type DesconfiaModule = GameModule<
  DesconfiaState,
  DesconfiaAction,
  DesconfiaConfig,
  DesconfiaView,
  DesconfiaEvent
>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createDesconfiaModule(dealer: Dealer = shuffledDealer): DesconfiaModule {
  return {
    id: DESCONFIA_ID,
    name: 'Desconfia',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'MATCH',
    configSchema: desconfiaConfigSchema,
    configUi: desconfiaConfigUi,
    actionSchema: desconfiaActionSchema,
    setup: (players, config, rng) => setup(players, config, rng, dealer),
    applyAction,
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult: resultOf,
  };
}

export const desconfia = createDesconfiaModule();
