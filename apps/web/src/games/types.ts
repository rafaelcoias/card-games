import type { Ack, RoomState } from '@cardroom/shared';
import type { ComponentType } from 'react';

export interface GameTableProps {
  room: RoomState;
  selfId: string;
  sendAction: (action: unknown) => Promise<Ack>;
}

export interface SettingOption {
  label: string;
  value: number;
}

export interface GameSetting {
  key: string;
  label: string;
  options: SettingOption[];
  defaultValue: number;
}

/** Client-side counterpart of a server `GameModule`: presentation only. */
export interface GameClientDefinition {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;
  defaultMaxPlayers: number;
  settings: GameSetting[];
  Table: ComponentType<GameTableProps>;
}
