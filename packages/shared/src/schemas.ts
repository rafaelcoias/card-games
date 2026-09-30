import { z } from 'zod';

/** Alphabet without look-alike characters (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'Invalid room code');

export const roomCreateSchema = z.strictObject({
  gameId: z.string().min(1).max(40),
  // Each game narrows this to its own range (a blackjack table can be played alone).
  maxPlayers: z.number().int().min(1).max(10),
  isPrivate: z.boolean(),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const roomJoinSchema = z.strictObject({ code: roomCodeSchema });
export const roomReadySchema = z.strictObject({ ready: z.boolean() });
export const roomKickSchema = z.strictObject({ playerId: z.string().min(1).max(64) });
export const roomChatSchema = z.strictObject({ text: z.string().trim().min(1).max(300) });
export const gameActionSchema = z.strictObject({ action: z.unknown() });

export const voiceSetSchema = z.strictObject({ enabled: z.boolean() });

/** A WebRTC offer/answer or ICE candidate, relayed as-is to one other member of the room. */
export const voiceSignalSchema = z
  .strictObject({
    to: z.string().min(1).max(128),
    /** Identifies one peer connection, so a stale signal cannot reach its replacement. */
    cid: z.string().min(1).max(64),
    description: z
      .strictObject({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(16_000) })
      .optional(),
    candidate: z
      .strictObject({
        candidate: z.string().max(1_000),
        sdpMid: z.string().max(64).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .optional(),
  })
  .refine((s) => (s.description === undefined) !== (s.candidate === undefined), {
    message: 'Send either a description or a candidate',
  });

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, 'Use 3–20 letters, digits or underscores');

export const updateProfileSchema = z.strictObject({
  username: usernameSchema,
  avatarUrl: z.url().max(500).nullable().optional(),
});

export type RoomCreatePayload = z.input<typeof roomCreateSchema>;
export type RoomJoinPayload = z.input<typeof roomJoinSchema>;
export type RoomReadyPayload = z.input<typeof roomReadySchema>;
export type RoomKickPayload = z.input<typeof roomKickSchema>;
export type RoomChatPayload = z.input<typeof roomChatSchema>;
export type GameActionPayload = z.input<typeof gameActionSchema>;
export type VoiceSetPayload = z.input<typeof voiceSetSchema>;
export type VoiceSignalPayload = z.output<typeof voiceSignalSchema>;
/** A relayed signal, as received from `from`. */
export type VoiceSignal = Omit<VoiceSignalPayload, 'to'> & { from: string };
export type UpdateProfilePayload = z.input<typeof updateProfileSchema>;
