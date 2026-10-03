import type { CardInstance, PlayerId, SessionAction } from '@cardroom/game-core';

/** Virtual chips: always whole numbers (bets are multiples of 10, so halves and 3:2 stay whole). */
export type Chips = number;

export type Phase =
  | 'BETTING'
  | 'DEALING'
  | 'INSURANCE'
  | 'PEEK'
  | 'PLAYER_TURNS'
  | 'DEALER_TURN'
  | 'SETTLEMENT'
  | 'SHUFFLING'
  | 'FINISHED';

export interface BlackjackConfig {
  decks: number;
  /** Share of the shoe dealt before the cut card comes out. */
  penetration: number;
  minBet: Chips;
  maxBet: Chips;
  /** `false` = the dealer stands on soft 17 (S17). */
  dealerHitsSoft17: boolean;
  /** PEEK: the dealer checks for blackjack at once. EUROPEAN: the second card only comes at the end. */
  holeCard: 'PEEK' | 'EUROPEAN';
  /** Fixed: 6:5 is never offered. */
  blackjackPayout: '3:2';
  doubleAfterSplit: boolean;
  /** Most hands a player can split into. */
  maxHands: number;
  /** Any two ten-value cards (J+Q) make a pair. */
  splitTensByValue: boolean;
  /** Late surrender, as the first decision of the original hand. */
  surrender: boolean;
  insurance: boolean;
  /** Basic-strategy hint button (only for the rules the table was computed for). */
  hintsEnabled: boolean;
  betTimeoutMs: number;
  decisionTimeoutMs: number;
  insuranceTimeoutMs: number;
}

export type HandStatus = 'PLAYING' | 'STOOD' | 'BUSTED' | 'BLACKJACK' | 'SURRENDERED';
export type HandOutcome = 'WIN' | 'LOSE' | 'PUSH' | 'BLACKJACK' | 'SURRENDER' | 'EVEN_MONEY';

export interface Hand {
  /** Stable within the round (`h0`, then `h1`, `h2`… as it is split). */
  id: string;
  cards: CardInstance[];
  /** Chips on this hand (doubled hands hold twice the stake). */
  bet: Chips;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  status: HandStatus;
  /** Set when the hand is settled (even money: as soon as it is taken). */
  outcome: HandOutcome | null;
  /** Chips given back: stake + winnings (0 when lost). */
  payout: Chips | null;
}

export type InsuranceDecision = 'PENDING' | 'TAKEN' | 'DECLINED';

export interface InsuranceOffer {
  /** A blackjack is offered even money instead of insurance. */
  evenMoney: boolean;
  decision: InsuranceDecision;
  /** Stake of the insurance (half the bet); 0 for even money. */
  amount: Chips;
  /** What the insurance paid back (stake + 2:1), once settled. */
  payout: Chips | null;
}

export interface Seat {
  /** 0–6, from the dealer's left (first base) to their right (third base). */
  seatIndex: number;
  playerId: PlayerId;
  stack: Chips;
  /** Chips brought from the account to this table (net = stack − buyIn − rebuys). */
  buyIn: Chips;
  rebuys: number;
  /** Bet placed for the next deal (already taken from the stack). */
  bet: Chips | null;
  lastBet: Chips | null;
  insurance: InsuranceOffer | null;
  /** Hands of the round being played (empty for seats that sit this round out). */
  hands: Hand[];
  /** Serial for hand ids within the round. */
  handSerial: number;
  /** Chose not to be dealt in until they come back. */
  sittingOut: boolean;
  /** Left the room mid-round: their hands stand and the seat is freed when the round ends. */
  leaving: boolean;
  roundsPlayed: number;
}

/** Chips of someone who got up during the session (kept for the final result). */
export interface DepartedPlayer {
  playerId: PlayerId;
  stack: Chips;
  buyIn: Chips;
  rebuys: number;
  roundsPlayed: number;
}

