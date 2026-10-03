import type { CardInstance, PlayerId } from '@cardroom/game-core';

export type Phase =
  /** Everyone looks at the two bottom cards of their grid at once (rules §4). */
  | 'INITIAL_PEEK'
  /** The player on turn may say "Gringo", then draws. */
  | 'TURN_DRAW'
  /** The player on turn holds the card they drew: swap it in or discard it. */
  | 'TURN_DECIDE'
  /** The drawn card was discarded with its power, which is being used. */
  | 'POWER'
  /** A card just reached the discard pile: one player may snap a card of the same rank (rules §7). */
  | 'SNAP_WINDOW'
  | 'FINISHED';

/** Which ranks carry the powers (rules §6). */
export type PowerSet = 'FIGURAS' | 'SETE_A_DEZ';

export type PowerType =
  /** Look at one card of another player. */
  | 'PEEK_OTHER'
  /** Swap one of your cards with one of another player's, without looking. */
  | 'BLIND_SWAP'
  /** Look at one of your own cards. */
  | 'PEEK_OWN'
  /** Look at one card of another player, then decide whether to swap it with one of yours. */
  | 'PEEK_AND_SWAP';

/** `AUTO`: one deck up to 6 players, two from 7 on (open point #11). */
export type DeckSetting = 'AUTO' | 1 | 2;

export interface GringoConfig {
  redKingValue: -3 | -1;
  powerSet: PowerSet;
  /** Off: the game ends when the deck runs out (open point #7). */
  gringoEnabled: boolean;
  /** Turns every player must have played before anyone may say "Gringo" (open point #8). */
  gringoMinTurns: number;
  snapWindowMs: number;
  decks: DeckSetting;
  initialPeekMs: number;
  turnTimeoutMs: number;
  powerTimeoutMs: number;
}

/**
 * One fixed position of a grid (contract §2). Its index never changes and is
 * never reused: a snapped card leaves the slot empty, and a penalty card takes
 * a new slot with the next index.
 */
export interface Slot {
  index: number;
  /** `null`: the card was snapped away. */
  card: CardInstance | null;
}

export interface PowerState {
  type: PowerType;
  /** `PEEKED`: the card is being looked at (and, for the king, the swap is being decided). */
  step: 'CHOOSE' | 'PEEKED';
  /** Server-only until the end of the step: the slot looked at. */
  peeked: { owner: PlayerId; index: number } | null;
}

/** What happened to the one snap a discard allows (public: the card is shown to everyone). */
export interface SnapResult {
  playerId: PlayerId;
  index: number;
  card: CardInstance;
  hit: boolean;
  /** Missed: the slot the penalty card went to (`null` when the deck was empty). */
  penaltyIndex: number | null;
}

/** The window opened by a card reaching the discard pile (rules §7). */
export interface SnapWindow {
  /** Every snap names the discard it is about, so a late one never lands on a newer card. */
  discardId: number;
  /**
   * How long the table shows the move that opened it (two cards trading places)
   * before anyone can react: the window lasts this much longer.
   */
  leadMs: number;
  /** Someone snapped: nobody else may (rules §7). */
  result: SnapResult | null;
}

export type GameEndReason = 'DECK' | 'GRINGO' | 'NO_CARDS';

export interface GringoState {
  phase: Phase;
  config: GringoConfig;
  /** Decks in the shoe (`config.decks` resolved for the table size). */
  decks: number;
  /** Clockwise. */
  seats: PlayerId[];
  /** Whose turn it is (also during their power and the snap window that follows). */
  currentIndex: number;
  /** Turns started so far (0 during the initial peek). */
  turn: number;
  turnsPlayed: Record<PlayerId, number>;
  /** Server-only, bar the moments a card may be seen. */
  grids: Record<PlayerId, Slot[]>;
  /** Server-only. The top card is `deck[0]`. */
  deck: CardInstance[];
  /** Face up; the top card is the last one. */
  discard: CardInstance[];
  /** The card the player on turn drew: only they see it. */
  drawn: CardInstance | null;
  power: PowerState | null;
  snap: SnapWindow | null;
  nextDiscardId: number;
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  /** Players who memorised their cards before the initial peek ran out. */
  peekDone: PlayerId[];
  endReason: GameEndReason | null;
}

