import { SYSTEM_PLAYER_ID, createSeededRng, type CardInstance } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  applyPreset,
  normalisePreset,
  pepeConfigSchema,
  rulesBadge,
  validatePepeConfig,
} from './config';
import { setup, shuffledDealer } from './engine';
import { createPepeModule, pepeActionSchema, pepeRapido } from './module';
import {
  getDefaultAction,
  getPendingPlayers,
  getTimeoutAction,
  getTimeoutMs,
  getValidActions,
} from './moves';
import {
  FLIP_REQUEST_TIMEOUT_MS,
  MAX_IDLE_RECYCLES,
  PILE_CHOICE_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
  canGroup,
  fitsCentre,
  layOut,
  rankValue,
  resolveRace,
  resultOf,
} from './rules';
import {
  ANA,
  BRUNO,
  act,
  allCards,
  card,
  cards,
  config,
  group,
  ok,
  play,
  refused,
  stateWith,
  sys,
} from './test-utils';
import type { PepeConfig } from './types';
import { getPlayerView, getSpectatorView } from './view';

describe('setup', () => {
  it('deals 27 cards each into columns of 1–5 and a reserve of 12, and starts counting down', () => {
    const s = setup([ANA, BRUNO], config(), createSeededRng('setup'));
    expect(allCards(s)).toHaveLength(54);
    expect(new Set(allCards(s).map((c) => c.uid)).size).toBe(54);
    for (const id of [ANA, BRUNO]) {
      expect(s.areas[id]!.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5]);
      expect(s.areas[id]!.reserve).toHaveLength(12);
    }
    expect(s.phase).toBe('COUNTDOWN');
    expect(s.seed).toMatch(/^[0-9a-f]{64}$/);
    expect(getPendingPlayers(s)).toEqual([ANA, BRUNO]);
    expect(getTimeoutAction(s)).toEqual({ type: 'SYS_COUNTDOWN_DONE', flip: 1 });
  });

  it('refuses tables that are not two different players, and deals that repeat a card', () => {
    const rng = createSeededRng('x');
    expect(() => setup([ANA], config(), rng)).toThrow(RangeError);
    expect(() => setup([ANA, ANA], config(), rng)).toThrow('Duplicate');
    const twice = () => ({ [ANA]: cards(['AS']), [BRUNO]: cards(['AS']) });
    expect(() => setup([ANA, BRUNO], config(), rng, twice)).toThrow('at most once');
  });

  it('lays out fewer than 15 cards column by column, without a reserve', () => {
    const laid = layOut(cards(['AS', '2S', '3S', '4S', '5S', '6S', '7S']));
    expect(laid.columns.map((c) => c.length)).toEqual([1, 2, 3, 1, 0]);
    expect(laid.reserve).toEqual([]);
  });

  it('the module plays a dealt match through its public surface', () => {
    const module = createPepeModule(shuffledDealer);
    const state = module.setup([ANA, BRUNO], module.configSchema.parse({}), createSeededRng('m'));
    expect(module.getCurrentPlayer(state)).toBeNull();
    expect(module.isFinished(state)).toBe(false);
    expect(module.getSpectatorView(state).selfId).toBeNull();
    expect(pepeRapido.id).toBe('pepe-rapido');
    expect(pepeRapido.minPlayers).toBe(2);
    expect(pepeRapido.maxPlayers).toBe(2);
  });
});

