import type { ConfigField, GameError, GameModule, GameResult } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, setup } from './engine';
import {
  getDefaultAction,
  getPendingPlayers,
  getTimeoutAction,
  getTimeoutMs,
  getValidActions,
} from './moves';
import { BET_UNIT, MAX_PLAYERS, MIN_PLAYERS, tableLimitsError } from './rules';
import { randomShuffler, type Shuffler } from './shoe';
import { currentPlayerId } from './state';
import { hintsSupported } from './strategy';
import type {
  BlackjackAction,
  BlackjackConfig,
  BlackjackEvent,
  BlackjackState,
  BlackjackView,
} from './types';
import { getPlayerView, getSpectatorView, sessionRows } from './view';

export const BLACKJACK_ID = 'blackjack';

const chips = () => z.number().int().multipleOf(BET_UNIT);

/** Table rules (03 §1) with the defaults of the closed open points (11). */
export const blackjackConfigSchema = z.object({
  decks: z.number().int().min(1).max(8).default(6),
  penetration: z.number().min(0.5).max(0.85).default(0.75),
  startingStack: chips().min(100).max(100_000).default(1000),
  minBet: chips().min(BET_UNIT).default(10),
  maxBet: chips().min(BET_UNIT).default(500),
  dealerHitsSoft17: z.boolean().default(false),
  holeCard: z.enum(['PEEK', 'EUROPEAN']).default('PEEK'),
  blackjackPayout: z.literal('3:2').default('3:2'),
  doubleAfterSplit: z.boolean().default(true),
  maxHands: z.number().int().min(2).max(4).default(4),
  splitTensByValue: z.boolean().default(true),
  surrender: z.boolean().default(true),
  insurance: z.boolean().default(true),
  allowRebuy: z.boolean().default(true),
  hintsEnabled: z.boolean().default(false),
  betTimeoutMs: z.number().int().min(5_000).max(60_000).default(15_000),
  decisionTimeoutMs: z.number().int().min(10_000).max(60_000).default(20_000),
  insuranceTimeoutMs: z.number().int().min(5_000).max(30_000).default(10_000),
}) satisfies z.ZodType<BlackjackConfig>;

const onOff = (on: string, off: string) => [
  { label: on, value: true },
  { label: off, value: false },
];

export const blackjackConfigUi: ConfigField[] = [
  {
    key: 'decks',
    label: 'Sapato',
    options: [1, 2, 4, 6, 8].map((n) => ({ label: `${n} ${n === 1 ? 'baralho' : 'baralhos'}`, value: n })),
  },
  {
    key: 'penetration',
    label: 'Carta de corte',
    help: 'Quanto do sapato se joga antes de voltar a baralhar.',
    options: [0.6, 0.75, 0.85].map((p) => ({ label: `${Math.round(p * 100)}%`, value: p })),
  },
  {
    key: 'dealerHitsSoft17',
    label: 'Banca com 17 mole (Ás + 6)',
    options: [
      { label: 'Fica', value: false },
      { label: 'Pede', value: true },
    ],
  },
  {
    key: 'holeCard',
    label: 'Carta tapada',
    help: 'Americana: com Ás ou 10 à vista a banca espreita e, com blackjack, acaba logo a ronda. Europeia: a banca só tira a 2.ª carta no fim e leva também dobras e separações.',
    options: [
      { label: 'Americana', value: 'PEEK' },
      { label: 'Europeia', value: 'EUROPEAN' },
    ],
  },
  { key: 'surrender', label: 'Desistência', options: onOff('Sim', 'Não') },
  {
    key: 'startingStack',
    label: 'Fichas iniciais',
    help: 'Fichas virtuais, sem valor: não se compram nem se trocam.',
    options: [500, 1000, 2500, 5000].map((n) => ({ label: `${n}`, value: n })),
  },
  {
    key: 'minBet',
    label: 'Aposta mínima',
    options: [10, 20, 50, 100].map((n) => ({ label: `${n}`, value: n })),
  },
  {
    key: 'maxBet',
    label: 'Aposta máxima',
    options: [100, 200, 500, 1000].map((n) => ({ label: `${n}`, value: n })),
  },
  {
    key: 'allowRebuy',
    label: 'Recompra',
    help: 'Sem fichas para a mínima, volta-se às fichas iniciais; conta no saldo.',
    options: onOff('Sim', 'Não'),
  },
  {
    key: 'hintsEnabled',
    label: 'Dica (estratégia básica)',
    help: 'Só com 4+ baralhos, banca a ficar no 17 mole e carta americana.',
    options: onOff('Ligada', 'Desligada'),
  },
  {
    key: 'decisionTimeoutMs',
    label: 'Tempo por decisão',
    options: [15, 20, 30].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
];

/** Actions accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const blackjackActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PLACE_BET'), amount: z.number().int().positive().max(100_000) }),
  z.strictObject({ type: z.literal('CLEAR_BET') }),
  z.strictObject({ type: z.literal('INSURANCE'), take: z.boolean() }),
  z.strictObject({ type: z.literal('EVEN_MONEY'), take: z.boolean() }),
  z.strictObject({ type: z.literal('HIT') }),
  z.strictObject({ type: z.literal('STAND') }),
  z.strictObject({ type: z.literal('DOUBLE') }),
  z.strictObject({ type: z.literal('SPLIT') }),
  z.strictObject({ type: z.literal('SURRENDER') }),
  z.strictObject({ type: z.literal('REBUY') }),
  z.strictObject({ type: z.literal('SIT_OUT'), value: z.boolean() }),
]);

/** Settings that cannot work together; `null` when the table is fine. */
export function validateTable(config: BlackjackConfig): GameError | null {
  const limits = tableLimitsError(config);
  if (limits) return { code: 'TABLE_LIMITS', message: limits };
  if (config.hintsEnabled && !hintsSupported(config)) {
    return {
      code: 'HINTS_UNSUPPORTED',
      message: 'A dica só existe com 4 ou mais baralhos, banca a ficar no 17 mole e carta americana',
    };
  }
  return null;
}

/**
 * Ranked by net chips (rebuys discounted), everyone placed (04 §3). Players
 * who never played a round have no result. Equal nets share a position.
 */
function getResult(state: BlackjackState): GameResult {
  const rows = sessionRows(state).filter((row) => row.roundsPlayed > 0);
  return {
    standings: rows.map((row) => ({
      playerId: row.playerId,
      outcome: 'PLACED' as const,
      position: 1 + rows.filter((other) => other.net > row.net).length,
      score: row.net,
    })),
    summary: { rounds: state.roundsDealt },
  };
}

export type BlackjackModule = GameModule<
  BlackjackState,
  BlackjackAction,
  BlackjackConfig,
  BlackjackView,
  BlackjackEvent
>;

/** Builds the module; tests inject a shuffler to stack the shoe. */
export function createBlackjackModule(shuffler: Shuffler = randomShuffler): BlackjackModule {
  return {
    id: BLACKJACK_ID,
    name: 'Blackjack',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'SESSION',
    configSchema: blackjackConfigSchema,
    configUi: blackjackConfigUi,
    actionSchema: blackjackActionSchema,
    validateTable,
    setup: (players, config, rng, options) => setup(players, config, rng, options, shuffler),
    applyAction: (state, action, playerId) => applyAction(state, action, playerId, shuffler),
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    getTimeoutAction,
    getSeatedPlayers: (state) => state.seats.map((seat) => seat.playerId),
    isFinished: (state) => state.phase === 'FINISHED',
    getResult,
  };
}

export const blackjack = createBlackjackModule();
