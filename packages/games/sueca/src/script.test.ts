/**
 * `05-GUIAO-DE-MAO.md` as an executable test: Ana (South), Bruno (East), Carla
 * (North) and Duarte (West). Duarte deals, Carla cuts from the bottom: the 4♦,
 * trumps are diamonds and the 4♦ is Duarte's, face up. Ana opens.
 */
import { describe, expect, it } from 'vitest';
import { gamesFor, pointsOf } from './rules';
import { Table, eventTypes, expectError, uid, type StackedHand } from './test-utils';
import type { Seat } from './types';

const HAND_1: StackedHand = {
  hands: {
    S: ['AS', '7S', 'KS', '3H', '5H', 'QC', '3C', '5C', 'AD', 'JD'],
    E: ['JS', '5S', '2S', 'QH', '6H', '4H', '7C', 'KD', '6D', '5D'],
    N: ['6S', '3S', '7H', '2H', 'AC', 'KC', 'JC', '6C', '7D', '3D'],
    W: ['QS', '4S', 'AH', 'KH', 'JH', '4C', '2C', 'QD', '4D', '2D'],
  },
  trump: '4D',
  from: 'BOTTOM',
};

/** The script's tricks: cards in order of play, who takes it and its points. */
const TRICKS: { plays: [Seat, string][]; winner: Seat; points: number }[] = [
  {
    plays: [
      ['S', 'AS'],
      ['E', '2S'],
      ['N', '3S'],
      ['W', '4S'],
    ],
    winner: 'S',
    points: 11,
  },
  {
    plays: [
      ['S', '7S'],
      ['E', '5S'],
      ['N', '6S'],
      ['W', 'QS'],
    ],
    winner: 'S',
    points: 12,
  },
  {
    plays: [
      ['S', 'KS'],
      ['E', 'JS'],
      ['N', '2H'],
      ['W', '2D'],
    ],
    winner: 'W',
    points: 7,
  },
  {
    plays: [
      ['W', 'AH'],
      ['S', '3H'],
      ['E', '4H'],
      ['N', '7H'],
    ],
    winner: 'W',
    points: 21,
  },
  {
    plays: [
      ['W', 'KH'],
      ['S', '5H'],
      ['E', '6H'],
      ['N', '3D'],
    ],
    winner: 'N',
    points: 4,
  },
  {
    plays: [
      ['N', 'AC'],
      ['W', '2C'],
      ['S', '3C'],
      ['E', '7C'],
    ],
    winner: 'N',
    points: 21,
  },
  {
    plays: [
      ['N', 'KC'],
      ['W', '4C'],
      ['S', '5C'],
      ['E', '5D'],
    ],
    winner: 'E',
    points: 4,
  },
  {
    plays: [
      ['E', 'QH'],
      ['N', '7D'],
      ['W', 'JH'],
      ['S', 'AD'],
    ],
    winner: 'S',
    points: 26,
  },
  {
    plays: [
      ['S', 'QC'],
      ['E', 'KD'],
      ['N', 'JC'],
      ['W', '4D'],
    ],
    winner: 'E',
    points: 9,
  },
  {
    plays: [
      ['E', '6D'],
      ['N', '6C'],
      ['W', 'QD'],
      ['S', 'JD'],
    ],
    winner: 'S',
    points: 5,
  },
];

const legal = (t: Table, seat: Seat) => t.module.getPlayerView(t.state, t.player(seat)).legalCardUids;

/** Plays tricks `from`..`to` (1-based) of the script. */
function playTricks(t: Table, from: number, to: number): void {
  for (const { plays, winner, points } of TRICKS.slice(from - 1, to)) {
    expect(t.state.trick.leader).toBe(plays[0]?.[0]);
    for (const [seat, cardId] of plays) t.play(seat, cardId);
    expect(t.state.phase).toBe('TRICK_DONE');
    expect(t.state.trickWinner).toBe(winner);
    expect(t.state.trick.plays.reduce((sum, p) => sum + pointsOf(p.card), 0)).toBe(points);
    t.system({ type: 'SYS_TRICK_SHOWN' });
  }
}

function dealScript(): Table {
  const t = new Table({ firstDealer: 'W', stacks: { 1: HAND_1 } });
  expect(t.state).toMatchObject({ phase: 'CUT', dealer: 'W', cutter: 'N' });
  t.cut('BOTTOM');
  return t;
}