describe('rules', () => {
  const both = { direction: 'UP_DOWN', aceKingWrap: true } as const;

  it('values A to K as 1 to 13', () => {
    expect(['A', '2', '10', 'J', 'Q', 'K'].map((rank) => rankValue({ rank } as never))).toEqual([
      1, 2, 10, 11, 12, 13,
    ]);
  });

  it('direction × aceKingWrap: the full matrix for A, 2, Q and K', () => {
    const ranks = ['A', '2', 'Q', 'K'] as const;
    const fits = (rules: Pick<PepeConfig, 'direction' | 'aceKingWrap'>) =>
      ranks.flatMap((top) =>
        ranks.filter((c) => fitsCentre({ rank: c }, { rank: top }, rules)).map((c) => `${c}/${top}`),
      );
    expect(fits(both)).toEqual(['2/A', 'K/A', 'A/2', 'K/Q', 'A/K', 'Q/K']);
    expect(fits({ direction: 'UP_DOWN', aceKingWrap: false })).toEqual(['2/A', 'A/2', 'K/Q', 'Q/K']);
    expect(fits({ direction: 'UP_ONLY', aceKingWrap: true })).toEqual(['2/A', 'K/Q', 'A/K']);
    expect(fits({ direction: 'UP_ONLY', aceKingWrap: false })).toEqual(['2/A', 'K/Q']);
  });

  it('a difference of 0 or of 2 and more never fits; suits never matter', () => {
    expect(fitsCentre(card('7H'), card('7S'), both)).toBe(false);
    expect(fitsCentre(card('9H'), card('7S'), both)).toBe(false);
    expect(fitsCentre(card('8H'), card('7H'), both)).toBe(true);
  });

  it('groups equal ranks and anything with a joker, unless grouping is off', () => {
    expect(canGroup(card('9C'), card('9H'), { grouping: true })).toBe(true);
    expect(canGroup(card('9C'), card('8H'), { grouping: true })).toBe(false);
    expect(canGroup(card('JK1'), card('8H'), { grouping: true })).toBe(true);
    expect(canGroup(card('8H'), card('JK2'), { grouping: true })).toBe(true);
    expect(canGroup(card('9C'), card('9H'), { grouping: false })).toBe(false);
  });

  it('resolves a race by the top the player saw', () => {
    expect(resolveRace(cards(['2S', '3S']), '3S#0')).toBe('FIRST');
    expect(resolveRace(cards(['2S', '3S']), '2S#0')).toBe('TOP_CHANGED');
    expect(resolveRace([], '2S#0')).toBe('TOP_CHANGED');
  });
});

describe('refusals', () => {
  const s = stateWith({
    centre: [['7S'], []],
    ana: { columns: [['8H'], ['2C', '9D'], [], ['5S'], ['5H']], reserve: ['KD'] },
    bruno: { columns: [['10C']], reserve: ['QC'] },
  });

  it('checks who acts', () => {
    refused(s, 'zoe', play(s, ANA, 0, 0), 'UNKNOWN_PLAYER');
    refused(s, ANA, { type: 'SYS_AUTO_FLIP' }, 'SYSTEM_ONLY');
    expect(act(s, SYSTEM_PLAYER_ID, { type: 'SYS_COUNTDOWN_DONE', flip: 1 }).ok).toBe(false);
  });

  it('checks the card moved, the column and the pile', () => {
    refused(s, ANA, { ...play(s, ANA, 0, 0), column: 7 }, 'INVALID_COLUMN');
    refused(s, ANA, { ...play(s, ANA, 0, 0), column: 2 }, 'EMPTY_COLUMN');
    refused(s, ANA, { ...play(s, ANA, 0, 0), cardUid: '9D#0' }, 'CARD_MOVED');
    refused(s, ANA, { ...play(s, ANA, 0, 0), pile: 2 as never }, 'INVALID_PILE');
    refused(s, ANA, play(s, ANA, 0, 1), 'EMPTY_PILE');
    refused(s, ANA, play(s, ANA, 1, 0), 'INVALID_MOVE');
  });

  it('checks groups and moves', () => {
    refused(s, ANA, group(s, ANA, 0, 0), 'INVALID_COLUMN');
    refused(s, ANA, group(s, ANA, 0, 9), 'INVALID_COLUMN');
    refused(s, ANA, group(s, ANA, 0, 2), 'EMPTY_COLUMN');
    refused(s, ANA, group(s, ANA, 0, 1), 'INVALID_MOVE');
    refused(s, ANA, group(s, ANA, 0, 3, 'MOVE_TO_EMPTY'), 'NOT_EMPTY');
    refused(s, ANA, group(s, ANA, 0, 2, 'MOVE_TO_EMPTY'), 'INVALID_MOVE');
    ok(s, ANA, group(s, ANA, 3, 4));
  });

  it('moves nothing outside play', () => {
    for (const phase of ['COUNTDOWN', 'CHOOSING_PILE', 'ROUND_SETUP'] as const) {
      const other = { ...s, phase };
      refused(other, ANA, play(other, ANA, 0, 0), 'WRONG_PHASE');
      refused(other, ANA, group(other, ANA, 3, 4), 'WRONG_PHASE');
      refused(other, ANA, { type: 'REQUEST_FLIP' }, 'WRONG_PHASE');
    }
    refused(s, ANA, { type: 'CHOOSE_PILE', pile: 0 }, 'WRONG_PHASE');
    const choosing = { ...s, phase: 'CHOOSING_PILE' as const, roundWinner: ANA };
    refused(choosing, ANA, { type: 'CHOOSE_PILE', pile: 3 as never }, 'INVALID_PILE');
  });

  it('ignores stale system actions', () => {
    refused(s, SYSTEM_PLAYER_ID, { type: 'SYS_COUNTDOWN_DONE', flip: 1 }, 'STALE');
    refused({ ...s, phase: 'COUNTDOWN' }, SYSTEM_PLAYER_ID, { type: 'SYS_COUNTDOWN_DONE', flip: 0 }, 'STALE');
    refused(s, SYSTEM_PLAYER_ID, { type: 'SYS_ROUND_SETUP_DONE', round: 1 }, 'STALE');
    refused(
      { ...s, phase: 'ROUND_SETUP' },
      SYSTEM_PLAYER_ID,
      { type: 'SYS_ROUND_SETUP_DONE', round: 2 },
      'STALE',
    );
    refused(s, SYSTEM_PLAYER_ID, { type: 'SYS_AUTO_FLIP' }, 'STALE');
  });
});

