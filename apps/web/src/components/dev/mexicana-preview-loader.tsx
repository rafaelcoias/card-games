'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const MexicanaPreviewLoader = dynamic(
  () => import('./mexicana-preview').then((m) => m.MexicanaPreview),
  { ssr: false },
);
