# PROMPT — Adicionar o jogo "Fodinha" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores de jogo puros, contrato `GameModule`, `GameRegistry`, vistas filtradas por jogador.

## Objetivo
Adicionar o segundo jogo, **Fodinha**, como módulo novo em `packages/games/fodinha`, com UI própria, reutilizando todo o núcleo (salas, sockets, auth, baralho, componentes de cartas, animações).

Isto é também o **teste de extensibilidade** da plataforma: se precisares de mexer no núcleo para além do que está em `04-ALTERACOES-AO-NUCLEO.md`, para e explica porquê antes de o fazer.

## Documentos
- `02-REGRAS-FODINHA.md` — regras (fonte de verdade)
- `03-CONTRATO-FODINHA.md` — estado, ações, vistas, eventos, algoritmos
- `04-ALTERACOES-AO-NUCLEO.md` — mudanças permitidas no núcleo
- `05-GUIAO-DE-PARTIDA.md` — partida de exemplo; tem de ser reproduzida por um teste automático com baralho fixo
- `06-UI-FODINHA.md` — especificação visual e de interação
- `07-TESTES-FODINHA.md` — cenários e invariantes obrigatórios
- `08-PLANO-FASES.md` — fases e critérios de aceitação
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as que estiverem fechadas, pergunta sobre as outras

## Resumo do jogo (detalhe no 02)
- Baralho de 52 cartas, sem jokers. 2 a 10 jogadores.
- Rondas com 1, 2, 3, 4, 5, 4, 3, 2, 1, 2… cartas por jogador.
- Antes de jogar, cada jogador aposta quantas vazas vai fazer (bloqueado após apostar).
- Quem falha a aposta leva os pontos da ronda. Se ninguém falhar, o valor acumula para a ronda seguinte.
- Ao atingir 5 pontos (configurável) perde-se e o jogo acaba. Pode perder mais do que um.
- Rondas de 1 carta são **às cegas**: vês as cartas dos outros, não a tua.
- Ganha a vaza a carta mais alta; o Ás de Ouros bate todos. Empate na carta mais alta: ninguém ganha a vaza.

## Requisitos não negociáveis
1. **Informação oculta à prova de fugas.** Na ronda às cegas, o servidor NUNCA envia a um jogador a sua própria carta; nas outras rondas, nunca envia as mãos alheias. Teste automático obrigatório que serializa cada `PlayerView` e verifica isto.
2. **Motor puro e determinístico**, com esperas (mostrar vaza, resumo de ronda) feitas através de ações de sistema agendadas pelo servidor (ver 04).
3. **Configuração por sala** validada com Zod: `maxPoints`, `maxHandSize`, temporizador, e as opções de variante do 09.
4. **Reutilização visual total**: baralho, feltro, componentes `Card`, animações e sons da Mexicana. Só criar componentes novos quando o 06 o pedir.
5. **Guião do 05 como teste**: com a ordem de baralho fixa do guião, o motor tem de produzir exatamente os resultados descritos.

## Método
- Segue o 08 fase a fase e para no fim de cada uma para aprovação.
- Antes de codificar, apresenta: diff proposto ao núcleo (04), tipos finais do 03, e a lista de testes do 07 que vais implementar.
- Não inventes regras. Se o 02 ou o 09 não cobrirem um caso, pergunta.


---

# Regras da Fodinha — Especificação (v1.0)

> Família de jogos de "apostar vazas" (semelhante a *Oh Hell*). Estas regras prevalecem sempre.

## 1. Objetivo
**Não perder.** Não há vencedores: há perdedores e sobreviventes.
Cada jogador acumula pontos de penalização. Quem atingir `maxPoints` (por omissão **5**) perde e o jogo termina.

## 2. Material e jogadores
- Baralho de **52 cartas, sem jokers**.
- **2 a 10 jogadores.**
- Restrição de configuração: `jogadores × maxHandSize ≤ 52` (com 10 jogadores e mão máxima de 5 → 50 cartas).

## 3. Hierarquia
`2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < A♦`
- Os naipes **não contam**, com uma exceção: o **Ás de Ouros** é a carta mais forte do jogo e bate os outros três Ases.
- Duas cartas do mesmo valor (ex.: 9♠ e 9♥) têm a mesma força.

## 4. Sequência de rondas
O número de cartas por jogador segue um ciclo que sobe e desce:

`1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, …`

- Com `maxHandSize = 5`, o ciclo tem 8 rondas: `[1, 2, 3, 4, 5, 4, 3, 2]` e repete.
- `maxHandSize` é configurável (proposta: 3 a 7, respeitando a restrição da secção 2).

