import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  createShoe,
  ok,
  shuffle,
  type ActionResult,
  type CardInstance,
  type GameResult,
  type PlayerId,
  type Rng,
  type ScheduledAction,
  type SetupOptions,
} from '@cardroom/game-core';
import {
  DECK_SIZE,
  EXCLUDED_RANKS,
  HAND_SIZE,
  PACE,
  PLAYERS,
  PLAY_ORDER,
  TOTAL_POINTS,
  TRICKS_PER_HAND,
  gamesFor,
  legalCards,
  nextSeat,
  otherTeam,
  previousSeat,
  sumPoints,
  teamOf,
  timeoutCard,
  trickWinner,
} from './rules';
import { canViewLastTrick, currentSeat, playersOf, seatOf, tricksPlayed } from './state';
import type {
  ClosedTrick,
  CutFrom,
  HandSummary,
  Seat,
  SuecaAction,
  SuecaClientAction,
  SuecaConfig,
  SuecaEvent,
  SuecaState,
  SuecaSystemAction,
  TallyEntry,
  Team,
} from './types';

type Result = ActionResult<SuecaState, SuecaEvent>;
type Failure = Extract<Result, { ok: false }>;
const failure = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });

export interface DealInput {
  handNumber: number;
  dealer: Seat;
  seed: string;
}

/** The 40 cards of a hand, top first, before the cut. Injectable so tests can stack the deck. */
export type Dealer = (input: DealInput) => CardInstance[];

/** A fresh 40-card deck per hand, shuffled by a PRNG keyed by the match's secret seed and the hand. */
export const shuffledDealer: Dealer = ({ handNumber, seed }) =>
  shuffle(
    createShoe({ decks: 1, excludeRanks: EXCLUDED_RANKS }),
    createSeededRng(`${seed}:hand:${handNumber}`),
  );

/** A state being changed by one action, and the events it produced so far. */
interface Draft {
  s: SuecaState;
  events: SuecaEvent[];
  dealer: Dealer;
}

const perSeat = <T>(value: () => T): Record<Seat, T> => ({ S: value(), E: value(), N: value(), W: value() });
const perTeam = <T>(value: () => T): Record<Team, T> => ({ A: value(), B: value() });

export function setup(
  players: readonly PlayerId[],
  config: SuecaConfig,
  rng: Rng,
  options: SetupOptions = {},
): SuecaState {
  if (players.length !== PLAYERS)
    throw new RangeError(`Sueca needs ${PLAYERS} players, got ${players.length}`);
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');
  const seats = seatsFrom(players, options.seating);
  // Open point #8: the first dealer is drawn.
  const first = PLAY_ORDER[rng.nextInt(PLAYERS)] as Seat;
  const seed = Array.from({ length: 64 }, () => rng.nextInt(16).toString(16)).join('');
  return {
    phase: 'CUT',
    pausedFrom: null,
    absent: [],
    config: { ...config },
    seats,
    handNumber: 1,
    dealer: first,
    cutter: previousSeat(first),
    cutFrom: null,
    trumpCard: null,
    trumpSuit: null,
    trumpCardPlayed: false,
    hands: perSeat(() => []),
    trick: { leader: nextSeat(first), plays: [] },
    trickWinner: null,
    lastTrick: null,
    lastTrickViewsUsed: perSeat(() => 0),
    lastTrickShown: {},
    wonCards: perTeam(() => []),
    tricksWon: perTeam(() => 0),
    games: perTeam(() => 0),
    history: [],
    winner: null,
    tally: tallyFrom(options.previousResult?.summary),
    seed,
  };
}

/** The seats chosen in the room (core §1); without them, the players in the order of play. */
function seatsFrom(
  players: readonly PlayerId[],
  seating: Readonly<Record<string, PlayerId>> | undefined,
): Record<Seat, PlayerId> {
  if (!seating) {
    return Object.fromEntries(PLAY_ORDER.map((seat, i) => [seat, players[i]])) as Record<Seat, PlayerId>;
  }
  const seats = Object.fromEntries(PLAY_ORDER.map((seat) => [seat, seating[seat]])) as Record<Seat, PlayerId>;
  const seated = Object.values(seats);
  if (Object.keys(seating).length !== PLAYERS || players.some((id) => !seated.includes(id))) {
    throw new RangeError('Every seat (S, E, N, W) needs one of the players');
  }
  return seats;
}

