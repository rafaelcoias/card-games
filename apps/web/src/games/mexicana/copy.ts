import { rankValue, type MexicanaAction, type Restriction } from '@cardroom/mexicana';
import type { Card } from '@cardroom/game-core';
import { rankLabel } from '@cardroom/ui';

/** Plain-language description of what may be played next. */
export function restrictionHint(restriction: Restriction, effectiveRank: string | null): string {
  if (restriction === 'maxSeven') return 'Joga 7 ou inferior — ou 2, 3, 10, Joker';
  if (!effectiveRank || restriction === 'reset') return 'Podes jogar qualquer carta';
  return `Joga ${shortRank(effectiveRank)} ou superior — ou 2, 3, 10, Joker`;
}

/** Digits for number cards, names for court cards ("8", "Rei"). */
function shortRank(rank: string): string {
  return /^\d+$/.test(rank) ? rank : rankLabel(rank);
}

/** Short badge for the pile ("≥ Q", "≤ 7", "Livre"). */
export function restrictionBadge(restriction: Restriction, effectiveRank: string | null): string {
  if (restriction === 'maxSeven') return '≤ 7';
  if (!effectiveRank || restriction === 'reset') return 'Livre';
  return `≥ ${effectiveRank === 'JOKER' ? 'JK' : effectiveRank}`;
}

export function ordinal(position: number): string {
  return `${position}.º`;
}

/** Hand order: by hierarchy (2 → A), jokers last, then suit, for easy scanning. */
export function sortHand<T extends { card: Card }>(cards: readonly T[]): T[] {
  const suitOrder = { S: 0, H: 1, C: 2, D: 3 } as const;
  return [...cards].sort((a, b) => {
    const va = rankValue(a.card.rank) ?? 99;
    const vb = rankValue(b.card.rank) ?? 99;
    if (va !== vb) return va - vb;
    return (a.card.suit ? suitOrder[a.card.suit] : 9) - (b.card.suit ? suitOrder[b.card.suit] : 9);
  });
}

export interface ActionIndex {
  /** Card ids that appear in at least one legal PLAY_CARDS action. */
  playable: Set<string>;
  /** Legal PLAY_CARDS selections keyed by sorted ids. */
  plays: Set<string>;
  faceDownPositions: Set<number>;
  /** Plain pick-up (hand or face-down layer with no valid play). */
  canPickUp: boolean;
  /** Face-up cards one of which must go along with the pile (none of them playable). */
  pickUpWith: Set<string>;
  canChoose: boolean;
}

export const selectionKey = (ids: readonly string[]) => [...ids].sort().join('|');

export function indexActions(actions: readonly MexicanaAction[]): ActionIndex {
  const index: ActionIndex = {
    playable: new Set(),
    plays: new Set(),
    faceDownPositions: new Set(),
    canPickUp: false,
    pickUpWith: new Set(),
    canChoose: false,
  };
  for (const action of actions) {
    switch (action.type) {
      case 'PLAY_CARDS':
        action.cardIds.forEach((id) => index.playable.add(id));
        index.plays.add(selectionKey(action.cardIds));
        break;
      case 'PLAY_FACE_DOWN':
        index.faceDownPositions.add(action.position);
        break;
      case 'PICK_UP_PILE':
        if (action.faceUpCardId) index.pickUpWith.add(action.faceUpCardId);
        else index.canPickUp = true;
        break;
      case 'CHOOSE_FACE_UP':
        index.canChoose = true;
        break;
      case 'TIMEOUT_PICK_UP':
        break;
    }
  }
  return index;
}
