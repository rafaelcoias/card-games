'use client';

import type { MexicanaAction, MexicanaEvent, MexicanaView } from '@cardroom/mexicana';
import type { TurnTimer } from '@cardroom/shared';
import { useFlights } from '@cardroom/ui';
import { useEffect, useRef, useState } from 'react';
import { gameFeed, type GameUpdate } from '@/lib/realtime/game-feed';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';

export interface TimerSnapshot extends TurnTimer {
  /** `performance.now()` when the message arrived; remaining time counts down from here. */
  receivedAt: number;
}

export interface DirectorState {
  scene: Scene | null;
  validActions: MexicanaAction[];
  timer: TimerSnapshot | null;
  /** True while events are being animated; input is held until the view is committed. */
  animating: boolean;
}

type Update = GameUpdate<MexicanaView, MexicanaAction, MexicanaEvent> & { arrivedAt: number };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Turns the ordered stream of (events, view) updates into animated scene
 * transitions. Updates are processed strictly in order; when several are queued
 * the waits are compressed so the table catches up instead of lagging behind.
 */
export function useDirector(onFx: (fx: Fx) => void): DirectorState {
  const launchFlights = useFlights();
  const [state, setState] = useState<DirectorState>(() => {
    const latest = gameFeed.latestView() as Update['message'] | null;
    return latest
      ? {
          scene: sceneFromView(latest.matchId, latest.seq, latest.view),
          validActions: latest.validActions,
          timer: latest.timer ? { ...latest.timer, receivedAt: performance.now() } : null,
          animating: false,
        }
      : { scene: null, validActions: [], timer: null, animating: false };
  });

  const sceneRef = useRef<Scene | null>(state.scene);
  const queue = useRef<Update[]>([]);
  const running = useRef(false);
  const fxRef = useRef(onFx);
  useEffect(() => {
    fxRef.current = onFx;
  });

  useEffect(() => {
    let disposed = false;

    const setScene = (scene: Scene) => {
      sceneRef.current = scene;
      setState((s) => ({ ...s, scene }));
    };

    const present = async (update: Update) => {
      const { message, events } = update;
      const current = sceneRef.current;
      const hurry = () => (queue.current.length > 0 ? 0.35 : 1);

      if (!current || current.matchId !== message.matchId || message.snapshot) {
        const fresh = sceneFromView(message.matchId, message.seq, message.view);
        const isOpeningDeal = !message.snapshot && message.seq === 0 && message.view.phase === 'CHOOSING';
        setScene({ ...fresh, dealing: isOpeningDeal });
        if (isOpeningDeal) {
          await sleep(dealDurationMs(fresh.seats.length));
          if (disposed) return;
          setScene({ ...(sceneRef.current as Scene), dealing: false });
        }
      } else {
        setState((s) => ({ ...s, animating: true, validActions: [], timer: null }));
        let scene = current;
        for (const event of events) {
          const next = applyEvent(scene, event);
          scene = next.scene;
          setScene(scene);
          if (next.flights.length > 0) launchFlights(next.flights);
          for (const fx of next.fx) fxRef.current(fx);
          await sleep(next.waitMs * hurry());
          if (disposed) return;
        }
        setScene(sceneFromView(message.matchId, message.seq, message.view, scene));
      }

      setState((s) => ({
        ...s,
        animating: false,
        validActions: message.validActions,
        timer: message.timer ? { ...message.timer, receivedAt: update.arrivedAt } : null,
      }));
    };

    const pump = async () => {
      if (running.current) return;
      running.current = true;
      while (queue.current.length > 0 && !disposed) {
        await present(queue.current.shift() as Update);
      }
      running.current = false;
    };

    const unsubscribe = gameFeed.subscribe((update) => {
      queue.current.push({
        ...(update as GameUpdate<MexicanaView, MexicanaAction, MexicanaEvent>),
        arrivedAt: performance.now(),
      });
      void pump();
    });
    return () => {
      disposed = true;
      running.current = false;
      unsubscribe();
    };
  }, [launchFlights]);

  return state;
}
