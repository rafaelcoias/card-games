import type { Metadata } from 'next';
import { PepePreviewLoader } from '@/components/dev/pepe-preview-loader';

export const metadata: Metadata = { title: 'Pepe Rápido · mesa de teste' };

export default function PepePreviewPage() {
  return <PepePreviewLoader />;
}
