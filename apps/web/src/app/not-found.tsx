import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-7xl font-semibold text-gold">404</p>
      <h1 className="font-display text-2xl font-semibold">Esta carta não está no baralho</h1>
      <Link href="/" className="font-semibold text-gold hover:text-gold-strong">
        ← Voltar ao início
      </Link>
    </main>
  );
}
