# PROMPT — Adicionar o jogo "Sueca" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas e configuração por jogo.

## Objetivo
Adicionar a **Sueca** como módulo em `packages/games/sueca`, com a qualidade de um produto de referência: regras tradicionais portuguesas sem atalhos, impossibilidade total de batota pela plataforma e uma interface limpa.

## Documentos
- `02-REGRAS-SUECA.md` — regras (fonte de verdade)
- `03-CONTRATO-SUECA.md` — estado, ações, algoritmos, vistas, eventos
- `04-NUCLEO.md` — as duas únicas alterações ao núcleo permitidas
- `05-GUIAO-DE-MAO.md` — mão completa; teste automático obrigatório com baralho fixo
- `06-UI-SUECA.md` — especificação visual e de interação
- `07-TESTES-SUECA.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 4 jogadores reais, 2 equipas, parceiros frente a frente; os jogadores escolhem os lugares.
- 40 cartas (sem 8, 9, 10). Ordem: Ás, 7, Rei, Valete, Dama, 6, 5, 4, 3, 2. Pontos: 11, 10, 4, 3, 2 (total 120).
- Quem corta escolhe se o trunfo é a carta de cima ou de baixo; o trunfo fica com quem dá.
- Joga-se no sentido contrário aos ponteiros do relógio; é obrigatório assistir; o servidor impede a renúncia.
- Mão: 61–90 = 1 jogo · 91–119 = 2 · 120 = 4 · 60–60 = ninguém pontua. Partida até 4 jogos (configurável).

## Requisitos não negociáveis
1. **Batota impossível.** O servidor só aceita cartas legais (assistir ao naipe). A UI só deixa tocar nas cartas legais.
2. **Sem sinais entre parceiros pela plataforma.** Chat da mesa bloqueado durante a mão; sem reações durante a mão. (Voz externa fica fora de âmbito.)
3. **Só 4 jogadores reais.** Sem bots. Se alguém cair, o jogo pausa (ver 04 §2).
4. **Informação oculta.** Mãos alheias nunca saem do servidor. A carta de trunfo é pública até ser jogada.
5. **"Ver última vaza" limitado** conforme o 02 §9.
6. **Interface limpa** (06): sem contadores de pontos durante a mão, sem decoração supérflua.
7. **Reutilização visual** do baralho e dos componentes existentes.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: diff ao núcleo (04), tipos finais do 03, lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta. Não inventes variantes regionais.


---

# Regras da Sueca — Especificação (v1.0)

## 1. Objetivo
Cada equipa tenta fazer **mais de 60 pontos** em cada mão. Ganha a partida a primeira equipa a chegar ao número de **jogos** definido (por omissão **4**).

## 2. Jogadores e equipas
- **Exatamente 4 jogadores reais.**
- 2 equipas de 2; os **parceiros sentam-se frente a frente**.
- Os jogadores **escolhem o lugar** na sala antes de começar (o lugar define a equipa).

```
            Norte
   Oeste            Este
            Sul
