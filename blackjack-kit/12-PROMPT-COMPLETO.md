# PROMPT — Adicionar o jogo "Blackjack" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas e configuração por jogo.

## Objetivo
Adicionar o **Blackjack** como módulo em `packages/games/blackjack`: até 7 jogadores humanos contra um **dealer automático**, com fichas virtuais por sessão, regras de mesa configuráveis e a mesma qualidade visual dos outros jogos.

## Documentos
- `02-REGRAS-BLACKJACK.md` — regras e pagamentos (fonte de verdade)
- `03-CONTRATO-BLACKJACK.md` — estado, ações, fases, vistas, eventos, algoritmos
- `04-ALTERACOES-AO-NUCLEO.md` — únicas alterações permitidas ao núcleo
- `05-DEALER-BOT.md` — comportamento e ritmo do dealer
- `06-ESTRATEGIA-BASICA.md` — tabela para dicas e bots de simulação
- `07-GUIAO-DE-SESSAO.md` — sessão de exemplo; teste automático obrigatório com sapato fixo
- `08-UI-BLACKJACK.md` — especificação visual
- `09-TESTES-BLACKJACK.md` — testes, invariantes, validação estatística
- `10-PLANO-FASES.md` — fases e critérios
- `11-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas, pergunta pelas outras

## Requisitos não negociáveis
1. **Fichas sem valor real.** Nenhuma compra, troca, levantamento, prémio ou integração de pagamentos. Não criar nada que se pareça com uma "loja de fichas".
2. **Informação oculta.** A carta tapada do dealer e a ordem do sapato nunca saem do servidor antes da revelação. Teste automático que serializa todas as vistas e verifica.
3. **Sapato baralhado no início**, com `crypto.randomInt`; as cartas saem pela ordem do sapato, nunca são geradas "na hora".
4. **Motor puro.** O dealer joga através de ações de sistema agendadas (uma carta de cada vez, com pausa para animação).
5. **Aritmética inteira.** Apostas em múltiplos de 10, de forma que 3:2, seguro e desistência dão sempre inteiros. Nunca usar floats para fichas.
6. **Validação estatística.** O motor com bots de estratégia básica tem de reproduzir a vantagem da casa esperada para as regras configuradas (ver 09). Se não bater, há bug; não se avança.
7. **Reutilização visual**: baralho, componentes `Card`, animações e sons existentes.

## Método
- Segue o 10 fase a fase e para no fim de cada uma.
- Antes de codificar: diff ao núcleo (04), tipos finais (03), lista de testes (09).
- Não inventes regras. Caso não coberto no 02 ou no 11 → pergunta.


---

# Regras do Blackjack — Especificação (v1.0)

## 1. Objetivo
Cada jogador joga **contra o dealer**, não contra os outros. Ganha quem ficar mais perto de 21 sem passar. Os outros jogadores partilham a mesa e o sapato, mas os resultados são independentes.

## 2. Mesa
- **1 a 7 jogadores** humanos + dealer automático.
- **Sapato** de 6 baralhos de 52 cartas (configurável 1–8), sem jokers.
- **Penetração**: carta de corte a 75% do sapato (configurável 50–85%). Quando sai a carta de corte, termina a ronda em curso e o sapato é baralhado antes da ronda seguinte.

## 3. Valor das cartas
| Carta | Valor |
|---|---|
| 2–10 | valor facial |
| J, Q, K | 10 |
| A | 1 ou 11 (o que for melhor sem passar de 21) |

- **Mão mole (soft):** tem um Ás a contar 11 (ex.: A+6 = "7 ou 17", soft 17).
- **Mão dura (hard):** sem Ás a contar 11.
- **Blackjack:** Ás + carta de 10 **nas duas primeiras cartas** da mão original. 21 depois de separar **não** é blackjack.
- **Rebentar:** passar de 21.

## 4. Fichas
- Cada jogador começa a sessão com **1000 fichas** (configurável).
- Aposta mínima **10**, máxima **500** (configurável), sempre em **múltiplos de 10**.
- Fichas sem valor real (ver README).
- Ficar sem fichas: ver 11 #9 (recompra).

## 5. Ronda
### 5.1 Apostas (simultâneas)
- Todos apostam ao mesmo tempo, com temporizador (15 s).
- Quem não apostar fica de fora nessa ronda.
- A aposta tem de caber nas fichas disponíveis.
- Botões de conveniência: repetir aposta anterior, dobrar aposta anterior.

### 5.2 Distribuição
Por ordem dos lugares (da esquerda do dealer para a direita):
1. Uma carta virada para cima a cada jogador com aposta.
2. Uma carta virada para cima ao dealer (**carta visível**).
3. Segunda carta virada para cima a cada jogador.
4. Segunda carta do dealer **virada para baixo** (**carta tapada**) — ver 11 #2.

### 5.3 Seguro e verificação (só se a carta visível do dealer for Ás ou 10)
- **Carta visível Ás:** oferece-se **seguro** a todos (simultâneo, 10 s). Custa metade da aposta e paga 2:1 se o dealer tiver blackjack.
  - Jogador com blackjack recebe a oferta de **even money** (receber já 1:1 e fechar a mão) em vez de seguro.
- **Verificação (peek):** com Ás ou 10 à vista, o dealer espreita a carta tapada.
  - Se tiver blackjack: revela, a ronda termina; perdem todas as apostas exceto blackjacks (empate) e seguros pagam.
  - Se não tiver: seguros perdem-se e a ronda continua.

### 5.4 Turnos dos jogadores
Por ordem dos lugares, cada jogador joga as suas mãos até ficar, rebentar ou fazer 21.
Jogadores com blackjack não jogam (a mão está fechada).

| Ação | Quando | Efeito |
|---|---|---|
| **Pedir** (hit) | sempre que a mão < 21 | +1 carta |
| **Ficar** (stand) | sempre | termina a mão |
| **Dobrar** (double) | só com as 2 primeiras cartas da mão | duplica a aposta, recebe exatamente 1 carta, termina |
| **Separar** (split) | 2 primeiras cartas do mesmo valor | ver 5.5 |
| **Desistir** (surrender) | só como primeira decisão da mão original, se ativo | perde metade da aposta, termina |

- Com 21 (não blackjack), a mão fica automaticamente.
- Dobrar e separar exigem fichas suficientes para a aposta adicional.

### 5.5 Separar
- Cartas do mesmo **valor** (10, J, Q, K contam como iguais) — ver 11 #5.
- Cada carta passa a ser uma mão com aposta igual à original; cada uma recebe uma segunda carta e joga-se por ordem.
- **Reseparar** até um máximo de **4 mãos**.
- **Ases separados**: recebem **uma** carta cada e ficam; não se resseparam Ases.
- **Dobrar depois de separar** permitido.
- 21 numa mão separada paga 1:1 (não é blackjack).

### 5.6 Dealer
- Revela a carta tapada.
- Pede carta com 16 ou menos; **fica com 17 ou mais**.
- **Soft 17**: fica (S17) — ver 11 #1.
- Se todos os jogadores rebentaram, desistiram ou tiveram blackjack pago, o dealer só revela e não tira cartas.

### 5.7 Pagamentos
| Situação | Pagamento |
|---|---|
| Blackjack do jogador (dealer sem blackjack) | **3:2** |
| Ganha ao dealer | 1:1 |
| Dealer rebenta (jogador não rebentou) | 1:1 |
| Empate (push) | devolve a aposta |
| Jogador rebenta | perde (mesmo que o dealer rebente depois) |
| Blackjack vs blackjack | empate |
| Desistência | devolve metade |
| Seguro com dealer blackjack | 2:1 sobre o seguro |
| Even money | 1:1 imediato |

### 5.8 Fim de ronda
- Pagamentos com animação de fichas.
- Cartas para o descarte.
- Se saiu a carta de corte: baralhar o sapato (com animação) antes das apostas seguintes.

## 6. Sessão
- A mesa corre rondas contínuas até o anfitrião terminar a sessão (ou regra do 11 #10).
- Jogadores podem **entrar e sair entre rondas** (11 #11).
- Resultado da sessão: saldo líquido de cada jogador (fichas finais − fichas iniciais − recompras × stack).


---

# Contrato Técnico — Blackjack

## 1. Configuração
```ts
const BlackjackConfigSchema = z.object({
  decks: z.number().int().min(1).max(8).default(6),
  penetration: z.number().min(0.5).max(0.85).default(0.75),
  startingStack: z.number().int().multipleOf(10).min(100).max(100_000).default(1000),
  minBet: z.number().int().multipleOf(10).default(10),
  maxBet: z.number().int().multipleOf(10).default(500),
  dealerHitsSoft17: z.boolean().default(false),         // false = S17
  holeCard: z.enum(["PEEK", "EUROPEAN"]).default("PEEK"),
  blackjackPayout: z.literal("3:2").default("3:2"),     // 6:5 proibido
  doubleAfterSplit: z.boolean().default(true),
  maxHands: z.number().int().min(2).max(4).default(4),
  splitTensByValue: z.boolean().default(true),          // J+Q pode separar
  surrender: z.boolean().default(true),                 // late surrender
  insurance: z.boolean().default(true),
  allowRebuy: z.boolean().default(true),
  hintsEnabled: z.boolean().default(false),
  betTimeoutMs: z.number().int().default(15_000),
  decisionTimeoutMs: z.number().int().default(20_000),
  insuranceTimeoutMs: z.number().int().default(10_000),
}).refine(c => c.minBet <= c.maxBet && c.maxBet <= c.startingStack);
```
- `minPlayers: 1`, `maxPlayers: 7`.

## 2. Tipos base
```ts
type Chips = number;                         // inteiro, sempre múltiplo de 5
interface Hand {
  id: string;                                // "p1-h0", "p1-h1" após separar
  cards: CardInstance[];
  bet: Chips;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  status: "PLAYING" | "STOOD" | "BUSTED" | "BLACKJACK" | "SURRENDERED" | "DONE";
  outcome?: "WIN" | "LOSE" | "PUSH" | "BLACKJACK" | "SURRENDER";
  payout?: Chips;                            // valor devolvido (aposta + ganho)
}
interface Seat {
  seatIndex: number;                         // 0..6, esquerda do dealer → direita
  playerId: PlayerId | null;
  stack: Chips;
  rebuys: number;
  pendingBet: Chips | null;
  lastBet: Chips | null;
  insurance: Chips | null;                   // null = não oferecido/recusado
  evenMoney: boolean;
  hands: Hand[];
  activeHandIndex: number;
  sittingOut: boolean;
  leaving: boolean;                          // sai no fim da ronda
}
```

## 3. Estado (servidor)
```ts
type Phase =
  | "BETTING" | "DEALING" | "INSURANCE" | "PEEK"
  | "PLAYER_TURNS" | "DEALER_TURN" | "SETTLEMENT" | "SHUFFLING";

