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

/** A quiet live indicator under the way in (not a link: the page has one way in). */
export async function OnlineCount() {
  const count = await fetchOnlineCount();
  if (count === null) return null;
  const label =
    count === 0
      ? 'Ninguém online agora — sê o primeiro'
      : `${count} ${count === 1 ? 'jogador online' : 'jogadores online'} agora`;
  return (
    <p className="inline-flex items-center gap-2 text-sm text-muted">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      {label}
    </p>
  );
}
