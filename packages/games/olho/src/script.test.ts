/**
 * `05-GUIAO-DE-SESSAO.md` as an executable test: Ana, Bruno, Carla and Duarte
 * (clockwise) play two games with a reduced deck of 12 cards, the second one
 * after the exchange of cards, and the host ends the session. The pauses
 * (trick clearing, next game, the exchange) are the system actions the server
 * would apply on its own.
 */
import { describe, expect, it } from 'vitest';
import { Table, eventTypes } from './test-utils';

const GAME_1 = {
  ana: ['3C', '7S', '2H'],
  bruno: ['7H', '9D', 'KS'],
  carla: ['5C', '7D', 'JK1'],
  duarte: ['4D', '7C', 'QH'],
};

const GAME_2 = {
  ana: ['3H', '6D', '8C'],
  bruno: ['2S', '9C', '5H'],
  carla: ['10D', 'JS', '3D'],
  duarte: ['JK1', 'AS', '4C'],
};

const ids = (...list: string[]) => [...list].sort();

/** Trick 1 of game 1, up to the third seven. */
function sevens(cfg: Parameters<typeof Table.scripted>[1] = {}): Table {
  const t = Table.scripted([GAME_1, GAME_2], cfg);
  expect(t.state.phase).toBe('PLAYING');
  expect(t.current).toBe('ana'); // she holds the 3♣
  expect(t.state.trick.isFirstOfGame).toBe(true);
  t.play('ana', '3C');
  t.play('bruno', '7H');
  return t;
}

