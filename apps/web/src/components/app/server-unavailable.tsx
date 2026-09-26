import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

export function ServerUnavailable() {
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="panel max-w-md p-8">
        <h1 className="font-display text-2xl font-semibold">A mesa está fechada por momentos</h1>
        <p className="mt-2 text-muted">
          Não conseguimos contactar o servidor de jogo. Verifica a tua ligação ou tenta novamente dentro de
          instantes.
        </p>
        <Link
          href="/lobby"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-gold px-4 text-sm font-semibold text-gold-ink hover:bg-gold-strong"
        >
          Tentar de novo
        </Link>
      </div>
    </main>
  );
}
