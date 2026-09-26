import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { assertValidBound, type Rng } from './rng';

/** Non-deterministic RNG backed by `crypto.randomInt`. */
export function createCryptoRng(): Rng {
  return {
    nextInt(maxExclusive) {
      assertValidBound(maxExclusive);
      return randomInt(maxExclusive);
    },
  };
}

/** 256-bit random seed, hex encoded. */
export function generateSeed(): string {
  return randomBytes(32).toString('hex');
}

const UINT48_RANGE = 2 ** 48;

/**
 * Deterministic, cryptographically strong RNG: HMAC-SHA256 in counter mode keyed
 * by a secret seed. Given the same seed it always yields the same sequence, which
 * is what makes a match reproducible from `seed + action log`, while remaining
 * unpredictable to anyone who does not know the seed (which never leaves the server).
 */
export function createDrbgRng(seed: string): Rng {
  if (!/^[0-9a-f]{32,}$/i.test(seed)) {
    throw new Error('DRBG seed must be a hex string of at least 128 bits');
  }
  const key = Buffer.from(seed, 'hex');
  let counter = 0n;
  let buffer = Buffer.alloc(0);
  let offset = 0;

  const nextUint48 = (): number => {
    if (offset + 6 > buffer.length) {
      const block = Buffer.alloc(8);
      block.writeBigUInt64BE(counter++);
      buffer = createHmac('sha256', key).update(block).digest();
      offset = 0;
    }
    const value = buffer.readUIntBE(offset, 6);
    offset += 6;
    return value;
  };

  return {
    nextInt(maxExclusive) {
      assertValidBound(maxExclusive);
      // Rejection sampling removes modulo bias.
      const limit = UINT48_RANGE - (UINT48_RANGE % maxExclusive);
      for (;;) {
        const value = nextUint48();
        if (value < limit) return value % maxExclusive;
      }
    },
  };
}
