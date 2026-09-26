import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import { createRedisClient } from '../redis/redis.module';

/**
 * Socket.IO adapter backed by Redis pub/sub so that rooms, broadcasts and
 * `fetchSockets`/`disconnectSockets` work across every server instance.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;
  private clients: ReturnType<typeof createRedisClient>[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly origins: string[],
  ) {
    super(app);
  }

  async connect(): Promise<void> {
    const pub = createRedisClient(this.redisUrl);
    const sub = pub.duplicate();
    await Promise.all([pub.ping(), sub.ping()]);
    this.clients = [pub, sub];
    this.adapterFactory = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: true },
      pingInterval: 10_000,
      pingTimeout: 8_000,
      maxHttpBufferSize: 64 * 1024,
      connectionStateRecovery: undefined,
    }) as Server;
    if (this.adapterFactory) server.adapter(this.adapterFactory);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.clients.map((client) => client.quit().catch(() => undefined)));
  }
}
