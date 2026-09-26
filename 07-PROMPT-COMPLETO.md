# PROMPT — Plataforma de Jogos de Cartas Online Multijogador

## Papel
Atua como engenheiro de software sénior / tech lead, especialista em sistemas multijogador em tempo real, TypeScript, Next.js e NestJS. Tomas decisões de arquitetura justificadas, escreves código de produção (tipado, testado, sem atalhos) e avisas proativamente de riscos. Quando uma regra ou requisito for ambíguo, perguntas antes de assumir.

## Objetivo
Construir uma plataforma web onde utilizadores criam conta, fazem login, entram em salas e jogam jogos de cartas online com amigos, em tempo real.

O primeiro jogo é a **Mexicana** — regras completas no ficheiro `02-REGRAS-MEXICANA.md`.

A plataforma TEM de ser extensível: adicionar um novo jogo no futuro deve implicar apenas criar um novo módulo de jogo, sem mexer no núcleo (salas, sockets, autenticação, persistência).

## Documentos de apoio
- `02-REGRAS-MEXICANA.md` — especificação do jogo (ler na Fase 4)
- `03-CONTRATO-E-EVENTOS.md` — contrato `GameModule`, eventos Socket.IO, modelo de dados (ler na Fase 1)
- `04-PLANO-FASES.md` — fases e critérios de aceitação
- `05-PONTOS-EM-ABERTO.md` — registo de decisões de regras (fechado)
- `06-DESIGN-CARTAS-E-UI.md` — especificação visual das cartas, mesa e animações (ler na Fase 3)

## 1. Stack obrigatória
- **Monorepo:** pnpm workspaces + Turborepo
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS
- **Servidor de jogo:** NestJS + Socket.IO — processo Node persistente, **separado** do Next.js (o Next.js em serverless não aguenta websockets)
- **Base de dados:** PostgreSQL (Supabase) com Prisma
- **Autenticação:** Supabase Auth (email/password + magic link); o servidor de jogo valida o JWT no handshake do socket
- **Tempo real / escala horizontal:** Redis (adapter Socket.IO + estado das salas ativas)
- **Validação:** Zod em todas as mensagens cliente→servidor
- **Testes:** Vitest (motor de jogo e regras), Playwright (fluxo E2E)
- **Deploy:** Railway (web + server + Redis), Supabase (Postgres + Auth)

## 2. Estrutura do monorepo
```
apps/
  web/            → Next.js (UI, lobby, mesa de jogo)
  server/         → NestJS (gateway Socket.IO, salas, orquestração)
packages/
  shared/         → tipos, eventos, schemas Zod partilhados
  game-core/      → interfaces genéricas de jogo, baralho, RNG, utilitários
  games/
    mexicana/     → regras da Mexicana (motor puro, sem I/O)
  ui/             → componentes de cartas/mesa reutilizáveis
```

## 3. Princípios de arquitetura (não negociáveis)
1. **Servidor autoritativo.** O cliente só envia intenções ("jogar cartas X, Y"). Toda a validação e cálculo de estado acontece no servidor.
2. **Motor de jogo puro.** Cada jogo é uma função determinística `applyAction(state, action, playerId) → Result<State>`. Sem rede, BD ou relógio dentro do motor. 100% testável.
3. **Informação oculta.** O servidor nunca envia a mão de um jogador aos outros, nem cartas escondidas a ninguém. Cada jogador recebe uma vista filtrada (`getPlayerView`). O baralho comum nunca vai para o cliente.
4. **Baralhamento seguro.** Fisher-Yates com `crypto.randomInt`. Guardar a ordem inicial no servidor para auditoria e replay.
5. **Contrato de módulo de jogo.** Todos os jogos implementam a interface `GameModule` definida em `03-CONTRATO-E-EVENTOS.md` e registam-se num `GameRegistry`. O núcleo nunca importa um jogo diretamente.
6. **Eventos tipados** partilhados em `packages/shared`. Nada de strings soltas.
7. **Efeitos configuráveis.** Regras especiais de cartas vivem em tabelas de configuração, não em `if`s espalhados pelo motor.

