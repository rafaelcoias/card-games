import { describe, expect, it } from 'vitest';
import { createCryptoRng, createDrbgRng, generateSeed } from './node';
import { createSeededRng, pickOne, shuffle, type Rng } from './rng';

function sample(rng: Rng, bound: number, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextInt(bound));
}

function expectRoughlyUniform(rng: Rng, bound: number): void {
  const n = 20_000;
  const counts = new Array<number>(bound).fill(0);
  for (const v of sample(rng, bound, n)) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(bound);
    counts[v]! += 1;
  }
  const expected = n / bound;
  for (const count of counts) {
    expect(Math.abs(count - expected) / expected).toBeLessThan(0.1);
  }
}

describe('seeded rng', () => {
  it('is deterministic per seed', () => {
    expect(sample(createSeededRng('a'), 100, 20)).toEqual(sample(createSeededRng('a'), 100, 20));
    expect(sample(createSeededRng('a'), 100, 20)).not.toEqual(sample(createSeededRng('b'), 100, 20));
  });

  it('is roughly uniform', () => expectRoughlyUniform(createSeededRng('uniform'), 7));

  it('rejects invalid bounds', () => {
    const rng = createSeededRng('x');
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });
});

describe('DRBG rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const seed = generateSeed();
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(sample(createDrbgRng(seed), 54, 50)).toEqual(sample(createDrbgRng(seed), 54, 50));
    expect(sample(createDrbgRng(seed), 1000, 20)).not.toEqual(
      sample(createDrbgRng(generateSeed()), 1000, 20),
    );
  });

  it('is roughly uniform', () => expectRoughlyUniform(createDrbgRng(generateSeed()), 13));

  it('rejects weak seeds', () => {
    expect(() => createDrbgRng('abc')).toThrow();
    expect(() => createDrbgRng('zz'.repeat(32))).toThrow();
  });
});

describe('crypto rng', () => {
  it('stays in range', () => expectRoughlyUniform(createCryptoRng(), 5));

  it('rejects invalid bounds', () => expect(() => createCryptoRng().nextInt(-1)).toThrow(RangeError));
});

describe('shuffle', () => {
  it('returns a permutation and leaves the input intact', () => {
    const input = Array.from({ length: 54 }, (_, i) => i);
    const out = shuffle(input, createSeededRng('s'));
    expect(out).not.toBe(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(out).not.toEqual(input);
  });

  it('produces every permutation of three items', () => {
    const rng = createSeededRng('perm');
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) seen.add(shuffle(['a', 'b', 'c'], rng).join(''));
    expect(seen.size).toBe(6);
  });
});

describe('pickOne', () => {
  it('picks an element', () => expect(['x', 'y']).toContain(pickOne(['x', 'y'], createSeededRng('p'))));
  it('throws on empty input', () => expect(() => pickOne([], createSeededRng('p'))).toThrow(RangeError));
});
