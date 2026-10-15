import { describe, expect, it } from 'vitest';
import { PRESETS } from './config';
import { BASE, GAMES, run } from './simulation';

describe('simulation (kit 07 §10)', () => {
  it(`${GAMES} games of the CLASSICO preset keep every card, end, and race as they should`, () => {
    const { unfinished, races } = run(
      'CLASSICO',
      () => ({ ...BASE, ...PRESETS.CLASSICO, preset: 'CLASSICO' }),
      GAMES,
    );
    expect(unfinished).toBe(0);
    expect(races).toBeGreaterThan(0);
  });
});