Equipa A: Norte + Sul     Equipa B: Este + Oeste
```

## 3. Baralho
- **40 cartas**: baralho francês sem os 8, 9 e 10 (e sem jokers).

## 4. Ordem e pontos (em cada naipe, da mais forte para a mais fraca)
| Carta | Pontos |
|---|---|
| Ás | 11 |
| 7 (bisca/manilha) | 10 |
| Rei | 4 |
| Valete | 3 |
| Dama | 2 |
| 6 · 5 · 4 · 3 · 2 | 0 |

Total do baralho: **120 pontos**. Atenção: o Valete é mais forte que a Dama.

## 5. Sentido do jogo
Tudo roda no **sentido contrário aos ponteiros do relógio** (de Sul para Este, Norte, Oeste…).

## 6. Dar, cortar e trunfo
1. **Quem dá** na primeira mão é sorteado; depois passa ao jogador seguinte (sentido contrário aos ponteiros do relógio).
2. O jogador **à esquerda de quem dá** corta e **escolhe "de cima" ou "de baixo"** (09 #1).
3. A carta escolhida (a de cima ou a de baixo do baralho) é virada para cima: o seu naipe é o **trunfo**. Essa carta **pertence a quem dá**.
4. Distribuem-se **10 cartas a cada jogador** (a carta de trunfo conta como uma das 10 de quem dá).
5. A carta de trunfo fica **visível a todos** até quem dá a jogar.

## 7. Jogar as vazas
1. Abre a primeira vaza o jogador **à direita de quem dá** (o seguinte no sentido do jogo).
2. Cada jogador joga uma carta, por ordem.
3. **Obrigatório assistir:** quem tem cartas do naipe de saída tem de jogar desse naipe.
4. Quem não tem o naipe pode jogar **qualquer carta** (trunfar ou baldar). Não é obrigatório trunfar.
5. Ganha a vaza:
   - o **trunfo mais alto**, se houver trunfos;
   - senão, a **carta mais alta do naipe de saída**.
6. Quem ganha a vaza abre a seguinte.
7. **Renúncia impossível:** o servidor rejeita qualquer carta que não respeite a obrigação de assistir.

## 8. Pontuação da mão
No fim das 10 vazas soma-se o valor das cartas ganhas por cada equipa.

| Pontos da equipa | Jogos ganhos |
|---|---|
| 61 a 90 | 1 |
| 91 a 119 | 2 (capote) |
| 120 | 4 (bandeira) — 09 #2 |
| 60 – 60 | **ninguém pontua** |

## 9. Ver a última vaza
- Durante a mão, cada jogador pode ver **a última vaza fechada**, mas **só uma vez** (09 #3 sobre o âmbito).
- Mostra as 4 cartas e quem jogou cada uma, durante 3 s.

## 10. Partida
- Ganha a equipa que chegar primeiro a **4 jogos** (configurável: 1–10).
- Depois da partida, a sala pode começar outra; o marcador da sala guarda as partidas ganhas por cada equipa.

## 11. Comunicação
- **Chat da mesa bloqueado durante a mão.** Abre entre mãos e no fim da partida.
- Sem reações/emotes durante a mão (podem servir de sinais).
- Comunicação por voz externa: fora de âmbito.

## 12. Temporizadores
| Momento | Por omissão | Ao expirar |
|---|---|---|
| Cortar (escolher cima/baixo) | 15 s | escolha aleatória |
| Jogar carta | 30 s | o servidor joga a carta legal de menor valor (09 #5) |
| Resumo da mão | 5 s | avança para a mão seguinte |

## 13. Opções configuráveis da sala
| Opção | Por omissão |
|---|---|
| `targetGames` — jogos para ganhar a partida | 4 |
| `turnTimeoutMs` | 30 s |
| `cutTimeoutMs` | 15 s |
| `disconnectGraceMs` — pausa máxima antes de decidir (ver 04 §2) | 120 s |


---

# Contrato Técnico — Sueca

## 1. Configuração
```ts
const SuecaConfigSchema = z.object({
  targetGames: z.number().int().min(1).max(10).default(4),
  turnTimeoutMs: z.number().int().min(15_000).max(120_000).default(30_000),
  cutTimeoutMs: z.number().int().min(5_000).max(60_000).default(15_000),
  disconnectGraceMs: z.number().int().min(30_000).max(600_000).default(120_000),
});
```
- `minPlayers: 4`, `maxPlayers: 4`, `lifecycle: "MATCH"` (uma partida = várias mãos).
- `seating: { seats: ["S", "E", "N", "W"], teams: { A: ["S", "N"], B: ["E", "W"] } }` (ver 04 §1).
- `disconnectPolicy: "PAUSE"` (ver 04 §2).
- Baralho: `createShoe({ decks: 1, jokers: false, excludeRanks: ["8", "9", "10"] })`.

## 2. Ordem, força e pontos
```ts
const ORDER = ["A", "7", "K", "J", "Q", "6", "5", "4", "3", "2"];      // índice menor = mais forte
const POINTS = { A: 11, "7": 10, K: 4, J: 3, Q: 2 } as Record<string, number>;   // restantes 0
const PLAY_ORDER: Seat[] = ["S", "E", "N", "W"];                       // sentido contrário aos ponteiros do relógio
```

## 3. Estado
```ts
type Seat = "S" | "E" | "N" | "W";
type Phase = "CUT" | "PLAYING" | "TRICK_DONE" | "HAND_SUMMARY" | "PAUSED" | "FINISHED";