/** The room's tally, as the previous match of these players left it (anything else is ignored). */
function tallyFrom(summary: Record<string, unknown> | undefined): TallyEntry[] {
  const tally = summary?.tally;
  if (!Array.isArray(tally)) return [];
  return tally.flatMap((entry: unknown) => {
    const { players, wins } = (entry ?? {}) as Partial<TallyEntry>;
    const valid =
      Array.isArray(players) &&
      players.length === 2 &&
      players.every((id) => typeof id === 'string') &&
      Number.isInteger(wins);
    return valid ? [{ players: [...players].sort() as [PlayerId, PlayerId], wins: wins as number }] : [];
  });
}

const pairKey = (players: readonly PlayerId[]) => [...players].sort().join('|');

/** Matches won by today's pairs (open to the match in play: it counts once it is over). */
export function matchesWon(state: Pick<SuecaState, 'tally' | 'seats'>): Record<Team, number> {
  const wins = (team: Team) =>
    state.tally.find((entry) => pairKey(entry.players) === pairKey(playersOf(state, team)))?.wins ?? 0;
  return { A: wins('A'), B: wins('B') };
}

/** Containers are copied; cards are immutable values. */
function cloneState(state: SuecaState): SuecaState {
  const copyTrick = (t: ClosedTrick): ClosedTrick => ({ ...t, plays: [...t.plays] });
  return {
    ...state,
    config: { ...state.config },
    absent: [...state.absent],
    seats: { ...state.seats },
    hands: { S: [...state.hands.S], E: [...state.hands.E], N: [...state.hands.N], W: [...state.hands.W] },
    trick: { ...state.trick, plays: [...state.trick.plays] },
    lastTrick: state.lastTrick ? copyTrick(state.lastTrick) : null,
    lastTrickViewsUsed: { ...state.lastTrickViewsUsed },
    lastTrickShown: Object.fromEntries(
      Object.entries(state.lastTrickShown).map(([seat, trick]) => [seat, copyTrick(trick)]),
    ),
    wonCards: { A: [...state.wonCards.A], B: [...state.wonCards.B] },
    tricksWon: { ...state.tricksWon },
    games: { ...state.games },
    history: [...state.history],
    tally: state.tally.map((entry) => ({ ...entry, players: [...entry.players] })),
  };
}

const SYSTEM_ACTIONS = new Set<SuecaAction['type']>([
  'SYS_CUT_TIMEOUT',
  'SYS_TURN_TIMEOUT',
  'SYS_TRICK_SHOWN',
  'SYS_HIDE_LAST_TRICK',
  'SYS_NEXT_HAND',
  'SYS_PAUSE',
  'SYS_RESUME',
]);

export function isSystemAction(action: SuecaAction): action is SuecaSystemAction {
  return SYSTEM_ACTIONS.has(action.type);
}

export function applyAction(
  state: SuecaState,
  action: SuecaAction,
  playerId: PlayerId,
  dealer: Dealer = shuffledDealer,
): Result {
  const d: Draft = { s: cloneState(state), events: [], dealer };
  const error = isSystemAction(action)
    ? playerId === SYSTEM_PLAYER_ID
      ? applySystem(d, action)
      : failure('SYSTEM_ONLY', 'Only the server can do that')
    : applyPlayer(d, action, playerId);
  if (error) return error;
  return ok(d.s, d.events, scheduleFor(d.s));
}

