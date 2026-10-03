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
import { PLAYERS, PLAY_ORDER, TEAMS } from './rules';
import { currentPlayerId, isChatOpen } from './state';
import type { SuecaAction, SuecaConfig, SuecaEvent, SuecaState, SuecaView } from './types';
import { getPlayerView, getSpectatorView } from './view';

export const SUECA_ID = 'sueca';

/** Room settings (contract §1, rules §13). */
export const suecaConfigSchema = z.object({
  targetGames: z.number().int().min(1).max(10).default(4),
  turnTimeoutMs: z.number().int().min(15_000).max(120_000).default(30_000),
  cutTimeoutMs: z.number().int().min(5_000).max(60_000).default(15_000),
  disconnectGraceMs: z.number().int().min(30_000).max(600_000).default(120_000),
}) satisfies z.ZodType<SuecaConfig>;

export const suecaConfigUi: ConfigField[] = [
  {
    key: 'targetGames',
    label: 'Partida a',
    help: 'Cada mão vale 1 jogo (61 a 90 pontos), 2 (91 a 119) ou 4 (os 120). Em 60–60 ninguém pontua.',
    options: [1, 2, 3, 4, 6, 10].map((n) => ({ label: `${n} ${n === 1 ? 'jogo' : 'jogos'}`, value: n })),
  },
  {
    key: 'turnTimeoutMs',
    label: 'Tempo por jogada',
    help: 'Se o tempo acabar, joga-se a carta permitida que vale menos.',
    options: [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
  {
    key: 'disconnectGraceMs',
    label: 'Esperar por quem cai',
    help: 'A mesa para enquanto alguém está desligado. Passado este tempo, o anfitrião pode esperar mais ou terminar sem resultado.',
    options: [1, 2, 5].map((m) => ({ label: `${m} min`, value: m * 60_000 })),
  },
];

/** Accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const suecaActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CHOOSE_CUT'), from: z.enum(['TOP', 'BOTTOM']) }),
  z.strictObject({ type: z.literal('PLAY'), cardUid: z.string().regex(/^(?:[2-7JQKA])[SHDC]#0$/) }),
  z.strictObject({ type: z.literal('VIEW_LAST_TRICK') }),
]);

export type SuecaModule = GameModule<SuecaState, SuecaAction, SuecaConfig, SuecaView, SuecaEvent>;

/** Builds the module; tests inject a dealer to play with stacked decks. */
export function createSuecaModule(dealer: Dealer = shuffledDealer): SuecaModule {
  return {
    id: SUECA_ID,
    name: 'Sueca',
    minPlayers: PLAYERS,
    maxPlayers: PLAYERS,
    lifecycle: 'MATCH',
    // Players choose their side of the table, and so their partner (core §1).
    seating: { seats: PLAY_ORDER, teams: TEAMS },
    // Four real players or none: the table waits for whoever drops (core §2).
    disconnectPolicy: 'PAUSE',
    configSchema: suecaConfigSchema,
    configUi: suecaConfigUi,
    actionSchema: suecaActionSchema,
    setup,
    applyAction: (state, action, playerId) => applyAction(state, action, playerId, dealer),
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    getTimeoutAction,
    getPauseGraceMs: (state) => state.config.disconnectGraceMs,
    isChatOpen,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult: resultOf,
  };
}

export const sueca = createSuecaModule();