describe('flipping', () => {
  it('during play, both must agree; a card on the centre cancels a request', () => {
    const s = stateWith({
      centre: [['7S'], ['2D']],
      ana: { columns: [['8H'], ['KC']], reserve: ['3C'] },
      bruno: { columns: [['9C'], ['QS']], reserve: ['JD'] },
    });
    const asked = ok(s, BRUNO, { type: 'REQUEST_FLIP' });
    expect(asked.events).toEqual([{ type: 'FlipRequested', playerId: BRUNO }]);
    refused(asked.state, BRUNO, { type: 'REQUEST_FLIP' }, 'ALREADY_REQUESTED');
    // Ana owes an answer now: play or agree, within the time.
    expect(getPendingPlayers(asked.state)).toEqual([ANA]);
    expect(getTimeoutMs(asked.state)).toBe(FLIP_REQUEST_TIMEOUT_MS);
    expect(getDefaultAction(asked.state, ANA)).toEqual({ type: 'REQUEST_FLIP' });
    expect(getDefaultAction(asked.state, BRUNO)).toBeNull();
    expect(getTimeoutAction(asked.state)).toBeNull();

    const played = ok(asked.state, ANA, play(asked.state, ANA, 0, 0)).state;
    expect(played.areas[BRUNO]!.wantsFlip).toBe(false);
    expect(getPendingPlayers(played)).toEqual([]);
    expect(getTimeoutMs(played)).toBeNull();

    const agreed = ok(asked.state, ANA, { type: 'REQUEST_FLIP' }).state;
    expect(agreed.phase).toBe('COUNTDOWN');
    // A pending request that runs out of time flips anyway (a player who dropped).
    expect(sys(asked.state, { type: 'SYS_AUTO_FLIP' }).state.phase).toBe('COUNTDOWN');
  });

  it('a stall flips by itself after a while even without "vira sozinho"', () => {
    const s = stateWith({
      phase: 'STALLED',
      centre: [['2S'], ['2H']],
      ana: { columns: [['7D']], reserve: ['3C'], wantsFlip: true },
      bruno: { columns: [['9S']], reserve: ['JD'] },
    });
    expect(getTimeoutMs(s)).toBe(STALL_TIMEOUT_MS);
    expect(getPendingPlayers(s)).toEqual([BRUNO]);
    expect(getDefaultAction(s, BRUNO)).toEqual({ type: 'REQUEST_FLIP' });
    expect(getTimeoutAction(s)).toEqual({ type: 'SYS_AUTO_FLIP' });
  });

  it('a flip that leaves everyone stuck is a stall again', () => {
    const s = stateWith({
      phase: 'COUNTDOWN',
      centre: [['2S'], ['2H']],
      ana: { columns: [['7D']], reserve: ['QC'] },
      bruno: { columns: [['9S']], reserve: ['QD'] },
    });
    const { state, events } = sys(s, { type: 'SYS_COUNTDOWN_DONE', flip: 1 });
    expect(state.phase).toBe('STALLED');
    expect(events.map((e) => e.type)).toEqual(['Flipped', 'Stalled']);
  });

  it('without reserves, each pile goes back under its side, shuffled, and is turned over (09 #7)', () => {
    const s = stateWith({
      phase: 'STALLED',
      centre: [
        ['2S', '9H', '4C'],
        ['2H', 'QC'],
      ],
      ana: { columns: [['7D']] },
      bruno: { columns: [['10S']] },
    });
    expect(getPlayerView(s, ANA).flipRequired).toEqual([ANA, BRUNO]);
    const asked = ok(ok(s, ANA, { type: 'REQUEST_FLIP' }).state, BRUNO, { type: 'REQUEST_FLIP' }).state;
    const { state, events } = sys(asked, { type: 'SYS_COUNTDOWN_DONE', flip: asked.flips });
    expect(events[0]).toEqual({ type: 'Recycled' });
    expect(state.areas[ANA]!.reserve).toHaveLength(2);
    expect(state.areas[BRUNO]!.reserve).toHaveLength(1);
    expect(state.centre.map((p) => p.length)).toEqual([1, 1]);
    expect(state.idleRecycles).toBe(1);
    expect(allCards(state)).toHaveLength(7);
  });

  it(`after ${MAX_IDLE_RECYCLES} reshuffles with no card played the game ends: fewer cards wins`, () => {
    const base = {
      phase: 'COUNTDOWN' as const,
      centre: [['2S'], ['2H']] as [string[], string[]],
      ana: { columns: [['7D']] },
      bruno: { columns: [['9S'], ['10S']] },
      idleRecycles: MAX_IDLE_RECYCLES,
    };
    const { state, events } = sys(stateWith(base), { type: 'SYS_COUNTDOWN_DONE', flip: 1 });
    expect(state.phase).toBe('FINISHED');
    expect(state.deadlock).toBe(true);
    expect(events).toEqual([
      { type: 'Deadlocked', winner: ANA },
      { type: 'GameWon', playerId: ANA },
    ]);
    expect(resultOf(state)).toEqual({
      standings: [
        { playerId: ANA, outcome: 'WINNER', position: 1, score: 1 },
        { playerId: BRUNO, outcome: 'LOSER', position: 2, score: 2 },
      ],
      summary: { rounds: 1, deadlock: true },
    });

    const even = sys(stateWith({ ...base, bruno: { columns: [['9S']] } }), {
      type: 'SYS_COUNTDOWN_DONE',
      flip: 1,
    });
    expect(even.events).toEqual([{ type: 'Deadlocked', winner: null }]);
    expect(resultOf(even.state).standings.map((s) => [s.outcome, s.position])).toEqual([
      ['WINNER', 1],
      ['WINNER', 1],
    ]);
  });

  it('a centre with nothing to turn over at all is a stalemate', () => {
    const s = stateWith({
      phase: 'COUNTDOWN',
      ana: { columns: [['7D']] },
      bruno: { columns: [['9S'], ['3C']] },
    });
    const { state } = sys(s, { type: 'SYS_COUNTDOWN_DONE', flip: 1 });
    expect(state.deadlock).toBe(true);
    expect(state.winner).toBe(ANA);
  });
});

