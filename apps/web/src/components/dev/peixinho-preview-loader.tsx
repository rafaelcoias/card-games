'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const PeixinhoPreviewLoader = dynamic(
  () => import('./peixinho-preview').then((m) => m.PeixinhoPreview),
  { ssr: false },
);
