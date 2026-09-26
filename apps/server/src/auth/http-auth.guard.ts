import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { TokenVerifier, type AuthIdentity } from './token-verifier';

type AuthedRequest = Request & { identity?: AuthIdentity };

export function extractBearer(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}

@Injectable()
export class HttpAuthGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(request.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      request.identity = await this.verifier.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }
}

export const CurrentIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthIdentity => {
    const identity = context.switchToHttp().getRequest<AuthedRequest>().identity;
    if (!identity) throw new UnauthorizedException();
    return identity;
  },
);
