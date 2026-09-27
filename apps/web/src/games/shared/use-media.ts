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

export type ViewportHeight = 'tall' | 'medium' | 'short';

/** Vertical room available to the table (phones differ a lot here). */
export function useViewportHeight(): ViewportHeight {
  const tall = useMediaQuery('(min-height: 780px)');
  const medium = useMediaQuery('(min-height: 680px)');
  return tall ? 'tall' : medium ? 'medium' : 'short';
}
