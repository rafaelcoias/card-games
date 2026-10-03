import type { ChatMessage, MatchResult, RoomCloseReason, RoomState } from '@cardroom/shared';
import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'replaced' | 'failed';

interface RealtimeState {
  status: ConnectionStatus;
  room: RoomState | null;
  chat: ChatMessage[];
  /** Result of the match that just ended (shown until dismissed). */
  result: MatchResult | null;
  /** The room closed while its last results were on screen: they stay until dismissed. */
  closed: RoomCloseReason | null;
  unreadChat: number;
  setStatus: (status: ConnectionStatus) => void;
  setRoom: (room: RoomState | null) => void;
  enterRoom: (room: RoomState, chat: ChatMessage[]) => void;
  addChat: (message: ChatMessage) => void;
  markChatRead: () => void;
  setResult: (result: MatchResult | null) => void;
  setClosed: (reason: RoomCloseReason) => void;
  leaveRoom: () => void;
}

export const useRealtime = create<RealtimeState>()((set) => ({
  status: 'idle',
  room: null,
  chat: [],
  result: null,
  closed: null,
  unreadChat: 0,
  setStatus: (status) => set({ status }),
  setRoom: (room) => set({ room }),
  enterRoom: (room, chat) => set({ room, chat, unreadChat: 0, closed: null }),
  addChat: (message) =>
    set((state) => ({ chat: [...state.chat, message].slice(-100), unreadChat: state.unreadChat + 1 })),
  markChatRead: () => set({ unreadChat: 0 }),
  setResult: (result) => set({ result }),
  setClosed: (closed) => set({ closed }),
  leaveRoom: () => set({ room: null, chat: [], result: null, closed: null, unreadChat: 0 }),
}));