describe('example session (05-GUIAO-DE-SESSAO)', () => {
  it('plays both games, with the exchange, and ends with the points of the script', () => {
    const t = sevens();

    // Trick 1 — skips, escapes and four sevens in a row.
    const equal = t.play('carla', '7D');
    expect(equal.events).toContainEqual({ type: 'SkipPending', targetId: 'duarte', rank: '7', count: 1 });
    expect(t.module.getPlayerView(t.state, 'duarte').skipPrompt).toEqual({ rank: '7', count: 1 });
    expect(t.module.getPlayerView(t.state, 'ana').skipPrompt).toBeNull();
    const escaped = t.escape('duarte', '7C');
    expect(escaped.events).toContainEqual({ type: 'SkipPending', targetId: 'ana', rank: '7', count: 1 });
    const cut = t.escape('ana', '7S');
    expect(eventTypes(cut.events)).toEqual(['Escaped', 'Cut', 'TrickClosed']);
    expect(cut.events).toContainEqual({ type: 'Cut', playerId: 'ana', reason: 'FOUR_IN_A_ROW' });
    expect(cut.schedule).toEqual([{ action: { type: 'SYS_CLOSE_TRICK' }, delayMs: 1500 }]);
    expect(t.current).toBeNull();
    t.clear();
    expect(t.current).toBe('ana');
    expect([t.hand('ana'), t.hand('bruno'), t.hand('carla'), t.hand('duarte')]).toEqual([
      ['2H'],
      ids('9D', 'KS'),
      ids('5C', 'JK1'),
      ids('4D', 'QH'),
    ]);

    // Trick 2 — finishing with a 2, a joker cuts.
    const two = t.play('ana', '2H');
    expect(two.events).toContainEqual({ type: 'PlayerFinished', playerId: 'ana', position: 1 });
    t.pass('bruno');
    const joker = t.play('carla', 'JK1');
    expect(joker.events).toContainEqual({ type: 'Cut', playerId: 'carla', reason: 'JOKER' });
    t.clear();

    // Trick 3 — nobody beats Bruno's king.
    t.play('carla', '5C');
    expect(t.state.finishOrder).toEqual(['ana', 'carla']);
    t.play('duarte', 'QH');
    t.play('bruno', 'KS');
    const closed = t.pass('duarte');
    expect(closed.events).toContainEqual({
      type: 'TrickClosed',
      winnerId: 'bruno',
      leaderId: 'bruno',
      reason: 'ALL_PASSED',
    });
    t.clear();
    expect(t.current).toBe('bruno');

    // Trick 4 — Bruno goes out, Duarte is the Olho.
    const end = t.play('bruno', '9D');
    expect(eventTypes(end.events)).toEqual(['Played', 'PlayerFinished', 'GameEnded']);
    expect(t.state.phase).toBe('GAME_SUMMARY');
    expect(t.state.lastGame).toEqual({
      gameNumber: 1,
      order: ['ana', 'carla', 'bruno', 'duarte'],
      roles: { ana: 'PRESIDENTE', carla: 'VICE_PRESIDENTE', bruno: 'VICE_OLHO', duarte: 'OLHO' },
      pointsDelta: { ana: 2, carla: 1, bruno: -1, duarte: -2 },
    });
    expect(end.schedule).toEqual([{ action: { type: 'SYS_NEXT_GAME' }, delayMs: 4500 }]);

    // Game 2 — the deal, then the exchange (both pairs at once).
    const dealt = t.runScheduled();
    expect(dealt.events).toEqual([
      {
        type: 'GameDealt',
        gameNumber: 2,
        counts: { ana: 3, bruno: 3, carla: 3, duarte: 3 },
        leaderId: null,
        exchange: [
          { giver: 'duarte', receiver: 'ana', count: 2 },
          { giver: 'bruno', receiver: 'carla', count: 1 },
        ],
      },
    ]);
    expect(t.state.phase).toBe('EXCHANGE');
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    const given = t.runScheduled();
    expect(eventTypes(given.events)).toEqual(['ExchangeGiven', 'ExchangeGiven']);
    expect(t.hand('ana')).toEqual(ids('3H', '6D', '8C', 'JK1', 'AS'));
    expect(t.hand('carla')).toEqual(ids('10D', 'JS', '3D', '2S'));
    expect(t.module.getPendingPlayers(t.state)).toEqual(['ana', 'carla']);
    expect(t.module.getTimeoutMs(t.state)).toBe(20_000);
    expect(t.module.getCurrentPlayer(t.state)).toBeNull();

    t.giveBack('ana', '3H', '6D');
    expect(t.state.phase).toBe('EXCHANGE');
    expect(t.module.getPendingPlayers(t.state)).toEqual(['carla']);
    const done = t.giveBack('carla', '3D');
    expect(done.events.at(-1)).toEqual({ type: 'ExchangeDone', leaderId: 'duarte' });
    expect([t.hand('ana'), t.hand('bruno'), t.hand('carla'), t.hand('duarte')]).toEqual([
      ids('8C', 'JK1', 'AS'),
      ids('9C', '5H', '3D'),
      ids('10D', 'JS', '2S'),
      ids('4C', '3H', '6D'),
    ]);

    // Trick 1 — the Olho opens; no 2 nor joker in the first trick.
    expect(t.current).toBe('duarte');
    t.play('duarte', '3H');
    t.play('ana', '8C');
    t.play('bruno', '9C');
    t.play('carla', '10D');
    t.pass('duarte');
    expect(t.try({ type: 'PLAY', cardIds: ['JK1'] }, 'ana')).toMatchObject({
      ok: false,
      error: { code: 'POWER_FIRST_TRICK' },
    });
    t.play('ana', 'AS');
    t.pass('bruno');
    expect(t.try({ type: 'PLAY', cardIds: ['2S'] }, 'carla')).toMatchObject({
      ok: false,
      error: { code: 'POWER_FIRST_TRICK' },
    });
    expect(t.try({ type: 'PLAY', cardIds: ['JS'] }, 'carla')).toMatchObject({
      ok: false,
      error: { code: 'TOO_LOW' },
    });
    t.pass('carla');
    t.clear();

    // Trick 2 — Ana's joker ends her hand and cuts: Bruno opens instead.
    t.play('ana', 'JK1');
    expect(t.state.finishOrder).toEqual(['ana']);
    t.clear();
    expect(t.current).toBe('bruno');

    // Trick 3.
    t.play('bruno', '3D');
    t.play('carla', 'JS');
    t.pass('duarte');
    t.pass('bruno');
    t.clear();
    expect(t.current).toBe('carla');

    // Trick 4 — Carla's 2 ends her hand; Duarte opens next.
    t.play('carla', '2S');
    t.pass('duarte');
    t.pass('bruno');
    t.clear();
    expect(t.current).toBe('duarte');

    // Trick 5.
    t.play('duarte', '4C');
    t.play('bruno', '5H');
    expect(t.state.lastGame?.order).toEqual(['ana', 'carla', 'bruno', 'duarte']);

    // The host ends the session.
    const finished = t.system({ type: 'SYS_END_SESSION' });
    expect(finished.events).toEqual([{ type: 'SessionFinished', games: 2 }]);
    expect(t.module.isFinished(t.state)).toBe(true);
    expect(t.module.getResult(t.state)).toEqual({
      standings: [
        { playerId: 'ana', position: 1, outcome: 'WINNER', score: 4 },
        { playerId: 'carla', position: 2, outcome: 'PLACED', score: 2 },
        { playerId: 'bruno', position: 3, outcome: 'PLACED', score: -2 },
        { playerId: 'duarte', position: 4, outcome: 'LOSER', score: -4 },
      ],
      summary: { games: 2 },
    });
  });

  it('variant sameCardEscape = false: Duarte is skipped even holding the 7♣', () => {
    const t = sevens({ sameCardEscape: false });
    const skipped = t.play('carla', '7D');
    expect(skipped.events).toContainEqual({ type: 'Skipped', playerId: 'duarte' });
    expect(t.current).toBe('ana');
    expect(t.state.trick.passed).toEqual([]);
  });

  it('variant fourOfAKindCuts = false: the four sevens do not cut, Bruno is skipped and Carla plays', () => {
    const t = sevens({ fourOfAKindCuts: false });
    t.play('carla', '7D');
    t.escape('duarte', '7C');
    const four = t.escape('ana', '7S');
    expect(eventTypes(four.events)).toEqual(['Escaped', 'Skipped']);
    expect(four.events).toContainEqual({ type: 'Skipped', playerId: 'bruno' });
    expect(t.current).toBe('carla');
    expect(t.state.trick.closing).toBeNull();
  });

  it('variant allowFinishWithPower = false: Ana is left with the 2♥, blocked, and Bruno opens', () => {
    const t = sevens({ allowFinishWithPower: false });
    t.play('carla', '7D');
    t.escape('duarte', '7C');
    const cut = t.escape('ana', '7S');
    expect(cut.events).toContainEqual({ type: 'PlayerBlocked', playerId: 'ana' });
    t.clear();
    expect(t.current).toBe('bruno');
    expect(t.module.getPlayerView(t.state, 'bruno').seats[0]).toMatchObject({ id: 'ana', blocked: true });

    // She is passed over every time from now on; the others play the game out.
    t.play('bruno', '9D');
    t.play('carla', 'JK1');
    t.clear();
    t.play('carla', '5C');
    t.play('duarte', 'QH');
    t.play('bruno', 'KS');
    t.pass('duarte');
    t.clear();
    expect(t.current).toBe('duarte'); // Bruno is out and Ana is blocked
    t.play('duarte', '4D');
    expect(t.state.lastGame?.order).toEqual(['carla', 'bruno', 'duarte', 'ana']);
    expect(t.state.lastGame?.roles.ana).toBe('OLHO');
  });
});
