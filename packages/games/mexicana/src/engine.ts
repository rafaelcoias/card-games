import {
  createDeck,
  losersOf,
  fail,
  ok,
  pickOne,
  shuffle,
  type ActionResult,
  type Card,
  type CardId,
  type PlayerId,
  type Rng,
  type SetupOptions,
} from '@cardroom/game-core';
import { defaultFaceUpToTake, enumeratePlays, faceUpToTake } from './moves';
import { DEFAULT_RULES, canPlayRank, placeCards, restrictionFor } from './rules';
import {
  activeLayer,
  activePlayerIds,
  cardCount,
  cloneState,
  currentPlayerId,
  nextActiveIndex,
  occupied,
} from './state';
import type {
  CardSource,
  MexicanaAction,
  MexicanaConfig,
  MexicanaEvent,
  MexicanaPlayerState,
  MexicanaRules,
  MexicanaState,
  PickUpReason,
} from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

type Result = ActionResult<MexicanaState, MexicanaEvent>;

export function setup(
  players: readonly PlayerId[],
  config: MexicanaConfig,
  rng: Rng,
  options: SetupOptions = {},
  rules: MexicanaRules = DEFAULT_RULES,
): MexicanaState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new RangeError(`Mexicana needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${players.length}`);
  }
  if (new Set(players).size !== players.length) throw new Error('Duplicate player ids');

  let deck = shuffle(createDeck({ jokers: 2 }), rng);
  const take = (count: number): Card[] => {
    const cards = deck.slice(deck.length - count);
    deck = deck.slice(0, deck.length - count);
    return cards;
  };

  const playerStates: Record<PlayerId, MexicanaPlayerState> = {};
  for (const id of players) {
    playerStates[id] = {
      faceDown: take(rules.layerSize),
      // The hand temporarily holds the future face-up cards until the player chooses them.
      hand: take(rules.handSize + rules.layerSize),
      faceUp: Array<null>(rules.layerSize).fill(null),
      hasChosenFaceUp: false,
      finishedPosition: null,
    };
  }

  return {
    phase: 'CHOOSING',
    players: playerStates,
    turnOrder: [...players],
    currentIndex: players.indexOf(pickStartingPlayer(players, rng, options)),
    drawPile: deck,
    discardPile: [],
    burnPile: [],
    restriction: 'none',
    pendingSkips: 0,
    sameRankRun: 0,
    nextFinishPosition: 1,
    turnTimeoutMs: config.turnTimeoutMs,
    chooseTimeoutMs: config.chooseTimeoutMs,
    rules,
  };
}

/** Random in the first match of a room; afterwards whoever lost the previous one (rules §3). */
function pickStartingPlayer(players: readonly PlayerId[], rng: Rng, options: SetupOptions): PlayerId {
  const loser = losersOf(options.previousResult).find((id) => players.includes(id));
  return loser ?? pickOne(players, rng);
}

export function applyAction(state: MexicanaState, action: MexicanaAction, playerId: PlayerId): Result {
  const player = state.players[playerId];
  if (!player) return fail('UNKNOWN_PLAYER', 'Player is not part of this game');

  if (action.type === 'CHOOSE_FACE_UP') return chooseFaceUp(state, playerId, action.cardIds);

  if (state.phase !== 'PLAYING') return fail('WRONG_PHASE', 'The game is not in the playing phase');
  if (currentPlayerId(state) !== playerId) return fail('NOT_YOUR_TURN', 'It is not your turn');

  switch (action.type) {
    case 'PLAY_CARDS':
      return playCards(state, playerId, action.cardIds);
    case 'PLAY_FACE_DOWN':
      return playFaceDown(state, playerId, action.position);
    case 'PICK_UP_PILE':
      if (enumeratePlays(state, playerId).length > 0) {
        return fail('PICK_UP_NOT_ALLOWED', 'You can only pick up the pile when you have no valid play');
      }
      return pickUpPile(state, playerId, 'noValidPlay', action.faceUpCardId);
    case 'TIMEOUT_PICK_UP':
      return pickUpPile(state, playerId, 'timeout', action.faceUpCardId);
  }
}