function applyPlayer(d: Draft, action: SuecaClientAction, playerId: PlayerId): Failure | null {
  const { s } = d;
  const seat = seatOf(s, playerId);
  if (!seat) return failure('UNKNOWN_PLAYER', 'Player is not part of this game');
  if (s.phase === 'PAUSED') return failure('PAUSED', 'The table is waiting for a player');
  switch (action.type) {
    case 'CHOOSE_CUT':
      if (s.phase !== 'CUT') return failure('WRONG_PHASE', 'The deck is not being cut');
      if (seat !== s.cutter) return failure('NOT_CUTTER', 'Someone else cuts this hand');
      cut(d, action.from);
      return null;
    case 'PLAY': {
      if (s.phase !== 'PLAYING') return failure('WRONG_PHASE', 'You cannot play a card now');
      if (currentSeat(s) !== seat) return failure('NOT_YOUR_TURN', 'It is not your turn');
      const card = s.hands[seat].find((c) => c.uid === action.cardUid);
      if (!card) return failure('INVALID_CARD', 'That card is not in your hand');
      if (!legalCards(s.hands[seat], s.trick.plays).includes(card)) {
        return failure('MUST_FOLLOW_SUIT', 'You must follow the suit led');
      }
      play(d, seat, card);
      return null;
    }
    case 'VIEW_LAST_TRICK':
      if (!s.lastTrick) return failure('NO_LAST_TRICK', 'No trick has been closed yet');
      if (s.phase !== 'PLAYING' && s.phase !== 'TRICK_DONE') {
        return failure('WRONG_PHASE', 'The last trick is only shown while a hand is played');
      }
      if (!canViewLastTrick(s, seat)) return failure('LAST_TRICK_USED', 'You already looked this hand');
      s.lastTrickViewsUsed[seat] += 1;
      s.lastTrickShown[seat] = { winner: s.lastTrick.winner, plays: [...s.lastTrick.plays] };
      d.events.push({ type: 'LastTrickViewed', seat });
      return null;
  }
}

function applySystem(d: Draft, action: SuecaSystemAction): Failure | null {
  const { s } = d;
  const wrongPhase = () => failure('WRONG_PHASE', `${action.type} does not apply in ${s.phase}`);
  switch (action.type) {
    case 'SYS_CUT_TIMEOUT':
      if (s.phase !== 'CUT') return wrongPhase();
      cut(d, randomCut(s));
      return null;
    case 'SYS_TURN_TIMEOUT': {
      const seat = currentSeat(s);
      if (s.phase !== 'PLAYING' || !seat) return wrongPhase();
      play(d, seat, timeoutCard(legalCards(s.hands[seat], s.trick.plays), s.trumpSuit));
      return null;
    }
    case 'SYS_TRICK_SHOWN':
      if (s.phase !== 'TRICK_DONE') return wrongPhase();
      collect(d);
      return null;
    case 'SYS_HIDE_LAST_TRICK':
      if (!s.lastTrickShown[action.seat]) return failure('NOT_SHOWN', 'That seat is not looking');
      delete s.lastTrickShown[action.seat];
      return null;
    case 'SYS_NEXT_HAND':
      if (s.phase !== 'HAND_SUMMARY') return wrongPhase();
      nextHand(d);
      return null;
    case 'SYS_PAUSE': {
      const seat = seatOf(s, action.playerId);
      if (!seat) return failure('UNKNOWN_PLAYER', 'Player is not part of this game');
      if (s.phase === 'FINISHED') return wrongPhase();
      if (s.absent.includes(seat)) return failure('ALREADY_ABSENT', 'The table already waits for them');
      if (s.phase !== 'PAUSED') {
        s.pausedFrom = s.phase;
        s.phase = 'PAUSED';
        // A look at the last trick ends with the pause (its clock stops with the table).
        s.lastTrickShown = {};
      }
      s.absent.push(seat);
      d.events.push({ type: 'GamePaused', seat });
      return null;
    }
    case 'SYS_RESUME': {
      const seat = seatOf(s, action.playerId);
      if (!seat) return failure('UNKNOWN_PLAYER', 'Player is not part of this game');
      if (s.phase !== 'PAUSED' || !s.absent.includes(seat))
        return failure('NOT_ABSENT', 'Nobody waits for them');
      s.absent = s.absent.filter((x) => x !== seat);
      if (s.absent.length === 0) {
        s.phase = s.pausedFrom as SuecaState['phase'];
        s.pausedFrom = null;
      }
      d.events.push({ type: 'GameResumed', seat });
      return null;
    }
  }
}

