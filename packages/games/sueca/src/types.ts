import type { CardInstance, PauseAction, PlayerId, Suit } from '@cardroom/game-core';

/** The four sides of the table; partners sit face to face (rules §2). */
export type Seat = 'S' | 'E' | 'N' | 'W';
/** A: South and North · B: East and West. */
export type Team = 'A' | 'B';
export type CutFrom = 'TOP' | 'BOTTOM';

/**
 * `CUT`: the cutter picks the trump card · `PLAYING`: someone is on turn ·
 * `TRICK_DONE`: a full trick stays on the table before it is collected ·
 * `HAND_SUMMARY`: the hand's points, between hands · `PAUSED`: waiting for a
 * player who dropped · `FINISHED`: a team reached the games of the match.
 */
export type Phase = 'CUT' | 'PLAYING' | 'TRICK_DONE' | 'HAND_SUMMARY' | 'PAUSED' | 'FINISHED';
/** What a pause interrupts. */
export type LivePhase = Exclude<Phase, 'PAUSED' | 'FINISHED'>;

export interface SuecaConfig {
  /** Games a team needs to win the match (rules §10). */
  targetGames: number;
  turnTimeoutMs: number;
  cutTimeoutMs: number;
  /** How long the table waits for a player who dropped before the host may end it (core §2). */
  disconnectGraceMs: number;
}

export interface Play {
  seat: Seat;
  card: CardInstance;
}

export interface Trick {
  leader: Seat;
  plays: Play[];
}

export interface ClosedTrick {
  plays: Play[];
  winner: Seat;
}

export interface HandSummary {
  hand: number;
  points: Record<Team, number>;
  gamesAwarded: Record<Team, number>;
  tricks: Record<Team, number>;
  dealer: Seat;
  trumpSuit: Suit;
}

/** Matches won by each pair of partners in this room, carried from one match to the next (rules §10). */
export interface TallyEntry {
  /** Sorted, so a pair is found whoever sits where. */
  players: [PlayerId, PlayerId];
  wins: number;
}

export interface SuecaState {
  phase: Phase;
  /** The phase a pause interrupted, restored when everyone is back. */
  pausedFrom: LivePhase | null;
  /** Seats the table is waiting for. */
  absent: Seat[];
  config: SuecaConfig;
  seats: Record<Seat, PlayerId>;
  /** 1-based. */
  handNumber: number;
  dealer: Seat;
  /** On the dealer's left: the one before them in the order of play. */
  cutter: Seat;
  cutFrom: CutFrom | null;
  /** Public until its holder (the dealer) plays it. */
  trumpCard: CardInstance | null;
  trumpSuit: Suit | null;
  trumpCardPlayed: boolean;
  /** Server-only. */
  hands: Record<Seat, CardInstance[]>;
  trick: Trick;
  /** Who takes the full trick on the table (`TRICK_DONE`). */
  trickWinner: Seat | null;
  lastTrick: ClosedTrick | null;
  /** Per hand (open point #3). */
  lastTrickViewsUsed: Record<Seat, number>;
  /** Seats looking at the last trick right now, each with the trick it asked for. */
  lastTrickShown: Partial<Record<Seat, ClosedTrick>>;
  /** Server-only: points stay hidden until the end of the hand (open point #4). */
  wonCards: Record<Team, CardInstance[]>;
  tricksWon: Record<Team, number>;
  games: Record<Team, number>;
  history: HandSummary[];
  winner: Team | null;
  tally: TallyEntry[];
  /** Secret drawn from the server's DRBG at setup; every hand's shuffle derives from it. */
  seed: string;
}

export type SuecaClientAction =
  { type: 'CHOOSE_CUT'; from: CutFrom } | { type: 'PLAY'; cardUid: string } | { type: 'VIEW_LAST_TRICK' };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`). */
export type SuecaSystemAction =
  | { type: 'SYS_CUT_TIMEOUT' }
  | { type: 'SYS_TURN_TIMEOUT' }
  | { type: 'SYS_TRICK_SHOWN' }
  | { type: 'SYS_HIDE_LAST_TRICK'; seat: Seat }
  | { type: 'SYS_NEXT_HAND' }
  | PauseAction;

export type SuecaAction = SuecaClientAction | SuecaSystemAction;

export type SuecaEvent =
  | { type: 'HandStarted'; hand: number; dealer: Seat; cutter: Seat }
  | { type: 'CutChosen'; cutter: Seat; from: CutFrom }
  | { type: 'TrumpRevealed'; card: CardInstance; holder: Seat }
  /** Counts only: dealt cards are never broadcast. */
  | { type: 'CardsDealt'; counts: Record<Seat, number> }
  | { type: 'CardPlayed'; seat: Seat; card: CardInstance }
  /** The fourth card is down: the trick stays on the table a moment. */
  | { type: 'TrickWon'; winner: Seat; team: Team }
  /** The trick goes to its team's pile; `next` opens the next one (`null` when the hand is over). */
  | { type: 'TrickCollected'; winner: Seat; team: Team; next: Seat | null }
  /** Only that they looked: the cards go to their view alone. */
  | { type: 'LastTrickViewed'; seat: Seat }
  | { type: 'HandEnded'; summary: HandSummary }
  | { type: 'GamePaused'; seat: Seat }
  | { type: 'GameResumed'; seat: Seat }
  | { type: 'MatchFinished'; winner: Team; games: Record<Team, number> };

export interface SuecaSeatView {
  seat: Seat;
  playerId: PlayerId;
  team: Team;
  handCount: number;
  isCurrent: boolean;
  /** The table is waiting for them. */
  absent: boolean;
}

/**
 * What one player may know (contract §6). Valid actions and timers travel next
 * to it in the platform's `game:view` message.
 */
export interface SuecaView {
  phase: Phase;
  pausedFrom: LivePhase | null;
  /** `null` for spectators. */
  mySeat: Seat | null;
  myTeam: Team | null;
  /** In the order of play (S, E, N, W). */
  seats: SuecaSeatView[];
  /** Trump first, then the other suits alternating colours, each in the order of Sueca. */
  myHand: CardInstance[];
  legalCardUids: string[];
  handNumber: number;
  dealer: Seat;
  cutter: Seat;
  cutFrom: CutFrom | null;
  /** `null` until the cut; `card` is `null` once its holder played it. */
  trump: { suit: Suit; card: CardInstance | null; holder: Seat } | null;
  trick: Trick;
  trickWinner: Seat | null;
  tricksPlayed: number;
  /** Tricks only: points stay hidden until the end of the hand. */
  tricksWon: Record<Team, number>;
  /** There is a closed trick and the viewer has not used their look this hand. */
  lastTrickAvailable: boolean;
  /** Only while the viewer is looking at it. */
  lastTrickView: ClosedTrick | null;
  games: Record<Team, number>;
  targetGames: number;
  /** Only between hands. */
  handSummary: HandSummary | null;
  history: HandSummary[];
  chatEnabled: boolean;
  absent: Seat[];
  winner: Team | null;
  /** Matches won by each of today's pairs in this room, this one included once it is over. */
  matchesWon: Record<Team, number>;
}
