import {
  type BlackjackAction,
  blackjackConfigSchema,
  createBlackjackModule,
  randomShuffler,
  type BlackjackEvent,
  type BlackjackState,
  type Shuffler,
} from '@cardroom/blackjack';
import { SYSTEM_PLAYER_ID, createSeededRng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { chipsFor, feltPrint, outcomeLabel, totalLabel } from './copy';
import { dealerLine } from './dealer-lines';
import { tableGeometry, visualSlot } from './layout';
import { fodinhaSizes } from '../fodinha/table';
import { ANCHORS, applyEvent, sceneFromView, type Scene } from './scene';
import { blackjackSizes } from './table';

/** The first cards of the shoe, in dealing order. */
const stacked =
  (order: string[]): Shuffler =>
  (cards, rng, context) => {
    const rest = randomShuffler(cards, rng, context);
    return [
      ...order.map(
        (id) =>
          rest.splice(
            rest.findIndex((c) => c.id === id),
            1,
          )[0]!,
      ),
      ...rest,
    ];
  };

function start(players: string[], order: string[] = []) {
  const engine = createBlackjackModule(stacked(order));
  let state: BlackjackState = engine.setup(
    players,
    blackjackConfigSchema.parse({}),
    createSeededRng('scene'),
  );
  let seq = 0;
  const scene = () => sceneFromView('m1', seq, engine.getPlayerView(state, players[0]!));
  const apply = (playerId: string, action: BlackjackAction) => {
    const result = engine.applyAction(state, action, playerId);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
    seq += 1;
    return result.events;
  };
  const view = () => engine.getPlayerView(state, players[0]!);
  return {
    scene,
    apply,
    view,
    get state() {
      return state;
    },
  };
}

/** Runs events through the reducer, as the director does. */
const play = (scene: Scene, events: readonly BlackjackEvent[]) =>
  events.reduce((current, event) => applyEvent(current, event).scene, scene);

/** What the scene and the committed view must agree on. */
const essentials = (s: Pick<Scene, 'phase' | 'turn' | 'seats'>) => ({
  phase: s.phase,
  turn: s.turn,
  seats: s.seats.map((seat) => ({
    seatIndex: seat.seatIndex,
    stack: seat.stack,
    bet: seat.bet,
    hands: seat.hands.map((h) => ({
      cards: h.cards.map((c) => c.card?.uid ?? null),
      bet: h.bet,
      status: h.status,
      outcome: h.outcome,
      payout: h.payout,
      total: h.total,
    })),
  })),
});

describe('blackjack scene', () => {
  it('replays a whole round event by event into exactly the next view', () => {
    const t = start(['me', 'op'], ['8S', '10D', '6H', '8H', '7C', 'KH', '3C', '2S', '10S', '5D']);
    let scene = t.scene();
    const steps: [string, BlackjackAction][] = [
      ['me', { type: 'PLACE_BET', amount: 50 }],
      ['op', { type: 'PLACE_BET', amount: 100 }],
      [SYSTEM_PLAYER_ID, { type: 'SYS_DEAL_DONE' }],
      ['me', { type: 'SPLIT' }],
      ['me', { type: 'DOUBLE' }],
      ['me', { type: 'STAND' }],
      ['op', { type: 'STAND' }],
    ];
    for (const [actor, action] of steps) {
      scene = play(scene, t.apply(actor, action));
      expect(essentials(scene)).toEqual(essentials(sceneFromView('m1', 0, t.view())));
    }
    while (t.state.phase === 'DEALER_TURN') {
      scene = play(scene, t.apply(SYSTEM_PLAYER_ID, { type: 'SYS_DEALER_STEP' }));
      expect(essentials(scene)).toEqual(essentials(sceneFromView('m1', 0, t.view())));
    }
    expect(scene.phase).toBe('SETTLEMENT');
    expect(scene.dealer.cards.every((c) => c.card)).toBe(true);
    expect(scene.dealer.total).toBe(t.view().dealer.total);

    const cleared = applyEvent(scene, { type: 'BettingOpened', round: 2 });
    expect(cleared.scene.seats.every((s) => s.hands.length === 0)).toBe(true);
    expect(cleared.scene.discardCount).toBe(scene.discardCount + 10); // 5 of mine, 2 of theirs, 3 of the dealer
    expect(cleared.flights.every((f) => f.to === ANCHORS.discard)).toBe(true);
  });

  it('keeps the hole card face down in place and flips it on reveal', () => {
    const t = start(['me'], ['10S', '9D', '7H', 'KC']);
    let scene = play(t.scene(), t.apply('me', { type: 'PLACE_BET', amount: 10 }));
    expect(scene.dealer.cards.map((c) => [c.key, c.card?.id ?? null])).toEqual([
      ['d0', '9D'],
      ['d1', null],
    ]);
    expect(scene.dealer.total).toBe(9);
    scene = play(scene, [{ type: 'HoleCardRevealed', card: t.state.dealer.cards[1]! }]);
    expect(scene.dealer.cards[1]).toMatchObject({ key: 'd1', card: { id: 'KC' } });
    expect(scene.dealer.total).toBe(19);
  });

  it('new cards fly in from the shoe; a committed view keeps them where they are', () => {
    const t = start(['me'], ['10S', '9D', '7H', 'KC']);
    const scene = play(t.scene(), t.apply('me', { type: 'PLACE_BET', amount: 10 }));
    expect(scene.seats[0]?.hands[0]?.cards[0]?.enter).toEqual({ from: ANCHORS.shoe, kind: 'deal' });
    const committed = sceneFromView('m1', 3, t.view(), scene);
    expect(committed.seats[0]?.hands[0]?.cards[0]?.enter).toEqual({ from: ANCHORS.shoe, kind: 'deal' });
    expect(sceneFromView('other', 3, t.view(), scene).seats[0]?.hands[0]?.cards[0]?.enter).toBeUndefined();
  });

  it('lets the dealer comment on events, the same way on every client', () => {
    const say = (event: BlackjackEvent, key: string) => dealerLine(event, key, () => 'Ana', null);
    expect(say({ type: 'InsuranceOffered', seats: [0] }, 'k')).toMatch(/Seguro|Ás/);
    expect(say({ type: 'DealerBusted', total: 24 }, 'k')).toMatch(/rebent/i);
    expect(
      say(
        { type: 'HandSettled', seatIndex: 0, handIndex: 0, outcome: 'BLACKJACK', bet: 10, payout: 25 },
        'k',
      ),
    ).toContain('Ana');
    expect(
      say({ type: 'HandSettled', seatIndex: 0, handIndex: 0, outcome: 'WIN', bet: 10, payout: 20 }, 'k'),
    ).toBeNull();
    expect(say({ type: 'CardDealt', to: { kind: 'DEALER' }, card: null }, 'k')).toBeNull();
    const event: BlackjackEvent = { type: 'ShuffleStarted' };
    expect(dealerLine(event, 'same', () => '', null)).toBe(dealerLine(event, 'same', () => '', null));
    const first = dealerLine(event, 'x', () => '', null) as string;
    expect(dealerLine(event, 'x', () => '', first)).not.toBe(first); // never twice in a row
  });
});

describe('table copy and layout', () => {
  it('labels hands and results the casino way', () => {
    expect(totalLabel({ total: 17, soft: true, status: 'PLAYING', cards: [1, 2] })).toBe('7 / 17');
    expect(totalLabel({ total: 21, soft: true, status: 'BLACKJACK', cards: [1, 2] })).toBe('BLACKJACK');
    expect(totalLabel({ total: 25, soft: false, status: 'BUSTED', cards: [1, 2, 3] })).toBe('REBENTOU');
    expect(outcomeLabel('BLACKJACK', 20, 50)).toBe('BLACKJACK +30');
    expect(outcomeLabel('LOSE', 50, 0)).toBe('−50');
    expect(outcomeLabel('PUSH', 50, 50)).toBe('EMPATE');
    expect(feltPrint({ dealerHitsSoft17: false, insurance: true })).toBe(
      'BLACKJACK PAGA 3 PARA 2 · A BANCA FICA EM TODOS OS 17 · SEGURO PAGA 2 PARA 1',
    );
    expect(chipsFor(185)).toEqual([100, 50, 20, 10, 5]);
  });

  it('turns the table so the viewer sits in the middle, keeping the order', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((seat) => visualSlot(seat, 0))).toEqual([3, 4, 5, 6, 0, 1, 2]);
    expect(visualSlot(5, 5)).toBe(3);
    expect(visualSlot(2, null)).toBe(2);
    const geometry = tableGeometry({ width: 1200, height: 700 }, { width: 160, height: 220 });
    const [right, , , middle, , , left] = geometry.slots;
    expect(right!.x).toBeGreaterThan(middle!.x);
    expect(left!.x).toBeLessThan(middle!.x);
    expect(middle!.y).toBeGreaterThan(right!.y);
  });
});

