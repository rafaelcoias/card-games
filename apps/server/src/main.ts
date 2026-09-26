import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { createAppModule } from './app.module';
import { allowedOrigins, loadEnv, usesEmulators } from './config/env';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  // Local development reads apps/server/.env; deployed environments inject variables directly.
  if (existsSync('.env')) process.loadEnvFile('.env');
  const env = loadEnv();
  const app = await NestFactory.create(createAppModule(env), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: allowedOrigins(env), credentials: true });
  app.enableShutdownHooks();

  const ioAdapter = new RedisIoAdapter(app, env.REDIS_URL, allowedOrigins(env));
  await ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  await app.listen(env.PORT, '0.0.0.0');
  app
    .get(Logger)
    .log(`Game server listening on :${env.PORT}${usesEmulators(env) ? ' (Firebase emulators)' : ''}`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
