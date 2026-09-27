'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { bidsBalance, plural } from './copy';
import type { Scene } from './scene';

/**
 * "Ronda 7 · 3 cartas · vale 2 pontos" with the carry-over highlighted, and the
 * live sum of bids against the tricks at stake while bidding (UI §2).
 */
export function RoundBanner({
  scene,
  onShowLastTrick,
  onShowScores,
  lastTrickOpen,
}: {
  scene: Scene;
  onShowLastTrick: () => void;
  onShowScores: () => void;
  lastTrickOpen: boolean;
}) {
  const bidding = scene.phase === 'BIDDING';
  const balance = bidsBalance(scene.bidsSum, scene.handSize);
  return (
    <div className="relative z-30 flex shrink-0 items-start gap-2 px-3 pt-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full bg-black/35 px-3 py-1 text-sm font-semibold backdrop-blur-sm">
          Ronda {scene.round} · {plural(scene.handSize, 'carta', 'cartas')} ·{' '}
          <span className={clsx(scene.carry > 0 && 'text-gold')}>
            vale {plural(scene.roundValue, 'ponto', 'pontos')}
          </span>
        </span>
        <AnimatePresence initial={false}>
          {scene.carry > 0 && (
            <motion.span
              key="carry"
              className="rounded-full bg-gold px-2.5 py-0.5 text-xs font-bold text-gold-ink shadow"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              title="Rondas seguidas sem ninguém falhar"
            >
              Acumulado ×{scene.roundValue}
            </motion.span>
          )}
          {scene.blind && (
            <motion.span
              key="blind"
              className="rounded-full bg-[#3a2a6b] px-2.5 py-0.5 text-xs font-bold text-[#d9ccff]"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              title="Vês as cartas dos outros, mas não a tua"
            >
              🙈 Às cegas
            </motion.span>
          )}
          {bidding && (
            <motion.span
              key="bids"
              className="rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-semibold tabular-nums backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Apostas {scene.bidsSum}/{scene.handSize} ·{' '}
              <span
                className={clsx(
                  balance.tone === 'over'
                    ? 'text-danger'
                    : balance.tone === 'even'
                      ? 'text-success'
                      : 'text-gold',
                )}
              >
                {balance.text}
              </span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <BannerButton
          label="Última vaza"
          onClick={onShowLastTrick}
          disabled={!scene.lastTrick}
          pressed={lastTrickOpen}
        >
          👁
        </BannerButton>
        <BannerButton label="Marcador" onClick={onShowScores}>
          📋
        </BannerButton>
      </div>
    </div>
  );
}

function BannerButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex size-8 items-center justify-center rounded-full bg-black/35 text-sm backdrop-blur-sm transition-colors',
        disabled ? 'opacity-40' : 'hover:bg-black/55',
        pressed && 'ring-2 ring-gold/70',
      )}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
