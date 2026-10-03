'use client';

import type { Seat } from '@cardroom/sueca';
import { Card, useAnchorRef } from '@cardroom/ui';
import clsx from 'clsx';
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { TimerLike } from '../shared/turn-ring';
import { ANCHORS } from './scene';

/** The element's outer size (padding included), kept up to date. */
function useBorderBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setSize((previous) =>
        previous?.width === element.offsetWidth && previous.height === element.offsetHeight
          ? previous
          : { width: element.offsetWidth, height: element.offsetHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

export interface NameTagProps {
  name: string;
  /** On turn: the name turns white and the ring counts down (UI §2). */
  active: boolean;
  timer: TimerLike | null;
  dealer: boolean;
  /** The viewer's partner (and the viewer) carry a discreet stroke of their team's colour. */
  teamColor: string | null;
  absent: boolean;
  label?: string;
}

/** A player's name, white when on turn, grey otherwise, with a thin ring of time around it. */
export function NameTag({ name, active, timer, dealer, teamColor, absent, label }: NameTagProps) {
  const [ref, size] = useBorderBox<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={clsx(
        'relative inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition-colors duration-300',
        active ? 'bg-black/40 text-ivory' : 'bg-black/20 text-ivory/50',
        absent && 'opacity-60',
      )}
      aria-label={label}
    >
      {active && timer && size && <PillCountdown key={timer.receivedAt} timer={timer} size={size} />}
      <span className="truncate">{name}</span>
      {dealer && (
        <span
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-ivory/85 text-[10px] font-bold leading-none text-ink"
          title="Dá as cartas"
        >
          D
        </span>
      )}
      {teamColor && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full opacity-90"
          style={{ background: teamColor }}
        />
      )}
      {absent && <span className="text-[10px] font-normal text-ivory/60">desligado</span>}
    </div>
  );
}

/**
 * A pill-shaped ring around the name that empties as the time runs out; a
 * single CSS animation per turn, so React does no per-frame work.
 */
function PillCountdown({ timer, size }: { timer: TimerLike; size: { width: number; height: number } }) {
  const [remaining] = useState(() => Math.max(0, timer.remainingMs - (performance.now() - timer.receivedAt)));
  const [urgent, setUrgent] = useState(remaining <= 5_000);
  useEffect(() => {
    if (remaining <= 5_000) return;
    const id = window.setTimeout(() => setUrgent(true), remaining - 5_000);
    return () => window.clearTimeout(id);
  }, [remaining]);
  const stroke = 2;
  const width = size.width + 6;
  const height = size.height + 6;
  const w = width - stroke;
  const h = height - stroke;
  const perimeter = 2 * (w - h) + Math.PI * h;
  const from = perimeter * (1 - remaining / timer.totalMs);
  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      className="pointer-events-none absolute"
      style={{ left: -3, top: -3 }}
    >
      <rect
        x={stroke / 2}
        y={stroke / 2}
        width={w}
        height={h}
        rx={h / 2}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={perimeter}
        className={clsx('transition-[stroke] duration-300', urgent ? 'stroke-danger' : 'stroke-ivory/80')}
        style={
          {
            strokeDashoffset: from,
            animation: `cr-countdown ${remaining}ms linear forwards`,
            '--cr-from': `${from}px`,
            '--cr-to': `${perimeter}px`,
          } as CSSProperties
        }
      />
    </svg>
  );
}

export interface OpponentSeatProps {
  seat: Seat;
  name: string;
  handCount: number;
  active: boolean;
  timer: TimerLike | null;
  dealer: boolean;
  teamColor: string | null;
  absent: boolean;
  compact: boolean;
  /** Where the backs go: under the name, or beside it. */
  vertical: boolean;
}

/** Another player: their name and their cards, face down (UI §2). */
export const OpponentSeat = memo(function OpponentSeat({
  seat,
  name,
  handCount,
  active,
  timer,
  dealer,
  teamColor,
  absent,
  compact,
  vertical,
}: OpponentSeatProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(seat));
  const back = compact ? { width: 14, height: 20, step: 6 } : { width: 18, height: 25, step: 8 };
  return (
    <section
      className="flex flex-col items-center gap-1.5"
      aria-label={`${name}: ${handCount} ${handCount === 1 ? 'carta' : 'cartas'}${active ? ', a jogar' : ''}${absent ? ', desligado' : ''}`}
    >
      <NameTag
        name={name}
        active={active}
        timer={timer}
        dealer={dealer}
        teamColor={teamColor}
        absent={absent}
      />
      <div
        ref={anchorRef}
        aria-hidden="true"
        className={clsx('flex items-center justify-center', vertical ? 'flex-col' : 'flex-row')}
        style={{ minHeight: back.height, minWidth: back.width }}
      >
        {Array.from({ length: handCount }, (_, i) => (
          <span
            key={i}
            className="inline-block"
            style={
              vertical
                ? { marginTop: i === 0 ? 0 : -back.height + back.step }
                : { marginLeft: i === 0 ? 0 : -back.width + back.step }
            }
          >
            <Card
              faceDown
              size="xs"
              style={{ width: back.width, height: back.height, borderRadius: 3 }}
              label=""
            />
          </span>
        ))}
      </div>
    </section>
  );
});
