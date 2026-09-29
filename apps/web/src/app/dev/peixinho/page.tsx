import type { Metadata } from 'next';
import { PeixinhoPreviewLoader } from '@/components/dev/peixinho-preview-loader';

export const metadata: Metadata = { title: 'Peixinho · estados da mesa' };

export default function PeixinhoPreviewPage() {
  return <PeixinhoPreviewLoader />;
}