function chooseFaceUp(state: MexicanaState, playerId: PlayerId, cardIds: readonly CardId[]): Result {
  if (state.phase !== 'CHOOSING') return fail('WRONG_PHASE', 'Face-up cards were already chosen');
  const player = state.players[playerId] as MexicanaPlayerState;
  if (player.hasChosenFaceUp) return fail('ALREADY_CHOSEN', 'You already chose your face-up cards');
  const layerSize = state.rules.layerSize;
  if (cardIds.length !== layerSize || new Set(cardIds).size !== layerSize) {
    return fail('INVALID_CARDS', `Choose exactly ${layerSize} different cards`);
  }
  const chosen = findCards(player.hand, cardIds);
  if (!chosen) return fail('INVALID_CARDS', 'You can only choose cards from your hand');

  const next = cloneState(state);
  const draft = next.players[playerId] as MexicanaPlayerState;
  draft.hand = draft.hand.filter((card) => !cardIds.includes(card.id));
  draft.faceUp = chosen;
  draft.hasChosenFaceUp = true;
  const events: MexicanaEvent[] = [{ type: 'FaceUpChosen', playerId, cards: chosen }];

  if (next.turnOrder.every((id) => next.players[id]?.hasChosenFaceUp)) {
    next.phase = 'PLAYING';
    events.push({ type: 'PlayStarted', startingPlayerId: next.turnOrder[next.currentIndex] as PlayerId });
  }
  return ok(next, events);
}

function playCards(state: MexicanaState, playerId: PlayerId, cardIds: readonly CardId[]): Result {
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) {
    return fail('INVALID_CARDS', 'Select one or more distinct cards');
  }
  const player = state.players[playerId] as MexicanaPlayerState;
  const layer = activeLayer(player);

  let cards: Card[] | null;
  let source: CardSource;
  if (layer === 'hand') {
    cards = findCards(player.hand, cardIds);
    source = 'hand';
  } else if (layer === 'faceUp') {
    if (cardIds.length !== 1) return fail('INVALID_CARDS', 'Face-up cards are played one at a time');
    cards = findCards(occupied(player.faceUp), cardIds);
    source = 'faceUp';
  } else {
    return fail('MUST_PLAY_FACE_DOWN', 'Only face-down cards are left: play one blindly');
  }
  if (!cards)
    return fail(
      'INVALID_CARDS',
      `Those cards are not in your ${source === 'hand' ? 'hand' : 'face-up cards'}`,
    );

  const rank = (cards[0] as Card).rank;
  if (cards.some((card) => card.rank !== rank))
    return fail('MIXED_RANKS', 'All cards must share the same rank');
  if (!canPlayRank(rank, state.discardPile, state.rules)) {
    return fail('ILLEGAL_PLAY', 'That card cannot be played on the current pile');
  }

  const next = cloneState(state);
  const draft = next.players[playerId] as MexicanaPlayerState;
  if (source === 'hand') {
    draft.hand = draft.hand.filter((card) => !cardIds.includes(card.id));
  } else {
    draft.faceUp = draft.faceUp.map((slot) => (slot && cardIds.includes(slot.id) ? null : slot));
  }
  const events: MexicanaEvent[] = [{ type: 'CardsPlayed', playerId, cards, source }];
  return ok(next, resolvePlay(next, playerId, cards, events));
}

function playFaceDown(state: MexicanaState, playerId: PlayerId, position: number): Result {
  const player = state.players[playerId] as MexicanaPlayerState;
  if (activeLayer(player) !== 'faceDown') {
    return fail('INVALID_SLOT', 'Face-down cards are only played once hand and face-up cards are gone');
  }
  const card = player.faceDown[position];
  if (!Number.isInteger(position) || !card) return fail('INVALID_SLOT', 'There is no card in that position');

  const next = cloneState(state);
  const draft = next.players[playerId] as MexicanaPlayerState;
  draft.faceDown[position] = null;
  const playable = canPlayRank(card.rank, next.discardPile, next.rules);
  const events: MexicanaEvent[] = [{ type: 'CardRevealed', playerId, slot: position, card, playable }];

  if (!playable) {
    draft.hand.push(card);
    return ok(next, [...events, ...collectPile(next, playerId, 'faceDownFailed', [card])]);
  }
  events.push({ type: 'CardsPlayed', playerId, cards: [card], source: 'faceDown', slot: position });
  return ok(next, resolvePlay(next, playerId, [card], events));
}

/**
 * Picks up the pile. With only unplayable face-up cards left, one of them —
 * the player's choice, or the lowest on timeout — goes to the hand too, just
 * like a face-down card that fails its reveal.
 */
function pickUpPile(
  state: MexicanaState,
  playerId: PlayerId,
  reason: PickUpReason,
  faceUpCardId: CardId | undefined,
): Result {
  const takeable = faceUpToTake(state, playerId);
  if (takeable.length === 0) {
    if (faceUpCardId !== undefined) {
      return fail('INVALID_CARDS', 'A face-up card only goes with the pile when none of them can be played');
    }
    const next = cloneState(state);
    return ok(next, collectPile(next, playerId, reason, []));
  }

  const chosenId = faceUpCardId ?? (reason === 'timeout' ? defaultFaceUpToTake(takeable)?.id : undefined);
  if (chosenId === undefined) {
    return fail('FACE_UP_CARD_REQUIRED', 'Choose the face-up card that goes to your hand with the pile');
  }
  const next = cloneState(state);
  const draft = next.players[playerId] as MexicanaPlayerState;
  const slot = draft.faceUp.findIndex((card) => card?.id === chosenId);
  const card = draft.faceUp[slot];
  if (!card) return fail('INVALID_CARDS', 'That card is not one of your face-up cards');
  draft.faceUp[slot] = null;
  draft.hand.push(card);
  return ok(next, collectPile(next, playerId, reason, [card], slot));
}

