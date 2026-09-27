'use client';

import type { MexicanaAction, MexicanaEvent, MexicanaView } from '@cardroom/mexicana';
import {
  useDirector as useSharedDirector,
  type Choreography,
  type DirectorState,
} from '../shared/use-director';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';

export type { TimerSnapshot } from '../shared/use-director';

const choreography: Choreography<MexicanaView, MexicanaEvent, Scene, Fx> = {
  fromView: sceneFromView,
  applyEvent,
  isOpeningDeal: (message) => message.seq === 0 && message.view.phase === 'CHOOSING',
  dealDurationMs: (scene) => dealDurationMs(scene.seats.length),
};

/** Mexicana's event-by-event animation of the table. */
export function useDirector(onFx: (fx: Fx) => void): DirectorState<Scene, MexicanaAction> {
  return useSharedDirector<MexicanaView, MexicanaAction, MexicanaEvent, Scene, Fx>(choreography, onFx);
}