## 4. Funcionalidades — MVP
### Contas
- Registo, login, logout, recuperar password
- Perfil: nome de utilizador único, avatar
- Rotas protegidas no Next.js (middleware)

### Lobby e salas
- Criar sala: escolher jogo, nº máximo de jogadores, pública ou privada
- Sala privada entra por código curto (6 caracteres) ou link partilhável
- Lista de salas públicas abertas
- Dentro da sala: lista de jogadores, estado "pronto", chat simples; o anfitrião inicia quando todos estão prontos
- Anfitrião pode expulsar jogadores; se sair, a função passa ao jogador seguinte

### Jogo em tempo real
- **Cartas com aspeto de baralho clássico** e experiência "clean e smooth" — segue `06-DESIGN-CARTAS-E-UI.md` à letra; isto não é opcional nem "polimento para o fim"
- Mesa com mão do jogador, cartas visíveis e escondidas de todos, pilha de descarte, contador do baralho comum, indicador de quem joga
- Seleção múltipla de cartas do mesmo valor para jogar de uma vez
- Só as ações válidas ficam ativas na UI (usar `getValidActions`)
- Temporizador de turno configurável; ao expirar aplica a ação por omissão definida pelo jogo
- Animações leves de distribuir, jogar, apanhar e queimar

### Resiliência
- **Reconexão:** se cair, o jogador tem X segundos (configurável) para voltar e recupera o estado exato
- Uma ligação ativa por jogador por sala (a nova substitui a antiga)
- Rate limiting por socket
- Estado das salas ativas em Redis (sobrevive a reinício de uma instância)

### Persistência
- Modelo de dados em `03-CONTRATO-E-EVENTOS.md`
- Log de ações por partida para replay e auditoria
- Histórico de partidas e resultados no perfil

## 5. Baralho (genérico)
- `game-core` fornece baralho francês configurável: 52 ou 54 cartas (com 2 jokers), valores 2–10, J, Q, K, A + JOKER
- Representação `{ suit, rank }` com id estável (`"AS"`, `"10H"`, `"JK1"`, `"JK2"`)
- Utilitários: criar, baralhar, distribuir, comparar por hierarquia configurável
- A Mexicana usa **54 cartas**

## 6. Qualidade e entrega
- TypeScript `strict`, ESLint + Prettier, sem `any`
- Cobertura ≥ 90% no motor da Mexicana
- **Testes de simulação:** milhares de partidas com bots aleatórios para garantir que o jogo termina sempre e nunca entra em estado inválido
- Logs estruturados (pino), tratamento de erros consistente
- `.env.example` completo, README com setup local via `docker compose` (Postgres + Redis)
- CI no GitHub Actions: lint, typecheck, testes

## 7. Método de trabalho
- Segue as fases de `04-PLANO-FASES.md` e **para no fim de cada uma** para validação.
- Antes de escrever código na Fase 0, apresenta: árvore de ficheiros, schema Prisma, lista de eventos Socket.IO e o contrato `GameModule` final. Espera aprovação.
- Não implementes o motor da Mexicana enquanto `05-PONTOS-EM-ABERTO.md` tiver pontos por fechar.
- Na Fase 3, entrega primeiro o baralho completo (54 cartas + verso) numa página de galeria para aprovação visual, antes de construir a mesa.


---

# Regras da Mexicana — Especificação para Implementação (v1.1 — fechada)

> Referência: a mecânica base é semelhante ao jogo conhecido como "Shithead" / "Palace". Usar só como referência de estrutura; estas regras prevalecem sempre.

## 1. Objetivo
Ficar sem cartas. Quem esvazia primeiro ganha; o jogo continua até restar um jogador, que perde.

## 2. Material
- Baralho de **54 cartas**: 52 + 2 jokers
- **2 a 6 jogadores** (6 × 9 = 54 → com 6 jogadores o baralho comum começa vazio)

## 3. Preparação
Cada jogador recebe **9 cartas** em três camadas:

| Camada | Qtd | Quem vê | Código |
|---|---|---|---|
| Escondidas (mesa, viradas para baixo) | 3 | **Ninguém**, nem o próprio | `faceDown` |
| Visíveis (mesa, por cima das escondidas) | 3 | **Todos** | `faceUp` |
| Mão | 3 | Só o próprio | `hand` |

