import { Module, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { Auth } from 'firebase-admin/auth';
import type { App } from 'firebase-admin/app';
import { FirebaseTokenVerifier, TokenVerifier } from './auth/token-verifier';
import { HttpAuthGuard } from './auth/http-auth.guard';
import { ENV, loadEnv, type Env } from './config/env';
import { createGameRegistry } from './games/game-registry.provider';
import { GAME_REGISTRY } from './games/tokens';
import {
  GamesController,
  HealthController,
  MeController,
  PlayersController,
  PresenceController,
  RoomsController,
} from './http/controllers';
import { PresenceService } from './presence/presence.service';
import {
  createFirebaseApp,
  createFirebaseAuth,
  createFirestore,
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIRESTORE,
} from './firebase/firebase';
import { ActionLog } from './persistence/action-log';
import { MatchesRepository, ProfilesRepository, RoomsRepository } from './persistence/repositories';
import { GameGateway } from './realtime/game.gateway';
import { RealtimeEmitter } from './realtime/realtime.emitter';
import { RedisModule } from './redis/redis.module';
import { RoomCloser } from './rooms/room-closer';
import { RoomStore } from './rooms/room.store';
import { RoomsService } from './rooms/rooms.service';
import { TimerScheduler } from './scheduler/timer.scheduler';
import { GameSessionsService } from './sessions/game-sessions.service';
import { RoomPublisher } from './sessions/room-publisher';

/** Human-readable logs in local development (pino-pretty is a dev dependency); JSON elsewhere. */
function prettyLogs(env: Env): boolean {
  if (env.NODE_ENV !== 'development') return false;
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createAppModule(env: Env = loadEnv()) {
  @Module({
    imports: [
      LoggerModule.forRoot({
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        pinoHttp: {
          level: env.LOG_LEVEL,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          transport: prettyLogs(env) ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        },
      }),
      RedisModule.forRoot(env),
    ],
    controllers: [
      HealthController,
      GamesController,
      RoomsController,
      MeController,
      PlayersController,
      PresenceController,
    ],
    providers: [
      { provide: ENV, useValue: env },
      { provide: GAME_REGISTRY, useFactory: createGameRegistry },
      { provide: FIREBASE_APP, useFactory: () => createFirebaseApp(env) },
      { provide: FIRESTORE, inject: [FIREBASE_APP], useFactory: (app: App) => createFirestore(app) },
      { provide: FIREBASE_AUTH, inject: [FIREBASE_APP], useFactory: (app: App) => createFirebaseAuth(app) },
      {
        provide: TokenVerifier,
        inject: [FIREBASE_AUTH],
        useFactory: (auth: Auth) => new FirebaseTokenVerifier(auth),
      },
      HttpAuthGuard,
      ActionLog,
      ProfilesRepository,
      RoomsRepository,
      MatchesRepository,
      RoomStore,
      RoomCloser,
      TimerScheduler,
      RealtimeEmitter,
      RoomPublisher,
      GameSessionsService,
      RoomsService,
      PresenceService,
      GameGateway,
    ],
  })
  class AppModule {}
  return AppModule;
}
