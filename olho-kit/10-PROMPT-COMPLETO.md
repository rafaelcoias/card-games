# PROMPT — Adicionar o jogo "Olho" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e `lifecycle: "SESSION"`.

## Objetivo
Adicionar o **Olho** como módulo em `packages/games/olho`: sessão contínua de jogos em que a ordem de saída define cargos (Presidente, Vice-Presidente, Neutro, Vice-olho, Olho) e os cargos obrigam a trocar cartas no jogo seguinte.

## Documentos
- `02-REGRAS-OLHO.md` — regras (fonte de verdade)
- `03-CONTRATO-OLHO.md` — estado, ações, algoritmos, vistas, eventos
- `04-NUCLEO.md` — dependências; não alterar o núcleo
- `05-GUIAO-DE-SESSAO.md` — teste de aceitação com baralho reduzido injetado
- `06-UI-OLHO.md` — especificação visual e de interação
- `07-TESTES-OLHO.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 54 cartas (com jokers). Hierarquia: 3 < 4 < … < A < 2 < Joker. 3 a 8 jogadores.
- Joga-se carta única, par, tripla ou quádrupla; os seguintes respeitam o número de cartas e jogam igual ou mais alto.
- Carta igual à anterior salta o jogador seguinte, a não ser que ele jogue também essa carta.
- O joker corta tudo (fecha a vaza). Quatro cartas iguais seguidas também cortam. Quem corta abre a vaza seguinte.
- Quem passa já não volta a jogar nessa vaza. Na primeira vaza de cada jogo não se joga 2 nem joker.
- No 1.º jogo começa quem tem o 3♣; depois começa o Olho.
- A partir do 2.º jogo: o Olho dá as 2 melhores cartas ao Presidente (o servidor escolhe) e o Presidente devolve 2 à escolha; o Vice-olho e o Vice-Presidente trocam 1.
- A sessão acaba quando o anfitrião decide.

## Requisitos não negociáveis
1. **Troca de cartas sem batota possível.** O servidor escolhe as melhores cartas de quem dá. Quem recebe escolhe quais devolve, com temporizador.
2. **Informação oculta.** Mãos alheias: só contagens. As cartas trocadas só são vistas pelos dois envolvidos.
3. **Regras configuráveis** (02 §10), validadas com Zod, com os valores por omissão indicados.
4. **Motor puro e determinístico**, com baralho injetável.
5. **Reutilização visual** do baralho (incluindo jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.


---

# Regras do Olho — Especificação (v1.3 — fechada)

## 1. Objetivo
Ficar **sem cartas o mais cedo possível**. A ordem de saída define os cargos do jogo seguinte.

## 2. Material e jogadores
- Baralho de **54 cartas**: 52 + 2 jokers.
- **3 a 8 jogadores**.

## 3. Hierarquia
`3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 < Joker`
- Naipes não contam.
- O **2** é a carta normal mais alta e tem poder de corte reduzido (ver 8.2).
- O **Joker** bate tudo, incluindo os 2s.

## 4. Cargos
Atribuídos pela ordem em que os jogadores ficam sem cartas.

| Jogadores | Cargos (1.º → último) |
|---|---|
| 3 | Presidente · Neutro · Olho |
| 4 | Presidente · Vice-Presidente · Vice-olho · Olho |
| 5+ | Presidente · Vice-Presidente · Neutro(s) · Vice-olho · Olho |

No 1.º jogo da sessão ainda não há cargos.

## 5. Distribuição
- Distribuem-se **todas as 54 cartas**, uma a uma.
- Se a divisão não for certa, **alguns jogadores ficam com mais uma carta**. A distribuição começa num jogador **sorteado** em cada jogo, por isso quem fica com a carta a mais é aleatório.

## 6. Troca de cartas (a partir do 2.º jogo)
Depois de distribuir e antes de jogar:
- O **Olho** entrega ao **Presidente** as suas **2 melhores cartas**, escolhidas automaticamente pelo servidor pela hierarquia (Joker, 2, Ás, Rei…).
- O **Presidente** devolve ao Olho **2 cartas à sua escolha**, com temporizador (20 s; ao expirar, devolve as 2 mais baixas).
- O **Vice-olho** entrega ao **Vice-Presidente** a **melhor carta**; o Vice-Presidente devolve **1 à escolha**.
- Com 3 jogadores só há a troca Presidente ↔ Olho.
- As duas trocas decorrem em simultâneo.
- As cartas trocadas só são vistas pelos dois envolvidos.

## 7. Quem começa
- **1.º jogo:** quem tem o **3♣** (não é obrigado a jogá-lo).
- **Jogos seguintes:** o **Olho** do jogo anterior.

## 8. A vaza
### 8.1 Abrir
- Quem abre joga **uma combinação**: carta única, par, tripla ou quádrupla (cartas do mesmo valor), ou um joker.

### 8.2 Seguir
- Os jogadores seguintes (sentido dos ponteiros do relógio) jogam **o mesmo número de cartas** com valor **igual ou superior**, ou **passam**.
- **Quem passa já não volta a jogar nessa vaza.**

#### Bater com 2s (menos cartas)
Os 2s podem bater uma combinação **com menos cartas** do que ela tem:

| Combinação na mesa | 2s precisos |
|---|---|
| Carta única | 1 ou mais dois |
| Par | 1 ou mais dois |
| Tripla | 2 ou mais dois |
| Quádrupla | impossível — a quádrupla corta (8.4) |

- Regra geral: para bater uma combinação de **N** cartas (N ≤ 3) são precisos **pelo menos máx(1, N − 1)** dois. Pode usar-se mais (ex.: dois 2s sobre um 9).
- Os 2s também podem ser jogados da forma normal (par de 2s sobre par de Ases).
- Depois de um corte com 2s, a vaza continua com o **número de 2s jogados** como nova quantidade (ex.: um 2 sobre um par → a vaza passa a ser de cartas únicas).

#### 2s sobre 2s
Quando a mesa tem 2s, só se pode seguir com:
| Jogada | Efeito |
|---|---|
| **Mais 2s** do que os que estão na mesa (ex.: 2 dois sobre 1 dois) | bate; a quantidade da vaza passa a ser o nº de 2s jogados |
| **O mesmo nº de 2s** (ex.: 1 dois sobre 1 dois) | carta igual → salta o seguinte (8.3) |
| **Joker** | corta |

Exemplo: Ana corta um par de Reis com **um 2** → Bruno joga **dois 2s** → Carla só pode seguir com **três 2s** (impossível, só há 4 no baralho e já saíram 3) ou com um **joker**.

#### Joker
- O **joker** joga-se **sozinho** e **corta qualquer coisa**: carta única, par, tripla, quádrupla ou 2s.

### 8.3 Carta igual → salto
- Se alguém joga **o mesmo valor** que a jogada anterior (ex.: um 7 sobre um 7), o **jogador seguinte é saltado**…
- …**a não ser que tenha também essa carta** (o mesmo valor, na mesma quantidade) **e a jogue**. Nesse caso não é saltado, e é o seguinte a ele que fica sujeito ao salto.
- Quem escapa só o pode fazer com a mesma carta; não pode jogar mais alto em vez disso.
- Ser saltado só faz perder aquela vez; o jogador continua na vaza.
- Opção configurável `sameCardEscape` (por omissão **ligada**): se desligada, o seguinte é sempre saltado, mesmo tendo a carta.

### 8.4 Cortar
"Cortar" fecha a vaza de imediato, e **quem cortou abre a seguinte**.
- **Joker:** corta sempre.
- **Quádrupla jogada de uma vez** (4 cartas iguais na mesma jogada, incluindo quatro 2s): **corta sempre**, como o joker. Ninguém a pode bater.
- **Quatro iguais seguidos em várias jogadas** (ex.: 7, 7, 7, 7 de jogadores diferentes, ou par + par): corta. Opção configurável `fourOfAKindCuts`, por omissão **ligada**. Um joker pelo meio interrompe a sequência.
- Os **2s** batem com menos cartas (8.2), mas não fecham a vaza: ainda podem levar com um joker.

### 8.5 Fechar a vaza sem corte
- Quando **todos os outros jogadores ainda em jogo passaram**, a vaza fecha e **quem jogou por último abre a seguinte**.
- Se quem devia abrir já não tem cartas, abre o seguinte em jogo no sentido dos ponteiros do relógio.

### 8.6 Primeira vaza de cada jogo
- **Não se pode jogar 2 nem joker**. Opção configurável `firstTrickNoPower`, por omissão ligada.

## 9. Acabar
- Quem fica sem cartas sai e recebe a próxima posição livre.
- **Acabar com um 2 ou joker:** opção configurável `allowFinishWithPower`, por omissão **permitido**.
  - Se desligada, **a jogada é proibida**: não se pode jogar um 2 ou joker que deixe a mão vazia.
  - Quem só tiver 2s/jokers fica **bloqueado**: passa sempre e, se lhe calhar abrir, a abertura passa ao seguinte.
  - Se todos os jogadores com cartas estiverem bloqueados, o jogo termina: ficam com as últimas posições, **melhor quem tiver menos cartas**; empate → sorteio.
- Quando só resta um jogador com cartas, ele é o **Olho** e o jogo termina.
- Pausa de resumo, nova distribuição, troca, e o jogo seguinte começa.

## 10. Opções configuráveis da sala
| Opção | Por omissão |
|---|---|
| `allowFinishWithPower` — pode acabar-se com 2 ou joker | sim |
| `fourOfAKindCuts` — quatro iguais seguidos em várias jogadas cortam (a quádrupla de uma vez corta sempre) | sim |
| `sameCardEscape` — quem tem a mesma carta escapa ao salto jogando-a | sim |
| `firstTrickNoPower` — na primeira vaza de cada jogo não há 2 nem joker | sim |
| `turnTimeoutMs` / `escapeTimeoutMs` / `exchangeTimeoutMs` | 30 s / 5 s / 20 s |
| `displayName` | "Olho" |

## 11. Sessão
- Jogos seguidos até o **anfitrião terminar**.
- Pontos por jogo: Presidente +2 · Vice-Presidente +1 · Neutro 0 · Vice-olho −1 · Olho −2.
- No fim da sessão, classificação por pontos.

## 12. Temporizadores (configuráveis na sala)
| Temporizador | Por omissão | Ao expirar |
|---|---|---|
| Jogada | 30 s | Passa; se for ele a abrir, joga a carta mais baixa permitida |
| Escapar ao salto | 5 s | É saltado |
| Troca | 20 s | Devolve as cartas mais baixas |


---

# Contrato Técnico — Olho

## 1. Configuração
```ts
const OlhoConfigSchema = z.object({
  displayName: z.string().default("Olho"),
  allowFinishWithPower: z.boolean().default(true),
  fourOfAKindCuts: z.boolean().default(true),
  sameCardEscape: z.boolean().default(true),
  firstTrickNoPower: z.boolean().default(true),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  escapeTimeoutMs: z.number().int().min(3_000).max(15_000).default(5_000),
  exchangeTimeoutMs: z.number().int().min(10_000).max(60_000).default(20_000),
});
```
- `minPlayers: 3`, `maxPlayers: 8`, `lifecycle: "SESSION"`.
- Baralho: `createShoe({ decks: 1, jokers: true })`.

## 2. Força das cartas
```ts
const STRENGTH = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14,"2":15,"JOKER":16 };
```

## 3. Estado
```ts
type Role = "PRESIDENTE" | "VICE_PRESIDENTE" | "NEUTRO" | "VICE_OLHO" | "OLHO";