/** Timeout of the cut: top or bottom, drawn from the match's seed (so it replays). */
export function randomCut(s: Pick<SuecaState, 'seed' | 'handNumber'>): CutFrom {
  return createSeededRng(`${s.seed}:cut:${s.handNumber}`).nextInt(2) === 0 ? 'TOP' : 'BOTTOM';
}

/**
 * Rules §6: the chosen card (top or bottom of the shuffled deck) is the trump
 * and belongs to the dealer, face up. Then ten cards each, one at a time from
 * the dealer's right; the trump card is one of the dealer's ten.
 */
function cut(d: Draft, from: CutFrom): void {
  const { s } = d;
  const deck = d.dealer({ handNumber: s.handNumber, dealer: s.dealer, seed: s.seed });
  if (deck.length !== DECK_SIZE || new Set(deck.map((c) => c.uid)).size !== DECK_SIZE) {
    throw new Error(`A Sueca deck has ${DECK_SIZE} different cards`);
  }
  const trump = (from === 'TOP' ? deck[0] : deck[DECK_SIZE - 1]) as CardInstance;
  const rest = deck.filter((card) => card !== trump);
  const order = [1, 2, 3, 0].map((steps) => nextSeat(s.dealer, steps));
  s.hands = perSeat(() => []);
  rest.forEach((card, i) => s.hands[order[i % PLAYERS] as Seat].push(card));
  s.hands[s.dealer].push(trump);
  s.cutFrom = from;
  s.trumpCard = trump;
  s.trumpSuit = trump.suit;
  s.trumpCardPlayed = false;
  s.trick = { leader: nextSeat(s.dealer), plays: [] };
  s.phase = 'PLAYING';
  d.events.push(
    { type: 'CutChosen', cutter: s.cutter, from },
    { type: 'TrumpRevealed', card: trump, holder: s.dealer },
    { type: 'CardsDealt', counts: perSeat(() => HAND_SIZE) },
  );
}

/** Puts a validated card on the table; the fourth one closes the trick, which stays a moment. */
function play(d: Draft, seat: Seat, card: CardInstance): void {
  const { s } = d;
  s.hands[seat] = s.hands[seat].filter((c) => c !== card);
  s.trick.plays.push({ seat, card });
  if (card.uid === s.trumpCard?.uid) s.trumpCardPlayed = true;
  d.events.push({ type: 'CardPlayed', seat, card });
  if (s.trick.plays.length < PLAYERS) return;
  const winner = trickWinner(s.trick.plays, s.trumpSuit as NonNullable<SuecaState['trumpSuit']>);
  s.trickWinner = winner;
  s.phase = 'TRICK_DONE';
  d.events.push({ type: 'TrickWon', winner, team: teamOf(winner) });
}

/** The trick goes to the winners' pile; they open the next one, or the hand is scored. */
function collect(d: Draft): void {
  const { s } = d;
  const winner = s.trickWinner as Seat;
  const team = teamOf(winner);
  s.wonCards[team].push(...s.trick.plays.map((p) => p.card));
  s.tricksWon[team] += 1;
  s.lastTrick = { plays: s.trick.plays, winner };
  s.trick = { leader: winner, plays: [] };
  s.trickWinner = null;
  const over = tricksPlayed(s) === TRICKS_PER_HAND;
  d.events.push({ type: 'TrickCollected', winner, team, next: over ? null : winner });
  if (over) endHand(d);
  else s.phase = 'PLAYING';
}

