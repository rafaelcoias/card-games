# PROMPT — Adicionar o jogo "Pepe Rápido" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e fila única de ações por sala.

## Objetivo
Adicionar o **Pepe Rápido** como módulo em `packages/games/pepe-rapido`: jogo de velocidade para 2 jogadores, sem vezes, com a sensação de rapidez de um jogo físico.

## Documentos
- `02-REGRAS-PEPE.md` — regras (fonte de verdade)
- `03-CONTRATO-PEPE.md` — estado, ações, validação, rondas, vistas, eventos
- `04-NUCLEO.md` — dependências e UI otimista
- `05-GUIAO-DE-CENARIOS.md` — cenários de aceitação com estado injetado
- `06-UI-PEPE.md` — especificação visual e de interação
- `07-TESTES-PEPE.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 2 jogadores, 54 cartas (com jokers), 27 para cada.
- Cada jogador monta 5 colunas (1, 2, 3, 4 e 5 cartas); só se vê a carta de cima de cada coluna. O resto forma a sua reserva.
- Os dois viram uma carta da reserva para o centro, criando dois montes. A partir daí, **ao mesmo tempo**, cada um põe cartas das suas colunas nos montes centrais: uma acima ou uma abaixo da carta do topo.
- O joker vale qualquer carta. Cartas iguais podem agrupar-se nas colunas.
- Quando ninguém consegue jogar, os dois viram nova carta da reserva.
- Quem esvazia as colunas toca no monte central que quer levar (sem saber quantas cartas tem); o outro leva o outro monte. Cada um baralha o que tem e começa nova ronda.
- Ganha o primeiro a ficar sem cartas.

## Requisitos não negociáveis
1. **Tempo real, sem vezes.** Qualquer jogador age a qualquer momento; o servidor processa as ações da sala em fila única e valida cada uma contra o estado atual. Se dois jogarem para o mesmo monte ao mesmo tempo, vale a primeira; a segunda é rejeitada.
2. **UI otimista** (04): a carta move-se no toque; se o servidor rejeitar, volta para trás com uma animação curta. Nunca esperar pelo servidor para começar a animação.
3. **Informação oculta.** Cartas tapadas nas colunas, reservas e **o número de cartas de cada monte central** nunca saem do servidor (a escolha do monte é às cegas).
4. **Latência fora de âmbito** nesta versão, mas o código deve isolar a decisão "quem chegou primeiro" numa única função, para poder ser substituída mais tarde.
5. **Reutilização visual** do baralho (com jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.


---

# Regras do Pepe Rápido — Especificação (v1.1)

> As regras abaixo descrevem a configuração **por omissão**. Tudo o que está marcado com ⚙️ pode ser mudado na sala (ver §9).

## 1. Objetivo
Ser o primeiro a ficar **sem cartas nenhumas** (colunas e reserva).

## 2. Material e jogadores
- **2 jogadores.**
- ⚙️ **54 cartas** (52 + 2 jokers) → **27 para cada**. Sem jokers: **52 cartas → 26 para cada** (reserva de 11).

## 3. Preparação de uma ronda
Cada jogador baralha as suas cartas e monta, à sua frente:

**5 colunas** com 1, 2, 3, 4 e 5 cartas (15 no total). Só a carta de cima de cada coluna está virada para cima; as outras ficam viradas para baixo.

```
 [1]   [2]   [3]   [4]   [5]
  ▲     ▲     ▲     ▲     ▲      ← carta de cima, visível
        ▫     ▫     ▫     ▫      ← cartas tapadas
              ▫     ▫     ▫
                    ▫     ▫
                          ▫
