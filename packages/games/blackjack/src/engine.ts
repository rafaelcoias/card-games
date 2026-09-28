import {
  SYSTEM_PLAYER_ID,
  ok,
  pickOne,
  type ActionResult,
  type CardInstance,
  type PlayerId,
  type Rng,
  type ScheduledAction,
  type SetupOptions,
} from '@cardroom/game-core';
import {
  BET_UNIT,
  DEALER_NAMES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PACE,
  SEAT_COUNT,
  cardPoints,
  dealerShouldHit,
  handValue,
  insuranceCost,
  insurancePayout,
  isBlackjack,
  isNatural,
  settleHand,
  tableLimitsError,
} from './rules';
import { drawCard, randomShuffler, reshuffle, type Shuffler } from './shoe';
import { bettingPending, canDecide, currentHand, findSeat, isAutomaticPhase, seatOf } from './state';
import type {
  BlackjackAction,
  BlackjackConfig,
  BlackjackEvent,
  BlackjackState,
  BlackjackSystemAction,
  Chips,
  Decision,
  Hand,
  Seat,
} from './types';

type Result = ActionResult<BlackjackState, BlackjackEvent>;

/** A state being changed by one action, and what it produced so far. */
interface Draft {
  s: BlackjackState;
  events: BlackjackEvent[];
  shuffler: Shuffler;
}

export function setup(
  players: readonly PlayerId[],
  config: BlackjackConfig,
  rng: Rng,
  options: SetupOptions = {},
  shuffler: Shuffler = randomShuffler,
): BlackjackState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Blackjack seats ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');
  const limits = tableLimitsError(config);
  if (limits) throw new RangeError(limits);
  const seatIndexes = options.seats ?? players.map((_, index) => index);
  if (
    seatIndexes.length !== players.length ||
    new Set(seatIndexes).size !== seatIndexes.length ||
    seatIndexes.some((i) => !Number.isInteger(i) || i < 0 || i >= SEAT_COUNT)
  ) {
    throw new RangeError(`Invalid seats: ${seatIndexes.join(', ')}`);
  }

  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');
  const state: BlackjackState = {
    phase: 'BETTING',
    config: { ...config },
    round: 1,
    roundsDealt: 0,
    dealerName: pickOne(DEALER_NAMES, rng),
    seats: players
      .map((playerId, i) => newSeat(playerId, seatIndexes[i] as number, config.startingStack))
      .sort((a, b) => a.seatIndex - b.seatIndex),
    departed: [],
    turn: null,
    dealer: { cards: [], holeRevealed: false },
    shoe: [],
    shoeIndex: 0,
    cutIndex: 0,
    cutCardReached: false,
    discard: [],
    shuffles: 0,
    endRequested: false,
    houseNet: 0,
    seed,
  };
  return reshuffle(state, shuffler);
}

function newSeat(playerId: PlayerId, seatIndex: number, stack: Chips): Seat {
  return {
    seatIndex,
    playerId,
    stack,
    rebuys: 0,
    bet: null,
    lastBet: null,
    insurance: null,
    hands: [],
    handSerial: 0,
    sittingOut: false,
    leaving: false,
    roundsPlayed: 0,
  };
}

/** Containers are copied; cards are immutable values and the shoe is never mutated in place. */
function cloneState(state: BlackjackState): BlackjackState {
  return {
    ...state,
    seats: state.seats.map((seat) => ({
      ...seat,
      insurance: seat.insurance ? { ...seat.insurance } : null,
      hands: seat.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })),
    })),
    departed: [...state.departed],
    turn: state.turn ? { ...state.turn } : null,
    dealer: { ...state.dealer, cards: [...state.dealer.cards] },
  };
}

const SYSTEM_ACTIONS = new Set<BlackjackAction['type']>([
  'SYS_BETTING_CLOSED',
  'SYS_DEAL_DONE',
  'SYS_INSURANCE_CLOSED',
  'SYS_PEEK',
  'SYS_DECISION_TIMEOUT',
  'SYS_DEALER_STEP',
  'SYS_NEXT_ROUND',
  'SYS_SHUFFLE_DONE',
  'SYS_PLAYER_JOINED',
  'SYS_PLAYER_LEFT',
  'SYS_END_SESSION',
]);

