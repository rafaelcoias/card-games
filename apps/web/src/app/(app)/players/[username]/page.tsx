import type { Metadata } from 'next';
import { PlayerProfileScreen } from '@/components/players/player-profile-screen';

export async function generateMetadata({ params }: PageProps<'/players/[username]'>): Promise<Metadata> {
  const { username } = await params;
  return { title: decodeURIComponent(username) };
}

export default async function PlayerPage({ params }: PageProps<'/players/[username]'>) {
  const { username } = await params;
  return <PlayerProfileScreen username={decodeURIComponent(username)} />;
}
