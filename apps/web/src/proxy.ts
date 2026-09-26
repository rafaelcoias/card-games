import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifyIdToken } from '@/lib/auth/id-token';

const PROTECTED = ['/lobby', '/room', '/profile', '/onboarding'];
const GUEST_ONLY = ['/register', '/forgot-password'];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/**
 * Route protection (Next 16 "proxy", formerly middleware). The session cookie
 * holds a Firebase ID token, verified locally against Google's public keys.
 * `/login` is deliberately not guest-only: it also renews an expired cookie
 * for users still signed in to Firebase.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = token ? (await verifyIdToken(token)) !== null : false;

  const { pathname, search } = request.nextUrl;
  if (!signedIn && matches(pathname, PROTECTED)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (signedIn && matches(pathname, GUEST_ONLY)) {
    return NextResponse.redirect(new URL('/lobby', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|cards/|api/).*)'],
};
