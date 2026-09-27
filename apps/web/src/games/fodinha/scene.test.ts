import type { FodinhaView } from '@cardroom/fodinha';
import { parseCardId, type Card } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { bidTone, bidsBalance } from './copy';
import { tableGeometry } from './layout';
import { ANCHORS, applyEvent, dealDurationMs, sceneFromView, type Scene } from './scene';

const c = (id: string): Card => parseCardId(id) as Card;

function view(overrides: Partial<FodinhaView> = {}): FodinhaView {
  return {
    phase: 'PLAYING',
    selfId: 'me',
    round: 3,
    handSize: 3,
    roundValue: 1,
    carry: 0,
    blind: false,
    maxPoints: 5,
    maxHandSize: 5,
    lastBidderRestriction: false,
    me: { id: 'me', hand: [c('5H'), c('9S'), c('AD')], handCount: 3 },
    seats: ['me', 'op', 'ze'].map((id) => ({
      id,
      handCount: 3,
      visibleHand: null,
      bid: 1,
      tricksWon: 0,
      points: 0,
      isStarter: id === 'me',
    })),
    starterId: 'me',
    currentPlayerId: 'me',
    leaderId: 'me',
    bidsSum: 3,
    trick: [],
    trickOutcome: null,
    tricksPlayed: 0,
    lastTrick: null,
    history: [],
    losers: [],
    ...overrides,
  };
}

const scene = (overrides: Partial<FodinhaView> = {}): Scene => sceneFromView('m1', 5, view(overrides));
const seat = (s: Scene, id: string) => s.seats.find((x) => x.id === id);

describe('fodinha scene', () => {
  it('mirrors the view; a snapshot shows the round summary while it is on', () => {
    const s = scene();
    expect(s.hand.map((h) => h.card.id)).toEqual(['5H', '9S', 'AD']);
    expect(s.selfBlindCard).toBe(false);
    expect(s.summary).toBeNull();
    const summary = { round: 3, handSize: 3, value: 1, rows: [], carryAfter: 1 };
    expect(scene({ phase: 'ROUND_SCORED', history: [summary] }).summary).toEqual(summary);
  });

  it('blind rounds keep the own card hidden but present until it is played', () => {
    const s = scene({ blind: true, handSize: 1, me: { id: 'me', hand: null, handCount: 1 } });
    expect(s.hand).toEqual([]);
    expect(s.selfBlindCard).toBe(true);
    const played = applyEvent(s, { type: 'CardPlayed', playerId: 'me', card: c('7C') });
    expect(played.scene.selfBlindCard).toBe(false);
    expect(played.scene.trick).toEqual([
      { playerId: 'me', card: c('7C'), enter: { from: ANCHORS.selfBlind, kind: 'play' }, revealOnLand: true },
    ]);
  });

  it('bids lock on the seat and pass the turn; the last one starts the play', () => {
    const s = scene({
      phase: 'BIDDING',
      seats: view().seats.map((x) => ({ ...x, bid: x.id === 'ze' ? null : 0 })),
      currentPlayerId: 'ze',
    });
    const step = applyEvent(s, { type: 'BidPlaced', playerId: 'ze', bid: 2, bidsSum: 2 });
    expect(seat(step.scene, 'ze')?.bid).toBe(2);
    expect(step.scene.phase).toBe('PLAYING');
    expect(step.scene.currentPlayerId).toBe('me');
    expect(step.fx).toEqual([{ kind: 'bid', playerId: 'ze', bid: 2 }]);
  });

  it('own cards glide from the hand; hidden cards fly from the seat', () => {
    const mine = applyEvent(scene(), { type: 'CardPlayed', playerId: 'me', card: c('9S') });
    expect(mine.scene.hand.map((h) => h.card.id)).toEqual(['5H', 'AD']);
    expect(mine.scene.trick[0]?.enter).toBeUndefined();
    expect(mine.scene.currentPlayerId).toBe('op');

    const theirs = applyEvent(mine.scene, { type: 'CardPlayed', playerId: 'op', card: c('KC') });
    expect(seat(theirs.scene, 'op')?.handCount).toBe(2);
    expect(theirs.scene.trick[1]?.enter).toEqual({ from: ANCHORS.seat('op'), kind: 'play' });
  });

  it('opponents’ blind cards leave their seat', () => {
    const s = scene({
      blind: true,
      handSize: 1,
      me: { id: 'me', hand: null, handCount: 1 },
      seats: view().seats.map((x) => ({
        ...x,
        visibleHand: x.id === 'me' ? null : [c(x.id === 'op' ? 'KC' : '2D')],
      })),
    });
    const step = applyEvent(s, { type: 'CardPlayed', playerId: 'op', card: c('KC') });
    expect(seat(step.scene, 'op')?.visibleHand).toEqual([]);
  });

  it('a won trick is collected by the winner; a tie slides off the table', () => {
    const trick = [
      { playerId: 'me', card: c('9S') },
      { playerId: 'op', card: c('KC') },
      { playerId: 'ze', card: c('2D') },
    ];
    const s = scene({ phase: 'PLAYING', trick });
    const resolved = applyEvent(s, { type: 'TrickResolved', winner: 'op', tiedPlayerIds: [] });
    expect(seat(resolved.scene, 'op')?.tricksWon).toBe(1);
    expect(resolved.scene.trickOutcome).toEqual({ winner: 'op', tiedPlayerIds: [] });
    expect(resolved.scene.currentPlayerId).toBeNull();

    const cleared = applyEvent(resolved.scene, { type: 'TrickCleared', winner: 'op', nextLeaderId: 'op' });
    expect(cleared.scene.trick).toEqual([]);
    expect(cleared.scene.lastTrick).toEqual({ plays: trick, winner: 'op' });
    expect(cleared.scene.currentPlayerId).toBe('op');
    expect(cleared.flights.map((f) => [f.from, f.to])).toEqual(
      trick.map((t) => [ANCHORS.trick(t.playerId), ANCHORS.seat('op')]),
    );

    const last = applyEvent(resolved.scene, { type: 'TrickCleared', winner: 'op', nextLeaderId: null });
    expect(last.scene.phase).toBe('ROUND_SCORED');

    const tie = applyEvent(s, { type: 'TrickCleared', winner: null, nextLeaderId: 'me' });
    expect(tie.flights).toEqual([]);
    expect(tie.scene.clearing?.cards).toEqual(trick);
  });

  it('round scoring shows the summary and adds the points', () => {
    const summary = {
      round: 3,
      handSize: 3,
      value: 2,
      rows: [
        { playerId: 'me', bid: 1, won: 0, failed: true, pointsAdded: 2 },
        { playerId: 'op', bid: 1, won: 1, failed: false, pointsAdded: 0 },
        { playerId: 'ze', bid: 1, won: 2, failed: true, pointsAdded: 2 },
      ],
      carryAfter: 0,
    };
    const step = applyEvent(scene(), { type: 'RoundScored', summary });
    expect(step.scene.summary).toBe(summary);
    expect(step.scene.seats.map((x) => x.points)).toEqual([2, 0, 2]);
    expect(step.scene.history).toEqual([summary]);
  });

  it('a new round resets the table and deals', () => {
    const s = { ...scene({ phase: 'ROUND_SCORED' }), summary: null };
    const started = applyEvent(s, {
      type: 'RoundStarted',
      round: 4,
      handSize: 4,
      value: 1,
      starterId: 'op',
      blind: false,
    });
    expect(started.scene).toMatchObject({
      round: 4,
      handSize: 4,
      dealing: true,
      hand: [],
      currentPlayerId: 'op',
    });
    expect(started.scene.seats.every((x) => x.bid === null && x.handCount === 0)).toBe(true);

    const dealt = applyEvent(started.scene, { type: 'CardsDealt', counts: { me: 4, op: 4, ze: 4 } });
    expect(dealt.flights).toHaveLength(8); // only the hidden hands fly as backs
    expect(dealt.flights.every((f) => f.from === ANCHORS.deck)).toBe(true);
    // The deal keeps running across the commit of the next view.
    expect(sceneFromView('m1', 6, view({ round: 4 }), dealt.scene).dealing).toBe(true);
    expect(dealDurationMs(dealt.scene)).toBeGreaterThan(260);
  });
});

