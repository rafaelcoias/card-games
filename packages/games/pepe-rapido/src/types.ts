import type { CardInstance, PlayerId } from '@cardroom/game-core';

/**
 * `COUNTDOWN`: 3-2-1 before both turn a card over (round start, every flip).
 * `PLAYING`: both play at once, no turns. `STALLED`: nobody can play to the
 * centre (grouping and moving still allowed). `CHOOSING_PILE`: whoever emptied
 * their columns takes a pile. `ROUND_SETUP`: the new columns are laid out.
 */
export type Phase = 'COUNTDOWN' | 'PLAYING' | 'STALLED' | 'CHOOSING_PILE' | 'ROUND_SETUP' | 'FINISHED';

export type Direction = 'UP_DOWN' | 'UP_ONLY';
export type Preset = 'CLASSICO' | 'PURO' | 'INICIANTE' | 'PERSONALIZADO';
/** The two centre piles, left and right; player `i` turns their cards over onto pile `i`. */
export type PileIndex = 0 | 1;

/** Room settings (rules §9, contract §1). Frozen at setup: the engine never reads the room mid-match. */
export interface PepeConfig {
  preset: Preset;
  direction: Direction;
  jokers: boolean;
  aceKingWrap: boolean;
  grouping: boolean;
  moveToEmpty: boolean;
  showCentreCounts: boolean;
  showOwnReserveCount: boolean;
  showOpponentCounts: boolean;
  countdownMs: number;
  autoFlip: boolean;
  autoFlipDelayMs: number;
  rematch: boolean;
}

export interface PlayerArea {
  /** Five columns; the last card of each is its top, face up. */
  columns: CardInstance[][];
  /** Face down; the last card is turned over first. */
  reserve: CardInstance[];
  wantsFlip: boolean;
}

export interface PepeState {
  phase: Phase;
  config: PepeConfig;
  /** `players[i]` turns cards over onto `centre[i]`. */
  players: [PlayerId, PlayerId];
  areas: Record<PlayerId, PlayerArea>;
  /** Server-only beyond their tops: how many cards each pile holds is hidden by default. */
  centre: [CardInstance[], CardInstance[]];
  round: number;
  /** Emptied their columns this round and chooses a pile. */
  roundWinner: PlayerId | null;
  winner: PlayerId | null;
  /** The game ended in a stalemate (rules out of the kit: see `MAX_IDLE_RECYCLES`). */
  deadlock: boolean;
  /** Countdowns started so far: ties a countdown's end to the countdown it closes. */
  flips: number;
  /** Times the centre went back under the columns with no card played since (09 #7). */
  idleRecycles: number;
  /** Secret drawn from the server's DRBG at setup; keys the shuffles between rounds. */
  seed: string;
}

export type PepeClientAction =
  /**
   * The top card of a column onto a centre pile. `cardUid` is the card the
   * player moves and `expectedTopUid` the card they saw on the pile: if either
   * changed meanwhile (the other player was faster), the play is refused.
   */
  | { type: 'PLAY_TO_CENTRE'; cardUid: string; column: number; pile: PileIndex; expectedTopUid: string }
  /** The top card of a column onto another column topped by the same rank (or a joker). */
  | { type: 'GROUP'; cardUid: string; fromColumn: number; toColumn: number }
  /** The top card of a column into an empty column. */
  | { type: 'MOVE_TO_EMPTY'; cardUid: string; fromColumn: number; toColumn: number }
  /** "Virar": once everyone with a reserve asks, a countdown starts and they turn a card over. */
  | { type: 'REQUEST_FLIP' }
  /** Whoever emptied their columns takes a pile; the other player takes the other one. */
  | { type: 'CHOOSE_PILE'; pile: PileIndex };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`). */
export type PepeSystemAction =
  | { type: 'SYS_COUNTDOWN_DONE'; flip: number }
  | { type: 'SYS_ROUND_SETUP_DONE'; round: number }
  /** A stall (or a pending "Virar") ran out of time: the flip happens without waiting for everyone. */
  | { type: 'SYS_AUTO_FLIP' };

export type PepeAction = PepeClientAction | PepeSystemAction;

/**
 * Broadcast to the room, so they never carry what the views hide: no count of
 * the centre piles or reserves, no face-down card. A refused action is told
 * only to its author, by the action's acknowledgement.
 */
export type PepeEvent =
  | {
      type: 'Played';
      playerId: PlayerId;
      column: number;
      pile: PileIndex;
      card: CardInstance;
      /** The column's new top, now face up. */
      revealed: CardInstance | null;
    }
  | {
      type: 'Grouped' | 'MovedToEmpty';
      playerId: PlayerId;
      from: number;
      to: number;
      card: CardInstance;
      revealed: CardInstance | null;
    }
  | { type: 'FlipRequested'; playerId: PlayerId }
  | { type: 'Stalled' }
  | { type: 'CountdownStarted'; flip: number }
  /** By pile: the card each player turned over, `null` for a player without a reserve. */
  | { type: 'Flipped'; cards: [CardInstance | null, CardInstance | null] }
  /** Nobody had a reserve: each player's pile went back under their columns, shuffled (09 #7). */
  | { type: 'Recycled' }
  | { type: 'ColumnsEmptied'; playerId: PlayerId }
  | { type: 'PileChosen'; playerId: PlayerId; pile: PileIndex }
  | { type: 'RoundSetUp'; round: number }
  | { type: 'GameWon'; playerId: PlayerId }
  /** Still stuck after many reshuffles: fewer cards wins (`null`: as many each). */
  | { type: 'Deadlocked'; winner: PlayerId | null };

export interface ColumnView {
  top: CardInstance | null;
  /** Face-down cards under the top (a stack's thickness is in sight). */
  hiddenCount: number;
}

export interface PepeSideView {
  id: PlayerId;
  /** The centre pile this player turns their cards over onto. */
  pile: PileIndex;
  columns: ColumnView[];
  hasReserve: boolean;
  /** Own reserve with `showOwnReserveCount`; the other's with `showOpponentCounts`; else `null`. */
  reserveCount: number | null;
  /** The other player's cards in all (columns and reserve), with `showOpponentCounts`; else `null`. */
  totalCount: number | null;
  wantsFlip: boolean;
}

export interface CentrePileView {
  top: CardInstance | null;
  /** Only with `showCentreCounts`: the choice of a pile is blind by default. */
  count: number | null;
}

/** What one player may know. Valid actions and the timer travel next to it in `game:view`. */
export interface PepeView {
  phase: Phase;
  round: number;
  config: PepeConfig;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  /** The viewer first (spectators: in seat order). */
  sides: [PepeSideView, PepeSideView];
  centre: [CentrePileView, CentrePileView];
  /** Who must press "Virar" for the next flip (everyone with a reserve; both when nobody has one). */
  flipRequired: PlayerId[];
  roundWinner: PlayerId | null;
  canChoosePile: boolean;
  flips: number;
  winner: PlayerId | null;
  deadlock: boolean;
}