describe('choosing a pile', () => {
  const s = stateWith({
    phase: 'CHOOSING_PILE',
    roundWinner: ANA,
    centre: [['2S', '3S'], ['5H']],
    ana: { reserve: ['KD'] },
    bruno: { columns: [['9C']], reserve: ['7C'] },
  });

  it('is up to the round winner, on a clock; a pile is drawn when it runs out', () => {
    expect(getPendingPlayers(s)).toEqual([ANA]);
    expect(getTimeoutMs(s)).toBe(PILE_CHOICE_TIMEOUT_MS);
    expect(getTimeoutAction(s)).toBeNull();
    expect(getValidActions(s, ANA)).toEqual([
      { type: 'CHOOSE_PILE', pile: 0 },
      { type: 'CHOOSE_PILE', pile: 1 },
    ]);
    expect(getValidActions(s, BRUNO)).toEqual([]);
    expect(getDefaultAction(s, BRUNO)).toBeNull();
    const drawn = getDefaultAction(s, ANA);
    expect(drawn).toMatchObject({ type: 'CHOOSE_PILE' });
    expect(getDefaultAction(s, ANA)).toEqual(drawn);
  });

  it('gives the other pile, the reserve and what was left in the columns to the other player', () => {
    const { state } = ok(s, ANA, { type: 'CHOOSE_PILE', pile: 1 });
    expect(allCards(state)).toHaveLength(6);
    const count = (id: string) => state.areas[id]!.columns.flat().length + state.areas[id]!.reserve.length;
    // Ana: the 5 of hearts and her king; Bruno: the 2 and 3 of spades, his 7 and his 9.
    expect(count(ANA)).toBe(2);
    expect(count(BRUNO)).toBe(4);
    expect(getTimeoutMs(state)).toBeNull();
    expect(getPendingPlayers(state)).toEqual([]);
  });
});

