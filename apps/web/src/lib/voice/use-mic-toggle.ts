'use client';

import { describeError } from '../errors';
import { useRoomCommands } from '../realtime/socket-provider';
import { toast } from '../toast';
import { useVoice } from './voice-store';

/** Turns the microphone on (asking the browser for it) or off, and tells the room. */
export function useMicToggle() {
  const { setVoice } = useRoomCommands();
  const micOn = useVoice((s) => s.micOn);
  const busy = useVoice((s) => s.busy);

  const turnOff = () => {
    useVoice.getState().stopMic();
    void setVoice(false);
  };

  const turnOn = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error('Este browser não permite usar o microfone');
      return;
    }
    useVoice.setState({ busy: true });
    let track: MediaStreamTrack | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      track = stream.getAudioTracks()[0];
    } catch {
      // Denied, or no microphone.
    }
    // Left the room while the browser was asking: nothing to turn on any more.
    if (!useVoice.getState().busy) {
      track?.stop();
      return;
    }
    if (!track) {
      useVoice.setState({ busy: false });
      toast.error('Não foi possível aceder ao microfone');
      return;
    }
    track.addEventListener('ended', () => {
      if (useVoice.getState().track === track) turnOff();
    });
    useVoice.setState({ micOn: true, busy: false, track });
    const ack = await setVoice(true);
    if (!ack.ok && useVoice.getState().track === track) {
      useVoice.getState().stopMic();
      toast.error(describeError(ack.error));
    }
  };

  const toggle = () => {
    if (busy) return;
    if (micOn) turnOff();
    else void turnOn();
  };

  return { micOn, busy, toggle };
}
