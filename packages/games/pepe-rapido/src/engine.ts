import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  createShoe,
  fail,
  shuffle,
  type ActionResult,
  type CardInstance,
  type PlayerId,
  type Rng,
  type ScheduledAction,
} from '@cardroom/game-core';
import {
  COLUMN_COUNT,
  MAX_IDLE_RECYCLES,
  PLAYER_COUNT,
  ROUND_SETUP_MS,
  canGroup,
  cardsOf,
  columnsEmpty,
  fitsCentre,
  flipRequired,
  hasCentrePlay,
  layOut,
  resolveRace,
} from './rules';
import type {
  PepeAction,
  PepeClientAction,
  PepeConfig,
  PepeEvent,
  PepeState,
  PileIndex,
  PlayerArea,
} from './types';

type Result = ActionResult<PepeState, PepeEvent>;

export interface DealInput {
  players: readonly PlayerId[];
  config: PepeConfig;
  rng: Rng;
}

/** Each player's cards for the first round. Injectable so tests can play with fixed cards. */
export type Dealer = (input: DealInput) => Record<PlayerId, CardInstance[]>;

/** Rules §2: the 54 (or 52) cards shuffled by the server's DRBG, half to each player. */
export const shuffledDealer: Dealer = ({ players, config, rng }) => {
  const deck = shuffle(createShoe({ decks: 1, jokers: config.jokers ? 2 : 0 }), rng);
  const half = deck.length / players.length;
  return Object.fromEntries(players.map((id, i) => [id, deck.slice(i * half, (i + 1) * half)]));
};

export function setup(
  players: readonly PlayerId[],
  config: PepeConfig,
  rng: Rng,
  dealer: Dealer = shuffledDealer,
): PepeState {
  if (players.length !== PLAYER_COUNT)
    throw new RangeError(`Pepe Rápido needs 2 players, got ${players.length}`);
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');
  const dealt = dealer({ players, config: { ...config }, rng });
  const uids = players.flatMap((id) => (dealt[id] ?? []).map((c) => c.uid));
  if (new Set(uids).size !== uids.length) throw new Error('A deal must use each card at most once');
  // The secret that keys every later shuffle (between rounds): drawn now, never sent to anyone.
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');
  return {
    phase: 'COUNTDOWN',
    config: { ...config },
    players: [players[0] as PlayerId, players[1] as PlayerId],
    areas: Object.fromEntries(
      players.map((id) => [id, { ...layOut(dealt[id] ?? []), wantsFlip: false } satisfies PlayerArea]),
    ),
    centre: [[], []],
    round: 1,
    roundWinner: null,
    winner: null,
    deadlock: false,
    flips: 1,
    idleRecycles: 0,
    seed,
  };
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: PepeState): PepeState {
  return {
    ...state,
    config: { ...state.config },
    players: [...state.players],
    areas: Object.fromEntries(
      Object.entries(state.areas).map(([id, area]) => [
        id,
        { columns: area.columns.map((c) => [...c]), reserve: [...area.reserve], wantsFlip: area.wantsFlip },
      ]),
    ),
    centre: [[...state.centre[0]], [...state.centre[1]]],
  };
}

interface Draft {
  s: PepeState;
  events: PepeEvent[];
  schedule: ScheduledAction[];
}

const draftOf = (state: PepeState): Draft => ({ s: cloneState(state), events: [], schedule: [] });
const done = ({ s, events, schedule }: Draft): Result =>
  schedule.length > 0 ? { ok: true, state: s, events, schedule } : { ok: true, state: s, events };

const areaOf = (state: PepeState, playerId: PlayerId) => state.areas[playerId] as PlayerArea;
const otherPlayer = (state: PepeState, playerId: PlayerId) =>
  state.players.find((id) => id !== playerId) as PlayerId;

const validColumn = (column: number) => Number.isInteger(column) && column >= 0 && column < COLUMN_COUNT;

