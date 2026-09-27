'use client';

import type { CompletedTrick, RoundSummary } from '@cardroom/fodinha';
import { Card } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { plural } from './copy';

/**
 * End-of-round results over the table for 3.5 s (UI §7). Tapping closes it
 * early for you only; the next round is started by the server.
 */
export function RoundSummaryOverlay({
  summary,
  points,
  nameOf,
  selfId,
  onClose,
}: {
  summary: RoundSummary | null;
  points: Record<string, number>;
  nameOf: (id: string) => string;
  selfId: string;
  onClose: () => void;
}) {
  const nobodyFailed = summary !== null && summary.rows.every((r) => !r.failed);
  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          key={summary.round}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
        >
          <motion.div
            className="panel w-full max-w-sm cursor-pointer p-4"
            initial={{ y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-label={`Resumo da ronda ${summary.round}`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-xl font-semibold">Ronda {summary.round}</h3>
              <span className="text-xs text-muted">
                {plural(summary.handSize, 'carta', 'cartas')} · vale{' '}
                {plural(summary.value, 'ponto', 'pontos')}
              </span>
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-subtle">
                  <th className="pb-1 font-semibold">Jogador</th>
                  <th className="pb-1 text-center font-semibold">Aposta</th>
                  <th className="pb-1 text-center font-semibold">Fez</th>
                  <th className="pb-1" aria-label="Resultado" />
                  <th className="pb-1 text-right font-semibold">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row) => (
                  <tr key={row.playerId} className={clsx(row.failed ? 'text-danger' : 'text-ivory')}>
                    <td
                      className={clsx(
                        'max-w-[8rem] truncate py-0.5',
                        row.playerId === selfId && 'font-semibold',
                      )}
                    >
                      {nameOf(row.playerId)}
                    </td>
                    <td className="py-0.5 text-center tabular-nums">{row.bid}</td>
                    <td className="py-0.5 text-center tabular-nums">{row.won}</td>
                    <td className="py-0.5 text-center">{row.failed ? '✗' : '✓'}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {row.failed ? `+${row.pointsAdded} → ` : ''}
                      {points[row.playerId] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nobodyFailed && (
              <p className="mt-3 rounded-lg bg-gold/15 px-3 py-2 text-center text-sm font-semibold text-gold">
                Ninguém falhou — a próxima ronda vale {summary.value + 1}
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-subtle">Toca para fechar</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The previous trick, on demand (UI §6). */
export function LastTrickPopover({
  trick,
  open,
  nameOf,
  onClose,
}: {
  trick: CompletedTrick | null;
  open: boolean;
  nameOf: (id: string) => string;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && trick && (
        <motion.div
          className="absolute right-3 top-12 z-40 max-w-[calc(100%-1.5rem)] rounded-2xl bg-black/75 p-3 shadow-xl backdrop-blur"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-label="Última vaza"
          onClick={onClose}
        >
          <p className="mb-2 text-xs font-semibold text-ivory/80">
            Última vaza ·{' '}
            {trick.winner ? (
              <span className="text-gold">{nameOf(trick.winner)} ganhou</span>
            ) : (
              <span className="text-ivory/60">empate, ninguém ganhou</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {trick.plays.map((play) => (
              <div key={play.card.id} className="flex flex-col items-center gap-1">
                <div
                  className={clsx(
                    'rounded-[var(--radius-card)]',
                    trick.winner === play.playerId && 'shadow-[0_0_0_2px_var(--color-gold)]',
                  )}
                >
                  <Card id={play.card.id} size="xs" />
                </div>
                <span className="max-w-12 truncate text-[10px] text-ivory/70">{nameOf(play.playerId)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
