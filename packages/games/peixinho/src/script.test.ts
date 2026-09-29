/**
 * `05-GUIAO-DE-PARTIDA.md` as an executable test: Ana, Bruno and Carla
 * (clockwise), 5 cards each, Ana starts, default settings (refill 4, tap the
 * pond — which always draws its top card).
 */
import { describe, expect, it } from 'vitest';
import { Table, eventTypes } from './test-utils';

const HANDS = {
  ana: ['7S', '7H', 'KC', '3D', '9S'],
  bruno: ['7D', 'KH', 'KS', '2C', '5H'],
  carla: ['7C', '3S', '3H', '4H', '9H'],
};
const POND_TOP = ['4C', 'KD', '9D', '2D', '5S', '6C', 'QS', 'JH', '8S', '8H', '10C', 'AS'];

const hands = (t: Table) => ({ ana: t.hand('ana'), bruno: t.hand('bruno'), carla: t.hand('carla') });
const sortIds = (...list: string[]) => [...list].sort();

describe('example match (05-GUIAO-DE-PARTIDA)', () => {
  it('deals 5 cards each and leaves 37 in the pond', () => {
    const t = Table.scripted(HANDS, POND_TOP);
    expect(t.state.pond).toHaveLength(37);
    expect(t.current).toBe('ana');
  });

  it('plays the first four turns exactly as scripted', () => {
    const t = Table.scripted(HANDS, POND_TOP);

    // Turn 1 — Ana.
    expect(t.ask('ana', 'bruno', '7').events).toContainEqual(
      expect.objectContaining({ type: 'CardsGiven', from: 'bruno', to: 'ana', rank: '7' }),
    );
    expect(t.hand('ana')).toEqual(sortIds('7S', '7H', '7D', 'KC', '3D', '9S'));
    const sevens = t.ask('ana', 'carla', '7');
    expect(sevens.events).toContainEqual(expect.objectContaining({ type: 'PeixinhoMade', rank: '7' }));
    expect(t.state.peixinhos.ana).toEqual(['7']);
    expect(t.hand('ana')).toEqual(sortIds('KC', '3D', '9S'));
    expect(t.current).toBe('ana');
    expect(eventTypes(t.ask('ana', 'carla', 'K').events)).toEqual(['Asked', 'GoFish']);
    expect(t.state.awaitingFish).toEqual({ askerId: 'ana', targetId: 'carla', rank: 'K' });
    expect(eventTypes(t.fish().events)).toEqual(['Fished', 'TurnPassed']);
    expect(hands(t)).toEqual({
      ana: sortIds('KC', '3D', '9S', '4C'),
      bruno: sortIds('KH', 'KS', '2C', '5H'),
      carla: sortIds('3S', '3H', '4H', '9H'),
    });
    expect(t.state.pond).toHaveLength(36);

    // Turn 2 — Bruno.
    expect(t.current).toBe('bruno');
    t.ask('bruno', 'ana', 'K');
    t.ask('bruno', 'carla', 'K');
    const caught = t.fish(17);
    expect(caught.events).toContainEqual(
      expect.objectContaining({
        type: 'Fished',
        caughtAsked: true,
        card: { id: 'KD', rank: 'K', suit: 'D' },
      }),
    );
    expect(caught.events).toContainEqual(expect.objectContaining({ type: 'PeixinhoMade', rank: 'K' }));
    expect(t.state.peixinhos.bruno).toEqual(['K']);
    expect(t.current).toBe('bruno');
    t.ask('bruno', 'carla', '5');
    t.fish();
    expect(hands(t)).toEqual({
      ana: sortIds('3D', '9S', '4C'),
      bruno: sortIds('2C', '5H', '9D'),
      carla: sortIds('3S', '3H', '4H', '9H'),
    });
    expect(t.state.pond).toHaveLength(34);

    // Turn 3 — Carla. Ana runs out and draws 4 from the pond straight away.
    expect(t.current).toBe('carla');
    t.ask('carla', 'ana', '3');
    t.ask('carla', 'ana', '9');
    expect(t.hand('ana')).toEqual(['4C']);
    const refill = t.ask('carla', 'ana', '4');
    expect(refill.events).toContainEqual(
      expect.objectContaining({ type: 'Refilled', playerId: 'ana', count: 4 }),
    );
    expect(t.hand('ana')).toEqual(sortIds('2D', '5S', '6C', 'QS'));
    expect(t.current).toBe('carla');
    t.ask('carla', 'bruno', '9');
    t.ask('carla', 'bruno', '3');
    t.fish();
    expect(hands(t)).toEqual({
      ana: sortIds('2D', '5S', '6C', 'QS'),
      bruno: sortIds('2C', '5H'),
      carla: sortIds('3S', '3H', '3D', '4H', '4C', '9H', '9S', '9D', 'JH'),
    });
    expect(t.state.pond).toHaveLength(29);

    // Turn 4 — Ana. Bruno runs out and draws 4.
    expect(t.current).toBe('ana');
    t.ask('ana', 'bruno', '5');
    t.ask('ana', 'bruno', '2');

    expect(hands(t)).toEqual({
      ana: sortIds('2D', '2C', '5S', '5H', '6C', 'QS'),
      bruno: sortIds('8S', '8H', '10C', 'AS'),
      carla: sortIds('3S', '3H', '3D', '4H', '4C', '9H', '9S', '9D', 'JH'),
    });
    expect(t.state.peixinhos).toEqual({ ana: ['7'], bruno: ['K'], carla: [] });
    expect(t.state.pond).toHaveLength(25);
    expect(t.current).toBe('ana');
    const inHands = Object.values(t.state.hands).flat().length;
    expect(inHands + t.state.pond.length + 4 * 2).toBe(52);
  });

  it('keeps the public history of the asks', () => {
    const t = Table.scripted(HANDS, POND_TOP, { tableMemory: 'FULL' });
    t.ask('ana', 'bruno', '7');
    t.ask('ana', 'carla', '7');
    t.ask('ana', 'carla', 'K');
    t.fish();
    const log = t.module.getPlayerView(t.state, 'bruno').askLog;
    expect(log.map((e) => [e.askerId, e.targetId, e.rank, e.result, e.peixinhosMade])).toEqual([
      ['ana', 'bruno', '7', { type: 'GIVEN', count: 1 }, []],
      ['ana', 'carla', '7', { type: 'GIVEN', count: 1 }, ['7']],
      ['ana', 'carla', 'K', { type: 'GO_FISH', caughtAsked: false, pondEmpty: false }, []],
    ]);
  });
});
