import type { Metadata } from 'next';
import { LobbyScreen } from '@/components/lobby/lobby-screen';

export const metadata: Metadata = { title: 'Salas' };

export default function LobbyPage() {
  return <LobbyScreen />;
}