```

O que sobra fica na **reserva**, virada para baixo (com 27 cartas: 12 na reserva).

Se um jogador tiver **menos de 15 cartas**, preenche as colunas pela ordem (1, 2, 3…) com o que tem e **fica sem reserva** (09 #4).

## 4. Começar
- Contagem decrescente 3-2-1 e os dois jogadores **viram a carta de cima da sua reserva** para o centro, ao mesmo tempo. Ficam **dois montes centrais**, um de cada lado.
- A partir daqui **não há vezes**: cada um joga o mais depressa que conseguir.

## 5. Jogar
### 5.1 Para os montes centrais
- Pega-se na carta de cima de uma coluna e põe-se em **qualquer um dos dois montes** se for:
  - ⚙️ **acima e abaixo** (por omissão): uma acima ou uma abaixo da carta do topo (sobre um 7 pode ir um 6 ou um 8);
  - ⚙️ **só acima**: exatamente uma acima (sobre um 7 só um 8).
- Naipes não contam.
- Ordem: A, 2, 3, …, 10, J, Q, K. ⚙️ O **Ás e o Rei ligam-se** (sobre um K pode ir um A; e, no modo acima e abaixo, sobre um A pode ir um K).
- Quando uma carta sai, a carta de baixo dessa coluna **vira para cima**.

### 5.2 Joker ⚙️ (só quando o baralho tem jokers)
- O joker vale **qualquer carta**: pode ir para qualquer monte central, por cima de qualquer carta.
- Depois de um joker no centro, a carta seguinte nesse monte pode ser **qualquer uma**.

### 5.3 Agrupar nas colunas
- A carta de cima de uma coluna pode ir para cima de outra coluna **com uma carta do mesmo valor** (ex.: um 9 sobre um 9). Assim liberta-se a carta de baixo.
- ⚙️ Agrupar pode ser desligado.
- O **joker agrupa com tudo**: pode ir para cima de qualquer coluna, e qualquer carta pode ir para cima de um joker numa coluna.

### 5.4 Coluna vazia
- ⚙️ Quando uma coluna fica vazia, o jogador pode pôr lá a carta de cima de outra coluna.

### 5.5 Corrida
- Se os dois jogadores puserem carta no mesmo monte ao mesmo tempo, **vale a que chega primeiro** ao servidor. A outra volta para a coluna.

## 6. Ninguém consegue jogar
- Quando nenhum dos dois tem jogada possível, os dois carregam em **"Virar"** e cada um vira a carta de cima da sua reserva para o seu monte central (3-2-1 como no início).
- Se um jogador não tiver reserva, vira só o outro (para o monte do lado de quem tem reserva, ou para os dois montes alternadamente — 09 #6).
- Se nenhum dos dois tiver reserva e ninguém conseguir jogar: ver 09 #7.

## 7. Fim de ronda
- Quando um jogador **esvazia as 5 colunas**, a ronda acaba logo.
- Esse jogador **toca num dos dois montes centrais** para ficar com ele. ⚙️ Por omissão **não sabe quantas cartas tem cada monte** e escolhe o que acha que tem menos. Com a opção "mostrar contagens" ligada, vê o número de cada monte (a escolha deixa de ser às cegas).
- O outro jogador fica com o **outro monte**.
- Cada jogador junta **o monte que levou + a sua reserva + (o outro) as cartas que ainda tinha nas colunas**, baralha, e monta a ronda seguinte (§3).

## 8. Fim do jogo
- Ganha o primeiro a ficar **sem cartas nenhumas**.
- Isso acontece quando um jogador, numa ronda **sem reserva** (já só com as colunas), esvazia as colunas: não há monte para levar e ganha (09 #4).

## 9. Opções configuráveis da sala ⚙️
Definidas por quem cria a sala, visíveis a ambos antes de começar e fixas durante a partida.

### Regras
| Opção | Valores | Por omissão |
|---|---|---|
| `direction` — sentido das jogadas | **Acima e abaixo** / Só acima | Acima e abaixo |
| `jokers` — baralho com jokers | **Sim (54)** / Não (52) | Sim |
| `aceKingWrap` — Ás e Rei ligam-se | **Sim** / Não | Sim |
| `grouping` — agrupar cartas iguais nas colunas | **Sim** / Não | Sim |
| `moveToEmpty` — mover para coluna vazia | **Sim** / Não | Sim |

### Informação visível
| Opção | Valores | Por omissão |
|---|---|---|
| `showCentreCounts` — mostrar nº de cartas de cada monte central | Sim / **Não** | Não (escolha às cegas) |
| `showOwnReserveCount` — ver quantas cartas tens na reserva | **Sim** / Não | Sim |
| `showOpponentCounts` — ver quantas cartas o adversário tem (colunas + reserva) | Sim / **Não** | Não (só se vê se tem reserva) |

### Ritmo
| Opção | Valores | Por omissão |
|---|---|---|
| `countdownMs` — contagem antes de virar | 1–5 s | 3 s |
| `autoFlip` — virar sozinho quando ninguém consegue jogar | Sim / **Não** | Não (os dois carregam em "Virar") |
| `autoFlipDelayMs` — espera antes do virar automático | 1–5 s | 2 s |

### Partida
| Opção | Valores | Por omissão |
|---|---|---|
| `rematch` — botão de revanche no fim | **Sim** / Não | Sim |

### Predefinições rápidas
Para não obrigar a mexer em tudo, a sala oferece três predefinições que preenchem as opções acima (e podem ser afinadas depois):

| Predefinição | Configuração |
|---|---|
| **Clássico** (por omissão) | acima e abaixo · com jokers · Ás↔Rei · agrupar · contagens escondidas |
| **Puro** | acima e abaixo · sem jokers · Ás↔Rei · agrupar · contagens escondidas |
| **Iniciante** | só acima · com jokers · Ás↔Rei · agrupar · mostrar contagens · virar automático |


---

# Contrato Técnico — Pepe Rápido

## 1. Configuração
```ts
const PepeConfigSchema = z.object({
  preset: z.enum(["CLASSICO", "PURO", "INICIANTE", "PERSONALIZADO"]).default("CLASSICO"),
  // regras
  direction: z.enum(["UP_DOWN", "UP_ONLY"]).default("UP_DOWN"),
  jokers: z.boolean().default(true),
  aceKingWrap: z.boolean().default(true),
  grouping: z.boolean().default(true),
  moveToEmpty: z.boolean().default(true),
  // informação visível
  showCentreCounts: z.boolean().default(false),
  showOwnReserveCount: z.boolean().default(true),
  showOpponentCounts: z.boolean().default(false),
  // ritmo
  countdownMs: z.number().int().min(1_000).max(5_000).default(3_000),
  autoFlip: z.boolean().default(false),
  autoFlipDelayMs: z.number().int().min(1_000).max(5_000).default(2_000),
  // partida
  rematch: z.boolean().default(true),
});