interface SuecaState {
  phase: Phase;
  pausedFrom: Phase | null;
  config: SuecaConfig;
  seats: Record<Seat, PlayerId>;
  handNumber: number;
  dealer: Seat;
  cutter: Seat;                                  // à esquerda de quem dá = anterior na PLAY_ORDER
  trumpCard: CardInstance | null;
  trumpSuit: Suit | null;
  trumpCardPlayed: boolean;
  hands: Record<Seat, CardInstance[]>;
  trick: { leader: Seat; plays: { seat: Seat; card: CardInstance }[] };
  lastTrick: { plays: { seat: Seat; card: CardInstance }[]; winner: Seat } | null;
  lastTrickViewsUsed: Record<Seat, number>;     // por mão (09 #3)
  wonCards: { A: CardInstance[]; B: CardInstance[] };
  tricksWon: { A: number; B: number };
  games: { A: number; B: number };               // jogos da partida
  history: HandSummary[];
  stateVersion: number;
  seed: string;
}

interface HandSummary { hand: number; points: { A: number; B: number }; gamesAwarded: { A: number; B: number }; dealer: Seat; trumpSuit: Suit }
```

## 4. Ações
```ts
type SuecaAction =
  | { type: "CHOOSE_CUT"; from: "TOP" | "BOTTOM" }   // só o cortador
  | { type: "PLAY"; cardUid: string }
  | { type: "VIEW_LAST_TRICK" }
  | { type: "SYS_CUT_TIMEOUT" }
  | { type: "SYS_TURN_TIMEOUT" }
  | { type: "SYS_TRICK_SHOWN" }                     // pausa para ver a vaza fechada (1200 ms)
  | { type: "SYS_NEXT_HAND" }
  | { type: "SYS_PAUSE"; seat: Seat } | { type: "SYS_RESUME" };
```

## 5. Algoritmos
```ts
function deal(s, from) {
  const deck = shuffledShoe(s.seed, s.handNumber);
  s.trumpCard = from === "TOP" ? deck[0] : deck[deck.length - 1];
  s.trumpSuit = s.trumpCard.suit;
  // remove a carta de trunfo do baralho, distribui 9 a quem dá + a carta de trunfo, 10 aos restantes
  // ordem de distribuição: começa no jogador à direita de quem dá (cosmético; determinístico pela seed)
}

function legalCards(s, seat): CardInstance[] {
  const hand = s.hands[seat];
  if (s.trick.plays.length === 0) return hand;                       // abrir: qualquer carta
  const leadSuit = s.trick.plays[0].card.suit;
  const follow = hand.filter(c => c.suit === leadSuit);
  return follow.length > 0 ? follow : hand;                           // assistir obrigatório
}

function trickWinner(plays, trumpSuit): Seat {
  const trumps = plays.filter(p => p.card.suit === trumpSuit);
  const pool = trumps.length ? trumps : plays.filter(p => p.card.suit === plays[0].card.suit);
  return pool.sort((a, b) => ORDER.indexOf(a.card.rank) - ORDER.indexOf(b.card.rank))[0].seat;
}

function gamesFor(points: number): number {
  if (points === 120) return 4;
  if (points >= 91) return 2;
  if (points >= 61) return 1;
  return 0;                                                           // inclui 60–60
}

function endHand(s) {
  const pA = sum(s.wonCards.A), pB = 120 - pA;
  const gA = gamesFor(pA), gB = gamesFor(pB);
  s.games.A += gA; s.games.B += gB;
  s.history.push({ hand: s.handNumber, points: { A: pA, B: pB }, gamesAwarded: { A: gA, B: gB }, dealer: s.dealer, trumpSuit: s.trumpSuit! });
  if (s.games.A >= s.config.targetGames || s.games.B >= s.config.targetGames) return finish(s);
  s.phase = "HAND_SUMMARY";                                           // agenda SYS_NEXT_HAND
}
// Próxima mão: dealer = seguinte na PLAY_ORDER; cutter = anterior ao novo dealer.

