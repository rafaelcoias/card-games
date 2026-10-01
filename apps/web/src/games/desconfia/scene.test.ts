import type { DesconfiaView } from '@cardroom/desconfia';
import { parseCardId, type Card } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { claimLine, rankPlural } from './copy';
import { pileSpot } from './layout';
import { ANCHORS, applyEvent, sceneFromView, type Scene } from './scene';
import { verdictCaption } from './table';

const c = (id: string): Card => parseCardId(id) as Card;
const cs = (...ids: string[]) => ids.map(c);

function view(overrides: Partial<DesconfiaView> = {}): DesconfiaView {
  return {
    phase: 'PLAYING',
    selfId: 'me',
    me: { id: 'me', hand: cs('7S', '7H', 'KC', 'JK1') },
    seats: [
      { id: 'me', handCount: 4, finishedPosition: null },
      { id: 'op', handCount: 6, finishedPosition: null },
      { id: 'ze', handCount: 5, finishedPosition: null },
    ],
    currentPlayerId: 'me',
    pileCount: 3,
    claimRank: '9',
    pilePlays: [
      { playId: 4, playerId: 'op', count: 2, claimRank: '9' },
      { playId: 5, playerId: 'ze', count: 1, claimRank: '9' },
    ],
    doubtWindow: { playId: 5, playerId: 'ze', minElapsed: true, lastCard: false },
    lastReveal: null,
    removed: [],
    finishedOrder: [],
    doubtMinWindowMs: 2000,
    lastCardWindowMs: 3000,
    playUntilEnd: false,
    ...overrides,
  };
}

const scene = (overrides: Partial<DesconfiaView> = {}): Scene => sceneFromView('m1', 5, view(overrides));
const seat = (s: Scene, id: string) => s.seats.find((x) => x.id === id);
const steps = (result: ReturnType<typeof applyEvent>) => (Array.isArray(result) ? result : [result]);
const one = (result: ReturnType<typeof applyEvent>) => steps(result)[0]!;

