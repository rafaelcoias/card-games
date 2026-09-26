import type {
  GameCatalogEntry,
  MatchHistoryEntry,
  MeResponse,
  ProfileDto,
  PublicRoomSummary,
  UpdateProfilePayload,
} from '@cardroom/shared';
import { publicEnv } from './env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Typed client for the game server's REST API. Works on both server and browser. */
export function createApi(getToken: () => Promise<string | null>) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const response = await fetch(`${publicEnv.gameServerUrl}/api${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string | string[];
      };
      const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      throw new ApiError(
        response.status,
        body.code ?? `HTTP_${response.status}`,
        message ?? response.statusText,
      );
    }
    return (await response.json()) as T;
  }

  return {
    me: () => request<MeResponse>('/me'),
    updateProfile: (payload: UpdateProfilePayload) =>
      request<ProfileDto>('/me/profile', { method: 'PUT', body: JSON.stringify(payload) }),
    history: () => request<MatchHistoryEntry[]>('/me/matches'),
    publicRooms: () => request<PublicRoomSummary[]>('/rooms/public'),
    games: () => request<GameCatalogEntry[]>('/games'),
  };
}

export type Api = ReturnType<typeof createApi>;
