import type { DomainEvent } from '@cardroom/game-core';
import type { GameEventsMessage, GameViewMessage } from '@cardroom/shared';

export interface GameUpdate<View = unknown, Action = unknown, Event extends DomainEvent = DomainEvent> {
  message: GameViewMessage<View, Action>;
  /** Events that led from the previously delivered view to this one, in order. */
  events: Event[];
}

type Listener = (update: GameUpdate) => void;

/** How long a view waits for its events (they may travel on another pub/sub channel). */
const EVENT_GRACE_MS = 120;

/**
 * Pairs `game:events` with the `game:view` that follows them (matched by `seq`)
 * and delivers ordered updates to the table. Kept outside React state so bursts
 * of messages never cause intermediate renders.
 */
class GameFeed {
  private listeners = new Set<Listener>();
  private events: GameEventsMessage[] = [];
  private latest: GameViewMessage | null = null;
  private deliveredSeq = -1;
  private matchId: string | null = null;
  private pending: { message: GameViewMessage; timer: ReturnType<typeof setTimeout> } | null = null;
  /** performance.now() at which each view arrived (timers count down from there). */
  private readonly arrivals = new WeakMap<GameViewMessage, number>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  latestView(): GameViewMessage | null {
    return this.latest;
  }

  pushEvents(message: GameEventsMessage): void {
    if (message.matchId === this.matchId && message.seq <= this.deliveredSeq) return;
    this.events.push(message);
    const pending = this.pending;
    if (pending && pending.message.matchId === message.matchId && pending.message.seq === message.seq) {
      clearTimeout(pending.timer);
      this.pending = null;
      this.deliver(pending.message);
    }
  }

  arrivalOf(message: GameViewMessage): number {
    return this.arrivals.get(message) ?? performance.now();
  }

  pushView(message: GameViewMessage): void {
    this.arrivals.set(message, performance.now());
    if (message.matchId !== this.matchId) {
      this.matchId = message.matchId;
      this.deliveredSeq = -1;
      this.events = this.events.filter((e) => e.matchId === message.matchId);
    }
    if (!message.snapshot && message.seq < this.deliveredSeq) return;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.deliver(this.pending.message);
      this.pending = null;
    }
    const expectsEvents = !message.snapshot && message.seq > Math.max(0, this.deliveredSeq);
    const hasEvents = this.events.some((e) => e.seq === message.seq);
    if (expectsEvents && !hasEvents) {
      this.pending = {
        message,
        timer: setTimeout(() => {
          this.pending = null;
          this.deliver(message);
        }, EVENT_GRACE_MS),
      };
      return;
    }
    this.deliver(message);
  }

  reset(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
    this.events = [];
    this.latest = null;
    this.deliveredSeq = -1;
    this.matchId = null;
  }

  private deliver(message: GameViewMessage): void {
    const events = message.snapshot
      ? []
      : this.events
          .filter((e) => e.matchId === message.matchId && e.seq > this.deliveredSeq && e.seq <= message.seq)
          .sort((a, b) => a.seq - b.seq)
          .flatMap((e) => e.events);
    this.events = this.events.filter((e) => e.seq > message.seq);
    this.deliveredSeq = message.seq;
    this.latest = message;
    for (const listener of this.listeners) listener({ message, events });
  }
}

export const gameFeed = new GameFeed();
