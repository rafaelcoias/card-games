/**
 * `05-GUIAO-DE-PARTIDA.md` as an executable test: Ana, Bruno and Carla
 * (clockwise) with a reduced deck of 17 cards and one joker. The doubt window
 * is driven by the system actions the server would apply on its own.
 */
import { describe, expect, it } from 'vitest';
import { Table, eventTypes } from './test-utils';

const HANDS = {
  ana: ['3C', '3H', '7S', '7D', 'KS', 'JK1'],
  bruno: ['3D', '7H', '9C', '9D', 'QH'],
  carla: ['3S', '7C', '9H', 'KD', 'KH', 'QS'],
};

const ids = (...list: string[]) => [...list].sort();
const counts = (t: Table) => [t.hand('ana').length, t.hand('bruno').length, t.hand('carla').length];

/** Plays 1–8 of the script and checks every table in it. */
function playUpToTurn9(): Table {
  const t = Table.scripted(HANDS);
  expect(t.current).toBe('ana'); // she has the 3 of clubs

  // 1 — Ana: "Dois Treses" (true). Nobody doubts.
  t.play('ana', ['3C', '3H'], '3');
  expect(t.state.claimRank).toBe('3');

  // 2 — Bruno: "Dois Treses" with 3♦ 9♣ (a lie). Carla doubts: Bruno takes the pile.
  t.play('bruno', ['3D', '9C'], '3');
  const lie = t.doubt('carla');
  expect(eventTypes(lie.events)).toEqual(['DoubtCalled', 'Revealed', 'PileTaken', 'NewPile']);
  expect(lie.events).toContainEqual(expect.objectContaining({ type: 'Revealed', truthful: false }));
  expect(t.hand('bruno')).toEqual(ids('7H', '9D', 'QH', '3C', '3H', '3D', '9C'));
  expect(counts(t)).toEqual([4, 7, 6]);
  expect(t.state.removed).toEqual([]); // three threes only
  expect(t.state.claimRank).toBeNull();
  expect(t.current).toBe('carla');

  // 3 — Carla: "Dois Reis" (true). Bruno doubts and takes the pile; Carla starts again.
  t.play('carla', ['KD', 'KH'], 'K');
  t.doubt('bruno');
  expect(t.state.lastReveal).toMatchObject({ truthful: true, loserId: 'bruno', winnerId: 'carla' });
  expect(t.current).toBe('carla');

  // 4 — Carla: "Dois Noves" with 9♥ Q♠ (a lie). Nobody doubts.
  t.play('carla', ['9H', 'QS'], '9');

  // 5 — Ana has no nine: the joker, "Um Nove", is true. Bruno doubts and takes the 3 cards.
  t.play('ana', ['JK1'], '9');
  t.doubt('bruno');
  expect(t.state.lastReveal).toMatchObject({ truthful: true, cards: [{ id: 'JK1' }] });
  expect(t.hand('ana')).toEqual(ids('7S', '7D', 'KS'));
  expect(t.hand('bruno')).toEqual(
    ids('7H', '9D', 'QH', '3C', '3H', '3D', '9C', 'KD', 'KH', '9H', 'QS', 'JK1'),
  );
  expect(t.hand('carla')).toEqual(ids('3S', '7C'));
  expect(t.current).toBe('ana');

  // 6–7 — "Dois Setes" and "Um Sete", both true; nobody doubts.
  t.play('ana', ['7S', '7D'], '7');
  t.play('bruno', ['7H'], '7');

  // 8 — Carla: 3♠ as "Um Sete" (a lie). Ana doubts: Carla takes 4 and lays down the sevens.
  t.play('carla', ['3S'], '7');
  const peixinho = t.doubt('ana');
  expect(peixinho.events).toContainEqual(
    expect.objectContaining({ type: 'PeixinhoRemoved', playerId: 'carla', rank: '7' }),
  );
  expect(t.hand('carla')).toEqual(['3S']);
  expect(t.state.removed).toEqual([{ rank: '7', playerId: 'carla' }]);
  expect(t.current).toBe('ana');
  expect(t.hand('ana')).toEqual(['KS']);
  expect(t.hand('bruno')).toHaveLength(11);
  return t;
}

describe('example match (05-GUIAO-DE-PARTIDA)', () => {
  it('plays the script to Ana winning on a doubted, true last card', () => {
    const t = playUpToTurn9();

    // 9 — Ana's last card, "Um Rei" (true): a 3 s window. Bruno doubts, it holds: Ana wins.
    const last = t.play('ana', ['KS'], 'K');
    expect(last.events).toContainEqual(expect.objectContaining({ type: 'Played', lastCard: true }));
    expect(last.schedule).toEqual([
      { action: { type: 'SYS_LAST_CARD_WINDOW_CLOSED', playId: 9 }, delayMs: 3000 },
    ]);
    expect(t.current).toBeNull();
    const end = t.doubt('bruno');
    expect(eventTypes(end.events)).toEqual([
      'DoubtCalled',
      'Revealed',
      'PileTaken',
      'PlayerWon',
      'GameFinished',
    ]);
    expect(t.state.phase).toBe('FINISHED');
    expect(counts(t)).toEqual([0, 12, 1]);
    expect(t.state.removed).toHaveLength(1);
    expect(0 + 12 + 1 + 4).toBe(17);
    expect(t.module.getResult(t.state).standings).toEqual([
      { playerId: 'ana', position: 1, outcome: 'WINNER', score: 0 },
      { playerId: 'carla', position: 2, outcome: 'PLACED', score: 1 },
      { playerId: 'bruno', position: 3, outcome: 'PLACED', score: 12 },
    ]);
  });

  it('variant: a lie on the last card is caught, Ana takes the pile and the game goes on', () => {
    const t = playUpToTurn9();
    // Ana opens the new pile with her king claimed as "Um Sete" (a lie).
    t.play('ana', ['KS'], '7');
    t.doubt('bruno');
    expect(t.state.phase).toBe('PLAYING');
    expect(t.hand('ana')).toEqual(['KS']);
    expect(t.current).toBe('bruno');
    expect(t.state.finishedOrder).toEqual([]);
  });
});
