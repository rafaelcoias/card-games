import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  createShoe,
  type AnyGameModule,
  type GameModule,
} from '@cardroom/game-core';
import { createGringoModule, gringoConfigSchema } from '@cardroom/gringo';
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

describe('a decision owed outside the turn', () => {
  it("puts whoever snapped another player's card on the clock to give one back (Gringo)", () => {
    const shoe = createShoe({ decks: 1, jokers: 2 });
    const take = (id: string) =>
      shoe.splice(
        shoe.findIndex((c) => c.id === id),
        1,
      )[0]!;
    const grids = { a: ['6D', '2C', '3C', '4C'].map(take), b: ['5C', '8C', '9C', 'QC'].map(take) };
    const top = take('6H');
    const module = createGringoModule(() => ({ grids, deck: [top, ...shoe] }));
    const g = erase(module);
    let state: unknown = module.setup(['a', 'b'], gringoConfigSchema.parse({}), { nextInt: () => 0 });
    const act = (action: unknown, by: string): unknown => {
      const result = g.applyAction(state, action, by);
      if (!result.ok) throw new Error(result.error.code);
      const before = state;
      state = result.state;
      return before;
    };
    act({ type: 'SYS_INITIAL_PEEK_END' }, SYSTEM_PLAYER_ID);
    act({ type: 'DRAW' }, 'a');
    act({ type: 'DISCARD_DRAWN', usePower: false }, 'a');
    // Bruno snaps Ana's 6♦ on the 6♥: nobody is on turn, but he owes her a card.
    const before = act({ type: 'SNAP', discardId: 1, owner: 'a', index: 0 }, 'b');
    expect(g.getCurrentPlayer(state)).toBeNull();
    expect(decideTimerReset(g, before, state, 'b').reset).toBe(true);
    expect(decisionWindowMs(g, state, new Set(), 1_200)).toBe(10_000);
    expect(decisionWindowMs(g, state, new Set(['b']), 1_200)).toBe(1_200);
    expect(g.getTimeoutAction?.(state)).toEqual({ type: 'SYS_TIMEOUT' });
  });
});
