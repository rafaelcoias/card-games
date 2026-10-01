'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const DesconfiaPreviewLoader = dynamic(
  () => import('./desconfia-preview').then((m) => m.DesconfiaPreview),
  { ssr: false },
);