describe('valid actions', () => {
  it('lists plays, groups, moves and the flip', () => {
    const s = stateWith({
      centre: [['7S'], ['9D']],
      ana: { columns: [['8H'], ['3C', '8C'], [], [], []], reserve: ['KD'] },
      bruno: { columns: [['10C']], reserve: ['QC'] },
    });
    const actions = getValidActions(s, ANA);
    expect(actions).toContainEqual({
      type: 'PLAY_TO_CENTRE',
      cardUid: '8H#0',
      column: 0,
      pile: 0,
      expectedTopUid: '7S#0',
    });
    expect(actions).toContainEqual({
      type: 'PLAY_TO_CENTRE',
      cardUid: '8H#0',
      column: 0,
      pile: 1,
      expectedTopUid: '9D#0',
    });
    expect(actions).toContainEqual({ type: 'GROUP', cardUid: '8H#0', fromColumn: 0, toColumn: 1 });
    expect(actions).toContainEqual({ type: 'MOVE_TO_EMPTY', cardUid: '8C#0', fromColumn: 1, toColumn: 2 });
    // A lone card is not moved to another empty column.
    expect(actions).not.toContainEqual(expect.objectContaining({ type: 'MOVE_TO_EMPTY', fromColumn: 0 }));
    expect(actions).toContainEqual({ type: 'REQUEST_FLIP' });
    for (const action of actions) expect(act(s, ANA, action).ok).toBe(true);
    expect(getValidActions(s, 'zoe')).toEqual([]);
    expect(getValidActions({ ...s, phase: 'COUNTDOWN' }, ANA)).toEqual([]);
    expect(getDefaultAction({ ...s, phase: 'COUNTDOWN' }, ANA)).toBeNull();
    expect(getTimeoutMs({ ...s, phase: 'ROUND_SETUP' })).toBeNull();
    expect(getPendingPlayers({ ...s, phase: 'FINISHED' })).toEqual([]);
  });
});

describe('views', () => {
  it('put the viewer first and spectators in seat order', () => {
    const s = stateWith({
      centre: [['7S'], ['9D']],
      ana: { columns: [['8H']] },
      bruno: { columns: [['2C', '10C']] },
    });
    expect(getPlayerView(s, BRUNO).sides.map((side) => [side.id, side.pile])).toEqual([
      [BRUNO, 1],
      [ANA, 0],
    ]);
    const spectator = getSpectatorView(s);
    expect(spectator.sides.map((side) => side.id)).toEqual([ANA, BRUNO]);
    expect(spectator.sides[0].reserveCount).toBeNull();
    expect(spectator.sides[1].columns[0]).toEqual({ top: card('10C'), hiddenCount: 1 });
  });
});