export function isSystemAction(action: BlackjackAction): action is BlackjackSystemAction {
  return SYSTEM_ACTIONS.has(action.type);
}

export function applyAction(
  state: BlackjackState,
  action: BlackjackAction,
  playerId: PlayerId,
  shuffler: Shuffler = randomShuffler,
): Result {
  const d: Draft = { s: cloneState(state), events: [], shuffler };
  const error = isSystemAction(action)
    ? playerId === SYSTEM_PLAYER_ID
      ? applySystem(d, action)
      : failure('SYSTEM_ONLY', 'Only the server can do that')
    : applyPlayer(d, action, playerId);
  if (error) return error;
  return ok(d.s, d.events, scheduleFor(d.s));
}

type Failure = Extract<Result, { ok: false }>;
const failure = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });

function applySystem(d: Draft, action: BlackjackSystemAction): Failure | null {
  const { phase } = d.s;
  const wrongPhase = () => failure('WRONG_PHASE', `${action.type} does not apply in ${phase}`);
  switch (action.type) {
    case 'SYS_BETTING_CLOSED':
      if (phase !== 'BETTING') return wrongPhase();
      if (d.s.seats.some((seat) => seat.bet !== null)) deal(d);
      return null;
    case 'SYS_DEAL_DONE':
      if (phase !== 'DEALING') return wrongPhase();
      dealDone(d);
      return null;
    case 'SYS_INSURANCE_CLOSED':
      if (phase !== 'INSURANCE') return wrongPhase();
      for (const seat of d.s.seats) if (seat.insurance?.decision === 'PENDING') decline(d, seat);
      afterInsurance(d);
      return null;
    case 'SYS_PEEK':
      if (phase !== 'PEEK') return wrongPhase();
      peek(d);
      return null;
    case 'SYS_DECISION_TIMEOUT': {
      if (phase !== 'PLAYER_TURNS' || !d.s.turn) return wrongPhase();
      standCurrent(d, true);
      return null;
    }
    case 'SYS_DEALER_STEP':
      if (phase !== 'DEALER_TURN') return wrongPhase();
      dealerStep(d);
      return null;
    case 'SYS_NEXT_ROUND':
      if (phase !== 'SETTLEMENT') return wrongPhase();
      nextRound(d);
      return null;
    case 'SYS_SHUFFLE_DONE':
      if (phase !== 'SHUFFLING') return wrongPhase();
      reshuffle(d.s, d.shuffler);
      d.events.push({ type: 'ShoeShuffled', decks: d.s.config.decks, reason: 'CUT_CARD' });
      openBetting(d);
      return null;
    case 'SYS_PLAYER_JOINED':
      return playerJoined(d, action.playerId, action.seatIndex);
    case 'SYS_PLAYER_LEFT':
      return playerLeft(d, action.playerId);
    case 'SYS_END_SESSION':
      return endSession(d);
  }
}

