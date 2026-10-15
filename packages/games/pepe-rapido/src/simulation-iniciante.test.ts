import { describe, expect, it } from 'vitest';
import { PRESETS } from './config';
import { BASE, GAMES, run } from './simulation';

describe('simulation (kit 07 §10)', () => {
  it(`${GAMES} games of the INICIANTE preset keep every card, end, and race as they should`, () => {
    const { unfinished, races } = run(
      'INICIANTE',
      () => ({ ...BASE, ...PRESETS.INICIANTE, preset: 'INICIANTE' }),
      GAMES,
    );
    expect(unfinished).toBe(0);
    expect(races).toBeGreaterThan(0);
  });
});
