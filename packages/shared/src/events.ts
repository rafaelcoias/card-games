import type { AckCallback, ErrorPayload } from './errors';
import type {
  ChatMessage,
  GameEventsMessage,
  GameViewMessage,
  JoinedRoom,
  MatchResult,
  RoomCloseReason,
  RoomState,
  VoiceConfig,
} from './models';
import type {
  GameActionPayload,
  RoomChatPayload,
  RoomConfigurePayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomKickPayload,
  RoomReadyPayload,
  VoiceSetPayload,
  VoiceSignal,
  VoiceSignalPayload,
} from './schemas';

export const ClientEvent = {
  RoomCreate: 'room:create',
  RoomConfigure: 'room:configure',
  RoomJoin: 'room:join',
  RoomLeave: 'room:leave',
  RoomReady: 'room:ready',
  RoomStart: 'room:start',
  RoomKick: 'room:kick',
  RoomEnd: 'room:end',
  RoomChat: 'room:chat',
  GameAction: 'game:action',
  VoiceSet: 'voice:set',
  VoiceConfig: 'voice:config',
  VoiceSignal: 'voice:signal',
} as const;

export const ServerEvent = {
  RoomState: 'room:state',
  RoomChat: 'room:chat',
  RoomKicked: 'room:kicked',
  RoomClosed: 'room:closed',
  GameView: 'game:view',
  GameEvents: 'game:events',
  GameError: 'game:error',
  GameFinished: 'game:finished',
  PlayerReconnected: 'player:reconnected',
  PlayerDisconnected: 'player:disconnected',
  SessionReplaced: 'session:replaced',
  VoiceSignal: 'voice:signal',
} as const;

/** Typed Socket.IO contract: `io<ServerToClientEvents, ClientToServerEvents>()`. */
export interface ClientToServerEvents {
  [ClientEvent.RoomCreate]: (payload: RoomCreatePayload, ack: AckCallback<JoinedRoom>) => void;
  /** Host, between matches: another game, or other rules, for the same players. */
  [ClientEvent.RoomConfigure]: (payload: RoomConfigurePayload, ack: AckCallback) => void;
  [ClientEvent.RoomJoin]: (payload: RoomJoinPayload, ack: AckCallback<JoinedRoom>) => void;
  [ClientEvent.RoomLeave]: (ack: AckCallback) => void;
  [ClientEvent.RoomReady]: (payload: RoomReadyPayload, ack: AckCallback) => void;
  [ClientEvent.RoomStart]: (ack: AckCallback) => void;
  [ClientEvent.RoomKick]: (payload: RoomKickPayload, ack: AckCallback) => void;
  /** Host ends a running SESSION game (e.g. a blackjack table). */
  [ClientEvent.RoomEnd]: (ack: AckCallback) => void;
  [ClientEvent.RoomChat]: (payload: RoomChatPayload, ack: AckCallback) => void;
  [ClientEvent.GameAction]: (payload: GameActionPayload, ack: AckCallback) => void;
  /** Turns the sender's microphone on/off (shown to everyone in the room). */
  [ClientEvent.VoiceSet]: (payload: VoiceSetPayload, ack: AckCallback) => void;
  [ClientEvent.VoiceConfig]: (ack: AckCallback<VoiceConfig>) => void;
  /** WebRTC signaling for another member of the room: fire-and-forget. */
  [ClientEvent.VoiceSignal]: (payload: VoiceSignalPayload) => void;
}

export interface ServerToClientEvents {
  [ServerEvent.RoomState]: (room: RoomState) => void;
  [ServerEvent.RoomChat]: (message: ChatMessage) => void;
  [ServerEvent.RoomKicked]: (payload: { roomId: string }) => void;
  [ServerEvent.RoomClosed]: (payload: { roomId: string; reason: RoomCloseReason }) => void;
  [ServerEvent.GameView]: (message: GameViewMessage) => void;
  [ServerEvent.GameEvents]: (message: GameEventsMessage) => void;
  [ServerEvent.GameError]: (error: ErrorPayload) => void;
  [ServerEvent.GameFinished]: (result: MatchResult) => void;
  [ServerEvent.PlayerReconnected]: (payload: { playerId: string }) => void;
  [ServerEvent.PlayerDisconnected]: (payload: { playerId: string }) => void;
  [ServerEvent.SessionReplaced]: () => void;
  [ServerEvent.VoiceSignal]: (signal: VoiceSignal) => void;
}
