'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useToasts } from '@/lib/toast';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={() => dismiss(t.id)}
            className={clsx(
              'pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-md',
              t.tone === 'error' && 'border-danger/40 bg-[#2a1416]/90 text-[#ffd9da]',
              t.tone === 'success' && 'border-success/40 bg-[#10261a]/90 text-[#d5f5e1]',
              t.tone === 'info' && 'border-line-strong bg-surface-2/90 text-ivory',
            )}
          >
            {t.text}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
