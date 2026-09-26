import type { ActionResult, DomainEvent, GameError } from './game-module';

export function ok<State, Event extends DomainEvent>(
  state: State,
  events: readonly Event[] = [],
): ActionResult<State, Event> {
  return { ok: true, state, events };
}

export function fail<State, Event extends DomainEvent = DomainEvent>(
  code: string,
  message: string,
): ActionResult<State, Event> {
  const error: GameError = { code, message };
  return { ok: false, error };
}