**Fase de escolha:** o jogador recebe as 3 escondidas (sem as ver) + 6 cartas na mão e escolhe 3 para `faceUp`. O jogo só arranca quando todos confirmam (temporizador de 30 s; ao expirar, escolha automática das 3 mais altas).

As restantes formam o **baralho comum** (`drawPile`).

**Quem começa:** na primeira partida da sala, aleatório. Nas seguintes, **quem perdeu a anterior**.

## 4. Hierarquia
`2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A`
- Naipes não contam.
- **Joker** não tem posição na hierarquia; é só poder (igual ao 10).

## 5. Turno
1. Turnos pela ordem da lista de jogadores (sentido dos ponteiros do relógio).
2. O **primeiro jogador pode jogar qualquer carta**.
3. Da **mão**, podem jogar-se **1 ou mais cartas do mesmo valor** de uma vez (ex.: sobre um 4 → um 5, dois 5, três 5…). Jogar várias é sempre opcional — o jogador pode jogar uma de cada vez.
4. A jogada tem de ser **igual ou superior** ao **valor efetivo do topo** da pilha (ver 7.1). **Não é preciso ser sequencial** — pode saltar-se do 4 para o 9, ou do 2 para o Rei. Só conta ser ≥.
5. **2, 3, 10 e Joker podem ser jogados sobre qualquer carta**, mesmo sobre um Ás ou sob restrição do 7.
6. Depois de jogar, enquanto houver baralho comum, compra até ter **no mínimo 3 cartas na mão**.
7. Sem jogada válida → **apanha a pilha de descarte inteira para a mão** e **perde a vez** (joga o seguinte, com pilha vazia).

## 6. Ordem de esvaziamento das camadas
1. **Mão** — repõe até 3 enquanto houver baralho comum.
2. Baralho comum vazio e mão vazia → **visíveis** (`faceUp`), **uma de cada vez** (sem jogada múltipla).
3. Visíveis vazias → **escondidas** (`faceDown`), **uma de cada vez, às cegas**: escolhe a posição, a carta só é revelada ao ser jogada. Se for inválida, vai para a mão juntamente com a pilha e perde a vez.
- Quem apanha a pilha volta a ter mão e tem de a esvaziar antes de regressar às visíveis/escondidas.
- O servidor nunca envia o valor das `faceDown` a nenhum cliente antes da revelação.

## 7. Cartas de poder

| Carta | Poder | Efeito |
|---|---|---|
| **2** | Reset | Joga-se sobre qualquer carta. A pilha fica reiniciada: o seguinte pode jogar qualquer carta. |
| **3** | Vidro | Joga-se sobre qualquer carta. Assume o **valor e o poder** da carta efetiva abaixo: 3 sobre 8 conta como 8 e bloqueia o seguinte; 3 sobre 7 mantém a restrição "7 ou inferior"; 3 sobre 2 conta como reset. Sobre pilha vazia, não impõe restrição. |
| **4, 5, 6** | — | Cartas normais. |
| **7** | Limite | O jogador seguinte tem de jogar **7 ou inferior** (2–7) **ou 2/3/10/Joker** (ver ponto 5.5). |
| **8** | Bloqueio | Salta o jogador seguinte. N oitos numa jogada saltam N jogadores. **Acumula**: se o primeiro jogador não bloqueado jogar outro 8, salta o seguinte a ele. |
| **9, J, Q, K, A** | — | Cartas normais (altas). |
| **10** | Queimar | Joga-se sobre qualquer carta. A pilha sai **definitivamente do jogo** (`burnPile`). **O mesmo jogador joga outra vez**, com pilha vazia. |
| **Joker** | Queimar | Exatamente igual ao 10. Jogar 2 jokers juntos tem o mesmo efeito que jogar 1 (queima uma vez, joga outra vez). |

**Quatro iguais:** se o topo da pilha acumular **4 cartas do mesmo valor estritamente seguidas** (numa ou várias jogadas, de um ou vários jogadores), queima como o 10: pilha para `burnPile` e **quem jogou a quarta joga outra vez**. **O 3 não conta e interrompe a sequência**: K, K, K, 3 não queima e K, K, K, 3, K também não — os quatro Reis têm de estar fisicamente seguidos no topo.

