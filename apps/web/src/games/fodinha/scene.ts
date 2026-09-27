import type {
  CompletedTrick,
  FodinhaEvent,
  FodinhaView,
  Phase,
  RoundSummary,
  TrickOutcome,
} from '@cardroom/fodinha';
import type { Card, PlayerId } from '@cardroom/game-core';
import type { CardSize, EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the Fodinha table currently shows. It starts equal to a server view and
 * is advanced event by event, so every move animates before the next
 * authoritative view is committed.
 */
export interface SceneCard {
  card: Card;
  enter?: EnterFrom;
}

export interface SeatScene {
  id: PlayerId;
  handCount: number;
  /** Blind rounds only, never for the viewer. */
  visibleHand: Card[] | null;
  bid: number | null;
  tricksWon: number;
  points: number;
  isStarter: boolean;
}

export interface TrickCard {
  playerId: PlayerId;
  card: Card;
  enter?: EnterFrom;
  /** The viewer's own blind card: travels face down and turns over once on the table. */
  revealOnLand?: boolean;
}

export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  round: number;
  handSize: number;
  roundValue: number;
  carry: number;
  blind: boolean;
  maxPoints: number;
  maxHandSize: number;
  lastBidderRestriction: boolean;
  /** Viewer's hand in normal rounds (empty in blind rounds). */
  hand: SceneCard[];
  /** The viewer's unseen card is still in front of them (blind rounds). */
  selfBlindCard: boolean;
  seats: SeatScene[];
  starterId: PlayerId;
  currentPlayerId: PlayerId | null;
  leaderId: PlayerId;
  bidsSum: number;
  trick: TrickCard[];
  trickOutcome: TrickOutcome | null;
  tricksPlayed: number;
  /** A tied trick sliding off the table (keyed so repeated ties re-trigger). */
  clearing: { key: number; cards: TrickCard[] } | null;
  lastTrick: CompletedTrick | null;
  history: RoundSummary[];
  /** Round summary on screen (UI §7). */
  summary: RoundSummary | null;
  losers: PlayerId[];
}

export type Fx =
  | { kind: 'roundStarted'; round: number; handSize: number; blind: boolean; starterId: PlayerId }
  | { kind: 'bid'; playerId: PlayerId; bid: number }
  | { kind: 'played'; playerId: PlayerId }
  | { kind: 'trick'; winner: PlayerId | null }
  | { kind: 'roundScored'; summary: RoundSummary }
  | { kind: 'finished'; losers: PlayerId[] };

export const ANCHORS = {
  deck: 'deck',
  seat: (playerId: PlayerId) => `seat:${playerId}`,
  trick: (playerId: PlayerId) => `trick:${playerId}`,
  selfBlind: 'self-blind',
} as const;

export function sceneFromView(
  matchId: string,
  seq: number,
  view: FodinhaView,
  previous?: Scene | null,
): Scene {
  const sameMatch = previous?.matchId === matchId;
  const previousTrick = new Map((sameMatch ? previous.trick : []).map((t) => [t.card.id, t]));
  const previousHand = new Map((sameMatch ? previous.hand : []).map((c) => [c.card.id, c]));
  return {
    matchId,
    seq,
    // A deal started by the events keeps running across the commit.
    dealing: sameMatch ? previous.dealing : false,
    phase: view.phase,
    selfId: view.selfId,
    round: view.round,
    handSize: view.handSize,
    roundValue: view.roundValue,
    carry: view.carry,
    blind: view.blind,
    maxPoints: view.maxPoints,
    maxHandSize: view.maxHandSize,
    lastBidderRestriction: view.lastBidderRestriction,
    hand: (view.me?.hand ?? []).map((card) => previousHand.get(card.id) ?? { card }),
    selfBlindCard: view.blind && (view.me?.handCount ?? 0) > 0,
    seats: view.seats.map((seat) => ({
      id: seat.id,
      handCount: seat.handCount,
      visibleHand: seat.visibleHand ? [...seat.visibleHand] : null,
      bid: seat.bid,
      tricksWon: seat.tricksWon,
      points: seat.points,
      isStarter: seat.isStarter,
    })),
    starterId: view.starterId,
    currentPlayerId: view.currentPlayerId,
    leaderId: view.leaderId,
    bidsSum: view.bidsSum,
    trick: view.trick.map((play) => previousTrick.get(play.card.id) ?? { ...play }),
    trickOutcome: view.trickOutcome,
    tricksPlayed: view.tricksPlayed,
    clearing: null,
    lastTrick: view.lastTrick,
    history: view.history,
    summary:
      view.phase === 'ROUND_SCORED' || view.phase === 'FINISHED' ? (view.history.at(-1) ?? null) : null,
    losers: view.losers,
  };
}

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

