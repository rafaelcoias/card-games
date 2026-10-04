import {
  SYSTEM_PLAYER_ID,
  createShoe,
  ok,
  shuffle,
  type ActionResult,
  type CardInstance,
  type PlayerId,
  type Rng,
  type ScheduledAction,
} from '@cardroom/game-core';
import { getDefaultAction } from './moves';
import {
  CARDS_PER_DECK,
  GRID_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PACE,
  deckCount,
  gridPoints,
  powerOf,
  sameRank,
  standings,
} from './rules';
import {
  canCallGringo,
  currentPlayerId,
  giverOf,
  gridOf,
  hasCards,
  nextIndex,
  offeredGringoOnly,
  playsTurns,
  powerUsable,
  seatsFrom,
  slotAt,
} from './state';
import type {
  GameEndReason,
  GringoAction,
  GringoClientAction,
  GringoConfig,
  GringoEvent,
  GringoState,
  GringoSystemAction,
  PowerType,
  RevealedGrid,
  SnapResult,
} from './types';

type Result = ActionResult<GringoState, GringoEvent>;
type Failure = Extract<Result, { ok: false }>;
const failure = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });

export interface DealInput {
  /** Clockwise. */
  seats: readonly PlayerId[];
  decks: number;
  rng: Rng;
}

/** Every player's four cards (grid positions 0–3) and the deck left over, top first. */
export interface Deal {
  grids: Record<PlayerId, CardInstance[]>;
  deck: CardInstance[];
}

/** Produces the deal. Injectable so tests can play with fixed cards (even a reduced deck). */
export type Dealer = (input: DealInput) => Deal;

/** The shoe shuffled by the server's DRBG; four cards each, one at a time; the rest is the deck. */
export const shuffledDealer: Dealer = ({ seats, decks, rng }) => {
  const shoe = shuffle(createShoe({ decks, jokers: 2 }), rng);
  const grids: Record<PlayerId, CardInstance[]> = Object.fromEntries(seats.map((id) => [id, []]));
  for (let round = 0; round < GRID_SIZE; round++) {
    for (const id of seats) (grids[id] as CardInstance[]).push(shoe.shift() as CardInstance);
  }
  return { grids, deck: shoe };
};

export function setup(
  players: readonly PlayerId[],
  config: GringoConfig,
  rng: Rng,
  dealer: Dealer = shuffledDealer,
): GringoState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Gringo needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');
  const decks = deckCount(config, players.length);
  const deal = dealer({ seats: players, decks, rng });
  const uids = [...players.flatMap((id) => deal.grids[id] ?? []), ...deal.deck].map((c) => c.uid);
  if (new Set(uids).size !== uids.length || uids.length > CARDS_PER_DECK * decks) {
    throw new Error('A deal must use each card of the shoe at most once');
  }
  if (players.some((id) => deal.grids[id]?.length !== GRID_SIZE)) {
    throw new Error(`Every player is dealt ${GRID_SIZE} cards`);
  }
  // Open point #9: the first player is drawn at random (the platform keeps no record of the last one).
  const starter = rng.nextInt(players.length);
  return {
    phase: 'INITIAL_PEEK',
    config: { ...config },
    decks,
    seats: [...players],
    currentIndex: starter,
    turn: 0,
    turnsPlayed: Object.fromEntries(players.map((id) => [id, 0])),
    grids: Object.fromEntries(
      players.map((id) => [id, (deal.grids[id] ?? []).map((card, index) => ({ index, card }))]),
    ),
    deck: [...deal.deck],
    discard: [],
    drawn: null,
    power: null,
    snap: null,
    nextDiscardId: 1,
    gringo: null,
    peekDone: [],
    endReason: null,
  };
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: GringoState): GringoState {
  return {
    ...state,
    config: { ...state.config },
    seats: [...state.seats],
    turnsPlayed: { ...state.turnsPlayed },
    grids: Object.fromEntries(
      Object.entries(state.grids).map(([id, grid]) => [id, grid.map((slot) => ({ ...slot }))]),
    ),
    deck: [...state.deck],
    discard: [...state.discard],
    power: state.power
      ? { ...state.power, peeked: state.power.peeked ? { ...state.power.peeked } : null }
      : null,
    snap: state.snap ? { ...state.snap, result: state.snap.result ? { ...state.snap.result } : null } : null,
    gringo: state.gringo ? { ...state.gringo, remaining: [...state.gringo.remaining] } : null,
    peekDone: [...state.peekDone],
  };
}