export type GringoClientAction =
  /** "Memorizei": the initial peek is over for this player. */
  | { type: 'PEEK_DONE' }
  /** On turn, before drawing (rules §9). */
  | { type: 'CALL_GRINGO' }
  | { type: 'DRAW' }
  /** A player without cards, offered to say "Gringo", lets their turn go (rules §8). */
  | { type: 'PASS' }
  /** The drawn card takes the slot; the card that was there goes to the discard pile. */
  | { type: 'SWAP_DRAWN'; index: number }
  | { type: 'DISCARD_DRAWN'; usePower: boolean }
  /** Looks at a slot: another player's (10 / king) or one's own (queen). */
  | { type: 'POWER_PEEK'; owner: PlayerId; index: number }
  /** "Já memorizei": the card looked at with a 10 or a queen turns back before its time. */
  | { type: 'POWER_PEEK_DONE' }
  /** Jack: one's own slot with another player's, unseen. */
  | { type: 'POWER_BLIND_SWAP'; myIndex: number; owner: PlayerId; theirIndex: number }
  /** King, after looking: swap the card seen with one's own `myIndex`, or leave it. */
  | { type: 'POWER_SWAP_DECISION'; swap: boolean; myIndex?: number }
  /** Changed one's mind: the power is not used. */
  | { type: 'POWER_SKIP' }
  /** One's own card thrown on the discard `discardId`, as the same rank. */
  | { type: 'SNAP'; discardId: number; index: number };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`). */
export type GringoSystemAction =
  | { type: 'SYS_INITIAL_PEEK_END' }
  /** The power's peek has been on screen long enough. */
  | { type: 'SYS_PEEK_END' }
  | { type: 'SYS_SNAP_WINDOW_CLOSED'; discardId: number }
  | { type: 'SYS_TIMEOUT' };

export type GringoAction = GringoClientAction | GringoSystemAction;

/** A grid laid open at the end (`null`: an empty slot). */
export type RevealedGrid = { index: number; card: CardInstance | null }[];

/**
 * Broadcast to the whole room, so they only carry cards that are face up for
 * everyone: what reaches the discard pile, a missed snap, the final grids.
 * Peeks and swaps name positions, never values (rules §6).
 */
export type GringoEvent =
  | { type: 'PeekDone'; playerId: PlayerId }
  | { type: 'InitialPeekEnded' }
  | { type: 'TurnStarted'; playerId: PlayerId; turn: number }
  | { type: 'GringoCalled'; playerId: PlayerId; remaining: PlayerId[] }
  | { type: 'Drew'; playerId: PlayerId; deckCount: number }
  | { type: 'Swapped'; playerId: PlayerId; index: number; discarded: CardInstance }
  | { type: 'DiscardedDrawn'; playerId: PlayerId; card: CardInstance; power: PowerType | null }
  | { type: 'PowerSkipped'; playerId: PlayerId }
  | { type: 'Peeked'; playerId: PlayerId; owner: PlayerId; index: number }
  | { type: 'PeekEnded'; playerId: PlayerId }
  | { type: 'BlindSwapped'; playerId: PlayerId; myIndex: number; owner: PlayerId; theirIndex: number }
  | {
      type: 'PeekSwapDecided';
      playerId: PlayerId;
      swapped: boolean;
      myIndex: number | null;
      owner: PlayerId;
      theirIndex: number;
    }
  | { type: 'SnapWindowOpened'; discardId: number; card: CardInstance }
  | { type: 'SnapSucceeded'; discardId: number; playerId: PlayerId; index: number; card: CardInstance }
  | {
      type: 'SnapFailed';
      discardId: number;
      playerId: PlayerId;
      index: number;
      card: CardInstance;
      penaltyIndex: number | null;
    }
  | { type: 'PlayerOut'; playerId: PlayerId }
  | { type: 'SnapWindowClosed'; discardId: number }
  | { type: 'TurnPassed'; playerId: PlayerId }
  | {
      type: 'GameFinished';
      reason: GameEndReason;
      grids: Record<PlayerId, RevealedGrid>;
      scores: Record<PlayerId, number>;
      winners: PlayerId[];
    };

export interface SlotView {
  index: number;
  empty: boolean;
  /** The face, only while this viewer may see it (initial peek, a peek, a missed snap, the end). */
  card: CardInstance | null;
}

export interface SeatView {
  id: PlayerId;
  /** Fixed positions, by index. */
  grid: SlotView[];
  cardCount: number;
  turnsPlayed: number;
  /** Memorised during the initial peek. */
  peekDone: boolean;
}

/**
 * What one player may know (contract §6). The value of a face-down card is
 * never in it outside the moments listed on `SlotView.card`: remembering is
 * the player's job. Valid actions and the timer travel next to it.
 */
export interface GringoView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  seats: SeatView[];
  /** Whose turn it is (also during their power and the snap window that follows). */
  turnPlayerId: PlayerId | null;
  /** Starts at 1 with the first turn. */
  turn: number;
  /** Someone holds a drawn card (everyone sees its back). */
  drawnBy: PlayerId | null;
  /** Its face, for the player who drew it only. */
  drawn: CardInstance | null;
  deckCount: number;
  discardTop: CardInstance | null;
  discardCount: number;
  /** The power in use (public: everyone sees which slot is looked at). */
  power: {
    playerId: PlayerId;
    type: PowerType;
    step: 'CHOOSE' | 'PEEKED';
    target: { owner: PlayerId; index: number } | null;
  } | null;
  /** What the viewer is looking at with a power, during that step only. */
  peek: { owner: PlayerId; index: number; card: CardInstance } | null;
  snap: { discardId: number; open: boolean; result: SnapResult | null } | null;
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  /** Rounds still to play before "Gringo" may be said (0: it may); `null` when it cannot be said. */
  gringoTurnsLeft: number | null;
  rules: {
    redKingValue: -3 | -1;
    powerSet: PowerSet;
    gringoEnabled: boolean;
    gringoMinTurns: number;
    snapWindowMs: number;
    initialPeekMs: number;
    decks: number;
  };
  /** At the end: everyone's points and the winners (fewest points; ties share). */
  final: { reason: GameEndReason; scores: Record<PlayerId, number>; winners: PlayerId[] } | null;
}
