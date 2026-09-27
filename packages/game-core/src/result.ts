import type { ActionResult, DomainEvent, GameError, ScheduledAction } from './game-module';

export function ok<State, Event extends DomainEvent>(
  state: State,
  events: readonly Event[] = [],
  schedule?: readonly ScheduledAction[],
): ActionResult<State, Event> {
  return schedule && schedule.length > 0
    ? { ok: true, state, events, schedule }
    : { ok: true, state, events };
}

export function fail<State, Event extends DomainEvent = DomainEvent>(
  code: string,
  message: string,
): ActionResult<State, Event> {
  const error: GameError = { code, message };
  return { ok: false, error };
}
