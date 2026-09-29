'use client';

import type { AskEntry, TableMemory } from '@cardroom/peixinho';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { logLine, plural } from './copy';

/**
 * The table's memory (UI §7): the latest asks, newest first. How many depends
 * on the room's setting; with "Nenhuma" there is nothing to show at all.
 */
export function MemoryList({
  entries,
  memory,
  selfId,
  nameOf,
  className,
}: {
  entries: readonly AskEntry[];
  memory: TableMemory;
  selfId: string | null;
  nameOf: (id: string) => string;
  className?: string;
}) {
  const newestFirst = [...entries].reverse();
  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <h3 className="flex items-baseline justify-between px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-ivory/60">
        Memória da mesa
        <span className="font-semibold normal-case tracking-normal text-ivory/40">
          {memory === 'FULL' ? 'todos os pedidos' : 'últimos 5'}
        </span>
      </h3>
      {newestFirst.length === 0 ? (
        <p className="px-1 pt-2 text-xs text-ivory/50">Ainda ninguém pediu nada.</p>
      ) : (
        <ol
          className="scrollbar-none mt-1.5 flex min-h-0 flex-col gap-1 overflow-y-auto"
          aria-label="Últimos pedidos"
        >
          <AnimatePresence initial={false}>
            {newestFirst.map((entry, i) => {
              const line = logLine(entry, selfId, nameOf);
              const given = entry.result.type === 'GIVEN';
              const caught = entry.result.type === 'GO_FISH' && entry.result.caughtAsked === true;
              return (
                <motion.li
                  key={entry.seq}
                  layout
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: i === 0 ? 1 : Math.max(0.55, 1 - i * 0.08), x: 0 }}
                  className="rounded-lg bg-black/25 px-2 py-1 text-xs leading-snug text-ivory/90"
                >
                  <span className="font-semibold">{line.who}</span> {line.verb}{' '}
                  <strong className="text-gold">{line.rank}</strong> {line.to}
                  <span
                    className={clsx('block text-[11px]', given || caught ? 'text-success' : 'text-[#9fe3e0]')}
                  >
                    — {line.outcome}
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </div>
  );
}

/** Phones and tablets: the memory opens over the table from the banner. */
export function MemoryPopover({
  open,
  onClose,
  ...list
}: Parameters<typeof MemoryList>[0] & { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute right-2 top-12 z-50 flex max-h-[min(20rem,60%)] w-72 max-w-[calc(100%-1rem)] flex-col rounded-2xl bg-ink/90 p-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur"
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.97 }}
          transition={{ duration: 0.16 }}
          role="dialog"
          aria-label="Memória da mesa"
        >
          <MemoryList {...list} className="min-h-0 flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="mt-2 self-end rounded-lg px-2 py-0.5 text-xs text-muted hover:text-ivory"
          >
            Fechar
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Top of the table (UI §8): peixinhos on the table out of 13, each player's catch, and the memory button. */
export function ScoreBanner({
  total,
  scores,
  memoryButton,
}: {
  total: number;
  scores: { id: string; name: string; count: number; self: boolean; winner: boolean }[];
  memoryButton: { open: boolean; onToggle: () => void } | null;
}) {
  return (
    <div className="relative z-30 flex shrink-0 items-center gap-2 px-3 pt-2">
      <span
        className="shrink-0 rounded-full bg-black/35 px-3 py-1 text-sm font-semibold tabular-nums backdrop-blur-sm"
        title="Peixinhos já pousados"
      >
        <span aria-hidden="true">🐟 </span>
        <span className="max-sm:hidden">Peixinhos na mesa: </span>
        <span className="text-gold">{total}</span> / 13
      </span>
      <ol
        className="scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        aria-label="Peixinhos de cada jogador"
      >
        {scores.map((s) => (
          <li
            key={s.id}
            className={clsx(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              s.winner
                ? 'bg-gold text-gold-ink'
                : s.self
                  ? 'bg-white/15 text-ivory'
                  : 'bg-black/25 text-ivory/80',
            )}
            aria-label={`${s.name}: ${plural(s.count, 'peixinho', 'peixinhos')}`}
          >
            <span className="max-w-[72px] truncate">{s.name}</span>
            <span>{s.count}</span>
          </li>
        ))}
      </ol>
      {memoryButton && (
        <button
          type="button"
          aria-label="Memória da mesa"
          title="Memória da mesa"
          aria-pressed={memoryButton.open}
          onClick={memoryButton.onToggle}
          className={clsx(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-black/35 text-sm backdrop-blur-sm transition-colors hover:bg-black/55',
            memoryButton.open && 'ring-2 ring-gold/70',
          )}
        >
          <span aria-hidden="true">📜</span>
        </button>
      )}
    </div>
  );
}