interface OlhoState {
  phase: "EXCHANGE" | "PLAYING" | "GAME_SUMMARY";
  config: OlhoConfig;
  gameNumber: number;
  seats: PlayerId[];                                 // ordem dos ponteiros do relógio
  roles: Record<PlayerId, Role | null>;              // do jogo anterior
  points: Record<PlayerId, number>;
  hands: Record<PlayerId, CardInstance[]>;
  exchange: {
    pairs: { giver: PlayerId; receiver: PlayerId; count: 1 | 2; given: CardInstance[]; returned: CardInstance[] | null }[];
  } | null;
  trick: {
    isFirstOfGame: boolean;
    count: number | null;                            // nº de cartas da combinação (null antes de abrir)
    topStrength: number | null;
    plays: { playerId: PlayerId; cards: CardInstance[] }[];
    passed: PlayerId[];
    sameRankRun: { rank: Rank; cards: number } | null;   // para os quatro iguais
    skip: { targetId: PlayerId; rank: Rank; count: number } | null; // salto pendente
    lastPlayerId: PlayerId | null;
  };
  currentPlayerId: PlayerId | null;
  finishOrder: PlayerId[];                           // ordem de saída neste jogo
  stateVersion: number;
  seed: string;
}
```

## 4. Ações
```ts
type OlhoAction =
  | { type: "PLAY"; cardUids: string[] }
  | { type: "PASS" }
  | { type: "ESCAPE"; cardUids: string[] }           // jogar a mesma carta para não ser saltado
  | { type: "ACCEPT_SKIP" }                          // não escapar
  | { type: "RETURN_CARDS"; cardUids: string[] }     // Presidente / Vice-Presidente na troca
  | { type: "SYS_TIMEOUT" }
  | { type: "SYS_EXCHANGE_TIMEOUT" }
  | { type: "SYS_NEXT_GAME" }
  | { type: "SYS_PLAYER_JOINED"; playerId: PlayerId } | { type: "SYS_PLAYER_LEFT"; playerId: PlayerId };
