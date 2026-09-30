import type { VoiceSignal, VoiceSignalPayload } from '@cardroom/shared';

/** An offer that has not connected by then is thrown away and made again. */
const CONNECT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;

interface Peer {
  id: string;
  /** Identifies this connection in signals, so a stale answer or candidate is ignored. */
  cid: string;
  pc: RTCPeerConnection;
  /** The side with the lower user id makes the offer: no glare to resolve. */
  offerer: boolean;
  sender: RTCRtpSender | null;
  audio: HTMLAudioElement;
  /** Candidates that arrived before the remote description. */
  pending: RTCIceCandidateInit[];
  timer: number | null;
}

/**
 * Peer-to-peer audio between the members of a room (a full mesh; rooms seat at most 10).
 *
 * Each connection carries one `sendrecv` audio transceiver from the start, so turning a
 * microphone on or off only swaps the sent track — no renegotiation. Signals travel
 * through the game server, which relays them within the room only.
 */
export class VoiceMesh {
  private readonly peers = new Map<string, Peer>();
  private wanted = new Set<string>();
  private track: MediaStreamTrack | null = null;
  private closed = false;

  constructor(
    private readonly selfId: string,
    private readonly iceServers: RTCIceServer[],
    private readonly send: (signal: VoiceSignalPayload) => void,
    private readonly onChange: () => void = () => {},
  ) {}

  /** Opens connections to `peerIds` (offering where it is our turn) and closes the rest. */
  sync(peerIds: Iterable<string>): void {
    if (this.closed) return;
    this.wanted = new Set(peerIds);
    for (const id of [...this.peers.keys()]) if (!this.wanted.has(id)) this.drop(id);
    for (const id of this.wanted) if (!this.peers.has(id) && this.isOfferer(id)) void this.offer(id);
  }

  /** The microphone track to send to everyone, or `null` for silence. */
  setLocalTrack(track: MediaStreamTrack | null): void {
    this.track = track;
    for (const peer of this.peers.values()) void peer.sender?.replaceTrack(track).catch(() => {});
  }

  /** Members we currently hear or talk to. */
  connectedPeers(): string[] {
    return [...this.peers.values()].filter((p) => p.pc.connectionState === 'connected').map((p) => p.id);
  }

  async handleSignal({ from, cid, description, candidate }: VoiceSignal): Promise<void> {
    if (this.closed || from === this.selfId) return;
    try {
      if (description?.type === 'offer') await this.answer(from, cid, description);
      else if (description?.type === 'answer') await this.accept(from, cid, description);
      else if (candidate) await this.addCandidate(from, cid, candidate);
    } catch {
      // A broken negotiation is retried by the offerer's timeout.
    }
  }

  close(): void {
    this.closed = true;
    for (const id of [...this.peers.keys()]) this.drop(id);
  }

  private isOfferer(peerId: string): boolean {
    return this.selfId < peerId;
  }

  private async offer(id: string): Promise<void> {
    const peer = this.createPeer(id, crypto.randomUUID(), true);
    // Also covers a lost offer or answer, and a failure while building the offer.
    peer.timer = window.setTimeout(() => {
      if (peer.pc.connectionState !== 'connected') this.recover(peer);
    }, CONNECT_TIMEOUT_MS);
    try {
      const transceiver = peer.pc.addTransceiver('audio', { direction: 'sendrecv' });
      peer.sender = transceiver.sender;
      if (this.track) await peer.sender.replaceTrack(this.track);
      await peer.pc.setLocalDescription();
    } catch {
      return;
    }
    if (this.peers.get(id) !== peer || !peer.pc.localDescription) return;
    this.send({ to: id, cid: peer.cid, description: { type: 'offer', sdp: peer.pc.localDescription.sdp } });
  }

  private async answer(from: string, cid: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (this.isOfferer(from)) return;
    let peer = this.peers.get(from);
    // A new offer means the other side started over: replace our end.
    if (peer && peer.cid !== cid) {
      this.drop(from);
      peer = undefined;
    }
    peer ??= this.createPeer(from, cid, false);
    await peer.pc.setRemoteDescription(offer);
    const [transceiver] = peer.pc.getTransceivers();
    if (!transceiver) return;
    transceiver.direction = 'sendrecv';
    peer.sender = transceiver.sender;
    await peer.sender.replaceTrack(this.track);
    await peer.pc.setLocalDescription();
    if (this.peers.get(from) !== peer || !peer.pc.localDescription) return;
    this.send({ to: from, cid, description: { type: 'answer', sdp: peer.pc.localDescription.sdp } });
    await this.flushCandidates(peer);
  }

  private async accept(from: string, cid: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer || peer.cid !== cid || peer.pc.signalingState !== 'have-local-offer') return;
    await peer.pc.setRemoteDescription(answer);
    await this.flushCandidates(peer);
  }

  private async addCandidate(from: string, cid: string, candidate: RTCIceCandidateInit): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer || peer.cid !== cid) return;
    if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(candidate);
    else peer.pending.push(candidate);
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const pending = peer.pending.splice(0);
    for (const candidate of pending) await peer.pc.addIceCandidate(candidate).catch(() => {});
  }

  private createPeer(id: string, cid: string, offerer: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const audio = new Audio();
    audio.autoplay = true;
    const peer: Peer = { id, cid, pc, offerer, sender: null, audio, pending: [], timer: null };
    this.peers.set(id, peer);

    pc.onicecandidate = (event) => {
      if (event.candidate && this.peers.get(id) === peer) {
        const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = event.candidate;
        this.send({ to: id, cid, candidate: { candidate, sdpMid, sdpMLineIndex, usernameFragment } });
      }
    };
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      play(audio);
    };
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return;
      if (pc.connectionState === 'failed') this.recover(peer);
      this.onChange();
    };
    return peer;
  }

  /** Starts a failed connection over: the offerer re-offers, the other side waits for it. */
  private recover(peer: Peer): void {
    if (this.peers.get(peer.id) !== peer) return;
    this.drop(peer.id);
    if (!peer.offerer) return;
    window.setTimeout(() => {
      if (!this.closed && this.wanted.has(peer.id) && !this.peers.has(peer.id)) void this.offer(peer.id);
    }, RETRY_DELAY_MS);
  }

  private drop(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    if (peer.timer !== null) window.clearTimeout(peer.timer);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.pause();
    peer.audio.srcObject = null;
    this.onChange();
  }
}

/** Browsers may block audio until the page is clicked: try again on the next click. */
function play(audio: HTMLAudioElement): void {
  audio.play().catch(() => {
    document.addEventListener('pointerdown', () => void audio.play().catch(() => {}), { once: true });
  });
}