## 8. Temporizador
- **30 s por turno.** Ao expirar, o jogador **apanha a pilha de descarte inteira para a mão e perde a vez** (mesmo tratamento de "sem jogada válida"). Assim ninguém ganha por deixar o relógio correr.
- Fase de escolha: 30 s, escolha automática das 3 cartas mais altas.

## 9. Fim de partida
- Jogador sem cartas em nenhuma camada → sai do jogo com a posição seguinte na classificação.
- O último com cartas perde e começa a partida seguinte.
- Resultado gravado com posições finais.

## 10. Notas de implementação
- `effectiveTop`: percorrer a pilha do topo para baixo ignorando os 3; o primeiro valor não-3 é o efetivo. Pilha vazia ou só 3s → sem restrição.
- Estado de restrição da pilha: `none | reset | maxSeven`.
- `pendingSkips: number` no estado; cada 8 (ou 3-sobre-8) jogado incrementa; cada jogador saltado decrementa.
- `sameRankRun: number` para os quatro iguais; qualquer carta de valor diferente (incluindo 3) faz reset a 1.
- Após queimar, `currentIndex` não avança.
- Efeitos numa tabela `cardEffects` configurável, para permitir variantes sem reescrever o motor.
- Testes obrigatórios: cada poder isolado; 3 sobre 7; 3 sobre 8; 3 sobre 3; 3 sobre 2; 8 múltiplos e 8 encadeados; K,K,K,3 não queima; K,K,K,3,K não queima; K,K,K,K queima; poder revelado numa escondida; 2 jokers = 1 joker; jogar outra vez após queimar; perder a vez após apanhar; timeout apanha a pilha.


---

# Contrato Técnico — GameModule, Eventos e Modelo de Dados

## 1. Interface `GameModule`
```ts
interface GameModule<State, Action, Config> {
  id: string;                          // "mexicana"
  name: string;
  minPlayers: number;
  maxPlayers: number;
  configSchema: ZodSchema<Config>;
  actionSchema: ZodSchema<Action>;

  setup(players: PlayerId[], config: Config, rng: Rng): State;
  applyAction(state: State, action: Action, playerId: PlayerId): Result<State, GameError>;
  getPlayerView(state: State, playerId: PlayerId): PlayerView;
  getSpectatorView(state: State): SpectatorView;
  getValidActions(state: State, playerId: PlayerId): Action[];
  getDefaultAction(state: State, playerId: PlayerId): Action;   // ao expirar o temporizador
  getCurrentPlayer(state: State): PlayerId | null;
  isFinished(state: State): boolean;
  getResult(state: State): GameResult;
}
```
- `Result<State, GameError>` — nunca lança exceções; devolve `{ ok, state, events }` ou `{ ok: false, error }`.
- `events` são eventos de domínio (`CardsPlayed`, `PileBurned`, `PlayerSkipped`, `PilePickedUp`, `CardRevealed`…) que o gateway traduz para mensagens de socket e animações.
- `GameRegistry` guarda os módulos por `id`; o núcleo só fala com a interface.

## 2. Ações da Mexicana
```ts
type MexicanaAction =
  | { type: "CHOOSE_FACE_UP"; cardIds: [CardId, CardId, CardId] }
  | { type: "PLAY_CARDS"; cardIds: CardId[] }          // 1+ do mesmo valor (só da mão); faceUp = 1
  | { type: "PLAY_FACE_DOWN"; position: 0 | 1 | 2 }    // às cegas
  | { type: "PICK_UP_PILE" }                            // apanha e perde a vez
  | { type: "TIMEOUT_PICK_UP" };                        // só o servidor emite (getDefaultAction) = PICK_UP_PILE
```