describe('configuration', () => {
  it('defaults to the classic preset', () => {
    const parsed = pepeConfigSchema.parse({});
    expect(parsed).toEqual({
      preset: 'CLASSICO',
      direction: 'UP_DOWN',
      jokers: true,
      aceKingWrap: true,
      grouping: true,
      moveToEmpty: true,
      showCentreCounts: false,
      showOwnReserveCount: true,
      showOpponentCounts: false,
      countdownMs: 3000,
      autoFlip: false,
      autoFlipDelayMs: 2000,
      rematch: true,
    });
  });

  it('keeps timings within 1–5 s', () => {
    expect(pepeConfigSchema.safeParse({ countdownMs: 500 }).success).toBe(false);
    expect(pepeConfigSchema.safeParse({ autoFlipDelayMs: 6000 }).success).toBe(false);
  });

  it('presets fill their settings; changing one turns the preset into "Personalizado"', () => {
    const beginner = applyPreset(pepeConfigSchema.parse({}), 'INICIANTE');
    expect(beginner).toMatchObject({ preset: 'INICIANTE', ...PRESETS.INICIANTE });
    expect(pepeConfigSchema.parse(beginner).preset).toBe('INICIANTE');
    expect(pepeConfigSchema.parse({ ...beginner, autoFlip: false }).preset).toBe('PERSONALIZADO');
    expect(pepeConfigSchema.parse({ preset: 'CLASSICO', jokers: false }).preset).toBe('PURO');
    expect(pepeConfigSchema.parse({ preset: 'PERSONALIZADO' }).preset).toBe('CLASSICO');
    expect(applyPreset(beginner, 'PERSONALIZADO').preset).toBe('PERSONALIZADO');
    expect(normalisePreset({ ...beginner, direction: 'UP_DOWN' }).preset).toBe('PERSONALIZADO');
  });

  it('is frozen at setup: the room changing later changes nothing', () => {
    const settings = config({ grouping: true });
    const s = setup([ANA, BRUNO], settings, createSeededRng('frozen'));
    settings.grouping = false;
    expect(s.config.grouping).toBe(true);
  });

  it('refuses the one rule set where aces can never leave a column', () => {
    expect(
      validatePepeConfig(config({ direction: 'UP_ONLY', aceKingWrap: false, jokers: false })),
    ).toMatchObject({
      code: 'ACES_STUCK',
    });
    expect(validatePepeConfig(config({ direction: 'UP_ONLY', aceKingWrap: false }))).toBeNull();
    expect(validatePepeConfig(config({ aceKingWrap: false, jokers: false }))).toBeNull();
    expect(
      pepeRapido.validateTable?.(config({ direction: 'UP_ONLY', aceKingWrap: true, jokers: false }), 2),
    ).toBeNull();
  });

  it('describes the rules in play in a few characters', () => {
    expect(rulesBadge(config())).toBe('↑↓ · com jokers');
    expect(rulesBadge(config({ direction: 'UP_ONLY', jokers: false }))).toBe('só ↑ · sem jokers');
  });

  it('accepts well-formed client actions only', () => {
    const parse = (action: unknown) => pepeActionSchema.safeParse(action).success;
    expect(
      parse({ type: 'PLAY_TO_CENTRE', cardUid: '10H#0', column: 4, pile: 1, expectedTopUid: 'JK2#0' }),
    ).toBe(true);
    expect(
      parse({ type: 'PLAY_TO_CENTRE', cardUid: '10H#1', column: 4, pile: 1, expectedTopUid: 'JK2#0' }),
    ).toBe(false);
    expect(parse({ type: 'GROUP', cardUid: '2C#0', fromColumn: 5, toColumn: 0 })).toBe(false);
    expect(parse({ type: 'CHOOSE_PILE', pile: 2 })).toBe(false);
    expect(parse({ type: 'SYS_AUTO_FLIP' })).toBe(false);
    expect(parse({ type: 'REQUEST_FLIP', extra: 1 })).toBe(false);
  });
});

describe('determinism', () => {
  it('a match replays the same from the same seed', () => {
    const run = () => {
      let s = setup([ANA, BRUNO], config(), createSeededRng('replay'));
      s = sys(s, { type: 'SYS_COUNTDOWN_DONE', flip: 1 }).state;
      return s.centre.map((p) => p.map((c: CardInstance) => c.uid));
    };
    expect(run()).toEqual(run());
  });
});