/** A state being changed by one action, and the events it produced so far. */
interface Draft {
  s: GringoState;
  events: GringoEvent[];
}

export function isSystemAction(action: GringoAction): action is GringoSystemAction {
  return action.type.startsWith('SYS_');
}

export function applyAction(state: GringoState, action: GringoAction, playerId: PlayerId): Result {
  const system = isSystemAction(action);
  if (system !== (playerId === SYSTEM_PLAYER_ID)) {
    return system
      ? failure('SYSTEM_ONLY', 'Only the server can do that')
      : failure('UNKNOWN_PLAYER', 'Player is not part of this game');
  }
  if (state.phase === 'FINISHED') return failure('GAME_OVER', 'The game is over');
  const d: Draft = { s: cloneState(state), events: [] };
  const error = system ? applySystem(d, action) : applyPlayer(d, action, playerId);
  if (error) return error;
  return ok(d.s, d.events, scheduleFor(d.s));
}

function applySystem(d: Draft, action: GringoSystemAction): Failure | null {
  const { s } = d;
  switch (action.type) {
    case 'SYS_INITIAL_PEEK_END':
      if (s.phase !== 'INITIAL_PEEK') return failure('WRONG_PHASE', 'The initial peek is over');
      endInitialPeek(d);
      return null;
    case 'SYS_PEEK_END':
      return endPeek(d);
    case 'SYS_SNAP_WINDOW_CLOSED':
      if (s.phase !== 'SNAP_WINDOW' || s.snap?.discardId !== action.discardId) {
        return failure('STALE_WINDOW', 'That window is no longer open');
      }
      d.events.push({ type: 'SnapWindowClosed', discardId: action.discardId });
      s.snap = null;
      endTurn(d);
      return null;
    case 'SYS_TIMEOUT':
      return timeout(d);
  }
}

function applyPlayer(d: Draft, action: GringoClientAction, playerId: PlayerId): Failure | null {
  const { s } = d;
  if (!s.seats.includes(playerId)) return failure('UNKNOWN_PLAYER', 'Player is not part of this game');
  // Out of turn: everyone memorises at once, anyone may snap, and a snapper owes a card.
  if (action.type === 'PEEK_DONE') return peekDone(d, playerId);
  if (action.type === 'SNAP') {
    return snap(d, playerId, action.discardId, action.owner ?? playerId, action.index);
  }
  if (action.type === 'SNAP_GIVE') return give(d, playerId, action.index);
  if (currentPlayerId(s) !== playerId) return failure('NOT_YOUR_TURN', 'It is not your turn');
  switch (action.type) {
    case 'CALL_GRINGO':
      return callGringo(d, playerId);
    case 'PASS':
      if (s.phase !== 'TURN_DRAW' || hasCards(s, playerId)) {
        return failure('WRONG_PHASE', 'Only a player without cards lets their turn go');
      }
      d.events.push({ type: 'TurnPassed', playerId });
      endTurn(d);
      return null;
    case 'DRAW':
      return draw(d, playerId);
    case 'SWAP_DRAWN':
      return swapDrawn(d, playerId, action.index);
    case 'DISCARD_DRAWN':
      return discardDrawn(d, playerId, action.usePower);
    case 'POWER_PEEK':
      return powerPeek(d, playerId, action.owner, action.index);
    case 'POWER_PEEK_DONE':
      return endPeek(d);
    case 'POWER_BLIND_SWAP':
      return blindSwap(d, playerId, action.myIndex, action.owner, action.theirIndex);
    case 'POWER_SWAP_DECISION':
      return swapDecision(d, playerId, action.swap, action.myIndex);
    case 'POWER_SKIP':
      if (s.phase !== 'POWER' || s.power?.step !== 'CHOOSE') {
        return failure('WRONG_PHASE', 'There is no power to give up');
      }
      d.events.push({ type: 'PowerSkipped', playerId });
      openSnapWindow(d);
      return null;
  }
}

