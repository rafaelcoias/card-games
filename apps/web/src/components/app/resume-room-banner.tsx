'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRealtime } from '@/lib/realtime/store';

/** After a reconnect the server restores your seat; offer a way back when you are elsewhere. */
export function ResumeRoomBanner() {
  const room = useRealtime((s) => s.room);
  const pathname = usePathname();
  if (!room || pathname.startsWith('/room/')) return null;
  return (
    <div className="border-b border-gold/25 bg-gold/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 text-sm sm:px-6">
        <span>
          {room.status === 'PLAYING' ? 'Tens uma partida a decorrer' : 'Continuas na sala'}{' '}
          <strong className="font-semibold tracking-wider">{room.code}</strong>
        </span>
        <Link href={`/room/${room.code}`} className="font-semibold text-gold hover:text-gold-strong">
          Voltar à mesa →
        </Link>
      </div>
    </div>
  );
}
