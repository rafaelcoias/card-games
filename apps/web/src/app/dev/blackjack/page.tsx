import type { Metadata } from 'next';
import { BlackjackPreviewLoader } from '@/components/dev/blackjack-preview-loader';

export const metadata: Metadata = { title: 'Blackjack · estados da mesa' };

export default function BlackjackPreviewPage() {
  return <BlackjackPreviewLoader />;
}