/** Moves the discard pile into the player's hand and passes the turn (mutates the draft). */
function collectPile(
  draft: MexicanaState,
  playerId: PlayerId,
  reason: PickUpReason,
  alsoCollected: Card[],
  faceUpSlot?: number,
): MexicanaEvent[] {
  const player = draft.players[playerId] as MexicanaPlayerState;
  const cards = [...draft.discardPile, ...alsoCollected];
  player.hand.push(...draft.discardPile);
  draft.discardPile = [];
  resetPile(draft);
  draft.currentIndex = nextActiveIndex(draft, draft.currentIndex);
  return [
    { type: 'PilePickedUp', playerId, cards, reason, ...(faceUpSlot === undefined ? {} : { faceUpSlot }) },
  ];
}

function resetPile(draft: MexicanaState): void {
  draft.restriction = 'none';
  draft.sameRankRun = 0;
  draft.pendingSkips = 0;
}

/**
 * Applies the consequences of cards that were validly played (already removed
 * from the player): pile placement and powers, refill, finishing and turn order.
 */
function resolvePlay(
  draft: MexicanaState,
  playerId: PlayerId,
  cards: Card[],
  events: MexicanaEvent[],
): MexicanaEvent[] {
  const player = draft.players[playerId] as MexicanaPlayerState;
  const outcome = placeCards(draft.discardPile, cards, draft.sameRankRun, draft.rules);

  if (outcome.burn) {
    events.push({ type: 'PileBurned', playerId, reason: outcome.burn, count: outcome.pile.length });
    draft.burnPile.push(...outcome.pile);
    draft.discardPile = [];
    resetPile(draft);
  } else {
    draft.discardPile = outcome.pile;
    draft.sameRankRun = outcome.sameRankRun;
    draft.restriction = restrictionFor(outcome.pile, draft.rules);
    draft.pendingSkips += outcome.skips;
  }

  const drawn = refillHand(draft, player);
  if (drawn > 0) events.push({ type: 'CardsDrawn', playerId, count: drawn });

  const finished = cardCount(player) === 0;
  if (finished) {
    player.finishedPosition = draft.nextFinishPosition++;
    events.push({ type: 'PlayerFinished', playerId, position: player.finishedPosition });
    if (finishIfOnePlayerLeft(draft, events)) return events;
  }

  // A burn lets the same player go again with an empty pile — unless they just went out.
  if (outcome.burn && !finished) return events;
  advanceTurn(draft, playerId, events);
  return events;
}

function refillHand(draft: MexicanaState, player: MexicanaPlayerState): number {
  let drawn = 0;
  while (player.hand.length < draft.rules.handSize && draft.drawPile.length > 0) {
    player.hand.push(draft.drawPile.pop() as Card);
    drawn += 1;
  }
  return drawn;
}

function finishIfOnePlayerLeft(draft: MexicanaState, events: MexicanaEvent[]): boolean {
  const remaining = activePlayerIds(draft);
  if (remaining.length > 1) return false;
  const loserId = remaining[0] as PlayerId;
  const position = draft.nextFinishPosition++;
  (draft.players[loserId] as MexicanaPlayerState).finishedPosition = position;
  draft.phase = 'FINISHED';
  resetPile(draft);
  events.push({ type: 'PlayerFinished', playerId: loserId, position });
  events.push({ type: 'GameFinished', loserId });
  return true;
}

/** Passes the turn, consuming pending skips from 8s one player at a time (rules §7). */
function advanceTurn(draft: MexicanaState, by: PlayerId, events: MexicanaEvent[]): void {
  let index = nextActiveIndex(draft, draft.currentIndex);
  while (draft.pendingSkips > 0) {
    events.push({ type: 'PlayerSkipped', playerId: draft.turnOrder[index] as PlayerId, by });
    draft.pendingSkips -= 1;
    index = nextActiveIndex(draft, index);
  }
  draft.currentIndex = index;
}

/** Returns the cards matching `ids` (in `ids` order) or `null` if any is missing. */
function findCards(cards: readonly Card[], ids: readonly CardId[]): Card[] | null {
  const found: Card[] = [];
  for (const id of ids) {
    const card = cards.find((c) => c.id === id);
    if (!card) return null;
    found.push(card);
  }
  return found;
}