## 3. Estado da Mexicana (servidor)
```ts
interface MexicanaState {
  phase: "CHOOSING" | "PLAYING" | "FINISHED";
  players: Record<PlayerId, {
    hand: Card[];
    faceUp: Card[];
    faceDown: Card[];        // valores nunca saem do servidor
    finishedPosition: number | null;
  }>;
  turnOrder: PlayerId[];
  currentIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  burnPile: Card[];
  restriction: "none" | "reset" | "maxSeven";
  pendingSkips: number;      // 8s por resolver
  sameRankRun: number;       // contagem para quatro iguais (3 faz reset)
  turnTimeoutMs: number;     // 30_000 por omissão
  seed: string;
}
```

## 4. Eventos Socket.IO
### Cliente → Servidor
| Evento | Payload | Notas |
|---|---|---|
| `room:create` | `{ gameId, maxPlayers, isPrivate, config }` | |
| `room:join` | `{ code }` | |
| `room:leave` | — | |
| `room:ready` | `{ ready: boolean }` | |
| `room:start` | — | só anfitrião |
| `room:kick` | `{ playerId }` | só anfitrião |
| `room:chat` | `{ text }` | rate limited |
| `game:action` | `{ action }` | validado com `actionSchema` |

### Servidor → Cliente
| Evento | Payload | Notas |
|---|---|---|
| `room:state` | `RoomState` | lista de jogadores, ready, anfitrião |
| `room:chat` | `{ playerId, text, at }` | |
| `game:view` | `PlayerView` | vista filtrada, enviada por jogador |
| `game:events` | `DomainEvent[]` | para animações |
| `game:error` | `{ code, message }` | ação rejeitada |
| `game:finished` | `GameResult` | |
| `player:reconnected` / `player:disconnected` | `{ playerId }` | |

- Handshake: `auth: { token }` (JWT Supabase). Rejeitar sem token válido.
- Todos os payloads têm schema Zod em `packages/shared`.

## 5. Modelo de dados (Prisma)
```prisma
model Profile {
  id        String   @id            // = auth.users.id
  username  String   @unique
  avatarUrl String?
  createdAt DateTime @default(now())
  matches   MatchPlayer[]
}

model Room {
  id         String   @id @default(cuid())
  code       String   @unique
  gameId     String
  hostId     String
  isPrivate  Boolean
  maxPlayers Int
  status     RoomStatus   // OPEN | PLAYING | CLOSED
  createdAt  DateTime @default(now())
  matches    Match[]
}

model Match {
  id         String   @id @default(cuid())
  roomId     String
  gameId     String
  seed       String
  config     Json
  startedAt  DateTime
  finishedAt DateTime?
  room       Room     @relation(fields: [roomId], references: [id])
  players    MatchPlayer[]
  actions    MatchAction[]
}

model MatchPlayer {
  matchId       String
  profileId     String
  seat          Int
  finalPosition Int?
  match         Match   @relation(fields: [matchId], references: [id])
  profile       Profile @relation(fields: [profileId], references: [id])
  @@id([matchId, profileId])
}

model MatchAction {
  id        Int      @id @default(autoincrement())
  matchId   String
  seq       Int
  profileId String
  action    Json
  at        DateTime @default(now())
  match     Match    @relation(fields: [matchId], references: [id])
  @@unique([matchId, seq])
}
```
- Estado vivo da partida fica em **Redis**, não em Postgres. Postgres guarda seed + log de ações → qualquer partida é reconstruível por replay.

## 6. Reconexão
1. Socket cai → jogador marcado `disconnected`, temporizador de graça (por omissão 60 s).
2. Regressa com o mesmo JWT → recebe `game:view` completo e retoma.
3. Expira → ação por omissão em cada turno dele (`getDefaultAction`) até voltar; o anfitrião pode expulsá-lo.


---

# Plano de Fases

Cada fase termina com uma demonstração e aprovação explícita antes de avançar.

## Fase 0 — Fundações
- Monorepo pnpm + Turborepo, ESLint/Prettier/TS strict
- `docker compose` com Postgres + Redis
- Prisma schema + primeira migração
- Supabase Auth ligado ao Next.js (registo, login, rota protegida)
- CI (lint, typecheck, testes) a verde
- **Feito quando:** `pnpm dev` levanta tudo e consigo criar conta e entrar.

