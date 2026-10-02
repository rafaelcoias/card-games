'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const GringoPreviewLoader = dynamic(() => import('./gringo-preview').then((m) => m.GringoPreview), {
  ssr: false,
});