function timeoutCard(s, seat) {
  // carta legal de menor valor: menos pontos; empate → mais fraca na ORDER; empate → não trunfo antes de trunfo
}
```

## 6. Vista por jogador
```ts
interface SuecaPlayerView {
  phase: Phase;
  mySeat: Seat; myTeam: "A" | "B";
  seats: { seat: Seat; playerId: PlayerId; name: string; team: "A" | "B"; handCount: number; isCurrent: boolean; connected: boolean }[];
  myHand: CardInstance[];                         // ordenada: trunfo primeiro, depois naipes, ORDER dentro do naipe
  legalCardUids: string[];
  dealer: Seat; cutter: Seat;
  trump: { suit: Suit; card: CardInstance | null; holder: Seat };   // card = null depois de jogada
  trick: { leader: Seat; plays: { seat: Seat; card: CardInstance }[] };
  tricksWon: { A: number; B: number };            // só nº de vazas; pontos ficam escondidos até ao fim (09 #4)
  lastTrickAvailable: boolean;                    // há última vaza e ainda não usei a minha vez
  lastTrickView: { plays: { seat: Seat; card: CardInstance }[]; winner: Seat } | null;   // só durante os 3 s
  games: { A: number; B: number }; targetGames: number;
  handSummary: HandSummary | null;                // só em HAND_SUMMARY
  chatEnabled: boolean;                           // false durante a mão
  pause: { seat: Seat; resumeDeadline: number } | null;
  turnDeadline: number | null;
}
```

## 7. Eventos de domínio
| Evento | Payload |
|---|---|
| `HandStarted` | `{ hand, dealer, cutter }` |
| `CutChosen` | `{ cutter, from }` |
| `TrumpRevealed` | `{ card, holder }` |
| `CardPlayed` | `{ seat, card }` |
| `TrickWon` | `{ winner, team }` |
| `LastTrickViewed` | `{ seat }` (só informa que viu) |
| `HandEnded` | `HandSummary` |
| `GamePaused` / `GameResumed` | `{ seat }` |
| `MatchFinished` | `GameResult` |

## 8. Resultado
- Equipa com `games ≥ targetGames`: os dois jogadores `WINNER`; os outros dois `LOSER`.
- `score` = jogos da equipa.
- `summary`: histórico das mãos.


---

# Núcleo — Alterações e Dependências

## Dependências já existentes
| Necessidade | Vem de |
|---|---|
| Resultado por equipas | `GameResult` genérico — kit Fodinha |
| Temporizadores e pausas de animação | ações de sistema agendadas — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |
| Baralho de 40 | `createShoe` com `excludeRanks` (acrescentar o parâmetro se faltar; é um utilitário do `game-core`, previsto desde o início) |

## Alteração 1 — Escolha de lugares por equipas
**Problema:** a sala ordena os jogadores por ordem de entrada. A sueca precisa de lugares fixos que definem equipas.

**Solução:**
```ts
interface GameModule {
  // …
  seating?: { seats: string[]; teams?: Record<string, string[]> };
}
```
- Quando o módulo declara `seating`, a sala mostra a mesa com os lugares; cada jogador toca num lugar livre para se sentar, ou troca para outro livre.
- O anfitrião pode **trocar dois jogadores de lugar** e **baralhar equipas** (sorteio).
- O botão "Começar" só fica ativo com todos os lugares ocupados (e, havendo `teams`, todas as equipas completas).
- O motor recebe `seats: Record<seat, PlayerId>` no `setup`.
- Jogos sem `seating` mantêm o comportamento atual.
- Reutilizável em futuros jogos de equipas.

## Alteração 2 — Política de desconexão "PAUSE"
**Problema:** nos outros jogos, quem cai é substituído por ações automáticas depois de um período de graça. Com 4 jogadores reais obrigatórios, isso estraga a mão.

**Solução:**
```ts
interface GameModule {
  // …
  disconnectPolicy?: "AUTO_ACTION" | "PAUSE";     // por omissão AUTO_ACTION (comportamento atual)
}
```
- `PAUSE`: quando um jogador cai, o servidor envia `SYS_PAUSE`; os temporizadores param; todos veem "À espera do Bruno (1:45)".
- Volta dentro de `disconnectGraceMs` → `SYS_RESUME`; os temporizadores retomam do ponto onde estavam.
- Passado o prazo, o **anfitrião decide**: esperar mais (+2 min) ou terminar a partida **sem resultado** (não conta para estatísticas). Ver 09 #6.
- Jogos sem `disconnectPolicy` mantêm o comportamento atual.

## O que NÃO muda
Auth, salas, reconexão (mecanismo), Redis, componentes de cartas, animações base, persistência.


---

# Guião de Mão — Uma mão completa (40 cartas)

Teste automático obrigatório com as mãos e o trunfo abaixo injetados.

## Mesa
| Lugar | Jogador | Equipa |
|---|---|---|
| Sul | Ana | A |
| Este | Bruno | B |
| Norte | Carla | A |
| Oeste | Duarte | B |

Ordem de jogo (sentido contrário aos ponteiros do relógio): **Ana → Bruno → Carla → Duarte → Ana…**

- **Dá:** Duarte (Oeste).
- **Corta:** Carla (à esquerda do Duarte) → escolhe **"de baixo"**.
- **Trunfo:** a carta de baixo é o **4♦** → **trunfo ouros**. O 4♦ fica com o Duarte, visível a todos.
- **Abre:** Ana (à direita do Duarte).

## Mãos iniciais
| Jogador | Cartas |
|---|---|
| Ana | A♠ 7♠ K♠ · 3♥ 5♥ · Q♣ 3♣ 5♣ · A♦ J♦ |
| Bruno | J♠ 5♠ 2♠ · Q♥ 6♥ 4♥ · 7♣ · K♦ 6♦ 5♦ |
| Carla | 6♠ 3♠ · 7♥ 2♥ · A♣ K♣ J♣ 6♣ · 7♦ 3♦ |
| Duarte | Q♠ 4♠ · A♥ K♥ J♥ · 4♣ 2♣ · Q♦ 4♦ (trunfo) 2♦ |

## Vazas
| # | Abre | Cartas (por ordem de jogo) | Ganha | Pontos | Nota |
|---|---|---|---|---|---|
| 1 | Ana | Ana A♠ · Bruno 2♠ · Carla 3♠ · Duarte 4♠ | Ana (A) | 11 | |
| 2 | Ana | Ana 7♠ · Bruno 5♠ · Carla 6♠ · Duarte Q♠ | Ana (A) | 12 | o 7 é a segunda carta mais forte |
| 3 | Ana | Ana K♠ · Bruno J♠ · Carla 2♥ · Duarte 2♦ | Duarte (B) | 7 | Carla e Duarte sem espadas; Duarte trunfa |
| 4 | Duarte | Duarte A♥ · Ana 3♥ · Bruno 4♥ · Carla 7♥ | Duarte (B) | 21 | Carla só tinha o 7♥: obrigada a assistir |
| 5 | Duarte | Duarte K♥ · Ana 5♥ · Bruno 6♥ · Carla 3♦ | Carla (A) | 4 | Carla sem copas, trunfa |
| 6 | Carla | Carla A♣ · Duarte 2♣ · Ana 3♣ · Bruno 7♣ | Carla (A) | 21 | Bruno obrigado a assistir com o 7♣ |
| 7 | Carla | Carla K♣ · Duarte 4♣ · Ana 5♣ · Bruno 5♦ | Bruno (B) | 4 | Bruno sem paus, trunfa |
| 8 | Bruno | Bruno Q♥ · Carla 7♦ · Duarte J♥ · Ana A♦ | Ana (A) | 26 | Ana sobretrunfa o parceiro com o Ás de trunfo |
| 9 | Ana | Ana Q♣ · Bruno K♦ · Carla J♣ · Duarte 4♦ | Bruno (B) | 9 | Duarte joga a carta de trunfo (deixa de estar visível) |
| 10 | Bruno | Bruno 6♦ · Carla 6♣ · Duarte Q♦ · Ana J♦ | Ana (A) | 5 | Valete de trunfo bate a Dama |

## Resultado da mão
| Equipa | Vazas | Pontos | Jogos |
|---|---|---|---|
| A (Ana + Carla) | 6 | **79** | **1** |
| B (Bruno + Duarte) | 4 | 41 | 0 |

Verificação: 79 + 41 = **120** ✓

Mão seguinte: dá a **Ana** (seguinte ao Duarte), corta o **Duarte**, abre o **Bruno**.

## Cenários de pontuação (testes isolados)
| Pontos A – B | Jogos A – B |
|---|---|
| 79 – 41 | 1 – 0 |
| 60 – 60 | 0 – 0 |
| 95 – 25 | 2 – 0 |
| 120 – 0 | 4 – 0 |
| 30 – 90 | 0 – 1 |
| 29 – 91 | 0 – 2 |

## Cenários de legalidade (testes isolados)
- Na vaza 4, a vista da Carla só tem o 7♥ em `legalCardUids`; qualquer outra carta é rejeitada.
- Na vaza 6, o Bruno só pode jogar o 7♣.
- Na vaza 3, a Carla (sem espadas) pode jogar qualquer carta.


---

# UI da Sueca — "Clean"

Princípio: **parecer uma mesa de sueca a sério, sem ruído.** Reutiliza o baralho clássico e os componentes existentes. Nada de contadores de pontos, badges, confettis ou sons a cada carta.

## 1. Sala (escolha de lugares)
- Mesa vista de cima com os 4 lugares (N, E, S, O) e a etiqueta da equipa em cada par (Equipa A: N/S, Equipa B: E/O), em duas cores sóbrias (azul-escuro e bordô).
- Tocar num lugar livre para sentar; tocar noutro livre para mudar.
- Anfitrião: "Trocar lugares" (arrastar um jogador para outro) e "Sortear equipas".
- Configuração visível: "Partida a 4 jogos".
- "Começar" só ativo com os 4 lugares ocupados.

## 2. Mesa
- Feltro verde clássico (`#1E5631`), sem padrões.
- **Tu estás sempre em baixo**; o teu parceiro em cima; adversários à esquerda e à direita.
- Nome de cada jogador junto ao seu lado; o parceiro com um traço discreto da cor da equipa.
- Indicador de vez: o nome do jogador da vez fica a branco, os outros a cinzento; anel fino de tempo à volta do nome.
- Quem dá: pequeno "D" junto ao nome.

