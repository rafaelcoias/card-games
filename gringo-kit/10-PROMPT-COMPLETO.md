# PROMPT — Adicionar o jogo "Gringo" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e fila única de ações por sala.

## Objetivo
Adicionar o **Gringo** como módulo em `packages/games/gringo`, com UI própria e a mesma qualidade visual dos outros jogos.

## Documentos
- `02-REGRAS-GRINGO.md` — regras (fonte de verdade)
- `03-CONTRATO-GRINGO.md` — grelha, estado, ações, poderes, bater, vistas, eventos
- `04-NUCLEO.md` — dependências; não alterar o núcleo
- `05-GUIAO-DE-PARTIDA.md` — teste de aceitação com baralho fixo
- `06-UI-GRINGO.md` — especificação visual e de interação
- `07-TESTES-GRINGO.md` — cenários, segurança e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 54 cartas, 2 a 10 jogadores. Cada um recebe 4 cartas viradas para baixo, numa grelha com posições fixas, e só conhece 2.
- Na tua vez tiras do baralho e escolhes: trocar com uma carta tua (a antiga vai para o descarte) ou descartar a que tiraste. Se descartares uma carta com poder, podes usá-lo.
- Poderes (por omissão): 10 espreita uma carta de outro; Valete troca uma tua com uma de outro; Dama espreita uma tua; Rei espreita uma de outro e decide se troca.
- Sempre que cai uma carta no descarte, **um** jogador pode "bater" uma carta igual da sua grelha. Se errar, fica com ela e leva mais uma.
- Valores: Ás 1 … 10 vale 10; Joker 0; Reis vermelhos −3 (configurável −1).
- Fim: quando o baralho acaba, ou (opção) uma volta depois de alguém dizer "Gringo". Ganha quem tiver menos pontos.

