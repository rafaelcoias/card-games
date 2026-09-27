import type { OnlinePlayer } from '@cardroom/shared';
import clsx from 'clsx';

export function presenceLabel(player: Pick<OnlinePlayer, 'status' | 'gameName' | 'roomCode'>): string {
  switch (player.status) {
    case 'playing':
      return `A jogar ${player.gameName ?? ''}`.trim();
    case 'room':
      return player.roomCode ? `Na sala ${player.roomCode}` : `Numa sala de ${player.gameName ?? 'jogo'}`;
    case 'lobby':
      return 'No lobby';
  }
}

/** Small status dot: green when online (gold while playing), grey when offline. */
export function OnlineDot({
  online,
  playing = false,
  className,
}: {
  online: boolean;
  playing?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-block size-2.5 rounded-full ring-2 ring-surface',
        online ? (playing ? 'bg-gold' : 'bg-success') : 'bg-subtle/60',
        className,
      )}
    />
  );
}
