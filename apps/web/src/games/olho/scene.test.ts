import { parseCardId, type Card } from '@cardroom/game-core';
import type { OlhoView } from '@cardroom/olho';
import { describe, expect, it } from 'vitest';
import { comboName, comboWithArticle, oneOf, playLabel, trickKind } from './copy';
import { ANCHORS, applyEvent, dealDurationMs, nextInTrick, sceneFromView, type Scene } from './scene';
import { fittedSize } from './self-area';
import { closedCaption } from './table';

const c = (id: string): Card => parseCardId(id) as Card;
const cs = (...ids: string[]) => ids.map(c);

const RULES = {
  allowFinishWithPower: true,
  fourOfAKindCuts: true,
  sameCardEscape: true,
  firstTrickNoPower: true,
  turnTimeoutMs: 30_000,
  escapeTimeoutMs: 5_000,
  exchangeTimeoutMs: 20_000,
};

const seat = (id: string, handCount: number, seatIndex: number) => ({
  id,
  seatIndex,
  handCount,
  role: null,
  points: 0,
  passed: false,
  finishedPosition: null,
  blocked: false,
  leaving: false,
});

function view(overrides: Partial<OlhoView> = {}): OlhoView {
  return {
    phase: 'PLAYING',
    displayName: 'Olho',
    rules: RULES,
    selfId: 'me',
    gameNumber: 2,
    gamesCompleted: 1,
    me: { id: 'me', hand: cs('7S', '7H', 'KC', 'JK1'), role: 'PRESIDENTE', waiting: false },
    seats: [seat('me', 4, 0), seat('op', 6, 1), seat('ze', 5, 2)],
    waiting: [],
    currentPlayerId: 'op',
    trick: {
      number: 3,
      isFirstOfGame: false,
      leaderId: 'ze',
      count: 1,
      topRank: '9',
      plays: [{ playerId: 'ze', cards: cs('9D'), escape: false }],
      passed: [],
      sameRankRun: { rank: '9', cards: 1 },
      skip: null,
      lastPlayerId: 'ze',
      closing: null,
    },
    discardCount: 10,
    skipPrompt: null,
    exchange: null,
    lastGame: null,
    session: [],
    ...overrides,
  };
}

const scene = (overrides: Partial<OlhoView> = {}): Scene => sceneFromView('m1', 7, view(overrides));
const one = (result: ReturnType<typeof applyEvent>) => (Array.isArray(result) ? result[0]! : result);
const seatOf = (s: Scene, id: string) => s.seats.find((x) => x.id === id);

