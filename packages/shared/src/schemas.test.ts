import { describe, expect, it } from 'vitest';
import {
  roomChatSchema,
  roomCodeSchema,
  roomCreateSchema,
  updateProfileSchema,
  voiceSetSchema,
  voiceSignalSchema,
} from './schemas';

describe('shared schemas', () => {
  it('normalises room codes and rejects ambiguous characters', () => {
    expect(roomCodeSchema.parse(' abc234 ')).toBe('ABC234');
    expect(roomCodeSchema.safeParse('ABC0O1').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC23').success).toBe(false);
  });

  it('defaults room config and refuses unknown keys', () => {
    expect(roomCreateSchema.parse({ gameId: 'mexicana', maxPlayers: 4, isPrivate: false }).config).toEqual(
      {},
    );
    expect(
      roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 4, isPrivate: false, hack: 1 }).success,
    ).toBe(false);
    expect(roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 0, isPrivate: false }).success).toBe(false);
    expect(roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 1, isPrivate: false }).success).toBe(true);
    expect(roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 10, isPrivate: false }).success).toBe(true);
    expect(roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 11, isPrivate: false }).success).toBe(false);
  });

  it('trims chat and bounds its length', () => {
    expect(roomChatSchema.parse({ text: '  olá  ' }).text).toBe('olá');
    expect(roomChatSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(roomChatSchema.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
  });

  it('validates usernames and avatars', () => {
    expect(updateProfileSchema.safeParse({ username: 'ana_22' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ username: 'a' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ username: 'bad name' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ username: 'ana', avatarUrl: 'not-a-url' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ username: 'ana', avatarUrl: null }).success).toBe(true);
  });

  it('accepts exactly one voice description or candidate', () => {
    const base = { to: 'p2', cid: 'c1' };
    const description = { type: 'offer', sdp: 'v=0' };
    const candidate = { candidate: 'candidate:1 1 udp', sdpMid: '0', sdpMLineIndex: 0 };
    expect(voiceSignalSchema.safeParse({ ...base, description }).success).toBe(true);
    expect(voiceSignalSchema.safeParse({ ...base, candidate }).success).toBe(true);
    expect(voiceSignalSchema.safeParse({ ...base, candidate: { candidate: '', sdpMid: null } }).success).toBe(
      true,
    );
    expect(voiceSignalSchema.safeParse(base).success).toBe(false);
    expect(voiceSignalSchema.safeParse({ ...base, description, candidate }).success).toBe(false);
    expect(
      voiceSignalSchema.safeParse({ ...base, description: { type: 'rollback', sdp: 'v=0' } }).success,
    ).toBe(false);
    expect(
      voiceSignalSchema.safeParse({ ...base, description: { type: 'offer', sdp: 'x'.repeat(16_001) } })
        .success,
    ).toBe(false);
    expect(voiceSignalSchema.safeParse({ ...base, description, extra: 1 }).success).toBe(false);
  });

  it('validates the voice toggle', () => {
    expect(voiceSetSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(voiceSetSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});
