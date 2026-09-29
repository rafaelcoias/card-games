'use client';

import type { StandardRank } from '@cardroom/game-core';
import { Card, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { rankPlural } from './copy';
import { ANCHORS } from './scene';

const SUIT_FOR_FACE = ['S', 'H', 'C', 'D'] as const;

/**
 * A player's bucket (UI §1, §5): each peixinho as a small, slightly turned
 * stack with its rank showing. New ones drop in with a pop; the count pops too.
 */
export function Bucket({
  playerId,
  peixinhos,
  compact = false,
  highlight = false,
  className,
}: {
  playerId: string;
  peixinhos: readonly StandardRank[];
  compact?: boolean;
  /** Winner at the end. */
  highlight?: boolean;
  className?: string;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.bucket(playerId));
  const card = compact ? { width: 18, height: 25 } : { width: 22, height: 31 };
  // Tighter as it fills up, so up to 13 still fit in a seat.
  const overlap = peixinhos.length > 6 ? 0.74 : peixinhos.length > 3 ? 0.56 : 0.4;
  const label =
    peixinhos.length === 0 ? 'Sem peixinhos' : `Peixinhos: ${peixinhos.map(rankPlural).join(', ')}`;
  return (
    <div
      ref={anchorRef}
      className={clsx('flex items-center gap-1', className)}
      role="img"
      aria-label={label}
      title={label}
    >
      <motion.span
        key={peixinhos.length}
        className={clsx(
          'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-bold tabular-nums leading-5',
          highlight
            ? 'bg-gold text-gold-ink'
            : peixinhos.length > 0
              ? 'bg-[#9fe3e0]/20 text-[#bff0ed]'
              : 'bg-black/25 text-ivory/50',
        )}
        initial={{ scale: 1.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 18 }}
      >
        <span aria-hidden="true">🐟</span>
        {peixinhos.length}
      </motion.span>
      {peixinhos.length > 0 && (
        <div className="flex items-center" style={{ height: card.height + 4 }}>
          <AnimatePresence initial={false}>
            {peixinhos.map((rank, i) => (
              <motion.span
                key={rank}
                className="inline-block"
                style={{ marginLeft: i === 0 ? 0 : -card.width * overlap }}
                initial={{ scale: 1.8, y: -10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1, rotate: ((i * 37) % 11) - 5 }}
                transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              >
                <Card
                  id={`${rank}${SUIT_FOR_FACE[i % 4]}`}
                  size="xs"
                  label=""
                  style={{ width: card.width, height: card.height, borderRadius: 3 }}
                />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
