import type { Metadata } from 'next';
import { MexicanaPreviewLoader } from '@/components/dev/mexicana-preview-loader';

export const metadata: Metadata = { title: 'Mexicana · estados da mesa' };

export default function MexicanaPreviewPage() {
  return <MexicanaPreviewLoader />;
}
