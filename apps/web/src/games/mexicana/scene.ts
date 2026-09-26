import type { Card, PlayerId } from '@cardroom/game-core';
import type { MexicanaEvent, MexicanaView, Phase, Restriction } from '@cardroom/mexicana';
import { pileRotation, type EnterFrom, type FlightRequest } from '@cardroom/ui';

/**
 * What the table currently shows. It starts equal to a server view and is then
 * advanced event by event, so every move can be animated before the next
 * authoritative view is committed.
 */
export interface SceneCard {
  card: Card;
  enter?: EnterFrom;
}

/** `null` = empty slot, `'hidden'` = unknown face-down card, `Card` = being revealed. */
export type FaceDownSlot = null | 'hidden' | Card;

export interface SeatScene {
  id: PlayerId;
  handCount: number;
  faceUp: (Card | null)[];
  faceDown: FaceDownSlot[];
  hasChosenFaceUp: boolean;
  finishedPosition: number | null;
}

export interface Scene {
  matchId: string;
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  currentPlayerId: PlayerId | null;
  hand: SceneCard[];
  seats: SeatScene[];
  discard: SceneCard[];
  drawCount: number;
  burnCount: number;
  restriction: Restriction;
  effectiveRank: string | null;
  sameRankRun: number;
  /** Cards shown in the burn animation (keyed so repeated burns re-trigger). */
  burning: { key: number; cards: Card[] } | null;
  /** True while the opening deal animation runs. */
  dealing: boolean;
}

export type Fx =
  | { kind: 'skip'; playerId: PlayerId }
  | { kind: 'burn' }
  | { kind: 'finished'; playerId: PlayerId; position: number }
  | { kind: 'pickUp'; playerId: PlayerId; count: number }
  | { kind: 'played'; playerId: PlayerId; cards: Card[] }
  | { kind: 'started'; playerId: PlayerId };

export interface Step {
  scene: Scene;
  /** How long to hold before the next step (ms, before any speed-up). */
  waitMs: number;
  flights: FlightRequest[];
  fx: Fx[];
}

export const ANCHORS = {
  draw: 'draw',
  discard: 'discard',
  seat: (playerId: PlayerId) => `seat:${playerId}`,
  slot: (playerId: PlayerId, position: number) => `slot:${playerId}:${position}`,
  selfHand: 'self-hand',
} as const;

export function sceneFromView(
  matchId: string,
  seq: number,
  view: MexicanaView,
  previous?: Scene | null,
): Scene {
  const known = new Set<string>();
  if (previous && previous.matchId === matchId) {
    for (const c of previous.hand) known.add(c.card.id);
    for (const c of previous.discard) known.add(c.card.id);
    for (const seat of previous.seats) {
      for (const card of seat.faceUp) if (card) known.add(card.id);
      for (const slot of seat.faceDown) if (slot && slot !== 'hidden') known.add(slot.id);
    }
  }
  const sameMatch = previous?.matchId === matchId;
  const previousDiscard = new Map((sameMatch ? previous.discard : []).map((c) => [c.card.id, c]));

  return {
    matchId,
    seq,
    phase: view.phase,
    selfId: view.selfId,
    currentPlayerId: view.currentPlayerId,
    hand: view.hand.map((card) => ({
      card,
      // Cards we have never seen in this match came from the stock.
      enter: sameMatch && !known.has(card.id) ? { from: ANCHORS.draw, kind: 'draw' } : undefined,
    })),
    seats: view.seats.map((seat) => ({
      id: seat.id,
      handCount: seat.handCount,
      faceUp: [...seat.faceUp],
      faceDown: seat.faceDown.map((occupied) => (occupied ? 'hidden' : null)),
      hasChosenFaceUp: seat.hasChosenFaceUp,
      finishedPosition: seat.finishedPosition,
    })),
    discard: view.discardPile.map((card) => previousDiscard.get(card.id) ?? { card }),
    drawCount: view.drawPileCount,
    burnCount: view.burnPileCount,
    restriction: view.restriction,
    effectiveRank: view.effectiveRank,
    sameRankRun: view.sameRankRun,
    burning: null,
    dealing: false,
  };
}

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

const step = (scene: Scene, waitMs: number, flights: FlightRequest[] = [], fx: Fx[] = []): Step => ({
  scene,
  waitMs,
  flights,
  fx,
});

let burnKey = 0;

