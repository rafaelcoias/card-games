/**
 * Public runtime configuration. `NEXT_PUBLIC_*` values are inlined at build time,
 * so they must be referenced literally (no dynamic `process.env[key]`).
 * The Firebase web config is public by design; security comes from Firebase
 * Auth + the game server, never from hiding these values.
 */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  gameServerUrl: process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? 'http://localhost:4000',
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'demo-key',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'demo-cardroom.firebaseapp.com',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'demo-cardroom',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? 'demo-app',
  },
  /** Local Auth emulator ("127.0.0.1:9099"); never set in production. */
  authEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? '',
} as const;