const PRESETS = {
  CLASSICO:  { direction: "UP_DOWN", jokers: true,  aceKingWrap: true, grouping: true, showCentreCounts: false, autoFlip: false },
  PURO:      { direction: "UP_DOWN", jokers: false, aceKingWrap: true, grouping: true, showCentreCounts: false, autoFlip: false },
  INICIANTE: { direction: "UP_ONLY", jokers: true,  aceKingWrap: true, grouping: true, showCentreCounts: true,  autoFlip: true  },
} as const;
// Mudar qualquer opção depois de escolher uma predefinição passa preset para "PERSONALIZADO".
// A configuração fica congelada no setup: o motor nunca lê opções da sala a meio da partida.
```
- `minPlayers: 2`, `maxPlayers: 2`, `lifecycle: "MATCH"` (uma partida = várias rondas).
- Baralho: `createShoe({ decks: 1, jokers: config.jokers })` → 54 ou 52 cartas; cada jogador recebe metade (27 ou 26).

## 2. Estado
```ts
type Phase = "COUNTDOWN" | "PLAYING" | "STALLED" | "CHOOSING_PILE" | "ROUND_SETUP" | "FINISHED";

interface PlayerArea {
  columns: CardInstance[][];          // 5 colunas; o último elemento é a carta de cima (visível)
  reserve: CardInstance[];
  wantsFlip: boolean;
}

interface PepeState {
  phase: Phase;
  config: PepeConfig;
  players: [PlayerId, PlayerId];
  areas: Record<PlayerId, PlayerArea>;
  centre: [CardInstance[], CardInstance[]];   // monte da esquerda e da direita; topo = último
  round: number;
  roundWinner: PlayerId | null;               // quem esvaziou as colunas
  winner: PlayerId | null;
  stateVersion: number;
  seed: string;
}
```

## 3. Ações
```ts
type PepeAction =
  | { type: "PLAY_TO_CENTRE"; column: number; pile: 0 | 1; expectedTopUid: string }
  | { type: "GROUP"; fromColumn: number; toColumn: number }
  | { type: "MOVE_TO_EMPTY"; fromColumn: number; toColumn: number }
  | { type: "REQUEST_FLIP" }
  | { type: "CHOOSE_PILE"; pile: 0 | 1 }       // só quem esvaziou as colunas
  | { type: "SYS_COUNTDOWN_DONE" }
  | { type: "SYS_ROUND_SETUP_DONE" }
  | { type: "SYS_AUTO_FLIP"; stateVersion: number };
```
- `expectedTopUid`: o cliente diz em que carta do topo estava a jogar. Se o topo já mudou (o outro foi mais rápido), a jogada é **rejeitada** mesmo que ainda fosse válida, para não haver surpresas ("joguei num 7 e afinal era um 9").

## 4. Validação
```ts
const VAL = { A: 1, J: 11, Q: 12, K: 13 } as any;
const v = (c: CardInstance) => VAL[c.rank] ?? Number(c.rank);

