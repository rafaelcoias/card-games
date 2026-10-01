'use client';

import { stableJitter } from '@cardroom/ui';
import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['#e8c170', '#f4efe3', '#5fc486', '#f0686b', '#9fb7ff', '#f3cf7d'];
const PIECES = 36;

/** A short, discreet confetti fall over the table when someone runs out of cards (UI §8). */
export function Confetti({ burst }: { burst: number }) {
  const reduced = useReducedMotion() ?? false;
  if (reduced) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {Array.from({ length: PIECES }, (_, i) => {
        const j = (salt: string) => stableJitter(`${burst}:${i}:${salt}`);
        return (
          <motion.span
            key={`${burst}:${i}`}
            className="absolute top-0 block rounded-[2px]"
            style={{
              left: `${50 + j('x') * 30}%`,
              width: 6 + Math.round((j('w') + 1) * 3),
              height: 10,
              background: COLORS[i % COLORS.length],
            }}
            initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }}
            animate={{ y: '75vh', x: j('dx') * 160, rotate: j('r') * 540, opacity: 0 }}
            transition={{ duration: 1.8 + (j('t') + 1) * 0.5, delay: (j('d') + 1) * 0.15, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}
