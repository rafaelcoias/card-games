import type { AnyGameModule } from '@cardroom/game-core';

export interface TimerDecision {
  /** `true` when a fresh deadline must be set; `false` keeps the current one. */
  reset: boolean;
}

/**
 * Decides whether an applied action starts a new decision window:
 * - the turn moved to someone else, or
 * - the acting player acts again (e.g. after burning the pile), or
 * - someone who was not already pending now owes an action (new round).
 * Otherwise the running deadline is kept, so in simultaneous phases players
 * who already acted cannot extend the others' time.
 */
export function decideTimerReset(
  module: AnyGameModule,
  before: unknown,
  after: unknown,
  actor: string,
): TimerDecision {
  if (module.isFinished(after)) return { reset: false };
  const beforeCurrent = module.getCurrentPlayer(before);
  const afterCurrent = module.getCurrentPlayer(after);
  if (afterCurrent !== beforeCurrent) return { reset: true };
  if (afterCurrent !== null && afterCurrent === actor) return { reset: true };
  const pendingBefore = new Set(module.getPendingPlayers(before));
  return { reset: module.getPendingPlayers(after).some((id) => !pendingBefore.has(id)) };
}

/**
 * How long the next decision window lasts. When everyone who owes an action is
 * away, the server acts for them after a short, human-followable delay instead
 * of burning the whole turn timer.
 */
export function decisionWindowMs(
  module: AnyGameModule,
  state: unknown,
  awayPlayerIds: ReadonlySet<string>,
  awayDelayMs: number,
): number | null {
  const timeout = module.getTimeoutMs(state);
  if (timeout === null) return null;
  const pending = module.getPendingPlayers(state);
  if (pending.length > 0 && pending.every((id) => awayPlayerIds.has(id)))
    return Math.min(timeout, awayDelayMs);
  return timeout;
}
