'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PolledResource<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetches `load` now and every `intervalMs` while the tab is visible (and
 * again as soon as it becomes visible). Keeps the last good data on errors.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number): PolledResource<T> {
  const [state, setState] = useState<{ data: T | null; error: boolean; loading: boolean }>({
    data: null,
    error: false,
    loading: true,
  });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const tick = useRef<() => void>(() => undefined);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const run = async () => {
      window.clearTimeout(timer);
      try {
        const data = await loadRef.current();
        if (active) setState({ data, error: false, loading: false });
      } catch {
        if (active) setState((s) => ({ ...s, error: true, loading: false }));
      }
      if (active && document.visibilityState === 'visible') {
        timer = window.setTimeout(() => void run(), intervalMs);
      }
    };
    tick.current = () => void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run();
    };
    void run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  const reload = useCallback(() => tick.current(), []);
  return { ...state, reload };
}
