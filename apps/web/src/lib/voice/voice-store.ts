'use client';

import { create } from 'zustand';

interface VoiceState {
  /** Microphone on: our track is sent to everyone in the room. */
  micOn: boolean;
  /** Waiting for the browser's microphone permission. */
  busy: boolean;
  track: MediaStreamTrack | null;
  /** Stops the microphone (the browser's recording indicator goes off). */
  stopMic: () => void;
}

/**
 * The voice chat's local side. Unlike sounds, the microphone is never remembered:
 * it is off whenever you enter a room.
 */
export const useVoice = create<VoiceState>()((set, get) => ({
  micOn: false,
  busy: false,
  track: null,
  stopMic: () => {
    get().track?.stop();
    set({ micOn: false, busy: false, track: null });
  },
}));
