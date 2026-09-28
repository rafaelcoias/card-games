import Link from 'next/link';
import { HeroHand } from '@/components/marketing/hero-hand';
import { OnlineCount } from '@/components/marketing/online-count';
import { Logo } from '@/components/ui/logo';
import { getServerSession } from '@/lib/auth/session';

const FODINHA = [
  { rank: '1–5', text: 'Rondas de 1 a 5 cartas, a subir e a descer' },
  { rank: '?', text: 'Aposta quantas vazas vais fazer' },
  { rank: '✗', text: 'Falhaste a aposta? Levas os pontos da ronda' },
  { rank: '🙈', text: 'Rondas de 1 carta: vês as dos outros, não a tua' },
  { rank: 'A♦', text: 'A carta mais forte do baralho' },
  { rank: '=', text: 'Empate na carta mais alta: ninguém ganha a vaza' },
];

const BLACKJACK = [
  { rank: '21', text: 'Chega o mais perto possível de 21, sem passar' },
  { rank: 'A', text: 'O Ás vale 1 ou 11; as figuras valem 10' },
  { rank: '3:2', text: 'Blackjack (Ás + 10 nas duas primeiras) paga 3 para 2' },
  { rank: '17', text: 'A banca pede até 16 e fica em todos os 17' },
  { rank: '×2', text: 'Dobra, separa pares ou desiste a meio' },
  { rank: '7', text: 'Até 7 à mesa: entra e sai entre rondas' },
];

const POWERS = [
  { rank: '2', text: 'Reinicia a pilha' },
  { rank: '3', text: 'Espelha a carta de baixo' },
  { rank: '7', text: 'O seguinte joga 7 ou menos' },
  { rank: '8', text: 'Salta o próximo jogador' },
  { rank: '10', text: 'Queima a pilha e jogas outra vez' },
  { rank: 'JK', text: 'Igual ao 10' },
];

export default async function HomePage() {
  const session = await getServerSession();
  const primary = session
    ? { href: '/lobby', label: 'Ir para as salas' }
    : { href: '/register', label: 'Criar conta grátis' };

  return (
    <div className="app-backdrop min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        {!session && (
          <Link
            href="/login"
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:text-ivory"
          >
            Entrar
          </Link>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-2 md:pt-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold">
              Mexicana · Fodinha · Blackjack · com amigos
            </p>
            <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              A mesa está posta.
              <br />
              <span className="text-ivory/60">Só faltas tu.</span>
            </h1>
            <p className="mt-5 max-w-md text-lg text-muted">
              Cria uma sala, partilha o código e joga em tempo real — com cartas clássicas, jogadas fluidas e
              regras aplicadas pelo servidor.
            </p>
            <div className="mt-6">
              <OnlineCount signedIn={session !== null} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={primary.href}
                className="inline-flex h-12 items-center rounded-xl bg-gold px-6 font-semibold text-gold-ink shadow-[0_8px_24px_-8px_rgb(232_193_112/0.6)] transition-colors hover:bg-gold-strong"
              >
                {primary.label}
              </Link>
              {!session && (
                <Link
                  href="/guest"
                  className="inline-flex h-12 items-center rounded-xl border border-gold/50 px-6 font-semibold text-gold hover:bg-gold/10"
                >
                  Jogar como convidado
                </Link>
              )}
              <a
                href="#regras"
                className="inline-flex h-12 items-center rounded-xl border border-line-strong px-6 font-semibold hover:bg-white/5"
              >
                Como se joga
              </a>
            </div>
          </div>
          <HeroHand />
        </section>

        <section id="regras" className="border-t border-line bg-black/20">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-semibold tracking-tight">Mexicana em 30 segundos</h2>
            <p className="mt-3 max-w-2xl text-muted">
              Cada jogador tem 3 cartas escondidas, 3 visíveis e 3 na mão. Joga cartas iguais ou superiores às
              da pilha; se não puderes, apanhas a pilha toda. Esvazia a mão, depois as visíveis, depois as
              escondidas — às cegas. Quem ficar com cartas no fim, perde.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {POWERS.map((p) => (
                <li key={p.rank} className="panel flex items-center gap-4 p-4">
                  <span className="inline-flex h-14 w-10 items-center justify-center rounded-md bg-ivory font-display text-xl font-bold text-[#1a1a1a] shadow">
                    {p.rank}
                  </span>
                  <span className="text-ivory/90">{p.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-subtle">Quatro cartas iguais seguidas também queimam a pilha.</p>

            <h2 className="mt-16 font-display text-3xl font-semibold tracking-tight">
              Fodinha em 30 segundos
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Em cada ronda, cada jogador aposta quantas vazas vai ganhar. Ganha a vaza a carta mais alta — os
              naipes não contam. Quem não acertar exatamente na aposta leva os pontos da ronda; se ninguém
              falhar, a ronda seguinte vale mais. Não há vencedores: perde quem chegar aos 5 pontos.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FODINHA.map((p) => (
                <li key={p.text} className="panel flex items-center gap-4 p-4">
                  <span className="inline-flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-ivory font-display text-base font-bold text-[#1a1a1a] shadow">
                    {p.rank}
                  </span>
                  <span className="text-ivory/90">{p.text}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-16 font-display text-3xl font-semibold tracking-tight">
              Blackjack em 30 segundos
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              Cada um joga contra a banca, não contra os outros. Aposta, recebe duas cartas e pede mais até
              quereres ficar — ou rebentares. A banca joga sozinha, com regras fixas. A mesa não acaba: entra
              e sai quando quiseres; no fim conta o saldo de cada um.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {BLACKJACK.map((p) => (
                <li key={p.text} className="panel flex items-center gap-4 p-4">
                  <span className="inline-flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-ivory font-display text-base font-bold text-[#1a1a1a] shadow">
                    {p.rank}
                  </span>
                  <span className="text-ivory/90">{p.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-subtle">
              As fichas são virtuais e não têm valor: não se compram, não se trocam e não dão prémios.
            </p>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-4 py-8 text-sm text-subtle sm:px-6">
        <span>Cards</span>
        <Link href="/dev/cards" className="hover:text-ivory">
          O baralho
        </Link>
      </footer>
    </div>
  );
}
