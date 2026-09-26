import 'server-only';
import type { MeResponse } from '@cardroom/shared';
import { createApi } from '../api';
import { getServerSession } from './session';

export type MeResult =
  { kind: 'signed-out' } | { kind: 'unavailable' } | { kind: 'ok'; me: MeResponse; accessToken: string };

/** Loads the signed-in user's profile from the game server during SSR. */
export async function loadMe(): Promise<MeResult> {
  const session = await getServerSession();
  if (!session) return { kind: 'signed-out' };
  try {
    const me = await createApi(() => Promise.resolve(session.accessToken)).me();
    return { kind: 'ok', me, accessToken: session.accessToken };
  } catch {
    return { kind: 'unavailable' };
  }
}