describe('olho scene', () => {
  it('mirrors the view, keying plays by game, trick and place', () => {
    const s = scene();
    expect(s.trick.plays.map((p) => p.key)).toEqual(['2:3:0']);
    expect(s.hand.map((h) => h.card.id)).toEqual(['7S', '7H', 'KC', 'JK1']);
    expect(s.dealing).toBe(false);
  });

  it("an opponent's play flies in from their seat; the turn moves on", () => {
    const next = one(applyEvent(scene(), { type: 'Played', playerId: 'op', cards: cs('10S') }));
    expect(seatOf(next.scene, 'op')?.handCount).toBe(5);
    expect(next.scene.trick.plays.at(-1)).toMatchObject({
      key: '2:3:1',
      playerId: 'op',
      enter: { from: ANCHORS.seat('op'), kind: 'play' },
    });
    expect(next.scene.trick).toMatchObject({ count: 1, topRank: '10', lastPlayerId: 'op' });
    expect(next.scene.currentPlayerId).toBe('ze');
    expect(next.fx).toEqual([{ kind: 'played', playerId: 'op', rank: '10', count: 1, escape: false }]);
  });

  it('my own cards leave the hand (they glide by layout id)', () => {
    const next = one(applyEvent(scene(), { type: 'Played', playerId: 'me', cards: cs('7S', '7H') }));
    expect(next.scene.hand.map((h) => h.card.id)).toEqual(['KC', 'JK1']);
    expect(next.scene.trick.plays.at(-1)?.enter).toBeUndefined();
    expect(next.scene.trick.sameRankRun).toEqual({ rank: '7', cards: 2 });
  });

  it('marks passes and skips, and guesses who is next', () => {
    const passed = one(applyEvent(scene(), { type: 'Passed', playerId: 'op' }));
    expect(seatOf(passed.scene, 'op')?.passed).toBe(true);
    expect(passed.scene.currentPlayerId).toBeNull(); // back to Zé, who played last
    const pending = one(applyEvent(scene(), { type: 'SkipPending', targetId: 'op', rank: '9', count: 1 }));
    expect(pending.scene.trick.skip).toEqual({ targetId: 'op', rank: '9', count: 1 });
    const skipped = one(applyEvent(pending.scene, { type: 'Skipped', playerId: 'op' }));
    expect(skipped.scene.trick.skip).toBeNull();
    expect(skipped.waitMs).toBe(700);
    expect(nextInTrick(scene(), 'ze')).toBe('me');
  });

  it('closes, then clears the trick into the discard pile', () => {
    const closed = one(
      applyEvent(scene(), { type: 'TrickClosed', winnerId: 'ze', leaderId: 'ze', reason: 'ALL_PASSED' }),
    );
    expect(closed.scene.trick.closing).toEqual({ reason: 'ALL_PASSED', winnerId: 'ze' });
    expect(closed.fx[0]).toMatchObject({ kind: 'closed', last: { rank: '9', count: 1 } });
    const cleared = one(applyEvent(closed.scene, { type: 'TrickCleared', number: 4, leaderId: 'ze' }));
    expect(cleared.scene.trick).toMatchObject({ number: 4, plays: [], count: null, closing: null });
    expect(cleared.scene.clearing?.plays).toHaveLength(1);
    expect(cleared.scene.discardCount).toBe(11);
    expect(cleared.scene.currentPlayerId).toBe('ze');
  });

  it('deals a new game: backs fly to the others, my cards deal themselves on mount', () => {
    const next = one(
      applyEvent(scene(), {
        type: 'GameDealt',
        gameNumber: 3,
        counts: { me: 18, op: 18, ze: 18 },
        leaderId: null,
        exchange: [{ giver: 'ze', receiver: 'me', count: 2 }],
      }),
    );
    expect(next.scene).toMatchObject({
      phase: 'EXCHANGE',
      gameNumber: 3,
      dealing: true,
      hand: [],
      discardCount: 0,
    });
    expect(next.flights).toHaveLength(36);
    expect(next.flights.every((f) => f.from === ANCHORS.deck && f.kind === 'deal')).toBe(true);
    expect(next.scene.clearing?.plays).toHaveLength(1);
    expect(dealDurationMs(next.scene)).toBeGreaterThan(1000);
    expect(dealDurationMs(next.scene)).toBeLessThan(2000);
  });

  it('flies my best cards to the Presidente face up, and brings back what they return', () => {
    const exchange = {
      stage: 'DEALT' as const,
      pairs: [{ giver: 'me', receiver: 'op', count: 2, returned: false }],
      mine: {
        side: 'GIVER' as const,
        partnerId: 'op',
        count: 2,
        given: cs('JK1', 'KC'),
        returned: null,
        mustReturn: false,
      },
    };
    const given = one(
      applyEvent(scene({ phase: 'EXCHANGE', exchange }), {
        type: 'ExchangeGiven',
        giver: 'me',
        receiver: 'op',
        count: 2,
      }),
    );
    expect(given.scene.hand.map((h) => h.card.id)).toEqual(['7S', '7H']);
    expect(given.flights.map((f) => f.cardId)).toEqual(['KC', 'JK1']);
    expect(seatOf(given.scene, 'op')?.handCount).toBe(8);
    const back = one(
      applyEvent(given.scene, {
        type: 'ExchangeReturned',
        giver: 'me',
        receiver: 'op',
        count: 2,
        auto: false,
      }),
    );
    expect(back.scene.incoming).toEqual([ANCHORS.seat('op'), ANCHORS.seat('op')]);
    const committed = sceneFromView(
      'm1',
      8,
      view({ me: { id: 'me', hand: cs('3C', '4D', '7S', '7H'), role: 'PRESIDENTE', waiting: false } }),
      back.scene,
    );
    expect(committed.hand.filter((h) => h.enter?.from === ANCHORS.seat('op'))).toHaveLength(2);
  });

  it('remembers the cards I gave back, or works out the lowest ones on a timeout', () => {
    const base = scene({ phase: 'EXCHANGE' });
    const mine = one(
      applyEvent(
        base,
        { type: 'ExchangeReturned', giver: 'op', receiver: 'me', count: 2, auto: false },
        { ownReturn: () => ['KC', 'JK1'], handSize: 'md', trickSize: 'sm' },
      ),
    );
    expect(mine.scene.hand.map((h) => h.card.id)).toEqual(['7S', '7H']);
    const auto = one(
      applyEvent(base, { type: 'ExchangeReturned', giver: 'op', receiver: 'me', count: 2, auto: true }),
    );
    expect(auto.flights.map((f) => f.cardId).sort()).toEqual(['7H', '7S']);
  });

  it('ends a game with the new roles and points on the seats', () => {
    const summary = {
      gameNumber: 2,
      order: ['ze', 'me', 'op'],
      roles: { ze: 'PRESIDENTE', me: 'NEUTRO', op: 'OLHO' } as const,
      pointsDelta: { ze: 2, me: 0, op: -2 },
    };
    const next = one(applyEvent(scene(), { type: 'GameEnded', summary, points: { ze: 4, me: 1, op: -5 } }));
    expect(next.scene.phase).toBe('GAME_SUMMARY');
    expect(seatOf(next.scene, 'ze')).toMatchObject({ role: 'PRESIDENTE', points: 4, finishedPosition: 1 });
    expect(next.scene.me?.role).toBe('NEUTRO');
  });

  it('seats newcomers in the waiting list and removes whoever left', () => {
    const joined = one(applyEvent(scene(), { type: 'PlayerJoined', playerId: 'new', seatIndex: 5 }));
    expect(joined.scene.waiting).toEqual(['new']);
    const leaving = one(applyEvent(scene(), { type: 'PlayerLeaving', playerId: 'op', position: 3 }));
    expect(seatOf(leaving.scene, 'op')).toMatchObject({ leaving: true, finishedPosition: 3 });
    const left = one(applyEvent(leaving.scene, { type: 'PlayerLeft', playerId: 'op' }));
    expect(seatOf(left.scene, 'op')).toBeUndefined();
  });
});