```

## 5. Algoritmos
### 5.1 Validar uma jogada
```ts
function canPlay(s, p, cards): boolean {
  const isJoker = cards.length === 1 && cards[0].rank === "JOKER";
  const sameRank = cards.every(c => c.rank === cards[0].rank) && cards[0].rank !== "JOKER";
  if (!isJoker && !sameRank) return false;
  if (s.trick.isFirstOfGame && s.config.firstTrickNoPower && (isJoker || cards[0].rank === "2")) return false;
  if (!s.config.allowFinishWithPower && wouldEmptyHand(s, p, cards) && isPower(cards)) return false;
  if (s.trick.count === null) return true;                       // abrir
  if (s.trick.passed.includes(p)) return false;
  if (isJoker) return true;                                      // corta qualquer coisa
  if (cards[0].rank === "2" && s.trick.topStrength === STRENGTH["2"]) {
    // 2s sobre 2s: mais 2s batem; o mesmo nº é carta igual (salto)
    return cards.length >= s.trick.count;
  }
  if (cards[0].rank === "2" && s.trick.topStrength! < STRENGTH["2"]) {
    // corte com 2s: pelo menos máx(1, N − 1) dois; pode usar-se mais
    if (cards.length >= Math.max(1, s.trick.count - 1)) return true;
  }
  return cards.length === s.trick.count && STRENGTH[cards[0].rank] >= s.trick.topStrength!;
}
// Depois de jogar 2s (corte ou escalada): s.trick.count = cards.length; s.trick.topStrength = 15
// "Igual" para efeitos de salto = mesmo valor E mesma quantidade que a jogada anterior
// isPower = 2 ou joker; wouldEmptyHand = a jogada esvazia a mão
```

### 5.2 Depois de uma jogada
```ts
function afterPlay(s, p, cards) {
  updateSameRankRun(s, cards);                    // joker faz reset
  const quad = cards.length === 4;                // quádrupla de uma vez: corta sempre
  const cut = isJoker(cards) || quad || (s.config.fourOfAKindCuts && s.trick.sameRankRun!.cards >= 4);
  if (handEmpty(s, p)) registerFinish(s, p, cards);
  if (gameOver(s)) return endGame(s);
  if (cut) return startNewTrick(s, leader = p);   // se p acabou: próximo em jogo
  const equal = previousStrength(s) === STRENGTH[cards[0].rank];
  if (equal) setPendingSkip(s, nextActive(s, p), cards[0].rank, cards.length);
  else advanceToNext(s, p);
}
```

### 5.3 Salto pendente
```ts
function resolveSkipTarget(s) {
  const { targetId, rank, count } = s.trick.skip!;
  const canEscape = s.config.sameCardEscape && countRank(s.hands[targetId], rank) >= count;
  if (canEscape) { s.currentPlayerId = targetId; /* ações válidas: ESCAPE | ACCEPT_SKIP */ }
  else { s.trick.skip = null; advanceToNext(s, targetId); }       // saltado: perde só esta vez
}
// ESCAPE → conta como jogada igual: volta a criar salto para o seguinte (e alimenta os quatro iguais)
// ACCEPT_SKIP → saltado; joga o seguinte
```

### 5.4 Fechar sem corte
- Depois de cada `PASS`: se todos os jogadores em jogo, exceto `lastPlayerId`, estão em `passed` → `startNewTrick(leader = lastPlayerId)` (ou o próximo em jogo, se ele já acabou).

### 5.5 Acabar e cargos
```ts
function registerFinish(s, p) { s.finishOrder.push(p); }
// Com allowFinishWithPower = false a jogada proibida nunca chega aqui (canPlay rejeita).

