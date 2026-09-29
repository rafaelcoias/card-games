import type { Card, PlayerId, StandardRank } from '@cardroom/game-core';
import type {
  AskEntry,
  PeixinhoEvent,
  PeixinhoView,
  PendingFish,
  Phase,
  TableMemory,
} from '@cardroom/peixinho';
import type { CardSize, EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the Peixinho table currently shows. It starts equal to a server view and
 * is advanced event by event, so every ask, catch and peixinho animates before
 * the next authoritative view is committed.
 */
export interface SceneCard {
  card: Card;
  enter?: EnterFrom;
}

export interface SeatScene {
  id: PlayerId;
  handCount: number;
  peixinhos: StandardRank[];
  out: boolean;
}

/** Four of a kind fanned out in the middle before they go to their owner's bucket (UI §5). */
export interface Showcase {
  key: number;
  playerId: PlayerId;
  rank: StandardRank;
  cards: SceneCard[];
}

export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  /** The viewer's hand. */
  hand: SceneCard[];
  seats: SeatScene[];
  currentPlayerId: PlayerId | null;
  awaitingFish: PendingFish | null;
  /** Spots of the cards still in the pond (visual only). */
  pondSlots: number[];
  pondSize: number;
  /** Spot of the last card fished: where a caught card rises from. */
  fishSpot: number | null;
  showcase: Showcase | null;
  askLog: AskEntry[];
  tableMemory: TableMemory;
  pondPicking: boolean;
  refillCount: number;
  peixinhosTotal: number;
  winners: PlayerId[];
  /**
   * Anchors the viewer's next unseen cards come from (a fish or a refill): the
   * cards themselves only arrive with the view, and enter from here.
   */
  incoming: string[];
}

export type Fx =
  | { kind: 'asked'; askerId: PlayerId; targetId: PlayerId; rank: StandardRank }
  | { kind: 'given'; from: PlayerId; to: PlayerId; rank: StandardRank; count: number }
  | { kind: 'goFish'; askerId: PlayerId; targetId: PlayerId; pondEmpty: boolean; awaitingPick: boolean }
  | { kind: 'fished'; playerId: PlayerId; rank: StandardRank; caught: boolean }
  | { kind: 'peixinho'; playerId: PlayerId; rank: StandardRank; extraTurn: boolean }
  | { kind: 'refilled'; playerId: PlayerId; count: number }
  | { kind: 'out'; playerId: PlayerId }
  | { kind: 'passed'; from: PlayerId; to: PlayerId }
  | { kind: 'finished'; winners: PlayerId[] };

export const ANCHORS = {
  pond: 'pond',
  /** Follows the spot of the last fished card. */
  fish: 'pond-fish',
  pondSlot: (slot: number) => `pond:${slot}`,
  seat: (playerId: PlayerId) => `seat:${playerId}`,
  bucket: (playerId: PlayerId) => `bucket:${playerId}`,
  handCard: (cardId: string) => `hand:${cardId}`,
  selfHand: 'self-hand',
  showcase: 'showcase',
} as const;

export function sceneFromView(
  matchId: string,
  seq: number,
  view: PeixinhoView,
  previous?: Scene | null,
): Scene {
  const sameMatch = previous?.matchId === matchId;
  const previousHand = new Map((sameMatch ? previous.hand : []).map((c) => [c.card.id, c]));
  const incoming = sameMatch ? [...previous.incoming] : [];
  let arrivals = 0;
  const hand = (view.me?.hand ?? []).map((card): SceneCard => {
    const known = previousHand.get(card.id);
    if (known) return known;
    const from = incoming.shift();
    // Refills land one after another (UI §6: 80 ms apart).
    return from ? { card, enter: { from, kind: 'draw', delay: 0.08 * arrivals++ } } : { card };
  });
  return {
    matchId,
    seq,
    // A deal started by the view keeps running across the commit.
    dealing: sameMatch ? previous.dealing : false,
    phase: view.phase,
    selfId: view.selfId,
    hand,
    seats: view.seats.map((seat) => ({ ...seat, peixinhos: [...seat.peixinhos] })),
    currentPlayerId: view.currentPlayerId,
    awaitingFish: view.awaitingFish,
    pondSlots: [...view.pondSlots],
    pondSize: view.pondSize,
    fishSpot: view.lastFish?.slot ?? (sameMatch ? previous.fishSpot : null),
    showcase: null,
    askLog: view.askLog,
    tableMemory: view.tableMemory,
    pondPicking: view.pondPicking,
    refillCount: view.refillCount,
    peixinhosTotal: view.peixinhosTotal,
    winners: view.winners,
    incoming: [],
  };
}

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

