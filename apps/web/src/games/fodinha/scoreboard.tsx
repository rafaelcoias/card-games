'use client';

import type { RoundSummary } from '@cardroom/fodinha';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { PointsPips } from './badges';

/** Round-by-round history in a side panel (UI §8): bid/won per player and the points taken. */
export function Scoreboard({
  open,
  onClose,
  history,
  seatIds,
  points,
  maxPoints,
  nameOf,
  selfId,
}: {
  open: boolean;
  onClose: () => void;
  history: RoundSummary[];
  seatIds: string[];
  points: Record<string, number>;
  maxPoints: number;
  nameOf: (id: string) => string;
  selfId: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col p-2"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          aria-label="Marcador"
        >
          <div className="panel flex min-h-0 flex-1 flex-col p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">Marcador</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 text-muted hover:text-ivory"
                aria-label="Fechar marcador"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              Cada célula: aposta/feitas. Quem falha leva o valor da ronda; aos {maxPoints} pontos perde-se.
            </p>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <th className="sticky left-0 bg-surface py-1 pr-2 text-left text-[11px] font-semibold uppercase text-subtle">
                      Ronda
                    </th>
                    {seatIds.map((id) => (
                      <th
                        key={id}
                        className={clsx(
                          'max-w-16 truncate px-1 py-1 text-center text-xs font-semibold',
                          id === selfId ? 'text-gold' : 'text-ivory/85',
                        )}
                        title={nameOf(id)}
                      >
                        {nameOf(id)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={seatIds.length + 1} className="py-4 text-center text-sm text-muted">
                        Ainda nenhuma ronda terminou.
                      </td>
                    </tr>
                  )}
                  {history.map((round) => (
                    <tr key={round.round} className="border-t border-line">
                      <td className="sticky left-0 bg-surface py-1 pr-2 text-xs text-muted">
                        <span className="font-semibold text-ivory">{round.round}</span> · {round.handSize}c
                        {round.value > 1 && <span className="text-gold"> ×{round.value}</span>}
                      </td>
                      {seatIds.map((id) => {
                        const row = round.rows.find((r) => r.playerId === id);
                        if (!row) return <td key={id} />;
                        return (
                          <td
                            key={id}
                            className={clsx(
                              'px-1 py-1 text-center tabular-nums',
                              row.failed ? 'text-danger' : 'text-ivory/80',
                            )}
                            title={`Aposta ${row.bid}, fez ${row.won}${row.failed ? `, +${row.pointsAdded}` : ''}`}
                          >
                            {row.bid}/{row.won}
                            {row.failed && <sup className="ml-0.5 text-[10px]">+{row.pointsAdded}</sup>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-surface">
                  <tr className="border-t border-line-strong">
                    <td className="sticky left-0 bg-surface py-1.5 pr-2 text-[11px] font-semibold uppercase text-subtle">
                      Pontos
                    </td>
                    {seatIds.map((id) => (
                      <td key={id} className="px-1 py-1.5 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold tabular-nums">{points[id] ?? 0}</span>
                          <PointsPips points={points[id] ?? 0} max={maxPoints} className="scale-75" />
                        </div>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
