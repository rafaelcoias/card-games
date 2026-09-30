'use client';

import type { RoomState } from '@cardroom/shared';
import { useEffect, useRef, useState } from 'react';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { VoiceMesh } from '@/lib/voice/voice-mesh';
import { useVoice } from '@/lib/voice/voice-store';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];

/**
 * The room's voice chat, kept alive from the waiting room to the table. Everyone hears
 * whoever has the microphone on, so a pair of players is connected while either one talks.
 */
export function VoiceChat({ room, selfId }: { room: RoomState; selfId: string }) {
  const commands = useRoomCommands();
  const status = useRealtime((s) => s.status);
  const micOn = useVoice((s) => s.micOn);
  const track = useVoice((s) => s.track);
  const [mesh, setMesh] = useState<VoiceMesh | null>(null);
  const [peers, setPeers] = useState('');

  useEffect(() => {
    if (typeof RTCPeerConnection === 'undefined') return;
    let cancelled = false;
    let created: VoiceMesh | null = null;
    let unsubscribe = () => {};
    void commands.getVoiceConfig().then((ack) => {
      if (cancelled) return;
      const next = new VoiceMesh(
        selfId,
        ack.ok ? ack.data.iceServers : FALLBACK_ICE_SERVERS,
        commands.sendVoiceSignal,
        () => setPeers(next.connectedPeers().sort().join(',')),
      );
      created = next;
      unsubscribe = commands.onVoiceSignal((signal) => void next.handleSignal(signal));
      setMesh(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      created?.close();
      setMesh(null);
      setPeers('');
      // Leaving the room turns the microphone off.
      useVoice.getState().stopMic();
    };
  }, [commands, selfId, room.id]);

  const wanted = room.players
    .filter((p) => p.id !== selfId && p.connected && (p.voice || micOn))
    .map((p) => p.id)
    .sort()
    .join(',');
  useEffect(() => {
    mesh?.sync(wanted ? wanted.split(',') : []);
  }, [mesh, wanted]);

  useEffect(() => {
    mesh?.setLocalTrack(track);
  }, [mesh, track]);

  // The server turns the microphone off when the socket drops: turn it back on after reconnecting.
  const previousStatus = useRef(status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = status;
    if (status === 'connected' && was !== 'connected' && useVoice.getState().micOn) {
      void commands.setVoice(true);
    }
  }, [commands, status]);

  return <div hidden data-testid="voice-chat" data-peers={peers} />;
}