## Fase 1 — Núcleo de jogo
- `packages/game-core`: baralho configurável (52/54), RNG seguro, `GameModule`, `GameRegistry`, `Result`
- Jogo de teste trivial ("carta mais alta") a implementar o contrato
- Testes unitários do core
- **Feito quando:** o jogo trivial corre ponta a ponta só com o motor, em testes.

## Fase 2 — Servidor de tempo real
- NestJS + Socket.IO com handshake JWT
- Salas: criar, entrar por código, ready, start, kick, chat
- Estado em Redis, adapter Socket.IO Redis
- Reconexão com período de graça
- Rate limiting, validação Zod de todos os eventos
- **Feito quando:** duas instâncias do servidor servem a mesma sala sem perder estado.

## Fase 3 — Frontend lobby + mesa genérica
- **Baralho:** 54 cartas + verso em SVG conforme `06-DESIGN-CARTAS-E-UI.md`; página `/dev/cards` com galeria de todas para aprovação visual (checkpoint intermédio)
- Componentes `Card`, `CardFan`, `Pile`, `DrawPile` com animações base
- Lobby, criar/entrar sala, lista de jogadores, chat
- Mesa genérica que renderiza qualquer `PlayerView`
- Jogo trivial jogável no browser entre 2 contas
- **Feito quando:** dois browsers jogam o jogo trivial de ponta a ponta, a 60 fps, com o baralho aprovado.

## Fase 4 — Mexicana
- `packages/games/mexicana`: motor puro com todas as regras de `02-REGRAS-MEXICANA.md`
- Cobertura ≥ 90%, testes de cada poder e combinações
- Simulação: 10 000 partidas com bots aleatórios sem estado inválido nem partida infinita
- UI específica: camadas, seleção múltipla, revelação de escondidas, animação de queimar
- **Feito quando:** 4 contas jogam uma partida completa e o resultado fica gravado.

## Fase 5 — Acabamentos e deploy
- Histórico de partidas no perfil
- Temporizador de turno e ação por omissão
- Deploy em Railway (web, server, Redis) + Supabase
- `.env.example`, README de setup
- **Feito quando:** partida jogada em produção por 4 pessoas em redes diferentes.

## Depois (fora do MVP)
- Bots para preencher lugares
- Espectadores
- Ranking / estatísticas
- Segundo jogo (prova de extensibilidade)


---

# Pontos em Aberto — Regras da Mexicana

**Estado: FECHADO (2026-09-26).** Todas as decisões estão refletidas em `02-REGRAS-MEXICANA.md`. Este ficheiro fica como registo.

| # | Questão | Decisão |
|---|---|---|
| 1 | 2, 3, 10 e Joker sobre qualquer carta? | **Sim**, todas, mesmo sobre Ás ou sob restrição do 7 |
| 2 | Quem joga depois de queimar? | **O mesmo jogador**, com pilha vazia |
| 3 | 3 sobre 7 mantém a restrição? | **Sim**; o 3 copia valor e poder da carta abaixo (3 sobre 8 também bloqueia) |
| 4 | O 3 conta para os quatro iguais? | **Não** (K, K, K, 3 não queima); é transparente na contagem |
| 5 | Dois Jokers juntos? | **Igual a um Joker**; jogar um de cada vez é sempre opção |
| 6 | 8 sobre 8 acumula? | **Sim**; 2 oitos saltam 2, e um 8 do primeiro não bloqueado salta o seguinte a ele |
| 7 | Depois de apanhar a pilha? | **Perde a vez** |
| 8 | Quem começa? | **Aleatório** na primeira partida; depois **quem perdeu** |
| 9 | Visíveis em jogada múltipla? | **Não**, uma de cada vez |
| 10 | Temporizador? | **30 s**; ao expirar **apanha a pilha e perde a vez** |

| 11 | Timeout sem penalização? | **Ao expirar apanha a pilha** (fechado) |
| 12 | K, K, K, 3, K queima? | **Não**; o 3 interrompe a sequência, os quatro têm de estar seguidos (fechado) |


---

# Design das Cartas, Mesa e Movimento

