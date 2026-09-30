'use client';

import {
  ErrorCode,
  type Ack,
  type ClientToServerEvents,
  type ErrorPayload,
  type JoinedRoom,
  type RoomCreatePayload,
  type ServerToClientEvents,
  type VoiceConfig,
  type VoiceSignal,
  type VoiceSignalPayload,
} from '@cardroom/shared';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '../auth/client-token';
import { endSession } from '../firebase/client';
import { publicEnv } from '../env';
import { describeError } from '../errors';
import { toast } from '../toast';
import { gameFeed } from './game-feed';
import { useRealtime } from './store';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 8_000;

/** Function-typed properties (not methods) so they can be destructured safely. */
export interface RoomCommands {
  createRoom: (payload: RoomCreatePayload) => Promise<Ack<JoinedRoom>>;
  joinRoom: (code: string) => Promise<Ack<JoinedRoom>>;
  leaveRoom: () => Promise<Ack>;
  setReady: (ready: boolean) => Promise<Ack>;
  startMatch: () => Promise<Ack>;
  /** Host ends a running SESSION table (it closes once the round in play is settled). */
  endMatch: () => Promise<Ack>;
  kick: (playerId: string) => Promise<Ack>;
  sendChat: (text: string) => Promise<Ack>;
  sendAction: (action: unknown) => Promise<Ack>;
  /** Microphone on/off in the room's voice chat. */
  setVoice: (enabled: boolean) => Promise<Ack>;
  getVoiceConfig: () => Promise<Ack<VoiceConfig>>;
  /** WebRTC signaling for another member of the room (fire-and-forget). */
  sendVoiceSignal: (signal: VoiceSignalPayload) => void;
  /** Listens for signals from the other members; returns the unsubscribe function. */
  onVoiceSignal: (handler: (signal: VoiceSignal) => void) => () => void;
  reconnect: () => void;
}

const SocketContext = createContext<RoomCommands | null>(null);

/** Ack used when the server did not answer in time (or the socket is offline). */
function networkFailure<T>(): Ack<T> {
  return { ok: false, error: { code: 'NETWORK', message: 'Sem ligação ao servidor' } };
}

/**
 * Owns the single Socket.IO connection of the signed-in user and mirrors
 * server pushes into the realtime store / game feed.
 */
export function SocketProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [socket] = useState<GameSocket>(() =>
    io(publicEnv.gameServerUrl, {
      autoConnect: false,
      transports: ['websocket'],
      reconnectionDelay: 400,
      reconnectionDelayMax: 4_000,
      auth: (cb) => {
        void getAccessToken().then((token) => cb({ token }));
      },
    }),
  );

  useEffect(() => {
    const store = useRealtime.getState;
    store().setStatus('connecting');

    socket.on('connect', () => store().setStatus('connected'));
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') return; // replaced or rejected; handled elsewhere
      store().setStatus('reconnecting');
    });
    socket.io.on('reconnect_attempt', () => store().setStatus('reconnecting'));
    socket.on('connect_error', (error) => {
      const code = (error as Error & { data?: ErrorPayload }).data?.code;
      if (code === ErrorCode.ProfileRequired) {
        router.replace('/onboarding');
      } else if (code === ErrorCode.Unauthorized) {
        // Firebase and the session cookie disagree: start clean.
        void endSession().then(() => router.replace('/login'));
      } else {
        store().setStatus('reconnecting');
        // Handshake errors are not retried automatically by Socket.IO.
        setTimeout(() => socket.connect(), 2_000);
      }
    });
    socket.on('session:replaced', () => store().setStatus('replaced'));

    socket.on('room:state', (room) => {
      const current = store().room;
      if (!current || current.id === room.id) store().setRoom(room);
    });
    socket.on('room:chat', (message) => store().addChat(message));
    socket.on('room:kicked', () => {
      store().leaveRoom();
      gameFeed.reset();
      toast.error('Foste removido da sala pelo anfitrião');
      router.replace('/lobby');
    });
    socket.on('game:events', (message) => gameFeed.pushEvents(message));
    socket.on('game:view', (message) => gameFeed.pushView(message));
    socket.on('game:finished', (result) => store().setResult(result));
    socket.on('game:error', (error) => toast.error(describeError(error)));

    socket.connect();
    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
    };
  }, [router, socket]);

  const commands = useMemo<RoomCommands>(() => {
    const call = <T,>(run: () => Promise<Ack<T>>) => run().catch(() => networkFailure<T>());
    const timed = () => socket.timeout(ACK_TIMEOUT_MS);
    return {
      createRoom: (payload) => call(() => timed().emitWithAck('room:create', payload)),
      joinRoom: (code) => call(() => timed().emitWithAck('room:join', { code })),
      leaveRoom: () => call(() => timed().emitWithAck('room:leave')),
      setReady: (ready) => call(() => timed().emitWithAck('room:ready', { ready })),
      startMatch: () => call(() => timed().emitWithAck('room:start')),
      endMatch: () => call(() => timed().emitWithAck('room:end')),
      kick: (playerId) => call(() => timed().emitWithAck('room:kick', { playerId })),
      sendChat: (text) => call(() => timed().emitWithAck('room:chat', { text })),
      sendAction: (action) => call(() => timed().emitWithAck('game:action', { action })),
      setVoice: (enabled) => call(() => timed().emitWithAck('voice:set', { enabled })),
      getVoiceConfig: () => call(() => timed().emitWithAck('voice:config')),
      sendVoiceSignal: (signal) => {
        socket.emit('voice:signal', signal);
      },
      onVoiceSignal: (handler) => {
        socket.on('voice:signal', handler);
        return () => {
          socket.off('voice:signal', handler);
        };
      },
      reconnect: () => {
        useRealtime.getState().setStatus('connecting');
        socket.connect();
      },
    };
  }, [socket]);

  return <SocketContext.Provider value={commands}>{children}</SocketContext.Provider>;
}

export function useRoomCommands(): RoomCommands {
  const commands = useContext(SocketContext);
  if (!commands) throw new Error('useRoomCommands must be used inside <SocketProvider>');
  return commands;
}