/** "Memorizei": the player's bottom row turns back; the last one to memorise starts the game. */
function peekDone(d: Draft, playerId: PlayerId): Failure | null {
  const { s } = d;
  if (s.phase !== 'INITIAL_PEEK') return failure('WRONG_PHASE', 'The initial peek is over');
  if (s.peekDone.includes(playerId)) return failure('ALREADY_DONE', 'You already memorised your cards');
  s.peekDone.push(playerId);
  d.events.push({ type: 'PeekDone', playerId });
  if (s.seats.every((id) => s.peekDone.includes(id))) endInitialPeek(d);
  return null;
}

function endInitialPeek(d: Draft): void {
  d.events.push({ type: 'InitialPeekEnded' });
  startTurn(d, d.s.currentIndex);
}

function startTurn(d: Draft, index: number): void {
  const { s } = d;
  s.phase = 'TURN_DRAW';
  s.currentIndex = index;
  s.turn += 1;
  d.events.push({ type: 'TurnStarted', playerId: s.seats[index] as PlayerId, turn: s.turn });
}

/**
 * Rules §9: on turn, before drawing. The caller still plays their turn; then
 * every other player who holds cards plays once more. A player without cards
 * says it when their turn would come, and that is their whole turn (rules §8).
 */
function callGringo(d: Draft, playerId: PlayerId): Failure | null {
  const { s } = d;
  if (s.phase !== 'TURN_DRAW') return failure('WRONG_PHASE', 'Say "Gringo" before drawing');
  if (!s.config.gringoEnabled) return failure('GRINGO_DISABLED', 'This table plays without "Gringo"');
  if (s.gringo) return failure('GRINGO_ALREADY_CALLED', 'Someone already said "Gringo"');
  if (!canCallGringo(s)) return failure('GRINGO_TOO_SOON', 'Not everyone has played enough turns yet');
  const remaining = s.seats.filter((id) => id !== playerId && hasCards(s, id));
  s.gringo = { calledBy: playerId, remaining };
  d.events.push({ type: 'GringoCalled', playerId, remaining: [...remaining] });
  if (!hasCards(s, playerId)) endTurn(d);
  return null;
}

/** Only from the deck (rules §5); only the player sees the card. */
function draw(d: Draft, playerId: PlayerId): Failure | null {
  const { s } = d;
  if (s.phase !== 'TURN_DRAW') return failure('WRONG_PHASE', 'You already drew');
  if (!hasCards(s, playerId)) return failure('NO_CARDS_LEFT', 'You have no cards: you only may say "Gringo"');
  const card = s.deck.shift();
  if (!card) return failure('DECK_EMPTY', 'The deck is empty');
  s.drawn = card;
  s.turnsPlayed[playerId] = (s.turnsPlayed[playerId] ?? 0) + 1;
  s.phase = 'TURN_DECIDE';
  d.events.push({ type: 'Drew', playerId, deckCount: s.deck.length });
  return null;
}

/**
 * The drawn card takes the slot, face down; the card that was there goes to
 * the discard pile, face up. If that card has a power, the player may use it
 * (or give it up with `POWER_SKIP`), as with a drawn card discarded straight away.
 */
function swapDrawn(d: Draft, playerId: PlayerId, index: number): Failure | null {
  const { s } = d;
  if (s.phase !== 'TURN_DECIDE' || !s.drawn) return failure('WRONG_PHASE', 'Draw a card first');
  const slot = slotAt(s, playerId, index);
  if (!slot?.card) return failure('EMPTY_SLOT', 'There is no card in that position');
  const discarded = slot.card;
  slot.card = s.drawn;
  s.drawn = null;
  s.discard.push(discarded);
  const offered = powerOf(discarded, s.config.powerSet);
  const power = offered && powerUsable(s, playerId, offered) ? offered : null;
  d.events.push({ type: 'Swapped', playerId, index, discarded, power });
  startPowerOrWindow(d, power);
  return null;
}

/** Straight to the discard pile; with a power, the player may use it first (rules §6). */
function discardDrawn(d: Draft, playerId: PlayerId, usePower: boolean): Failure | null {
  const { s } = d;
  if (s.phase !== 'TURN_DECIDE' || !s.drawn) return failure('WRONG_PHASE', 'Draw a card first');
  const card = s.drawn;
  const power = usePower ? powerOf(card, s.config.powerSet) : null;
  if (usePower && !power) return failure('NO_POWER', 'That card has no power');
  if (power && !powerUsable(s, playerId, power)) {
    return failure('NO_TARGET', 'Nobody else has cards for that power');
  }
  s.drawn = null;
  s.discard.push(card);
  d.events.push({ type: 'DiscardedDrawn', playerId, card, power });
  startPowerOrWindow(d, power);
  return null;
}

