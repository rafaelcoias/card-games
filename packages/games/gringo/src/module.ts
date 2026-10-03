import type { ConfigField, GameModule } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, resultOf, setup, shuffledDealer, type Dealer } from './engine';
import {
  getDefaultAction,
  getPendingPlayers,
  getTimeoutAction,
  getTimeoutMs,
  getValidActions,
} from './moves';
import { MAX_PLAYERS, MIN_PLAYERS } from './rules';
import { currentPlayerId } from './state';
import type { GringoAction, GringoConfig, GringoEvent, GringoState, GringoView } from './types';
import { getPlayerView, getSpectatorView } from './view';

export const GRINGO_ID = 'gringo';

/** Room settings (contract §1, rules §11) with the defaults of the open points. */
export const gringoConfigSchema = z.object({
  redKingValue: z.union([z.literal(-3), z.literal(-1)]).default(-3),
  powerSet: z.enum(['FIGURAS', 'SETE_A_DEZ']).default('FIGURAS'),
  gringoEnabled: z.boolean().default(false),
  gringoMinTurns: z.number().int().min(1).max(20).default(5),
  snapWindowMs: z.number().int().min(2_000).max(6_000).default(3_000),
  decks: z.union([z.literal('AUTO'), z.literal(1), z.literal(2)]).default('AUTO'),
  initialPeekMs: z.number().int().min(3_000).max(30_000).default(10_000),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  powerTimeoutMs: z.number().int().min(5_000).max(60_000).default(20_000),
}) satisfies z.ZodType<GringoConfig>;

const yesNo = [
  { label: 'Sim', value: true },
  { label: 'Não', value: false },
];

export const gringoConfigUi: ConfigField[] = [
  {
    key: 'gringoEnabled',
    label: 'Dizer "Gringo"',
    help: 'Na sua vez, quem achar que tem menos pontos diz "Gringo": os outros jogam mais uma vez e acaba. Sem Gringo, o jogo acaba quando o baralho acabar.',
    options: yesNo,
  },
  {
    key: 'gringoMinTurns',
    label: 'Gringo a partir de',
    help: 'Quantas vezes cada jogador tem de ter jogado antes de alguém poder dizer "Gringo".',
    options: [1, 3, 5, 8].map((n) => ({ label: `${n} ${n === 1 ? 'volta' : 'voltas'}`, value: n })),
  },
  {
    key: 'powerSet',
    label: 'Cartas com poder',
    help: 'Espreitar uma de outro · trocar às cegas · espreitar uma tua · espreitar e decidir trocar.',
    options: [
      { label: '10, Valete, Dama, Rei', value: 'FIGURAS' },
      { label: '7, 8, 9, 10', value: 'SETE_A_DEZ' },
    ],
  },
  {
    key: 'redKingValue',
    label: 'Rei vermelho vale',
    options: [
      { label: '−3', value: -3 },
      { label: '−1', value: -1 },
    ],
  },
  {
    key: 'snapWindowMs',
    label: 'Tempo para bater',
    help: 'Depois de cada descarte, quanto tempo há para bater uma carta igual.',
    options: [2, 3, 4, 5].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
  {
    key: 'decks',
    label: 'Baralhos',
    help: 'Com muitos jogadores o baralho acaba depressa: automático usa 2 baralhos a partir de 7.',
    options: [
      { label: 'Automático', value: 'AUTO' },
      { label: '1 (54 cartas)', value: 1 },
      { label: '2 (108 cartas)', value: 2 },
    ],
  },
  {
    key: 'turnTimeoutMs',
    label: 'Tempo por jogada',
    options: [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
];

/** Accepted from clients. System actions (`SYS_*`) are deliberately absent. */
const index = z.number().int().min(0).max(255);
const playerId = z.string().min(1).max(128);
export const gringoActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PEEK_DONE') }),
  z.strictObject({ type: z.literal('CALL_GRINGO') }),
  z.strictObject({ type: z.literal('DRAW') }),
  z.strictObject({ type: z.literal('PASS') }),
  z.strictObject({ type: z.literal('SWAP_DRAWN'), index }),
  z.strictObject({ type: z.literal('DISCARD_DRAWN'), usePower: z.boolean() }),
  z.strictObject({ type: z.literal('POWER_PEEK'), owner: playerId, index }),
  z.strictObject({ type: z.literal('POWER_PEEK_DONE') }),
  z.strictObject({ type: z.literal('POWER_BLIND_SWAP'), myIndex: index, owner: playerId, theirIndex: index }),
  z.strictObject({ type: z.literal('POWER_SWAP_DECISION'), swap: z.boolean(), myIndex: index.optional() }),
  z.strictObject({ type: z.literal('POWER_SKIP') }),
  z.strictObject({ type: z.literal('SNAP'), discardId: z.number().int().min(1), index }),
]);

export type GringoModule = GameModule<GringoState, GringoAction, GringoConfig, GringoView, GringoEvent>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createGringoModule(dealer: Dealer = shuffledDealer): GringoModule {
  return {
    id: GRINGO_ID,
    name: 'Gringo',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'MATCH',
    configSchema: gringoConfigSchema,
    configUi: gringoConfigUi,
    actionSchema: gringoActionSchema,
    setup: (players, config, rng) => setup(players, config, rng, dealer),
    applyAction,
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    getTimeoutAction,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult: resultOf,
  };
}

export const gringo = createGringoModule();