function isBlocked(s, p) {                     // só tem 2s/jokers e a opção está desligada
  return !s.config.allowFinishWithPower && s.hands[p].every(c => c.rank === "2" || c.rank === "JOKER")
         && !hasNonFinishingPowerPlay(s, p);   // ex.: dois 2s permitem jogar um e ficar com outro
}
// Bloqueado: só PASS; se for abrir, a abertura passa ao seguinte não bloqueado.
// Todos os que têm cartas bloqueados → fim do jogo; entre eles, menos cartas = melhor posição; empate → sorteio (seed).
// Ordem final = finishOrder + restantes
function assignRoles(order: PlayerId[]): Record<PlayerId, Role> {
  // 3: P, N, O · 4: P, VP, VO, O · 5+: P, VP, N…, VO, O
}
const POINTS = { PRESIDENTE: 2, VICE_PRESIDENTE: 1, NEUTRO: 0, VICE_OLHO: -1, OLHO: -2 };
```

### 5.6 Troca
```ts
function bestCards(hand, n) { return [...hand].sort(byStrengthDescThenSuit).slice(0, n); }
// Distribuição: começa num jogador sorteado (seed), uma carta de cada vez; as cartas a mais calham a quem calhar.
// EXCHANGE: o servidor move bestCards(Olho, 2) → Presidente e bestCards(ViceOlho, 1) → VicePresidente
// Espera RETURN_CARDS (qualquer carta da mão, incluindo as recebidas) com temporizador
// Timeout → devolve as mais baixas
// Quando todas as trocas fecham → PLAYING, começa o Olho
```

## 6. Vista por jogador
```ts
interface OlhoPlayerView {
  phase: OlhoState["phase"]; gameNumber: number; config: PublicConfig;
  me: { id: PlayerId; hand: CardInstance[]; role: Role | null };
  seats: { id: PlayerId; handCount: number; role: Role | null; points: number;
           passed: boolean; finishedPosition: number | null; isCurrent: boolean }[];
  trick: { count: number | null; plays: { playerId: PlayerId; cards: CardInstance[] }[];
           isFirstOfGame: boolean; sameRankRun: { rank: Rank; cards: number } | null };
  skipPrompt: { rank: Rank; count: number; deadline: number } | null;     // só para o alvo
  exchange: { iGive: CardInstance[] | null; iReceive: CardInstance[] | null; mustReturn: number | null; deadline: number | null } | null;
  validActions: OlhoAction[];
  turnDeadline: number | null;
  lastGameSummary: { order: PlayerId[]; roles: Record<PlayerId, Role> } | null;
}
```
- As cartas da troca só aparecem na vista dos dois envolvidos.

## 7. Eventos de domínio
| Evento | Payload |
|---|---|
| `GameDealt` | `{ gameNumber, counts }` |
| `ExchangeGiven` | `{ giver, receiver, count }` (cartas só para os envolvidos) |
| `ExchangeReturned` | `{ giver, receiver, count }` |
| `Played` | `{ playerId, cards }` |
| `Passed` | `{ playerId }` |
| `Skipped` | `{ playerId }` |
| `Escaped` | `{ playerId, cards }` |
| `Cut` | `{ playerId, reason: "JOKER" \| "QUAD" \| "FOUR_IN_A_ROW" }` |
| `TrickClosed` | `{ leaderId }` |
| `PlayerFinished` | `{ playerId, position }` |
| `PlayerBlocked` | `{ playerId }` (só tem 2s/jokers e a opção está desligada) |
| `GameEnded` | `{ order, roles, pointsDelta }` |

## 8. Resultado da sessão
- `PLACED` por pontos totais; `score` = pontos. Presidente com mais pontos = `WINNER`; último = `LOSER`.


---

# Núcleo — Dependências

O Olho **não acrescenta alterações ao núcleo**.

| Necessidade | Vem de |
|---|---|
| Baralho de 54 | `createShoe({ decks: 1, jokers: true })` |
| Troca simultânea (Presidente e Vice-Presidente ao mesmo tempo) | fases simultâneas — kit Blackjack `04` §2 |
| Sessão contínua com cargos entre jogos | `lifecycle: "SESSION"` — kit Blackjack `04` §3 |
| Temporizadores (jogada, salto, troca, resumo) | ações de sistema agendadas — kit Fodinha |
| Resultado por pontos | `GameResult` genérico — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |

**Entrar e sair a meio da sessão:** quem entra fica de fora até ao próximo jogo e começa sem cargo. Quem sai a meio de um jogo passa automaticamente em todas as vazas e fica com a pior posição livre. Se sair o Presidente ou o Olho, a troca do jogo seguinte faz-se só entre os cargos que existirem.


---

# Guião de Sessão — Dois jogos com troca

Teste automático obrigatório com **baralho reduzido** injetado (12 cartas por jogo, 3 por jogador), só para teste. Opções por omissão.

**Mesa:** Ana, Bruno, Carla, Duarte (sentido dos ponteiros do relógio). 4 jogadores → cargos P · VP · VO · O.

---

## Jogo 1

| Jogador | Mão |
|---|---|
| Ana | 3♣ 7♠ 2♥ |
| Bruno | 7♥ 9♦ K♠ |
| Carla | 5♣ 7♦ JOKER |
| Duarte | 4♦ 7♣ Q♥ |

Ana tem o 3♣ → **começa**. Primeira vaza: sem 2 nem joker.

### Vaza 1 — saltos e quatro iguais
1. Ana abre com **3♣**.
2. Bruno joga **7♥**.
3. Carla joga **7♦**, igual ao anterior → Duarte vai ser saltado…
4. …mas Duarte tem um 7 → **escapa** com **7♣** → agora a Ana vai ser saltada…
5. …mas a Ana tem um 7 → **escapa** com **7♠** → **quatro Setes seguidos → corta!**
6. A Ana abre a vaza seguinte.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Mão | 2♥ | 9♦ K♠ | 5♣ JOKER | 4♦ Q♥ |

### Vaza 2 — acabar com um 2 e joker a cortar
1. Ana joga **2♥** → fica sem cartas → **1.º lugar** (acabar com 2 é permitido por omissão).
2. Bruno passa (só um joker bate um 2).
3. Carla joga **JOKER** → **corta**. A Carla abre a seguinte.

### Vaza 3
1. Carla joga **5♣** → fica sem cartas → **2.º lugar**.
2. Duarte joga **Q♥**.
3. Bruno joga **K♠**.
4. Duarte passa (só tem 4♦).
5. Todos os outros em jogo passaram → a vaza fecha → o Bruno abre.

### Vaza 4
1. Bruno joga **9♦** → fica sem cartas → **3.º lugar**.
2. Só o Duarte tem cartas → **último**.

**Cargos:** Ana **Presidente** · Carla **Vice-Presidente** · Bruno **Vice-olho** · Duarte **Olho**
**Pontos:** Ana +2 · Carla +1 · Bruno −1 · Duarte −2

---

## Jogo 2

### Distribuição
| Jogador (cargo) | Mão |
|---|---|
| Duarte (Olho) | JOKER A♠ 4♣ |
| Ana (Presidente) | 3♥ 6♦ 8♣ |
| Bruno (Vice-olho) | 2♠ 9♣ 5♥ |
| Carla (Vice-Presidente) | 10♦ J♠ 3♦ |

### Troca (simultânea)
- O servidor tira ao Duarte as 2 melhores: **JOKER, A♠** → Ana. A Ana escolhe devolver **3♥, 6♦** → Duarte.
- O servidor tira ao Bruno a melhor: **2♠** → Carla. A Carla escolhe devolver **3♦** → Bruno.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Mão | 8♣ JOKER A♠ | 9♣ 5♥ 3♦ | 10♦ J♠ 2♠ | 4♣ 3♥ 6♦ |

O **Olho (Duarte) começa**. Primeira vaza: sem 2 nem joker.

### Vaza 1
1. Duarte **3♥** · Ana **8♣** · Bruno **9♣** · Carla **10♦**.
2. Duarte passa · Ana **A♠** (joker proibido nesta vaza) · Bruno passa · Carla passa (o 2♠ é proibido na primeira vaza e o J♠ não chega).
3. Vaza fecha → a Ana abre.

### Vaza 2
1. Ana joga **JOKER** → fica sem cartas → **1.º lugar** e corta.
2. Como a Ana já não tem cartas, abre o seguinte em jogo: **Bruno**.

### Vaza 3
1. Bruno **3♦** · Carla **J♠** · Duarte passa · Bruno passa.
2. Vaza fecha → a Carla abre.

### Vaza 4
1. Carla joga **2♠** → fica sem cartas → **2.º lugar**.
2. Duarte passa · Bruno passa → vaza fecha → como a Carla já acabou, abre o seguinte em jogo: **Duarte**.

### Vaza 5
1. Duarte **4♣** · Bruno **5♥** → Bruno fica sem cartas → **3.º lugar**.
2. Só o Duarte tem cartas → **último**.

**Cargos:** Ana Presidente · Carla Vice-Presidente · Bruno Vice-olho · Duarte Olho

---

## Fim da sessão (anfitrião termina)
| Posição | Jogador | Pontos |
|---|---|---|
| 1 | Ana | **+4** |
| 2 | Carla | +2 |
| 3 | Bruno | −2 |
| 4 | Duarte | −4 |

## Variantes a testar sobre o jogo 1, vaza 1
- `sameCardEscape = false`: depois do 7♦ da Carla, o Duarte é saltado mesmo tendo o 7♣; joga a Ana.
- `fourOfAKindCuts = false`: os quatro Setes não cortam; a vaza continua e o Bruno (sem nenhum 7) é saltado; joga a Carla.
- `allowFinishWithPower = false`: na vaza 2 do jogo 1, a Ana só tem o 2♥ e não o pode jogar (esvaziaria a mão). Fica bloqueada: a abertura passa ao Bruno e a Ana passa em todas as vazas seguintes.

## Cortes com 2s (cenários isolados para teste)
| Na mesa | Jogada | Resultado |
|---|---|---|
| 9 | 1 dois | válido; a vaza continua com cartas únicas |
| Par de Reis | 1 dois | válido; a vaza passa a cartas únicas |
| Par de Reis | par de 2s | válido (forma normal) |
| Tripla de 8 | 1 dois | inválido |
| Tripla de 8 | 2 dois | válido; a vaza passa a pares |
| 9 | 2 dois | válido; a vaza passa a pares de 2s |
| Par de Reis | 3 dois | válido |
| (abrir) | quádrupla de 5 | corta de imediato; quem jogou abre a seguinte |
| 1 dois | 2 dois | válido; a vaza passa a pares de 2s |
| 1 dois | 1 dois | válido; carta igual → salta o seguinte |
| 2 dois | 3 dois | válido |
| 2 dois | 1 dois | inválido |
| 1 dois | JOKER | válido; corta |
| Tripla de Ases | JOKER | válido; corta |


---

# UI do Olho

Reutiliza o baralho clássico (com os 2 jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro azul-petróleo (`#163A4A`).
- Lugares à volta; cada um com avatar, nome, **contador de cartas**, **insígnia do cargo** e pontos da sessão.
- Insígnias (SVG próprio, discreto):