describe('olho copy', () => {
  it('names combinations and the play button', () => {
    expect(comboName('7', 2)).toBe('par de 7');
    expect(comboName('K', 3)).toBe('tripla de Reis');
    expect(comboWithArticle('Q', 1)).toBe('a Dama');
    expect(comboWithArticle('A', 2)).toBe('o par de Ases');
    expect(oneOf('Q')).toBe('uma Dama');
    expect(trickKind(2)).toBe('Pares');
    expect(playLabel({ count: 2, topRank: 'K' }, '2', 1)).toBe('Cortar o par com um 2');
    expect(playLabel({ count: 3, topRank: '8' }, '2', 2)).toBe('Cortar a tripla com dois 2');
    expect(playLabel({ count: 1, topRank: '2' }, '2', 2)).toBe('Bater com dois 2');
    expect(playLabel({ count: 1, topRank: '9' }, 'JOKER', 1)).toBe('Cortar com o Joker');
    expect(playLabel({ count: null, topRank: null }, '5', 4)).toBe('Jogar quatro 5 — corta!');
    expect(playLabel({ count: 2, topRank: '7' }, '7', 2)).toBe('Jogar par de 7');
  });

  it('reads a closed trick from the viewer’s side', () => {
    const names = (id: string) => (id === 'me' ? 'Tu' : id);
    const base = { kind: 'closed' as const, last: { rank: 'K' as const, count: 1 } };
    expect(
      closedCaption({ ...base, winnerId: 'bruno', leaderId: 'bruno', reason: 'ALL_PASSED' }, 'me', names),
    ).toBe('Ninguém bateu o Rei de bruno. Abre bruno.');
    expect(closedCaption({ ...base, winnerId: 'me', leaderId: 'me', reason: 'JOKER' }, 'me', names)).toBe(
      'Cortaste! Abres tu.',
    );
    expect(closedCaption({ ...base, winnerId: 'ana', leaderId: 'carla', reason: 'QUAD' }, 'me', names)).toBe(
      'ana corta. Abre carla.',
    );
  });

  it('fits a big hand by shrinking its cards instead of scrolling', () => {
    expect(fittedSize('lg', 6, 1200)).toBe('lg');
    expect(fittedSize('md', 15, 354)).toBe('ms');
    expect(fittedSize('md', 40, 200)).toBe('sm');
    expect(fittedSize('md', 15, undefined)).toBe('md');
  });
});
