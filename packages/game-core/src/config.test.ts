import { describe, expect, it } from 'vitest';
import { matchingPreset, type ConfigField } from './game-module';

const field: ConfigField = {
  key: 'preset',
  label: 'Predefinição',
  options: [
    { label: 'A', value: 'A' },
    { label: 'B', value: 'B' },
    { label: 'Mine', value: 'CUSTOM' },
  ],
  presets: { A: { x: 1, y: true }, B: { x: 2, y: true } },
  customValue: 'CUSTOM',
};

describe('matchingPreset', () => {
  it('names the preset the settings match, or the custom value', () => {
    expect(matchingPreset(field, { preset: 'CUSTOM', x: 2, y: true })).toBe('B');
    expect(matchingPreset(field, { preset: 'A', x: 1, y: false })).toBe('CUSTOM');
    expect(matchingPreset({ ...field, customValue: undefined }, { preset: 'A', x: 3 })).toBe('A');
  });
});

describe('system action helpers', () => {
  it('build the actions the server applies to paused and session tables', async () => {
    const { pauseActions, sessionActions } = await import('./game-module');
    expect(pauseActions.pause('a')).toEqual({ type: 'SYS_PAUSE', playerId: 'a' });
    expect(pauseActions.resume('a')).toEqual({ type: 'SYS_RESUME', playerId: 'a' });
    expect(sessionActions.joined('a', 2)).toEqual({ type: 'SYS_PLAYER_JOINED', playerId: 'a', seatIndex: 2 });
    expect(sessionActions.joined('a', 2, 500)).toMatchObject({ wallet: 500 });
    expect(sessionActions.left('a')).toEqual({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    expect(sessionActions.end()).toEqual({ type: 'SYS_END_SESSION' });
  });
});
