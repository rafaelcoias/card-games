import { parseCardId, type Card } from '@cardroom/game-core';
import type { AskEntry, PeixinhoView } from '@cardroom/peixinho';
import { describe, expect, it } from 'vitest';
import { answerLine, listNames, logLine, rankPlural } from './copy';

import { ANCHORS, applyEvent, dealDurationMs, sceneFromView, type Scene } from './scene';
import { placeHand, pondSpots } from './layout';

const c = (id: string): Card => parseCardId(id) as Card;
const cs = (...ids: string[]) => ids.map(c);

function view(overrides: Partial<PeixinhoView> = {}): PeixinhoView {
  return {
    phase: 'PLAYING',
    selfId: 'me',
    me: { id: 'me', hand: cs('7S', '7H', 'KC') },
    seats: [
      { id: 'me', handCount: 3, peixinhos: [], out: false },
      { id: 'op', handCount: 5, peixinhos: ['2'], out: false },
      { id: 'ze', handCount: 4, peixinhos: [], out: false },
    ],
    currentPlayerId: 'me',
    awaitingFish: null,
    pondCount: 3,
    pondSize: 30,
    pondSlots: [4, 9, 20],
    askLog: [],
    lastFish: null,
    tableMemory: 'LAST_5',
    refillCount: 4,
    pondPicking: true,
    peixinhosTotal: 1,
    winners: [],
    ...overrides,
  };
}

const scene = (overrides: Partial<PeixinhoView> = {}): Scene => sceneFromView('m1', 5, view(overrides));
const seat = (s: Scene, id: string) => s.seats.find((x) => x.id === id);
const steps = (result: ReturnType<typeof applyEvent>) => (Array.isArray(result) ? result : [result]);
const one = (result: ReturnType<typeof applyEvent>) => steps(result)[0] as Exclude<typeof result, unknown[]>;

