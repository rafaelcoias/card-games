'use client';

import type { Ack, ErrorPayload } from '@cardroom/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface PendingAction<Action> {
  id: number;
  action: Action;
  /** The server accepted it; it stays until a later view shows it (or `CONFIRMED_TTL_MS` passes). */
  confirmedAtSeq: number | null;
  sentAt: number;
}

/** A confirmed action whose view never came (e.g. a dropped message) stops being drawn after this. */
const CONFIRMED_TTL_MS = 2500;

/**
 * Optimistic actions for fast games (Pepe Rápido, kit 04): the table draws an
 * action as done the moment it is sent, on top of the last view; the server's
 * acknowledgement either confirms it (the next view shows it for real) or
 * refuses it, and then it simply disappears — the card goes back — while
 * `onRefused` lets the table shake it. Tables apply `pending` to their view
 * with a function that skips actions that no longer apply.
 */
export function useOptimisticActions<Action>(
  send: (action: Action) => Promise<Ack>,
  seq: number,
  onRefused: (action: Action, error: ErrorPayload) => void,
): { pending: PendingAction<Action>[]; dispatch: (action: Action) => void } {
  const [pending, setPending] = useState<PendingAction<Action>[]>([]);
  const nextId = useRef(1);
  const seqRef = useRef(seq);
  const refusedRef = useRef(onRefused);
  useEffect(() => {
    seqRef.current = seq;
    refusedRef.current = onRefused;
  });

  const dispatch = useCallback(
    (action: Action) => {
      const id = nextId.current++;
      const now = performance.now();
      setPending((current) => [
        // Confirmed actions a newer view already shows (or that waited too long) are let go.
        ...current.filter(
          (p) =>
            p.confirmedAtSeq === null ||
            (p.confirmedAtSeq >= seqRef.current && now - p.sentAt < CONFIRMED_TTL_MS),
        ),
        { id, action, confirmedAtSeq: null, sentAt: now },
      ]);
      void send(action).then((ack) => {
        if (ack.ok) {
          setPending((current) =>
            current.map((p) => (p.id === id ? { ...p, confirmedAtSeq: seqRef.current } : p)),
          );
          return;
        }
        setPending((current) => current.filter((p) => p.id !== id));
        refusedRef.current(action, ack.error);
      });
    },
    [send],
  );

  // A newer view than the one current at confirmation shows the action: it is drawn from the view alone.
  const visible = useMemo(
    () => pending.filter((p) => p.confirmedAtSeq === null || p.confirmedAtSeq >= seq),
    [pending, seq],
  );
  return { pending: visible, dispatch };
}
