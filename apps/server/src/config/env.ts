import type { VoiceConfig } from '@cardroom/shared';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    /** Comma-separated list of allowed browser origins. */
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /** Firebase project id (optional when it can be read from the service account). */
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),
    /** Service account key: the downloaded JSON, raw or base64-encoded. */
    FIREBASE_SERVICE_ACCOUNT: z.string().min(1).optional(),
    /** Set to use the local Emulator Suite (read by the Admin SDK itself). */
    FIRESTORE_EMULATOR_HOST: z.string().min(1).optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),

    RECONNECT_GRACE_MS: z.coerce.number().int().min(5_000).default(60_000),
    /** Delay before the server plays for an away player, so humans can follow what happened. */
    AWAY_ACTION_DELAY_MS: z.coerce.number().int().min(0).default(1_200),

    /** Voice chat relay for players whose network blocks peer-to-peer audio (comma-separated `turn:` URLs). */
    VOICE_TURN_URLS: z.string().min(1).optional(),
    VOICE_TURN_USERNAME: z.string().min(1).optional(),
    VOICE_TURN_CREDENTIAL: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (!env.FIREBASE_SERVICE_ACCOUNT && !env.FIREBASE_PROJECT_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_SERVICE_ACCOUNT'],
        message: 'Set FIREBASE_SERVICE_ACCOUNT (or FIREBASE_PROJECT_ID when using the emulators)',
      });
    }
    // Emulator tokens are unsigned: accepting them in production would disable authentication.
    if (env.NODE_ENV === 'production' && (env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST)) {
      ctx.addIssue({
        code: 'custom',
        path: ['FIREBASE_AUTH_EMULATOR_HOST'],
        message: 'Firebase emulators are refused in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export function allowedOrigins(env: Env): string[] {
  return env.WEB_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

/** ICE servers handed to browsers for the voice chat: public STUN, plus TURN when configured. */
export function voiceConfig(env: Env): VoiceConfig {
  const iceServers: VoiceConfig['iceServers'] = [{ urls: DEFAULT_STUN_URLS }];
  const turnUrls = (env.VOICE_TURN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  if (turnUrls.length > 0) {
    iceServers.push({
      urls: turnUrls,
      username: env.VOICE_TURN_USERNAME,
      credential: env.VOICE_TURN_CREDENTIAL,
    });
  }
  return { iceServers };
}

export function usesEmulators(env: Env): boolean {
  return Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
}
