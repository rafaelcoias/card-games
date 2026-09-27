'use client';

import type { DomainEvent } from '@cardroom/game-core';
import type { GameViewMessage, TurnTimer } from '@cardroom/shared';
import { useFlights, type FlightRequest } from '@cardroom/ui';
import { useEffect, useRef, useState } from 'react';
import { gameFeed, type GameUpdate } from '@/lib/realtime/game-feed';

export interface TimerSnapshot extends TurnTimer {
  /** `performance.now()` when the message arrived; remaining time counts down from here. */
  receivedAt: number;
}

/** What a table shows; `dealing` makes freshly mounted cards fly in from the deck. */
export interface BaseScene {
  matchId: string;
  dealing: boolean;
}

/** One animated step: the scene after an event, and how to present it. */
export interface Step<Scene, Fx> {
  scene: Scene;
  /** How long to hold before the next step (ms, before any speed-up). */
  waitMs: number;
  flights: FlightRequest[];
  fx: Fx[];
}

export interface Choreography<View, Event extends DomainEvent, Scene extends BaseScene, Fx> {
  /** Scene equal to an authoritative view; `previous` lets it keep card identities for animation. */
  fromView(matchId: string, seq: number, view: View, previous?: Scene | null): Scene;
  applyEvent(scene: Scene, event: Event): Step<Scene, Fx>;
  /** Whether a first view is the opening deal (animated) rather than a resync. */
  isOpeningDeal(message: GameViewMessage<View, unknown>): boolean;
  /** How long a deal animation runs once its cards are on screen. */
  dealDurationMs(scene: Scene): number;
}

export interface DirectorState<Scene, Action> {
  scene: Scene | null;
  validActions: Action[];
  timer: TimerSnapshot | null;
  /** True while events are being animated; input is held until the view is committed. */
  animating: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Turns the ordered stream of (events, view) updates into animated scene
 * transitions. Updates are processed strictly in order; when several are queued
 * the waits are compressed so the table catches up instead of lagging behind.
 */
export function useDirector<View, Action, Event extends DomainEvent, Scene extends BaseScene, Fx>(
  choreography: Choreography<View, Event, Scene, Fx>,
  onFx: (fx: Fx) => void,
): DirectorState<Scene, Action> {
  type Update = GameUpdate<View, Action, Event> & { arrivedAt: number };
  const launchFlights = useFlights();
  const [state, setState] = useState<DirectorState<Scene, Action>>(() => {
    const latest = gameFeed.latestView() as Update['message'] | null;
    return latest
      ? {
          scene: choreography.fromView(latest.matchId, latest.seq, latest.view),
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
  const choreographyRef = useRef(choreography);
  useEffect(() => {
    fxRef.current = onFx;
    choreographyRef.current = choreography;
  });

  useEffect(() => {
    let disposed = false;
    const play = () => choreographyRef.current;

    const setScene = (scene: Scene) => {
      sceneRef.current = scene;
      setState((s) => ({ ...s, scene }));
    };

    /** Lets a deal finish before the table takes input again. */
    const settleDeal = async (hurry: number) => {
      const scene = sceneRef.current;
      if (!scene?.dealing) return;
      await sleep(play().dealDurationMs(scene) * hurry);
      if (disposed) return;
      setScene({ ...(sceneRef.current as Scene), dealing: false });
    };

    const present = async (update: Update) => {
      const { message, events } = update;
      const current = sceneRef.current;
      const hurry = () => (queue.current.length > 0 ? 0.35 : 1);

      if (!current || current.matchId !== message.matchId || message.snapshot) {
        const fresh = play().fromView(message.matchId, message.seq, message.view);
        setScene({ ...fresh, dealing: !message.snapshot && play().isOpeningDeal(message) });
        await settleDeal(1);
        if (disposed) return;
      } else {
        setState((s) => ({ ...s, animating: true, validActions: [], timer: null }));
        let scene = current;
        for (const event of events) {
          const next = play().applyEvent(scene, event);
          scene = next.scene;
          setScene(scene);
          if (next.flights.length > 0) launchFlights(next.flights);
          for (const fx of next.fx) fxRef.current(fx);
          await sleep(next.waitMs * hurry());
          if (disposed) return;
        }
        setScene(play().fromView(message.matchId, message.seq, message.view, scene));
        await settleDeal(hurry());
        if (disposed) return;
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
      queue.current.push({ ...(update as GameUpdate<View, Action, Event>), arrivedAt: performance.now() });
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