function fitsCentre(card, top, cfg): boolean {
  if (card.rank === "JOKER" || top.rank === "JOKER") return true;
  const up = v(card) === v(top) + 1 || (cfg.aceKingWrap && top.rank === "K" && card.rank === "A");
  if (cfg.direction === "UP_ONLY") return up;
  const down = v(card) === v(top) - 1 || (cfg.aceKingWrap && top.rank === "A" && card.rank === "K");
  return up || down;
}

function canGroup(card, target, cfg): boolean {
  if (!cfg.grouping) return false;
  return card.rank === "JOKER" || target.rank === "JOKER" || card.rank === target.rank;
}
// MOVE_TO_EMPTY só é válido com cfg.moveToEmpty.
```

## 5. Fluxo
```ts
// PLAY_TO_CENTRE: valida fase PLAYING, coluna com carta, topo === expectedTopUid, fitsCentre.
//   move a carta; a nova carta de cima da coluna fica visível; limpa wantsFlip dos dois.
//   se as 5 colunas do jogador ficaram vazias → fim de ronda (§6).
// GROUP / MOVE_TO_EMPTY: só nas próprias colunas; não mexem no centro.
// REQUEST_FLIP: marca wantsFlip; quando os dois querem (ou quem tem reserva, se o outro não tiver) → COUNTDOWN → vira.
// autoFlip: ao entrar em STALLED, o motor agenda SYS_AUTO_FLIP após autoFlipDelayMs (cancelado se alguém jogar entretanto).
// Deteção de bloqueio: depois de cada ação, se nenhum jogador tem jogada para o centro → phase STALLED
//   (a UI realça o botão "Virar"); agrupar/mover continua permitido.
```

## 6. Fim de ronda e preparação
```ts
function endRound(s, finisher) {
  if (s.areas[finisher].reserve.length === 0 && singleCentreMode(s)) return finishGame(s, finisher);  // §8 das regras
  s.roundWinner = finisher; s.phase = "CHOOSING_PILE";
}
function choosePile(s, p, pile) {
  const other = otherPlayer(s, p);
  const mine = s.centre[pile], theirs = s.centre[1 - pile];
  s.areas[p].pool = [...mine, ...s.areas[p].reserve];
  s.areas[other].pool = [...theirs, ...s.areas[other].reserve, ...flatten(s.areas[other].columns)];
  // baralhar cada pool com a seed (ronda) e montar colunas 1–5 + reserva (§3 das regras)
  s.round++; s.phase = "ROUND_SETUP";
}
```

## 7. Vista por jogador
```ts
interface PepePlayerView {
  phase: Phase; round: number;
  config: PepeConfig;                                                     // visível a ambos
  me: { columns: { top: CardInstance | null; hiddenCount: number }[]; reserveCount: number | null; wantsFlip: boolean };
  opponent: { columns: { top: CardInstance | null; hiddenCount: number }[]; hasReserve: boolean;
              totalCount: number | null; wantsFlip: boolean };
  centre: [{ top: CardInstance | null; count: number | null }, { top: CardInstance | null; count: number | null }];
  canChoosePile: boolean;
  stalled: boolean;
  countdownEndsAt: number | null;
  winner: PlayerId | null;
}
```
- Os campos de contagem só são preenchidos quando a opção correspondente está ligada; caso contrário vão a `null` **no servidor** (nunca escondidos só na UI):
  - `centre[i].count` ← `showCentreCounts`
  - `me.reserveCount` ← `showOwnReserveCount`
  - `opponent.totalCount` ← `showOpponentCounts`
- Os eventos seguem a mesma regra: nenhum evento revela contagens que a vista esconde.

## 8. Eventos de domínio
| Evento | Payload |
|---|---|
| `Played` | `{ playerId, column, pile, card, revealed: CardInstance \| null }` |
| `Rejected` | `{ playerId, action, reason: "TOP_CHANGED" \| "INVALID" }` (só para o próprio) |
| `Grouped` / `MovedToEmpty` | `{ playerId, from, to, card, revealed }` |
| `Stalled` | — |
| `Flipped` | `{ cards: [CardInstance \| null, CardInstance \| null] }` |
| `ColumnsEmptied` | `{ playerId }` |
| `PileChosen` | `{ playerId, pile }` |
| `RoundSetUp` | `{ round }` |
| `GameWon` | `{ playerId }` |

## 9. Resultado
- `WINNER` / `LOSER`; `score` = nº de rondas jogadas.


---

# Núcleo — Dependências e UI otimista

## Dependências (sem alterações novas)
| Necessidade | Vem de |
|---|---|
| Ações dos dois jogadores a qualquer momento | fases simultâneas — kit Blackjack `04` §2 |
| "Quem chegou primeiro" | fila única por sala — kit Desconfia `04` |
| Contagem 3-2-1, preparação de ronda | ações de sistema agendadas — kit Fodinha |
| Baralho de 54 | `createShoe` — kit Blackjack `04` §1 |

## UI otimista (obrigatória neste jogo)
Num jogo de velocidade, esperar pela resposta do servidor (50–150 ms) mata a sensação de rapidez.
1. No toque/arrasto, a carta move-se **logo** para o destino.
2. O cliente envia a ação com `expectedTopUid` e um `clientActionId`.
3. Servidor aceita → nada a fazer (a vista seguinte confirma).
4. Servidor rejeita → a carta volta à coluna com uma animação curta (180 ms) e um tremor ligeiro.
5. As atualizações do adversário chegam como eventos e animam normalmente.

Isto vive no componente de mesa do jogo; não exige mudanças no núcleo, mas deve ficar como utilitário reutilizável (`useOptimisticAction`) para futuros jogos rápidos.

## Latência (fora de âmbito, preparado para depois)
- A decisão "quem chegou primeiro" fica numa única função do servidor (`resolveRace`), hoje "ordem de chegada".
- Mais tarde pode passar a usar marcas de tempo do cliente com tolerância, sem tocar no motor.


---

# Guião de Cenários — Estado injetado

Num jogo em tempo real, um guião linear "vez a vez" não faz sentido. Estes cenários injetam um estado concreto e aplicam ações por ordem de chegada ao servidor. Todos têm de passar como testes automáticos.

Notação: colunas da Ana `A1…A5`, do Bruno `B1…B5`; montes centrais `E` (esquerda) e `D` (direita). Só se indica a carta de cima e, quando importa, a de baixo.

## C1 — Jogada simples e carta revelada
- E = 7♠, D = J♦. Ana A3 = 8♥ (por baixo: 2♣).
- Ana: `PLAY_TO_CENTRE A3 → E` → E = 8♥; A3 mostra 2♣.

## C2 — Ás e Rei ligados
- E = K♣. Ana A1 = A♦ → válido (`aceKingWrap`). Com `aceKingWrap = false` → rejeitado.

## C3 — Joker
- D = 5♥. Bruno B2 = JOKER → `PLAY_TO_CENTRE B2 → D` válido.
- D = JOKER. Ana A4 = Q♠ → válido (depois de um joker vale qualquer carta).

## C4 — Agrupar
- Ana A2 = 9♣ (por baixo 4♦), A5 = 9♥. `GROUP A2 → A5` → A5 = 9♣ sobre 9♥; A2 mostra 4♦.
- Ana A1 = JOKER, A3 = 6♠ → `GROUP A1 → A3` válido; `GROUP A3 → A1` também válido.

## C5 — Coluna vazia
- Ana A1 vazia, A4 = 10♦ (por baixo 3♥). `MOVE_TO_EMPTY A4 → A1` → A1 = 10♦; A4 mostra 3♥.

## C6 — Corrida ao mesmo monte
- E = 6♦. Ana tem A2 = 7♣; Bruno tem B3 = 5♠. Os dois enviam com `expectedTopUid = 6♦`.
- Chega primeiro a Ana → E = 7♣. A ação do Bruno chega com `expectedTopUid = 6♦` mas o topo é 7♣ → **rejeitada** (`TOP_CHANGED`), apesar de o 5♠ não servir de qualquer forma. A carta do Bruno volta à coluna.

## C7 — Bloqueio e virar
- Nenhum dos dois tem jogada para E nem D → `Stalled`.
- Ana `REQUEST_FLIP`; Bruno `REQUEST_FLIP` → contagem 3 s → cada um vira a carta de cima da sua reserva para o seu lado.

## C8 — Fim de ronda às cegas
- Ana esvazia as 5 colunas. Ana tem 4 cartas na reserva. O Bruno tem 6 cartas nas colunas e 3 na reserva.
- Montes: E tem 9 cartas, D tem 32 cartas (a Ana não sabe).
- Ana `CHOOSE_PILE E` → Ana fica com 9 + 4 = **13** cartas; Bruno fica com 32 + 3 + 6 = **41**.
- Ronda 2: a Ana tem menos de 15 → colunas 1, 2, 3, 4 e 3 cartas, **sem reserva**. O Bruno: colunas de 15 + reserva de 26.
- Conservação: 13 + 41 = 54 ✓

## C9 — Ronda com um só jogador com reserva
- Só o Bruno tem reserva → no início e em cada "Virar" só ele vira (09 #6).

## C10 — Vitória
- Ronda em que a Ana não tem reserva. A Ana esvazia as colunas → **ganha** (não há monte para levar).

## C11 — Informação oculta (configuração por omissão)
- Em todos os cenários, nenhuma vista e nenhum evento contém o número de cartas de E ou D, nem cartas tapadas.

## C12 — Só acima (`direction = UP_ONLY`)
- E = 7♠. Ana A2 = 8♦ → válido. Ana A3 = 6♣ → rejeitado.
- E = K♣, `aceKingWrap` → Ás válido. E = A♥ → Rei rejeitado (no modo só acima, o Rei não vai sobre o Ás).

## C13 — Sem jokers (`jokers = false`)
- Baralho de 52, 26 por jogador (colunas 15 + reserva 11). Nenhum joker em lado nenhum.

## C14 — Contagens visíveis
- `showCentreCounts = true`: no C8 a Ana vê E = 9 e D = 32 antes de escolher.
- `showOpponentCounts = true`: a Ana vê o total de cartas do Bruno; com `false`, só sabe se ele tem reserva.
- `showOwnReserveCount = false`: a vista da Ana tem `reserveCount = null`.

## C15 — Agrupar e mover desligados
- `grouping = false`: o `GROUP` do C4 é rejeitado.
- `moveToEmpty = false`: o `MOVE_TO_EMPTY` do C5 é rejeitado.

## C16 — Virar automático (`autoFlip = true`)
- Bloqueio → 2 s depois os dois viram sozinhos, sem carregar em "Virar".
- Bloqueio, mas a Ana agrupa uma carta e passa a ter jogada antes dos 2 s → o virar automático é cancelado.


---

# UI do Pepe Rápido

Reutiliza o baralho clássico (com jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo. Prioridade absoluta: **resposta imediata ao toque**.

## 1. Mesa
- Feltro azul (`#1E3A5F`).
- **Tu em baixo, o adversário em cima**, cada um com as suas 5 colunas em leque vertical (as tapadas aparecem como bordas empilhadas, só para dar noção de quantas faltam).
- Ao centro, os **dois montes centrais**, lado a lado. Com as contagens escondidas (por omissão), os montes têm todos **a mesma espessura visual**. Com `showCentreCounts`, a espessura acompanha o número real e aparece um contador discreto por baixo de cada monte.
- Num canto, um selo pequeno com as regras ativas da partida (ex.: *"↑↓ · com jokers"* ou *"só ↑ · sem jokers"*), para ninguém se esquecer em que modo está.
- Reserva de cada jogador ao lado das colunas, virada para baixo. A espessura real só aparece quando a opção correspondente está ligada (`showOwnReserveCount` para a tua, `showOpponentCounts` para a do adversário).

