import type { Metadata } from 'next';
import { FodinhaPreviewLoader } from '@/components/dev/fodinha-preview-loader';

export const metadata: Metadata = { title: 'Fodinha · estados da mesa' };

export default function FodinhaPreviewPage() {
  return <FodinhaPreviewLoader />;
}