Objetivo: o baralho tem de ser reconhecido à primeira como um **baralho clássico francês** (o de qualquer casino ou gaveta de cozinha) e o jogo tem de ser **limpo, rápido e suave**. Nada de estilo "cartoon", nada de gradientes de app de 2012, nada de cartas que parecem botões.

## 1. Baralho — especificação visual

### 1.1 Formato
- Proporção **poker: 2,5 × 3,5** (ratio 0,714). Cantos arredondados com raio ≈ 4,5% da largura.
- Fundo branco puro `#FFFFFF`, contorno subtil `1px` cinza `#D9D9D9` para destacar em fundos claros.
- Tamanho base de desenho: `viewBox="0 0 250 350"`. Renderizar em qualquer tamanho sem perder nitidez (SVG).

### 1.2 Cores
- Vermelho (copas, ouros): `#D0021B`
- Preto (espadas, paus): `#1A1A1A`
- Nunca usar cores alternativas para naipes (sem "quatro cores").

### 1.3 Índices (cantos)
- Valor + naipe no canto superior esquerdo; **repetido rodado 180°** no canto inferior direito.
- Valores: `A 2 3 4 5 6 7 8 9 10 J Q K`. O `10` escreve-se com dois algarismos, alinhado.
- Tipografia: serifada clássica, alto contraste, ex.: uma fonte de sistema serifada ou uma fonte livre de traços largos. Peso bold. Não usar sans-serif geométrica.

### 1.4 Naipes (símbolos)
- Desenhar os quatro símbolos como paths SVG próprios, com a forma tradicional:
  - **Copas** ♥ — coração com ponta inferior fina e lóbulos cheios
  - **Ouros** ♦ — losango com lados ligeiramente convexos
  - **Espadas** ♠ — pá com haste curta e base em cauda
  - **Paus** ♣ — trevo de três lóbulos com haste
- Mesmo símbolo reutilizado (via `<use>`) nos índices e no corpo.

### 1.5 Cartas numéricas (A–10) — disposição dos pips
Seguir **exatamente** a disposição tradicional; os pips da metade inferior ficam **invertidos** (rodados 180°):

| Carta | Disposição |
|---|---|
| A | 1 pip central grande (o Ás de espadas com pip ornamentado, maior que os outros ases) |
| 2 | 2 pips na coluna central (topo e base) |
| 3 | 3 pips na coluna central |
| 4 | 4 pips nos cantos (2 colunas × 2) |
| 5 | 4 nos cantos + 1 central |
| 6 | 2 colunas × 3 |
| 7 | 6 como o seis + 1 no centro superior |
| 8 | 6 como o seis + 1 centro superior + 1 centro inferior |
| 9 | 2 colunas × 4 + 1 central |
| 10 | 2 colunas × 4 + 2 na coluna central (superior e inferior) |

### 1.6 Figuras (J, Q, K)
- Estilo **clássico anglo-americano**: figuras de corpo duplo (espelhadas na diagonal), moldura interior retangular, paleta tradicional (vermelho, azul, amarelo, preto, branco) com traço preto.
- Cada figura distinta por naipe (não repetir a mesma ilustração com o naipe trocado).
- Duas vias aceitáveis:
  1. **Desenhar de raiz** em SVG, fiel ao estilo tradicional.
  2. **Usar um baralho vetorial de domínio público** (licença CC0 / Public Domain, verificada e documentada no repositório) como base, adaptando índices, naipes e cores a esta especificação. É a via recomendada para as figuras: fica profissional e evita meses de ilustração.
- Nunca usar imagens raster nem baralhos com licença restritiva.

### 1.7 Jokers (2)
- Bobo da corte clássico, um a cores (vermelho/azul) e um monocromático (preto), com a palavra **JOKER** na vertical no índice.
- Os dois têm ids diferentes (`JK1`, `JK2`) mas comportamento igual.

### 1.8 Verso
- Padrão simétrico, denso e repetitivo (guilhoché, losangos ou arabescos), **uma cor dominante** (azul `#1F3A93` ou vermelho `#8B1E1E`) sobre branco, com margem branca à volta.
- Simétrico em 180° para nunca se notar a orientação.
- Um único verso para todo o baralho.