describe('the script of one hand (05)', () => {
  it('deals after the cut: the bottom card, 4♦, is Duarte’s trump, face up; Ana opens', () => {
    const t = dealScript();
    expect(eventTypes(t.last?.events ?? [])).toEqual(['CutChosen', 'TrumpRevealed', 'CardsDealt']);
    expect(t.state.trumpSuit).toBe('D');
    expect(t.state.trumpCard?.uid).toBe(uid('4D'));
    expect(t.state.hands.W.map((c) => c.id)).toContain('4D');
    expect(t.module.getCurrentPlayer(t.state)).toBe('ana');
    for (const seat of ['S', 'E', 'N', 'W'] as const) {
      expect(t.state.hands[seat].map((c) => c.id).sort()).toEqual([...HAND_1.hands[seat]].sort());
    }
    // The trump card is on the table for everyone until Duarte plays it.
    for (const viewer of ['ana', 'bruno', 'carla', 'duarte']) {
      const { trump } = t.module.getPlayerView(t.state, viewer);
      expect([trump?.suit, trump?.card?.uid, trump?.holder]).toEqual(['D', uid('4D'), 'W']);
    }
  });

  it('plays the ten tricks: winners, points, 79–41 and one game to Ana and Carla', () => {
    const t = dealScript();
    playTricks(t, 1, 10);
    expect(t.state.phase).toBe('HAND_SUMMARY');
    const summary = t.state.history[0];
    expect(summary).toEqual({
      hand: 1,
      points: { A: 79, B: 41 },
      gamesAwarded: { A: 1, B: 0 },
      tricks: { A: 6, B: 4 },
      dealer: 'W',
      trumpSuit: 'D',
    });
    expect(t.state.games).toEqual({ A: 1, B: 0 });
    expect(eventTypes(t.last?.events ?? [])).toEqual(['TrickCollected', 'HandEnded']);
  });

  it('hides the trump card once Duarte plays it (trick 9)', () => {
    const t = dealScript();
    playTricks(t, 1, 8);
    t.play('S', 'QC');
    t.play('E', 'KD');
    t.play('N', 'JC');
    expect(t.module.getPlayerView(t.state, 'ana').trump?.card?.uid).toBe(uid('4D'));
    t.play('W', '4D');
    expect(t.module.getPlayerView(t.state, 'ana').trump).toEqual({ suit: 'D', card: null, holder: 'W' });
    expect(t.module.getPlayerView(t.state, 'duarte').trump?.card).toBeNull();
  });

  it('rotates: Ana deals the next hand, Duarte cuts, Bruno opens', () => {
    const t = dealScript();
    playTricks(t, 1, 10);
    t.system({ type: 'SYS_NEXT_HAND' });
    expect(t.state).toMatchObject({ phase: 'CUT', handNumber: 2, dealer: 'S', cutter: 'W' });
    expect(t.module.getCurrentPlayer(t.state)).toBe('duarte');
    t.cut('TOP');
    expect(t.state.trick.leader).toBe('E');
    expect(t.module.getCurrentPlayer(t.state)).toBe('bruno');
    expect(t.state.hands.S.map((c) => c.uid)).toContain(t.state.trumpCard?.uid);
  });

  describe('following suit', () => {
    it('trick 4: Carla only has the 7♥ and must play it', () => {
      const t = dealScript();
      playTricks(t, 1, 3);
      t.play('W', 'AH');
      t.play('S', '3H');
      t.play('E', '4H');
      expect(legal(t, 'N')).toEqual([uid('7H')]);
      for (const other of ['AC', '7D', '3D', 'KC']) {
        const before = t.state;
        const result = t.try({ type: 'PLAY', cardUid: uid(other) }, 'carla');
        expectError(result, 'MUST_FOLLOW_SUIT');
        expect(t.state).toBe(before);
      }
      t.play('N', '7H');
    });

    it('trick 6: Bruno can only play the 7♣', () => {
      const t = dealScript();
      playTricks(t, 1, 5);
      t.play('N', 'AC');
      t.play('W', '2C');
      t.play('S', '3C');
      expect(legal(t, 'E')).toEqual([uid('7C')]);
    });

    it('trick 3: Carla has no spades and may play any card', () => {
      const t = dealScript();
      playTricks(t, 1, 2);
      t.play('S', 'KS');
      t.play('E', 'JS');
      expect([...legal(t, 'N')].sort()).toEqual(t.state.hands.N.map((c) => c.uid).sort());
      expect(legal(t, 'N')).toHaveLength(8);
    });
  });

  it.each([
    [79, 41, 1, 0],
    [60, 60, 0, 0],
    [95, 25, 2, 0],
    [120, 0, 4, 0],
    [30, 90, 0, 1],
    [29, 91, 0, 2],
  ])('scores %i–%i as %i–%i games', (a, b, gamesA, gamesB) => {
    expect([gamesFor(a), gamesFor(b)]).toEqual([gamesA, gamesB]);
  });
});