## 3. Corte
- Para o cortador: o baralho ao centro com duas opções grandes: **"De cima"** · **"De baixo"**.
- Para os outros: *"A Carla está a cortar…"*.
- Animação curta: o baralho divide-se, a carta escolhida vira e desliza para junto de quem dá.

## 4. Trunfo
- A carta de trunfo fica **virada para cima junto a quem dá**, ligeiramente rodada, até ser jogada.
- No canto da mesa, um indicador mínimo e permanente do naipe de trunfo (só o símbolo, em grande, com contorno).

## 5. A tua mão
- Leque na base, **ordenada**: trunfo à esquerda, depois os outros naipes alternando cores, cada naipe pela ordem da sueca (Ás, 7, Rei, Valete, Dama, 6…).
- **Só as cartas legais estão ativas.** As outras ficam ligeiramente esbatidas e não respondem ao toque. Nada de mensagens de erro: simplesmente não dá.
- Jogar: tocar na carta (desktop: duplo clique ou arrastar para o centro).

## 6. Vaza
- As cartas jogadas ficam à frente de cada jogador, em cruz, viradas para o centro.
- Fechada a vaza: pausa de 1,2 s, a carta vencedora fica ligeiramente realçada e as quatro deslizam juntas para o lado da equipa que ganhou, onde ficam em monte virado para baixo.
- Junto a cada monte, só o **número de vazas** (pequeno). Pontos não aparecem durante a mão.

