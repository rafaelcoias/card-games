import type { ConfigField, GameModule, GameResult, GameStanding } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, setup, shuffledDealer, type Dealer } from './engine';
import {
  getDefaultAction,
  getPendingPlayers,
  getTimeoutAction,
  getTimeoutMs,
  getValidActions,
} from './moves';
import { MAX_PLAYERS, MIN_PLAYERS } from './rules';
import { currentPlayerId } from './state';
import type { OlhoAction, OlhoConfig, OlhoEvent, OlhoState, OlhoView } from './types';
import { getPlayerView, getSpectatorView, sessionRows } from './view';

export const OLHO_ID = 'olho';

/** Room settings (contract §1) with the defaults of rules §10. */
export const olhoConfigSchema = z.object({
  displayName: z.string().trim().min(1).max(24).default('Olho'),
  allowFinishWithPower: z.boolean().default(true),
  fourOfAKindCuts: z.boolean().default(true),
  sameCardEscape: z.boolean().default(true),
  firstTrickNoPower: z.boolean().default(true),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  escapeTimeoutMs: z.number().int().min(3_000).max(15_000).default(5_000),
  exchangeTimeoutMs: z.number().int().min(10_000).max(60_000).default(20_000),
}) satisfies z.ZodType<OlhoConfig>;

const yesNo = [
  { label: 'Sim', value: true },
  { label: 'Não', value: false },
];

export const olhoConfigUi: ConfigField[] = [
  {
    key: 'allowFinishWithPower',
    label: 'Acabar com um 2 ou joker',
    help: 'Se não, essa jogada é proibida: quem só tiver um 2 ou um joker fica bloqueado e passa sempre.',
    options: yesNo,
  },
  {
    key: 'fourOfAKindCuts',
    label: 'Quatro iguais seguidos cortam',
    help: 'Em várias jogadas (7, 7, 7, 7). Quatro iguais jogados de uma vez cortam sempre.',
    options: yesNo,
  },
  {
    key: 'sameCardEscape',
    label: 'Escapar ao salto',
    help: 'Quem ia ser saltado escapa se jogar também a mesma carta.',
    options: yesNo,
  },
  {
    key: 'firstTrickNoPower',
    label: 'Primeira vaza sem 2 nem joker',
    options: yesNo,
  },
  {
    key: 'turnTimeoutMs',
    label: 'Tempo por jogada',
    options: [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
  {
    key: 'exchangeTimeoutMs',
    label: 'Tempo para a troca',
    help: 'O Presidente e o Vice-Presidente escolhem as cartas que devolvem.',
    options: [15, 20, 30].map((s) => ({ label: `${s}s`, value: s * 1000 })),
  },
];

const cardIdSchema = z.string().regex(/^(?:(?:10|[2-9JQKA])[SHDC]|JK[12])$/, 'Invalid card id');

/** Actions accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const olhoActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PLAY'), cardIds: z.array(cardIdSchema).min(1).max(4) }),
  z.strictObject({ type: z.literal('PASS') }),
  z.strictObject({ type: z.literal('ESCAPE'), cardIds: z.array(cardIdSchema).min(1).max(4) }),
  z.strictObject({ type: z.literal('ACCEPT_SKIP') }),
  z.strictObject({ type: z.literal('RETURN_CARDS'), cardIds: z.array(cardIdSchema).min(1).max(2) }),
]);

/**
 * Contract §8: everyone who played at least one game, ranked by points (equal
 * points share a place). The most points win, the fewest lose; a session where
 * everyone is level has neither.
 */
export function resultOf(state: OlhoState): GameResult {
  const rows = sessionRows(state).filter((row) => row.gamesPlayed > 0);
  const position = (points: number) => 1 + rows.filter((other) => other.points > points).length;
  const last = Math.max(0, ...rows.map((row) => position(row.points)));
  const standings: GameStanding[] = rows.map((row) => {
    const place = position(row.points);
    return {
      playerId: row.playerId,
      position: place,
      outcome: last === 1 ? 'PLACED' : place === 1 ? 'WINNER' : place === last ? 'LOSER' : 'PLACED',
      score: row.points,
    };
  });
  return { standings, summary: { games: state.gamesCompleted } };
}

export type OlhoModule = GameModule<OlhoState, OlhoAction, OlhoConfig, OlhoView, OlhoEvent>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createOlhoModule(dealer: Dealer = shuffledDealer): OlhoModule {
  return {
    id: OLHO_ID,
    name: 'Olho',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'SESSION',
    configSchema: olhoConfigSchema,
    configUi: olhoConfigUi,
    actionSchema: olhoActionSchema,
    setup: (players, config, rng, options) => setup(players, config, rng, options, dealer),
    applyAction: (state, action, playerId) => applyAction(state, action, playerId, dealer),
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    getTimeoutAction,
    getSeatedPlayers: (state) => [...state.seats, ...state.waiting],
    isFinished: (state) => state.phase === 'FINISHED',
    getResult: resultOf,
  };
}

export const olho = createOlhoModule();