export interface Turn {
  seatIndex: number;
  handIndex: number;
}

export interface DealerHand {
  cards: CardInstance[];
  /** PEEK mode: the second card lies face down until this is true. */
  holeRevealed: boolean;
}

export interface BlackjackState {
  phase: Phase;
  config: BlackjackConfig;
  /** 1-based; the round being bet on or played. */
  round: number;
  /** Rounds actually dealt (betting windows nobody bet in do not count). */
  roundsDealt: number;
  dealerName: string;
  /** Occupied seats, by seat index. */
  seats: Seat[];
  departed: DepartedPlayer[];
  turn: Turn | null;
  dealer: DealerHand;
  /** Server-only: the whole shoe in dealing order; the next card is `shoe[shoeIndex]`. */
  shoe: CardInstance[];
  shoeIndex: number;
  /** The cut card sits before `shoe[cutIndex]`. */
  cutIndex: number;
  cutCardReached: boolean;
  /** Server-only: cards of finished rounds (a reserve if the shoe ever ran dry). */
  discard: CardInstance[];
  /** Shoes shuffled so far (each one derives its order from the seed). */
  shuffles: number;
  /** The host (or the last player) asked to end: the session ends with the current round. */
  endRequested: boolean;
  /** What the house won so far (negative when the players are ahead). */
  houseNet: Chips;
  /** Secret drawn from the server's DRBG at setup; every shoe's shuffle derives from it. */
  seed: string;
}

export type BlackjackClientAction =
  | { type: 'PLACE_BET'; amount: Chips }
  | { type: 'CLEAR_BET' }
  | { type: 'INSURANCE'; take: boolean }
  | { type: 'EVEN_MONEY'; take: boolean }
  | { type: 'HIT' }
  | { type: 'STAND' }
  | { type: 'DOUBLE' }
  | { type: 'SPLIT' }
  | { type: 'SURRENDER' }
  | { type: 'REBUY' }
  | { type: 'SIT_OUT'; value: boolean };

/** Applied by the server only (as `SYSTEM_PLAYER_ID`): the dealer's pace and the table's timers. */
export type BlackjackSystemAction =
  | { type: 'SYS_BETTING_CLOSED' }
  | { type: 'SYS_DEAL_DONE' }
  | { type: 'SYS_INSURANCE_CLOSED' }
  | { type: 'SYS_PEEK' }
  | { type: 'SYS_DECISION_TIMEOUT' }
  | { type: 'SYS_DEALER_STEP' }
  | { type: 'SYS_NEXT_ROUND' }
  | { type: 'SYS_SHUFFLE_DONE' }
  | SessionAction;

export type BlackjackAction = BlackjackClientAction | BlackjackSystemAction;

export type Decision = 'HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'SURRENDER';

/** Where a dealt card goes. */
export type CardTarget = { kind: 'DEALER' } | { kind: 'HAND'; seatIndex: number; handIndex: number };

