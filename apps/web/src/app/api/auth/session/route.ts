import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, verifyIdToken } from '@/lib/auth/id-token';

const bodySchema = z.object({ idToken: z.string().min(20).max(4096) });

/**
 * Stores a verified Firebase ID token in an httpOnly cookie. The client refreshes
 * it whenever Firebase rotates the token (see SessionSync), so the cookie simply
 * expires together with the token it carries.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 'VALIDATION' }, { status: 400 });

  const identity = await verifyIdToken(parsed.data.idToken);
  if (!identity) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, parsed.data.idToken, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, identity.expiresAt - Math.floor(Date.now() / 1000)),
  });
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
