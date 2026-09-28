import { describe, expect, it } from 'vitest';
import { STAGE_HEADER } from '../shared/use-media';
import { fitMexicanaSizes, mexicanaHeight } from './layout';

describe('Mexicana card sizes', () => {
  it('uses the room of big screens and never needs more height than there is', () => {
    const cases = [
      { viewport: { width: 1920, height: 1080 }, opponents: 5, compact: false, hand: 'xl' },
      { viewport: { width: 1440, height: 900 }, opponents: 3, compact: false, hand: 'xl' },
      { viewport: { width: 1280, height: 720 }, opponents: 5, compact: false, hand: 'lg' },
      { viewport: { width: 820, height: 1180 }, opponents: 3, compact: false, hand: 'xl' },
      { viewport: { width: 390, height: 844 }, opponents: 3, compact: true, hand: 'ml' },
      { viewport: { width: 360, height: 640 }, opponents: 2, compact: true, hand: 'md' },
    ] as const;
    for (const { viewport, opponents, compact, hand } of cases) {
      const sizes = fitMexicanaSizes(viewport, opponents, compact);
      expect(sizes.hand, `${viewport.width}×${viewport.height}`).toBe(hand);
      expect(mexicanaHeight(sizes, compact)).toBeLessThanOrEqual(viewport.height - STAGE_HEADER);
    }
  });

  it('shrinks the opponents’ cards before a crowded row wraps', () => {
    const few = fitMexicanaSizes({ width: 1440, height: 1080 }, 2, false);
    const many = fitMexicanaSizes({ width: 1440, height: 1080 }, 5, false);
    expect(few.opponents).toBe('md');
    expect(['ms', 'sm', 'xs']).toContain(many.opponents);
  });

  it('keeps a phone hand small enough to fan, and falls back to the smallest set', () => {
    expect(fitMexicanaSizes({ width: 390, height: 2000 }, 3, true).hand).toBe('ml');
    expect(fitMexicanaSizes({ width: 320, height: 400 }, 5, true)).toEqual({
      hand: 'ms',
      selfTable: 'sm',
      opponents: 'xs',
      center: 'sm',
    });
    expect(fitMexicanaSizes({ width: 0, height: 0 }, 3, false).hand).toBe('lg');
  });
});
