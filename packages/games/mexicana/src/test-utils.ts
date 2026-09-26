import { parseCardId, type ActionResult, type Card, type PlayerId } from '@cardroom/game-core';
import { expect } from 'vitest';
import { mexicana } from './module';
import { DEFAULT_RULES, restrictionFor } from './rules';
import type { MexicanaEvent, MexicanaPlayerState, MexicanaState } from './types';

export function card(id: string): Card {
  const parsed = parseCardId(id);
  if (!parsed) throw new Error(`Bad card id in test: ${id}`);
  return parsed;
}

export const cards = (...ids: string[]): Card[] => ids.map(card);

interface PlayerSpec {
  hand?: string[];
  faceUp?: (string | null)[];
  faceDown?: (string | null)[];
  finishedPosition?: number | null;
}

interface StateSpec {
  players: Record<PlayerId, PlayerSpec>;
  current?: PlayerId;
  discard?: string[];
  draw?: string[];
  sameRankRun?: number;
}

/** Builds a PLAYING state from a compact description. Unspecified layers are empty. */
export function buildState(spec: StateSpec): MexicanaState {
  const turnOrder = Object.keys(spec.players);
  const players: Record<PlayerId, MexicanaPlayerState> = {};
  for (const [id, p] of Object.entries(spec.players)) {
    const slots = (ids: (string | null)[] | undefined) => {
      const filled = (ids ?? []).map((cid) => (cid === null ? null : card(cid)));
      while (filled.length < 3) filled.push(null);
      return filled;
    };
    players[id] = {
      hand: cards(...(p.hand ?? [])),
      faceUp: slots(p.faceUp),
      faceDown: slots(p.faceDown),
      hasChosenFaceUp: true,
      finishedPosition: p.finishedPosition ?? null,
    };
  }
  const discardPile = cards(...(spec.discard ?? []));
  const finished = Object.values(players).filter((p) => p.finishedPosition !== null).length;
  return {
    phase: 'PLAYING',
    players,
    turnOrder,
    currentIndex: turnOrder.indexOf(spec.current ?? (turnOrder[0] as PlayerId)),
    drawPile: cards(...(spec.draw ?? [])),
    discardPile,
    burnPile: [],
    restriction: restrictionFor(discardPile, DEFAULT_RULES),
    pendingSkips: 0,
    sameRankRun: spec.sameRankRun ?? inferRun(discardPile),
    nextFinishPosition: finished + 1,
    turnTimeoutMs: 30_000,
    chooseTimeoutMs: 30_000,
    rules: DEFAULT_RULES,
  };
}

function inferRun(pile: Card[]): number {
  let run = 0;
  pile.forEach((c, i) => {
    run = c.rank === '3' ? 0 : pile[i - 1]?.rank === c.rank ? run + 1 : 1;
  });
  return run;
}

type Success = Extract<ActionResult<MexicanaState, MexicanaEvent>, { ok: true }>;

export function expectOk(result: ActionResult<MexicanaState, MexicanaEvent>): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: ActionResult<MexicanaState, MexicanaEvent>, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const play = (state: MexicanaState, playerId: PlayerId, ...ids: string[]) =>
  mexicana.applyAction(state, { type: 'PLAY_CARDS', cardIds: ids }, playerId);

export const current = (state: MexicanaState) => mexicana.getCurrentPlayer(state);

export const ids = (list: readonly Card[]) => list.map((c) => c.id);

export const eventTypes = (events: readonly MexicanaEvent[]) => events.map((e) => e.type);
