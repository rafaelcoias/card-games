'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const SuecaPreviewLoader = dynamic(() => import('./sueca-preview').then((m) => m.SuecaPreview), {
  ssr: false,
});
