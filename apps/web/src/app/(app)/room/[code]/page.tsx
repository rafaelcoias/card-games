import type { Metadata } from 'next';
import { RoomScreen } from '@/components/room/room-screen';

export async function generateMetadata({ params }: PageProps<'/room/[code]'>): Promise<Metadata> {
  const { code } = await params;
  return { title: `Sala ${code.toUpperCase()}` };
}

export default async function RoomPage({ params }: PageProps<'/room/[code]'>) {
  const { code } = await params;
  return <RoomScreen code={code.toUpperCase()} />;
}