describe('peixinho scene', () => {
  it('mirrors the view', () => {
    const s = scene();
    expect(s.hand.map((h) => h.card.id)).toEqual(['7S', '7H', 'KC']);
    expect(s.pondSlots).toEqual([4, 9, 20]);
    expect(s.showcase).toBeNull();
    expect(s.incoming).toEqual([]);
    expect(dealDurationMs(s)).toBe(Math.round(2 * 60) + 260);
  });

  it('an ask names the asker on turn and clears a pending fish', () => {
    const next = one(
      applyEvent(scene({ awaitingFish: { askerId: 'op', targetId: 'me', rank: '7' } }), {
        type: 'Asked',
        askerId: 'me',
        targetId: 'op',
        rank: 'K',
      }),
    );
    expect(next.scene.currentPlayerId).toBe('me');
    expect(next.scene.awaitingFish).toBeNull();
    expect(next.fx).toEqual([{ kind: 'asked', askerId: 'me', targetId: 'op', rank: 'K' }]);
  });

  it('cards given to me fly in face up from the giver', () => {
    const next = one(
      applyEvent(scene(), { type: 'CardsGiven', from: 'op', to: 'me', rank: '7', cards: cs('7D', '7C') }),
    );
    expect(seat(next.scene, 'op')?.handCount).toBe(3);
    expect(next.scene.hand.slice(-2)).toEqual([
      { card: c('7D'), enter: { from: ANCHORS.seat('op'), kind: 'pickUp', delay: 0 } },
      { card: c('7C'), enter: { from: ANCHORS.seat('op'), kind: 'pickUp', delay: 0.06 } },
    ]);
    expect(next.flights).toEqual([]);
  });

  it('cards I give leave my hand towards the asker', () => {
    const next = one(
      applyEvent(scene(), { type: 'CardsGiven', from: 'me', to: 'op', rank: '7', cards: cs('7S', '7H') }),
    );
    expect(next.scene.hand.map((h) => h.card.id)).toEqual(['KC']);
    expect(seat(next.scene, 'op')?.handCount).toBe(7);
    expect(next.flights.map((f) => [f.cardId, f.from, f.to])).toEqual([
      ['7S', ANCHORS.handCard('7S'), ANCHORS.seat('op')],
      ['7H', ANCHORS.handCard('7H'), ANCHORS.seat('op')],
    ]);
  });

  it('between two opponents the cards fly face up, seat to seat', () => {
    const next = one(
      applyEvent(scene(), { type: 'CardsGiven', from: 'op', to: 'ze', rank: '9', cards: cs('9S') }),
    );
    expect([seat(next.scene, 'op')?.handCount, seat(next.scene, 'ze')?.handCount]).toEqual([4, 5]);
    expect(next.flights).toMatchObject([{ cardId: '9S', from: ANCHORS.seat('op'), to: ANCHORS.seat('ze') }]);
  });

  it('"Vai à pesca!" waits for a pick only when the room plays that way', () => {
    const event = { type: 'GoFish', askerId: 'me', targetId: 'op', rank: 'K', pondEmpty: false } as const;
    expect(one(applyEvent(scene(), { ...event, awaitingPick: true })).scene.awaitingFish).toEqual({
      askerId: 'me',
      targetId: 'op',
      rank: 'K',
    });
    expect(one(applyEvent(scene(), { ...event, awaitingPick: false })).scene.awaitingFish).toBeNull();
  });

  it('my own miss arrives with the view, entering from my hand; a catch is shown at once', () => {
    const miss = one(
      applyEvent(scene(), {
        type: 'Fished',
        playerId: 'me',
        rank: 'K',
        slot: 9,
        caughtAsked: false,
        card: null,
      }),
    );
    expect(miss.scene.pondSlots).toEqual([4, 20]);
    expect(miss.scene.fishSpot).toBe(9);
    expect(miss.scene.incoming).toEqual([ANCHORS.selfHand]);
    expect(miss.flights).toMatchObject([{ from: ANCHORS.pondSlot(9), to: ANCHORS.selfHand }]);
    const committed = sceneFromView(
      'm1',
      6,
      view({ me: { id: 'me', hand: cs('7S', '7H', 'KC', '3D') } }),
      miss.scene,
    );
    expect(committed.hand.find((h) => h.card.id === '3D')?.enter).toEqual({
      from: ANCHORS.selfHand,
      kind: 'draw',
      delay: 0,
    });
    expect(committed.hand.find((h) => h.card.id === '7S')?.enter).toBeUndefined();
    expect(committed.incoming).toEqual([]);

    const catchIt = one(
      applyEvent(scene(), {
        type: 'Fished',
        playerId: 'me',
        rank: 'K',
        slot: 4,
        caughtAsked: true,
        card: c('KD'),
      }),
    );
    expect(catchIt.scene.hand.at(-1)).toEqual({ card: c('KD'), enter: { from: ANCHORS.fish, kind: 'draw' } });
    expect(catchIt.waitMs).toBeGreaterThan(miss.waitMs);
  });

  it("another player's fish flies to their seat, face up only when it was the rank asked", () => {
    const hidden = one(
      applyEvent(scene(), {
        type: 'Fished',
        playerId: 'op',
        rank: '5',
        slot: 20,
        caughtAsked: false,
        card: null,
      }),
    );
    expect(seat(hidden.scene, 'op')?.handCount).toBe(6);
    expect(hidden.flights).toMatchObject([
      { cardId: null, from: ANCHORS.pondSlot(20), to: ANCHORS.seat('op') },
    ]);
    const shown = one(
      applyEvent(scene(), {
        type: 'Fished',
        playerId: 'op',
        rank: '5',
        slot: 20,
        caughtAsked: true,
        card: c('5S'),
      }),
    );
    expect(shown.flights[0]?.cardId).toBe('5S');
  });

  it('a peixinho fans out in the middle, then goes to the bucket', () => {
    const base = scene({ me: { id: 'me', hand: cs('7S', '7H', '7D', '7C', 'KC') } });
    const [fan, stored] = steps(
      applyEvent(base, {
        type: 'PeixinhoMade',
        playerId: 'me',
        rank: '7',
        cards: cs('7S', '7H', '7D', '7C'),
        extraTurn: true,
      }),
    );
    expect(fan?.scene.hand.map((h) => h.card.id)).toEqual(['KC']);
    expect(fan?.scene.showcase?.cards.map((h) => [h.card.id, h.enter])).toEqual([
      ['7S', undefined],
      ['7H', undefined],
      ['7D', undefined],
      ['7C', undefined],
    ]);
    expect(fan?.fx).toEqual([{ kind: 'peixinho', playerId: 'me', rank: '7', extraTurn: true }]);
    expect(stored?.scene.showcase).toBeNull();
    expect(seat(stored!.scene, 'me')?.peixinhos).toEqual(['7']);
    expect(stored?.scene.peixinhosTotal).toBe(2);
    expect(stored?.flights.every((f) => f.from === ANCHORS.showcase && f.to === ANCHORS.bucket('me'))).toBe(
      true,
    );
  });

  it("an opponent's peixinho comes out of their seat", () => {
    const [fan] = steps(
      applyEvent(scene(), {
        type: 'PeixinhoMade',
        playerId: 'op',
        rank: 'Q',
        cards: cs('QS', 'QH', 'QD', 'QC'),
        extraTurn: false,
      }),
    );
    expect(seat(fan!.scene, 'op')?.handCount).toBe(1);
    expect(fan?.scene.showcase?.cards.every((h) => h.enter?.from === ANCHORS.seat('op'))).toBe(true);
  });

  it('refills: backs fly from the pond; mine arrive with the view', () => {
    const theirs = one(applyEvent(scene(), { type: 'Refilled', playerId: 'ze', count: 2, slots: [9, 20] }));
    expect(theirs.scene.pondSlots).toEqual([4]);
    expect(seat(theirs.scene, 'ze')?.handCount).toBe(6);
    expect(theirs.flights.map((f) => f.from)).toEqual([ANCHORS.pondSlot(9), ANCHORS.pondSlot(20)]);
    const mine = one(applyEvent(scene(), { type: 'Refilled', playerId: 'me', count: 2, slots: [9, 20] }));
    expect(mine.scene.incoming).toEqual([ANCHORS.selfHand, ANCHORS.selfHand]);
  });

  it('a refill that is itself a peixinho never waits for those cards in the hand', () => {
    const empty = scene({ me: { id: 'me', hand: [] } });
    const refilled = one(
      applyEvent(empty, { type: 'Refilled', playerId: 'me', count: 4, slots: [4, 9, 20, 21] }),
    );
    const [fan] = steps(
      applyEvent(refilled.scene, {
        type: 'PeixinhoMade',
        playerId: 'me',
        rank: 'J',
        cards: cs('JS', 'JH', 'JD', 'JC'),
        extraTurn: true,
      }),
    );
    expect(fan?.scene.incoming).toEqual([]);
    expect(fan?.scene.showcase?.cards.every((h) => h.enter?.from === ANCHORS.pond)).toBe(true);
  });

  it('out, turn passed and the end', () => {
    expect(seat(one(applyEvent(scene(), { type: 'PlayerOut', playerId: 'ze' })).scene, 'ze')?.out).toBe(true);
    const passed = one(applyEvent(scene(), { type: 'TurnPassed', from: 'me', to: 'op' }));
    expect(passed.scene.currentPlayerId).toBe('op');
    const end = one(
      applyEvent(scene(), { type: 'GameFinished', winners: ['op'], peixinhos: { me: 0, op: 13, ze: 0 } }),
    );
    expect(end.scene).toMatchObject({ phase: 'FINISHED', currentPlayerId: null, winners: ['op'] });
  });

  it('a new match starts from scratch', () => {
    const previous = { ...scene(), incoming: [ANCHORS.selfHand] };
    const fresh = sceneFromView('m2', 0, view(), previous);
    expect(fresh.incoming).toEqual([]);
    expect(fresh.hand.every((h) => h.enter === undefined)).toBe(true);
  });
});

