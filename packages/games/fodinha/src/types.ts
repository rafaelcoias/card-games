import type { Card, CardId, PlayerId } from '@cardroom/game-core';

export type Phase = 'BIDDING' | 'PLAYING' | 'TRICK_RESOLVED' | 'ROUND_SCORED' | 'FINISHED';

export interface FodinhaConfig {
  maxPoints: number;
  maxHandSize: number;
  turnTimeoutMs: number;
  /** The last bidder may not make the bids add up to the number of tricks (open point #1). */
  lastBidderRestriction: boolean;
}

export interface Play {
  playerId: PlayerId;
  card: Card;
}

export interface TrickOutcome {
  /** `null` when two or more cards tie for the highest strength. */
  winner: PlayerId | null;
  /** Players whose cards tied at the top (empty when somebody won). */
  tiedPlayerIds: PlayerId[];
}

export interface Trick {
  leaderIndex: number;
  plays: Play[];
  /** Set once every player has played (phase `TRICK_RESOLVED`). */
  outcome: TrickOutcome | null;
}

export interface CompletedTrick {
  plays: Play[];
  winner: PlayerId | null;
}

export interface RoundRow {
  playerId: PlayerId;
  bid: number;
  won: number;
  failed: boolean;
  pointsAdded: number;
}

export interface RoundSummary {
  round: number;
  handSize: number;
  /** Points each failing player took (1 + carry). */
  value: number;
  rows: RoundRow[];
  carryAfter: number;
}

export interface FodinhaState {
  phase: Phase;
  config: FodinhaConfig;
  /** Clockwise order. */
  seats: PlayerId[];
  /** 1-based. */
  round: number;
  handSize: number;
  /** Bids first and opens every trick of the round. */
  starterIndex: number;
  currentIndex: number;
  /** Server-only: the only place cards live before they are played. */
  hands: Record<PlayerId, Card[]>;
  bids: Record<PlayerId, number | null>;
  tricksWon: Record<PlayerId, number>;
  trick: Trick;
  lastTrick: CompletedTrick | null;
  tricksPlayed: number;
  points: Record<PlayerId, number>;
  /** Consecutive rounds without failures: the next round is worth `1 + carry`. */
  carry: number;
  history: RoundSummary[];
  losers: PlayerId[];
  /** Secret drawn from the server's DRBG at setup; every round's shuffle derives from it. */
  seed: string;
}

export type FodinhaClientAction = { type: 'PLACE_BID'; bid: number } | { type: 'PLAY_CARD'; cardId: CardId };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`), usually because the engine scheduled them. */
export type FodinhaSystemAction =
  | { type: 'SYS_RESOLVE_TRICK_DONE' }
  | { type: 'SYS_NEXT_ROUND' }
  | { type: 'SYS_TIMEOUT' }
  /** Plays the current player's unseen card in a blind round (open point #6). */
  | { type: 'SYS_AUTO_PLAY' };

export type FodinhaAction = FodinhaClientAction | FodinhaSystemAction;

export type FodinhaEvent =
  | {
      type: 'RoundStarted';
      round: number;
      handSize: number;
      value: number;
      starterId: PlayerId;
      blind: boolean;
    }
  /** Counts only: dealt cards are never broadcast. */
  | { type: 'CardsDealt'; counts: Record<PlayerId, number> }
  | { type: 'BidPlaced'; playerId: PlayerId; bid: number; bidsSum: number }
  | { type: 'CardPlayed'; playerId: PlayerId; card: Card }
  | { type: 'TrickResolved'; winner: PlayerId | null; tiedPlayerIds: PlayerId[] }
  /** The resolved trick leaves the table; `nextLeaderId` is `null` when the round is over. */
  | { type: 'TrickCleared'; winner: PlayerId | null; nextLeaderId: PlayerId | null }
  | { type: 'RoundScored'; summary: RoundSummary }
  | {
      type: 'GameFinished';
      losers: PlayerId[];
      survivors: PlayerId[];
      points: Record<PlayerId, number>;
    };

export interface FodinhaSeatView {
  id: PlayerId;
  handCount: number;
  /** Only in blind rounds, and never for the viewer's own seat. */
  visibleHand: Card[] | null;
  bid: number | null;
  tricksWon: number;
  points: number;
  isStarter: boolean;
}

/**
 * What one player may know. Valid actions and the turn deadline travel next to
 * the view in the platform's `game:view` message.
 */
export interface FodinhaView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  round: number;
  handSize: number;
  roundValue: number;
  carry: number;
  /** One-card round: you see everyone's card but your own. */
  blind: boolean;
  maxPoints: number;
  maxHandSize: number;
  lastBidderRestriction: boolean;
  me: {
    id: PlayerId;
    /** `null` in blind rounds. */
    hand: Card[] | null;
    handCount: number;
  } | null;
  seats: FodinhaSeatView[];
  starterId: PlayerId;
  currentPlayerId: PlayerId | null;
  /** Who opened the trick on the table. */
  leaderId: PlayerId;
  bidsSum: number;
  /** Cards played in the current trick (public). */
  trick: Play[];
  /** Set while a finished trick is still on the table. */
  trickOutcome: TrickOutcome | null;
  tricksPlayed: number;
  lastTrick: CompletedTrick | null;
  history: RoundSummary[];
  losers: PlayerId[];
}
