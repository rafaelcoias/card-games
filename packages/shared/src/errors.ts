/** Platform-level error codes. Game engines add their own codes (passed through verbatim). */
export const ErrorCode = {
  Unauthorized: 'UNAUTHORIZED',
  ProfileRequired: 'PROFILE_REQUIRED',
  Validation: 'VALIDATION',
  RateLimited: 'RATE_LIMITED',
  UnknownGame: 'UNKNOWN_GAME',
  RoomNotFound: 'ROOM_NOT_FOUND',
  RoomFull: 'ROOM_FULL',
  RoomInProgress: 'ROOM_IN_PROGRESS',
  RoomClosing: 'ROOM_CLOSING',
  AlreadyInRoom: 'ALREADY_IN_ROOM',
  NotInRoom: 'NOT_IN_ROOM',
  NotHost: 'NOT_HOST',
  NotReady: 'NOT_READY',
  PlayerCount: 'PLAYER_COUNT',
  CannotKick: 'CANNOT_KICK',
  GameNotRunning: 'GAME_NOT_RUNNING',
  CannotEnd: 'CANNOT_END',
  UsernameTaken: 'USERNAME_TAKEN',
  SeatTaken: 'SEAT_TAKEN',
  NoSeating: 'NO_SEATING',
  SeatsMissing: 'SEATS_MISSING',
  ChatClosed: 'CHAT_CLOSED',
  NotPaused: 'NOT_PAUSED',
  Busy: 'BUSY',
  Internal: 'INTERNAL',
} as const;

export type PlatformErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorPayload {
  /** A `PlatformErrorCode` or a game-specific code. */
  code: string;
  message: string;
}

export type Ack<T = void> = { ok: true; data: T } | { ok: false; error: ErrorPayload };

export type AckCallback<T = void> = (response: Ack<T>) => void;
