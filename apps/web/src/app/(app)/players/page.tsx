import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PlayersScreen } from '@/components/players/players-screen';

export const metadata: Metadata = { title: 'Jogadores' };

export default function PlayersPage() {
  // useSearchParams needs a Suspense boundary.
  return (
    <Suspense>
      <PlayersScreen />
    </Suspense>
  );
}