## 7. Ver última vaza
- Ícone discreto junto ao monte de vazas: **"Última vaza"** (com o indicador "1×").
- Ao tocar: as 4 cartas da última vaza aparecem ao centro em cruz durante 3 s, com a vencedora realçada.
- Depois de usado, o ícone desaparece até à mão seguinte.

## 8. Fim da mão
- Painel central sóbrio, 5 s:
  - "Nós 79 · Eles 41"
  - "Ganhámos 1 jogo"
  - Marcador da partida: "Nós 1 · Eles 0 (a 4)"
- Mão seguinte começa sozinha (ou o painel fecha ao toque).

## 9. Marcador da partida
- Canto superior, permanente e mínimo: **Nós 1 · Eles 0** e, por baixo, "a 4".
- Histórico das mãos num painel recolhível (mão, quem deu, trunfo, pontos, jogos).

## 10. Chat e comunicação
- Durante a mão: ícone de chat cinzento com cadeado e tooltip *"O chat abre no fim da mão"*. Sem reações.
- Entre mãos e no fim da partida: chat aberto.

## 11. Pausa por desconexão
- Véu escuro sobre a mesa com *"À espera do Bruno… 1:45"*.
- Para o anfitrião, quando o tempo acaba: [Esperar mais 2 min] [Terminar sem resultado].