describe('desconfia scene', () => {
  it('mirrors the view: one face-down pile card per card played, keyed by its play', () => {
    const s = scene();
    expect(s.pile.map((p) => p.key)).toEqual(['4:0', '4:1', '5:0']);
    expect(s.pile.every((p) => p.card === null)).toBe(true);
    expect(s.hand.map((h) => h.card.id)).toEqual(['7S', '7H', 'KC', 'JK1']);
  });

  it("an opponent's play slides face down from their seat; the next one waits for the window", () => {
    const next = one(
      applyEvent(scene(), {
        type: 'Played',
        playId: 6,
        playerId: 'op',
        count: 2,
        claimRank: '9',
        lastCard: false,
      }),
    );
    expect(seat(next.scene, 'op')?.handCount).toBe(4);
    expect(next.scene.pile.slice(-2)).toEqual([
      { key: '6:0', playId: 6, card: null, enter: { from: ANCHORS.seat('op'), kind: 'play', delay: 0 } },
      { key: '6:1', playId: 6, card: null, enter: { from: ANCHORS.seat('op'), kind: 'play', delay: 0.05 } },
    ]);
    expect(next.scene.doubtWindow).toEqual({ playId: 6, playerId: 'op', minElapsed: false, lastCard: false });
    expect(next.scene.currentPlayerId).toBe('ze');
    expect(next.fx).toEqual([
      { kind: 'played', playerId: 'op', count: 2, claimRank: '9', lastCard: false, windowMs: 3000 },
    ]);
    const open = one(applyEvent(next.scene, { type: 'WindowMinElapsed', playId: 6, nextPlayerId: 'ze' }));
    expect(open.scene.doubtWindow?.minElapsed).toBe(true);
  });

  it('my own cards glide out of the hand when the table knows what it sent', () => {
    const options = { ownPlay: () => ['7S', 'JK1'], handSize: 'md' as const, pileSize: 'sm' as const };
    const next = one(
      applyEvent(
        scene(),
        { type: 'Played', playId: 6, playerId: 'me', count: 2, claimRank: '9', lastCard: false },
        options,
      ),
    );
    expect(next.scene.hand.map((h) => h.card.id)).toEqual(['7H', 'KC']);
    expect(next.scene.pile.slice(-2).map((p) => [p.key, p.card?.id, p.enter])).toEqual([
      ['6:0', '7S', undefined],
      ['6:1', 'JK1', undefined],
    ]);
    // Without it (a timeout played for me) the cards come from my seat and the view settles the hand.
    const blind = one(
      applyEvent(scene(), {
        type: 'Played',
        playId: 6,
        playerId: 'me',
        count: 1,
        claimRank: '9',
        lastCard: false,
      }),
    );
    expect(blind.scene.hand).toHaveLength(4);
    expect(blind.scene.pile.at(-1)?.enter?.from).toBe(ANCHORS.seat('me'));
  });

  it('a last card leaves nobody on turn', () => {
    const next = one(
      applyEvent(scene(), {
        type: 'Played',
        playId: 6,
        playerId: 'op',
        count: 1,
        claimRank: '9',
        lastCard: true,
      }),
    );
    expect(next.scene.currentPlayerId).toBeNull();
    expect(next.scene.doubtWindow?.lastCard).toBe(true);
  });

  it('a doubt hides the buttons; the reveal lifts, turns over and stamps the play', () => {
    const doubted = one(
      applyEvent(scene(), { type: 'DoubtCalled', playId: 5, doubterId: 'me', authorId: 'ze' }),
    );
    expect(doubted.scene.doubtWindow).toBeNull();
    expect(doubted.fx).toEqual([{ kind: 'doubt', doubterId: 'me', authorId: 'ze' }]);
    const [lift, flip, stamp] = steps(
      applyEvent(doubted.scene, {
        type: 'Revealed',
        playId: 5,
        authorId: 'ze',
        doubterId: 'me',
        claimRank: '9',
        cards: cs('3D'),
        truthful: false,
      }),
    );
    expect(lift?.scene.pile.map((p) => p.key)).toEqual(['4:0', '4:1']);
    expect(lift?.scene.reveal).toMatchObject({
      stage: 'lift',
      truthful: false,
      cards: [{ key: '5:0', layoutId: 'pile-5:0' }],
    });
    expect(flip?.scene.reveal?.stage).toBe('flip');
    expect(stamp?.scene.reveal?.stage).toBe('stamp');
    expect(stamp?.fx).toEqual([{ kind: 'verdict', truthful: false, authorId: 'ze', doubterId: 'me' }]);
  });

  it('the pile flies to the loser; mine arrives with the view, from the pile', () => {
    const toOp = one(applyEvent(scene(), { type: 'PileTaken', playerId: 'op', count: 3 }));
    expect(seat(toOp.scene, 'op')?.handCount).toBe(9);
    expect(toOp.scene).toMatchObject({ pile: [], pilePlays: [], claimRank: null, doubtWindow: null });
    expect(toOp.flights).toHaveLength(3);
    const toMe = one(applyEvent(scene(), { type: 'PileTaken', playerId: 'me', count: 3 }));
    expect(toMe.scene.incoming).toEqual([ANCHORS.pile, ANCHORS.pile, ANCHORS.pile]);
    const committed = sceneFromView(
      'm1',
      6,
      view({
        me: { id: 'me', hand: cs('7S', '7H', 'KC', 'JK1', '2S', '3S', '4S') },
        pilePlays: [],
        claimRank: null,
      }),
      toMe.scene,
    );
    expect(committed.hand.filter((h) => h.enter).map((h) => h.enter?.from)).toEqual([
      ANCHORS.pile,
      ANCHORS.pile,
      ANCHORS.pile,
    ]);
    expect(committed.incoming).toEqual([]);
  });

  it('a peixinho fans out in the middle, then leaves the game', () => {
    const base = { ...scene(), incoming: [ANCHORS.pile, ANCHORS.pile] };
    const [fan, gone] = steps(
      applyEvent(base, {
        type: 'PeixinhoRemoved',
        playerId: 'me',
        rank: '7',
        cards: cs('7S', '7H', '7D', '7C'),
      }),
    );
    expect(fan?.scene.hand.map((h) => h.card.id)).toEqual(['KC', 'JK1']);
    expect(fan?.scene.showcase?.cards.map((h) => h.enter?.from ?? 'hand')).toEqual([
      'hand',
      'hand',
      ANCHORS.pile,
      ANCHORS.pile,
    ]);
    expect(fan?.scene.incoming).toEqual([]);
    expect(gone?.scene.showcase).toBeNull();
    expect(gone?.scene.removed).toEqual([{ rank: '7', playerId: 'me' }]);
    expect(gone?.flights.every((f) => f.to === ANCHORS.removed)).toBe(true);
  });

  it('new pile, turn passed, a winner and the end', () => {
    expect(one(applyEvent(scene(), { type: 'NewPile', starterId: 'op' })).scene).toMatchObject({
      currentPlayerId: 'op',
      claimRank: null,
    });
    expect(one(applyEvent(scene(), { type: 'TurnPassed', to: 'ze' })).scene.currentPlayerId).toBe('ze');
    const won = one(applyEvent(scene(), { type: 'PlayerWon', playerId: 'op', position: 1 }));
    expect(seat(won.scene, 'op')?.finishedPosition).toBe(1);
    expect(won.scene.finishedOrder).toEqual(['op']);
    const end = one(applyEvent(scene(), { type: 'GameFinished', finishedOrder: ['op'], handCounts: {} }));
    expect(end.scene).toMatchObject({ phase: 'FINISHED', currentPlayerId: null });
  });
});

describe('desconfia copy and layout', () => {
  it('announces plays the way people speak', () => {
    expect(claimLine(3, '7')).toBe('Três Setes');
    expect(claimLine(1, 'K')).toBe('Um Rei');
    expect(claimLine(1, 'A')).toBe('Um Ás');
    expect(claimLine(1, 'Q')).toBe('Uma Dama');
    expect(claimLine(2, 'Q')).toBe('Duas Damas');
    expect(claimLine(14, '2')).toBe('14 Doises');
    expect(rankPlural('10')).toBe('Dezes');
  });

  it('says who was right and who starts', () => {
    const names = (id: string) => ({ ana: 'Ana', carla: 'Carla' })[id] ?? id;
    expect(verdictCaption(false, 'ana', 'carla', 'me', names)).toBe(
      'Carla acertou — era mentira. Recomeça Carla.',
    );
    expect(verdictCaption(true, 'ana', 'carla', 'me', names)).toBe(
      'Carla errou — era verdade. Recomeça Ana.',
    );
    expect(verdictCaption(false, 'ana', 'me', 'me', names)).toBe('Acertaste — era mentira! Recomeças tu.');
    expect(verdictCaption(true, 'me', 'carla', 'me', names)).toBe('Carla errou — era verdade. Recomeças tu.');
  });

  it('lays the pile the same way everywhere', () => {
    expect(pileSpot('m1', '4:0', 30)).toEqual(pileSpot('m1', '4:0', 30));
    expect(pileSpot('m1', '4:0', 30)).not.toEqual(pileSpot('m1', '4:1', 30));
    expect(Math.abs(pileSpot('m1', '9:2', 30).rotate)).toBeLessThanOrEqual(40);
  });
});