## Requisitos não negociáveis
1. **Posições fixas.** Cada carta ocupa uma posição numerada na grelha do jogador e nunca muda de sítio sozinha. Trocas, batidas e penalizações mudam o conteúdo de posições concretas, sempre com animação. Posições vazias continuam visíveis como espaço vazio.
2. **Conhecimento por jogador.** O servidor nunca envia o valor de uma carta virada para baixo, exceto a quem a está a ver naquele momento (espreitar inicial, poder, carta tirada). Depois disso, a vista volta a não ter o valor: a memória é do jogador.
3. **Bater justo.** Uma única batida por descarte; a primeira que chega ao servidor ganha; cada batida indica o descarte a que se refere.
4. **Regras configuráveis** (02 §11), validadas com Zod.
5. **Reutilização visual** do baralho (incluindo jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.


---

# Regras do Gringo — Especificação (v1.0)

## 1. Objetivo
Acabar o jogo com **o menor número de pontos** na grelha.

## 2. Material e jogadores
- **54 cartas** (52 + 2 jokers).
- **2 a 10 jogadores.** Com muitos jogadores o baralho acaba depressa (ver 09 #11).

## 3. Valor das cartas
| Carta | Pontos |
|---|---|
| Ás | 1 |
| 2 a 10 | valor facial |
| Valete / Dama / Rei preto | ver 09 #1 (proposta: 11 / 12 / 13) |
| **Rei vermelho** (♥ ♦) | **−3** (configurável: −1) |
| **Joker** | **0** |

## 4. Preparação
- Cada jogador recebe **4 cartas viradas para baixo**, numa grelha 2 × 2 com **posições fixas**:

```
 [1] [2]      ← linha de cima
 [3] [4]      ← linha de baixo (as que podes espreitar)
```

- No início, todos espreitam ao mesmo tempo as **2 cartas da linha de baixo** (posições 3 e 4) durante alguns segundos. Depois voltam a ficar viradas para baixo, e a partir daí só se sabe o que se memorizou (09 #2).
- O resto forma o **baralho** (virado para baixo). O **descarte** começa vazio.
- Quem começa: ver 09 #9.

## 5. A vez de um jogador
1. *(Opcional)* Dizer **"Gringo"**, antes de jogar (ver 9).
2. **Tirar uma carta do baralho.** Só tu a vês. Não se pode tirar do descarte.
3. Escolher:
   - **Trocar:** pões a carta tirada numa posição tua (virada para baixo) e a carta que lá estava vai para o descarte, virada para cima.
   - **Descartar:** pões a carta tirada diretamente no descarte. Se tiver poder, podes usá-lo (ver 6).
4. Abre-se a janela para **bater** (ver 7).
5. Passa ao seguinte no sentido dos ponteiros do relógio.

## 6. Poderes
Só se ativam quando a carta **tirada do baralho é descartada diretamente** (09 #3). Usar o poder é sempre opcional.

### Configuração por omissão: "Figuras"
| Carta | Poder |
|---|---|
| **10** | Espreitar **uma carta de outro jogador** |
| **Valete** | **Trocar** uma carta tua com uma carta de outro jogador, ambas à tua escolha, sem as ver |
| **Dama** | Espreitar **uma carta tua** |
| **Rei** | Espreitar **uma carta de outro jogador** e decidir se a **trocas** com uma carta tua |

### Configuração alternativa: "Sete a Dez"
| Carta | Poder |
|---|---|
| **7** | Espreitar uma carta de outro jogador |
| **8** | Trocar uma tua com uma de outro, sem ver |
| **9** | Espreitar uma carta tua |
| **10** | Espreitar uma de outro e decidir se trocas |

- Numa troca, cada carta vai para a posição exata de onde veio a outra.
- Todos veem **que** posições foram espreitadas ou trocadas; ninguém, além de quem espreitou, vê os valores.

## 7. Bater
- Sempre que uma carta vai para o descarte, abre-se uma **janela curta** (3 s, configurável).
- Nessa janela, **um único jogador** pode **bater**: escolhe uma posição da **sua** grelha e atira essa carta para cima do descarte, por achar que é do **mesmo valor** (09 #4 e #6).
  - **Acertou:** a carta fica no descarte e a posição fica **vazia**. Tens menos uma carta.
  - **Errou:** a carta é mostrada a todos, **volta para a mesma posição** virada para baixo, e levas **mais uma carta do baralho** numa posição nova da tua grelha, sem a ver (09 #5).
- Depois da primeira batida (certa ou errada), **mais ninguém pode bater** sobre essa carta.
- Uma carta batida não abre nova janela, e uma carta de poder batida não ativa o poder.
- O jogador seguinte só tira do baralho quando a janela fecha.

## 8. Jogador sem cartas
- Quem fica sem cartas (todas batidas) **já não joga**: é saltado.
- Pode na mesma dizer **"Gringo"** quando lhe calharia a vez, se a opção Gringo estiver ligada.
- Não pode ser alvo de poderes.

## 9. "Gringo" (opcional, configurável)
- Só se pode dizer **na própria vez, antes de tirar carta**.
- Só depois de cada jogador ter jogado pelo menos **5 vezes** (configurável).
- Quem diz Gringo **joga a sua vez normalmente**; depois **cada um dos outros joga mais uma vez**, e o jogo acaba.
- Não há penalização para quem diz Gringo: se não tiver a menor pontuação, simplesmente perde.

## 10. Fim do jogo e pontuação
- O jogo acaba:
  - quando o **baralho acaba** (09 #7); ou
  - com a opção Gringo ligada, depois da volta final a seguir ao Gringo (o que acontecer primeiro).
- Viram-se todas as grelhas e somam-se os pontos.
- **Ganha quem tiver menos pontos.** Empate: vitória partilhada (09 #10).
- Cada partida é independente (sem pontuação acumulada).

## 11. Opções configuráveis da sala
| Opção | Valores | Por omissão |
|---|---|---|
| `redKingValue` | −3 / −1 | −3 |
| `powerSet` | "FIGURAS" (10–K) / "SETE_A_DEZ" (7–10) | FIGURAS |
| `gringoEnabled` | sim / não | não (o jogo acaba quando o baralho acaba) — 09 #7 |
| `gringoMinTurns` | 1–20 voltas | 5 |
| `snapWindowMs` | 2–6 s | 3 s |
| `decks` | 1 / 2 | 1 (09 #11) |
| Temporizadores | ver 12 | — |

## 12. Temporizadores
| Momento | Por omissão | Ao expirar |
|---|---|---|
| Espreitar inicial | 10 s | as cartas voltam a ficar viradas para baixo |
| Vez (tirar + decidir) | 30 s | descarta a carta tirada, sem usar poder |
| Usar poder | 15 s | o poder é ignorado |
| Janela de bater | 3 s | ninguém bateu |


---

# Contrato Técnico — Gringo

## 1. Configuração
```ts
const GringoConfigSchema = z.object({
  redKingValue: z.union([z.literal(-3), z.literal(-1)]).default(-3),
  powerSet: z.enum(["FIGURAS", "SETE_A_DEZ"]).default("FIGURAS"),
  gringoEnabled: z.boolean().default(false),
  gringoMinTurns: z.number().int().min(1).max(20).default(5),
  snapWindowMs: z.number().int().min(2_000).max(6_000).default(3_000),
  decks: z.union([z.literal(1), z.literal(2)]).default(1),
  initialPeekMs: z.number().int().default(10_000),
  turnTimeoutMs: z.number().int().default(30_000),
  powerTimeoutMs: z.number().int().default(15_000),
});
```
- `minPlayers: 2`, `maxPlayers: 10`, `lifecycle: "MATCH"`.
- Baralho: `createShoe({ decks: config.decks, jokers: true })`.

## 2. Grelha com posições fixas
```ts
interface Slot { index: number; card: CardInstance | null }   // null = posição vazia (carta batida)
type Grid = Slot[];                                            // começa com índices 0–3; penalizações acrescentam 4, 5…
```
- Os índices **nunca mudam nem se reordenam**. Uma posição vazia mantém-se vazia (a UI mostra o espaço).
- Penalização → nova posição com o próximo índice livre.
- Trocas (troca própria, Valete, Rei) mudam o `card` de posições concretas.

## 3. Estado (servidor)
```ts
type Phase = "INITIAL_PEEK" | "TURN_DRAW" | "TURN_DECIDE" | "POWER" | "SNAP_WINDOW" | "FINISHED";

interface GringoState {
  phase: Phase;
  config: GringoConfig;
  seats: PlayerId[];
  currentIndex: number;
  turnsPlayed: Record<PlayerId, number>;
  grids: Record<PlayerId, Grid>;
  deck: CardInstance[];
  discard: CardInstance[];
  drawn: CardInstance | null;                    // carta tirada, só visível ao jogador da vez
  power: { type: PowerType; step: "CHOOSE" | "PEEKED"; peeked?: { owner: PlayerId; index: number } } | null;
  snap: { discardId: number; closesAt: number; taken: boolean } | null;
  nextDiscardId: number;
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  stateVersion: number;
  seed: string;
}

type PowerType = "PEEK_OTHER" | "BLIND_SWAP" | "PEEK_OWN" | "PEEK_AND_SWAP";
const POWERS = {
  FIGURAS:    { "10": "PEEK_OTHER", J: "BLIND_SWAP", Q: "PEEK_OWN", K: "PEEK_AND_SWAP" },
  SETE_A_DEZ: { "7": "PEEK_OTHER", "8": "BLIND_SWAP", "9": "PEEK_OWN", "10": "PEEK_AND_SWAP" },
};
```

## 4. Ações
```ts
type GringoAction =
  | { type: "CALL_GRINGO" }                                   // na vez, antes de DRAW
  | { type: "DRAW" }
  | { type: "SWAP_DRAWN"; index: number }                     // põe a tirada na posição; a antiga vai para o descarte
  | { type: "DISCARD_DRAWN"; usePower: boolean }
  | { type: "POWER_PEEK"; owner: PlayerId; index: number }    // PEEK_OTHER, PEEK_OWN, 1.º passo do PEEK_AND_SWAP
  | { type: "POWER_BLIND_SWAP"; myIndex: number; owner: PlayerId; theirIndex: number }
  | { type: "POWER_SWAP_DECISION"; swap: boolean; myIndex?: number }   // 2.º passo do PEEK_AND_SWAP
  | { type: "SNAP"; discardId: number; index: number }        // qualquer jogador com cartas, na janela
  | { type: "SYS_INITIAL_PEEK_END" }
  | { type: "SYS_SNAP_WINDOW_CLOSED"; discardId: number }
  | { type: "SYS_TIMEOUT" };
```

## 5. Algoritmos
```ts
const points = (c: CardInstance, cfg) =>
  c.rank === "JOKER" ? 0 :
  c.rank === "K" && (c.suit === "H" || c.suit === "D") ? cfg.redKingValue :
  ({ A: 1, J: 11, Q: 12, K: 13 } as any)[c.rank] ?? Number(c.rank);   // J/Q/K: 09 #1

function toDiscard(s, card) {                       // qualquer carta que vá para o descarte (exceto batidas)
  s.discard.push(card);
  s.snap = { discardId: s.nextDiscardId++, closesAt: now + cfg.snapWindowMs, taken: false };
  schedule("SYS_SNAP_WINDOW_CLOSED", cfg.snapWindowMs);
}

function snap(s, p, discardId, index) {
  assert(s.snap && !s.snap.taken && s.snap.discardId === discardId);
  const slot = s.grids[p][index]; assert(slot.card);
  s.snap.taken = true;                                       // mais ninguém pode
  const top = s.discard.at(-1)!;
  if (slot.card.rank === top.rank) {                         // mesmo valor (09 #6)
    s.discard.push(slot.card); slot.card = null;             // posição fica vazia
  } else {
    emit("SnapFailed", { p, index, card: slot.card });       // revelada a todos; fica na posição
    if (s.deck.length) s.grids[p].push({ index: nextIndex(s.grids[p]), card: s.deck.shift()! });
  }
}

function afterTurn(s) {
  // espera SYS_SNAP_WINDOW_CLOSED; depois:
  if (s.gringo) { remove current from s.gringo.remaining; if (s.gringo.remaining.length === 0) return finish(s); }
  if (s.deck.length === 0) return finish(s);                 // 09 #7
  advanceToNextWithCards(s);                                 // salta quem não tem cartas
}

function canCallGringo(s, p) {
  return s.config.gringoEnabled && !s.gringo
      && s.seats.every(q => s.turnsPlayed[q] >= s.config.gringoMinTurns || gridEmpty(s, q));
}
```
- `CALL_GRINGO` por um jogador sem cartas: o servidor oferece-lhe o botão quando a vez lhe calharia; se disser, `remaining` = todos os outros com cartas.

## 6. Vista por jogador
```ts
interface GringoPlayerView {
  phase: Phase;
  me: { id: PlayerId; grid: { index: number; empty: boolean; revealed?: CardInstance }[]; drawn: CardInstance | null };
  seats: { id: PlayerId; grid: { index: number; empty: boolean }[]; isCurrent: boolean; turnsPlayed: number }[];
  deckCount: number;
  discardTop: CardInstance | null;
  snapWindow: { discardId: number; closesAt: number; open: boolean } | null;
  power: { type: PowerType; step: string } | null;          // só para o jogador da vez
  peekResult: { owner: PlayerId; index: number; card: CardInstance } | null;  // só para quem espreitou, só nesse momento
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  validActions: GringoAction[];
  turnDeadline: number | null;
  final: { grids: Record<PlayerId, CardInstance[]>; scores: Record<PlayerId, number> } | null;
}
```
- `revealed` só existe durante o espreitar inicial (posições 3 e 4 do próprio).
- `peekResult` existe só durante o passo de poder; desaparece na ação seguinte.
- **Nunca** existe na vista um campo com o valor de uma carta virada para baixo fora destes momentos.

## 7. Eventos de domínio
| Evento | Payload (público, salvo indicação) |
|---|---|
| `InitialPeekStarted` / `InitialPeekEnded` | — (cartas só na vista do próprio) |
| `GringoCalled` | `{ playerId }` |
| `Drew` | `{ playerId }` (a carta só vai para o próprio) |
| `Swapped` | `{ playerId, index, discarded: CardInstance }` |
| `DiscardedDrawn` | `{ playerId, card, powerUsed: boolean }` |
| `Peeked` | `{ playerId, owner, index }` (valor só para quem espreitou) |
| `BlindSwapped` | `{ playerId, myIndex, owner, theirIndex }` |
| `PeekSwapDecided` | `{ playerId, swapped: boolean, myIndex? }` |
| `SnapSucceeded` | `{ playerId, index, card }` |
| `SnapFailed` | `{ playerId, index, card, penaltyIndex: number \| null }` |
| `PlayerOut` | `{ playerId }` (sem cartas) |
| `GameFinished` | `{ grids, scores, winners }` |

## 8. Resultado
- `WINNER`: menor pontuação (empates partilham).
- Restantes: `PLACED` por pontuação crescente; `score` = pontos.


---

# Núcleo — Dependências

O Gringo **não acrescenta alterações ao núcleo**.

| Necessidade | Vem de |
|---|---|
| Baralho de 54 (ou 108 com 2 baralhos) | `createShoe` — kit Blackjack `04` §1 |
| Espreitar inicial em simultâneo e bater fora da vez | fases simultâneas — kit Blackjack `04` §2 |
| Uma só batida por descarte | fila única por sala — kit Desconfia `04` |
| Janela de bater, temporizadores | ações de sistema agendadas — kit Fodinha |
| Resultado por pontos | `GameResult` genérico — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |


---

# Guião de Partida — Exemplo Completo

Teste automático obrigatório com o baralho injetado abaixo. Para o guião ser curto, usa `gringoEnabled = true` e `gringoMinTurns = 1`. Restantes opções por omissão (poderes "Figuras", Rei vermelho −3).

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio). Começa a Ana.

## Distribuição
Grelhas (posições `[1][2]` em cima, `[3][4]` em baixo):

| Jogador | [1] | [2] | [3] | [4] | Espreita no início |
|---|---|---|---|---|---|
| Ana | 9♣ | K♥ | 2♦ | 7♠ | 2♦, 7♠ |
| Bruno | 4♥ | J♣ | A♠ | 10♦ | A♠, 10♦ |
| Carla | 6♦ | JOKER | Q♠ | 3♣ | Q♠, 3♣ |

**Baralho** (topo primeiro): 10♠, 5♥, J♦, 3♥, J♥, K♦, 2♣, … (resto em qualquer ordem)

---

### Vez 1 — Ana
1. Tira **10♠**. Descarta-a e usa o poder (espreitar uma carta de outro): espreita **Bruno [2] = J♣**. Só a Ana vê.
2. Janela de bater sobre o 10♠: o **Bruno bate** a posição [4] (sabe que é o 10♦) → **acertou** → Bruno [4] fica **vazia**.

### Vez 2 — Bruno
1. Tira **5♥**. Troca com a posição [2] (não sabe o que lá está) → sai o **J♣** para o descarte. Não há poder (a carta saiu por troca).
2. Janela sobre o J♣: a **Carla bate** a posição [1] às cegas → é o **6♦** → **errou**. O 6♦ é mostrado a todos e volta para Carla [1]; a Carla leva a carta de cima do baralho (**J♦**) numa posição nova **[5]**, sem a ver.

| | [1] | [2] | [3] | [4] | [5] |
|---|---|---|---|---|---|
| Bruno | 4♥ | 5♥ | A♠ | — | |
| Carla | 6♦ | JOKER | Q♠ | 3♣ | J♦ |

### Vez 3 — Carla
1. Tira **3♥**. Troca com a posição [3] (sabe que é a Q♠, 12 pontos) → sai a **Q♠**.
2. Janela sobre a Q♠: ninguém bate.

### Vez 4 — Ana: "Gringo!"
Todos já jogaram pelo menos uma vez → a Ana pode chamar.
1. Diz **"Gringo"** antes de tirar.
2. Tira **J♥**. Descarta-a e usa o poder (trocar às cegas): troca a sua posição **[1]** com a **Carla [2]**.
   - Ana [1] passa a ter o **JOKER**; Carla [2] passa a ter o **9♣**. Ninguém vê os valores.
3. Janela sobre o J♥: ninguém bate.
4. Falta jogar **uma vez** o Bruno e a Carla.

### Vez 5 — Bruno (última)
1. Tira **K♦** (Rei vermelho, −3). Podia descartá-lo e usar o poder do Rei, mas prefere ficar com ele: troca com a posição **[1]** → sai o **4♥**.
2. Ninguém bate.

### Vez 6 — Carla (última)
1. Tira **2♣**. Troca com a posição **[5]** → sai o **J♦**.
2. Ninguém bate. O jogo acaba.

---

## Revelação final
| Jogador | Grelha | Pontos |
|---|---|---|
| Ana | JOKER (0) · K♥ (−3) · 2♦ (2) · 7♠ (7) | **6** |
| Bruno | K♦ (−3) · 5♥ (5) · A♠ (1) · — | **3** |
| Carla | 6♦ (6) · 9♣ (9) · 3♥ (3) · 3♣ (3) · 2♣ (2) | **23** |

**Ganha o Bruno (3 pontos).** A Ana chamou Gringo sem saber que tinha um Rei vermelho escondido, e não chegou: perde, sem penalização extra.

## Variantes a testar
- `gringoEnabled = false`: as vezes continuam até o baralho acabar.
- `redKingValue = -1`: Ana 8, Bruno 5.
- `powerSet = "SETE_A_DEZ"`: o 10♠ da vez 1 passa a ter o poder "espreitar e decidir trocar"; o J♥ da vez 4 deixa de ter poder.


---

# UI do Gringo

Reutiliza o baralho clássico (com jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro verde-azeitona (`#3B4A2A`).
- Centro: **baralho** (virado para baixo, com contador) e **descarte** (virado para cima, só a carta do topo bem visível).
- À volta: a **grelha de cada jogador**, sempre na mesma disposição.
- A tua grelha na base, maior.

## 2. Grelhas com posições fixas (requisito central)
- Cada posição tem um **número discreto** no canto ([1], [2]…) e um contorno fixo, mesmo quando está vazia.
- Grelha base 2 × 2; as penalizações acrescentam posições à direita ([5], [6]…), sem mexer nas outras.
- **Nada se reordena.** Qualquer mudança é uma animação de/para uma posição concreta.
- Posição vazia: contorno tracejado com um "✓" discreto (carta batida com sucesso).

## 3. Espreitar inicial
- No início, as tuas posições [3] e [4] viram-se para ti durante 10 s, com uma barra de tempo e a legenda *"Memoriza!"*.
- Os outros veem as tuas cartas a levantar ligeiramente, sem verem a face.

## 4. A tua vez
1. Botão **"Gringo"** visível no início da vez, se for permitido (com o motivo quando não for: *"Faltam 2 voltas"*).
2. Tocar no baralho para tirar. A carta sobe e vira **só para ti**, ao lado do baralho.
3. Opções:
   - **Tocar numa posição tua** → a carta tirada entra nessa posição e a antiga voa virada para cima para o descarte.
   - **Botão "Descartar"** → a carta vai para o descarte; se tiver poder, aparece *"Usar poder: espreitar carta de outro"* [Usar] [Não].

## 5. Poderes
- **Espreitar (de outro ou tua):** as posições válidas brilham; ao tocar, a carta levanta e vira só para ti durante 3 s. Os outros veem um ícone de olho sobre essa posição.
- **Trocar às cegas (Valete):** tocar numa posição tua e depois numa de outro; as duas cartas trocam de lugar em arco (viradas para baixo).
- **Espreitar e decidir (Rei):** primeiro espreita; depois [Trocar com uma minha] [Não trocar].
- Legenda pública: *"A Ana espreitou a carta [2] do Bruno."* / *"A Ana trocou a sua [1] com a [2] da Carla."*

## 6. Bater
- Quando cai uma carta no descarte, aparece à volta do descarte um anel de 3 s e a legenda *"Bater?"*.
- Durante a janela, **toca numa posição tua** para bater (confirmação por toque longo ou duplo toque, para evitar acidentes).
- **Acertou:** a carta voa para o descarte e a posição fica vazia; selo verde *"Bateu!"*.
- **Errou:** a carta vira para todos durante 1,5 s com o selo vermelho *"Errou!"*, volta para a posição, e uma carta nova do baralho entra numa posição nova.
- Quando alguém bate, o anel desaparece para todos.

## 7. Gringo
- Quem diz Gringo fica com o selo **"GRINGO!"** no avatar durante o resto do jogo.
- Faixa no topo: *"Última volta: falta o Bruno e a Carla"*.

## 8. Revelação final
- Todas as grelhas viram posição a posição (stagger 120 ms por jogador).
- Por cima de cada carta aparece o valor (os Reis vermelhos e os jokers em destaque).
- Total por jogador com count-up; vencedor(es) com coroa; restantes por ordem.
- Botões "Nova partida" e "Voltar ao lobby".

## 9. Responsivo (até 10 jogadores)
- Desktop: grelhas dos adversários em círculo, em tamanho `sm`.
- Telemóvel: a tua grelha em grande na base; os adversários numa faixa horizontal com grelhas mini (scroll), e a grelha do alvo amplia-se quando estás a escolher num poder.

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 50 ms |
| Espreitar inicial | 10 s |
| Tirar carta (subir + virar só para ti) | 400 ms |
| Troca própria | 450 ms |
| Espreitar com poder | 3 s visível |
| Troca às cegas | 600 ms |
| Janela de bater | 3 s |
| Batida falhada (mostrar) | 1500 ms |
| Revelação final | 120 ms por jogador + 400 ms por carta |


---

# Testes Obrigatórios — Gringo

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 4 cartas por jogador, índices 0–3; baralho com o resto (54 ou 108).
- Espreitar inicial: só as posições 3 e 4 do próprio aparecem na vista dele, e só durante `INITIAL_PEEK`.

## 2. Vez
- Fora de vez → erro. Tirar duas vezes → erro.
- Trocar: a antiga vai para o descarte e a tirada fica na posição exata.
- Descartar sem poder / com poder.
- Poder só a partir de carta tirada e descartada diretamente; carta de poder que sai por troca ou por batida → sem poder.
- Os dois conjuntos de poderes (`FIGURAS`, `SETE_A_DEZ`) mapeados corretamente.

## 3. Poderes
- Espreitar outro: `peekResult` só na vista de quem espreitou, só nesse passo.
- Espreitar a tua: idem.
- Trocar às cegas: as cartas trocam de posição exata; ninguém recebe valores.
- Espreitar e decidir: trocar e não trocar.
- Alvo sem cartas ou posição vazia → inválido.
- Timeout no poder → ignorado.

## 4. Bater
- Batida certa → posição vazia; a carta vai para o descarte.
- Batida errada → carta revelada, volta à mesma posição, nova posição com carta do baralho.
- Batida errada com baralho vazio → sem carta de penalização.
- Segunda batida no mesmo descarte → rejeitada.
- Batida com `discardId` antigo → rejeitada.
- 5 batidas simultâneas → exatamente uma aceite.
- Batida sobre carta batida → impossível (não abre janela).
- Rei vermelho bate Rei preto (mesmo valor); joker bate joker.
- Jogador da vez também pode bater.

## 5. Posições fixas
- Nenhuma operação altera os índices existentes; penalizações acrescentam o próximo índice.
- Posição vazia continua na grelha como `empty`.

## 6. Gringo
- Antes de todos terem `gringoMinTurns` voltas → inválido.
- Depois de tirar carta → inválido.
- Com `gringoEnabled = false` → nunca disponível.
- Depois do Gringo: quem chamou joga; cada um dos outros joga uma vez; termina.
- Jogador sem cartas pode chamar quando lhe calharia a vez.
- Segundo Gringo → inválido.

## 7. Fim e pontuação
- Baralho vazio → termina (09 #7).
- Pontos: Ás 1, números, J/Q/K (09 #1), Rei vermelho −3 / −1, joker 0, posições vazias 0.
- Menor pontuação ganha; empates partilham.

## 8. Segurança da informação
- Em nenhuma vista, fora dos momentos previstos, aparece o valor de uma carta virada para baixo (de ninguém, incluindo o próprio).
- `drawn` só na vista do jogador da vez.
- Eventos públicos de espreitar e trocar nunca contêm valores.

## 9. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` (cada tabela e a revelação final) e as três variantes.

## 10. Simulação
- 10 000 partidas com 2–10 bots (memória perfeita ou aleatória, batidas com probabilidade variável).
- Invariantes em cada passo:
  - **Conservação**: grelhas + baralho + descarte + carta tirada = 54 × `decks`.
  - Índices de posição estritamente crescentes por jogador e nunca reutilizados.
  - No máximo uma batida por `discardId`.
- Termina sempre (baralho finito); registar duração média por nº de jogadores.


---

# Plano de Fases — Gringo

## Fase 1 — Motor
- `packages/games/gringo`: config, grelhas fixas, vez, poderes, bater, Gringo, fim, vistas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião, variantes e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 partidas sem violar invariantes, zero alterações ao núcleo.

## Fase 2 — UI
- Componentes do 06: grelhas numeradas com posições fixas, espreitar inicial, tirar/trocar/descartar, poderes, bater com janela, Gringo, revelação final.
- Página `/dev/gringo` com estados fixos (espreitar inicial, carta tirada, cada poder, janela de bater, batida certa, batida errada, Gringo, revelação).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel com 10 jogadores.

## Fase 3 — Integração e E2E
- Partida via sockets com 4 contas (Playwright), com batidas simultâneas e reconexão a meio de um poder.
- **Feito quando:** 6 pessoas em redes diferentes jogam uma partida completa em produção.


---

# Pontos em Aberto — Gringo

## Decisões fechadas
| Tema | Decisão |
|---|---|
| Baralho e jogadores | 54 cartas, 2 a 10 jogadores |
| Grelha | 4 cartas por jogador, só se conhecem 2; posições sempre fixas |
| Valores | Cada carta vale o seu valor (Ás 1, 2 vale 2…); joker 0; Rei vermelho −3 (configurável −1) |
| Poderes | Configuráveis. Por omissão: 10 espreita de outro; Valete troca (ambas à escolha); Dama espreita a tua; Rei espreita de outro e decide trocar. Alternativa: o mesmo do 7 ao 10 |
| Tirar | Só do baralho |
| Bater | Uma só batida por carta descartada; se errar fica com a carta e leva mais uma do baralho |
| Gringo | Opcional; só na própria vez e antes de jogar; mínimo de 5 voltas (configurável); quem chama joga e depois cada um joga mais uma vez |
| Sem cartas | Não joga, mas pode dizer Gringo se a opção estiver ligada |
| Quem chama e perde | Sem penalização extra; simplesmente perde |
| Pontuação | Partida única, sem limite nem acumulado; ganha o menor |
| Fim | Quando o baralho acaba; ou (opção) depois da volta a seguir ao Gringo |

## Por fechar (proposta por omissão — "ok" aceita todas)
| # | Questão | Proposta |
|---|---|---|
| 1 | Quanto valem **Valete, Dama e Rei preto**? | 11 · 12 · 13 |
| 2 | **Espreitar inicial:** que 2 cartas e por quanto tempo? Depois ficam escondidas (é preciso memorizar)? | As 2 de baixo, 10 s, depois escondidas |
| 3 | O **poder** só funciona quando a carta tirada é descartada diretamente (e não quando sai da grelha por troca ou por batida)? | Sim, só diretamente |
| 4 | **Bater:** só com cartas da própria grelha? O jogador que acabou de descartar também pode bater? Janela de quanto tempo? | Só da própria grelha; qualquer jogador pode; 3 s, e o seguinte espera |
| 5 | A **carta de penalização** fica virada para baixo sem o jogador a ver? | Sim, sem a ver |
| 6 | "Mesma carta" para bater = **mesmo valor**, independentemente do naipe (Rei vermelho bate Rei preto, joker bate joker)? | Sim, mesmo valor |
| 7 | **Fim por baralho:** termina logo que o baralho fica vazio no fim de uma vez, ou acaba-se a volta para todos jogarem o mesmo nº de vezes? E por omissão a opção Gringo está desligada? | Termina logo; Gringo desligado por omissão (opção da sala) |
| 8 | "Mínimo de 5 jogadas" para dizer Gringo = **cada jogador jogou 5 vezes** (5 voltas)? | Sim, 5 voltas |
| 9 | **Quem começa** | Aleatório; nas partidas seguintes roda para o jogador seguinte |
| 10 | **Empate** na menor pontuação | Vitória partilhada |
| 11 | **Muitos jogadores:** com 10 jogadores saem 40 cartas logo na distribuição e o baralho fica com 14 (pouco mais de uma volta). Usar 2 baralhos? | Opção `decks`; por omissão 1 até 6 jogadores e 2 a partir de 7 |
| 12 | **Temporizadores** | Espreitar inicial 10 s · vez 30 s · poder 15 s · janela de bater 3 s, todos configuráveis |


---

