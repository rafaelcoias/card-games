import type { Metadata } from 'next';
import { OlhoPreviewLoader } from '@/components/dev/olho-preview-loader';

export const metadata: Metadata = { title: 'Olho · estados da mesa' };

export default function OlhoPreviewPage() {
  return <OlhoPreviewLoader />;
}