export function applyAction(state: PepeState, action: PepeAction, playerId: PlayerId): Result {
  if (action.type.startsWith('SYS_')) {
    if (playerId !== SYSTEM_PLAYER_ID) return fail('SYSTEM_ONLY', 'Only the server can do that');
  } else if (!state.players.includes(playerId)) {
    return fail('UNKNOWN_PLAYER', 'Player is not part of this game');
  }
  if (state.phase === 'FINISHED') return fail('GAME_OVER', 'The game is over');

  switch (action.type) {
    case 'SYS_COUNTDOWN_DONE':
      return countdownDone(state, action.flip);
    case 'SYS_ROUND_SETUP_DONE':
      return roundSetUp(state, action.round);
    case 'SYS_AUTO_FLIP':
      return autoFlip(state);
    case 'PLAY_TO_CENTRE':
    case 'GROUP':
    case 'MOVE_TO_EMPTY':
      if (state.phase !== 'PLAYING' && state.phase !== 'STALLED') {
        return fail('WRONG_PHASE', 'Cards cannot be moved now');
      }
      return action.type === 'PLAY_TO_CENTRE'
        ? playToCentre(state, playerId, action)
        : move(state, playerId, action);
    case 'REQUEST_FLIP':
      return requestFlip(state, playerId);
    case 'CHOOSE_PILE':
      return choosePile(state, playerId, action.pile);
  }
}

/** The card a player moves must still be the top of the column they took it from. */
function takeTop(area: PlayerArea, column: number, cardUid: string): CardInstance | string {
  if (!validColumn(column)) return 'INVALID_COLUMN';
  const top = area.columns[column]?.at(-1);
  if (!top) return 'EMPTY_COLUMN';
  if (top.uid !== cardUid) return 'CARD_MOVED';
  return top;
}

const TAKE_ERRORS: Readonly<Record<string, string>> = {
  INVALID_COLUMN: 'There is no such column',
  EMPTY_COLUMN: 'That column is empty',
  CARD_MOVED: 'That card is no longer on top of its column',
};

/**
 * Rules §5.1, contract §5: onto either centre pile, one above or below its top.
 * The pile must still show what the player saw (`resolveRace`); a play that
 * empties the five columns ends the round at once.
 */
function playToCentre(
  state: PepeState,
  playerId: PlayerId,
  action: Extract<PepeClientAction, { type: 'PLAY_TO_CENTRE' }>,
): Result {
  const { column, pile, cardUid, expectedTopUid } = action;
  if (pile !== 0 && pile !== 1) return fail('INVALID_PILE', 'There is no such pile');
  const card = takeTop(areaOf(state, playerId), column, cardUid);
  if (typeof card === 'string') return fail(card, TAKE_ERRORS[card] as string);
  const target = state.centre[pile];
  const top = target.at(-1);
  if (!top) return fail('EMPTY_PILE', 'Nothing has been turned over onto that pile yet');
  if (resolveRace(target, expectedTopUid) === 'TOP_CHANGED') {
    return fail('TOP_CHANGED', 'The other player was faster');
  }
  if (!fitsCentre(card, top, state.config)) return fail('INVALID_MOVE', 'That card does not go there');

  const draft = draftOf(state);
  const { s } = draft;
  const area = areaOf(s, playerId);
  (area.columns[column] as CardInstance[]).pop();
  s.centre[pile].push(card);
  s.idleRecycles = 0;
  draft.events.push({
    type: 'Played',
    playerId,
    column,
    pile,
    card,
    revealed: area.columns[column]?.at(-1) ?? null,
  });
  // A card on the centre answers any "Virar" (contract §5).
  for (const id of s.players) areaOf(s, id).wantsFlip = false;

  if (columnsEmpty(area)) return endRound(draft, playerId);
  settlePlay(draft);
  return done(draft);
}

