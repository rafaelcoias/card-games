import {
  PACE,
  handValue,
  isBlackjack,
  type BlackjackEvent,
  type BlackjackView,
  type HandView,
  type SeatView,
} from '@cardroom/blackjack';
import type { CardInstance } from '@cardroom/game-core';
import type { EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the blackjack table currently shows. It starts equal to a server view
 * and is advanced event by event, so every card, bet and payout animates before
 * the next authoritative view is committed.
 */
export interface SceneCard {
  /** Stable React key: the card's `uid` for players, the position for the dealer (the hole card flips in place). */
  key: string;
  /** `null` while face down. */
  card: CardInstance | null;
  enter?: EnterFrom;
}

export interface SceneHand extends Omit<HandView, 'cards'> {
  cards: SceneCard[];
}

export interface SceneSeat extends Omit<SeatView, 'hands'> {
  hands: SceneHand[];
}

export interface Scene extends BaseScene, Omit<BlackjackView, 'seats' | 'dealer'> {
  seq: number;
  dealer: Omit<BlackjackView['dealer'], 'cards'> & { cards: SceneCard[] };
  seats: SceneSeat[];
  /** Bumped on every peek, so the hole card lifts its corner each time (UI §7). */
  peek: number;
}

export type Fx =
  | { kind: 'card' }
  | { kind: 'chips' }
  | { kind: 'turn'; seatIndex: number }
  | { kind: 'bust'; seatIndex: number }
  | { kind: 'settled'; seatIndex: number; tone: 'win' | 'lose' | 'push' }
  /** Something the dealer may comment on (the table picks the words). */
  | { kind: 'dealer'; event: BlackjackEvent; key: string }
  | { kind: 'notice'; text: string };

export const ANCHORS = {
  shoe: 'bj:shoe',
  discard: 'bj:discard',
  dealer: 'bj:dealer',
  seat: (seatIndex: number) => `bj:seat:${seatIndex}`,
} as const;

const DEAL: EnterFrom = { from: ANCHORS.shoe, kind: 'deal' };

function toSceneHand(hand: HandView, previous?: SceneHand): SceneHand {
  const known = new Map((previous?.cards ?? []).map((c) => [c.key, c]));
  return { ...hand, cards: hand.cards.map((card) => known.get(card.uid) ?? { key: card.uid, card }) };
}

export function sceneFromView(
  matchId: string,
  seq: number,
  view: BlackjackView,
  previous?: Scene | null,
): Scene {
  const same = previous?.matchId === matchId ? previous : null;
  const previousDealer = same?.dealer.cards ?? [];
  return {
    ...view,
    matchId,
    seq,
    dealing: false,
    peek: same?.peek ?? 0,
    dealer: {
      ...view.dealer,
      cards: view.dealer.cards.map((card, i) => ({
        key: `d${i}`,
        card,
        enter: card?.uid === previousDealer[i]?.card?.uid ? previousDealer[i]?.enter : undefined,
      })),
    },
    seats: view.seats.map((seat) => {
      const before = same?.seats.find((s) => s.seatIndex === seat.seatIndex);
      return {
        ...seat,
        hands: seat.hands.map((hand) =>
          toSceneHand(
            hand,
            before?.hands.find((h) => h.id === hand.id),
          ),
        ),
      };
    }),
  };
}

const step = (
  scene: Scene,
  waitMs: number,
  fx: Fx[] = [],
  flights: FlightRequest[] = [],
): Step<Scene, Fx> => ({
  scene,
  waitMs,
  flights,
  fx,
});

/** Something the dealer may comment on; the key is the same on every client, so all hear the same line. */
const say = (scene: Scene, event: BlackjackEvent): Fx => ({
  kind: 'dealer',
  event,
  key: `${scene.matchId}:${scene.seq}:${JSON.stringify(event)}`,
});

function withSeat(scene: Scene, seatIndex: number, update: (seat: SceneSeat) => SceneSeat): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.seatIndex === seatIndex ? update(seat) : seat)) };
}