## 2. Jogar
- **Arrastar** uma carta de cima de uma coluna para um monte central, ou **tocar** na carta e depois no monte.
- Atalho rápido: **duplo toque** numa carta envia-a para o único monte onde serve (se servir nos dois, vai para o mais próximo).
- Os montes onde a carta selecionada serve ganham um contorno discreto durante o arrasto.
- Rejeitada (o adversário foi mais rápido): volta para a coluna em 180 ms com um tremor curto. Sem mensagens.

## 3. Agrupar e mover
- Arrastar a carta de uma coluna para outra coluna da mesma figura (ou com joker) agrupa.
- Arrastar para uma coluna vazia move.
- A carta revelada por baixo vira com um flip de 200 ms.

## 4. Virar
- Botão grande **"Virar"** no centro, sempre visível.
- Quando o servidor deteta bloqueio, o botão pulsa.
- Com `autoFlip`, o botão mostra um anel de 2 s e vira sozinho; ainda se pode carregar para acelerar.
- Quem já carregou vê *"À espera do Bruno"*; o adversário vê um indicador no botão.
- Contagem 3-2-1 sobre os montes e as cartas viram ao mesmo tempo.

## 5. Fim de ronda
- Quem esvaziou as colunas: os dois montes ampliam-se ligeiramente com a legenda *"Escolhe o monte que queres levar"*. Tocar num leva-o (animação das cartas para o teu lado); o outro vai para o adversário.
- O adversário vê *"A Ana está a escolher…"*.
- Animação de baralhar e montagem das colunas (stagger 40 ms por carta).

