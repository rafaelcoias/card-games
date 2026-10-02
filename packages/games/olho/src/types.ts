import type { Card, CardId, PlayerId, Rank, SessionAction } from '@cardroom/game-core';

/** Earned by the order players run out of cards (rules §4); the first game has none. */
export type Role = 'PRESIDENTE' | 'VICE_PRESIDENTE' | 'NEUTRO' | 'VICE_OLHO' | 'OLHO';

/**
 * `EXCHANGE`: cards are dealt and the roles swap cards. `GAME_SUMMARY`: the
 * order and the new roles are on screen before the next deal. `WAITING`: fewer
 * than three players are seated, so the next game waits for someone to sit down.
 */
export type Phase = 'EXCHANGE' | 'PLAYING' | 'GAME_SUMMARY' | 'WAITING' | 'FINISHED';

/** What closes a trick at once, the cutter opening the next one (rules §8.4). */
export type CutReason = 'JOKER' | 'QUAD' | 'FOUR_IN_A_ROW';
/** `ALL_PASSED`: nobody beat the last play (rules §8.5). */
export type CloseReason = CutReason | 'ALL_PASSED';

export interface OlhoConfig {
  /** Shown on the table instead of "Olho" (rules §10). */
  displayName: string;
  /** A 2 or a joker may be the last card of a hand. */
  allowFinishWithPower: boolean;
  /** Four of a rank in a row, over several plays, cut (four at once always cut). */
  fourOfAKindCuts: boolean;
  /** Whoever is about to be skipped escapes by playing the same card. */
  sameCardEscape: boolean;
  /** No 2s and no jokers in the first trick of each game. */
  firstTrickNoPower: boolean;
  turnTimeoutMs: number;
  escapeTimeoutMs: number;
  exchangeTimeoutMs: number;
}

/** Rules as players see them (the display name travels on its own). */
export type OlhoRules = Omit<OlhoConfig, 'displayName'>;

export interface TrickPlay {
  playerId: PlayerId;
  cards: Card[];
  /** Played to escape a skip (the same card as the play before). */
  escape: boolean;
}

/** Someone played the same card as the play before: the next player is about to be skipped (rules §8.3). */
export interface PendingSkip {
  targetId: PlayerId;
  rank: Rank;
  count: number;
}

export interface TrickClosing {
  reason: CloseReason;
  /** Played last: opens the next trick, or the next player in the game if they ran out of cards. */
  winnerId: PlayerId;
}

export interface Trick {
  /** 1-based, within the game. */
  number: number;
  /** No 2s nor jokers in it (`firstTrickNoPower`). */
  isFirstOfGame: boolean;
  /** Opened (or is to open) the trick. */
  leaderId: PlayerId | null;
  /** Cards per play: `null` until the trick is opened. */
  count: number | null;
  /** Rank of the last play. */
  topRank: Rank | null;
  plays: TrickPlay[];
  /** Passed: out of this trick (rules §8.2). */
  passed: PlayerId[];
  /** The same rank played in a row, for four-in-a-row cuts; a joker breaks it. */
  sameRankRun: { rank: Rank; cards: number } | null;
  skip: PendingSkip | null;
  lastPlayerId: PlayerId | null;
  /** Set while a decided trick stays on the table before it is cleared. */
  closing: TrickClosing | null;
}

export interface ExchangePair {
  /** Olho or Vice-olho: gives their best cards, chosen by the server. */
  giver: PlayerId;
  /** Presidente or Vice-Presidente: gives back cards of their choice. */
  receiver: PlayerId;
  count: number;
  /** The giver's best cards (fixed at the deal). */
  given: Card[];
  returned: Card[] | null;
}

/**
 * `DEALT`: hands are on the table, the best cards are about to leave.
 * `RETURNING`: the receivers choose. `DONE`: play is on (kept for the first
 * trick, so both sides can see what they swapped).
 */
export interface Exchange {
  stage: 'DEALT' | 'RETURNING' | 'DONE';
  pairs: ExchangePair[];
}

/** Everyone who sat down this session (rules §11). */
export interface SessionPlayer {
  playerId: PlayerId;
  seatIndex: number;
  points: number;
  gamesPlayed: number;
  presidentCount: number;
  olhoCount: number;
  /** Earned in the last game they played; `null` before their first one (and after sitting down again). */
  role: Role | null;
  /** `false` once they got up. */
  seated: boolean;
}

export interface GameSummary {
  gameNumber: number;
  /** Best first. */
  order: PlayerId[];
  roles: Record<PlayerId, Role>;
  pointsDelta: Record<PlayerId, number>;
}

export interface OlhoState {
  phase: Phase;
  config: OlhoConfig;
  /** Games dealt so far (the one in play, or the last one). */
  gameNumber: number;
  gamesCompleted: number;
  roster: SessionPlayer[];
  /** Players of the current game, clockwise (those who left mid-game stay until it ends). */
  seats: PlayerId[];
  /** Sat down mid-game: dealt in from the next game. */
  waiting: PlayerId[];
  /** Server-only. */
  hands: Record<PlayerId, Card[]>;
  exchange: Exchange | null;
  trick: Trick;
  /** Cards of the cleared tricks of this game. */
  discard: Card[];
  /** On turn (or deciding whether to escape a skip); `null` between tricks and outside play. */
  currentPlayerId: PlayerId | null;
  /** Out of cards, in order: their positions. */
  finishOrder: PlayerId[];
  /** Left the room during this game: they go when it ends. */
  leaving: PlayerId[];
  /** Of those, who left still holding cards — worst position first. */
  bottomOrder: PlayerId[];
  /** Only 2s/jokers left with `allowFinishWithPower` off: they pass every time (rules §9). */
  blocked: PlayerId[];
  lastGame: GameSummary | null;
  /** Secret drawn from the server's DRBG at setup: every deal and tie-break derives from it. */
  seed: string;
}

