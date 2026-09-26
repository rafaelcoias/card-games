import { describe, expect, it } from 'vitest';
import { roomChatSchema, roomCodeSchema, roomCreateSchema, updateProfileSchema } from './schemas';

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
    expect(roomCreateSchema.safeParse({ gameId: 'x', maxPlayers: 1, isPrivate: false }).success).toBe(false);
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
});