## 12. Fim da partida
- Ecrã limpo: "Ganharam a Ana e a Carla — 4 a 2", histórico de mãos, botões "Nova partida" e "Voltar ao lobby".

## 13. Som (opcional, desligado por omissão)
- Só três sons suaves: carta na mesa, vaza recolhida, fim de mão.

## 14. Tempos
| Momento | Duração |
|---|---|
| Distribuir 40 cartas | stagger 30 ms |
| Corte | 600 ms |
| Jogar carta | 280 ms |
| Pausa da vaza fechada | 1200 ms |
| Recolher vaza | 350 ms |
| Ver última vaza | 3000 ms |
| Resumo da mão | 5000 ms |


---

# Testes Obrigatórios — Sueca

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Baralho e distribuição
- 40 cartas, sem 8/9/10/jokers; 10 por jogador; a carta de trunfo pertence a quem dá.
- "De cima" → trunfo = primeira carta do baralho baralhado; "de baixo" → última.
- Timeout do corte → escolha aleatória determinística pela seed.

## 2. Rotação
- Ordem de jogo S → E → N → W.
- Quem dá roda no mesmo sentido; corta o anterior a quem dá; abre o seguinte a quem dá.

## 3. Assistir
- `legalCards` com naipe → só esse naipe; sem naipe → todas.
- Carta ilegal enviada por cliente adulterado → rejeitada, estado inalterado.
- A abrir → todas legais.

## 4. Vazas
- Sem trunfos → ganha a mais alta do naipe de saída (cartas de outros naipes nunca ganham).
- Com trunfos → ganha o trunfo mais alto.
- Ordem A > 7 > K > J > Q > 6 > 5 > 4 > 3 > 2 em todos os casos (incluindo Valete > Dama).
- Quem ganha abre a seguinte.

## 5. Pontuação
- Soma das cartas ganhas = 120 em todas as mãos.
- Tabela de jogos: 60/61, 90/91, 119/120 nas fronteiras.
- 60–60 → ninguém pontua.
- Partida termina ao atingir `targetGames` (1, 4, 10).

