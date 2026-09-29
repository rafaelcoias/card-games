import type { Card, PlayerId, StandardRank } from '@cardroom/game-core';

export type Phase = 'PLAYING' | 'FINISHED';

/** How much of the ask history the table shows (open point #3). */
export type TableMemory = 'NONE' | 'LAST_5' | 'FULL';

export interface PeixinhoConfig {
  turnTimeoutMs: number;
  /** Cards drawn from the pond by whoever runs out of cards (rules §6). */
  refillCount: number;
  tableMemory: TableMemory;
  /** After "Vai à pesca!" the player taps a card of the pond instead of drawing the top one (open point #2). */
  pondPicking: boolean;
}

/** What happened to an ask. `caughtAsked` is `null` while the player still has to fish. */
export type AskResult =
  { type: 'GIVEN'; count: number } | { type: 'GO_FISH'; caughtAsked: boolean | null; pondEmpty: boolean };

/** One ask, in the table's public history. */
export interface AskEntry {
  seq: number;
  askerId: PlayerId;
  targetId: PlayerId;
  rank: StandardRank;
  result: AskResult;
  /** Peixinhos the asker laid down because of this ask (by the cards given, the catch or a refill). */
  peixinhosMade: StandardRank[];
}

/** An ask answered with "Vai à pesca!", waiting for the asker to take a card from the pond. */
export interface PendingFish {
  askerId: PlayerId;
  targetId: PlayerId;
  rank: StandardRank;
}

/** The card fished by the last action, if it fished (refills are not fishing). */
export interface LastFish {
  playerId: PlayerId;
  card: Card;
  caughtAsked: boolean;
  /** Pond spot it was taken from. */
  slot: number;
}

export interface PeixinhoState {
  phase: Phase;
  config: PeixinhoConfig;
  /** Clockwise order. */
  seats: PlayerId[];
  currentIndex: number;
  /** Server-only: nobody sees another player's hand. */
  hands: Record<PlayerId, Card[]>;
  /** Ranks laid down by each player, in the order they were made. */
  peixinhos: Record<PlayerId, StandardRank[]>;
  /** Server-only. The top card is `pond[0]`; the order is fixed by the shuffle. */
  pond: Card[];
  /**
   * Spots of the cards still in the pond, as drawn on the table (0 … pondSize − 1).
   * Purely visual: a spot says nothing about the card, which is always the top one.
   */
  pondSlots: number[];
  pondSize: number;
  awaitingFish: PendingFish | null;
  askLog: AskEntry[];
  lastFish: LastFish | null;
  /** Actions applied so far (numbers the asks and varies the timeout's random target). */
  actionCount: number;
  winners: PlayerId[];
  /** Secret drawn from the server's DRBG at setup. */
  seed: string;
}

export type PeixinhoClientAction =
  | { type: 'ASK'; targetId: PlayerId; rank: StandardRank }
  /** Only after "Vai à pesca!" with `pondPicking`. The spot is visual: the top card is always drawn. */
  | { type: 'FISH'; pondPosition?: number };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`): plays the current player's default action. */
export type PeixinhoSystemAction = { type: 'SYS_TIMEOUT' };

export type PeixinhoAction = PeixinhoClientAction | PeixinhoSystemAction;

/**
 * Broadcast to the whole room, so they never name a card nobody else may see:
 * refills carry a count, and a fished card only travels when it is the rank asked.
 */
export type PeixinhoEvent =
  | { type: 'Asked'; askerId: PlayerId; targetId: PlayerId; rank: StandardRank }
  /** Every card of the rank asked; the rank was public already. */
  | { type: 'CardsGiven'; from: PlayerId; to: PlayerId; rank: StandardRank; cards: Card[] }
  /** `awaitingPick`: the asker now taps a card of the pond. */
  | {
      type: 'GoFish';
      askerId: PlayerId;
      targetId: PlayerId;
      rank: StandardRank;
      pondEmpty: boolean;
      awaitingPick: boolean;
    }
  /** `card` only when it is the rank asked (it is shown to everyone). */
  | {
      type: 'Fished';
      playerId: PlayerId;
      rank: StandardRank;
      slot: number;
      caughtAsked: boolean;
      card: Card | null;
    }
  /** Laid face up: its four cards are public. `extraTurn` when it lets the player go again. */
  | { type: 'PeixinhoMade'; playerId: PlayerId; rank: StandardRank; cards: Card[]; extraTurn: boolean }
  | { type: 'Refilled'; playerId: PlayerId; count: number; slots: number[] }
  /** No cards and an empty pond: skipped until the end. */
  | { type: 'PlayerOut'; playerId: PlayerId }
  | { type: 'TurnPassed'; from: PlayerId; to: PlayerId }
  | { type: 'GameFinished'; winners: PlayerId[]; peixinhos: Record<PlayerId, number> };

export interface PeixinhoSeatView {
  id: PlayerId;
  handCount: number;
  peixinhos: StandardRank[];
  /** Out of cards with the pond empty. */
  out: boolean;
}

/**
 * What one player may know. Valid actions and the turn deadline travel next to
 * the view in the platform's `game:view` message.
 */
export interface PeixinhoView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  me: { id: PlayerId; hand: Card[] } | null;
  seats: PeixinhoSeatView[];
  currentPlayerId: PlayerId | null;
  awaitingFish: PendingFish | null;
  pondCount: number;
  pondSize: number;
  pondSlots: number[];
  /** Filtered by `tableMemory`. */
  askLog: AskEntry[];
  /** `card` is `null` for other viewers unless it was the rank asked. */
  lastFish: (Omit<LastFish, 'card'> & { card: Card | null }) | null;
  tableMemory: TableMemory;
  refillCount: number;
  pondPicking: boolean;
  peixinhosTotal: number;
  winners: PlayerId[];
}