interface BlackjackState {
  phase: Phase;
  config: BlackjackConfig;
  round: number;
  seats: Seat[];                             // 7 posições fixas
  turn: { seatIndex: number; handIndex: number } | null;
  dealer: { cards: CardInstance[]; holeRevealed: boolean };
  shoe: CardInstance[];                      // nunca sai do servidor
  cutCardIndex: number;
  cutCardReached: boolean;
  discard: number;                           // só contagem é pública
  phaseDeadline: number | null;              // preenchido pelo servidor
  stateVersion: number;
  seed: string;
}
```

## 4. Ações
```ts
type BlackjackAction =
  // jogador
  | { type: "PLACE_BET"; amount: Chips }
  | { type: "CLEAR_BET" }
  | { type: "INSURANCE"; take: boolean }
  | { type: "EVEN_MONEY"; take: boolean }
  | { type: "HIT" } | { type: "STAND" } | { type: "DOUBLE" } | { type: "SPLIT" } | { type: "SURRENDER" }
  | { type: "REBUY" }
  | { type: "SIT_OUT"; value: boolean }
  // sistema
  | { type: "SYS_BETTING_CLOSED" }
  | { type: "SYS_DEAL_STEP" }                // uma carta por passo
  | { type: "SYS_INSURANCE_CLOSED" }
  | { type: "SYS_PEEK" }
  | { type: "SYS_DECISION_TIMEOUT" }         // = STAND
  | { type: "SYS_DEALER_STEP" }              // revelar ou tirar 1 carta
  | { type: "SYS_SETTLE" }
  | { type: "SYS_NEXT_ROUND" }
  | { type: "SYS_SHUFFLE_DONE" }
  | { type: "SYS_PLAYER_JOINED"; playerId: PlayerId; seatIndex: number }
  | { type: "SYS_PLAYER_LEFT"; playerId: PlayerId };
