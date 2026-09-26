import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { GameModule } from './game-module';
import { GameRegistry } from './registry';
import { fail, ok } from './result';

type CounterState = { value: number };
type CounterAction = { type: 'INC' };

const counterGame: GameModule<CounterState, CounterAction, Record<string, never>> = {
  id: 'counter',
  name: 'Counter',
  minPlayers: 1,
  maxPlayers: 2,
  configSchema: z.object({}).strict(),
  actionSchema: z.object({ type: z.literal('INC') }),
  setup: () => ({ value: 0 }),
  applyAction: (state, _action, playerId) =>
    playerId === 'bad' ? fail('FORBIDDEN', 'nope') : ok({ value: state.value + 1 }),
  getPlayerView: (state) => state,
  getSpectatorView: (state) => state,
  getValidActions: () => [{ type: 'INC' }],
  getDefaultAction: () => ({ type: 'INC' }),
  getCurrentPlayer: () => null,
  getPendingPlayers: () => [],
  getTimeoutMs: () => null,
  isFinished: (state) => state.value >= 3,
  getResult: () => ({ rankings: [] }),
};

describe('GameRegistry', () => {
  it('registers, lists and resolves modules', () => {
    const registry = new GameRegistry().register(counterGame);
    expect(registry.has('counter')).toBe(true);
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.require('counter').name).toBe('Counter');
    expect(registry.list()).toEqual([{ id: 'counter', name: 'Counter', minPlayers: 1, maxPlayers: 2 }]);
  });

  it('refuses duplicates and unknown ids', () => {
    const registry = new GameRegistry().register(counterGame);
    expect(() => registry.register(counterGame)).toThrow(/already registered/);
    expect(() => registry.require('nope')).toThrow(/Unknown game/);
  });

  it('exposes type-erased modules that still work', () => {
    const module = new GameRegistry().register(counterGame).require('counter');
    const state = module.setup(['p1'], {}, { nextInt: () => 0 });
    const result = module.applyAction(state, { type: 'INC' }, 'p1');
    expect(result).toEqual({ ok: true, state: { value: 1 }, events: [] });
    expect(module.applyAction(state, { type: 'INC' }, 'bad')).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'nope' },
    });
  });
});