| Cargo | Insígnia |
|---|---|
| Presidente | coroa dourada |
| Vice-Presidente | coroa prateada pequena |
| Neutro | círculo cinza |
| Vice-olho | olho pequeno |
| Olho | olho grande |

- Centro: **vaza atual**. As jogadas empilham-se ligeiramente desalinhadas, com a última por cima e em destaque.
- Indicadores por baixo da vaza: "Pares", "Triplas"…, e "Primeira vaza: sem 2 nem joker" quando aplicável.

## 2. Mão
- Leque ordenado por força (3 → joker), agrupado por valor.
- Tocar numa carta seleciona-a; tocar noutra do mesmo valor junta-a. Botão: **"Jogar par de 7"**.
- Cartas que não podem ser jogadas ficam esbatidas (valor baixo, quantidade errada, 2/joker na primeira vaza, 2/joker que esvaziaria a mão com a opção desligada).
- Corte com 2s: ao selecionar 2s, o botão mostra o efeito ("Cortar o par com um 2").
- Jogador bloqueado: etiqueta "Bloqueado — só tem 2s/jokers" no avatar.
- Botão **Passar** sempre visível na tua vez (exceto a abrir).

## 3. Salto
- Quando alguém joga carta igual, aparece no avatar do alvo o selo **"Saltado?"**.
- Se o alvo tiver a carta (e `sameCardEscape`): painel para ele *"Tens um 7. Jogas para não seres saltado?"* [**Jogar 7**] [**Ser saltado**], com 5 s.
- Saltado: selo **"Saltado!"** com seta curva a passar por cima do avatar.

