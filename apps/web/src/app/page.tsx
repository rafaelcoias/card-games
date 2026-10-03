import Link from 'next/link';
import { HeroHand } from '@/components/marketing/hero-hand';
import { OnlineCount } from '@/components/marketing/online-count';
import { Logo } from '@/components/ui/logo';
import { getServerSession } from '@/lib/auth/session';

/** The front door: the title, a fanned hand, and one way in. */
export default async function HomePage() {
  const session = await getServerSession();
  const entry = session ? { href: '/lobby', label: 'Ir para as salas' } : { href: '/login', label: 'Entrar' };

  return (
    <div className="app-backdrop flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Logo />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-12 px-4 pb-16 pt-4 sm:px-6 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
        <div className="flex flex-col items-center text-center md:items-start md:text-left">
          <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
            A mesa está posta.
            <br />
            <span className="text-ivory/55">Só faltas tu.</span>
          </h1>
          <Link
            href={entry.href}
            className="group mt-10 inline-flex h-16 items-center gap-3 rounded-2xl bg-gold px-10 text-lg font-semibold tracking-tight text-gold-ink shadow-[0_1px_0_rgb(255_255_255/0.4)_inset,0_18px_40px_-14px_rgb(232_193_112/0.75)] transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-gold-strong hover:shadow-[0_1px_0_rgb(255_255_255/0.4)_inset,0_22px_48px_-14px_rgb(232_193_112/0.9)] active:translate-y-0"
          >
            {entry.label}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-5 transition-transform duration-200 group-hover:translate-x-1"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10h12M11 5l5 5-5 5" />
            </svg>
          </Link>
          <div className="mt-6">
            <OnlineCount />
          </div>
        </div>
        <HeroHand />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-subtle sm:px-6">Cards</footer>
    </div>
  );
}
