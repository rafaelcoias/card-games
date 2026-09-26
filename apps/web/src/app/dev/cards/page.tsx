import type { Metadata } from 'next';
import { CardGallery } from '@/components/marketing/card-gallery';

export const metadata: Metadata = { title: 'Baralho' };

export default function CardsGalleryPage() {
  return <CardGallery />;
}
