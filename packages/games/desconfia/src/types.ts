import type { Card, CardId, PlayerId, StandardRank } from '@cardroom/game-core';

export type Phase = 'PLAYING' | 'FINISHED';

export interface DesconfiaConfig {
  turnTimeoutMs: number;
  /** After a play, the next player waits this long so everyone can doubt it (rules §5). */
  doubtMinWindowMs: number;
  /** A play that empties the hand stays open to doubts this long before it wins (rules §5, §7). */
  lastCardWindowMs: number;
  /** Keep playing after the first winner to give everyone a position (open point #4). */
  playUntilEnd: boolean;
}

/** One play on the pile. Server-only: the cards never leave it unless the play is doubted. */
export interface PilePlay {
  playId: number;
  playerId: PlayerId;
  cards: Card[];
  claimRank: StandardRank;
}

/** What everyone knows of a play: who, how many, which rank was claimed. */
export interface PublicPlay {
  playId: number;
  playerId: PlayerId;
  count: number;
  claimRank: StandardRank;
}

/**
 * The last play is open to doubts until the next player plays (but at least
 * `doubtMinWindowMs`), or for `lastCardWindowMs` when it emptied the hand.
 */
export interface DoubtWindow {
  playId: number;
  /** Author of the play. */
  playerId: PlayerId;
  /** The minimum has passed: the next player may play. */
  minElapsed: boolean;
  /** The play emptied the author's hand: nobody plays until it is settled. */
  lastCard: boolean;
}

/** A doubted play, turned over for everyone. */
export interface Reveal {
  playId: number;
  /** Author of the play. */
  playerId: PlayerId;
  doubterId: PlayerId;
  claimRank: StandardRank;
  cards: Card[];
  truthful: boolean;
  /** Took the pile. */
  loserId: PlayerId;
  /** Starts the next pile (unless they just won). */
  winnerId: PlayerId;
}

/** Four of a kind that left the game (rules §6). */
export interface Removed {
  rank: StandardRank;
  playerId: PlayerId;
}

export interface DesconfiaState {
  phase: Phase;
  config: DesconfiaConfig;
  /** Clockwise order. */
  seats: PlayerId[];
  /** Whose turn it is to play (ignored while a last card is open to doubts). */
  currentIndex: number;
  /** Server-only. */
  hands: Record<PlayerId, Card[]>;
  /** Server-only: the plays of the current pile, oldest first. */
  pile: PilePlay[];
  /** Rank every play must claim; `null` on a new pile (any rank). */
  claimRank: StandardRank | null;
  doubtWindow: DoubtWindow | null;
  /** The last doubt, until the next play. */
  lastReveal: Reveal | null;
  removed: Removed[];
  /** Players out of cards, in the order they finished. */
  finishedOrder: PlayerId[];
  nextPlayId: number;
  /** Secret drawn from the server's DRBG at setup (keys the timeout's random choices). */
  seed: string;
}

export type DesconfiaClientAction =
  /** Any cards of the hand, face down, claimed as one rank (it may be a lie). */
  | { type: 'PLAY'; cardIds: CardId[]; claimRank: StandardRank }
  /** About the play `playId` only, so a late doubt never lands on a newer play. */
  | { type: 'DOUBT'; playId: number };

/** Applied by the server only (as `SYS_PLAYER_ID`), usually because the engine scheduled them. */
export type DesconfiaSystemAction =
  | { type: 'SYS_WINDOW_MIN_ELAPSED'; playId: number }
  | { type: 'SYS_LAST_CARD_WINDOW_CLOSED'; playId: number }
  | { type: 'SYS_TIMEOUT' };

export type DesconfiaAction = DesconfiaClientAction | DesconfiaSystemAction;

/**
 * Broadcast to the whole room, so they never name a card nobody may see: a
 * play carries its count; only a doubted play is turned over.
 */
export type DesconfiaEvent =
  | {
      type: 'Played';
      playId: number;
      playerId: PlayerId;
      count: number;
      claimRank: StandardRank;
      lastCard: boolean;
    }
  /** The 2 s are over: the next player may play. */
  | { type: 'WindowMinElapsed'; playId: number; nextPlayerId: PlayerId }
  | { type: 'DoubtCalled'; playId: number; doubterId: PlayerId; authorId: PlayerId }
  | {
      type: 'Revealed';
      playId: number;
      authorId: PlayerId;
      doubterId: PlayerId;
      claimRank: StandardRank;
      cards: Card[];
      truthful: boolean;
    }
  /** The whole pile goes to the loser of the doubt (counts only). */
  | { type: 'PileTaken'; playerId: PlayerId; count: number }
  /** Four of a kind leave the game, face up. */
  | { type: 'PeixinhoRemoved'; playerId: PlayerId; rank: StandardRank; cards: Card[] }
  | { type: 'NewPile'; starterId: PlayerId }
  /** Nobody doubted the last card in time: the turn moves on, the pile stays. */
  | { type: 'TurnPassed'; to: PlayerId }
  | { type: 'PlayerWon'; playerId: PlayerId; position: number }
  | { type: 'GameFinished'; finishedOrder: PlayerId[]; handCounts: Record<PlayerId, number> };

export interface DesconfiaSeatView {
  id: PlayerId;
  handCount: number;
  /** 1 for the first out of cards; `null` while playing. */
  finishedPosition: number | null;
}

/**
 * What one player may know. Valid actions and the turn deadline travel next to
 * the view in the platform's `game:view` message.
 */
export interface DesconfiaView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  me: { id: PlayerId; hand: Card[] } | null;
  seats: DesconfiaSeatView[];
  /** Plays next (still waiting for the window's minimum, if any); `null` while a last card is open. */
  currentPlayerId: PlayerId | null;
  pileCount: number;
  claimRank: StandardRank | null;
  /** The plays of the current pile, without their cards. */
  pilePlays: PublicPlay[];
  doubtWindow: DoubtWindow | null;
  lastReveal: Reveal | null;
  removed: Removed[];
  finishedOrder: PlayerId[];
  doubtMinWindowMs: number;
  lastCardWindowMs: number;
  playUntilEnd: boolean;
}
