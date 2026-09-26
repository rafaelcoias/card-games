import type { Transition } from 'motion/react';

/** Motion spec (06-DESIGN §4). Durations in seconds. */
export const EASE_PLAY = [0.2, 0.8, 0.2, 1] as const;

export const motionTokens = {
  deal: { duration: 0.22, ease: 'easeOut', staggerMs: 60 },
  play: { duration: 0.26, ease: EASE_PLAY, staggerMs: 50 },
  draw: { duration: 0.22, ease: 'easeOut' },
  pickUp: { duration: 0.32, ease: 'easeInOut', staggerMs: 25 },
  burn: { duration: 0.36, ease: 'easeIn' },
  reveal: { duration: 0.4, ease: 'easeInOut' },
  skip: { duration: 0.5 },
  select: { duration: 0.12, ease: 'easeOut' },
  reduced: { duration: 0.08 },
} as const;

export function transitionFor(
  kind: 'deal' | 'play' | 'draw' | 'pickUp' | 'burn' | 'reveal' | 'select',
  reduced: boolean,
  delaySeconds = 0,
): Transition {
  if (reduced) return { duration: motionTokens.reduced.duration };
  const token = motionTokens[kind];
  return { duration: token.duration, ease: token.ease as Transition['ease'], delay: delaySeconds };
}