/** The card the player on turn just discarded: its power first, if any, then the snap window (rules §6, §7). */
function startPowerOrWindow(d: Draft, power: PowerType | null): void {
  if (!power) return openSnapWindow(d);
  d.s.phase = 'POWER';
  d.s.power = { type: power, step: 'CHOOSE', peeked: null };
}

/** 10 / queen / first step of the king: one card is turned for the player alone. */
function powerPeek(d: Draft, playerId: PlayerId, owner: PlayerId, index: number): Failure | null {
  const { s } = d;
  const power = s.power;
  if (s.phase !== 'POWER' || !power || power.step !== 'CHOOSE' || power.type === 'BLIND_SWAP') {
    return failure('WRONG_PHASE', 'You have no card to look at');
  }
  const own = power.type === 'PEEK_OWN';
  if (own ? owner !== playerId : owner === playerId) {
    return failure('WRONG_TARGET', own ? 'Look at one of your own cards' : "Look at another player's card");
  }
  if (!s.seats.includes(owner)) return failure('UNKNOWN_TARGET', 'That player is not at the table');
  if (!slotAt(s, owner, index)?.card) return failure('EMPTY_SLOT', 'There is no card in that position');
  power.step = 'PEEKED';
  power.peeked = { owner, index };
  d.events.push({ type: 'Peeked', playerId, owner, index });
  return null;
}

/** The card looked at with a 10 or a queen turns back: by the player, or when its time on screen is up. */
function endPeek(d: Draft): Failure | null {
  const { s } = d;
  if (s.phase !== 'POWER' || s.power?.step !== 'PEEKED' || s.power.type === 'PEEK_AND_SWAP') {
    return failure('WRONG_PHASE', 'Nobody is looking at a card');
  }
  d.events.push({ type: 'PeekEnded', playerId: s.seats[s.currentIndex] as PlayerId });
  openSnapWindow(d);
  return null;
}

/** Jack: two cards trade places, face down, each to the exact slot of the other (rules §6). */
function blindSwap(
  d: Draft,
  playerId: PlayerId,
  myIndex: number,
  owner: PlayerId,
  theirIndex: number,
): Failure | null {
  const { s } = d;
  if (s.phase !== 'POWER' || s.power?.type !== 'BLIND_SWAP') {
    return failure('WRONG_PHASE', 'You have no swap to make');
  }
  if (owner === playerId) return failure('WRONG_TARGET', "Swap with another player's card");
  if (!s.seats.includes(owner)) return failure('UNKNOWN_TARGET', 'That player is not at the table');
  const mine = slotAt(s, playerId, myIndex);
  const theirs = slotAt(s, owner, theirIndex);
  if (!mine?.card || !theirs?.card) return failure('EMPTY_SLOT', 'There is no card in that position');
  [mine.card, theirs.card] = [theirs.card, mine.card];
  d.events.push({ type: 'BlindSwapped', playerId, myIndex, owner, theirIndex });
  openSnapWindow(d, PACE.swap);
  return null;
}

/** King, after looking: the card seen comes to `myIndex` and the player's card goes to its slot — or not. */
function swapDecision(d: Draft, playerId: PlayerId, swap: boolean, myIndex?: number): Failure | null {
  const { s } = d;
  const power = s.power;
  if (s.phase !== 'POWER' || power?.type !== 'PEEK_AND_SWAP' || power.step !== 'PEEKED' || !power.peeked) {
    return failure('WRONG_PHASE', 'Look at a card first');
  }
  const { owner, index: theirIndex } = power.peeked;
  if (swap) {
    if (myIndex === undefined) return failure('EMPTY_SLOT', 'Choose one of your cards');
    const mine = slotAt(s, playerId, myIndex);
    const theirs = slotAt(s, owner, theirIndex);
    if (!mine?.card || !theirs?.card) return failure('EMPTY_SLOT', 'There is no card in that position');
    [mine.card, theirs.card] = [theirs.card, mine.card];
  }
  d.events.push({
    type: 'PeekSwapDecided',
    playerId,
    swapped: swap,
    myIndex: swap ? (myIndex as number) : null,
    owner,
    theirIndex,
  });
  openSnapWindow(d, swap ? PACE.swap : 0);
  return null;
}