describe('peixinho layout and copy', () => {
  it('scatters the pond the same way on every screen, inside its oval', () => {
    const spots = pondSpots('m1', 30, { x: 100, y: 50 });
    expect(spots).toEqual(pondSpots('m1', 30, { x: 100, y: 50 }));
    expect(spots).not.toEqual(pondSpots('m2', 30, { x: 100, y: 50 }));
    for (const spot of spots) {
      expect((spot.x / 100) ** 2 + (spot.y / 50) ** 2).toBeLessThanOrEqual(1.05);
      expect(Math.abs(spot.rotate)).toBeLessThanOrEqual(50);
    }
  });

  it('groups the hand by rank, squeezes it to fit, and lies flat when it cannot', () => {
    const hand = cs('7S', '7H', 'KC', 'KD', 'KH', '2S').map((card) => ({ card }));
    const roomy = placeHand(hand, 'md', 2000);
    expect(roomy.flat).toBe(false);
    expect(roomy.badges.map((b) => [b.rank, b.count])).toEqual([
      ['7', 2],
      ['K', 3],
    ]);
    const tight = placeHand(hand, 'md', 300);
    expect(tight.total).toBeLessThanOrEqual(300 + 0.5);
    expect(tight.flat).toBe(false);
    expect(placeHand(hand, 'md', 120).flat).toBe(true);
  });

  it('reads the table like people speak', () => {
    expect(rankPlural('7')).toBe('Setes');
    expect(rankPlural('A')).toBe('Ases');
    expect(answerLine(2)).toBe('Tenho! Toma 2.');
    expect(answerLine(null)).toBe('Vai à pesca! 🐟');
    expect(listNames(['Ana', 'Bruno', 'Carla'])).toBe('Ana, Bruno e Carla');
    const names = (id: string) => ({ ana: 'Ana', bruno: 'Bruno' })[id] ?? id;
    const entry = (result: AskEntry['result'], extra: Partial<AskEntry> = {}): AskEntry => ({
      seq: 1,
      askerId: 'ana',
      targetId: 'bruno',
      rank: '7',
      result,
      peixinhosMade: [],
      ...extra,
    });
    expect(logLine(entry({ type: 'GIVEN', count: 2 }), 'me', names)).toEqual({
      who: 'Ana',
      verb: 'pediu',
      rank: 'Setes',
      to: 'a Bruno',
      outcome: 'levou 2',
    });
    expect(
      logLine(entry({ type: 'GIVEN', count: 1 }, { askerId: 'me', peixinhosMade: ['7'] }), 'me', names),
    ).toMatchObject({
      who: 'Tu',
      verb: 'pediste',
      outcome: 'levaste 1 · 🐟 Setes',
    });
    expect(
      logLine(
        entry({ type: 'GO_FISH', caughtAsked: false, pondEmpty: false }, { targetId: 'me' }),
        'me',
        names,
      ),
    ).toMatchObject({
      to: 'a ti',
      outcome: 'foi à pesca',
    });
    expect(
      logLine(entry({ type: 'GO_FISH', caughtAsked: true, pondEmpty: false }), 'me', names).outcome,
    ).toBe('pescou o que pediu!');
    expect(
      logLine(entry({ type: 'GO_FISH', caughtAsked: null, pondEmpty: false }), 'me', names).outcome,
    ).toBe('a pescar…');
    expect(
      logLine(entry({ type: 'GO_FISH', caughtAsked: false, pondEmpty: true }), 'me', names).outcome,
    ).toBe('lago vazio');
  });
});
