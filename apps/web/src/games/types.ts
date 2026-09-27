import type { ConfigField, ConfigValue, GameError } from '@cardroom/game-core';
import type { Ack, RoomState } from '@cardroom/shared';
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
  configUi: readonly ConfigField[];
  configSchema: { parse(input: unknown): unknown };
  validateTable?(config: never, playerCount: number): GameError | null;
}

/**
 * How results read: `placement` games rank everyone (1.º, 2.º…), `survival`
 * games only have losers and survivors.
 */
export type ResultStyle = 'placement' | 'survival';

/** Client-side counterpart of a server `GameModule`: presentation only. */
export interface GameClientDefinition {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  defaultMaxPlayers: number;
  settings: readonly ConfigField[];
  /** Room settings when the host changes nothing (from the game's schema). */
  defaults: Record<string, ConfigValue>;
  /** Table-size rule shared with the server (e.g. enough cards for everyone). */
  validateTable: (config: Record<string, ConfigValue>, playerCount: number) => GameError | null;
  resultStyle: ResultStyle;
  /** Lets the table finish its last animation before the results pop up. */
  resultDelayMs: number;
  Table: ComponentType<GameTableProps>;
}
