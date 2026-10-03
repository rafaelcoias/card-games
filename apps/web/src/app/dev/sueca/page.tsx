import type { Metadata } from 'next';
import { SuecaPreviewLoader } from '@/components/dev/sueca-preview-loader';

export const metadata: Metadata = { title: 'Sueca · estados da mesa' };

export default function SuecaPreviewPage() {
  return <SuecaPreviewLoader />;
}
