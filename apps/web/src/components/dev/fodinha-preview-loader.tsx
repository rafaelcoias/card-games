'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const FodinhaPreviewLoader = dynamic(() => import('./fodinha-preview').then((m) => m.FodinhaPreview), {
  ssr: false,
});