/**
 * A card reached the discard pile (other than by a snap): one snap may follow
 * (rules §7). `leadMs`: the move that opened it is still being shown.
 */
function openSnapWindow(d: Draft, leadMs = 0): void {
  const { s } = d;
  const card = s.discard.at(-1) as CardInstance;
  s.power = null;
  s.phase = 'SNAP_WINDOW';
  s.snap = { discardId: s.nextDiscardId++, leadMs, result: null };
  d.events.push({ type: 'SnapWindowOpened', discardId: s.snap.discardId, card });
}

/**
 * Rules §7: the first snap on a discard wins the race (the room's single queue
 * orders them) and closes it for everyone. Same rank: the card goes to the
 * discard pile and the slot stays empty. Another rank: the card is shown, goes
 * back, and a penalty card comes face down into a new slot of the snapper's
 * grid (open point #5).
 *
 * The card may be another player's: on a hit, the snapper then gives them one
 * of their own cards for the slot left empty (`SNAP_GIVE`), so it is the
 * snapper who ends up with a card fewer.
 */
function snap(
  d: Draft,
  playerId: PlayerId,
  discardId: number,
  owner: PlayerId,
  index: number,
): Failure | null {
  const { s } = d;
  const window = s.snap;
  if (s.phase !== 'SNAP_WINDOW' || !window || window.discardId !== discardId) {
    return failure('SNAP_CLOSED', 'Too late: that card can no longer be snapped');
  }
  if (window.result) return failure('SNAP_TAKEN', 'Someone already snapped that card');
  if (!s.seats.includes(owner)) return failure('UNKNOWN_TARGET', 'That player is not at the table');
  const theirs = owner !== playerId;
  if (theirs && !hasCards(s, playerId)) {
    return failure('NO_CARD_TO_GIVE', "Snapping another player's card takes a card of your own to give");
  }
  const slot = slotAt(s, owner, index);
  if (!slot?.card) return failure('EMPTY_SLOT', 'There is no card in that position');
  const card = slot.card;
  const top = s.discard.at(-1) as CardInstance;
  if (sameRank(card, top)) {
    slot.card = null;
    s.discard.push(card);
    window.result = { playerId, owner, index, card, hit: true, penaltyIndex: null, given: null };
    d.events.push({ type: 'SnapSucceeded', discardId, playerId, owner, index, card });
    if (theirs) s.phase = 'SNAP_GIVE';
    else if (!hasCards(s, playerId)) d.events.push({ type: 'PlayerOut', playerId });
    return null;
  }
  const penalty = s.deck.shift();
  const grid = gridOf(s, playerId);
  const penaltyIndex = penalty ? nextIndex(grid) : null;
  if (penalty) grid.push({ index: penaltyIndex as number, card: penalty });
  window.result = { playerId, owner, index, card, hit: false, penaltyIndex, given: null };
  d.events.push({ type: 'SnapFailed', discardId, playerId, owner, index, card, penaltyIndex });
  return null;
}

/**
 * After a hit on another player's card: the snapper's card `index` goes, face
 * down and unseen, to the exact slot that was emptied; the snapper's slot stays empty.
 */
function give(d: Draft, playerId: PlayerId, index: number): Failure | null {
  const { s } = d;
  const window = s.snap;
  const result = window?.result;
  if (s.phase !== 'SNAP_GIVE' || !window || !result) return failure('WRONG_PHASE', 'You owe nobody a card');
  if (result.playerId !== playerId) return failure('NOT_YOUR_TURN', 'Only who snapped gives a card');
  const mine = slotAt(s, playerId, index);
  const gap = slotAt(s, result.owner, result.index);
  if (!mine?.card || !gap) return failure('EMPTY_SLOT', 'There is no card in that position');
  gap.card = mine.card;
  mine.card = null;
  result.given = index;
  s.phase = 'SNAP_WINDOW';
  d.events.push({
    type: 'CardGiven',
    discardId: window.discardId,
    playerId,
    index,
    owner: result.owner,
    ownerIndex: result.index,
  });
  if (!hasCards(s, playerId)) d.events.push({ type: 'PlayerOut', playerId });
  return null;
}