function nextSeat(scene: Scene, playerId: PlayerId): PlayerId {
  const index = scene.seats.findIndex((s) => s.id === playerId);
  return (scene.seats[(index + 1) % scene.seats.length] as SeatScene).id;
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

let clearingKey = 0;

export interface AnimationOptions {
  /** Size of the cards on the table (depends on the layout); collected tricks shrink from it. */
  trickSize: CardSize;
}

/** Advances the scene by one domain event and describes how to animate it. */
export function applyEvent(
  scene: Scene,
  event: FodinhaEvent,
  options: AnimationOptions = { trickSize: 'sm' },
): Step<Scene, Fx> {
  const isSelf = (playerId: PlayerId | null) => playerId !== null && playerId === scene.selfId;

  switch (event.type) {
    case 'RoundStarted':
      return step(
        {
          ...scene,
          phase: 'BIDDING',
          round: event.round,
          handSize: event.handSize,
          roundValue: event.value,
          blind: event.blind,
          starterId: event.starterId,
          leaderId: event.starterId,
          currentPlayerId: event.starterId,
          hand: [],
          selfBlindCard: false,
          seats: scene.seats.map((seat) => ({
            ...seat,
            handCount: 0,
            visibleHand: null,
            bid: null,
            tricksWon: 0,
            isStarter: seat.id === event.starterId,
          })),
          bidsSum: 0,
          trick: [],
          trickOutcome: null,
          tricksPlayed: 0,
          lastTrick: null,
          summary: null,
          dealing: true,
        },
        350,
        [],
        [
          {
            kind: 'roundStarted',
            round: event.round,
            handSize: event.handSize,
            blind: event.blind,
            starterId: event.starterId,
          },
        ],
      );

    case 'CardsDealt': {
      // Hidden hands fly in as backs; visible cards (own hand, blind cards) deal themselves on mount.
      const seatCount = scene.seats.length;
      const stagger = dealStaggerSeconds(seatCount, scene.handSize);
      const flights: FlightRequest[] = scene.blind
        ? []
        : scene.seats.flatMap((seat, seatIndex) =>
            isSelf(seat.id)
              ? []
              : Array.from({ length: event.counts[seat.id] ?? 0 }, (_, card) => ({
                  from: ANCHORS.deck,
                  to: ANCHORS.seat(seat.id),
                  size: 'sm' as const,
                  toSize: 'xs' as const,
                  kind: 'deal' as const,
                  delay: (card * seatCount + seatIndex) * stagger,
                })),
          );
      return step(
        {
          ...scene,
          seats: scene.seats.map((seat) => ({ ...seat, handCount: event.counts[seat.id] ?? 0 })),
        },
        60,
        flights,
      );
    }

    case 'BidPlaced': {
      const seats = scene.seats.map((seat) =>
        seat.id === event.playerId ? { ...seat, bid: event.bid } : seat,
      );
      const allIn = seats.every((seat) => seat.bid !== null);
      return step(
        {
          ...scene,
          seats,
          bidsSum: event.bidsSum,
          phase: allIn ? 'PLAYING' : 'BIDDING',
          currentPlayerId: allIn ? scene.starterId : nextSeat(scene, event.playerId),
        },
        220,
        [],
        [{ kind: 'bid', playerId: event.playerId, bid: event.bid }],
      );
    }

    case 'CardPlayed': {
      const { playerId, card } = event;
      let next = scene;
      let trickCard: TrickCard = { playerId, card };
      if (isSelf(playerId) && scene.blind) {
        next = { ...next, selfBlindCard: false };
        trickCard = { ...trickCard, enter: { from: ANCHORS.selfBlind, kind: 'play' }, revealOnLand: true };
      } else if (isSelf(playerId)) {
        // Shared layoutId: the card glides out of the hand.
        next = { ...next, hand: next.hand.filter((c) => c.card.id !== card.id) };
      } else if (scene.blind) {
        // Also a shared layoutId: the face-up card in front of the seat glides to the middle.
        next = withSeat(next, playerId, (seat) => ({
          ...seat,
          handCount: Math.max(0, seat.handCount - 1),
          visibleHand: (seat.visibleHand ?? []).filter((c) => c.id !== card.id),
        }));
      } else {
        next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: Math.max(0, seat.handCount - 1) }));
        trickCard = { ...trickCard, enter: { from: ANCHORS.seat(playerId), kind: 'play' } };
      }
      const trick = [...next.trick, trickCard];
      const complete = trick.length === scene.seats.length;
      return step(
        {
          ...next,
          phase: 'PLAYING',
          trick,
          currentPlayerId: complete ? null : nextSeat(scene, playerId),
        },
        complete ? 520 : 320,
        [],
        [{ kind: 'played', playerId }],
      );
    }

    case 'TrickResolved': {
      const next = event.winner
        ? withSeat(scene, event.winner, (seat) => ({ ...seat, tricksWon: seat.tricksWon + 1 }))
        : scene;
      return step(
        {
          ...next,
          phase: 'TRICK_RESOLVED',
          currentPlayerId: null,
          trickOutcome: { winner: event.winner, tiedPlayerIds: event.tiedPlayerIds },
          tricksPlayed: scene.tricksPlayed + 1,
        },
        450,
        [],
        [{ kind: 'trick', winner: event.winner }],
      );
    }

    case 'TrickCleared': {
      const lastTrick: CompletedTrick = {
        plays: scene.trick.map(({ playerId, card }) => ({ playerId, card })),
        winner: event.winner,
      };
      const cleared: Scene = {
        ...scene,
        // With no next leader the round is over: its score arrives right after.
        phase: event.nextLeaderId ? 'PLAYING' : 'ROUND_SCORED',
        trick: [],
        trickOutcome: null,
        lastTrick,
        currentPlayerId: event.nextLeaderId,
        leaderId: event.nextLeaderId ?? scene.leaderId,
      };
      if (event.winner === null) {
        clearingKey += 1;
        return step({ ...cleared, clearing: { key: clearingKey, cards: scene.trick } }, 480);
      }
      // The winner collects the cards into their pile.
      const winner = event.winner;
      const flights: FlightRequest[] = scene.trick.map((t, i) => ({
        cardId: t.card.id,
        from: ANCHORS.trick(t.playerId),
        to: ANCHORS.seat(winner),
        size: options.trickSize,
        toSize: 'xs',
        kind: 'pickUp',
        delay: i * 0.03,
      }));
      return step(cleared, 480, flights);
    }

    case 'RoundScored':
      return step(
        {
          ...scene,
          phase: 'ROUND_SCORED',
          currentPlayerId: null,
          summary: event.summary,
          carry: event.summary.carryAfter,
          history: [...scene.history, event.summary],
          seats: scene.seats.map((seat) => {
            const row = event.summary.rows.find((r) => r.playerId === seat.id);
            return row ? { ...seat, points: seat.points + row.pointsAdded } : seat;
          }),
        },
        300,
        [],
        [{ kind: 'roundScored', summary: event.summary }],
      );

    case 'GameFinished':
      return step(
        { ...scene, phase: 'FINISHED', currentPlayerId: null, losers: event.losers },
        200,
        [],
        [{ kind: 'finished', losers: event.losers }],
      );
  }
}

/** Spec: 60 ms between cards, compressed so a big table deals in about a second and a half. */
export function dealStaggerSeconds(seatCount: number, handSize: number): number {
  return Math.min(0.06, 1.4 / Math.max(1, seatCount * handSize));
}

/** Delay of one card of the deal: round-robin, one card per seat at a time. */
export function dealDelaySeconds(
  cardIndex: number,
  seatIndex: number,
  scene: Pick<Scene, 'seats' | 'handSize'>,
): number {
  const seatCount = scene.seats.length;
  return (cardIndex * seatCount + seatIndex) * dealStaggerSeconds(seatCount, scene.handSize);
}

export function dealDurationMs(scene: Pick<Scene, 'seats' | 'handSize'>): number {
  const last = dealDelaySeconds(Math.max(0, scene.handSize - 1), scene.seats.length - 1, scene);
  return Math.round(last * 1000) + 260;
}
