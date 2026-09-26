'use client';

import { create } from 'zustand';

export type SoundName = 'play' | 'pickUp' | 'burn' | 'yourTurn';

const STORAGE_KEY = 'cardroom:sound';

interface SoundState {
  enabled: boolean;
  toggle: () => void;
}

/** Sounds are opt-in (off by default) and the choice persists per browser. */
export const useSoundPreference = create<SoundState>()((set, get) => ({
  enabled: typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'on',
  toggle: () => {
    const enabled = !get().enabled;
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Storage may be unavailable (private mode); the toggle still works for this session.
    }
    if (enabled) void context()?.resume();
    set({ enabled });
  },
}));

let audio: AudioContext | null = null;
function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  audio ??= new AudioContext();
  return audio;
}

/** Tiny synthesized cues — no audio assets to download. */
export function playSound(name: SoundName): void {
  if (!useSoundPreference.getState().enabled) return;
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (name === 'burn') {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(3000, now + 0.3);
    gain.gain.setValueAtTime(0.25, now);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(now);
    return;
  }

  const tones: Record<
    Exclude<SoundName, 'burn'>,
    { freq: number[]; dur: number; type: OscillatorType; vol: number }
  > = {
    play: { freq: [520], dur: 0.06, type: 'triangle', vol: 0.12 },
    pickUp: { freq: [300, 220], dur: 0.12, type: 'sine', vol: 0.14 },
    yourTurn: { freq: [660, 880], dur: 0.12, type: 'sine', vol: 0.1 },
  };
  const tone = tones[name];
  tone.freq.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + i * tone.dur;
    osc.type = tone.type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(tone.vol, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.dur + 0.02);
  });
}
