'use client';

import type { ErrorPayload } from '@cardroom/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useProfile } from '@/components/app/profile-context';
import { Spinner } from '@/components/ui/spinner';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { GameStage } from './game-stage';
import { RoomLobby } from './room-lobby';
import { VoiceChat } from './voice-chat';

/** Joins the room by code, then shows the waiting room or the live table. */
export function RoomScreen({ code }: { code: string }) {
  const profile = useProfile();
  const { joinRoom } = useRoomCommands();
  const status = useRealtime((s) => s.status);
  const room = useRealtime((s) => s.room);
  const result = useRealtime((s) => s.result);
  const [error, setError] = useState<ErrorPayload | null>(null);

  const connected = status === 'connected';
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void joinRoom(code).then((ack) => {
      if (cancelled) return;
      if (ack.ok) {
        const store = useRealtime.getState();
        if (store.room && store.room.id !== ack.data.room.id) gameFeed.reset();
        store.enterRoom(ack.data.room, ack.data.chat);
        setError(null);
      } else {
        setError(ack.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, connected, joinRoom]);

  // A new match started while the previous results were still open: drop them.
  useEffect(() => {
    if (result && room?.status === 'PLAYING' && room.matchId && room.matchId !== result.matchId) {
      useRealtime.getState().setResult(null);
    }
  }, [result, room?.status, room?.matchId]);

  if (error) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="font-display text-2xl font-semibold">Não foi possível entrar na sala</p>
        <p className="text-muted">{describeError(error)}</p>
        <Link href="/lobby" className="font-semibold text-gold hover:text-gold-strong">
          ← Voltar às salas
        </Link>
      </div>
    );
  }

  if (!room || room.code !== code) {
    return (
      <div className="flex items-center justify-center gap-3 py-32 text-muted" role="status">
        <Spinner className="size-5" /> A entrar na sala {code}…
      </div>
    );
  }

  const showTable = room.status === 'PLAYING' || result !== null;
  return (
    <>
      <VoiceChat room={room} selfId={profile.id} />
      {showTable ? (
        <GameStage room={room} selfId={profile.id} />
      ) : (
        <RoomLobby room={room} selfId={profile.id} />
      )}
    </>
  );
}
