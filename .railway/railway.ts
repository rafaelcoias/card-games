/**
 * Railway infrastructure for Cards (Infrastructure as Code).
 *
 *   railway config plan    # preview what would change
 *   railway config apply   # apply it
 *
 * Every service builds from this monorepo with its Dockerfile, so the root
 * directory stays the repository root. Everything runs in EU West, close to the
 * players; Firestore (nam5) is only used when connecting, starting and ending
 * a match. Secrets are never written here: FIREBASE_SERVICE_ACCOUNT is set once
 * with `railway variable set FIREBASE_SERVICE_ACCOUNT --stdin --service server`
 * and kept by preserve().
 */
import { defineRailway, github, preserve, project, redis, service, volume } from 'railway/iac';

const REGION = 'europe-west4-drams3a';
const WEB_URL = 'https://card-games-production-9d3d.up.railway.app';
const SERVER_URL = 'https://server-production-c483.up.railway.app';

/** Public Firebase web-app config (not secret: it ships in the browser bundle). */
const FIREBASE_WEB = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'AIzaSyBqANg0YqgkO_yvwEAMZUJgA92bfRvdc5k',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'card-games-6c8e0.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'card-games-6c8e0',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:174144427639:web:53560794a1314e6c9c5872',
};

const SHARED_WATCH = ['packages/**', 'pnpm-lock.yaml', 'package.json', 'turbo.json', 'tsconfig.base.json'];

export default defineRailway(() => {
  const repo = github('rafaelcoias/card-games', { branch: 'main', checkSuites: false });

  const cache = redis('Redis', { region: REGION });
  cache.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  cache.networking = { privateNetworkEndpoint: 'redis' };
  const redisVolume = volume('redis-volume', {
    alerts: { usage: { '100': {}, '80': {}, '95': {} } },
    allowOnlineResize: true,
    region: REGION,
    sizeMB: 5000,
  });

  const server = service('server', {
    source: repo,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/server/Dockerfile',
      watchPatterns: ['apps/server/**', ...SHARED_WATCH],
    },
    healthcheck: '/api/health',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
    replicas: { [REGION]: 1 },
    env: {
      NODE_ENV: 'production',
      REDIS_URL: cache.env.REDIS_URL,
      WEB_ORIGIN: WEB_URL,
      FIREBASE_SERVICE_ACCOUNT: preserve(),
    },
  });

  const web = service('web', {
    source: repo,
    build: {
      builder: 'DOCKERFILE',
      dockerfilePath: 'apps/web/Dockerfile',
      watchPatterns: ['apps/web/**', ...SHARED_WATCH],
    },
    healthcheck: '/',
    healthcheckTimeout: 60,
    deploy: { restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
    replicas: { [REGION]: 1 },
    networking: { privateNetworkEndpoint: 'card-games' },
    // NEXT_PUBLIC_* are inlined at build time: the Dockerfile declares them as ARGs.
    env: {
      NEXT_PUBLIC_SITE_URL: WEB_URL,
      NEXT_PUBLIC_GAME_SERVER_URL: SERVER_URL,
      ...FIREBASE_WEB,
    },
  });

  return project('adorable-essence', {
    resources: [cache, redisVolume, server, web],
  });
});