### 1.9 Estados
- **Normal**, **selecionada** (levanta 12 px + sombra mais forte + contorno da cor primária da UI), **jogável** (opacidade 1) vs **não jogável** (opacidade 0,45 + sem hover), **escondida** (verso), **a revelar** (flip 3D).

## 2. Implementação técnica das cartas
- Um ficheiro SVG por carta em `packages/ui/cards/` + um `sprite.svg` gerado por script com `<symbol id="card-AS">…`.
- Componente `<Card id="10H" size="md" faceDown state="playable" />` que renderiza `<svg><use href="#card-10H"/></svg>`.
- Tamanhos: `sm` 56 px, `md` 84 px, `lg` 120 px de largura; altura pela proporção.
- Página `/dev/cards` com a galeria das 54 + verso em todos os tamanhos e estados. **Entregue e aprovada antes da mesa.**
- Nada de `<img>` com PNG. Nada de fontes web externas para os índices se não estiverem incluídas no repositório.

## 3. Mesa
- Fundo verde feltro escuro `#1E5631` com vinheta suave nas bordas; sem texturas fotográficas pesadas.
- Layout: adversários em arco no topo (avatar, nome, contador de cartas na mão, as 3 visíveis + 3 versos), pilha de descarte e baralho comum ao centro, mão do jogador em leque na base.
- O leque da mão: cartas sobrepostas ~55%, ligeira rotação (−10° a +10°), a carta em hover/selecionada sobe.
- Indicador claro de quem joga: anel animado à volta do avatar + temporizador circular de 30 s.
- Cartas não jogáveis visivelmente atenuadas; o jogador nunca tem de adivinhar o que pode fazer.
- Botão "Apanhar pilha" só aparece quando não há jogada válida.

## 4. Movimento (Framer Motion)
Toda a transição de cartas é uma animação com posição real de origem/destino (`layoutId`), nunca um "aparece/desaparece".

| Ação | Duração | Easing |
|---|---|---|
| Distribuir (9 cartas por jogador, em sequência) | 60 ms entre cartas, 220 ms cada | `easeOut` |
| Jogar carta para a pilha | 260 ms + pequena rotação aleatória final (−6° a +6°) para a pilha parecer real | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Jogar várias do mesmo valor | mesma, desfasadas 50 ms | idem |
| Comprar do baralho | 220 ms | `easeOut` |
| Apanhar a pilha | cartas voam para a mão em 320 ms com stagger 25 ms | `easeInOut` |
| Queimar (10/Joker/quatro iguais) | pilha encolhe e desvanece 360 ms; leve flash | `easeIn` |
| Revelar escondida | flip 3D 400 ms (`rotateY`) | `easeInOut` |
| Bloqueio do 8 | ícone de "skip" sobre o avatar saltado, 500 ms | — |
| Selecionar carta | 120 ms | `easeOut` |

- **60 fps obrigatório** em portátil médio e telemóvel de gama média. Animar só `transform` e `opacity`; nunca `top/left/width/height`.
- `prefers-reduced-motion` respeitado: transições reduzidas a 80 ms sem deslocação.
- Sons curtos e opcionais (jogar, apanhar, queimar, a tua vez), desligados por omissão, com toggle.

## 5. Responsivo
- Desktop ≥ 1024 px: layout completo.
- Tablet: adversários mais compactos, mão com `md`.
- Telemóvel (portrait): mão em leque com scroll horizontal se > 8 cartas; adversários em linha com avatar + contador; visíveis em `sm`. Tudo jogável com o polegar.

## 6. Acessibilidade
- Cada carta com `aria-label` ("Dez de copas", "Verso de carta").
- Navegação por teclado no desktop: setas para percorrer a mão, Enter para selecionar, Espaço para jogar.
- Contraste mínimo AA em todo o texto da UI.

## 7. Critérios de aceitação (Fase 3)
1. Galeria `/dev/cards` aprovada visualmente.
2. Uma pessoa que não conhece a app identifica qualquer carta em < 1 s.
3. Nenhuma animação abaixo de 55 fps no perfil de performance do Chrome.
4. Nenhuma carta "salta" de posição sem animação.
5. Mesa jogável em telemóvel sem zoom.


---