function withHand(
  scene: Scene,
  seatIndex: number,
  handIndex: number,
  update: (hand: SceneHand) => SceneHand,
): Scene {
  return withSeat(scene, seatIndex, (seat) => ({
    ...seat,
    hands: seat.hands.map((hand, i) => (i === handIndex ? update(hand) : hand)),
  }));
}

/** Totals follow the cards on the table (face-down cards do not count). */
function valued<H extends { cards: SceneCard[] }>(hand: H): H & { total: number; soft: boolean } {
  const cards = hand.cards.flatMap((c) => (c.card ? [c.card] : []));
  return { ...hand, ...handValue(cards) };
}

function newHand(id: string, bet: number): SceneHand {
  return {
    id,
    cards: [],
    bet,
    doubled: false,
    fromSplit: false,
    splitAces: false,
    status: 'PLAYING',
    outcome: null,
    payout: null,
    total: 0,
    soft: false,
  };
}

/** Everything on the felt slides to the discard tray (UI §5.8). */
function clearTable(scene: Scene): { scene: Scene; flights: FlightRequest[] } {
  const flights: FlightRequest[] = [];
  const toss = (cardId: string | null | undefined, from: string, i: number) =>
    flights.push({ cardId, from, to: ANCHORS.discard, size: 'xs', kind: 'pickUp', delay: i * 0.02 });
  let count = 0;
  for (const seat of scene.seats) {
    for (const hand of seat.hands)
      for (const c of hand.cards) toss(c.card?.id, ANCHORS.seat(seat.seatIndex), count++);
  }
  for (const c of scene.dealer.cards) toss(c.card?.id, ANCHORS.dealer, count++);
  return {
    scene: {
      ...scene,
      turn: null,
      discardCount: scene.discardCount + count,
      dealer: { cards: [], total: null, soft: false, blackjack: false, busted: false },
      seats: scene.seats.map((seat) => ({ ...seat, hands: [], insurance: null })),
    },
    flights,
  };
}

