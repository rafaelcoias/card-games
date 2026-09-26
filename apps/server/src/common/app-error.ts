import { ErrorCode, type Ack, type ErrorPayload } from '@cardroom/shared';
import { ZodError } from 'zod';

/** Expected, user-facing failure. Anything else is reported as INTERNAL. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toErrorPayload(error: unknown): ErrorPayload {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return {
      code: ErrorCode.Validation,
      message: first ? `${first.path.join('.') || 'payload'}: ${first.message}` : 'Invalid payload',
    };
  }
  return { code: ErrorCode.Internal, message: 'Something went wrong' };
}

export function isExpectedError(error: unknown): boolean {
  return error instanceof AppError || error instanceof ZodError;
}

export const okAck = <T>(data: T): Ack<T> => ({ ok: true, data });
