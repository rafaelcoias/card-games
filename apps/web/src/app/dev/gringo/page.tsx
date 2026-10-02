import type { Metadata } from 'next';
import { GringoPreviewLoader } from '@/components/dev/gringo-preview-loader';

export const metadata: Metadata = { title: 'Gringo · estados da mesa' };

export default function GringoPreviewPage() {
  return <GringoPreviewLoader />;
}