## 6. Informação ao jogador
- Contador de rondas no topo ("Ronda 3").
- Contagens só onde a configuração as permite (montes centrais, a tua reserva, o total do adversário). O que está desligado não aparece em lado nenhum.

## 6.1 Criar sala — configuração
- Três cartões de predefinição grandes: **Clássico**, **Puro**, **Iniciante**, cada um com uma linha a dizer o que muda.
- Por baixo, "Personalizar" abre as opções agrupadas (Regras · Informação visível · Ritmo), com interruptores e uma frase curta de ajuda em cada.
- Mudar uma opção marca a predefinição como "Personalizado".
- Na sala de espera, o adversário vê o resumo das regras antes de dizer "Pronto".

## 7. Som (opcional)
- Carta no monte (curto, seco), rejeição (muito discreto), virar, escolher monte, vitória.

## 8. Telemóvel
- Ecrã em paisagem recomendado; em retrato, as colunas do adversário ficam compactas no topo.
- Alvos de toque com pelo menos 48 px; o duplo toque é o modo principal no telemóvel.

## 9. Desempenho
- Resposta visual ao toque em menos de 16 ms (antes de qualquer resposta do servidor).
- 60 fps garantidos durante trocas rápidas; animar só `transform` e `opacity`.


---

# Testes Obrigatórios — Pepe Rápido