/** Rules §5.3–5.4: within one's own columns; the centre is untouched. */
function move(
  state: PepeState,
  playerId: PlayerId,
  action: Extract<PepeClientAction, { type: 'GROUP' | 'MOVE_TO_EMPTY' }>,
): Result {
  const { fromColumn, toColumn, cardUid } = action;
  const area = areaOf(state, playerId);
  const card = takeTop(area, fromColumn, cardUid);
  if (typeof card === 'string') return fail(card, TAKE_ERRORS[card] as string);
  if (!validColumn(toColumn) || toColumn === fromColumn) return fail('INVALID_COLUMN', 'Pick another column');
  const target = area.columns[toColumn] as CardInstance[];
  const targetTop = target.at(-1);
  if (action.type === 'GROUP') {
    if (!state.config.grouping) return fail('GROUPING_OFF', 'Grouping is off at this table');
    if (!targetTop) return fail('EMPTY_COLUMN', 'That column is empty: move the card there instead');
    if (!canGroup(card, targetTop, state.config))
      return fail('INVALID_MOVE', 'Only on the same rank (or a joker)');
  } else {
    if (!state.config.moveToEmpty) return fail('MOVE_OFF', 'Empty columns stay empty at this table');
    if (targetTop) return fail('NOT_EMPTY', 'That column is not empty');
    // Moving a lone card to another empty column changes nothing.
    if ((area.columns[fromColumn] as CardInstance[]).length < 2) {
      return fail('INVALID_MOVE', 'Nothing would be uncovered');
    }
  }

  const draft = draftOf(state);
  const mine = areaOf(draft.s, playerId);
  (mine.columns[fromColumn] as CardInstance[]).pop();
  (mine.columns[toColumn] as CardInstance[]).push(card);
  draft.events.push({
    type: action.type === 'GROUP' ? 'Grouped' : 'MovedToEmpty',
    playerId,
    from: fromColumn,
    to: toColumn,
    card,
    revealed: mine.columns[fromColumn]?.at(-1) ?? null,
  });
  settlePlay(draft);
  return done(draft);
}

/**
 * After every move: nobody able to play to the centre is a stall (contract §5,
 * the "Virar" button pulses); a stall that a move undid is play again, and the
 * requests to flip made during it lapse.
 */
function settlePlay(draft: Draft): void {
  const { s } = draft;
  const stalled = !s.players.some((id) => hasCentrePlay(s, id));
  if (stalled && s.phase !== 'STALLED') {
    s.phase = 'STALLED';
    draft.events.push({ type: 'Stalled' });
  } else if (!stalled && s.phase === 'STALLED') {
    s.phase = 'PLAYING';
    for (const id of s.players) areaOf(s, id).wantsFlip = false;
  }
}

/**
 * Rules §6: "Virar". Everyone with a reserve must ask (both when nobody has
 * one: the centre then goes back under the columns). Asking while someone can
 * still play is allowed: it takes everyone's agreement, as at a real table.
 */
function requestFlip(state: PepeState, playerId: PlayerId): Result {
  if (state.phase !== 'PLAYING' && state.phase !== 'STALLED')
    return fail('WRONG_PHASE', 'Nothing to turn over now');
  const required = flipRequired(state);
  if (!required.includes(playerId))
    return fail('NO_RESERVE', 'You have no reserve: the other player turns over');
  if (areaOf(state, playerId).wantsFlip) return fail('ALREADY_REQUESTED', 'Waiting for the other player');

  const draft = draftOf(state);
  areaOf(draft.s, playerId).wantsFlip = true;
  draft.events.push({ type: 'FlipRequested', playerId });
  if (required.every((id) => areaOf(draft.s, id).wantsFlip)) startCountdown(draft);
  return done(draft);
}

/** Time's up on a stall or on a pending "Virar": the flip goes ahead (09: autoFlip, away players). */
function autoFlip(state: PepeState): Result {
  const requested = state.players.some((id) => areaOf(state, id).wantsFlip);
  if (state.phase !== 'STALLED' && !(state.phase === 'PLAYING' && requested)) {
    return fail('STALE', 'Nothing to turn over');
  }
  const draft = draftOf(state);
  startCountdown(draft);
  return done(draft);
}

function startCountdown(draft: Draft): void {
  const { s } = draft;
  s.phase = 'COUNTDOWN';
  s.flips += 1;
  draft.events.push({ type: 'CountdownStarted', flip: s.flips });
}

/**
 * The 3-2-1 is over (rules §4, §6): everyone with a reserve turns its top card
 * over onto their own pile. Nobody with one: each takes the pile on their side
 * back, shuffled, as a reserve — and then turns over (09 #7).
 */
