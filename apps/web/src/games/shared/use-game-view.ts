'use client';

import type { GameViewMessage } from '@cardroom/shared';
import { useSyncExternalStore } from 'react';
import { gameFeed } from '@/lib/realtime/game-feed';

/** Latest view message, for tables that do not need event-by-event animation. */
export function useLatestGameView<View, Action>(): GameViewMessage<View, Action> | null {
  return useSyncExternalStore(
    (onChange) => gameFeed.subscribe(onChange),
    () => gameFeed.latestView() as GameViewMessage<View, Action> | null,
    () => null,
  );
}