```

## 5. Máquina de fases
```
BETTING ──(todos apostaram | timeout)──► DEALING ──(passos de distribuição)──►
  ├─ carta visível Ás e seguro ativo ──► INSURANCE ──► PEEK
  ├─ carta visível 10 (PEEK) ──────────────────────► PEEK
  └─ outra ───────────────────────────────────────► PLAYER_TURNS
PEEK ──(dealer blackjack)──► SETTLEMENT
     └─(sem blackjack)─────► PLAYER_TURNS
PLAYER_TURNS ──(todas as mãos fechadas)──► DEALER_TURN ──(dealer ≥17 ou nada a jogar)──► SETTLEMENT
SETTLEMENT ──► (cutCardReached ? SHUFFLING : BETTING)
SHUFFLING ──► BETTING
```
Tempos das ações de sistema: ver `05-DEALER-BOT.md`.

## 6. Algoritmos
```ts
function handValue(cards: CardInstance[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces++; total += 1; }
    else if (["J", "Q", "K"].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

const isBlackjack = (h: Hand) => !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;

function dealerShouldHit(cards: CardInstance[], hitSoft17: boolean): boolean {
  const { total, soft } = handValue(cards);
  return total < 17 || (hitSoft17 && total === 17 && soft);
}

function settleHand(h: Hand, dealer: CardInstance[]): { outcome: Hand["outcome"]; payout: Chips } {
  if (h.status === "SURRENDERED") return { outcome: "SURRENDER", payout: h.bet / 2 };
  const d = handValue(dealer), dBJ = dealer.length === 2 && d.total === 21;
  if (isBlackjack(h)) return dBJ ? { outcome: "PUSH", payout: h.bet } : { outcome: "BLACKJACK", payout: h.bet + (h.bet * 3) / 2 };
  if (h.status === "BUSTED") return { outcome: "LOSE", payout: 0 };
  if (dBJ) return { outcome: "LOSE", payout: 0 };
  const p = handValue(h.cards).total;
  if (d.total > 21 || p > d.total) return { outcome: "WIN", payout: h.bet * 2 };
  if (p === d.total) return { outcome: "PUSH", payout: h.bet };
  return { outcome: "LOSE", payout: 0 };
}
```
- `bet` é debitado do `stack` no momento de apostar/dobrar/separar; `payout` é creditado no `SETTLEMENT`.
- Com apostas múltiplas de 10: `bet/2` e `bet*3/2` são sempre inteiros.
- **Europeu (`holeCard = "EUROPEAN"`)**: o dealer só recebe a segunda carta no `DEALER_TURN`; se fizer blackjack, perde-se tudo o que estiver apostado nas mãos, incluindo dobras e separações (confirmar no 11 #2).

### Ações válidas
```ts
function validActions(s, seat, hand): BlackjackAction[] {
  // HIT/STAND: mão PLAYING e total < 21
  // DOUBLE: 2 cartas && stack >= bet && (!fromSplit || DAS) && !splitAces
  // SPLIT: 2 cartas mesmo valor && hands.length < maxHands && stack >= bet && !(splitAces)
  // SURRENDER: surrender ativo && primeira decisão && mão original única && 2 cartas
}
```

## 7. Vista por jogador
```ts
interface BlackjackPlayerView {
  phase: Phase; round: number; config: PublicConfig;
  dealer: { cards: (CardInstance | { hidden: true })[]; total: number | null; soft: boolean };
  seats: {
    seatIndex: number; playerId: PlayerId | null; name?: string;
    stack: Chips; rebuys: number; net: Chips;
    pendingBet: Chips | null; insurance: Chips | null;
    hands: { id: string; cards: CardInstance[]; bet: Chips; total: number; soft: boolean;
             status: Hand["status"]; outcome?: Hand["outcome"]; payout?: Chips }[];
    sittingOut: boolean; isMe: boolean;
  }[];
  turn: { seatIndex: number; handIndex: number } | null;
  shoe: { remaining: number; total: number; cutCardReached: boolean };   // só contagens
  discardCount: number;
  validActions: BlackjackAction[];
  hint: "HIT" | "STAND" | "DOUBLE" | "SPLIT" | "SURRENDER" | null;       // só se hintsEnabled
  phaseDeadline: number | null;
}
```
- A carta tapada do dealer aparece como `{ hidden: true }` até `holeRevealed`.
- `dealer.total` só mostra o valor da carta visível até à revelação.
- Cartas dos jogadores são públicas (em blackjack todas as cartas dos jogadores estão viradas para cima).

## 8. Eventos de domínio
| Evento | Payload |
|---|---|
| `BetPlaced` / `BetCleared` | `{ seatIndex, amount }` |
| `CardDealt` | `{ to: "DEALER" \| { seatIndex, handId }, card \| { hidden: true } }` |
| `InsuranceOffered` / `InsuranceTaken` | `{ seatIndex, amount }` |
| `DealerPeeked` | `{ blackjack: boolean }` |
| `HandSplit` | `{ seatIndex, fromHandId, newHandIds }` |
| `HandDoubled` / `HandSurrendered` / `HandBusted` / `HandStood` | `{ seatIndex, handId }` |
| `HoleCardRevealed` | `{ card }` |
| `HandSettled` | `{ seatIndex, handId, outcome, payout }` |
| `ShoeShuffled` | `{ decks }` |
| `PlayerRebought` | `{ seatIndex, stack }` |


---

# Alterações ao Núcleo — Blackjack

Pressupõe feitas as alterações do kit da Fodinha (`GameResult` genérico, ações de sistema agendadas, `configUi`). Estas são as **únicas** alterações adicionais permitidas. Mexicana e Fodinha continuam verdes.

## 1. Sapato com vários baralhos
**Problema:** o `game-core` cria um baralho de 52/54 com ids únicos por carta ("AS"). Com 6 baralhos há seis "AS".

**Solução:**
```ts
interface CardInstance { uid: string; id: CardId; rank: Rank; suit: Suit }  // uid = "AS#3"
createShoe({ decks: number, jokers: boolean }): CardInstance[]
```
- `id` continua a identificar a face (para desenhar); `uid` identifica a instância física.
- Mexicana e Fodinha passam a usar `createShoe({ decks: 1 })`; o `uid` coincide com o id + "#0". Ajustar tipos, sem mudar comportamento.

## 2. Fases simultâneas
**Problema:** o gateway assume sempre um "jogador da vez" e um temporizador por jogador. No Blackjack, apostas e seguro são **simultâneos**.

**Solução:**
- `getCurrentPlayer` pode devolver `null`; o gateway valida apenas com `getValidActions(state, playerId)`.
- Temporizadores passam a ser **por fase**, pedidos pelo motor através do `schedule` (já existente), nunca inferidos pelo gateway.
- `phaseDeadline` é preenchido pelo servidor na vista para a UI mostrar a contagem.

## 3. Entrar e sair entre rondas
**Problema:** hoje uma partida começa com jogadores fixos e acaba. O Blackjack é uma **sessão contínua**.

**Solução no contrato:**
```ts
interface GameModule {
  // …
  lifecycle: "MATCH" | "SESSION";                         // Mexicana/Fodinha: MATCH; Blackjack: SESSION
  onPlayerJoin?(state, playerId, seatIndex): Result<State>;
  onPlayerLeave?(state, playerId): Result<State>;
}
```
- Em `SESSION`, a sala aceita entradas enquanto houver lugar; o jogador senta-se com `sittingOut = true` até à próxima fase `BETTING`.
- Sair a meio de uma ronda: as mãos dele ficam automaticamente (stand) e são liquidadas normalmente; o lugar liberta-se no fim da ronda.
- Reconexão igual aos outros jogos; timeout de decisão = ficar.
- Ao terminar a sessão (anfitrião ou todos saem), o `GameResult` usa `outcome: "PLACED"` ordenado por saldo, com `score = saldo líquido`.
- Log de ações continua por partida (`Match` = sessão); para sessões longas, guardar snapshots a cada 50 rondas para o replay não ficar lento.

## O que NÃO muda
Auth, salas, reconexão, Redis adapter, componentes de cartas, animações base, persistência.


---

# Dealer Automático (bot)

O dealer **não toma decisões estratégicas**: segue regras fixas. O "bot" é a automatização, o ritmo e a personalidade. Deve parecer um croupier real, não um algoritmo instantâneo.

## 1. Comportamento (determinístico)
1. Distribui por ordem: jogadores (esquerda→direita), dealer (visível), jogadores, dealer (tapada).
2. Com Ás visível e seguro ativo: abre janela de seguro.
3. Com Ás ou 10 visível (modo PEEK): espreita. Tem blackjack → revela e liquida. Não tem → continua.
4. Aguarda os jogadores.
5. Na sua vez: revela a tapada; enquanto `dealerShouldHit` → tira carta; depois fica.
6. Se nenhuma mão viva precisar de comparação (todas rebentadas, desistidas ou blackjack pago), só revela.
7. Liquida mão a mão, da direita para a esquerda (como num casino: primeiro recolhe perdas, depois paga).
8. Se saiu a carta de corte, anuncia e baralha.

## 2. Ritmo (ações de sistema agendadas)
| Passo | Pausa antes |
|---|---|
| Cada carta na distribuição | 280 ms |
| Espreitar (peek) | 900 ms |
| Revelar carta tapada | 700 ms |
| Cada carta do dealer | 750 ms |
| Liquidação (por mão) | 350 ms |
| Resumo antes das próximas apostas | 2500 ms |
| Baralhar | 2200 ms |

Todos os tempos são configuráveis centralmente (constante do módulo), não na sala.

## 3. Personalidade (opcional, ligar por omissão)
- Nome e avatar fixos por mesa (ex.: "Rui", "Sofia", "Tiago", escolhido aleatoriamente ao criar a sala).
- Frases curtas no chat da mesa, em PT-PT, disparadas por eventos, com probabilidade e sem repetir seguidas:

| Evento | Exemplos |
|---|---|
| Início das apostas | "Façam as vossas apostas." · "Mesa aberta." |
| Fim das apostas | "Apostas fechadas." |
| Blackjack de um jogador | "Blackjack! Parabéns, {nome}." |
| Dealer blackjack | "Blackjack da casa. Lamento." |
| Dealer rebenta | "A casa rebentou. Pago a todos." |
| Jogador rebenta | "Passou, {nome}." |
| Seguro | "Seguro, alguém?" |
| Baralhar | "Carta de corte. Vou baralhar." |

- Nunca frases trocistas, ofensivas ou que incentivem a apostar mais.
- Frases numa tabela de configuração, não no código do motor (o motor só emite eventos; o servidor escolhe a frase).

## 4. O que o dealer NÃO faz
- Não "faz batota" nem ajusta cartas. A ordem do sapato é fixada ao baralhar e é auditável pelo `seed` + log.
- Não aconselha jogadores (a dica é uma funcionalidade separada, ver 06).


---

# Estratégia Básica — Dicas e Bots de Simulação

Tabela para **4–8 baralhos, dealer fica em soft 17 (S17), dobrar após separar (DAS), desistência tardia**. Usos:
1. **Botão de dica** (se `hintsEnabled`): mostra a jogada recomendada.
2. **Bots de simulação** nos testes estatísticos (09).

Se as regras da sala forem diferentes (H17, sem DAS, 1–2 baralhos), gerar a tabela correspondente ou desligar a dica para essa configuração. **A tabela tem de ser validada pela simulação**: vantagem da casa esperada ≈ 0,3–0,5% com estas regras.

Legenda: **H** pedir · **S** ficar · **D** dobrar (se não puder, pedir) · **Ds** dobrar (se não puder, ficar) · **P** separar · **R** desistir (se não puder, pedir)

## Mãos duras
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 17+ | S | S | S | S | S | S | S | S | S | S |
| 16 | S | S | S | S | S | H | H | R | R | R |
| 15 | S | S | S | S | S | H | H | H | R | H |
| 13–14 | S | S | S | S | S | H | H | H | H | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 11 | D | D | D | D | D | D | D | D | D | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 5–8 | H | H | H | H | H | H | H | H | H | H |

## Mãos moles
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,9 | S | S | S | S | S | S | S | S | S | S |
| A,8 | S | S | S | S | S | S | S | S | S | S |
| A,7 | S | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,6 | H | D | D | D | D | H | H | H | H | H |
| A,4–A,5 | H | H | D | D | D | H | H | H | H | H |
| A,2–A,3 | H | H | H | D | D | H | H | H | H | H |

## Pares
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,A | P | P | P | P | P | P | P | P | P | P |
| 10,10 | S | S | S | S | S | S | S | S | S | S |
| 9,9 | P | P | P | P | P | S | P | P | S | S |
| 8,8 | P | P | P | P | P | P | P | P | P | P |
| 7,7 | P | P | P | P | P | P | H | H | H | H |
| 6,6 | P | P | P | P | P | H | H | H | H | H |
| 5,5 | D | D | D | D | D | D | D | D | H | H |
| 4,4 | H | H | H | P | P | H | H | H | H | H |
| 2,2–3,3 | P | P | P | P | P | P | H | H | H | H |

## Regras de consulta
1. Primeiro verificar desistência (só primeira decisão).
2. Depois pares (se puder separar).
3. Depois moles, depois duras.
4. Mãos com 3+ cartas: nunca D/P/R; D → H, Ds → S.
5. Nunca recomendar seguro nem even money.

## Implementação
- Tabelas como dados (`strategy/s17-das-ls.ts`), não como `if`s.
- `getHint(hand, dealerUpCard, config, validActions)` puro e testado célula a célula.


---

# Guião de Sessão — Exemplo Completo

Tem de ser reproduzido por teste automático com **sapato fixo** (as cartas saem pela ordem indicada).

**Mesa:** Ana (lugar 1), Bruno (lugar 2), Carla (lugar 3). Dealer "Rui".
**Configuração por omissão:** 6 baralhos, S17, PEEK, 3:2, DAS, até 4 mãos, desistência ativa, seguro ativo.
**Stack inicial:** 1000 cada.

---

## Ronda 1 — separações, dobrar e blackjack
**Apostas:** Ana 50 · Bruno 100 · Carla 20

**Distribuição:** Ana 10♠ · Bruno 8♦ · Carla A♥ · Dealer **9♠** · Ana 6♥ · Bruno 8♣ · Carla K♣ · Dealer [tapada 7♦]

| | Cartas | Total |
|---|---|---|
| Ana | 10♠ 6♥ | 16 |
| Bruno | 8♦ 8♣ | 16 (par) |
| Carla | A♥ K♣ | **Blackjack** |
| Dealer | 9♠ + ? | 9 |

Carta visível 9 → sem seguro, sem peek.

**Ana:** 16 vs 9 → Pede → 3♣ → 19 → Fica.

**Bruno:** Separa 8s (+100).
- Mão A: 8♦ + 2♠ = 10 → Dobra (+100) → K♥ → **20**.
- Mão B: 8♣ + 8♥ → Resepara (+100).
  - Mão B: 8♣ + 5♦ = 13 → Pede → Q♠ → **23, rebenta**.
  - Mão C: 8♥ + 10♦ = **18** → Fica.
- Em jogo no total: 200 + 100 + 100 = 400.

**Carla:** blackjack, não joga.

**Dealer:** revela 7♦ → 16 → pede → 4♣ → **20** → fica.

| Jogador | Mão | Resultado | Líquido |
|---|---|---|---|
| Ana | 19 | perde | −50 |
| Bruno A | 20 (dobrada, 200) | empate | 0 |
| Bruno B | 23 | perde | −100 |
| Bruno C | 18 | perde | −100 |
| Carla | BJ | 3:2 | +30 |

**Fichas:** Ana 950 · Bruno 800 · Carla 1030

---

## Ronda 2 — seguro, even money e blackjack do dealer
**Apostas:** Ana 100 · Bruno 50 · Carla 40

**Distribuição:** Ana 10♣ · Bruno 9♠ · Carla A♠ · Dealer **A♦** · Ana 10♥ · Bruno 2♦ · Carla Q♦ · Dealer [tapada K♠]

**Seguro** (Ás visível):
- Ana (20) aceita seguro: 50.
- Bruno (11) recusa.
- Carla tem blackjack → oferecem even money → aceita → recebe 40 já, mão fechada.

**Peek:** dealer tem blackjack → revela K♠ → ronda termina. Bruno nem chega a dobrar o 11 (é para isso que serve o peek: não perde a dobra).

| Jogador | Resultado | Líquido |
|---|---|---|
| Ana | perde 100, seguro paga 2:1 (+100) | 0 |
| Bruno | perde | −50 |
| Carla | even money | +40 |

**Fichas:** Ana 950 · Bruno 750 · Carla 1070

---

## Ronda 3 — mão mole dobrada e dealer rebenta
**Apostas:** Ana 20 · Bruno 100 · Carla 50

**Distribuição:** Ana 7♠ · Bruno A♣ · Carla 9♥ · Dealer **6♥** · Ana 5♣ · Bruno 7♥ · Carla 7♣ · Dealer [tapada 10♣]

**Ana:** 12 vs 6 → Fica (estratégia básica: S).
**Bruno:** soft 18 vs 6 → Dobra (+100) → 2♣ → **soft 20**.
**Carla:** 16 vs 6 → Pede (contra a estratégia básica: a dica diria "Ficar") → K♦ → **26, rebenta**.
**Dealer:** revela 10♣ → 16 → pede → Q♥ → **26, rebenta**.

| Jogador | Resultado | Líquido |
|---|---|---|
| Ana | ganha 1:1 | +20 |
| Bruno | ganha 1:1 sobre 200 | +200 |
| Carla | rebentou antes do dealer → perde | −50 |

**Fichas:** Ana 970 · Bruno 950 · Carla 1020

---

## Fecho da sessão (anfitrião termina)
| Posição | Jogador | Fichas | Saldo |
|---|---|---|---|
| 1 | Carla | 1020 | **+20** |
| 2 | Ana | 970 | −30 |
| 3 | Bruno | 950 | −50 |

`GameResult`: `PLACED` por esta ordem, `score` = saldo.

## Casos extra a cobrir nos testes (fora do guião)
- Desistência de 16 vs 10 (devolve metade).
- Separar Ases: uma carta cada, sem resseparar, A+K depois de separar paga 1:1.
- Carta de corte a meio de uma ronda → a ronda acaba normalmente, baralha antes da seguinte.
- Jogador que entra a meio da sessão: fica de fora até à fase de apostas seguinte.


---

# UI do Blackjack

Reutiliza o baralho clássico, componentes `Card`, animações base, sons e regras de acessibilidade/responsivo dos outros jogos. Aqui fica só o específico.

## 1. Mesa
- Feltro verde escuro (`#1E5631`), forma de **meia-lua** clássica: dealer no topo ao centro, 7 lugares em arco na base.
- Texto impresso no feltro, em arco, gerado da configuração:
  `BLACKJACK PAGA 3 PARA 2 · A BANCA FICA EM TODOS OS 17 · SEGURO PAGA 2 PARA 1`
- À direita do dealer: **sapato** (com barra discreta de cartas restantes e marca da carta de corte). À esquerda: **descarte**.
- O jogador local fica sempre no lugar central do ecrã (a mesa roda visualmente; a ordem real mantém-se).

## 2. Fichas
| Valor | Cor |
|---|---|
| 10 | azul |
| 20 | amarelo |
| 50 | laranja |
| 100 | preto |
| 500 | roxo |

- Fichas em SVG com as riscas laterais clássicas e valor ao centro; pilhas com leve desalinhamento para parecerem reais.
- As apostas são pilhas no círculo de aposta de cada lugar.

## 3. Fase de apostas
- Barra de fichas na base: tocar numa ficha adiciona ao círculo; tocar na pilha retira a última.
- Botões: **Limpar**, **Repetir** (aposta anterior), **Dobrar** (2× a anterior), **Confirmar**.
- Temporizador circular de 15 s no círculo de aposta.
- Mostrar min/max da mesa e as fichas disponíveis.
- Sem fichas suficientes para o mínimo: botão **Recomprar** (se permitido), com contador de recompras visível.

## 4. Mãos
- Cartas de cada mão em cascata (ligeiramente sobrepostas para cima e para a direita).
- Etiqueta de total por baixo: `16` ou `7 / 17` para mãos moles; `BLACKJACK` em dourado; `REBENTOU` a vermelho.
- Mãos separadas lado a lado; a mão ativa com contorno luminoso.
- Dobrar: a terceira carta entra **atravessada** (rodada 90°), como nos casinos.

## 5. Ações
- Botões grandes na base, só os válidos ficam ativos: **Pedir · Ficar · Dobrar · Separar · Desistir**.
- Atalhos de teclado (desktop): H, S, D, P, R.
- Gestos (telemóvel, opcional): toque duplo = pedir; deslizar horizontal = ficar.
- Dica (se ativa): ícone de lâmpada; ao tocar, destaca o botão recomendado durante 2 s. Nunca automático.
- Temporizador de decisão (20 s) à volta do avatar do jogador da vez.

## 6. Seguro / even money
- Painel compacto sobre a mesa: "Seguro por 25?" [Sim] [Não], com contagem de 10 s.
- Even money para quem tem blackjack: "Receber 1:1 já?" [Sim] [Não].

## 7. Dealer
- Avatar e nome do dealer no topo, balão de fala para as frases do chat (desaparece em 2 s).
- Carta tapada com o verso do baralho; ao revelar, flip 3D de 400 ms.
- Peek: a carta tapada levanta ligeiramente o canto durante 600 ms e volta a pousar.
- Cartas do dealer saem do sapato com deslize real (origem: sapato).

## 8. Liquidação
- Da direita para a esquerda: perdas → fichas deslizam para o dealer; ganhos → o dealer empurra fichas para o círculo; blackjack → fichas extra com brilho curto.
- Etiquetas de resultado por mão: `+100`, `EMPATE`, `−50`, `BLACKJACK +30`.
- Contador de fichas do jogador anima o valor (count-up de 400 ms).

## 9. Baralhar
- Quando sai a carta de corte: aviso discreto "Última ronda do sapato".
- Depois da liquidação: animação de baralhar (2,2 s) e barra do sapato volta a cheia.

## 10. Marcador da sessão
- Painel lateral recolhível: jogador, fichas, saldo (verde/vermelho), recompras, rondas jogadas.
- Fim de sessão: classificação por saldo.

## 11. Responsivo
- Telemóvel: 7 lugares não cabem em arco; mostrar o lugar local em destaque e os outros numa faixa horizontal compacta (fichas + total), expansível.


---

# Testes Obrigatórios — Blackjack

Cobertura ≥ 90% no motor. Motor puro com sapato injetado.

## 1. Valores
- `handValue` para todas as combinações relevantes: A+6 (soft 17), A+6+10 (hard 17), A+A (soft 12), A+A+9 (soft 21), A+A+A+A+7 (soft 21), 10+6+A (hard 17), 5+5+A (soft 21).
- `isBlackjack`: A+K ✓; A+K após separar ✗; A+5+5 ✗.

## 2. Dealer
- S17: fica em A+6; H17: pede em A+6.
- Pede em 16, fica em 17 duro.
- Não tira cartas se todas as mãos estão rebentadas/desistidas/BJ pago.
- Peek com A e com 10; modo europeu sem peek.

## 3. Ações
- DOUBLE só com 2 cartas; após separar só se DAS; recebe exatamente 1 carta.
- SPLIT: mesmo valor (J+Q válido se `splitTensByValue`); limite de 4 mãos; Ases uma carta cada e sem resseparar; fichas insuficientes → inválido.
- SURRENDER só na primeira decisão da mão original; nunca após separar.
- HIT/STAND fora de vez → erro; 21 fecha a mão automaticamente.

## 4. Apostas e fichas
- Aposta < min, > max, não múltiplo de 10, > stack → erro.
- Débito no momento de apostar/dobrar/separar/seguro; crédito na liquidação.
- Recompra só com stack < minBet (e se permitida); incrementa `rebuys`.
- **Conservação**: soma de stacks + fichas em jogo + ganho/perda acumulado do dealer = constante inicial (+ recompras).
- Todos os valores inteiros em todas as fases.

## 5. Liquidação (matriz completa)
Para cada combinação — jogador {BJ, 21, 20, 17, rebentou, desistiu} × dealer {BJ, 21, 20, 17, rebentou} — resultado e pagamento corretos. Mais: dobrada, separada, seguro com/sem BJ do dealer, even money.

## 6. Segurança
- Vista de cada jogador em todas as fases: não contém a carta tapada antes de `holeRevealed`, nem nenhuma carta do sapato.
- `CardDealt` para a tapada não contém a carta.

## 7. Sapato
- 6 baralhos = 312 cartas, 24 de cada valor, `uid` únicos.
- Carta de corte: a ronda em curso acaba; baralha antes da seguinte; nunca baralha a meio de uma ronda.
- Sapato que esgotaria a meio de uma ronda (penetração alta + 7 jogadores + separações) → baralhar o descarte como reserva (caso extremo, testado).

## 8. Sessão
- Entrar a meio → `sittingOut` até à próxima `BETTING`.
- Sair a meio de uma mão → mãos ficam e liquidam normalmente; lugar livre no fim da ronda.
- Timeouts: apostas → fora da ronda; seguro → recusa; decisão → ficar.
- `GameResult` ordenado por saldo com recompras descontadas.

## 9. Guião
- Reproduzir `07-GUIAO-DE-SESSAO.md` com sapato fixo: cartas, ações, pagamentos e fichas finais exatas.

## 10. Validação estatística (bloqueante)
- **Simulação de 1 000 000 de mãos** com bots de estratégia básica (06), aposta fixa, regras por omissão:
  - Vantagem da casa medida entre **0,2% e 0,7%** (esperado ≈ 0,4% para 6 baralhos S17 DAS LS).
  - Frequência de blackjack do jogador ≈ 4,75% (±0,2 p.p.).
  - Frequência de rebentar do dealer com carta visível 6 ≈ 42% (±2 p.p.).
- **RNG**: teste qui-quadrado à distribuição das cartas por posição após 100 000 baralhadas.
- Os números medidos ficam registados no relatório de testes.


---

# Plano de Fases — Blackjack

## Fase 0 — Núcleo
- Confirmar que as alterações do kit da Fodinha estão feitas.
- Implementar `04-ALTERACOES-AO-NUCLEO.md`: `createShoe` + `CardInstance`, fases simultâneas com temporizador por fase, `lifecycle: "SESSION"` com entrar/sair entre rondas.
- **Feito quando:** Mexicana e Fodinha 100% verdes; uma sala "SESSION" de teste aceita entradas e saídas entre rondas.

## Fase 1 — Motor
- `packages/games/blackjack`: config, estado, máquina de fases, algoritmos, vistas, ações válidas, dealer (05), estratégia básica (06).
- Todos os testes do 09, incluindo guião.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido.

## Fase 2 — Validação estatística
- Simulação de 1 000 000 de mãos e RNG (09 §10).
- **Feito quando:** números dentro dos intervalos e relatório entregue. Se falhar, voltar à Fase 1.

## Fase 3 — UI
- Componentes do 08: mesa meia-lua, fichas SVG, apostas, mãos, ações, seguro, dealer com personalidade, liquidação, baralhar, marcador.
- Página `/dev/blackjack` com estados fixos (apostas, separação em 3 mãos, seguro, peek, liquidação, baralhar).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel.

## Fase 4 — Integração e E2E
- Sessão com 3 contas via sockets (Playwright), com um jogador a entrar a meio e outro a sair a meio de uma mão.
- **Feito quando:** 4 pessoas em redes diferentes jogam 20 rondas seguidas em produção, sem dessincronizar.


---

# Pontos em Aberto — Blackjack

Cada ponto tem proposta por omissão. "ok" aceita todas; ou responde só com os números a mudar.

| # | Questão | Proposta por omissão | Decisão |
|---|---|---|---|
| 1 | Dealer **pede ou fica em soft 17** (A+6)? | Fica (S17), melhor para os jogadores | |
| 2 | **Carta tapada**: modelo americano (dealer espreita e acaba logo com blackjack) ou europeu, comum nos casinos portugueses (dealer só recebe a 2.ª carta no fim; com blackjack leva também as dobras e separações)? | Americano (PEEK): rondas mais rápidas e menos frustrantes | |
| 3 | **Pagamento de blackjack** | 3:2, fixo | |
| 4 | **Dobrar**: com quaisquer 2 cartas e também depois de separar? | Sim às duas | |
| 5 | **Separar**: até 4 mãos; Ases uma vez e uma carta cada; J+Q conta como par? | Sim; J+Q pode separar | |
| 6 | **Desistência** (perder metade e sair) disponível? | Sim, só como primeira decisão | |
| 7 | **Seguro e even money** disponíveis? | Sim | |
| 8 | **Sapato**: nº de baralhos e penetração | 6 baralhos, 75%, configurável na sala | |
| 9 | **Fichas**: por sessão ou carteira permanente? Recompra quando se fica sem fichas? | 1000 por sessão, sem economia permanente; recompra ilimitada de 1000, contada no marcador | |
| 10 | **Fim da sessão** | Quando o anfitrião termina ou todos saem | |
| 11 | **Entrar/sair a meio** da sessão | Permitido entre rondas; quem sai a meio de uma mão fica automaticamente | |
| 12 | **Temporizadores** | Apostas 15 s (sem aposta = fica de fora); seguro 10 s (= recusa); decisão 20 s (= ficar) | |
| 13 | **Várias mãos por jogador** (ocupar 2 lugares) | Não, no MVP | |
| 14 | **Botão de dica** (estratégia básica) | Sim, configurável na sala, desligado por omissão | |
| 15 | **Personalidade do dealer** (nome, frases no chat) | Sim, ligada | |
| 16 | **Ranking permanente** entre sessões | Não no MVP; só histórico de sessões | |


---

