'use client';

import { useSyncExternalStore } from 'react';

/** Subscribes to a CSS media query (false during SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export type TableLayout = 'phone' | 'tablet' | 'desktop';

export function useTableLayout(): TableLayout {
  const desktop = useMediaQuery('(min-width: 1024px) and (min-height: 700px)');
  const tablet = useMediaQuery('(min-width: 640px)');
  return desktop ? 'desktop' : tablet ? 'tablet' : 'phone';
}

export interface Viewport {
  width: number;
  height: number;
}

/** Height of the match header above every table (`GameStage`). */
export const STAGE_HEADER = 48;

let cachedViewport: Viewport = { width: 0, height: 0 };

/** The window's inner size, following resizes (0 × 0 during SSR). Tables fit their cards to it. */
export function useViewport(): Viewport {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => {
      const { innerWidth: width, innerHeight: height } = window;
      if (cachedViewport.width !== width || cachedViewport.height !== height)
        cachedViewport = { width, height };
      return cachedViewport;
    },
    () => cachedViewport,
  );
}
