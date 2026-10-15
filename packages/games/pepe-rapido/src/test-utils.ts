import { SYSTEM_PLAYER_ID, parseCardId, type CardInstance, type PlayerId } from '@cardroom/game-core';
import { expect } from 'vitest';
import { pepeConfigSchema } from './config';
import { applyAction } from './engine';
import type { PepeAction, PepeConfig, PepeEvent, PepeState, Phase, PileIndex } from './types';

export const ANA = 'ana';
export const BRUNO = 'bruno';

/** `"7S"` → the 7 of spades of the only deck (`uid` `"7S#0"`). */
export function card(id: string): CardInstance {
  const parsed = parseCardId(id);
  if (!parsed) throw new Error(`Bad card id ${id}`);
  return { ...parsed, uid: `${id}#0` };
}

export const cards = (ids: readonly string[]) => ids.map(card);

export interface AreaSpec {
  /** Five columns, bottom card first (the last one is the top). Missing columns are empty. */
  columns?: string[][];
  reserve?: string[];
  wantsFlip?: boolean;
}

export interface StateSpec {
  ana?: AreaSpec;
  bruno?: AreaSpec;
  /** Bottom card first. */
  centre?: [string[], string[]];
  phase?: Phase;
  config?: Partial<PepeConfig>;
  round?: number;
  roundWinner?: PlayerId | null;
  flips?: number;
  idleRecycles?: number;
}

export const config = (overrides: Partial<PepeConfig> = {}): PepeConfig =>
  pepeConfigSchema.parse({ ...overrides });

const area = (spec: AreaSpec = {}) => ({
  columns: Array.from({ length: 5 }, (_, i) => cards(spec.columns?.[i] ?? [])),
  reserve: cards(spec.reserve ?? []),
  wantsFlip: spec.wantsFlip ?? false,
});

/** A state injected as is (scenarios, 05): the engine never checks a whole deck is there. */
export function stateWith(spec: StateSpec = {}): PepeState {
  return {
    phase: spec.phase ?? 'PLAYING',
    config: config(spec.config),
    players: [ANA, BRUNO],
    areas: { [ANA]: area(spec.ana), [BRUNO]: area(spec.bruno) },
    centre: [cards(spec.centre?.[0] ?? []), cards(spec.centre?.[1] ?? [])],
    round: spec.round ?? 1,
    roundWinner: spec.roundWinner ?? null,
    winner: null,
    deadlock: false,
    flips: spec.flips ?? 1,
    idleRecycles: spec.idleRecycles ?? 0,
    seed: 'f'.repeat(64),
  };
}

export function act(state: PepeState, playerId: PlayerId, action: PepeAction) {
  return applyAction(state, action, playerId);
}

/** Applies an action that must be accepted. */
export function ok(
  state: PepeState,
  playerId: PlayerId,
  action: PepeAction,
): { state: PepeState; events: PepeEvent[]; schedule: unknown[] } {
  const result = applyAction(state, action, playerId);
  if (!result.ok) throw new Error(`${playerId} ${action.type} refused: ${result.error.code}`);
  return { state: result.state, events: [...result.events], schedule: [...(result.schedule ?? [])] };
}

/** Applies an action that must be refused with `code`. */
export function refused(state: PepeState, playerId: PlayerId, action: PepeAction, code: string): void {
  const result = applyAction(state, action, playerId);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const sys = (state: PepeState, action: PepeAction) => ok(state, SYSTEM_PLAYER_ID, action);

/** A play as a client builds it: the column's top and the pile's top as the player sees them. */
export function play(
  state: PepeState,
  playerId: PlayerId,
  column: number,
  pile: PileIndex,
): Extract<PepeAction, { type: 'PLAY_TO_CENTRE' }> {
  const top = state.areas[playerId]?.columns[column]?.at(-1);
  const pileTop = state.centre[pile].at(-1);
  return {
    type: 'PLAY_TO_CENTRE',
    cardUid: top?.uid ?? 'AS#0',
    column,
    pile,
    expectedTopUid: pileTop?.uid ?? 'AS#0',
  };
}

export function group(
  state: PepeState,
  playerId: PlayerId,
  fromColumn: number,
  toColumn: number,
  type: 'GROUP' | 'MOVE_TO_EMPTY' = 'GROUP',
): PepeAction {
  const top = state.areas[playerId]?.columns[fromColumn]?.at(-1);
  return { type, cardUid: top?.uid ?? 'AS#0', fromColumn, toColumn };
}

/** Every card of a state, wherever it is. */
export function allCards(state: PepeState): CardInstance[] {
  return [
    ...state.players.flatMap((id) => {
      const a = state.areas[id];
      return a ? [...a.columns.flat(), ...a.reserve] : [];
    }),
    ...state.centre.flat(),
  ];
}

export const topOf = (state: PepeState, playerId: PlayerId, column: number) =>
  state.areas[playerId]?.columns[column]?.at(-1)?.id ?? null;
