'use client';

import clsx from 'clsx';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

export interface TimerLike {
  remainingMs: number;
  totalMs: number;
  /** `performance.now()` when the server message arrived. */
  receivedAt: number;
}

export interface TurnRingProps {
  active: boolean;
  timer: TimerLike | null;
  size: number;
  children: ReactNode;
}

/** Avatar decoration for the player on turn: pulsing halo + circular countdown. */
export function TurnRing({ active, timer, size, children }: TurnRingProps) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {active && (
        <span
          aria-hidden="true"
          className="absolute animate-pulse-ring rounded-full ring-2 ring-gold/70"
          style={{ inset: -4 }}
        />
      )}
      {active && timer && <Countdown key={timer.receivedAt} timer={timer} size={size} />}
      {children}
    </span>
  );
}

/**
 * The sweep is a single CSS animation started once per turn (keyed on the
 * timer), so React does no per-frame work.
 */
function Countdown({ timer, size }: { timer: TimerLike; size: number }) {
  const [remaining] = useState(() => Math.max(0, timer.remainingMs - (performance.now() - timer.receivedAt)));
  const urgent = useUrgent(remaining);
  const stroke = 3;
  const radius = size / 2 + 5;
  const box = radius * 2 + stroke * 2;
  const circumference = 2 * Math.PI * radius;
  const from = circumference * (1 - remaining / timer.totalMs);

  return (
    <svg
      aria-hidden="true"
      width={box}
      height={box}
      className="pointer-events-none absolute -rotate-90"
      style={{ left: (size - box) / 2, top: (size - box) / 2 }}
    >
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        stroke="rgb(0 0 0 / 0.35)"
        strokeWidth={stroke}
      />
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        className={clsx('transition-[stroke] duration-300', urgent ? 'stroke-danger' : 'stroke-gold')}
        style={
          {
            strokeDashoffset: from,
            animation: `cr-countdown ${remaining}ms linear forwards`,
            '--cr-from': `${from}px`,
            '--cr-to': `${circumference}px`,
          } as CSSProperties
        }
      />
    </svg>
  );
}

/** Flips to `true` for the last 5 seconds. */
function useUrgent(remainingMs: number): boolean {
  const [urgent, setUrgent] = useState(remainingMs <= 5_000);
  useEffect(() => {
    if (remainingMs <= 5_000) return;
    const timer = window.setTimeout(() => setUrgent(true), remainingMs - 5_000);
    return () => window.clearTimeout(timer);
  }, [remainingMs]);
  return urgent;
}

/** Whole seconds left, refreshed a few times per second (textual countdown). */
export function useSecondsLeft(timer: TimerLike | null): number | null {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  return Math.max(0, Math.ceil((timer.remainingMs - (now - timer.receivedAt)) / 1000));
}
