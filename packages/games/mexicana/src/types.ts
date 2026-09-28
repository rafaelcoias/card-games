import type { Card, CardId, PlayerId, Rank } from '@cardroom/game-core';

export type Phase = 'CHOOSING' | 'PLAYING' | 'FINISHED';

/** Pile restriction imposed by the effective top card (see rules §7 and §10). */
export type Restriction = 'none' | 'reset' | 'maxSeven';

/** A table slot; `null` once its card has been played. */
export type Slot = Card | null;

export type CardPower = 'none' | 'reset' | 'mirror' | 'maxSeven' | 'skip' | 'burn';

export interface CardEffect {
  readonly power: CardPower;
  /** Can be played regardless of the pile (2, 3, 10 and Joker in the base rules). */
  readonly playableOnAnything: boolean;
}

export type CardEffectTable = Readonly<Record<Rank, CardEffect>>;

/** Rule knobs. Stored inside the state so variants never require engine changes. */
export interface MexicanaRules {
  readonly handSize: number;
  readonly layerSize: number;
  readonly effects: CardEffectTable;
  readonly fourOfAKindBurns: boolean;
}

export interface MexicanaPlayerState {
  hand: Card[];
  faceUp: Slot[];
  /** Card values never leave the server before being revealed. */
  faceDown: Slot[];
  hasChosenFaceUp: boolean;
  finishedPosition: number | null;
}

export interface MexicanaState {
  phase: Phase;
  players: Record<PlayerId, MexicanaPlayerState>;
  turnOrder: PlayerId[];
  currentIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  burnPile: Card[];
  restriction: Restriction;
  /** 8s awaiting resolution; always 0 between turns because skips resolve on turn advance. */
  pendingSkips: number;
  /** Consecutive same-rank cards on top of the pile (3s reset it to 0). */
  sameRankRun: number;
  nextFinishPosition: number;
  turnTimeoutMs: number;
  chooseTimeoutMs: number;
  rules: MexicanaRules;
}

export interface MexicanaConfig {
  turnTimeoutMs: number;
  chooseTimeoutMs: number;
}

export type MexicanaClientAction =
  | { type: 'CHOOSE_FACE_UP'; cardIds: [CardId, CardId, CardId] }
  | { type: 'PLAY_CARDS'; cardIds: CardId[] }
  | { type: 'PLAY_FACE_DOWN'; position: number }
  /**
   * With only face-up cards left and none of them playable, the player keeps
   * one of them along with the pile: `faceUpCardId` is required then and
   * refused otherwise (the face-up twin of a failed face-down reveal).
   */
  | { type: 'PICK_UP_PILE'; faceUpCardId?: CardId };

/**
 * `TIMEOUT_PICK_UP` is only ever produced by the server (default action). When
 * a face-up card must go along with the pile, the default action names it.
 */
export type MexicanaAction = MexicanaClientAction | { type: 'TIMEOUT_PICK_UP'; faceUpCardId?: CardId };

export type CardSource = 'hand' | 'faceUp' | 'faceDown';
export type PickUpReason = 'noValidPlay' | 'timeout' | 'faceDownFailed';
export type BurnReason = 'burnCard' | 'fourOfAKind';

export type MexicanaEvent =
  | { type: 'FaceUpChosen'; playerId: PlayerId; cards: Card[] }
  | { type: 'PlayStarted'; startingPlayerId: PlayerId }
  | { type: 'CardRevealed'; playerId: PlayerId; slot: number; card: Card; playable: boolean }
  | { type: 'CardsPlayed'; playerId: PlayerId; cards: Card[]; source: CardSource; slot?: number }
  | { type: 'PileBurned'; playerId: PlayerId; reason: BurnReason; count: number }
  | { type: 'PlayerSkipped'; playerId: PlayerId; by: PlayerId }
  | {
      type: 'PilePickedUp';
      playerId: PlayerId;
      /** The pile, then the table card that goes along with it (if any). */
      cards: Card[];
      reason: PickUpReason;
      /** Face-up slot whose unplayable card was taken along with the pile. */
      faceUpSlot?: number;
    }
  | { type: 'CardsDrawn'; playerId: PlayerId; count: number }
  | { type: 'PlayerFinished'; playerId: PlayerId; position: number }
  | { type: 'GameFinished'; loserId: PlayerId };

export interface MexicanaSeatView {
  id: PlayerId;
  handCount: number;
  faceUp: Slot[];
  /** `true` where a hidden card still lies. */
  faceDown: boolean[];
  hasChosenFaceUp: boolean;
  finishedPosition: number | null;
}

export interface MexicanaView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  /** Viewer's own hand (empty for spectators). */
  hand: Card[];
  seats: MexicanaSeatView[];
  currentPlayerId: PlayerId | null;
  discardPile: Card[];
  drawPileCount: number;
  burnPileCount: number;
  restriction: Restriction;
  /** Rank the next play is measured against, `null` when the pile imposes nothing. */
  effectiveRank: Rank | null;
  sameRankRun: number;
}