/**
 * After the snap window (or a turn let go): the end of a "Gringo" round or of
 * the deck ends the game (open point #7); otherwise the next player clockwise
 * who plays — skipping whoever has no cards (rules §8).
 */
function endTurn(d: Draft): void {
  const { s } = d;
  const current = s.seats[s.currentIndex] as PlayerId;
  s.power = null;
  s.drawn = null;
  if (s.gringo) {
    s.gringo.remaining = s.gringo.remaining.filter((id) => id !== current && hasCards(s, id));
    if (s.gringo.remaining.length === 0) return finish(d, 'GRINGO');
  }
  if (s.deck.length === 0) return finish(d, 'DECK');
  const next = seatsFrom(s, s.currentIndex).find((i) => {
    const id = s.seats[i] as PlayerId;
    return playsTurns(s, id) || offeredGringoOnly(s, id);
  });
  if (next === undefined) return finish(d, 'NO_CARDS');
  startTurn(d, next);
}

/** Rules §10: every grid is turned over and counted; the fewest points win. */
function finish(d: Draft, reason: GameEndReason): void {
  const { s } = d;
  s.phase = 'FINISHED';
  s.endReason = reason;
  s.snap = null;
  s.power = null;
  const scores = scoresOf(s);
  const best = Math.min(...Object.values(scores));
  d.events.push({
    type: 'GameFinished',
    reason,
    grids: Object.fromEntries(
      s.seats.map((id): [PlayerId, RevealedGrid] => [
        id,
        gridOf(s, id).map((slot) => ({ index: slot.index, card: slot.card })),
      ]),
    ),
    scores,
    winners: s.seats.filter((id) => scores[id] === best),
  });
}

export function scoresOf(state: GringoState): Record<PlayerId, number> {
  return Object.fromEntries(
    state.seats.map((id) => [id, gridPoints(gridOf(state, id), state.config.redKingValue)]),
  );
}

export const resultOf = (state: GringoState) => ({ standings: standings(scoresOf(state), state.seats) });

/**
 * Rules §12, when the clock runs out: a turn not drawn yet draws and discards
 * the card; a drawn card is discarded, without its power; a power is given up
 * (the king's swap is not made); a player without cards lets the turn go; a
 * snapper owing a card gives their first one.
 */
function timeout(d: Draft): Failure | null {
  const { s } = d;
  const current = currentPlayerId(s) ?? giverOf(s);
  if (!current) return failure('WRONG_PHASE', 'Nobody is on the clock');
  if (s.phase === 'TURN_DRAW' && hasCards(s, current)) {
    const drew = draw(d, current);
    if (drew) return drew;
    return discardDrawn(d, current, false);
  }
  const fallback = getDefaultAction(s, current);
  if (!fallback) return failure('WRONG_PHASE', 'Nothing to decide');
  return applyPlayer(d, fallback, current);
}

/** How long the snap window stays once settled: the snap, and any card given after it, play out on screen. */
function settleMs(result: SnapResult): number {
  if (result.given !== null) return PACE.give;
  return result.hit ? PACE.snapHit : PACE.snapMiss;
}

/**
 * The engine's own pauses, derived from the state after every action (a
 * schedule is dropped as soon as anything else happens): the snap window, the
 * moment a missed or good snap (or a card given) stays on screen, and a
 * power's peek. A snapper owing a card is on the clock instead.
 */
export function scheduleFor(state: GringoState): ScheduledAction[] {
  const at = (action: GringoSystemAction, delayMs: number): ScheduledAction[] => [{ action, delayMs }];
  if (state.phase === 'SNAP_WINDOW' && state.snap) {
    const { discardId, leadMs, result } = state.snap;
    const delay = result ? settleMs(result) : leadMs + state.config.snapWindowMs;
    return at({ type: 'SYS_SNAP_WINDOW_CLOSED', discardId }, delay);
  }
  if (state.phase === 'POWER' && state.power?.step === 'PEEKED' && state.power.type !== 'PEEK_AND_SWAP') {
    return at({ type: 'SYS_PEEK_END' }, PACE.peek);
  }
  return [];
}
