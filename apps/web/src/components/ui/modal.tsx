'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  /** Absent: the dialog cannot be dismissed (no ✕, Escape or backdrop). */
  onClose?: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Actions pinned under the scrolling content, always in reach. */
  footer?: ReactNode;
  wide?: boolean;
  /** The whole screen on phones (long forms), a centred panel from `sm` up. */
  fullScreenOnMobile?: boolean;
}

/**
 * A dialog's open state, with a `key` that changes on every opening: give it
 * to the dialog so the form inside starts afresh each time it opens.
 */
export function useDialog() {
  const [state, setState] = useState({ open: false, key: 0 });
  const show = useCallback(() => setState((s) => ({ open: true, key: s.key + 1 })), []);
  const hide = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { open: state.open, key: state.key, show, hide };
}

/** Open dialogs; the page under them only scrolls again once the last one closes. */
let openCount = 0;

function lockPageScroll(): () => void {
  const root = document.documentElement;
  if (openCount++ === 0) root.style.overflow = 'hidden';
  return () => {
    if (--openCount === 0) root.style.overflow = '';
  };
}

/**
 * Accessible dialog: focus moves in and is restored, Escape, the ✕ and the
 * backdrop close it, and while it is open only its own content scrolls.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
  fullScreenOnMobile = false,
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const unlock = lockPageScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      unlock();
      previous?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={clsx(
            'fixed inset-0 z-[80] flex justify-center overscroll-contain bg-black/55 backdrop-blur-[2px]',
            fullScreenOnMobile ? 'items-stretch sm:items-center sm:p-3' : 'items-end p-3 sm:items-center',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={clsx(
              'panel flex w-full flex-col overflow-hidden outline-none',
              wide ? 'max-w-xl' : 'max-w-md',
              fullScreenOnMobile
                ? 'max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-h-[92dvh]'
                : 'max-h-[92dvh]',
            )}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <header
              className={clsx(
                'flex shrink-0 items-start gap-3 px-6 pt-6',
                fullScreenOnMobile && 'max-sm:pt-[max(1.25rem,env(safe-area-inset-top))]',
              )}
            >
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-display text-2xl font-semibold tracking-tight">
                  {title}
                </h2>
                {description && <div className="mt-1.5 text-sm text-muted">{description}</div>}
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-white/10 hover:text-ivory"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              )}
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-5">{children}</div>
            {footer && (
              <footer className="shrink-0 border-t border-line px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
