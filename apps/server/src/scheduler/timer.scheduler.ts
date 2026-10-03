import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

/**
 * `turn`: decision deadline · `grace`: reconnect window · `system`: engine-scheduled
 * action · `expire`: a room reaching its maximum age.
 */
export type TimerKind = 'turn' | 'grace' | 'system' | 'expire';

export interface TimerJob {
  kind: TimerKind;
  roomId: string;
  /** Opaque value the handler uses to detect stale jobs. */
  token: string;
  /** Job data (e.g. the system action to apply). */
  payload?: unknown;
}

type Handler = (job: TimerJob) => Promise<void>;

const TIMERS_KEY = 'timers';
const POLL_MS = 150;
const BATCH = 25;

/**
 * Cluster-safe timers. Jobs live in a Redis sorted set scored by due time; every
 * instance polls it and claims due jobs with ZREM, so each job runs exactly once
 * even with several instances, and pending timers survive an instance restart.
 */
@Injectable()
export class TimerScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TimerScheduler.name);
  private readonly handlers = new Map<TimerKind, Handler>();
  private interval: NodeJS.Timeout | null = null;
  private polling = false;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  register(kind: TimerKind, handler: Handler): void {
    this.handlers.set(kind, handler);
  }

  async schedule(job: TimerJob, dueAt: number): Promise<void> {
    await this.redis.zadd(TIMERS_KEY, dueAt, JSON.stringify(job));
  }

  async cancel(job: TimerJob): Promise<void> {
    await this.redis.zrem(TIMERS_KEY, JSON.stringify(job));
  }

  onApplicationBootstrap(): void {
    this.interval = setInterval(() => void this.poll(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const due = await this.redis.zrangebyscore(TIMERS_KEY, 0, Date.now(), 'LIMIT', 0, BATCH);
      for (const member of due) {
        const claimed = await this.redis.zrem(TIMERS_KEY, member);
        if (claimed === 1) void this.run(member);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Timer poll failed');
    } finally {
      this.polling = false;
    }
  }

  private async run(member: string): Promise<void> {
    try {
      const job = JSON.parse(member) as TimerJob;
      const handler = this.handlers.get(job.kind);
      if (!handler) {
        this.logger.warn({ job }, 'No handler for timer');
        return;
      }
      await handler(job);
    } catch (error) {
      this.logger.error({ err: error, member }, 'Timer handler failed');
    }
  }
}