## 4. Cortes
- Joker: a carta entra com rotação e brilho; carimbo **"CORTOU!"**; as cartas da vaza deslizam para o descarte.
- Quatro iguais: as quatro cartas alinham-se 600 ms; carimbo **"QUATRO IGUAIS — CORTOU!"**.
- Legenda: *"A Carla abre a próxima."*

## 5. Fim de vaza sem corte
- Quando todos passaram: as cartas deslizam para o descarte; legenda *"Ninguém bateu o Rei do Bruno. Abre o Bruno."*

## 6. Acabar
- Quem fica sem cartas: anel colorido à volta do avatar e o número da posição ("1.º").
- Fim do jogo: ecrã de resumo de 4 s com a ordem, os cargos novos e os pontos (+2, +1, 0, −1, −2).

## 7. Troca
- Ecrã de troca para todos, com a mesa esbatida.
- **Olho / Vice-olho:** vêem as suas melhores cartas a sair sozinhas da mão (não há escolha), com legenda *"O servidor entregou as tuas 2 melhores ao Presidente."*
- **Presidente / Vice-Presidente:** recebem as cartas (com destaque) e escolhem as que devolvem; botão **"Devolver"** ativo quando o número estiver certo; temporizador de 20 s.
- **Restantes:** *"Troca de cartas em curso…"* com as setas entre os cargos, sem mostrar cartas.