export type BlackjackEvent =
  | { type: 'BettingOpened'; round: number }
  | { type: 'BetPlaced'; seatIndex: number; amount: Chips }
  | { type: 'BetCleared'; seatIndex: number; amount: Chips }
  /** Bets are in: these seats are dealt in. */
  | { type: 'BettingClosed'; round: number; seats: number[] }
  /** `card` is `null` for the dealer's face-down hole card. */
  | { type: 'CardDealt'; to: CardTarget; card: CardInstance | null }
  | { type: 'InsuranceOffered'; seats: number[] }
  | { type: 'InsuranceTaken'; seatIndex: number; amount: Chips }
  | { type: 'InsuranceDeclined'; seatIndex: number }
  | { type: 'EvenMoneyTaken'; seatIndex: number; payout: Chips }
  | { type: 'DealerPeeked'; blackjack: boolean }
  | { type: 'TurnStarted'; seatIndex: number; handIndex: number }
  | { type: 'HandSplit'; seatIndex: number; handIndex: number; bet: Chips }
  | { type: 'HandDoubled'; seatIndex: number; handIndex: number; bet: Chips }
  | { type: 'HandSurrendered'; seatIndex: number; handIndex: number }
  | { type: 'HandStood'; seatIndex: number; handIndex: number; auto: boolean }
  | { type: 'HandBusted'; seatIndex: number; handIndex: number; total: number }
  | { type: 'DealerTurnStarted' }
  | { type: 'HoleCardRevealed'; card: CardInstance }
  | { type: 'DealerStood'; total: number }
  | { type: 'DealerBusted'; total: number }
  | {
      type: 'HandSettled';
      seatIndex: number;
      handIndex: number;
      outcome: HandOutcome;
      bet: Chips;
      payout: Chips;
    }
  | { type: 'InsuranceSettled'; seatIndex: number; amount: Chips; payout: Chips }
  | { type: 'RoundSettled'; round: number; dealerTotal: number; dealerBlackjack: boolean }
  /** The cut card came out: this is the last round of the shoe. */
  | { type: 'CutCardReached' }
  | { type: 'ShuffleStarted' }
  /** `RESERVE`: the shoe ran dry mid-round and the discards were shuffled back in. */
  | { type: 'ShoeShuffled'; decks: number; reason: 'CUT_CARD' | 'RESERVE' }
  | { type: 'PlayerRebought'; seatIndex: number; stack: Chips; rebuys: number }
  | { type: 'PlayerSatOut'; seatIndex: number; value: boolean }
  | { type: 'PlayerJoined'; seatIndex: number; playerId: PlayerId; stack: Chips }
  /** Left mid-round: the seat is freed when the round ends. */
  | { type: 'PlayerLeaving'; seatIndex: number; playerId: PlayerId }
  | { type: 'PlayerLeft'; seatIndex: number; playerId: PlayerId }
  | { type: 'SessionEnding'; afterRound: boolean }
  | { type: 'SessionFinished'; rounds: number };

export interface HandView extends Hand {
  total: number;
  soft: boolean;
}

export interface SeatView {
  seatIndex: number;
  playerId: PlayerId;
  stack: Chips;
  rebuys: number;
  /** Chips won or lost this session (rebuys discounted). */
  net: Chips;
  bet: Chips | null;
  lastBet: Chips | null;
  insurance: InsuranceOffer | null;
  hands: HandView[];
  sittingOut: boolean;
  leaving: boolean;
  roundsPlayed: number;
}

export interface DealerView {
  /** `null` stands for the face-down hole card. */
  cards: (CardInstance | null)[];
  /** Only the face-up cards count until the hole card is turned over. */
  total: number | null;
  soft: boolean;
  blackjack: boolean;
  busted: boolean;
}

export interface SessionRow {
  playerId: PlayerId;
  stack: Chips;
  rebuys: number;
  net: Chips;
  roundsPlayed: number;
  /** Still at the table (`false` once they got up). */
  seated: boolean;
}

/**
 * What one player may know. Valid actions and the decision deadline travel
 * next to the view in the platform's `game:view` message.
 */
export interface BlackjackView {
  phase: Phase;
  /** Viewer's id, `null` for spectators. */
  selfId: PlayerId | null;
  round: number;
  /** Rounds actually dealt (betting windows nobody bet in do not count). */
  roundsDealt: number;
  dealerName: string;
  rules: BlackjackConfig;
  dealer: DealerView;
  seats: SeatView[];
  turn: Turn | null;
  /** Counts only: the order of the shoe never leaves the server. */
  shoe: { remaining: number; total: number; cutAt: number; cutCardReached: boolean };
  discardCount: number;
  endRequested: boolean;
  /** Basic-strategy advice for the viewer's hand on turn (when the table has hints on). */
  hint: Decision | null;
  /** Everyone who played this session, best net first. */
  session: SessionRow[];
}
