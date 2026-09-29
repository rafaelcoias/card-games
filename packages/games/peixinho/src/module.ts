import { STANDARD_RANKS, type ConfigField, type GameModule } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, setup, shuffledDealer, type Dealer } from './engine';
import { getDefaultAction, getPendingPlayers, getTimeoutMs, getValidActions } from './moves';
import { MAX_PLAYERS, MIN_PLAYERS, resultOf } from './rules';
import { currentPlayerId } from './state';
import type { PeixinhoAction, PeixinhoConfig, PeixinhoEvent, PeixinhoState, PeixinhoView } from './types';
import { getPlayerView, getSpectatorView } from './view';

export const PEIXINHO_ID = 'peixinho';

/** Room settings (contract §1), with the defaults of open points #2 and #3. */
export const peixinhoConfigSchema = z.object({
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  refillCount: z.number().int().min(1).max(7).default(4),
  tableMemory: z.enum(['NONE', 'LAST_5', 'FULL']).default('LAST_5'),
  pondPicking: z.boolean().default(true),
}) satisfies z.ZodType<PeixinhoConfig>;

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

export const peixinhoConfigUi: ConfigField[] = [
  {
    key: 'tableMemory',
    label: 'Memória da mesa',
    help: 'O histórico de pedidos que a mesa mostra. Sem memória é como em casa: cada um lembra-se do que ouviu.',
    options: [
      { label: 'Últimos 5 pedidos', value: 'LAST_5' },
      { label: 'Todos os pedidos', value: 'FULL' },
      { label: 'Nenhuma', value: 'NONE' },
    ],
  },
  {
    key: 'pondPicking',
    label: 'Pescar no lago',
    help: 'Tocar numa carta do lago é só a brincar: a ordem já foi baralhada, qualquer uma vale o mesmo.',
    options: [
      { label: 'Tocar na carta', value: true },
      { label: 'Automático', value: false },
    ],
  },
  { key: 'turnTimeoutMs', label: 'Tempo por pedido', options: TIMER_OPTIONS },
];

/** Actions accepted from clients. `SYS_TIMEOUT` is deliberately absent. */
export const peixinhoActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('ASK'),
    targetId: z.string().min(1).max(128),
    rank: z.enum(STANDARD_RANKS),
  }),
  z.strictObject({ type: z.literal('FISH'), pondPosition: z.number().int().min(0).max(51).optional() }),
]);

export type PeixinhoModule = GameModule<
  PeixinhoState,
  PeixinhoAction,
  PeixinhoConfig,
  PeixinhoView,
  PeixinhoEvent
>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createPeixinhoModule(dealer: Dealer = shuffledDealer): PeixinhoModule {
  return {
    id: PEIXINHO_ID,
    name: 'Peixinho',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'MATCH',
    configSchema: peixinhoConfigSchema,
    configUi: peixinhoConfigUi,
    actionSchema: peixinhoActionSchema,
    setup: (players, config, rng, options) => setup(players, config, rng, options, dealer),
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

export const peixinho = createPeixinhoModule();
