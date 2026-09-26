'use client';

import type { CardId } from '@cardroom/game-core';
import { motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { rectCenter, useAnchors } from './anchors';
import { Card } from './card';
import { CARD_WIDTH, type CardSize } from './cards';
import { transitionFor } from './motion-tokens';

export interface FlightRequest {
  cardId?: CardId | null;
  from: string;
  to: string;
  size: CardSize;
  /** Seconds. */
  delay?: number;
  kind?: 'deal' | 'draw' | 'play' | 'pickUp';
  fromRotate?: number;
  toRotate?: number;
  /** Shrink to this card size on arrival (e.g. into a compact opponent seat). */
  toSize?: CardSize;
}

interface Flight extends FlightRequest {
  key: number;
  dx: number;
  dy: number;
  x0: number;
  y0: number;
}

type Launch = (requests: FlightRequest[]) => void;

const FlightContext = createContext<Launch | null>(null);

/**
 * Overlay for cards travelling between containers that cannot share a
 * `layoutId` (hidden hands, the stock). Each flyer is a fixed-position element
 * animated with transform/opacity only and removed once it lands.
 */
export function FlightLayer({ children }: { children: ReactNode }) {
  const anchors = useAnchors();
  const reduced = useReducedMotion() ?? false;
  const [flights, setFlights] = useState<Flight[]>([]);

  const launch = useCallback<Launch>(
    (requests) => {
      const created: Flight[] = [];
      for (const request of requests) {
        const from = anchors.rect(request.from);
        const to = anchors.rect(request.to);
        if (!from || !to) continue;
        const start = rectCenter(from);
        const end = rectCenter(to);
        created.push({
          ...request,
          key: Math.random(),
          x0: start.x,
          y0: start.y,
          dx: end.x - start.x,
          dy: end.y - start.y,
        });
      }
      if (created.length > 0) setFlights((current) => [...current, ...created]);
    },
    [anchors],
  );

  const land = useCallback(
    (key: number) => setFlights((current) => current.filter((f) => f.key !== key)),
    [],
  );

  return (
    <FlightContext.Provider value={launch}>
      {children}
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 60 }}>
        {flights.map((flight) => {
          const width = CARD_WIDTH[flight.size];
          const endScale = flight.toSize ? CARD_WIDTH[flight.toSize] / width : 1;
          return (
            <motion.div
              key={flight.key}
              style={{ position: 'absolute', left: flight.x0 - width / 2, top: 0, willChange: 'transform' }}
              initial={{
                x: 0,
                y: flight.y0 - cardHalfHeight(flight.size),
                rotate: flight.fromRotate ?? 0,
                scale: 1,
              }}
              animate={{
                x: flight.dx,
                y: flight.y0 - cardHalfHeight(flight.size) + flight.dy,
                rotate: flight.toRotate ?? 0,
                scale: endScale,
              }}
              transition={transitionFor(flight.kind ?? 'play', reduced, flight.delay ?? 0)}
              onAnimationComplete={() => land(flight.key)}
            >
              <Card id={flight.cardId} faceDown={!flight.cardId} size={flight.size} />
            </motion.div>
          );
        })}
      </div>
    </FlightContext.Provider>
  );
}

function cardHalfHeight(size: CardSize): number {
  return CARD_WIDTH[size] / (250 / 350) / 2;
}

export function useFlights(): Launch {
  const launch = useContext(FlightContext);
  return useMemo(() => launch ?? (() => undefined), [launch]);
}
