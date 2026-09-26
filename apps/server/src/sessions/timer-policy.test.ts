import { createSeededRng, type AnyGameModule, type GameModule } from '@cardroom/game-core';
import { highCard } from '@cardroom/high-card';
import { mexicana, mexicanaConfigSchema } from '@cardroom/mexicana';
import { describe, expect, it } from 'vitest';
import { decideTimerReset, decisionWindowMs } from './timer-policy';

const erase = <S, A, C, V>(m: GameModule<S, A, C, V>) => m as unknown as AnyGameModule;

function applyDefault(module: AnyGameModule, state: unknown, playerId: string): unknown {
  const result = module.applyAction(state, module.getDefaultAction(state, playerId), playerId);
  if (!result.ok) throw new Error(result.error.code);
  return result.state;
}

describe('decideTimerReset', () => {
  const mex = erase(mexicana);

  it('keeps the deadline while players choose simultaneously, resets when play starts', () => {
    let state: unknown = mexicana.setup(['a', 'b'], mexicanaConfigSchema.parse({}), createSeededRng('t'));
    const afterA = applyDefault(mex, state, 'a');
    expect(decideTimerReset(mex, state, afterA, 'a').reset).toBe(false);
    state = afterA;
    const afterB = applyDefault(mex, state, 'b');
    expect(decideTimerReset(mex, state, afterB, 'b').reset).toBe(true);
  });

  it('resets when the turn passes', () => {
    let state: unknown = mexicana.setup(['a', 'b'], mexicanaConfigSchema.parse({}), createSeededRng('t'));
    state = applyDefault(mex, applyDefault(mex, state, 'a'), 'b');
    const current = mex.getCurrentPlayer(state) as string;
    const after = applyDefault(mex, state, current);
    expect(decideTimerReset(mex, state, after, current).reset).toBe(true);
  });

  it('resets for a new simultaneous round', () => {
    const hc = erase(highCard);
    const state = highCard.setup(['a', 'b'], { rounds: 3, turnTimeoutMs: 20_000 }, createSeededRng('h'));
    const afterA = applyDefault(hc, state, 'a');
    expect(decideTimerReset(hc, state, afterA, 'a').reset).toBe(false);
    const afterB = applyDefault(hc, afterA, 'b');
    expect(decideTimerReset(hc, afterA, afterB, 'b').reset).toBe(true);
  });
});

describe('decisionWindowMs', () => {
  it('shortens the window when every pending player is away', () => {
    const mex = erase(mexicana);
    const state = mexicana.setup(['a', 'b'], mexicanaConfigSchema.parse({}), createSeededRng('t'));
    expect(decisionWindowMs(mex, state, new Set(), 1000)).toBe(30_000);
    expect(decisionWindowMs(mex, state, new Set(['a']), 1000)).toBe(30_000);
    expect(decisionWindowMs(mex, state, new Set(['a', 'b']), 1000)).toBe(1000);
  });
});