## 8. Marcador da sessão
- Painel lateral: jogadores, cargo atual, pontos, nº de vezes Presidente / Olho.
- Botão **"Terminar sessão"** só para o anfitrião, com confirmação.

## 9. Tempos
| Momento | Duração |
|---|---|
| Distribuir 54 cartas | stagger 25 ms |
| Jogar combinação | 300 ms |
| Selo de salto | 700 ms |
| Painel de escape | até 5 s |
| Corte (carimbo + recolha) | 900 + 400 ms |
| Fecho sem corte | 500 ms |
| Resumo do jogo | 4000 ms |
| Troca (animação das cartas) | 500 ms por carta |


---

# Testes Obrigatórios — Olho

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Distribuição e início
- 54 cartas distribuídas; diferenças de no máximo 1 carta.
- 1.º jogo começa quem tem o 3♣; jogos seguintes começa o Olho.

## 2. Validação de jogadas
- Combinação com valores diferentes → erro.
- Quantidade diferente da vaza → erro.
- Valor inferior → erro; igual → válido; superior → válido.
- Joker sozinho sobre carta única, par, tripla, quádrupla e 2s → válido; corta.
- Cortes com 2s: 1 dois sobre única e sobre par → válido; 1 dois sobre tripla → inválido; 2 dois sobre tripla → válido; 2 dois sobre única → válido; 3 dois sobre par → válido.
- Quádrupla de uma vez (incluindo quatro 2s) → corta sempre, mesmo com `fourOfAKindCuts = false`.
- Depois de um corte com 2s, a quantidade da vaza passa a ser o nº de 2s jogados.
- 2s sobre 2s: mais 2s → bate (1→2, 2→3, 1→3); o mesmo nº → salto; menos → inválido.
- Joker sobre qualquer quantidade de 2s → corta.
- Joker misturado com outras cartas → erro.
- Primeira vaza com `firstTrickNoPower`: 2 ou joker → erro (a abrir e a seguir); vaza 2 → válido.
- Quem passou volta a tentar jogar na mesma vaza → erro.

## 3. Salto
- Carta igual → seguinte saltado se não tiver a carta.
- Seguinte com a carta e `sameCardEscape` → pode ESCAPE (só com a mesma carta e quantidade) ou ACCEPT_SKIP.
- ESCAPE cria salto para o seguinte (cadeia).
- `sameCardEscape = false` → saltado sempre.
- Saltado não fica em `passed`; volta a jogar na mesma vaza.
- Timeout do escape → saltado.
- Pares iguais (par de 7 sobre par de 7) → salto aplicado com quantidade 2.

## 4. Cortes
- Joker corta e o autor abre a seguinte.
- Quatro iguais numa jogada (quádrupla) → corta sempre.
- Quatro iguais em várias jogadas (1+1+1+1, 2+2, 1+3) → corta.
- Joker pelo meio interrompe a sequência.
- `fourOfAKindCuts = false` → quatro iguais em várias jogadas não cortam (a quádrupla de uma vez continua a cortar).
- O 2 não corta: a vaza continua e um joker ainda o pode bater.

## 5. Fecho e liderança
- Todos os outros em jogo passaram → fecha; abre o último a jogar.
- Quem devia abrir já acabou → abre o seguinte em jogo.
- Corte por quem acabou de ficar sem cartas → abre o seguinte em jogo.

