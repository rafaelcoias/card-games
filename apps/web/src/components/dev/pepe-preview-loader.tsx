'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and its clock in the page, which cannot match a server render. */
export const PepePreviewLoader = dynamic(() => import('./pepe-preview').then((m) => m.PepePreview), {
  ssr: false,
});