/** Advances the scene by one domain event and describes how to animate it. */
export function applyEvent(scene: Scene, event: BlackjackEvent): Step<Scene, Fx> {
  switch (event.type) {
    case 'BettingOpened': {
      const cleared = clearTable(scene);
      return step(
        { ...cleared.scene, phase: 'BETTING', round: event.round },
        300,
        [say(scene, event)],
        cleared.flights,
      );
    }

    case 'BetPlaced':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          bet: event.amount,
          stack: seat.stack - event.amount,
        })),
        120,
        [{ kind: 'chips' }],
      );

    case 'BetCleared':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          bet: null,
          stack: seat.stack + event.amount,
        })),
        80,
      );

    case 'BettingClosed': {
      const next: Scene = {
        ...scene,
        phase: 'DEALING',
        roundsDealt: scene.roundsDealt + 1,
        seats: scene.seats.map((seat) =>
          event.seats.includes(seat.seatIndex) && seat.bet !== null
            ? {
                ...seat,
                hands: [newHand('h0', seat.bet)],
                lastBet: seat.bet,
                bet: null,
                roundsPlayed: seat.roundsPlayed + 1,
              }
            : { ...seat, hands: [] },
        ),
      };
      return step(next, 250, [say(scene, event)]);
    }

    case 'CardDealt': {
      const shoe = { ...scene.shoe, remaining: Math.max(0, scene.shoe.remaining - 1) };
      if (event.to.kind === 'DEALER') {
        const index = scene.dealer.cards.length;
        const dealer = valued({
          ...scene.dealer,
          cards: [...scene.dealer.cards, { key: `d${index}`, card: event.card, enter: DEAL }],
        });
        return step({ ...scene, shoe, dealer }, PACE.dealCard, [{ kind: 'card' }]);
      }
      const { seatIndex, handIndex } = event.to;
      const card = event.card as CardInstance;
      const next = withHand({ ...scene, shoe }, seatIndex, handIndex, (hand) =>
        valued({ ...hand, cards: [...hand.cards, { key: card.uid, card, enter: DEAL }] }),
      );
      return step(next, PACE.dealCard, [{ kind: 'card' }]);
    }

    case 'InsuranceOffered': {
      const next: Scene = {
        ...scene,
        phase: 'INSURANCE',
        seats: scene.seats.map((seat) => {
          const hand = seat.hands[0];
          if (!event.seats.includes(seat.seatIndex) || !hand) return seat;
          const cards = hand.cards.flatMap((c) => (c.card ? [c.card] : []));
          const evenMoney = isBlackjack({ cards, fromSplit: false });
          return {
            ...seat,
            insurance: { evenMoney, decision: 'PENDING', amount: evenMoney ? 0 : hand.bet / 2, payout: null },
          };
        }),
      };
      return step(next, 300, [say(scene, event)]);
    }

    case 'InsuranceTaken':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          stack: seat.stack - event.amount,
          insurance: seat.insurance && { ...seat.insurance, decision: 'TAKEN' },
        })),
        150,
        [{ kind: 'chips' }],
      );

    case 'InsuranceDeclined':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          insurance: seat.insurance && { ...seat.insurance, decision: 'DECLINED' },
        })),
        60,
      );

    case 'EvenMoneyTaken': {
      const next = withHand(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          stack: seat.stack + event.payout,
          insurance: seat.insurance && { ...seat.insurance, decision: 'TAKEN' },
        })),
        event.seatIndex,
        0,
        (hand) => ({ ...hand, outcome: 'EVEN_MONEY', payout: event.payout }),
      );
      return step(next, 350, [{ kind: 'settled', seatIndex: event.seatIndex, tone: 'win' }]);
    }

    case 'DealerPeeked':
      return step({ ...scene, phase: 'PEEK', peek: scene.peek + 1 }, 700, [say(scene, event)]);

    case 'TurnStarted':
      return step(
        { ...scene, phase: 'PLAYER_TURNS', turn: { seatIndex: event.seatIndex, handIndex: event.handIndex } },
        150,
        [{ kind: 'turn', seatIndex: event.seatIndex }],
      );

    case 'HandSplit': {
      const next = withSeat(scene, event.seatIndex, (seat) => {
        const hand = seat.hands[event.handIndex];
        if (!hand) return seat;
        const [first, second] = hand.cards;
        const aces = first?.card?.rank === 'A';
        const kept = valued({ ...hand, cards: first ? [first] : [], fromSplit: true, splitAces: aces });
        // Same id the engine gives it (hands are numbered as they are created), so nothing remounts.
        const moved = valued({
          ...newHand(`h${seat.hands.length}`, event.bet),
          cards: second ? [second] : [],
          fromSplit: true,
          splitAces: aces,
        });
        const hands = [...seat.hands];
        hands.splice(event.handIndex, 1, kept, moved);
        return { ...seat, hands, stack: seat.stack - event.bet };
      });
      return step(next, 320, [{ kind: 'chips' }]);
    }

    case 'HandDoubled': {
      const next = withSeat(scene, event.seatIndex, (seat) => {
        const hand = seat.hands[event.handIndex];
        const extra = hand ? event.bet - hand.bet : 0;
        return {
          ...seat,
          stack: seat.stack - extra,
          hands: seat.hands.map((h, i) =>
            i === event.handIndex ? { ...h, bet: event.bet, doubled: true } : h,
          ),
        };
      });
      return step(next, 200, [{ kind: 'chips' }]);
    }

    case 'HandSurrendered':
      return step(
        withHand(scene, event.seatIndex, event.handIndex, (hand) => ({ ...hand, status: 'SURRENDERED' })),
        250,
      );

    case 'HandStood':
      return step(
        withHand(scene, event.seatIndex, event.handIndex, (hand) => ({ ...hand, status: 'STOOD' })),
        event.auto ? 150 : 100,
      );

    case 'HandBusted':
      return step(
        withHand(scene, event.seatIndex, event.handIndex, (hand) => ({ ...hand, status: 'BUSTED' })),
        400,
        [{ kind: 'bust', seatIndex: event.seatIndex }, say(scene, event)],
      );

    case 'DealerTurnStarted':
      return step({ ...scene, phase: 'DEALER_TURN', turn: null }, 150);

    case 'HoleCardRevealed': {
      const dealer = valued({
        ...scene.dealer,
        cards: scene.dealer.cards.map((c, i) => (i === 1 ? { ...c, card: event.card } : c)),
      });
      return step({ ...scene, dealer: { ...dealer, busted: dealer.total > 21 } }, 450, [{ kind: 'card' }]);
    }

    case 'DealerStood':
      return step(scene, 250);

    case 'DealerBusted':
      return step({ ...scene, dealer: { ...scene.dealer, busted: true } }, 350, [say(scene, event)]);

    case 'HandSettled': {
      const next = withHand(
        withSeat(scene, event.seatIndex, (seat) => ({ ...seat, stack: seat.stack + event.payout })),
        event.seatIndex,
        event.handIndex,
        (hand) => ({ ...hand, outcome: event.outcome, payout: event.payout, bet: event.bet }),
      );
      const tone = event.outcome === 'PUSH' ? 'push' : event.payout > event.bet ? 'win' : 'lose';
      return step({ ...next, phase: 'SETTLEMENT' }, PACE.settleHand, [
        { kind: 'settled', seatIndex: event.seatIndex, tone },
        say(scene, event),
      ]);
    }

    case 'InsuranceSettled':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({
          ...seat,
          stack: seat.stack + event.payout,
          insurance: seat.insurance && { ...seat.insurance, payout: event.payout },
        })),
        200,
      );

    case 'RoundSettled':
      return step({ ...scene, phase: 'SETTLEMENT', turn: null }, 200);

    case 'CutCardReached':
      return step({ ...scene, shoe: { ...scene.shoe, cutCardReached: true } }, 0, [
        say(scene, event),
        { kind: 'notice', text: 'Saiu a carta de corte: última ronda do sapato' },
      ]);

    case 'ShuffleStarted': {
      const cleared = clearTable(scene);
      return step({ ...cleared.scene, phase: 'SHUFFLING' }, 300, [say(scene, event)], cleared.flights);
    }

    case 'ShoeShuffled':
      return step(
        {
          ...scene,
          discardCount: 0,
          shoe: {
            ...scene.shoe,
            remaining: event.reason === 'CUT_CARD' ? scene.shoe.total : scene.discardCount,
            cutCardReached: event.reason === 'RESERVE',
          },
        },
        250,
      );

    case 'PlayerRebought':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({ ...seat, stack: event.stack, rebuys: event.rebuys })),
        200,
        [{ kind: 'chips' }],
      );

    case 'PlayerSatOut':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({ ...seat, sittingOut: event.value })),
        0,
      );

    case 'PlayerJoined': {
      if (scene.seats.some((seat) => seat.playerId === event.playerId)) {
        return step(
          withSeat(scene, event.seatIndex, (seat) => ({ ...seat, leaving: false })),
          0,
        );
      }
      const seat: SceneSeat = {
        seatIndex: event.seatIndex,
        playerId: event.playerId,
        stack: event.stack,
        rebuys: 0,
        net: 0,
        bet: null,
        lastBet: null,
        insurance: null,
        hands: [],
        sittingOut: false,
        leaving: false,
        roundsPlayed: 0,
      };
      const seats = [...scene.seats, seat].sort((a, b) => a.seatIndex - b.seatIndex);
      return step({ ...scene, seats }, 200);
    }

    case 'PlayerLeaving':
      return step(
        withSeat(scene, event.seatIndex, (seat) => ({ ...seat, leaving: true })),
        0,
      );

    case 'PlayerLeft':
      return step({ ...scene, seats: scene.seats.filter((seat) => seat.seatIndex !== event.seatIndex) }, 150);

    case 'SessionEnding':
      return step({ ...scene, endRequested: true }, 0, [
        {
          kind: 'notice',
          text: event.afterRound ? 'A sessão termina no fim desta ronda' : 'A sessão terminou',
        },
      ]);

    case 'SessionFinished': {
      const cleared = clearTable(scene);
      return step({ ...cleared.scene, phase: 'FINISHED' }, 200, [], cleared.flights);
    }
  }
}
