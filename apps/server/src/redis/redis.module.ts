import { Global, Inject, Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');

export function createRedisClient(url: string): Redis {
  // family 0 = dual-stack lookup: Railway's private network may resolve to IPv6 only.
  return new Redis(url, { maxRetriesPerRequest: 3, family: 0 });
}

class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({})
export class RedisModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: RedisModule,
      providers: [{ provide: REDIS, useFactory: () => createRedisClient(env.REDIS_URL) }, RedisLifecycle],
      exports: [REDIS],
    };
  }
}