/** Advances the scene by one domain event and describes how to animate it. */
export function applyEvent(scene: Scene, event: MexicanaEvent): Step {
  const isSelf = (playerId: PlayerId) => playerId === scene.selfId;

  switch (event.type) {
    case 'FaceUpChosen': {
      const ids = new Set(event.cards.map((c) => c.id));
      const next = withSeat(scene, event.playerId, (seat) => ({
        ...seat,
        faceUp: [...event.cards],
        hasChosenFaceUp: true,
        handCount: isSelf(event.playerId) ? seat.handCount : Math.max(0, seat.handCount - event.cards.length),
      }));
      return step(
        isSelf(event.playerId) ? { ...next, hand: next.hand.filter((c) => !ids.has(c.card.id)) } : next,
        isSelf(event.playerId) ? 280 : 120,
      );
    }

    case 'PlayStarted':
      return step(
        { ...scene, phase: 'PLAYING', currentPlayerId: event.startingPlayerId },
        250,
        [],
        [{ kind: 'started', playerId: event.startingPlayerId }],
      );

    case 'CardRevealed':
      return step(
        withSeat(scene, event.playerId, (seat) => ({
          ...seat,
          faceDown: seat.faceDown.map((slot, i) => (i === event.slot ? event.card : slot)),
        })),
        event.playable ? 520 : 750,
      );

    case 'CardsPlayed': {
      const ids = new Set(event.cards.map((c) => c.id));
      let next = scene;
      let fromHiddenHand = false;
      if (event.source === 'hand') {
        if (isSelf(event.playerId)) next = { ...next, hand: next.hand.filter((c) => !ids.has(c.card.id)) };
        else {
          fromHiddenHand = true;
          next = withSeat(next, event.playerId, (seat) => ({
            ...seat,
            handCount: Math.max(0, seat.handCount - event.cards.length),
          }));
        }
      } else if (event.source === 'faceUp') {
        next = withSeat(next, event.playerId, (seat) => ({
          ...seat,
          faceUp: seat.faceUp.map((card) => (card && ids.has(card.id) ? null : card)),
        }));
      } else {
        next = withSeat(next, event.playerId, (seat) => ({
          ...seat,
          faceDown: seat.faceDown.map((slot, i) => (i === event.slot ? null : slot)),
        }));
      }
      const origin =
        event.source === 'faceDown' && event.slot !== undefined
          ? ANCHORS.slot(event.playerId, event.slot)
          : fromHiddenHand
            ? ANCHORS.seat(event.playerId)
            : null;
      const played: SceneCard[] = event.cards.map((card, i) => ({
        card,
        // Known cards glide via shared layoutIds; the rest fly in from where they were.
        enter: origin ? { from: origin, kind: 'play', delay: i * 0.05 } : undefined,
      }));
      return step(
        { ...next, discard: [...next.discard, ...played], currentPlayerId: event.playerId },
        300 + 50 * (event.cards.length - 1),
        [],
        [{ kind: 'played', playerId: event.playerId, cards: event.cards }],
      );
    }

    case 'PileBurned':
      burnKey += 1;
      return step(
        {
          ...scene,
          burning: { key: burnKey, cards: scene.discard.map((c) => c.card) },
          discard: [],
          burnCount: scene.burnCount + event.count,
          restriction: 'none',
          effectiveRank: null,
          sameRankRun: 0,
        },
        420,
        [],
        [{ kind: 'burn' }],
      );

    case 'PlayerSkipped':
      return step(scene, 380, [], [{ kind: 'skip', playerId: event.playerId }]);

    case 'PilePickedUp': {
      const revealed = new Set(event.cards.map((c) => c.id));
      const seat = scene.seats.find((s) => s.id === event.playerId);
      const revealedSlot =
        seat?.faceDown.findIndex((slot) => slot !== null && slot !== 'hidden' && revealed.has(slot.id)) ?? -1;
      const revealedId = revealedSlot >= 0 ? (seat?.faceDown[revealedSlot] as Card).id : null;
      const originOf = (card: Card) =>
        card.id === revealedId ? ANCHORS.slot(event.playerId, revealedSlot) : ANCHORS.discard;
      const clearRevealed = (seat: SeatScene): SeatScene => ({
        ...seat,
        faceDown: seat.faceDown.map((slot) =>
          slot && slot !== 'hidden' && revealed.has(slot.id) ? null : slot,
        ),
      });
      const cleared = {
        ...scene,
        discard: [],
        restriction: 'none' as const,
        effectiveRank: null,
        sameRankRun: 0,
      };
      const fx: Fx[] = [{ kind: 'pickUp', playerId: event.playerId, count: event.cards.length }];
      const waitMs = 340 + Math.min(12, event.cards.length) * 25;
      if (isSelf(event.playerId)) {
        const next = withSeat(cleared, event.playerId, clearRevealed);
        const collected = event.cards.map((card): SceneCard =>
          card.id === revealedId ? { card, enter: { from: originOf(card), kind: 'pickUp' } } : { card },
        );
        return step({ ...next, hand: [...next.hand, ...collected] }, waitMs, [], fx);
      }
      const flights: FlightRequest[] = event.cards.map((card, i) => ({
        cardId: card.id,
        from: originOf(card),
        fromRotate: pileRotation(card.id),
        to: ANCHORS.seat(event.playerId),
        size: 'md',
        toSize: 'xs',
        kind: 'pickUp',
        delay: Math.min(i, 12) * 0.025,
      }));
      const next = withSeat(cleared, event.playerId, (seat) => ({
        ...clearRevealed(seat),
        handCount: seat.handCount + event.cards.length,
      }));
      return step(next, waitMs, flights, fx);
    }

    case 'CardsDrawn': {
      const next = { ...scene, drawCount: Math.max(0, scene.drawCount - event.count) };
      if (isSelf(event.playerId)) return step(next, 60);
      const flights: FlightRequest[] = Array.from({ length: event.count }, (_, i) => ({
        from: ANCHORS.draw,
        to: ANCHORS.seat(event.playerId),
        size: 'md',
        toSize: 'xs',
        kind: 'draw',
        delay: i * 0.06,
      }));
      return step(
        withSeat(next, event.playerId, (seat) => ({ ...seat, handCount: seat.handCount + event.count })),
        240,
        flights,
      );
    }

    case 'PlayerFinished':
      return step(
        withSeat(scene, event.playerId, (seat) => ({ ...seat, finishedPosition: event.position })),
        350,
        [],
        [{ kind: 'finished', playerId: event.playerId, position: event.position }],
      );

    case 'GameFinished':
      return step({ ...scene, phase: 'FINISHED', currentPlayerId: null }, 200);
  }
}

/** Opening deal order: face-down cards first, then the hand, one card per seat per round. */
export function dealDelaySeconds(roundIndex: number, seatIndex: number, seatCount: number): number {
  return (roundIndex * seatCount + seatIndex) * 0.06;
}

export function dealDurationMs(seatCount: number): number {
  return Math.round(dealDelaySeconds(9, 0, seatCount) * 1000) + 260;
}
