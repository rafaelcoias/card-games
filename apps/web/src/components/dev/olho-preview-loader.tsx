'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const OlhoPreviewLoader = dynamic(() => import('./olho-preview').then((m) => m.OlhoPreview), {
  ssr: false,
});
