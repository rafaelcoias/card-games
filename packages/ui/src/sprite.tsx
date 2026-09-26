'use client';

import { useEffect } from 'react';

const SPRITE_ELEMENT_ID = 'cr-card-sprite';
let loading: Promise<void> | null = null;

/** Fetches the card sprite once and injects it into the document so `<use href="#card-…">` resolves. */
export function loadCardSprite(href: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.getElementById(SPRITE_ELEMENT_ID)) return Promise.resolve();
  loading ??= fetch(href)
    .then((response) => {
      if (!response.ok) throw new Error(`Card sprite request failed (${response.status})`);
      return response.text();
    })
    .then((markup) => {
      if (document.getElementById(SPRITE_ELEMENT_ID)) return;
      const host = document.createElement('div');
      host.id = SPRITE_ELEMENT_ID;
      host.setAttribute('aria-hidden', 'true');
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      host.innerHTML = markup;
      document.body.prepend(host);
    })
    .catch((error: unknown) => {
      loading = null;
      console.error(error);
    });
  return loading;
}

export function CardSprite({ href = '/cards/sprite.svg' }: { href?: string }) {
  useEffect(() => {
    void loadCardSprite(href);
  }, [href]);
  return null;
}
