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

export const metadata: Metadata = {
  title: { default: 'Cardroom — cartas online com amigos', template: '%s · Cardroom' },
  description: 'Joga Mexicana e outros jogos de cartas em tempo real com os teus amigos.',
  icons: { icon: '/icon.svg' },
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
