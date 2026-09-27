'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { atRisk, bidTone } from './copy';

/** Penalty points as pips `●●●○○` (UI §8); numeric past 8 so it never gets too long. */
export function PointsPips({
  points,
  max,
  compact = false,
  className,
}: {
  points: number;
  max: number;
  /** Tight spaces: dots only up to 5 points. */
  compact?: boolean;
  className?: string;
}) {
  const danger = atRisk(points, max);
  const label = `${points} de ${max} pontos`;
  if (max > (compact ? 5 : 8)) {
    return (
      <span
        className={clsx(
          'text-[11px] font-semibold tabular-nums',
          danger ? 'text-danger' : 'text-ivory/70',
          className,
        )}
        aria-label={label}
        title={label}
      >
        {points}/{max}
      </span>
    );
  }
  return (
    <span
      className={clsx('inline-flex items-center gap-[3px]', className)}
      role="img"
      aria-label={label}
      title={label}
    >
      {Array.from({ length: max }, (_, i) => (
        <motion.span
          key={i}
          className={clsx(
            'inline-block rounded-full',
            compact ? 'size-[6px]' : 'size-[7px]',
            i < points ? (danger ? 'bg-danger' : 'bg-gold') : 'bg-white/20',
          )}
          initial={false}
          animate={{ scale: i < points ? [1.6, 1] : 1 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </span>
  );
}

const TONES = {
  hit: 'bg-success/20 text-success',
  short: 'bg-[#e8a33d]/20 text-[#f0b456]',
  failed: 'bg-danger/20 text-danger',
} as const;

/**
 * "Aposta 2 · Feitas 1": green on target, amber while short, red once it can no
 * longer be met (UI §5). Before the play starts it only shows the locked bid.
 */
export function BidChip({
  bid,
  won,
  tricksLeft,
  playing,
  bidding,
  compact = false,
}: {
  bid: number | null;
  won: number;
  tricksLeft: number;
  playing: boolean;
  bidding: boolean;
  compact?: boolean;
}) {
  if (bid === null) {
    return (
      <span
        className={clsx(
          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
          bidding ? 'animate-pulse bg-gold/20 text-gold' : 'bg-black/25 text-ivory/50',
        )}
      >
        {bidding ? 'A apostar…' : compact ? '—' : 'Sem aposta'}
      </span>
    );
  }
  const tone = playing ? bidTone(bid, won, tricksLeft) : null;
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={`${bid}:${playing ? won : 'bid'}`}
        className={clsx(
          'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
          tone ? TONES[tone] : 'bg-black/30 text-ivory',
        )}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        title={`Aposta ${bid}${playing ? ` · Feitas ${won}` : ''}`}
      >
        {!playing && <span aria-hidden="true">🔒</span>}
        {compact ? `A${bid}` : `Aposta ${bid}`}
        {playing && <span className="opacity-70">·</span>}
        {playing && (compact ? `F${won}` : `Feitas ${won}`)}
      </motion.span>
    </AnimatePresence>
  );
}
