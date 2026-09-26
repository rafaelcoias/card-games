'use client';

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

/**
 * Named DOM anchors ("draw", "discard", "seat:<id>") that animations use as
 * origins/destinations when a card moves between containers that do not share
 * a `layoutId` (e.g. an opponent's hidden hand).
 */
interface AnchorRegistry {
  register(id: string, element: HTMLElement | null): void;
  rect(id: string): DOMRect | null;
}

const AnchorContext = createContext<AnchorRegistry | null>(null);

export function AnchorProvider({ children }: { children: ReactNode }) {
  const elements = useRef(new Map<string, HTMLElement>());
  const registry = useMemo<AnchorRegistry>(
    () => ({
      register(id, element) {
        if (element) elements.current.set(id, element);
        else elements.current.delete(id);
      },
      rect(id) {
        return elements.current.get(id)?.getBoundingClientRect() ?? null;
      },
    }),
    [],
  );
  return <AnchorContext.Provider value={registry}>{children}</AnchorContext.Provider>;
}

export function useAnchors(): AnchorRegistry {
  const registry = useContext(AnchorContext);
  if (!registry) throw new Error('useAnchors must be used inside <AnchorProvider>');
  return registry;
}

/** Ref callback registering the element under `id`. */
export function useAnchorRef<T extends HTMLElement>(id: string): (element: T | null) => void {
  const anchors = useAnchors();
  return useCallback((element: T | null) => anchors.register(id, element), [anchors, id]);
}

export function rectCenter(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
