import {
  JOKER,
  type Card,
  type CardInstance,
  type GameResult,
  type GameStanding,
  type PlayerId,
} from '@cardroom/game-core';
import type { PepeConfig, PepeState, PileIndex, PlayerArea } from './types';

export const PLAYER_COUNT = 2;
/** Columns of 1, 2, 3, 4 and 5 cards (rules §3). */
export const COLUMN_SIZES = [1, 2, 3, 4, 5] as const;
export const COLUMN_COUNT = COLUMN_SIZES.length;
export const PILES: readonly PileIndex[] = [0, 1];

/** Stuck after this many reshuffles of the centre with no card played: the game ends (see README). */
export const MAX_IDLE_RECYCLES = 4;
/** A stall without "vira sozinho": after this long the cards are turned over anyway. */
export const STALL_TIMEOUT_MS = 20_000;
/** Someone pressed "Virar" while the other could still play: the other has this long to play or agree. */
export const FLIP_REQUEST_TIMEOUT_MS = 15_000;
/** Whoever emptied their columns has this long to take a pile; then one is drawn for them. */
export const PILE_CHOICE_TIMEOUT_MS = 15_000;
/** The new columns are laid out on screen before the countdown. */
export const ROUND_SETUP_MS = 2_200;

const VALUES: Readonly<Record<string, number>> = { A: 1, J: 11, Q: 12, K: 13 };

/** A = 1 … K = 13 (rules §5.1). Jokers have no value: they fit anywhere. */
export function rankValue(card: Pick<Card, 'rank'>): number {
  return VALUES[card.rank] ?? Number(card.rank);
}

export const isJoker = (card: Pick<Card, 'rank'>) => card.rank === JOKER;

type Rules = Pick<PepeConfig, 'direction' | 'aceKingWrap'>;

/**
 * Rules §5.1–5.2: one above (or, both ways, one below) the top card, suits
 * ignored; the ace and the king link up with `aceKingWrap`. A joker goes on
 * anything, and anything goes on a joker.
 */
export function fitsCentre(card: Pick<Card, 'rank'>, top: Pick<Card, 'rank'>, rules: Rules): boolean {
  if (isJoker(card) || isJoker(top)) return true;
  const value = rankValue(card);
  const below = rankValue(top);
  const up = value === below + 1 || (rules.aceKingWrap && top.rank === 'K' && card.rank === 'A');
  if (rules.direction === 'UP_ONLY') return up;
  const down = value === below - 1 || (rules.aceKingWrap && top.rank === 'A' && card.rank === 'K');
  return up || down;
}

/** Rules §5.3: on a column topped by the same rank; a joker groups with anything, both ways. */
export function canGroup(
  card: Pick<Card, 'rank'>,
  target: Pick<Card, 'rank'>,
  config: Pick<PepeConfig, 'grouping'>,
): boolean {
  if (!config.grouping) return false;
  return isJoker(card) || isJoker(target) || card.rank === target.rank;
}

export type RaceOutcome = 'FIRST' | 'TOP_CHANGED';

/**
 * Who got there first (requirement 4). Actions reach the engine one at a time,
 * in the order the room's queue received them, so a play counts when the pile
 * still shows the card its player saw; otherwise the other player was faster.
 * The only place that decides it: a later version may weigh client timestamps
 * here without touching the rest of the engine.
 */
export function resolveRace(pile: readonly CardInstance[], expectedTopUid: string): RaceOutcome {
  return pile.at(-1)?.uid === expectedTopUid ? 'FIRST' : 'TOP_CHANGED';
}

/**
 * Rules §3: columns of 1, 2, 3, 4 and 5 cards, the rest in reserve. With fewer
 * than 15 cards the columns are filled in order with what there is, and there
 * is no reserve (09 #4). The last card dealt to a column is its top.
 */
export function layOut(cards: readonly CardInstance[]): Pick<PlayerArea, 'columns' | 'reserve'> {
  let next = 0;
  const columns = COLUMN_SIZES.map((size) => {
    const column = cards.slice(next, next + size);
    next += column.length;
    return column;
  });
  return { columns, reserve: cards.slice(next) };
}

export const tops = (area: Pick<PlayerArea, 'columns'>): (CardInstance | null)[] =>
  area.columns.map((column) => column.at(-1) ?? null);

export const columnsEmpty = (area: Pick<PlayerArea, 'columns'>) => area.columns.every((c) => c.length === 0);

export const cardsOf = (area: Pick<PlayerArea, 'columns' | 'reserve'>) =>
  area.columns.reduce((sum, column) => sum + column.length, 0) + area.reserve.length;

/** Some top card of the player's columns fits some centre pile. */
export function hasCentrePlay(
  state: Pick<PepeState, 'areas' | 'centre' | 'config'>,
  playerId: PlayerId,
): boolean {
  const area = state.areas[playerId];
  if (!area) return false;
  const centreTops = state.centre.map((pile) => pile.at(-1)).filter((c) => c !== undefined);
  return tops(area).some((card) => card && centreTops.some((top) => fitsCentre(card, top, state.config)));
}

/**
 * Who must press "Virar" for the next flip: whoever has a reserve. When nobody
 * has one, both (the centre goes back under the columns, 09 #7).
 */
export function flipRequired(state: Pick<PepeState, 'players' | 'areas'>): PlayerId[] {
  const withReserve = state.players.filter((id) => (state.areas[id]?.reserve.length ?? 0) > 0);
  return withReserve.length > 0 ? withReserve : [...state.players];
}

/** Contract §9. The first without cards wins; a stalemate goes to fewer cards (a tie shares the win). */
export function standings(state: PepeState): GameStanding[] {
  const left = (id: PlayerId) => cardsOf(state.areas[id] as PlayerArea);
  const order = [...state.players].sort((a, b) => {
    if (state.winner) return a === state.winner ? -1 : b === state.winner ? 1 : 0;
    return left(a) - left(b);
  });
  const tie = state.winner === null && left(order[0] as PlayerId) === left(order[1] as PlayerId);
  return order.map((playerId, i) => ({
    playerId,
    outcome: i === 0 || tie ? 'WINNER' : 'LOSER',
    position: tie ? 1 : i + 1,
    score: left(playerId),
  }));
}

export function resultOf(state: PepeState): GameResult {
  return { standings: standings(state), summary: { rounds: state.round, deadlock: state.deadlock } };
}