Cobertura ≥ 90% no motor. Motor puro com estado injetado.

## 1. Preparação
- 54 cartas, 27 para cada; colunas 1–5 com só a carta de cima visível; reserva com o resto.
- Menos de 15 cartas: colunas preenchidas pela ordem, sem reserva.

## 2. Jogadas para o centro
- ±1 válido; diferença 0 ou ≥ 2 inválida; A↔K conforme `aceKingWrap`.
- Joker sobre qualquer carta; qualquer carta sobre joker.
- `expectedTopUid` diferente do topo atual → rejeitado (`TOP_CHANGED`).
- Coluna vazia → inválido.
- Jogar fora da fase PLAYING (contagem, escolha de monte) → inválido.

## 3. Agrupar e mover
- Mesma figura → válido; diferente → inválido; joker nos dois sentidos → válido.
- Mover para coluna vazia → válido; para coluna com carta → inválido (só agrupar).
- Só nas próprias colunas.

## 4. Corrida
- Duas jogadas para o mesmo monte com o mesmo `expectedTopUid` → só a primeira processada é aceite.
- Jogadas para montes diferentes ao mesmo tempo → ambas aceites.

## 5. Bloqueio e virar
- Deteção correta de "ninguém pode jogar para o centro".
- Virar só quando os dois pedem (ou quem tem reserva, se o outro não tiver).
- Reserva vazia de um lado (09 #6) e dos dois lados (09 #7).

## 6. Fim de ronda
- Esvaziar as 5 colunas termina a ronda logo; ações seguintes do adversário rejeitadas.
- Escolha do monte só por quem esvaziou.
- Redistribuição: conservação de 54 cartas; cada jogador recebe exatamente o que o 02 §7 diz.

## 7. Vitória
- Ronda sem reserva + colunas vazias → vitória.

## 8. Informação oculta
- Nenhuma vista/evento contém contagens dos montes centrais, cartas tapadas ou cartas da reserva.

## 9. Guião
- Cenários C1–C16 do `05` como testes.

## 9.1 Configuração
- Schema Zod: valores por omissão, limites, predefinições preenchem as opções certas, mudar uma opção → `PERSONALIZADO`.
- Configuração congelada: alterar a sala a meio da partida não muda o comportamento do motor.
- `direction` × `aceKingWrap`: matriz completa para A, 2, Q, K sobre A, 2, Q, K.
- `jokers = false`: 52 cartas, 26 por jogador; nenhuma vista contém jokers.
- Cada opção de visibilidade: o campo vai a `null` no servidor quando desligada (teste sobre o JSON serializado, não sobre a UI).
- `autoFlip`: agendamento, cancelamento por jogada e por agrupar.

## 10. Simulação
- 10 000 partidas **por predefinição** (Clássico, Puro, Iniciante) + 10 000 com configurações aleatórias, com 2 bots (um rápido e um lento, ações intercaladas aleatoriamente).
- Invariantes: 54 ou 52 cartas sempre (conforme `jokers`); nenhuma carta duplicada; cada coluna tem a carta de cima visível ou está vazia.
- Termina sempre (registar média de rondas; limite de segurança de 200 rondas).


---

# Plano de Fases — Pepe Rápido

## Fase 1 — Motor
- `packages/games/pepe-rapido`: config, montagem de colunas, validação, corrida com `expectedTopUid`, bloqueio, virar, fim de ronda, redistribuição, vitória, vistas.
- Todos os testes do 07, incluindo cenários e simulação.
- **Feito quando:** cobertura ≥ 90%, cenários C1–C11 a verde, 10 000 partidas sem violar invariantes.

## Fase 2 — UI
- Componentes do 06 com UI otimista (`useOptimisticAction`).
- Página `/dev/pepe` com estados fixos (início, jogada rejeitada, agrupar, bloqueio, escolher monte, ronda curta sem reserva, vitória).
- **Feito quando:** resposta ao toque < 16 ms, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida via sockets com 2 contas (Playwright), com corridas ao mesmo monte.
- **Feito quando:** 2 pessoas em redes diferentes jogam uma partida completa sem dessincronizações.


---

# Pontos em Aberto — Pepe Rápido

## Decisões fechadas
| Tema | Decisão |
|---|---|
| Jogadores | 2, em simultâneo, sem vezes |
| Baralho | 54 (com jokers), 27 para cada |
| Colunas | 5 colunas com 1, 2, 3, 4 e 5 cartas; só se vê a de cima |
| Jogada | Uma acima ou uma abaixo da carta de cima de qualquer um dos dois montes |
| Joker | Vale qualquer carta; também agrupa com qualquer carta |
| Agrupar | Cartas iguais podem juntar-se nas colunas |
| Fim de ronda | Quem esvazia as colunas toca no monte que quer, sem saber quantas cartas tem; o outro leva o outro monte; baralha-se e recomeça |
| Vitória | O primeiro a ficar sem cartas |
| Latência | Fora de âmbito; vale a primeira ação a chegar |
| Configuração | Opções de sala para o sentido (acima e abaixo / só acima), jokers, Ás↔Rei, agrupar, mover para coluna vazia, contagens visíveis (montes, reserva própria, adversário), virar automático; três predefinições (Clássico, Puro, Iniciante) |

## Por fechar (proposta por omissão — "ok" aceita todas)
| # | Questão | Proposta |
|---|---|---|
| 1 | **Ás e Rei ligam-se** por omissão? | Sim (opção `aceKingWrap`) |
| 2 | Depois de um **joker no monte central**, a carta seguinte pode ser qualquer uma? | Sim |
| 3 | Nas colunas, **qualquer carta pode ir para cima de um joker** (e o joker para cima de qualquer carta)? | Sim, nos dois sentidos |
| 10 | **"Só acima"** quer dizer exatamente uma acima (sobre um 7 só um 8)? | Sim |
| 11 | As **predefinições** (Clássico, Puro, Iniciante) fazem sentido, ou preferes outros nomes/combinações? | As três propostas |
| 12 | Há mais alguma regra da tua mesa que deva ser opção (ex.: número de colunas, cartas por coluna)? | Não; colunas fixas 1–5 |
| 4 | Com **menos de 15 cartas**, preenche-se as colunas pela ordem e fica-se sem reserva; e quem não tem reserva e esvazia as colunas **ganha**? | Sim |
| 5 | Pode **mover-se uma carta para uma coluna vazia**? | Sim |
| 6 | Quando **só um tem reserva**, para onde vira? | Para o monte do lado dele (o outro monte fica parado até haver carta) |
| 7 | **Ninguém tem reserva e ninguém consegue jogar:** o que acontece? | Cada um leva o monte central do seu lado para baixo das colunas como reserva nova (baralhada) e vira-se de novo |
| 8 | Valores por omissão da visibilidade: vês a tua reserva, do adversário só sabes se tem reserva, montes centrais escondidos? | Sim (tudo configurável na sala) |
| 9 | **Revanche**: botão no fim para jogar logo outra partida? | Sim |


---

