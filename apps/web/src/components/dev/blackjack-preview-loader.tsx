'use client';

import dynamic from 'next/dynamic';

/** Client-only: the preview runs the engine and fakes live timers, which cannot match a server render. */
export const BlackjackPreviewLoader = dynamic(
  () => import('./blackjack-preview').then((m) => m.BlackjackPreview),
  { ssr: false },
);