## 6. Acabar e cargos
- Cargos para 3, 4, 5 e 8 jogadores.
- `allowFinishWithPower = false`: jogada que esvazia a mão com 2/joker → rejeitada; com dois 2s pode jogar um e ficar com o outro.
- Jogador só com 2s/jokers e opção desligada → bloqueado: só passa; abertura passa ao seguinte.
- Todos os jogadores com cartas bloqueados → jogo termina; menos cartas = melhor; empate resolvido pela seed.
- Último com cartas → Olho, jogo termina.
- Pontos por cargo corretos e acumulados na sessão.

## 7. Troca
- O Olho entrega as 2 cartas mais fortes (joker > 2 > A > K…); empates resolvidos de forma determinística.
- O Presidente devolve qualquer 2 (incluindo as recebidas); número errado → erro.
- Vice-olho ↔ Vice-Presidente com 1 carta; com 3 jogadores não existe.
- Timeout → devolve as mais baixas.
- Trocas simultâneas: a fase só fecha quando ambas acabam.
- Cartas trocadas visíveis só aos envolvidos.

## 8. Segurança
- Nenhuma vista contém mãos alheias.
- `skipPrompt` só aparece ao alvo.

## 9. Sessão
- Entrar a meio → só joga no jogo seguinte, sem cargo.
- Sair a meio → passa automaticamente; pior posição livre.
- Terminar sessão → `GameResult` por pontos.

## 10. Guião
- Reproduzir `05-GUIAO-DE-SESSAO.md` com o baralho reduzido: cada vaza, cada tabela, cargos e pontos finais. Mais as três variantes.

## 11. Simulação
- 10 000 jogos com 3–8 bots aleatórios (escapes e passes ao calhas).
- Invariantes em cada passo:
  - **Conservação**: mãos + vaza + descarte = 54.
  - O jogador da vez tem cartas e não passou nesta vaza.
  - Na primeira vaza não aparece nenhum 2 nem joker (com a opção ligada).
- Cada jogo termina com todos os cargos atribuídos, também com `allowFinishWithPower = false`; limite de segurança de 5000 ações por jogo.


---

# Plano de Fases — Olho

## Fase 1 — Motor
- `packages/games/olho`: config, estado, validação, saltos, cortes, fecho, cargos, troca, sessão, vistas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião e variantes reproduzidos, 10 000 jogos sem violar invariantes, zero alterações ao núcleo.

## Fase 2 — UI
- Componentes do 06: insígnias de cargo, seleção de combinações, salto com painel de escape, cortes, troca, resumo e marcador.
- Página `/dev/olho` com estados fixos (abrir, seguir com par, salto com escape, quatro iguais, joker, troca do Presidente, troca do Olho, resumo).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Sessão de 3 jogos via sockets com 4 contas (Playwright), com troca de cartas real e um jogador a sair a meio.
- **Feito quando:** 5 pessoas em redes diferentes jogam uma sessão de 5 jogos em produção.


---

# Decisões — Olho

**Estado: FECHADO.** Todas as regras estão refletidas em `02-REGRAS-OLHO.md` (v1.3).

| Tema | Decisão |
|---|---|
| Jogadores | 3 a 8 (com 3: Presidente · Neutro · Olho); os do meio são Neutros |
| Baralho | 54, com jokers |
| Joker | Joga-se sozinho e corta tudo: única, par, tripla, quádrupla e 2s |
| 2s sobre cartas normais | Pelo menos 1 dois bate única ou par; pelo menos 2 dois batem tripla; pode usar-se mais |
| 2s sobre 2s | Mais 2s batem menos 2s; o mesmo nº faz saltar; o joker corta tudo |
| Quádrupla | Jogada de uma vez corta sempre, como o joker; não se bate |
| Quatro iguais seguidos (várias jogadas) | Corta; joga outra vez quem completou (configurável, por omissão ligado) |
| Quem começa | 1.º jogo: quem tem o 3♣ (não é obrigado a jogá-lo); depois: o Olho |
| Passar | Quem passa não volta a jogar na vaza |
| Primeira vaza de cada jogo | Não se joga 2 nem joker |
| Carta igual | Salta o seguinte, a não ser que ele jogue a mesma carta (configurável, por omissão pode escapar) |
| Escapar ao salto | Só com a mesma carta |
| Saltado | Perde só aquela vez; continua na vaza |
| Acabar com 2/joker | Configurável, por omissão permitido; se desligado, a jogada é proibida |
| Todos bloqueados (opção desligada) | O jogo termina; menos cartas fica melhor; empate → sorteio |
| Cartas a mais | Calham a jogadores aleatórios (distribuição começa num jogador sorteado) |
| Troca | O servidor escolhe as melhores de quem dá; o Presidente/Vice escolhe o que devolve |
| Pontos da sessão | Presidente +2 · Vice +1 · Neutro 0 · Vice-olho −1 · Olho −2 |
| Temporizadores | Configuráveis; por omissão jogada 30 s · escape 5 s · troca 20 s |
| Fim | Quando o anfitrião termina a sessão |


---