function endHand(d: Draft): void {
  const { s } = d;
  const points = { A: sumPoints(s.wonCards.A), B: sumPoints(s.wonCards.B) };
  if (points.A + points.B !== TOTAL_POINTS) throw new Error(`A hand is worth ${TOTAL_POINTS} points`);
  const gamesAwarded = { A: gamesFor(points.A), B: gamesFor(points.B) };
  s.games.A += gamesAwarded.A;
  s.games.B += gamesAwarded.B;
  const summary: HandSummary = {
    hand: s.handNumber,
    points,
    gamesAwarded,
    tricks: { ...s.tricksWon },
    dealer: s.dealer,
    trumpSuit: s.trumpSuit as NonNullable<SuecaState['trumpSuit']>,
  };
  s.history.push(summary);
  s.lastTrickShown = {};
  d.events.push({ type: 'HandEnded', summary });

  const winner = (['A', 'B'] as const).find((team) => s.games[team] >= s.config.targetGames);
  if (!winner) {
    s.phase = 'HAND_SUMMARY';
    return;
  }
  s.phase = 'FINISHED';
  s.winner = winner;
  s.tally = addWin(s, winner);
  d.events.push({ type: 'MatchFinished', winner, games: { ...s.games } });
}

/** Rules §10: the room keeps the matches each pair won. */
function addWin(s: SuecaState, winner: Team): TallyEntry[] {
  const tally = [...s.tally];
  for (const team of [winner, otherTeam(winner)]) {
    const players = playersOf(s, team).sort() as [PlayerId, PlayerId];
    const index = tally.findIndex((entry) => pairKey(entry.players) === pairKey(players));
    const wins = (index >= 0 ? (tally[index] as TallyEntry).wins : 0) + (team === winner ? 1 : 0);
    if (index >= 0) tally[index] = { players, wins };
    else tally.push({ players, wins });
  }
  return tally;
}

/** The deal passes to the right (rules §6); its left cuts, its right opens. */
function nextHand(d: Draft): void {
  const { s } = d;
  s.handNumber += 1;
  s.dealer = nextSeat(s.dealer);
  s.cutter = previousSeat(s.dealer);
  s.cutFrom = null;
  s.trumpCard = null;
  s.trumpSuit = null;
  s.trumpCardPlayed = false;
  s.hands = perSeat(() => []);
  s.trick = { leader: nextSeat(s.dealer), plays: [] };
  s.trickWinner = null;
  s.lastTrick = null;
  s.lastTrickViewsUsed = perSeat(() => 0);
  s.lastTrickShown = {};
  s.wonCards = perTeam(() => []);
  s.tricksWon = perTeam(() => 0);
  s.phase = 'CUT';
  d.events.push({ type: 'HandStarted', hand: s.handNumber, dealer: s.dealer, cutter: s.cutter });
}

/**
 * The next automatic step derives from the state, so whatever action comes
 * first (a look at the last trick, a pause) the table never stalls: a full
 * trick is collected, the summary moves on, a look at the last trick ends.
 */
export function scheduleFor(state: SuecaState): ScheduledAction[] {
  const steps: ScheduledAction[] = [];
  if (state.phase === 'TRICK_DONE')
    steps.push({ action: { type: 'SYS_TRICK_SHOWN' }, delayMs: PACE.trickShown });
  if (state.phase === 'HAND_SUMMARY')
    steps.push({ action: { type: 'SYS_NEXT_HAND' }, delayMs: PACE.handSummary });
  for (const seat of PLAY_ORDER) {
    if (state.lastTrickShown[seat]) {
      steps.push({ action: { type: 'SYS_HIDE_LAST_TRICK', seat }, delayMs: PACE.lastTrick });
    }
  }
  return steps;
}

/** Contract §8: both partners of the team that reached the games win; the score is the team's games. */
export function resultOf(state: SuecaState): GameResult {
  const winner = state.winner;
  if (!winner) return { standings: [] };
  const loser = otherTeam(winner);
  const standings = [
    ...playersOf(state, winner).map((playerId) => ({
      playerId,
      outcome: 'WINNER' as const,
      score: state.games[winner],
    })),
    ...playersOf(state, loser).map((playerId) => ({
      playerId,
      outcome: 'LOSER' as const,
      score: state.games[loser],
    })),
  ];
  return {
    standings,
    summary: {
      winner,
      teams: { A: playersOf(state, 'A'), B: playersOf(state, 'B') },
      games: { ...state.games },
      targetGames: state.config.targetGames,
      hands: state.history,
      tally: state.tally,
    },
  };
}
