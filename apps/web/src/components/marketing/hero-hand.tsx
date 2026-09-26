'use client';

import { Card, CardSprite } from '@cardroom/ui';
import { motion, useReducedMotion } from 'motion/react';

const HAND = ['10H', 'JK1', 'AS', 'KD', '7C'];

/** Decorative fanned hand dealt in on load. */
export function HeroHand() {
  const reduced = useReducedMotion();
  return (
    <div className="felt relative mx-auto flex h-[340px] w-full max-w-[520px] items-center justify-center overflow-hidden rounded-[2rem] border border-black/40 shadow-2xl sm:h-[400px]">
      <CardSprite />
      <div className="relative h-[170px] w-[300px]" aria-label="Uma mão de cartas" role="img">
        {HAND.map((id, i) => {
          const t = i / (HAND.length - 1) - 0.5;
          return (
            <motion.div
              key={id}
              className="absolute left-1/2 top-0"
              style={{ marginLeft: -60, transformOrigin: '50% 140%' }}
              initial={reduced ? false : { y: 260, rotate: 0, opacity: 0 }}
              animate={{ y: t * t * 50, rotate: t * 44, x: t * 150, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <Card id={id} size="lg" label="" />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
