'use client';

import type { PlayerProfile } from '@cardroom/shared';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { browserApi } from '@/lib/auth/client-token';

export type PlayerState =
  { kind: 'loading' } | { kind: 'ready'; player: PlayerProfile } | { kind: 'notFound' } | { kind: 'error' };

/** Loads a public profile (stats, presence, recent matches) by username. */
export function usePlayer(username: string): PlayerState {
  const [state, setState] = useState<{ username: string; value: PlayerState }>({
    username,
    value: { kind: 'loading' },
  });

  useEffect(() => {
    let active = true;
    browserApi
      .player(username)
      .then((player) => active && setState({ username, value: { kind: 'ready', player } }))
      .catch((error: unknown) => {
        if (!active) return;
        const notFound = error instanceof ApiError && error.status === 404;
        setState({ username, value: notFound ? { kind: 'notFound' } : { kind: 'error' } });
      });
    return () => {
      active = false;
    };
  }, [username]);

  // A new username starts from "loading" instead of showing the previous player.
  return state.username === username ? state.value : { kind: 'loading' };
}
