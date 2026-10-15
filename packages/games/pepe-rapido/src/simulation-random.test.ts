import { describe, expect, it } from 'vitest';
import { GAMES, randomConfig, run } from './simulation';

describe('simulation (kit 07 §10)', () => {
  it(`${GAMES} games with random rooms keep every card and end`, () => {
    const { unfinished, races } = run('RANDOM', (_, rng) => randomConfig(rng), GAMES);
    expect(unfinished).toBe(0);
    expect(races).toBeGreaterThan(0);
  });
});
