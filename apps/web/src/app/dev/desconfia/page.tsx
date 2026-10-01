import type { Metadata } from 'next';
import { DesconfiaPreviewLoader } from '@/components/dev/desconfia-preview-loader';

export const metadata: Metadata = { title: 'Desconfia · estados da mesa' };

export default function DesconfiaPreviewPage() {
  return <DesconfiaPreviewLoader />;
}