## 5. Quem começa
- Na **primeira ronda** da partida, o jogador inicial é sorteado.
- Em cada ronda seguinte, começa o **próximo jogador no sentido dos ponteiros do relógio**.
- Quem começa a apostar é também quem joga a primeira carta da ronda.

## 6. Visibilidade das cartas
| Ronda | O próprio vê a sua mão? | Os outros veem a mão dele? |
|---|---|---|
| 1 carta (às cegas) | **Não** | **Sim** |
| 2 ou mais cartas | Sim | Não |

Isto aplica-se a **todas** as rondas de 1 carta, não só à primeira da partida.

## 7. Apostas
1. Depois de distribuir, cada jogador aposta, **por ordem dos ponteiros do relógio** a partir de quem começa, quantas vazas vai ganhar nessa ronda.
2. A aposta é um inteiro entre **0 e o número de cartas da ronda**.
3. A aposta é **pública** e fica **bloqueada** assim que é feita; não se pode alterar.
4. Todos veem, em tempo real, a soma das apostas face ao número de vazas em jogo.
5. Restrição do último a apostar: ver `09-PONTOS-EM-ABERTO.md` (#1).

## 8. Jogar as vazas
1. Uma ronda com N cartas tem **N vazas**.
2. Na primeira vaza, joga primeiro quem começou a apostar; segue-se a ordem dos ponteiros do relógio, uma carta por jogador.
3. Pode jogar-se **qualquer carta** da mão (não há obrigação de seguir naipe — confirmar no 09 #3).
4. Na ronda às cegas, cada jogador tem uma única carta que não conhece; ao chegar a sua vez, joga-a (ver 09 #6).
5. **Quem aposta primeiro abre todas as vazas da ronda**, seja qual for o resultado da vaza anterior (ganha por alguém ou empatada). Na ronda seguinte começa o jogador seguinte no sentido dos ponteiros do relógio. Não é configurável.

## 9. Quem ganha a vaza
- Ganha a vaza quem jogou a **carta mais alta**, se for a **única** com essa força.
- Se **dois ou mais** jogadores jogarem cartas com a mesma força máxima, **ninguém ganha a vaza**. As cartas saem da mesa e a vaza não conta para ninguém.
- O Ás de Ouros nunca empata (é único).

| Cartas na vaza | Resultado |
|---|---|
| 9♠, K♥, 4♣ | K♥ ganha |
| K♥, K♠, 4♣ | Ninguém (empate nos Reis) |
| A♠, A♥, K♦ | Ninguém (empate nos Ases) |
| A♠, A♦, A♥ | A♦ ganha |
| Q♠, Q♥, Q♦, J♣ | Ninguém |
| 5♣, 5♦ (2 jogadores) | Ninguém |

Consequência: numa ronda, a soma das vazas ganhas pode ser **menor** que o número de cartas.

## 10. Pontuação
No fim da ronda, cada jogador compara vazas ganhas com a sua aposta.
- Acertou exatamente → não leva pontos.
- Falhou (mais ou menos) → **falhou a ronda**.

**Valor da ronda** = `1 + acumulado`.
- Se **pelo menos um** jogador falhou: cada jogador que falhou recebe o valor da ronda em pontos; o acumulado volta a 0.
- Se **ninguém** falhou: ninguém recebe pontos e o acumulado sobe 1 (a ronda seguinte vale mais 1 ponto).

Exemplo: ronda 6 sem falhas → ronda 7 vale 2; ronda 7 também sem falhas → ronda 8 vale 3; na ronda 8 dois jogadores falham → cada um leva 3 pontos, acumulado volta a 0.

O valor por falhar não depende de quanto se falhou (falhar por 1 ou por 3 dá o mesmo).

## 11. Fim do jogo
- Depois de pontuar cada ronda: se algum jogador tiver `pontos ≥ maxPoints`, o jogo termina.
- **Perdem todos** os que estiverem nessa situação (pode ser mais do que um).
- Os restantes são **sobreviventes**.
- Nova partida na mesma sala: ver 09 #4.

## 12. Temporizador
- 30 s por decisão (apostar ou jogar carta), configurável.
- O que acontece ao expirar: ver 09 #5.


---

# Contrato Técnico — Fodinha

Implementa `GameModule` (ver contrato da plataforma, com as alterações do `04`).

## 1. Configuração
```ts
const FodinhaConfigSchema = z.object({
  displayName: z.string().default("Fodinha"),
  maxPoints: z.number().int().min(1).max(20).default(5),
  maxHandSize: z.number().int().min(1).max(10).default(5),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  lastBidderRestriction: z.boolean().default(false),       // 09 #1
});
// Validação cruzada no setup: players.length * maxHandSize <= 52
```
- `minPlayers: 2`, `maxPlayers: 10`.
- Baralho: `createDeck({ jokers: false })` do `game-core`.

## 2. Força das cartas
```ts
const RANK_STRENGTH = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };
const strength = (c: Card) => (c.rank === "A" && c.suit === "D") ? 15 : RANK_STRENGTH[c.rank];
```

## 3. Sequência de mãos
```ts
function handSizeForRound(round: number /* 1-based */, max: number): number {
  if (max === 1) return 1;
  const cycle = [...range(1, max), ...range(max - 1, 2)]; // max=5 → [1,2,3,4,5,4,3,2]
  return cycle[(round - 1) % cycle.length];
}
```

## 4. Estado (servidor)
```ts
type Phase = "BIDDING" | "PLAYING" | "TRICK_RESOLVED" | "ROUND_SCORED" | "FINISHED";

interface FodinhaState {
  phase: Phase;
  config: FodinhaConfig;
  seats: PlayerId[];                         // ordem dos ponteiros do relógio
  round: number;                             // 1-based
  handSize: number;
  starterIndex: number;                      // quem aposta e joga primeiro nesta ronda
  currentIndex: number;                      // de quem é a vez
  hands: Record<PlayerId, Card[]>;
  bids: Record<PlayerId, number | null>;
  tricksWon: Record<PlayerId, number>;
  trick: { leaderIndex: number; plays: { playerId: PlayerId; card: Card }[] };
  lastTrick: { plays: { playerId: PlayerId; card: Card }[]; winner: PlayerId | null } | null;
  tricksPlayed: number;
  points: Record<PlayerId, number>;
  carry: number;                             // rondas seguidas sem falhas
  history: RoundSummary[];
  losers: PlayerId[];
  seed: string;
}

interface RoundSummary {
  round: number; handSize: number; value: number;
  rows: { playerId: PlayerId; bid: number; won: number; failed: boolean; pointsAdded: number }[];
  carryAfter: number;
}
```

## 5. Ações
```ts
type FodinhaAction =
  // jogador
  | { type: "PLACE_BID"; bid: number }
  | { type: "PLAY_CARD"; cardId: CardId }        // ronda às cegas: ver 09 #6
  // sistema (só o servidor emite; ver 04)
  | { type: "SYS_RESOLVE_TRICK_DONE" }           // após mostrar a vaza
  | { type: "SYS_NEXT_ROUND" }                   // após o resumo da ronda
  | { type: "SYS_TIMEOUT" };                     // ao expirar o temporizador (09 #5)
```

### Transições
| Fase | Ação | Efeito |
|---|---|---|
| BIDDING | PLACE_BID (jogador da vez) | regista, avança; após o último → PLAYING, vez = starter |
| PLAYING | PLAY_CARD (jogador da vez) | carta sai da mão para `trick.plays`; após o último da vaza → resolve, `TRICK_RESOLVED` + agenda `SYS_RESOLVE_TRICK_DONE` (1200 ms) |
| TRICK_RESOLVED | SYS_RESOLVE_TRICK_DONE | se houver vazas por jogar → PLAYING, abre de novo o starter da ronda; senão pontua → `ROUND_SCORED` + agenda `SYS_NEXT_ROUND` (3500 ms) ou `FINISHED` |
| ROUND_SCORED | SYS_NEXT_ROUND | round+1, starter+1, distribui, BIDDING |

## 6. Algoritmos
```ts
function resolveTrick(plays: Play[]): PlayerId | null {
  const top = Math.max(...plays.map(p => strength(p.card)));
  const best = plays.filter(p => strength(p.card) === top);
  return best.length === 1 ? best[0].playerId : null;
}

function scoreRound(s: FodinhaState) {
  const value = 1 + s.carry;
  const failed = s.seats.filter(p => s.tricksWon[p] !== s.bids[p]);
  if (failed.length > 0) { failed.forEach(p => s.points[p] += value); s.carry = 0; }
  else { s.carry += 1; }
  s.losers = s.seats.filter(p => s.points[p] >= s.config.maxPoints);
  s.phase = s.losers.length ? "FINISHED" : "ROUND_SCORED";
}

function validBids(s: FodinhaState, player: PlayerId): number[] {
  const all = range(0, s.handSize);
  const isLast = s.seats.filter(p => s.bids[p] === null).length === 1;
  if (!s.config.lastBidderRestriction || !isLast) return all;
  const sum = s.seats.reduce((a, p) => a + (s.bids[p] ?? 0), 0);
  return all.filter(b => sum + b !== s.handSize);
}
```

## 7. Vista por jogador
```ts
interface FodinhaPlayerView {
  phase: Phase;
  round: number; handSize: number; roundValue: number; carry: number;
  blind: boolean;                                  // handSize === 1
  me: {
    id: PlayerId;
    hand: Card[] | null;                           // null na ronda às cegas
    handCount: number;
  };
  seats: {
    id: PlayerId;
    handCount: number;
    visibleHand: Card[] | null;                    // só na ronda às cegas, e nunca para "me"
    bid: number | null;
    tricksWon: number;
    points: number;
    isStarter: boolean;
  }[];
  currentPlayerId: PlayerId | null;
  bidsSum: number;
  trick: { playerId: PlayerId; card: Card }[];     // cartas já jogadas nesta vaza (públicas)
  lastTrick: { plays: { playerId: PlayerId; card: Card }[]; winner: PlayerId | null } | null;
  validActions: FodinhaAction[];                   // só do próprio
  history: RoundSummary[];
  losers: PlayerId[];
  turnDeadline: number | null;                     // epoch ms, preenchido pelo servidor
}
```
**Regra de ouro:** na ronda às cegas, `me.hand` é `null` e o próprio **não aparece** com `visibleHand` preenchido em nenhum sítio da vista. Nas outras rondas, `visibleHand` é `null` para todos.

## 8. Eventos de domínio (para animações)
| Evento | Payload |
|---|---|
| `RoundStarted` | `{ round, handSize, value, starterId, blind }` |
| `CardsDealt` | `{ counts }` (nunca as cartas) |
| `BidPlaced` | `{ playerId, bid, bidsSum }` |
| `CardPlayed` | `{ playerId, card }` |
| `TrickResolved` | `{ winner: PlayerId \| null, tiedPlayerIds: PlayerId[] }` |
| `RoundScored` | `RoundSummary` |
| `GameFinished` | `{ losers, survivors, points }` |


---

# Alterações ao Núcleo da Plataforma

A Fodinha expõe três limitações do contrato original. Estas são as **únicas** alterações permitidas ao núcleo. Todas têm de manter a Mexicana a funcionar (testes verdes) no fim da Fase 0.

## 1. `GameResult` genérico (vencedores, posições ou só perdedores)
**Problema:** o contrato assumia posições finais (1.º, 2.º…). Na Fodinha só há perdedores e sobreviventes.

```ts
type Outcome = "WINNER" | "LOSER" | "SURVIVOR" | "PLACED";

interface GameResult {
  standings: {
    playerId: PlayerId;
    outcome: Outcome;
    position?: number;        // Mexicana usa
    score?: number;           // Fodinha usa (pontos finais)
  }[];
  summary?: Record<string, unknown>;   // específico do jogo, só para mostrar
}
```
- Mexicana: primeiro a sair = `WINNER`, intermédios = `PLACED`, último = `LOSER`.
- Fodinha: quem atingiu `maxPoints` = `LOSER`, restantes = `SURVIVOR`.

**Prisma:**
```prisma
enum Outcome { WINNER LOSER SURVIVOR PLACED }

model MatchPlayer {
  // …campos existentes
  finalPosition Int?
  outcome       Outcome?
  score         Int?
}
```
Migração não destrutiva; preencher `outcome` das partidas antigas da Mexicana a partir de `finalPosition`.

## 2. Ações de sistema agendadas
**Problema:** o motor é puro e não conhece o relógio, mas a Fodinha precisa de pausas (mostrar quem ganhou a vaza, mostrar o resumo da ronda) antes de avançar.

**Solução:** o `Result` do motor passa a poder pedir agendamentos; o servidor executa-os.
```ts
type Result<S> =
  | { ok: true; state: S; events: DomainEvent[]; schedule?: { action: unknown; delayMs: number }[] }
  | { ok: false; error: GameError };
```
- O servidor guarda os agendamentos com a sala (Redis, com TTL) para sobreviverem a reinícios.
- Ações de sistema entram pelo mesmo `applyAction` com `playerId = SYSTEM`; o motor rejeita-as vindas de jogadores.
- O temporizador de turno também passa a usar este mecanismo (`SYS_TIMEOUT`), unificando com a Mexicana.
- Qualquer ação nova invalida agendamentos obsoletos (usar `stateVersion` no agendamento).

## 3. Configuração por jogo no lobby
**Problema:** cada jogo tem opções próprias (Fodinha: pontos máximos, mão máxima, variantes).

**Solução:**
- `GameModule` passa a expor `configUi` (metadados para gerar o formulário: rótulo, tipo, ajuda) além do `configSchema`.
- O ecrã "Criar sala" gera o formulário a partir destes metadados; valores por omissão vêm do schema.
- `minPlayers`/`maxPlayers` passam a vir do módulo (Mexicana 2–6, Fodinha 2–10).
- A configuração fica visível a todos na sala antes de começar.

## O que NÃO muda
- Auth, salas, reconexão, Redis adapter, baralho, componentes de cartas, animações base, persistência do log de ações.


---

# Guião de Partida — Exemplo Completo

Serve para validar a compreensão das regras e **tem de ser reproduzido por um teste automático** com as cartas indicadas (injeção de baralho fixo).

**Mesa:** Ana, Bruno, Carla, Duarte (por esta ordem, sentido dos ponteiros do relógio).
**Configuração:** `maxPoints = 5`, `maxHandSize = 5`, restantes por omissão. Quem começa a ronda abre todas as vazas dessa ronda.
**Sorteio inicial:** Ana começa.

## Calendário de rondas
| Ronda | Cartas | Começa |
|---|---|---|
| 1 | 1 (às cegas) | Ana |
| 2 | 2 | Bruno |
| 3 | 3 | Carla |
| 4 | 4 | Duarte |
| 5 | 5 | Ana |
| 6 | 4 | Bruno |
| 7 | 3 | Carla |
| 8 | 2 | Duarte |
| 9 | 1 (às cegas) | Ana |
| 10 | 2 | Bruno |

---

## Ronda 1 — 1 carta, às cegas, vale 1
**Cartas:** Ana 7♣ · Bruno K♠ · Carla 3♥ · Duarte K♦

**O que cada um vê:**
| Jogador | Vê | Não vê |
|---|---|---|
| Ana | K♠, 3♥, K♦ | a sua (7♣) |
| Bruno | 7♣, 3♥, K♦ | a sua (K♠) |
| Carla | 7♣, K♠, K♦ | a sua (3♥) |
| Duarte | 7♣, K♠, 3♥ | a sua (K♦) |

**Apostas** (Ana → Bruno → Carla → Duarte):
- Ana vê dois Reis: só ganharia com um Ás. Aposta **0**.
- Bruno vê um Rei: se o dele for Rei, empata; só ganha com Ás. Aposta **0**.
- Carla vê dois Reis. Aposta **0**.
- Duarte vê um Rei. Aposta **0**.

Soma das apostas: 0 de 1.

**Vaza:** 7♣, K♠, 3♥, K♦ → empate nos Reis → **ninguém ganha**.

**Resultado:** todos apostaram 0 e fizeram 0 → **ninguém falhou**. Acumulado passa a 1.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 0 | 0 | 0 | 0 |

➡️ Ronda 2 vale **2**.

---

## Ronda 2 — 2 cartas, vale 2
**Mãos:** Bruno A♦ 4♠ · Carla 9♥ 9♣ · Duarte Q♠ 5♦ · Ana A♠ 2♣

**Apostas** (Bruno → Carla → Duarte → Ana): Bruno **1**, Carla **0**, Duarte **1**, Ana **1**. Soma 3 de 2 vazas (alguém vai falhar).

**Vaza 1** (abre Bruno): Bruno 4♠, Carla 9♥, Duarte Q♠, Ana A♠ → **Ana ganha**.
**Vaza 2** (abre Bruno): Bruno A♦, Carla 9♣, Duarte 5♦, Ana 2♣ → **Bruno ganha** (Ás de Ouros).

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Bruno | 1 | 1 | ✓ |
| Carla | 0 | 0 | ✓ |
| Duarte | 1 | 0 | ✗ +2 |
| Ana | 1 | 1 | ✓ |

Acumulado volta a 0.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 0 | 0 | 0 | 2 |

➡️ Ronda 3 vale **1**.

---

## Ronda 3 — 3 cartas, vale 1
**Mãos:** Carla J♥ 6♠ 2♦ · Duarte J♠ 10♣ 3♣ · Ana 8♦ 7♥ 4♦ · Bruno K♥ 5♠ 3♠

**Apostas** (Carla → Duarte → Ana → Bruno): Carla **1**, Duarte **1**, Ana **0**, Bruno **1**. Soma 3 de 3.

**Vaza 1** (abre Carla): Carla J♥, Duarte J♠, Ana 8♦, Bruno 5♠ → empate nos Valetes → **ninguém**.
**Vaza 2** (abre Carla): Carla 2♦, Duarte 10♣, Ana 4♦, Bruno K♥ → **Bruno ganha**.
**Vaza 3** (abre Carla): Carla 6♠, Duarte 3♣, Ana 7♥, Bruno 3♠ → **Ana ganha** (contra a vontade dela).

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Carla | 1 | 0 | ✗ +1 |
| Duarte | 1 | 0 | ✗ +1 |
| Ana | 0 | 1 | ✗ +1 |
| Bruno | 1 | 1 | ✓ |

Nota: só se ganharam 2 vazas em 3 (uma empatou).

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 1 | 0 | 1 | 3 |

---

## Rondas 4 a 8 — resumo
| Ronda | Cartas | Começa | Vale | Falharam | Acumulado depois | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 4 | Duarte | 1 | Bruno | 0 | 1 | 1 | 1 | 3 |
| 5 | 5 | Ana | 1 | Ana | 0 | 2 | 1 | 1 | 3 |
| 6 | 4 | Bruno | 1 | ninguém | 1 | 2 | 1 | 1 | 3 |
| 7 | 3 | Carla | **2** | Carla | 0 | 2 | 1 | 3 | 3 |
| 8 | 2 | Duarte | 1 | todos | 0 | 3 | 2 | 4 | 4 |

---

## Ronda 9 — 1 carta, às cegas, vale 1
**Cartas:** Ana 10♥ · Bruno 4♣ · Carla Q♦ · Duarte 2♠

**Apostas** (Ana → Bruno → Carla → Duarte):
- Ana vê 4♣, Q♦, 2♠: precisa de K ou Ás. Aposta **0**.
- Bruno vê 10♥, Q♦, 2♠: aposta **0**.
- Carla vê 10♥, 4♣, 2♠: a mais alta que vê é um 10, arrisca. Aposta **1**.
- Duarte vê 10♥, 4♣, Q♦: acha que tem hipótese. Aposta **1**.

**Vaza:** 10♥, 4♣, Q♦, 2♠ → **Carla ganha**.

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Ana | 0 | 0 | ✓ |
| Bruno | 0 | 0 | ✓ |
| Carla | 1 | 1 | ✓ |
| Duarte | 1 | 0 | ✗ +1 |

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 3 | 2 | 4 | **5** |

## Fim
Duarte atinge 5 → **o jogo termina**.
- **Perdeu:** Duarte
- **Sobreviveram:** Ana, Bruno, Carla

### Variante do final (para testar múltiplos perdedores)
Se na ronda 9 a Carla tivesse apostado **0** (e ganho a vaza na mesma), falhava também: Carla 5, Duarte 5 → **perdem os dois**; Ana e Bruno sobrevivem.


---

# UI da Fodinha

Reutiliza **tudo** da especificação visual da Mexicana (`06-DESIGN-CARTAS-E-UI.md`): baralho clássico, feltro, componentes `Card`, tempos de animação, sons, acessibilidade, responsivo, 60 fps. Aqui fica só o que é específico.

## 1. Layout da mesa
- Até 10 lugares à volta de uma mesa oval; o jogador local sempre em baixo, ao centro.
- Cada lugar: avatar, nome, **pontos** (pips), **aposta**, **vazas feitas**, cartas na mão (versos ou cara, conforme a ronda).
- Centro: área da vaza (cartas jogadas em frente a cada lugar, viradas ao centro), e por cima uma **faixa de ronda**.
- Com 7–10 jogadores, cartas dos adversários em `sm` e avatares compactos.

## 2. Faixa de ronda (topo da mesa)
`Ronda 7 · 3 cartas · vale 2 pontos`
- Quando há acumulado, o valor aparece em destaque com um selo "Acumulado ×2".
- Durante as apostas: `Apostas 3 / 5 vazas` atualizado em tempo real, com texto "Faltam 2" ou "Excesso de 1".

## 3. Ronda às cegas (1 carta)
- A **tua carta aparece de costas**, levantada acima do teu avatar ("na testa"), com legenda discreta: *"A tua carta — não a podes ver"*.
- As cartas dos adversários aparecem **de cara para cima** à frente de cada um.
- Na jogada, a tua carta desliza de costas para o centro e **vira só quando chega à mesa** (flip de 400 ms).
- Garantia técnica: o cliente não recebe a carta; o flip usa o valor que chega no evento `CardPlayed`.

## 4. Painel de apostas
- Aparece na base quando é a tua vez: botões `0 1 2 … N`, grandes e com toque fácil.
- Se a restrição do último apostador estiver ativa, o valor proibido aparece riscado com tooltip.
- Confirmação num segundo toque (evita apostas acidentais): primeiro toque seleciona, botão "Apostar 2" confirma.
- Depois de apostar, aparece no teu lugar uma etiqueta fixa **"Aposta 2"** com ícone de cadeado.
- Apostas dos outros aparecem à medida que chegam, com pequena animação.

## 5. Indicador de cada lugar durante o jogo
`Aposta 2 · Feitas 1`
- Verde quando feitas = aposta (neste momento acerta).
- Âmbar quando ainda faltam vazas.
- Vermelho quando já passou da aposta (já falhou, sem volta).

## 6. Resolução da vaza
- Pausa de 1200 ms depois da última carta.
- **Vencedor:** a carta vencedora brilha (contorno dourado 2 px + leve escala 1,05), as cartas deslizam para o monte do vencedor, `Feitas` incrementa com animação.
- **Empate:** as cartas empatadas tremem ligeiramente e ficam acinzentadas, legenda *"Empate — ninguém ganha"*, todas deslizam para fora da mesa.
- Botão/atalho para ver a última vaza (pequeno ícone junto à área central).

## 7. Resumo da ronda (3,5 s, sobreposto)
| Jogador | Aposta | Fez | | Pontos |
|---|---|---|---|---|
| Carla | 1 | 0 | ✗ | +1 → 3 |

- Quem falhou em vermelho; se ninguém falhou: *"Ninguém falhou — a próxima ronda vale 2"*.
- Toque para fechar mais cedo (só para ti; o jogo avança pelo servidor).

## 8. Marcador de pontos
- Pips por jogador: `●●●○○` (preenchidos = pontos, total = `maxPoints`).
- A 1 ponto do limite: pips a vermelho e avatar com contorno vermelho ("em risco").
- Histórico completo de rondas acessível por um painel lateral (tabela ronda a ronda).

## 9. Fim de jogo
- Ecrã com **"Perdeu"** (em destaque, com os pontos) e **"Sobreviveram"**.
- Botões: "Nova partida" (mesma sala e configuração) e "Voltar ao lobby".

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 60 ms, 220 ms por carta |
| Aposta aparece | 180 ms |
| Jogar carta | 260 ms |
| Pausa antes de resolver vaza | 1200 ms (servidor) |
| Resolver vaza | 450 ms |
| Resumo da ronda | 3500 ms (servidor) |
| Flip da carta às cegas | 400 ms |


---

# Testes Obrigatórios — Fodinha

Cobertura mínima de 90% no motor. Todos os testes sobre o motor puro, com baralho injetado.

## 1. Sequência e rotação
- `handSizeForRound` para `max = 1, 2, 3, 5, 7`, 30 rondas cada (ex.: max 5 → 1,2,3,4,5,4,3,2,1,2…).
- `starterIndex` avança 1 por ronda e dá a volta à mesa.
- Validação: 11 jogadores rejeitado; 10 jogadores com `maxHandSize = 6` rejeitado (60 > 52).

## 2. Visibilidade (segurança)
- Ronda de 1 carta: para cada jogador, `me.hand === null` e o JSON da vista **não contém** o id da sua carta.
- Ronda de 1 carta: cada vista contém as cartas de todos os outros.
- Ronda ≥ 2: o JSON da vista de cada jogador **não contém** nenhum id de carta das mãos alheias.
- `CardsDealt` nunca contém cartas.
- Ronda às cegas no meio da partida (ronda 9) também é às cegas.

## 3. Apostas
- Só o jogador da vez pode apostar; fora de vez → erro.
- Aposta fora de `0..N` → erro.
- Segunda aposta do mesmo jogador → erro (bloqueio).
- Ordem começa no `starterIndex`.
- Com `lastBidderRestriction`: o valor que faria soma = N é inválido; os outros são válidos; nos restantes apostadores não há restrição.
- `PLAY_CARD` durante BIDDING → erro.

## 4. Jogo das vazas
- Primeira vaza abre o starter.
- Carta que não está na mão → erro. Jogar fora de vez → erro.
- Todas as vazas da ronda abrem no starter, depois de uma vaza ganha por outro jogador e depois de um empate; na ronda seguinte abre o jogador seguinte (sentido horário, com volta do último ao primeiro).
- Todas as cartas da tabela da secção 9 do 02 resolvem como indicado.
- A♦ bate A♠/A♥/A♣; A♠ + A♥ sem A♦ → empate.
- Três ou mais empatados no topo → ninguém.

## 5. Pontuação
- Acerto exato → 0 pontos. Falha por mais e por menos → valor da ronda.
- Ninguém falha → `carry` +1; ronda seguinte vale `1 + carry`.
- Duas rondas seguidas sem falhas → a terceira vale 3.
- Após uma ronda com falhas, `carry = 0`.
- Todos falham → todos recebem o valor.

## 6. Fim de jogo
- Um jogador atinge `maxPoints` → FINISHED, um perdedor.
- Dois atingem na mesma ronda → dois perdedores.
- Jogador ultrapassa (4 + valor 3 = 7) → perde na mesma.
- `GameResult`: perdedores `LOSER`, restantes `SURVIVOR`, `score` preenchido.

## 7. Sistema e tempo
- `PLAY_CARD` da última carta da vaza devolve `schedule` com `SYS_RESOLVE_TRICK_DONE`.
- Ação de sistema vinda de um jogador → rejeitada.
- Agendamento com `stateVersion` antigo → ignorado.
- `SYS_TIMEOUT` em BIDDING e em PLAYING aplica o comportamento decidido no 09 #5.

## 8. Guião
- Teste de integração do motor que reproduz o `05-GUIAO-DE-PARTIDA.md` (rondas 1, 2, 3 e 9 com cartas exatas; rondas 4–8 com mãos geradas que produzam as falhas indicadas) e verifica pontos, acumulado e perdedores.
- Variante do final com dois perdedores.

## 9. Simulação
- 10 000 partidas com 2–10 jogadores e bots aleatórios.
- Invariantes em cada passo:
  - Conservação: cartas nas mãos + cartas jogadas nesta ronda = `jogadores × handSize`.
  - Soma de `tricksWon` ≤ vazas jogadas.
  - `points` nunca diminui.
  - A partida termina sempre (com `maxPoints = 5` deve terminar em < 200 rondas; registar máximo e média).


---

# Plano de Fases — Fodinha

## Fase 0 — Alterações ao núcleo
- Implementar o `04-ALTERACOES-AO-NUCLEO.md`: `GameResult` genérico + migração, ações de sistema agendadas (Redis), `configUi` + formulário no lobby, min/max jogadores por módulo.
- Adaptar a Mexicana ao novo `GameResult` e ao `SYS_TIMEOUT`.
- **Feito quando:** todos os testes da Mexicana passam, uma partida da Mexicana joga-se normalmente, e o formulário de criação de sala muda consoante o jogo escolhido.

## Fase 1 — Motor da Fodinha
- `packages/games/fodinha`: config, estado, ações, algoritmos do `03`, `getPlayerView`, `getValidActions`, `getDefaultAction`.
- Todos os testes do `07`, incluindo guião e simulação.
- Registo no `GameRegistry`.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 simulações sem violar invariantes.

## Fase 2 — UI da Fodinha
- Componentes do `06`: mesa até 10 lugares, faixa de ronda, ronda às cegas, painel de apostas, indicadores, resolução de vaza, resumo de ronda, marcador, fim de jogo.
- Página `/dev/fodinha` com estados fixos (às cegas, apostas, empate, resumo, fim) para aprovação visual sem precisar de jogar.
- **Feito quando:** estados aprovados visualmente, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 4 contas (Playwright), incluindo reconexão a meio de uma ronda às cegas (a carta própria continua escondida após reconectar).
- Histórico e resultado gravados com `outcome` e `score`.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida inteira em produção.


---

# Pontos em Aberto — Fodinha

Cada ponto tem uma **proposta por omissão**. Responde "ok" para aceitar todas, ou só com os números que queres mudar.

| # | Questão | Proposta por omissão | Decisão |
|---|---|---|---|
| 1 | **Último a apostar** pode fazer a soma das apostas igual ao nº de cartas? (Em muitas mesas é proibido, para garantir que alguém falha.) | Permitido, com opção de sala `lastBidderRestriction` para ligar a regra | |
| 2 | **Quem abre as vazas seguintes?** E depois de um empate? | Abre quem ganhou a vaza anterior; em empate volta a abrir quem abriu a vaza empatada | **Fechado:** quem aposta primeiro abre todas as vazas da ronda (ganhas ou empatadas); na ronda seguinte começa o jogador seguinte no sentido dos ponteiros do relógio. Sem configuração. |
| 3 | É obrigatório **seguir o naipe**? | Não; joga-se qualquer carta | |
| 4 | **Nova partida** na mesma sala: quem começa? | Um dos perdedores (sorteado se forem vários) | |
| 5 | **Temporizador expira** (30 s): o que acontece? | A apostar: aposta automática 0. A jogar: joga automaticamente a carta mais baixa. Sem penalização extra | |
| 6 | **Ronda às cegas**: o jogador tem de clicar para jogar a carta que não vê, ou a carta é jogada automaticamente? | Automática, pela ordem, com 700 ms entre cada uma (não há decisão possível) | |
| 7 | Mão máxima configurável na sala? | Sim, 3 a 7, por omissão 5 (limitada pela regra de 52 cartas) | |
| 8 | Pontos máximos configuráveis? | Sim, 3 a 15, por omissão 5 | |
| 9 | O **acumulado** tem limite? | Não | |
| 10 | Mostrar **as apostas dos outros** durante a vez de apostar? | Sim, sempre públicas e em tempo real | |


---