function countdownDone(state: PepeState, flip: number): Result {
  if (state.phase !== 'COUNTDOWN' || flip !== state.flips) return fail('STALE', 'That countdown is over');
  const draft = draftOf(state);
  const { s } = draft;
  if (s.players.every((id) => areaOf(s, id).reserve.length === 0)) {
    if (s.idleRecycles >= MAX_IDLE_RECYCLES) return deadlock(draft);
    s.players.forEach((id, i) => {
      const rng = createSeededRng(`${s.seed}:recycle:${s.round}:${s.flips}:${i}`);
      areaOf(s, id).reserve = shuffle(s.centre[i] as CardInstance[], rng);
      s.centre[i] = [];
    });
    s.idleRecycles += 1;
    draft.events.push({ type: 'Recycled' });
  }
  const cards = s.players.map((id, i) => {
    const card = areaOf(s, id).reserve.pop() ?? null;
    if (card) s.centre[i]?.push(card);
    return card;
  }) as [CardInstance | null, CardInstance | null];
  for (const id of s.players) areaOf(s, id).wantsFlip = false;
  draft.events.push({ type: 'Flipped', cards });
  // Nothing at all in the centre (cannot happen with a full deck): nobody can ever play.
  if (cards.every((c) => c === null)) return deadlock(draft);
  s.phase = 'PLAYING';
  settlePlay(draft);
  return done(draft);
}

/**
 * Rules §7–8. Emptying the columns with no reserve left means no cards at all:
 * that player wins. Otherwise they choose a pile.
 */
function endRound(draft: Draft, playerId: PlayerId): Result {
  const { s, events } = draft;
  events.push({ type: 'ColumnsEmptied', playerId });
  if (areaOf(s, playerId).reserve.length === 0) {
    s.phase = 'FINISHED';
    s.winner = playerId;
    events.push({ type: 'GameWon', playerId });
    return done(draft);
  }
  s.phase = 'CHOOSING_PILE';
  s.roundWinner = playerId;
  return done(draft);
}

/**
 * Rules §7: the chooser takes a pile with their reserve; the other takes the
 * other pile, their reserve and what was left in their columns. Each shuffles
 * and lays out the next round (rules §3).
 */
function choosePile(state: PepeState, playerId: PlayerId, pile: PileIndex): Result {
  if (state.phase !== 'CHOOSING_PILE') return fail('WRONG_PHASE', 'There is no pile to choose now');
  if (state.roundWinner !== playerId) return fail('NOT_ROUND_WINNER', 'The other player chooses');
  if (pile !== 0 && pile !== 1) return fail('INVALID_PILE', 'There is no such pile');

  const draft = draftOf(state);
  const { s, events } = draft;
  const other = otherPlayer(s, playerId);
  const mine = areaOf(s, playerId);
  const theirs = areaOf(s, other);
  const pools: Record<PlayerId, CardInstance[]> = {
    [playerId]: [...s.centre[pile], ...mine.reserve],
    [other]: [...s.centre[pile === 0 ? 1 : 0], ...theirs.reserve, ...theirs.columns.flat()],
  };
  events.push({ type: 'PileChosen', playerId, pile });
  s.round += 1;
  s.players.forEach((id, i) => {
    const rng = createSeededRng(`${s.seed}:round:${s.round}:${i}`);
    s.areas[id] = { ...layOut(shuffle(pools[id] as CardInstance[], rng)), wantsFlip: false };
  });
  s.centre = [[], []];
  s.roundWinner = null;
  s.idleRecycles = 0;
  s.phase = 'ROUND_SETUP';
  events.push({ type: 'RoundSetUp', round: s.round });
  draft.schedule.push({ action: { type: 'SYS_ROUND_SETUP_DONE', round: s.round }, delayMs: ROUND_SETUP_MS });
  return done(draft);
}

/** The new columns are on the table: count down to the first flip of the round. */
function roundSetUp(state: PepeState, round: number): Result {
  if (state.phase !== 'ROUND_SETUP' || round !== state.round)
    return fail('STALE', 'That round is already set up');
  const draft = draftOf(state);
  startCountdown(draft);
  return done(draft);
}

/**
 * Still stuck after `MAX_IDLE_RECYCLES` reshuffles with no card played (some
 * rule combinations can lock a table for good): fewer cards wins.
 */
function deadlock(draft: Draft): Result {
  const { s, events } = draft;
  const [a, b] = s.players.map((id) => cardsOf(areaOf(s, id))) as [number, number];
  s.phase = 'FINISHED';
  s.deadlock = true;
  s.winner = a === b ? null : a < b ? s.players[0] : s.players[1];
  events.push({ type: 'Deadlocked', winner: s.winner });
  if (s.winner) events.push({ type: 'GameWon', playerId: s.winner });
  return done(draft);
}
