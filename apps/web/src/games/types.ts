import type {
  ConfigField,
  ConfigValue,
  DisconnectPolicy,
  GameError,
  Lifecycle,
  Seating,
} from '@cardroom/game-core';
import type { Ack, MatchResult, RoomState } from '@cardroom/shared';
import type { ComponentType } from 'react';

export interface GameTableProps {
  room: RoomState;
  selfId: string;
  sendAction: (action: unknown) => Promise<Ack>;
}

/** The parts of a server `GameModule` the lobby needs (it is the same package). */
export interface GameRules {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  lifecycle: Lifecycle;
  seating?: Seating;
  disconnectPolicy?: DisconnectPolicy;
  configUi: readonly ConfigField[];
  configSchema: { parse(input: unknown): unknown };
  validateTable?(config: never, playerCount: number): GameError | null;
}

/**
 * How results read: `placement` games rank everyone (1.º, 2.º…), `survival`
 * games only have losers and survivors, `chips` sessions rank by chips won or
 * lost, `points` sessions by points won or lost over their games (Olho),
 * `teams` matches are won by a pair of partners (Sueca).
 */
export type ResultStyle = 'placement' | 'survival' | 'chips' | 'points' | 'teams';

/** Games with named seats: how the room's table shows them (seats and teams come from the module). */
export interface SeatingPresentation {
  /** In the order of play. */
  seats: readonly string[];
  teams: Readonly<Record<string, readonly string[]>>;
  /** Each seat's name (e.g. Norte). */
  labels: Readonly<Record<string, string>>;
  teamNames: Readonly<Record<string, string>>;
  /** CSS colours, sober (the two teams of a Sueca table). */
  teamColors: Readonly<Record<string, string>>;
}

/** Client-side counterpart of a server `GameModule`: presentation only. */
export interface GameClientDefinition {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  /** `SESSION`: a table people join and leave while it runs, ended by the host. */
  lifecycle: Lifecycle;
  defaultMaxPlayers: number;
  settings: readonly ConfigField[];
  /** Room settings when the host changes nothing (from the game's schema). */
  defaults: Record<string, ConfigValue>;
  /** Table-size rule shared with the server (e.g. enough cards for everyone). */
  validateTable: (config: Record<string, ConfigValue>, playerCount: number) => GameError | null;
  resultStyle: ResultStyle;
  /** What a score counts, singular and plural (e.g. peixinhos); penalty points when absent. */
  scoreUnit?: readonly [string, string];
  /** Shown under the results when nobody lost (e.g. who starts the next match). */
  resultNote?: string;
  /** Lets the table finish its last animation before the results pop up. */
  resultDelayMs: number;
  /** Players pick their seat (and so their partner) in the room. */
  seating?: SeatingPresentation;
  /** The table stops for a player who drops, instead of playing for them. */
  pausesForMissing: boolean;
  /** Game-specific details under the results (e.g. Sueca's hands). */
  ResultDetails?: ComponentType<{ result: MatchResult; selfId: string }>;
  Table: ComponentType<GameTableProps>;
}