function applyPlayer(
  d: Draft,
  action: Exclude<BlackjackAction, BlackjackSystemAction>,
  playerId: PlayerId,
): Failure | null {
  if (d.s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
  const seat = findSeat(d.s, playerId);
  if (!seat) return failure('NOT_SEATED', 'You have no seat at this table');
  switch (action.type) {
    case 'PLACE_BET':
      return placeBet(d, seat, action.amount);
    case 'CLEAR_BET':
      return clearBet(d, seat);
    case 'INSURANCE':
      return answerInsurance(d, seat, false, action.take);
    case 'EVEN_MONEY':
      return answerInsurance(d, seat, true, action.take);
    case 'HIT':
    case 'STAND':
    case 'DOUBLE':
    case 'SPLIT':
    case 'SURRENDER':
      return decide(d, seat, action.type);
    case 'REBUY':
      return rebuy(d, seat);
    case 'SIT_OUT':
      return sitOut(d, seat, action.value);
  }
}

// ── Betting ───────────────────────────────────────────────────

function placeBet(d: Draft, seat: Seat, amount: Chips): Failure | null {
  const { config } = d.s;
  if (d.s.phase !== 'BETTING') return failure('WRONG_PHASE', 'Bets are closed');
  if (seat.sittingOut) return failure('SITTING_OUT', 'Come back to the table to bet');
  if (seat.bet !== null) return failure('ALREADY_BET', 'Clear your bet to change it');
  if (
    !Number.isInteger(amount) ||
    amount % BET_UNIT !== 0 ||
    amount < config.minBet ||
    amount > config.maxBet
  ) {
    return failure('INVALID_BET', `Bet ${config.minBet}–${config.maxBet} in multiples of ${BET_UNIT}`);
  }
  if (amount > seat.stack) return failure('NOT_ENOUGH_CHIPS', 'You do not have that many chips');
  seat.stack -= amount;
  seat.bet = amount;
  d.events.push({ type: 'BetPlaced', seatIndex: seat.seatIndex, amount });
  closeBettingIfDone(d);
  return null;
}

function clearBet(d: Draft, seat: Seat): Failure | null {
  if (d.s.phase !== 'BETTING') return failure('WRONG_PHASE', 'Bets are closed');
  if (seat.bet === null) return failure('NO_BET', 'You have no bet to clear');
  refundBet(d, seat);
  return null;
}

function refundBet(d: Draft, seat: Seat): void {
  if (seat.bet === null) return;
  d.events.push({ type: 'BetCleared', seatIndex: seat.seatIndex, amount: seat.bet });
  seat.stack += seat.bet;
  seat.bet = null;
}

/** Everyone who can bet has bet: deal at once instead of waiting for the timer. */
function closeBettingIfDone(d: Draft): void {
  if (d.s.phase !== 'BETTING' || bettingPending(d.s).length > 0) return;
  if (d.s.seats.some((seat) => seat.bet !== null)) deal(d);
}

function rebuy(d: Draft, seat: Seat): Failure | null {
  const { config } = d.s;
  if (!config.allowRebuy) return failure('REBUY_DISABLED', 'This table has no rebuys');
  if (d.s.phase !== 'BETTING' || seat.bet !== null) return failure('WRONG_PHASE', 'Rebuy before you bet');
  if (seat.stack >= config.minBet) return failure('REBUY_NOT_NEEDED', 'You still have chips to bet');
  seat.stack += config.startingStack;
  seat.rebuys += 1;
  d.events.push({
    type: 'PlayerRebought',
    seatIndex: seat.seatIndex,
    stack: seat.stack,
    rebuys: seat.rebuys,
  });
  return null;
}

/**
 * Sitting out takes effect from the next deal. Never during the dealer's
 * automatic steps: any action there would restart the step's pause.
 */
function sitOut(d: Draft, seat: Seat, value: boolean): Failure | null {
  if (isAutomaticPhase(d.s.phase)) return failure('WRONG_PHASE', 'Wait for the dealer');
  if (seat.sittingOut === value) return failure('NO_CHANGE', value ? 'Already sitting out' : 'Already in');
  if (value && d.s.phase === 'BETTING') refundBet(d, seat);
  seat.sittingOut = value;
  d.events.push({ type: 'PlayerSatOut', seatIndex: seat.seatIndex, value });
  closeBettingIfDone(d);
  return null;
}

function openBetting(d: Draft): void {
  d.s.round += 1;
  d.s.phase = 'BETTING';
  d.events.push({ type: 'BettingOpened', round: d.s.round });
}

// ── Dealing ───────────────────────────────────────────────────

function newHand(seat: Seat, cards: CardInstance[], bet: Chips, fromSplit = false): Hand {
  const hand: Hand = {
    id: `h${seat.handSerial}`,
    cards,
    bet,
    doubled: false,
    fromSplit,
    splitAces: false,
    status: 'PLAYING',
    outcome: null,
    payout: null,
  };
  seat.handSerial += 1;
  return hand;
}

function dealTo(d: Draft, seat: Seat, handIndex: number): CardInstance {
  const card = drawCard(d.s, d.shuffler, d.events);
  (seat.hands[handIndex] as Hand).cards.push(card);
  d.events.push({ type: 'CardDealt', to: { kind: 'HAND', seatIndex: seat.seatIndex, handIndex }, card });
  return card;
}

function dealToDealer(d: Draft, faceUp: boolean): void {
  const card = drawCard(d.s, d.shuffler, d.events);
  d.s.dealer.cards.push(card);
  d.events.push({ type: 'CardDealt', to: { kind: 'DEALER' }, card: faceUp ? card : null });
}

/**
 * Bets are in (rules §5.2): one card to each player from the dealer's left, the
 * up card, a second card each, then the hole card — face down (PEEK) or not at
 * all until the dealer's turn (EUROPEAN).
 */
function deal(d: Draft): void {
  const s = d.s;
  const playing = s.seats.filter((seat) => seat.bet !== null);
  for (const seat of s.seats) {
    seat.hands = [];
    seat.handSerial = 0;
    seat.insurance = null;
    if (seat.bet === null) continue;
    seat.hands = [newHand(seat, [], seat.bet)];
    seat.lastBet = seat.bet;
    seat.bet = null;
    seat.roundsPlayed += 1;
  }
  s.roundsDealt += 1;
  s.phase = 'DEALING';
  s.turn = null;
  d.events.push({ type: 'BettingClosed', round: s.round, seats: playing.map((seat) => seat.seatIndex) });
  for (const seat of playing) dealTo(d, seat, 0);
  dealToDealer(d, true);
  for (const seat of playing) dealTo(d, seat, 0);
  if (s.config.holeCard === 'PEEK') dealToDealer(d, false);
}

/** The deal has been shown: naturals stand, then insurance, the peek or the players' turns. */
function dealDone(d: Draft): void {
  const s = d.s;
  for (const seat of s.seats) {
    const hand = seat.hands[0];
    if (hand && isBlackjack(hand)) hand.status = 'BLACKJACK';
  }
  const up = s.dealer.cards[0] as CardInstance;
  if (up.rank === 'A' && s.config.insurance) {
    const offered: number[] = [];
    for (const seat of s.seats) {
      const hand = seat.hands[0];
      if (!hand || seat.leaving) continue;
      const evenMoney = hand.status === 'BLACKJACK';
      const amount = evenMoney ? 0 : insuranceCost(hand.bet);
      if (!evenMoney && seat.stack < amount) continue;
      seat.insurance = { evenMoney, decision: 'PENDING', amount, payout: null };
      offered.push(seat.seatIndex);
    }
    if (offered.length > 0) {
      s.phase = 'INSURANCE';
      d.events.push({ type: 'InsuranceOffered', seats: offered });
      return;
    }
  }
  afterInsurance(d);
}

// ── Insurance, even money and the peek ────────────────────────

function answerInsurance(d: Draft, seat: Seat, evenMoney: boolean, take: boolean): Failure | null {
  const offer = seat.insurance;
  if (d.s.phase !== 'INSURANCE' || offer?.decision !== 'PENDING' || offer.evenMoney !== evenMoney) {
    return failure('NO_OFFER', evenMoney ? 'Even money is not on offer' : 'Insurance is not on offer');
  }
  if (!take) decline(d, seat);
  else if (evenMoney) {
    const hand = seat.hands[0] as Hand;
    offer.decision = 'TAKEN';
    pay(d, seat, hand, 'EVEN_MONEY', hand.bet * 2);
    d.events.push({ type: 'EvenMoneyTaken', seatIndex: seat.seatIndex, payout: hand.bet * 2 });
  } else {
    offer.decision = 'TAKEN';
    seat.stack -= offer.amount;
    d.events.push({ type: 'InsuranceTaken', seatIndex: seat.seatIndex, amount: offer.amount });
  }
  if (d.s.seats.every((s) => s.insurance?.decision !== 'PENDING')) afterInsurance(d);
  return null;
}

function decline(d: Draft, seat: Seat): void {
  if (seat.insurance?.decision !== 'PENDING') return;
  seat.insurance.decision = 'DECLINED';
  d.events.push({ type: 'InsuranceDeclined', seatIndex: seat.seatIndex });
}

/** With an ace or a ten up, the dealer checks the hole card (PEEK mode only). */
function afterInsurance(d: Draft): void {
  const up = d.s.dealer.cards[0] as CardInstance;
  const peeks = d.s.config.holeCard === 'PEEK' && (up.rank === 'A' || cardPoints(up) === 10);
  if (peeks) d.s.phase = 'PEEK';
  else startPlayerTurns(d);
}

function peek(d: Draft): void {
  const s = d.s;
  const blackjack = isNatural(s.dealer.cards);
  d.events.push({ type: 'DealerPeeked', blackjack });
  if (blackjack) {
    revealHole(d);
    settle(d);
    return;
  }
  for (const seat of s.seats) settleInsurance(d, seat, false);
  startPlayerTurns(d);
}

function settleInsurance(d: Draft, seat: Seat, dealerBlackjack: boolean): void {
  const offer = seat.insurance;
  if (!offer || offer.evenMoney || offer.decision !== 'TAKEN' || offer.payout !== null) return;
  offer.payout = insurancePayout(offer.amount, dealerBlackjack);
  seat.stack += offer.payout;
  d.s.houseNet += offer.amount - offer.payout;
  d.events.push({
    type: 'InsuranceSettled',
    seatIndex: seat.seatIndex,
    amount: offer.amount,
    payout: offer.payout,
  });
}

// ── Players' turns ────────────────────────────────────────────

function startPlayerTurns(d: Draft): void {
  d.s.phase = 'PLAYER_TURNS';
  d.s.turn = null;
  advanceTurn(d);
}

/**
 * Moves the turn to the next hand that needs a decision, from the current one
 * on, in seat order. A split hand gets its second card when its turn comes;
 * split aces and 21s stand on their own, and so do the hands of players who
 * left the table.
 */
function advanceTurn(d: Draft): void {
  const s = d.s;
  const from = s.turn;
  for (const seat of s.seats) {
    if (from && seat.seatIndex < from.seatIndex) continue;
    for (let handIndex = 0; handIndex < seat.hands.length; handIndex++) {
      if (from && seat.seatIndex === from.seatIndex && handIndex < from.handIndex) continue;
      const hand = seat.hands[handIndex] as Hand;
      if (hand.status !== 'PLAYING') continue;
      if (hand.cards.length === 1) dealTo(d, seat, handIndex);
      if (hand.splitAces || seat.leaving || handValue(hand.cards).total === 21) {
        stand(d, seat, handIndex, true);
        continue;
      }
      s.turn = { seatIndex: seat.seatIndex, handIndex };
      d.events.push({ type: 'TurnStarted', seatIndex: seat.seatIndex, handIndex });
      return;
    }
  }
  s.turn = null;
  s.phase = 'DEALER_TURN';
  d.events.push({ type: 'DealerTurnStarted' });
}

function stand(d: Draft, seat: Seat, handIndex: number, auto: boolean): void {
  (seat.hands[handIndex] as Hand).status = 'STOOD';
  d.events.push({ type: 'HandStood', seatIndex: seat.seatIndex, handIndex, auto });
}

function standCurrent(d: Draft, auto: boolean): void {
  const turn = d.s.turn;
  if (!turn) return;
  stand(d, seatOf(d.s, turn.seatIndex), turn.handIndex, auto);
  advanceTurn(d);
}

function decide(d: Draft, seat: Seat, decision: Decision): Failure | null {
  const turn = d.s.turn;
  if (d.s.phase !== 'PLAYER_TURNS' || turn?.seatIndex !== seat.seatIndex) {
    return failure('NOT_YOUR_TURN', 'It is not your turn');
  }
  if (!canDecide(d.s, seat, decision)) return failure('ILLEGAL_DECISION', `You cannot ${decision} now`);
  const hand = currentHand(d.s) as Hand;
  const { handIndex } = turn;
  switch (decision) {
    case 'HIT': {
      dealTo(d, seat, handIndex);
      const { total } = handValue(hand.cards);
      if (total > 21) bust(d, seat, handIndex);
      else if (total === 21) stand(d, seat, handIndex, true);
      else return null; // the same hand keeps the turn
      break;
    }
    case 'STAND':
      stand(d, seat, handIndex, false);
      break;
    case 'DOUBLE': {
      seat.stack -= hand.bet;
      hand.bet *= 2;
      hand.doubled = true;
      d.events.push({ type: 'HandDoubled', seatIndex: seat.seatIndex, handIndex, bet: hand.bet });
      dealTo(d, seat, handIndex);
      if (handValue(hand.cards).total > 21) bust(d, seat, handIndex);
      else stand(d, seat, handIndex, true);
      break;
    }
    case 'SPLIT': {
      seat.stack -= hand.bet;
      const aces = hand.cards[0]?.rank === 'A';
      const moved = hand.cards.pop() as CardInstance;
      const sibling = newHand(seat, [moved], hand.bet, true);
      hand.fromSplit = true;
      hand.splitAces = aces;
      sibling.splitAces = aces;
      seat.hands.splice(handIndex + 1, 0, sibling);
      d.events.push({ type: 'HandSplit', seatIndex: seat.seatIndex, handIndex, bet: hand.bet });
      dealTo(d, seat, handIndex);
      if (!aces && handValue(hand.cards).total < 21) return null; // keeps the turn with its new card
      stand(d, seat, handIndex, true);
      break;
    }
    case 'SURRENDER':
      hand.status = 'SURRENDERED';
      d.events.push({ type: 'HandSurrendered', seatIndex: seat.seatIndex, handIndex });
      break;
  }
  advanceTurn(d);
  return null;
}

function bust(d: Draft, seat: Seat, handIndex: number): void {
  const hand = seat.hands[handIndex] as Hand;
  hand.status = 'BUSTED';
  d.events.push({
    type: 'HandBusted',
    seatIndex: seat.seatIndex,
    handIndex,
    total: handValue(hand.cards).total,
  });
}

// ── Dealer and settlement ─────────────────────────────────────

function revealHole(d: Draft): void {
  const hole = d.s.dealer.cards[1];
  if (d.s.dealer.holeRevealed || !hole) return;
  d.s.dealer.holeRevealed = true;
  d.events.push({ type: 'HoleCardRevealed', card: hole });
}

/** Hands still waiting to be compared with the dealer's (not busted, surrendered or paid). */
const liveHands = (s: BlackjackState): Hand[] =>
  s.seats.flatMap((seat) => seat.hands).filter((hand) => hand.status === 'STOOD');

/**
 * One step of the dealer's turn (05 §1.5): turn the hole card (or, EUROPEAN,
 * draw the second card), then hit while the rules say so, then settle. If no
 * hand needs comparing, the dealer only completes their two cards.
 */
function dealerStep(d: Draft): void {
  const s = d.s;
  const { dealer, config } = s;
  if (config.holeCard === 'PEEK' && !dealer.holeRevealed) {
    revealHole(d);
    return;
  }
  if (dealer.cards.length < 2) {
    dealToDealer(d, true);
    dealer.holeRevealed = true;
    return;
  }
  const { total } = handValue(dealer.cards);
  if (total <= 21 && liveHands(s).length > 0 && dealerShouldHit(dealer.cards, config.dealerHitsSoft17)) {
    dealToDealer(d, true);
    const after = handValue(dealer.cards).total;
    if (after > 21) d.events.push({ type: 'DealerBusted', total: after });
    return;
  }
  if (total <= 21) d.events.push({ type: 'DealerStood', total });
  settle(d);
}

/** Moves the chips of a settled hand. */
function pay(d: Draft, seat: Seat, hand: Hand, outcome: Hand['outcome'], payout: Chips): void {
  hand.outcome = outcome;
  hand.payout = payout;
  seat.stack += payout;
  d.s.houseNet += hand.bet - payout;
}

/** Hand by hand from the dealer's right to their left, as at a casino (05 §1.7). */
function settle(d: Draft): void {
  const s = d.s;
  s.phase = 'SETTLEMENT';
  s.turn = null;
  const dealerBlackjack = isNatural(s.dealer.cards);
  for (const seat of [...s.seats].reverse()) {
    for (let handIndex = seat.hands.length - 1; handIndex >= 0; handIndex--) {
      const hand = seat.hands[handIndex] as Hand;
      if (hand.outcome !== null) continue; // even money was paid on the spot
      const { outcome, payout } = settleHand(hand, s.dealer.cards);
      pay(d, seat, hand, outcome, payout);
      d.events.push({
        type: 'HandSettled',
        seatIndex: seat.seatIndex,
        handIndex,
        outcome,
        bet: hand.bet,
        payout,
      });
    }
    settleInsurance(d, seat, dealerBlackjack);
  }
  d.events.push({
    type: 'RoundSettled',
    round: s.round,
    dealerTotal: handValue(s.dealer.cards).total,
    dealerBlackjack,
  });
}

/** Clears the table; seats of players who left are freed; shuffles when the cut card came out. */
function nextRound(d: Draft): void {
  const s = d.s;
  const onTable = [...s.seats.flatMap((seat) => seat.hands.flatMap((hand) => hand.cards)), ...s.dealer.cards];
  s.discard = [...s.discard, ...onTable];
  s.dealer = { cards: [], holeRevealed: false };
  for (const seat of s.seats) {
    seat.hands = [];
    seat.handSerial = 0;
    seat.insurance = null;
  }
  for (const seat of s.seats.filter((seat) => seat.leaving)) removeSeat(d, seat);
  if (s.endRequested) {
    finish(d);
  } else if (s.cutCardReached) {
    s.phase = 'SHUFFLING';
    d.events.push({ type: 'ShuffleStarted' });
  } else {
    openBetting(d);
  }
}

// ── Session ───────────────────────────────────────────────────

function removeSeat(d: Draft, seat: Seat): void {
  d.s.seats = d.s.seats.filter((s) => s !== seat);
  d.s.departed.push({
    playerId: seat.playerId,
    stack: seat.stack,
    rebuys: seat.rebuys,
    roundsPlayed: seat.roundsPlayed,
  });
  d.events.push({ type: 'PlayerLeft', seatIndex: seat.seatIndex, playerId: seat.playerId });
}

/**
 * A player sits down mid-session: they play from the next deal. Someone who
 * got up earlier gets their chips back (leaving never resets a stack), and
 * someone who was on their way out simply stays.
 */
function playerJoined(d: Draft, playerId: PlayerId, seatIndex: number): Failure | null {
  const s = d.s;
  if (s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
  const existing = findSeat(s, playerId);
  if (existing) {
    if (!existing.leaving) return failure('ALREADY_SEATED', 'Already at the table');
    existing.leaving = false;
    d.events.push({
      type: 'PlayerJoined',
      seatIndex: existing.seatIndex,
      playerId,
      stack: existing.stack,
    });
    return null;
  }
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= SEAT_COUNT) {
    return failure('INVALID_SEAT', `Seats go from 0 to ${SEAT_COUNT - 1}`);
  }
  if (s.seats.some((seat) => seat.seatIndex === seatIndex))
    return failure('SEAT_TAKEN', 'That seat is taken');

  const seat = newSeat(playerId, seatIndex, s.config.startingStack);
  const before = s.departed.find((p) => p.playerId === playerId);
  if (before) {
    Object.assign(seat, { stack: before.stack, rebuys: before.rebuys, roundsPlayed: before.roundsPlayed });
    s.departed = s.departed.filter((p) => p !== before);
  }
  s.seats = [...s.seats, seat].sort((a, b) => a.seatIndex - b.seatIndex);
  d.events.push({ type: 'PlayerJoined', seatIndex, playerId, stack: seat.stack });
  return null;
}

/**
 * A player leaves the room. Between rounds the seat is freed at once (a bet
 * placed for the next deal is returned); mid-round their hands stand, are
 * settled normally, and the seat is freed when the round ends (rules §6).
 */
function playerLeft(d: Draft, playerId: PlayerId): Failure | null {
  const s = d.s;
  const seat = findSeat(s, playerId);
  if (!seat) return failure('NOT_SEATED', 'Not at the table');
  if (seat.hands.length === 0) {
    refundBet(d, seat);
    removeSeat(d, seat);
    closeBettingIfDone(d);
    return null;
  }
  if (seat.leaving) return null;
  seat.leaving = true;
  d.events.push({ type: 'PlayerLeaving', seatIndex: seat.seatIndex, playerId });
  if (s.phase === 'INSURANCE') {
    decline(d, seat);
    if (s.seats.every((other) => other.insurance?.decision !== 'PENDING')) afterInsurance(d);
  } else if (s.phase === 'PLAYER_TURNS' && s.turn?.seatIndex === seat.seatIndex) {
    standCurrent(d, true);
  }
  return null;
}

/** Ends at once between rounds; otherwise once the round in play is settled. */
function endSession(d: Draft): Failure | null {
  const s = d.s;
  if (s.phase === 'FINISHED') return failure('SESSION_OVER', 'The session is over');
  if (s.endRequested) return failure('SESSION_ENDING', 'The session already ends after this round');
  s.endRequested = true;
  const now = s.phase === 'BETTING' || s.phase === 'SHUFFLING';
  d.events.push({ type: 'SessionEnding', afterRound: !now });
  if (now) finish(d);
  return null;
}

function finish(d: Draft): void {
  for (const seat of d.s.seats) refundBet(d, seat);
  d.s.phase = 'FINISHED';
  d.s.turn = null;
  d.events.push({ type: 'SessionFinished', rounds: d.s.roundsDealt });
}

// ── Pace ──────────────────────────────────────────────────────

/**
 * The follow-up the dealer takes on their own in each automatic phase, derived
 * from the state alone. Every result carries it, so an action that lands in
 * between (someone joins, leaves, or the host ends the session) re-arms the step
 * instead of stalling the table.
 */
export function scheduleFor(state: BlackjackState): ScheduledAction[] {
  const at = (action: BlackjackSystemAction, delayMs: number): ScheduledAction[] => [{ action, delayMs }];
  switch (state.phase) {
    case 'DEALING': {
      const dealt =
        state.dealer.cards.length +
        state.seats.reduce((n, seat) => n + (seat.hands[0]?.cards.length ?? 0), 0);
      return at({ type: 'SYS_DEAL_DONE' }, dealt * PACE.dealCard + PACE.dealCard);
    }
    case 'PEEK':
      return at({ type: 'SYS_PEEK' }, PACE.peek);
    case 'DEALER_TURN': {
      const revealing = !state.dealer.holeRevealed;
      return at({ type: 'SYS_DEALER_STEP' }, revealing ? PACE.reveal : PACE.dealerCard);
    }
    case 'SETTLEMENT': {
      const hands = state.seats.reduce((n, seat) => n + seat.hands.length, 0);
      return at({ type: 'SYS_NEXT_ROUND' }, hands * PACE.settleHand + PACE.summary);
    }
    case 'SHUFFLING':
      return at({ type: 'SYS_SHUFFLE_DONE' }, PACE.shuffle);
    case 'BETTING':
    case 'INSURANCE':
    case 'PLAYER_TURNS':
    case 'FINISHED':
      return [];
  }
}
