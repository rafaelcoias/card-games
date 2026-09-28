'use client';

import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo } from 'react';
import { chipsFor, type ChipValue } from './copy';

/** Casino colours (UI §2); 5 is the classic red, for insurance halves. */
const CHIP_COLORS: Record<ChipValue, { body: string; stripe: string; text: string }> = {
  5: { body: '#b3262e', stripe: '#f4efe3', text: '#fff7ea' },
  10: { body: '#2563c9', stripe: '#f4efe3', text: '#ffffff' },
  20: { body: '#e8c230', stripe: '#1f2937', text: '#1f2937' },
  50: { body: '#ea7a1e', stripe: '#f4efe3', text: '#ffffff' },
  100: { body: '#1d1d1f', stripe: '#e8c170', text: '#f4efe3' },
  500: { body: '#6d3ab5', stripe: '#f4efe3', text: '#ffffff' },
};

/** A single chip: coloured body, the classic edge stripes, value in the middle. */
export const Chip = memo(function Chip({ value, size = 32 }: { value: ChipValue; size?: number }) {
  const { body, stripe, text } = CHIP_COLORS[value];
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
      className="block drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]"
    >
      <circle cx="20" cy="20" r="19" fill={body} stroke="rgb(0 0 0 / 0.35)" strokeWidth="1" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect
          key={i}
          x="17.5"
          y="1.5"
          width="5"
          height="6.5"
          rx="1"
          fill={stripe}
          transform={`rotate(${i * 60} 20 20)`}
        />
      ))}
      <circle
        cx="20"
        cy="20"
        r="12"
        fill={body}
        stroke={stripe}
        strokeWidth="1.2"
        strokeDasharray="2.2 1.6"
      />
      <text
        x="20"
        y="20.5"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={value >= 100 ? 9.5 : 11}
        fontWeight="800"
        fill={text}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {value}
      </text>
    </svg>
  );
});

/** Stable small offset per chip, so piles look hand-stacked but never jump between renders. */
const jitter = (i: number) => ((i * 7919) % 5) - 2;

export interface ChipStackProps {
  amount: number;
  size?: number;
  /** Most chips drawn; bigger piles show the amount on top. */
  max?: number;
  className?: string;
}

/** A pile of chips making `amount`, slightly out of line like real ones (UI §2). */
export function ChipStack({ amount, size = 28, max = 8, className }: ChipStackProps) {
  const reduced = useReducedMotion() ?? false;
  const chips = chipsFor(amount).slice(0, max).reverse();
  const lift = Math.round(size * 0.13);
  return (
    <div
      className={clsx('relative', className)}
      style={{ width: size + 4, height: size + lift * Math.max(0, chips.length - 1) }}
      role="img"
      aria-label={`${amount} fichas`}
    >
      <AnimatePresence initial={false}>
        {chips.map((value, i) => (
          <motion.div
            key={`${i}-${value}`}
            className="absolute"
            style={{ left: 2 + jitter(i) * 0.6, bottom: i * lift }}
            initial={reduced ? false : { y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <Chip value={value} size={size} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
