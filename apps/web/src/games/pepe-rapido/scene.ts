import type { CardInstance } from '@cardroom/game-core';
import {
  canGroup,
  fitsCentre,
  type PepeClientAction,
  type PepeConfig,
  type PepeView,
  type PileIndex,
} from '@cardroom/pepe-rapido';

/** A column as drawn: `top` is `null` while the card under one just played is not turned over yet. */
export interface SceneColumn {
  top: CardInstance | null;
  hidden: number;
}

/** The view with the viewer's moves still in flight drawn as done (kit 04: optimistic UI). */
export interface Scene {
  view: PepeView;
  mine: SceneColumn[];
  theirs: SceneColumn[];
  /** Centre tops, by pile index. */
  tops: [CardInstance | null, CardInstance | null];
  wantsFlip: boolean;
}

const columnsOf = (view: PepeView, side: 0 | 1): SceneColumn[] =>
  view.sides[side].columns.map((c) => ({ top: c.top, hidden: c.hiddenCount }));

/**
 * Applies the actions in flight, in order, to the last view. An action that
 * no longer applies (its card moved, the pile changed, the server already
 * shows it) is skipped: what is drawn never contradicts the view.
 */
export function sceneOf(view: PepeView, pending: readonly PepeClientAction[]): Scene {
  const mine = columnsOf(view, 0);
  const tops: Scene['tops'] = [view.centre[0].top, view.centre[1].top];
  let wantsFlip = view.sides[0].wantsFlip;
  const live = view.phase === 'PLAYING' || view.phase === 'STALLED';

  for (const action of pending) {
    if (!live) break;
    if (action.type === 'REQUEST_FLIP') {
      wantsFlip = true;
      continue;
    }
    if (action.type === 'CHOOSE_PILE') continue;
    const from = action.type === 'PLAY_TO_CENTRE' ? action.column : action.fromColumn;
    const source = mine[from];
    if (!source || source.top?.uid !== action.cardUid) continue;
    const card = source.top;
    if (action.type === 'PLAY_TO_CENTRE') {
      if (tops[action.pile]?.uid !== action.expectedTopUid) continue;
      tops[action.pile] = card;
    } else {
      const target = mine[action.toColumn];
      if (!target) continue;
      mine[action.toColumn] = { top: card, hidden: target.hidden + (target.top ? 1 : 0) };
    }
    // The card underneath is face down until the server turns it over.
    mine[from] = { top: null, hidden: source.hidden };
  }
  return { view, mine, theirs: columnsOf(view, 1), tops, wantsFlip };
}

export type Target = { kind: 'pile'; pile: PileIndex } | { kind: 'column'; column: number };

/** The move a card dropped (or tapped) on a target means, or `null` when it does not go there. */
export function moveFor(
  scene: Scene,
  column: number,
  target: Target,
  config: PepeConfig,
): PepeClientAction | null {
  const source = scene.mine[column];
  const card = source?.top;
  if (!card) return null;
  if (target.kind === 'pile') {
    const top = scene.tops[target.pile];
    if (!top || !fitsCentre(card, top, config)) return null;
    return { type: 'PLAY_TO_CENTRE', cardUid: card.uid, column, pile: target.pile, expectedTopUid: top.uid };
  }
  if (target.column === column) return null;
  const dest = scene.mine[target.column];
  if (!dest) return null;
  if (dest.top) {
    return canGroup(card, dest.top, config)
      ? { type: 'GROUP', cardUid: card.uid, fromColumn: column, toColumn: target.column }
      : null;
  }
  // An empty column (not one waiting for its card to be turned over).
  if (dest.hidden > 0 || !config.moveToEmpty || (source?.hidden ?? 0) === 0) return null;
  return { type: 'MOVE_TO_EMPTY', cardUid: card.uid, fromColumn: column, toColumn: target.column };
}

/** Piles a card goes on, nearest first: the left pile for the left columns, and so on (UI §2). */
export function pilesFor(scene: Scene, column: number, config: PepeConfig, leftPile: PileIndex): PileIndex[] {
  const fits = ([0, 1] as const).filter((pile) => moveFor(scene, column, { kind: 'pile', pile }, config));
  const rightPile: PileIndex = leftPile === 0 ? 1 : 0;
  const nearest = column < 2 ? leftPile : column > 2 ? rightPile : scene.view.sides[0].pile;
  return [...fits].sort((a, b) => (a === nearest ? -1 : b === nearest ? 1 : 0));
}

/** Whether the viewer can play anything to the centre right now (drives the "Virar" hint). */
export function canPlayCentre(scene: Scene, config: PepeConfig): boolean {
  return scene.mine.some((_, column) =>
    ([0, 1] as const).some((pile) => moveFor(scene, column, { kind: 'pile', pile }, config)),
  );
}
