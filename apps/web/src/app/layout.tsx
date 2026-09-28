import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { SessionSync } from '@/components/auth/session-sync';
import { MotionProvider } from '@/components/motion-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  axes: ['opsz'],
});

const TITLE = 'Cards — cartas online com amigos';
const DESCRIPTION =
  'Joga Mexicana, Fodinha, Blackjack e outros jogos de cartas em tempo real com os teus amigos.';

// Link previews (WhatsApp, Instagram, …) need absolute URLs; the image itself is
// app/opengraph-image.jpg, rendered by `pnpm og:render`.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: { default: TITLE, template: '%s · Cards' },
  description: DESCRIPTION,
  applicationName: 'Cards',
  icons: { icon: '/icon.svg', apple: '/apple-icon.png' },
  openGraph: {
    type: 'website',
    siteName: 'Cards',
    locale: 'pt_PT',
    url: '/',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: '#0c1410',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <SessionSync />
        <MotionProvider>
          {children}
          <Toaster />
        </MotionProvider>
      </body>
    </html>
  );
}
