import Link from 'next/link';
import { publicEnv } from '@/lib/env';

/** Players online right now (public count; refreshed at most every 15 s). */
async function fetchOnlineCount(): Promise<number | null> {
  try {
    const response = await fetch(`${publicEnv.gameServerUrl}/api/presence/count`, {
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { count: number }).count;
  } catch {
    return null;
  }
}

export async function OnlineCount({ signedIn }: { signedIn: boolean }) {
  const count = await fetchOnlineCount();
  if (count === null) return null;
  const label =
    count === 0
      ? 'Ninguém online agora — sê o primeiro'
      : `${count} ${count === 1 ? 'jogador online' : 'jogadores online'} agora`;
  return (
    <Link
      href={signedIn ? '/lobby' : '/register'}
      className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-sm font-medium text-ivory transition-colors hover:border-success/60"
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {label}
      {signedIn && <span className="text-success">· ver quem →</span>}
    </Link>
  );
}