describe('fodinha copy', () => {
  it('compares bids with tricks', () => {
    expect(bidsBalance(1, 3)).toEqual({ text: 'Faltam 2', tone: 'under' });
    expect(bidsBalance(4, 3)).toEqual({ text: 'Excesso de 1', tone: 'over' });
    expect(bidsBalance(3, 3).tone).toBe('even');
  });

  it('colours a bid: on target, short, or failed for good', () => {
    expect(bidTone(1, 1, 2)).toBe('hit');
    expect(bidTone(2, 1, 1)).toBe('short');
    expect(bidTone(1, 2, 0)).toBe('failed');
    expect(bidTone(3, 0, 2)).toBe('failed');
  });
});

describe('table geometry', () => {
  const box = { width: 100, height: 100 };
  const card = { width: 56, height: 78 };

  it('seats opponents clockwise from the viewer’s left, inside the arena', () => {
    const g = tableGeometry({
      arena: { width: 900, height: 500 },
      seatIds: ['a', 'me', 'b', 'c'],
      selfId: 'me',
      seat: box,
      card,
    });
    const at = (id: string) => g.seats.get(id)!;
    const [b, c2, a] = [at('b'), at('c'), at('a')];
    expect(b.x).toBeLessThan(c2.x);
    expect(c2.x).toBeLessThan(a.x);
    for (const p of g.seats.values()) {
      expect(p.x).toBeGreaterThanOrEqual(50);
      expect(p.x).toBeLessThanOrEqual(850);
      expect(p.y).toBeGreaterThanOrEqual(50);
      expect(p.y).toBeLessThanOrEqual(450);
    }
    expect(g.trick.get('me')!.y).toBeGreaterThan(g.center.y);
    expect(g.seatScale).toBe(1);
  });

  it('keeps trick cards clear of their seats', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const g = tableGeometry({
      arena: { width: 1200, height: 520 },
      seatIds: ids,
      selfId: 'p0',
      seat: box,
      card,
    });
    for (const [id, seatPoint] of g.seats) {
      const t = g.trick.get(id)!;
      const clearX = Math.abs(t.x - seatPoint.x) >= (box.width + card.width) / 2;
      const clearY = Math.abs(t.y - seatPoint.y) >= (box.height + card.height) / 2;
      expect(clearX || clearY).toBe(true);
    }
  });

  it('shrinks seats on crowded small screens', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const g = tableGeometry({
      arena: { width: 360, height: 300 },
      seatIds: ids,
      selfId: 'p0',
      seat: box,
      card,
    });
    expect(g.seatScale).toBeLessThan(1);
    expect(g.seatScale).toBeGreaterThanOrEqual(0.7);
  });
});