export type OlhoClientAction =
  | { type: 'PLAY'; cardIds: CardId[] }
  | { type: 'PASS' }
  /** The same card as the play before, so as not to be skipped. */
  | { type: 'ESCAPE'; cardIds: CardId[] }
  /** Let the skip happen. */
  | { type: 'ACCEPT_SKIP' }
  /** Presidente / Vice-Presidente give cards back during the exchange. */
  | { type: 'RETURN_CARDS'; cardIds: CardId[] };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`), mostly because the engine scheduled them. */
export type OlhoSystemAction =
  | { type: 'SYS_TIMEOUT' }
  | { type: 'SYS_EXCHANGE_GIVE' }
  | { type: 'SYS_EXCHANGE_TIMEOUT' }
  | { type: 'SYS_CLOSE_TRICK' }
  | { type: 'SYS_NEXT_GAME' }
  | SessionAction;

export type OlhoAction = OlhoClientAction | OlhoSystemAction;

/**
 * Broadcast to the whole room. Played cards are face up for everyone; hands
 * and the swapped cards are not, so the deal and the exchange carry counts.
 */
export type OlhoEvent =
  | {
      type: 'GameDealt';
      gameNumber: number;
      counts: Record<PlayerId, number>;
      /** Who opens the first trick; `null` when the exchange comes first. */
      leaderId: PlayerId | null;
      exchange: { giver: PlayerId; receiver: PlayerId; count: number }[];
    }
  | { type: 'ExchangeGiven'; giver: PlayerId; receiver: PlayerId; count: number }
  | { type: 'ExchangeReturned'; giver: PlayerId; receiver: PlayerId; count: number; auto: boolean }
  | { type: 'ExchangeDone'; leaderId: PlayerId }
  | { type: 'Played'; playerId: PlayerId; cards: Card[] }
  | { type: 'Escaped'; playerId: PlayerId; cards: Card[] }
  | { type: 'Passed'; playerId: PlayerId }
  /** The target holds the card and may escape (only they are prompted). */
  | { type: 'SkipPending'; targetId: PlayerId; rank: Rank; count: number }
  | { type: 'Skipped'; playerId: PlayerId }
  | { type: 'Cut'; playerId: PlayerId; reason: CutReason }
  | { type: 'TrickClosed'; winnerId: PlayerId; leaderId: PlayerId | null; reason: CloseReason }
  | { type: 'TrickCleared'; number: number; leaderId: PlayerId }
  | { type: 'PlayerFinished'; playerId: PlayerId; position: number }
  | { type: 'PlayerBlocked'; playerId: PlayerId }
  | { type: 'GameEnded'; summary: GameSummary; points: Record<PlayerId, number> }
  | { type: 'PlayerJoined'; playerId: PlayerId; seatIndex: number }
  /** Left mid-game: they are out of it and take `position` (the worst free one, unless already out). */
  | { type: 'PlayerLeaving'; playerId: PlayerId; position: number }
  | { type: 'PlayerLeft'; playerId: PlayerId }
  | { type: 'WaitingForPlayers'; seated: number }
  | { type: 'SessionFinished'; games: number };

export interface OlhoSeatView {
  id: PlayerId;
  seatIndex: number;
  handCount: number;
  role: Role | null;
  points: number;
  passed: boolean;
  /** 1 for the first out of cards; the reserved place of someone who left. */
  finishedPosition: number | null;
  blocked: boolean;
  leaving: boolean;
}

export interface OlhoTrickView {
  number: number;
  isFirstOfGame: boolean;
  leaderId: PlayerId | null;
  count: number | null;
  topRank: Rank | null;
  plays: TrickPlay[];
  passed: PlayerId[];
  sameRankRun: { rank: Rank; cards: number } | null;
  skip: PendingSkip | null;
  lastPlayerId: PlayerId | null;
  closing: TrickClosing | null;
}

export interface OlhoExchangeView {
  stage: Exchange['stage'];
  pairs: { giver: PlayerId; receiver: PlayerId; count: number; returned: boolean }[];
  /** Only for the two players of a pair: the cards they swapped. */
  mine: {
    side: 'GIVER' | 'RECEIVER';
    partnerId: PlayerId;
    count: number;
    /** The giver's best cards (the receiver sees them once they arrive). */
    given: Card[] | null;
    returned: Card[] | null;
    /** The viewer still has to give cards back. */
    mustReturn: boolean;
  } | null;
}

export interface OlhoSessionRow {
  playerId: PlayerId;
  points: number;
  gamesPlayed: number;
  presidentCount: number;
  olhoCount: number;
  role: Role | null;
  seated: boolean;
}

/**
 * What one player may know. Valid actions and the decision deadline travel
 * next to the view in the platform's `game:view` message.
 */
export interface OlhoView {
  phase: Phase;
  displayName: string;
  rules: OlhoRules;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  gameNumber: number;
  gamesCompleted: number;
  me: {
    id: PlayerId;
    hand: Card[];
    role: Role | null;
    /** Sat down mid-game: plays from the next one. */
    waiting: boolean;
  } | null;
  seats: OlhoSeatView[];
  waiting: PlayerId[];
  currentPlayerId: PlayerId | null;
  trick: OlhoTrickView;
  discardCount: number;
  /** Only for the player who may escape a skip. */
  skipPrompt: { rank: Rank; count: number } | null;
  exchange: OlhoExchangeView | null;
  lastGame: GameSummary | null;
  /** Everyone who sat down this session, most points first. */
  session: OlhoSessionRow[];
}