## 6. Última vaza
- Indisponível antes da primeira vaza fechada.
- Cada jogador pode ver uma vez por mão (09 #3); segunda tentativa → rejeitada.
- Mostra a última vaza fechada no momento do pedido.

## 7. Comunicação
- `chatEnabled = false` em CUT, PLAYING e TRICK_DONE; `true` em HAND_SUMMARY e FINISHED.
- Mensagens de chat enviadas durante a mão → rejeitadas pelo servidor (não só escondidas na UI).

## 8. Pausa
- Desconexão → PAUSED; temporizadores congelados; ações de jogo rejeitadas.
- Reconexão → retoma com o tempo restante exato.
- Prazo esgotado → anfitrião: esperar mais ou terminar sem resultado (`GameResult` vazio, não persiste estatísticas).

## 9. Timeout de jogada
- Joga a carta legal de menor valor (desempates do 03 §5).

## 10. Segurança
- Nenhuma vista contém mãos alheias.
- A carta de trunfo aparece em todas as vistas até ser jogada; depois `card = null`.

## 11. Guião
- Reproduzir `05-GUIAO-DE-MAO.md`: cada vaza (vencedor e pontos), resultado 79–41 → 1–0, rotação para a mão seguinte, e os cenários isolados.

## 12. Simulação
- 100 000 mãos com bots aleatórios legais.
- Invariantes: 40 cartas sempre; 10 vazas por mão; pontos A + B = 120; toda a carta jogada é legal; partidas terminam.


---

# Plano de Fases — Sueca

## Fase 0 — Núcleo
- `excludeRanks` no `createShoe` (se faltar).
- Alteração 1 (`seating` com equipas) e Alteração 2 (`disconnectPolicy: "PAUSE"`) do `04`.
- **Feito quando:** todos os jogos anteriores continuam verdes; uma sala de teste com `seating` deixa escolher lugares e uma com `PAUSE` congela e retoma corretamente.

## Fase 1 — Motor
- `packages/games/sueca`: config, distribuição com corte, legalidade, vazas, pontuação, partida, última vaza, chat, pausa, timeouts, vistas, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 100 000 mãos sem violar invariantes.

## Fase 2 — UI
- Componentes do 06: escolha de lugares, corte, trunfo, mão ordenada com cartas legais, vaza em cruz, última vaza, resumo, marcador, pausa.
- Página `/dev/sueca` com estados fixos (sala, corte, vaza a meio, vaza fechada, última vaza, resumo de mão, pausa, fim).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel. Revisão final "limpeza": retirar tudo o que não seja essencial.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 4 contas (Playwright), com uma desconexão e retoma a meio de uma vaza.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida a 4 jogos em produção, e um jogador habitual de sueca não encontra nada "fora do sítio".


---

# Pontos em Aberto — Sueca

## Decisões fechadas
| Tema | Decisão |
|---|---|
| Trunfo | Quem corta escolhe "de cima" ou "de baixo" |
| Empate 60–60 | Ninguém pontua |
| Partida | Configurável, por omissão 4 jogos |
| Renúncia | Impossível: o servidor só aceita cartas legais |
| Equipas | Os jogadores escolhem o lugar |
| Comunicação | Chat bloqueado durante a mão; voz externa fora de âmbito |
| Jogadores | Só 4 jogadores reais, sem bots |
| Última vaza | Permitido ver, só 1 vez por jogador |

## Por fechar (proposta por omissão — "ok" aceita todas)
| # | Questão | Proposta |
|---|---|---|
| 1 | **Corte:** quem corta é o jogador **à esquerda** de quem dá, e a carta escolhida (de cima ou de baixo) é o trunfo e fica com quem dá? | Sim |
| 2 | **Bandeira (4 jogos):** é fazer **120 pontos** ou fazer **todas as 10 vazas**? (Pode fazer-se 120 pontos sem ganhar todas as vazas) | 120 pontos |
| 3 | **"Ver última vaza 1 vez por jogador":** uma vez **por mão** ou uma vez **em toda a partida**? | Uma vez por mão |
| 4 | **Pontos durante a mão:** escondidos até ao fim, como na mesa real (só se vê o nº de vazas)? | Escondidos |
| 5 | **Tempo esgotado** (30 s): o servidor joga a carta legal de menor valor? | Sim |
| 6 | **Alguém cai e não volta** (2 min): o anfitrião escolhe esperar mais ou terminar a partida sem resultado? | Sim |
| 7 | **Reações** (emojis) também bloqueadas durante a mão, por poderem servir de sinal? | Sim, só entre mãos |
| 8 | **Quem dá na primeira mão** | Sorteado |


---

