'use client';

import type { SessionRow } from '@cardroom/blackjack';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { signed } from '../score';

/**
 * The session scoreboard (UI §10): chips, balance (rebuys discounted), rebuys
 * and rounds for everyone who sat down, best balance first.
 */
export function SessionPanel({
  open,
  onClose,
  rows,
  rounds,
  startingStack,
  nameOf,
  selfId,
}: {
  open: boolean;
  onClose: () => void;
  rows: SessionRow[];
  rounds: number;
  startingStack: number;
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
          aria-label="Sessão"
        >
          <div className="panel flex min-h-0 flex-1 flex-col p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">Sessão</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 text-muted hover:text-ivory"
                aria-label="Fechar sessão"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              {rounds} {rounds === 1 ? 'ronda jogada' : 'rondas jogadas'} · cada um começou com{' '}
              {startingStack} fichas, e cada recompra conta no saldo. Fichas sem valor real.
            </p>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-1 font-semibold">Jogador</th>
                    <th className="py-1 text-right font-semibold">Fichas</th>
                    <th className="py-1 text-right font-semibold">Saldo</th>
                    <th className="py-1 text-right font-semibold" title="Recompras">
                      Rec.
                    </th>
                    <th className="py-1 text-right font-semibold">Rondas</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.playerId}
                      className={clsx(
                        'border-t border-line',
                        row.playerId === selfId && 'text-gold',
                        !row.seated && 'opacity-60',
                      )}
                    >
                      <td className="max-w-40 truncate py-1.5 font-medium">
                        {nameOf(row.playerId)}
                        {!row.seated && <span className="text-xs text-subtle"> · saiu</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{row.stack}</td>
                      <td
                        className={clsx(
                          'py-1.5 text-right font-semibold tabular-nums',
                          row.net > 0 ? 'text-success' : row.net < 0 ? 'text-danger' : 'text-ivory/70',
                        )}
                      >
                        {signed(row.net)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ivory/70">{row.rebuys}</td>
                      <td className="py-1.5 text-right tabular-nums text-ivory/70">{row.roundsPlayed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