describe('card sizes', () => {
  it('blackjack cards grow with the screen', () => {
    expect(blackjackSizes('desktop', { width: 1920, height: 1080 })).toMatchObject({
      seatCard: 'md',
      dealerCard: 'lg',
    });
    expect(blackjackSizes('desktop', { width: 1440, height: 900 })).toMatchObject({
      seatCard: 'ms',
      selfCard: 'md',
    });
    expect(blackjackSizes('desktop', { width: 1280, height: 720 })).toMatchObject({
      seatCard: 'sm',
      selfCard: 'ms',
    });
    expect(blackjackSizes('phone', { width: 390, height: 844 }).selfCard).toBe('md');
    expect(blackjackSizes('phone', { width: 360, height: 640 }).selfCard).toBe('ms');
  });

  it('fodinha trick and hand follow the height, smaller with more than six players', () => {
    expect(fodinhaSizes('desktop', 1080, 4)).toMatchObject({ trick: 'lg', hand: 'xl' });
    expect(fodinhaSizes('desktop', 900, 4)).toMatchObject({ trick: 'ml', hand: 'lg' });
    expect(fodinhaSizes('desktop', 1080, 9)).toMatchObject({ trick: 'md', seat: 'compact' });
    expect(fodinhaSizes('phone', 844, 4)).toMatchObject({ trick: 'ms', hand: 'ml' });
    expect(fodinhaSizes('phone', 640, 10)).toMatchObject({ trick: 'xs', hand: 'ms' });
  });
});
