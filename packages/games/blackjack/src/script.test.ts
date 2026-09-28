/**
 * `07-GUIAO-DE-SESSAO.md` as an executable test: Ana, Bruno and Carla in seats
 * 1–3 (indexes 0–2), default rules, 1000 chips each, and a shoe stacked with the
 * script's cards in the order they come out. Hints are switched on only to check
 * the advice the script mentions; they change nothing else.
 */
import { SYSTEM_PLAYER_ID } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { Table, eventTypes } from './test-utils';

const PLAYERS = ['ana', 'bruno', 'carla'];

const ROUND_1 = [
  '10S',
  '8D',
  'AH',
  '9S',
  '6H',
  '8C',
  'KC',
  '7D',
  '3C',
  '2S',
  'KH',
  '8H',
  '5D',
  'QS',
  '10D',
  '4C',
];
const ROUND_2 = ['10C', '9S', 'AS', 'AD', '10H', '2D', 'QD', 'KS'];
const ROUND_3 = ['7S', 'AC', '9H', '6H', '5C', '7H', '7C', '10C', '2C', 'KD', 'QH'];

const stacks = (t: Table) => PLAYERS.map((p) => t.stack(p));
const hint = (t: Table, playerId: string) => t.module.getPlayerView(t.state, playerId).hint;

function nextRound(t: Table): void {
  t.nextRound();
  expect(t.state.phase).toBe('BETTING');
}

describe('example session (07-GUIAO-DE-SESSAO)', () => {
  it('plays the three rounds card for card and closes with Carla, Ana, Bruno', () => {
    const t = Table.stacked(PLAYERS, [...ROUND_1, ...ROUND_2, ...ROUND_3], { hintsEnabled: true });
    expect(t.state.config).toMatchObject({
      decks: 6,
      dealerHitsSoft17: false,
      holeCard: 'PEEK',
      maxHands: 4,
    });
    expect(t.state.dealerName).toMatch(/\w+/);

    // ── Round 1: splits, a double and a blackjack ───────────────
    t.bet({ ana: 50, bruno: 100, carla: 20 });
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['9S', '7D']);
    expect(t.hands('carla')[0]?.status).toBe('BLACKJACK');
    expect(t.state.phase).toBe('PLAYER_TURNS'); // 9 up: no insurance, no peek
    expect(t.module.getCurrentPlayer(t.state)).toBe('ana');

    t.play('ana', 'HIT', 'STAND');
    expect(t.hands('ana')[0]?.cards.map((c) => c.id)).toEqual(['10S', '6H', '3C']);

    t.play('bruno', 'SPLIT');
    expect(t.hands('bruno').map((h) => h.cards.map((c) => c.id))).toEqual([['8D', '2S'], ['8C']]);
    t.play('bruno', 'DOUBLE');
    expect(t.hands('bruno')[0]).toMatchObject({ bet: 200, doubled: true, status: 'STOOD' });
    expect(t.hands('bruno')[1]?.cards.map((c) => c.id)).toEqual(['8C', '8H']); // dealt when its turn came
    t.play('bruno', 'SPLIT', 'HIT');
    expect(t.hands('bruno')[1]).toMatchObject({ status: 'BUSTED' });
    expect(t.hands('bruno')[1]?.cards.map((c) => c.id)).toEqual(['8C', '5D', 'QS']);
    expect(t.hands('bruno')[2]?.cards.map((c) => c.id)).toEqual(['8H', '10D']);
    expect(t.stack('bruno')).toBe(1000 - 400); // 200 + 100 + 100 on the felt
    t.play('bruno', 'STAND');

    // Carla has blackjack and does not play: the dealer reveals 7 (16), draws 4 (20) and stands.
    expect(t.state.phase).toBe('SETTLEMENT');
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['9S', '7D', '4C']);
    const settled = t.log.filter((e) => e.type === 'HandSettled');
    expect(settled.map((e) => [e.seatIndex, e.handIndex, e.outcome, e.payout])).toEqual([
      [2, 0, 'BLACKJACK', 50],
      [1, 2, 'LOSE', 0],
      [1, 1, 'LOSE', 0],
      [1, 0, 'PUSH', 200],
      [0, 0, 'LOSE', 0],
    ]);
    expect(stacks(t)).toEqual([950, 800, 1030]);

    // ── Round 2: insurance, even money and a dealer blackjack ───
    nextRound(t);
    t.bet({ ana: 100, bruno: 50, carla: 40 });
    expect(t.state.phase).toBe('INSURANCE');
    expect(t.module.getPendingPlayers(t.state)).toEqual(PLAYERS);
    expect(t.module.getValidActions(t.state, 'carla')).toContainEqual({ type: 'EVEN_MONEY', take: true });
    expect(t.module.getValidActions(t.state, 'ana')).toContainEqual({ type: 'INSURANCE', take: true });
    t.apply({ type: 'INSURANCE', take: true }, 'ana');
    t.apply({ type: 'INSURANCE', take: false }, 'bruno');
    t.apply({ type: 'EVEN_MONEY', take: true }, 'carla');
    expect(t.hands('carla')[0]).toMatchObject({ outcome: 'EVEN_MONEY', payout: 80 });
    expect(t.state.phase).toBe('PEEK');
    const peek = t.system({ type: 'SYS_PEEK' });
    expect(eventTypes(peek.events).slice(0, 2)).toEqual(['DealerPeeked', 'HoleCardRevealed']);
    // The peek ends the round before Bruno could double his 11.
    expect(t.state.phase).toBe('SETTLEMENT');
    expect(t.hands('bruno')[0]?.cards).toHaveLength(2);
    expect(t.state.seats[0]?.insurance).toMatchObject({ amount: 50, payout: 150 });
    expect(stacks(t)).toEqual([950, 750, 1070]);

    // ── Round 3: a soft double and the dealer busts ─────────────
    nextRound(t);
    t.bet({ ana: 20, bruno: 100, carla: 50 });
    expect(hint(t, 'ana')).toBe('STAND'); // 12 vs 6
    t.play('ana', 'STAND');
    expect(hint(t, 'bruno')).toBe('DOUBLE'); // soft 18 vs 6
    t.play('bruno', 'DOUBLE');
    expect(t.hands('bruno')[0]).toMatchObject({ bet: 200, status: 'STOOD' });
    expect(hint(t, 'carla')).toBe('STAND'); // 16 vs 6: she hits anyway
    t.play('carla', 'HIT');
    expect(t.hands('carla')[0]?.status).toBe('BUSTED');
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['6H', '10C', 'QH']);
    expect(t.log.at(-1)?.type).toBe('RoundSettled');
    expect(t.log.some((e) => e.type === 'DealerBusted' && e.total === 26)).toBe(true);
    expect(stacks(t)).toEqual([970, 950, 1020]);

    // ── The host ends the session between rounds ────────────────
    nextRound(t);
    t.system({ type: 'SYS_END_SESSION' });
    expect(t.module.isFinished(t.state)).toBe(true);
    expect(t.module.getResult(t.state)).toEqual({
      standings: [
        { playerId: 'carla', outcome: 'PLACED', position: 1, score: 20 },
        { playerId: 'ana', outcome: 'PLACED', position: 2, score: -30 },
        { playerId: 'bruno', outcome: 'PLACED', position: 3, score: -50 },
      ],
      summary: { rounds: 3 },
    });
    expect(t.module.applyAction(t.state, { type: 'PLACE_BET', amount: 10 }, 'ana').ok).toBe(false);
    expect(t.module.applyAction(t.state, { type: 'SYS_END_SESSION' }, SYSTEM_PLAYER_ID).ok).toBe(false);
  });
});