const step = (
  scene: Scene,
  waitMs: number,
  flights: FlightRequest[] = [],
  fx: Fx[] = [],
): Step<Scene, Fx> => ({
  scene,
  waitMs,
  flights,
  fx,
});

let showcaseKey = 0;

export interface AnimationOptions {
  /** Size of the viewer's hand cards (the cards they give away fly from there). */
  handSize: CardSize;
  /** Size of the pond's cards. */
  pondSize: CardSize;
  /** Size of the cards fanned out in the middle when a peixinho is made. */
  showcaseSize: CardSize;
}

const DEFAULT_OPTIONS: AnimationOptions = { handSize: 'md', pondSize: 'sm', showcaseSize: 'md' };

/** Advances the scene by one domain event and describes how to animate it (UI §9 timings). */
export function applyEvent(
  scene: Scene,
  event: PeixinhoEvent,
  options: AnimationOptions = DEFAULT_OPTIONS,
): Step<Scene, Fx> | Step<Scene, Fx>[] {
  const isSelf = (playerId: PlayerId) => playerId === scene.selfId;

  switch (event.type) {
    case 'Asked':
      return step(
        { ...scene, currentPlayerId: event.askerId, awaitingFish: null },
        650,
        [],
        [{ kind: 'asked', askerId: event.askerId, targetId: event.targetId, rank: event.rank }],
      );

    case 'CardsGiven': {
      const { from, to, cards } = event;
      const ids = new Set(cards.map((c) => c.id));
      let next = scene;
      let flights: FlightRequest[] = [];
      if (isSelf(from)) {
        next = { ...next, hand: next.hand.filter((c) => !ids.has(c.card.id)) };
        flights = cards.map((card, i) => ({
          cardId: card.id,
          from: ANCHORS.handCard(card.id),
          to: ANCHORS.seat(to),
          size: options.handSize,
          toSize: 'xs',
          kind: 'pickUp',
          delay: i * 0.06,
        }));
      } else {
        next = withSeat(next, from, (seat) => ({
          ...seat,
          handCount: Math.max(0, seat.handCount - cards.length),
        }));
      }
      if (isSelf(to)) {
        // Face up all the way from the giver into the hand.
        const arriving = cards.map((card, i) => ({
          card,
          enter: { from: ANCHORS.seat(from), kind: 'pickUp' as const, delay: i * 0.06 },
        }));
        next = { ...next, hand: [...next.hand, ...arriving] };
      } else {
        next = withSeat(next, to, (seat) => ({ ...seat, handCount: seat.handCount + cards.length }));
        if (!isSelf(from)) {
          flights = cards.map((card, i) => ({
            cardId: card.id,
            from: ANCHORS.seat(from),
            to: ANCHORS.seat(to),
            size: 'sm',
            toSize: 'xs',
            kind: 'pickUp',
            delay: i * 0.06,
          }));
        }
      }
      return step(next, 550 + 60 * cards.length, flights, [
        { kind: 'given', from, to, rank: event.rank, count: cards.length },
      ]);
    }

    case 'GoFish':
      return step(
        {
          ...scene,
          awaitingFish: event.awaitingPick
            ? { askerId: event.askerId, targetId: event.targetId, rank: event.rank }
            : null,
        },
        900,
        [],
        [
          {
            kind: 'goFish',
            askerId: event.askerId,
            targetId: event.targetId,
            pondEmpty: event.pondEmpty,
            awaitingPick: event.awaitingPick,
          },
        ],
      );

    case 'Fished': {
      const { playerId, slot, card } = event;
      let next: Scene = {
        ...scene,
        awaitingFish: null,
        fishSpot: slot,
        pondSlots: scene.pondSlots.filter((s) => s !== slot),
      };
      let flights: FlightRequest[] = [];
      if (isSelf(playerId) && card) {
        // Caught what was asked: it rises from its spot, face up for everyone (UI §4).
        next = { ...next, hand: [...next.hand, { card, enter: { from: ANCHORS.fish, kind: 'draw' } }] };
      } else if (isSelf(playerId)) {
        // Only the view will say which card it is: a back flies to the hand meanwhile.
        next = { ...next, incoming: [...next.incoming, ANCHORS.selfHand] };
        flights = [
          { from: ANCHORS.pondSlot(slot), to: ANCHORS.selfHand, size: options.pondSize, kind: 'draw' },
        ];
      } else {
        next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: seat.handCount + 1 }));
        flights = [
          {
            cardId: card?.id ?? null,
            from: ANCHORS.pondSlot(slot),
            to: ANCHORS.seat(playerId),
            size: options.pondSize,
            toSize: 'xs',
            kind: 'draw',
          },
        ];
      }
      return step(next, event.caughtAsked ? 850 : 450, flights, [
        { kind: 'fished', playerId, rank: event.rank, caught: event.caughtAsked },
      ]);
    }

    case 'PeixinhoMade': {
      const { playerId, rank, cards } = event;
      const ids = new Set(cards.map((c) => c.id));
      let next = scene;
      let fanned: SceneCard[];
      if (isSelf(playerId)) {
        const inHand = new Set(scene.hand.map((c) => c.card.id));
        // Cards already in hand glide out of it (shared layoutId); cards of a refill come from the pond.
        fanned = cards.map((card, i) =>
          inHand.has(card.id)
            ? { card }
            : { card, enter: { from: ANCHORS.pond, kind: 'draw', delay: i * 0.05 } },
        );
        const unseen = cards.filter((c) => !inHand.has(c.id)).length;
        next = {
          ...next,
          hand: next.hand.filter((c) => !ids.has(c.card.id)),
          // Those refill cards will not be in the hand the view brings.
          incoming: next.incoming.slice(0, Math.max(0, next.incoming.length - unseen)),
        };
      } else {
        fanned = cards.map((card, i) => ({
          card,
          enter: { from: ANCHORS.seat(playerId), kind: 'play', delay: i * 0.05 },
        }));
        next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: Math.max(0, seat.handCount - 4) }));
      }
      showcaseKey += 1;
      const fan = step(
        { ...next, showcase: { key: showcaseKey, playerId, rank, cards: fanned } },
        700,
        [],
        [{ kind: 'peixinho', playerId, rank, extraTurn: event.extraTurn }],
      );
      const stored = withSeat(
        { ...next, showcase: null, peixinhosTotal: next.peixinhosTotal + 1 },
        playerId,
        (seat) => ({
          ...seat,
          peixinhos: [...seat.peixinhos, rank],
        }),
      );
      const toBucket = cards.map((card, i) => ({
        cardId: card.id,
        from: ANCHORS.showcase,
        to: ANCHORS.bucket(playerId),
        size: options.showcaseSize,
        toSize: 'xs' as const,
        kind: 'pickUp' as const,
        delay: i * 0.04,
      }));
      return [fan, step(stored, 450, toBucket)];
    }

    case 'Refilled': {
      const { playerId, count, slots } = event;
      const taken = new Set(slots);
      let next: Scene = { ...scene, pondSlots: scene.pondSlots.filter((s) => !taken.has(s)) };
      const to = isSelf(playerId) ? ANCHORS.selfHand : ANCHORS.seat(playerId);
      const flights: FlightRequest[] = slots.map((slot, i) => ({
        from: ANCHORS.pondSlot(slot),
        to,
        size: options.pondSize,
        toSize: isSelf(playerId) ? undefined : 'xs',
        kind: 'deal',
        delay: i * 0.08,
      }));
      if (isSelf(playerId))
        next = { ...next, incoming: [...next.incoming, ...slots.map(() => ANCHORS.selfHand)] };
      else next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: seat.handCount + count }));
      return step(next, 350 + 80 * count, flights, [{ kind: 'refilled', playerId, count }]);
    }

    case 'PlayerOut':
      return step(
        withSeat(scene, event.playerId, (seat) => ({ ...seat, out: true })),
        250,
        [],
        [{ kind: 'out', playerId: event.playerId }],
      );

    case 'TurnPassed':
      return step(
        { ...scene, currentPlayerId: event.to, awaitingFish: null },
        300,
        [],
        [{ kind: 'passed', from: event.from, to: event.to }],
      );

    case 'GameFinished':
      return step(
        { ...scene, phase: 'FINISHED', currentPlayerId: null, awaitingFish: null, winners: event.winners },
        300,
        [],
        [{ kind: 'finished', winners: event.winners }],
      );
  }
}

/** Spec: 60 ms between cards of the opening deal (UI §9). */
export const DEAL_STAGGER_S = 0.06;

export function dealDurationMs(scene: Pick<Scene, 'hand'>): number {
  return Math.round(Math.max(0, scene.hand.length - 1) * DEAL_STAGGER_S * 1000) + 260;
}
