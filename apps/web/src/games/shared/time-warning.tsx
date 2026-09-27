'use client';

import { useEffect, useState } from 'react';
import type { TimerLike } from './turn-ring';

const WARN_BEFORE_MS = 5_000;

/**
 * Pulsing red glow on the screen edges during the last seconds of the
 * player's own decision. Keyed per timer, so every new turn starts clean.
 */
export function TimeWarning({ timer }: { timer: TimerLike | null }) {
  if (!timer) return null;
  return <EdgeGlow key={timer.receivedAt} timer={timer} />;
}

function EdgeGlow({ timer }: { timer: TimerLike }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const remaining = timer.remainingMs - (performance.now() - timer.receivedAt);
    if (remaining <= 0) return;
    const start = window.setTimeout(
      () => {
        setActive(true);
        // A short buzz on phones that support it (ignored elsewhere).
        navigator.vibrate?.([60, 90, 60]);
      },
      Math.max(0, remaining - WARN_BEFORE_MS),
    );
    const stop = window.setTimeout(() => setActive(false), remaining + 400);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stop);
    };
  }, [timer]);

  if (!active) return null;
  return (
    <>
      <div aria-hidden="true" className="time-warning pointer-events-none fixed inset-0 z-[75]" />
      <p className="sr-only" role="alert">
        Faltam poucos segundos para jogares.
      </p>
    </>
  );
}
