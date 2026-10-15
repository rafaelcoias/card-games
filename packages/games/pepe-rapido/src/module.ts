import type { GameModule } from '@cardroom/game-core';
import { z } from 'zod';
import { pepeConfigSchema, pepeConfigUi, validatePepeConfig } from './config';
import { applyAction, setup, shuffledDealer, type Dealer } from './engine';
import {
  getDefaultAction,
  getPendingPlayers,
  getTimeoutAction,
  getTimeoutMs,
  getValidActions,
} from './moves';
import { COLUMN_COUNT, PLAYER_COUNT, resultOf } from './rules';
import type { PepeAction, PepeConfig, PepeEvent, PepeState, PepeView } from './types';
import { getPlayerView, getSpectatorView } from './view';

export const PEPE_ID = 'pepe-rapido';

const column = z
  .number()
  .int()
  .min(0)
  .max(COLUMN_COUNT - 1);
const pile = z.union([z.literal(0), z.literal(1)]);
/** A card of the 54 (`"10H#0"`, `"JK2#0"`): only ever one deck. */
const cardUid = z.string().regex(/^(?:(?:10|[2-9JQKA])[SHDC]|JK[12])#0$/, 'Invalid card');

/** Actions accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const pepeActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PLAY_TO_CENTRE'), cardUid, column, pile, expectedTopUid: cardUid }),
  z.strictObject({ type: z.literal('GROUP'), cardUid, fromColumn: column, toColumn: column }),
  z.strictObject({ type: z.literal('MOVE_TO_EMPTY'), cardUid, fromColumn: column, toColumn: column }),
  z.strictObject({ type: z.literal('REQUEST_FLIP') }),
  z.strictObject({ type: z.literal('CHOOSE_PILE'), pile }),
]);

export type PepeModule = GameModule<PepeState, PepeAction, PepeConfig, PepeView, PepeEvent>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createPepeModule(dealer: Dealer = shuffledDealer): PepeModule {
  return {
    id: PEPE_ID,
    name: 'Pepe Rápido',
    minPlayers: PLAYER_COUNT,
    maxPlayers: PLAYER_COUNT,
    lifecycle: 'MATCH',
    configSchema: pepeConfigSchema,
    configUi: pepeConfigUi,
    actionSchema: pepeActionSchema,
    validateTable: (config) => validatePepeConfig(config),
    setup: (players, config, rng) => setup(players, config, rng, dealer),
    applyAction,
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    // No turns: both play at once (requirement 1).
    getCurrentPlayer: () => null,
    getPendingPlayers,
    getTimeoutMs,
    getTimeoutAction,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult: resultOf,
  };
}

export const pepeRapido = createPepeModule();
