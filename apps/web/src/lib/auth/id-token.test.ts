import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createIdTokenVerifier } from './id-token';

const PROJECT = 'cardroom-test';
const ISSUER = `https://securetoken.google.com/${PROJECT}`;

let privateKey: CryptoKey;
let verify: ReturnType<typeof createIdTokenVerifier>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  verify = createIdTokenVerifier({
    projectId: PROJECT,
    keys: createLocalJWKSet({ keys: [jwk] }),
    emulator: false,
  });
});

function token(overrides: { iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT({ email: 'ana@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('uid-1')
    .setIssuer(overrides.iss ?? ISSUER)
    .setAudience(overrides.aud ?? PROJECT)
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? '1h')
    .sign(privateKey);
}

describe('Firebase ID token verification', () => {
  it('accepts a correctly signed token for this project', async () => {
    const identity = await verify(await token());
    expect(identity).toMatchObject({ userId: 'uid-1', email: 'ana@example.com' });
    expect(identity?.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects other projects, other issuers, expired and garbage tokens', async () => {
    expect(await verify(await token({ aud: 'another-project' }))).toBeNull();
    expect(await verify(await token({ iss: 'https://evil.example' }))).toBeNull();
    expect(await verify(await token({ exp: '-1m' }))).toBeNull();
    expect(await verify('not-a-jwt')).toBeNull();
  });

  it('refuses unsigned tokens unless the emulator mode is enabled', async () => {
    const unsigned = new UnsecuredJWT({ email: 'x@example.com' })
      .setSubject('uid-2')
      .setIssuer(ISSUER)
      .setAudience(PROJECT)
      .setExpirationTime('1h')
      .encode();
    expect(await verify(unsigned)).toBeNull();

    const emulatorVerify = createIdTokenVerifier({
      projectId: PROJECT,
      keys: () => Promise.reject(new Error()),
      emulator: true,
    });
    expect(await emulatorVerify(unsigned)).toMatchObject({ userId: 'uid-2' });
    const wrongProject = new UnsecuredJWT({})
      .setSubject('u')
      .setIssuer(ISSUER)
      .setAudience('x')
      .setExpirationTime('1h')
      .encode();
    expect(await emulatorVerify(wrongProject)).toBeNull();
  });
});
