# Cardroom — jogos de cartas online, em tempo real

Plataforma web para jogar cartas com amigos: contas, salas públicas e privadas, chat e mesas em tempo real
com um servidor autoritativo. Os jogos são a **Mexicana**, a **Fodinha** (apostar vazas; especificação em `fodinha-kit/`) e o
**Blackjack** (até 7 contra a banca, com fichas virtuais sem valor real; especificação em `blackjack-kit/`); há também um
jogo trivial ("Carta Mais Alta") que prova que o núcleo é extensível.

➡️ **Pôr online: [DEPLOY.md](DEPLOY.md)**. As especificações originais estão em `00-README.md` … `07-PROMPT-COMPLETO.md`.

## Arquitetura

```
 Browser ──HTTPS──▶ web (Next.js · Vercel)        Firebase Auth  ◀── login, registo, links por e-mail
    │                    │  SSR com o cookie de sessão (ID token Firebase)
    │                    ▼
    └──WebSocket──▶ server (NestJS + Socket.IO · Railway) ──▶ Firestore (perfis, salas, partidas, histórico)
                         │
                         └──▶ Redis (Railway) — estado vivo das mesas em jogo
```

```
apps/
  web/        Next.js 16 (App Router, Tailwind 4, motion): lobby, salas, mesa, autenticação Firebase
  server/     NestJS 11 + Socket.IO (adapter Redis): salas, sessões, temporizadores, REST; Firebase Admin
packages/
  shared/     Contrato de eventos Socket.IO, schemas Zod, DTOs
  game-core/  GameModule, GameRegistry, baralho 52/54, RNG (crypto / HMAC-DRBG), Result
  games/
    mexicana/   Motor puro da Mexicana (sem I/O)
    fodinha/    Motor puro da Fodinha (sem I/O)
    blackjack/  Motor puro do Blackjack (sem I/O)
    high-card/  Jogo trivial
  ui/         Baralho SVG (sprite + gerador) e componentes animados (Card, CardFan, …)
firebase.json, firestore.rules, firestore.indexes.json   Configuração Firebase + emuladores
```

### Porque há um servidor fora do Firebase

O Firebase trata das **contas** (Firebase Auth) e de **todos os dados** (Firestore). O jogo, porém, precisa de
um processo sempre ligado que mantenha WebSockets abertos, aplique as regras e controle os temporizadores de
30 s. As Cloud Functions não mantêm ligações persistentes. Por isso o servidor de jogo corre no Railway, e o
Redis guarda apenas o estado das mesas enquanto se joga (é rápido e sobrevive a reinícios). Quando uma
partida acaba, o resultado, o log de ações e o histórico ficam no Firestore.

### Princípios

- **Servidor autoritativo.** O cliente só envia intenções (`game:action`). O payload é validado com Zod e a
  jogada é validada pelo motor.
- **Motores puros.** `applyAction(state, action, playerId) → { ok, state, events }`, sem I/O. Os efeitos das
  cartas estão numa tabela configurável (`DEFAULT_CARD_EFFECTS`).
- **Informação oculta.** Cada jogador recebe só a sua vista. O baralho e as cartas escondidas nunca saem do
  servidor.
- **Replay.** Fisher–Yates com HMAC-SHA256-DRBG semeado por `crypto.randomBytes(32)`. A seed fica em
  `matches/{id}` e as ações em `matches/{id}/actions`, pelo que qualquer partida se reconstrói.
- **Extensível.** Um jogo novo é um pacote novo, mais uma linha em
  `apps/server/src/games/game-registry.provider.ts` e uma entrada em `apps/web/src/games/registry.ts`.

### Autenticação

1. O browser autentica-se com o **Firebase Auth**: e-mail e palavra-passe, link por e-mail ou recuperação de
   palavra-passe.
2. O **ID token** do Firebase vai para `POST /api/auth/session`, que o guarda num cookie `httpOnly`. A rota
   (proxy) e o SSR verificam-no com as chaves públicas da Google, por isso a web **não precisa de nenhum
   segredo**.
3. O `SessionSync` renova o cookie sempre que o Firebase roda o token, de hora a hora. Se o cookie expirar com
   o separador fechado, o `/login` renova-o sem pedir nada ao utilizador.
4. O servidor de jogo verifica o mesmo ID token (handshake do socket e REST) com o Firebase Admin SDK.

### Dados no Firestore

| Coleção | Conteúdo |
|---|---|
| `profiles/{uid}` | nome de utilizador, avatar, data de criação |
| `profiles/{uid}/history/{matchId}` | resumo de cada partida do jogador (escrito no fim da partida) |
| `usernames/{nome}` | índice de unicidade (transação, sem distinguir maiúsculas) |
| `rooms/{roomId}` | código, jogo, anfitrião, estado |
| `matches/{matchId}` | seed, config, jogadores, posições finais |
| `matches/{matchId}/actions/{seq}` | log ordenado de jogadas (escrito em lotes, sem atrasar o jogo) |

As regras (`firestore.rules`) **negam todo o acesso direto** a partir do browser. Só o servidor, com o Admin
SDK, lê e escreve.

### Tempo real

- O estado de cada sala ativa é um valor único em Redis. Toda a mutação passa por `RoomStore.mutate`, que usa
  um lock entre instâncias. Os efeitos (emits, escritas) só correm depois de gravar, e por isso a ordem nunca
  se troca.
- Os temporizadores vivem num *sorted set* do Redis. Cada job é reclamado com `ZREM`, corre exatamente uma vez
  e sobrevive a reinícios.
- **Uma ligação por jogador:** uma ligação nova substitui a anterior.
- **Reconexão:** durante o período de graça (60 s) o lugar fica guardado e o jogador recebe um snapshot. Depois
  disso fica *ausente*, e o servidor joga por ele a ação por omissão.

## Desenvolvimento local

Requisitos: Node ≥ 22.12, pnpm 9, Docker e Java 11+ (necessário para o emulador do Firestore).

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
pnpm infra:up          # Redis em :6380
pnpm emulators         # Firebase Auth :9099 + Firestore :8080 (UI em http://127.0.0.1:4401)
pnpm dev               # noutro terminal: web :3000 + servidor :4000
```

Localmente não precisas de nenhum projeto Firebase: os emuladores usam o projeto `demo-cardroom`, e os dados
persistem em `.firebase-data/`.

- **Contas:** cria-as em `/register` com qualquer e-mail.
- **E-mails:** os links (entrada por link, recuperação) não são enviados. Aparecem na UI dos emuladores, em
  *Authentication*.
- **Jogar sozinho:** para testar vários jogadores, abre várias janelas anónimas.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Tudo em modo desenvolvimento (Turborepo) |
| `pnpm build` | Build de produção de todos os workspaces |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Qualidade (ESLint com tipos, TS strict, Prettier) |
| `pnpm test` | Testes unitários, incluindo **10 000 partidas simuladas** da Mexicana e a **validação estatística do Blackjack** (10 milhões de mãos; `BLACKJACK_SIMULATION_HANDS` encurta-a) |
| `pnpm --filter @cardroom/server test:int` | Repositórios Firestore contra o emulador |
| `pnpm --filter @cardroom/server test:e2e` | Clientes Socket.IO jogam partidas completas (com reconexão) e uma sessão de Blackjack onde se entra e sai a meio (`E2E_SERVER_URLS=url1,url2` reparte por 2 instâncias) |
| `pnpm test:e2e` | Playwright: registo, login, link por e-mail, recuperação de palavra-passe duas partidas completas e uma sessão de Blackjack pela UI |
| `pnpm emulators` | Emuladores Firebase (Auth + Firestore) |
| `pnpm firebase:deploy-rules` | Publica `firestore.rules` e os índices no projeto Firebase |
| `pnpm cards:generate` | Regenera o baralho SVG |

A galeria do baralho (54 cartas + verso) está em **`/dev/cards`**; os estados fixos da mesa da Mexicana
(escolher visíveis, a jogar, várias iguais, visíveis, às cegas, 6 jogadores) estão em **`/dev/mexicana`**; os estados fixos da mesa da Fodinha (às
cegas, apostas, empate, resumo, fim, 10 jogadores) estão em **`/dev/fodinha`**, e os do Blackjack (apostas, dica, separação em 3 mãos, seguro, even money,
peek, banca, liquidação, baralhar, mesa cheia, recompra, entrar a meio) em **`/dev/blackjack`**.

## Decisões e notas

- **Figuras do baralho.** Os baralhos vetoriais de domínio público encontrados têm 4 a 5 MB por figura. Por isso
  o baralho é desenhado de raiz por um gerador determinístico: 55 SVG e um sprite de ~190 KB.
- **Regras não especificadas**, implementadas de forma consistente e cobertas por testes:
  - N treses sobre um 8 contam como N oitos.
  - Uma queima anula os saltos pendentes.
  - Quem sai do jogo com a carta que queima passa a vez.
  - Os saltos contam jogadores em ciclo.
  - Na escolha automática das visíveis, o Joker vale como a carta mais alta.
  - Só com visíveis na mesa e nenhuma jogável, quem apanha a pilha leva também uma delas para a mão, à
    escolha (como uma escondida que falha); se o tempo acabar, vai a mais baixa. Com uma visível jogável não se
    pode apanhar; o timeout, nesse caso, leva só a pilha.
- **Sair a meio.** O lugar mantém-se e o servidor joga por ti. Se todos saírem, a partida fica registada como
  `aborted`.
- **Contrato `GameModule`.** Face a `03-CONTRATO-E-EVENTOS.md` tem estas extensões: `getPendingPlayers`
  (fases simultâneas), `getTimeoutMs` (temporizadores genéricos), `setup(..., options)` ("quem perdeu
  começa") e, com a Fodinha (`fodinha-kit/04`):
  - `GameResult` genérico: `standings` com `outcome` (`WINNER`/`PLACED`/`LOSER`/`SURVIVOR`), `position` e
    `score`. Histórico e partidas antigas (só com posições) são lidos sem migração: o `outcome` deriva-se da
    posição.
  - Ações de sistema agendadas: o motor devolve `schedule` (pausas entre vazas, resumo da ronda, cartas às cegas)
    e o servidor aplica-as como `__system__` através do agendador em Redis. Cada agendamento fica preso ao `seq`
    em que nasceu, por isso qualquer outra ação torna-o obsoleto.
  - `configUi` (formulário de "Nova sala" gerado a partir do módulo; valores por omissão vêm do schema) e
    `validateTable` (ex.: jogadores × mão máxima ≤ 52), verificado ao criar a sala e ao começar.

  e, com o Blackjack (`blackjack-kit/04`):
  - `lifecycle: 'MATCH' | 'SESSION'`. Uma sessão é uma mesa contínua: a sala aceita entradas enquanto corre
    (`acceptsPlayers`), aparece nas salas públicas como "A decorrer · há lugar" e só o anfitrião a termina
    (`room:end`). Entrar, sair e terminar chegam ao motor como ações de sistema normalizadas
    (`SYS_PLAYER_JOINED` / `SYS_PLAYER_LEFT` / `SYS_END_SESSION`, em `sessionActions`) em vez dos ganchos
    `onPlayerJoin`/`onPlayerLeave` do kit: assim ficam no log de ações e o replay continua exato. O motor diz
    quem está sentado (`getSeatedPlayers`); quem sai a meio de uma mão continua sentado até ao fim da ronda e
    só então deixa a sala. Se todos saírem, a sessão termina com resultado (não é `aborted`).
  - `getTimeoutAction`: fases simultâneas que fecham como um todo (as apostas) em vez de uma ação por omissão por
    jogador. `setup(..., { seats })` passa os lugares da sala ao motor.
  - `createShoe` + `CardInstance` (`uid` = `"AS#3"`) para sapatos de vários baralhos. A Mexicana e a Fodinha
    continuam com `Card` de um só baralho (os ids já são únicos): mudá-las não traria nada.
- **Fodinha.** Quem aposta primeiro abre todas as vazas da ronda (sem configuração). O baralho de cada ronda é
  baralhado com uma seed secreta tirada do DRBG no início da partida; na ronda às cegas o servidor nunca envia a
  um jogador a sua própria carta, e as cartas vão para a mesa sozinhas (700 ms entre cada uma).
- **Blackjack.** Regras do `blackjack-kit/02` com as propostas por omissão de todos os pontos em aberto (`11`):
  6 baralhos, carta de corte a 75%, banca fica no 17 mole, carta americana (peek), 3:2, dobrar depois de separar,
  até 4 mãos, J+Q separa, desistência tardia, seguro e even money, 1000 fichas por sessão com recompra, dica
  desligada por omissão, temporizadores de 15/10/20 s. Tudo configurável ao criar a sala.
  - **Fichas sem valor.** Não há compras, trocas, prémios nem carteira permanente; o resultado de uma sessão é o
    saldo (fichas finais − compras) e conta como "jogada" nas estatísticas, nunca como vitória ou derrota.
  - **Ritmo.** A banca joga por ações de sistema agendadas, uma carta de cada vez (revelar 700 ms, cada carta
    750 ms, 900 ms para espreitar, 350 ms por mão paga, 2,5 s de resumo, 2,2 s a baralhar). A distribuição
    inicial é uma só ação: o cliente anima carta a carta (280 ms) e o motor só abre a fase seguinte depois disso
    (`SYS_DEAL_DONE`) — o agendador consulta o Redis a cada 150 ms, e 16 passos de 280 ms ficariam aos soluços.
    O próximo passo automático deriva do estado (`scheduleFor`), por isso uma ação que chegue entretanto (alguém
    entra ou sai) volta a armá-lo em vez de deixar a mesa parada; as ações de jogador que não são decisões
    (apostar, recomprar, ficar de fora) só são aceites quando a banca não está a meio de um passo.
  - **Informação oculta.** A carta tapada vai como `null` até ser revelada e a ordem do sapato nunca sai do
    servidor; os testes serializam todas as vistas e eventos de milhares de ações e verificam que só aparecem
    cartas viradas para cima. O sapato é baralhado por um PRNG com a seed secreta tirada do DRBG (como na
    Fodinha), pelo que cada sessão se reconstrói a partir da seed e do log.
  - **Validação estatística** (bloqueante, `simulation.test.ts`): bots de estratégia básica em 10 milhões de
    mãos medem uma vantagem da casa de **0,342% ± 0,065** (aceite: 0,2–0,7%), **4,745%** de blackjacks
    (4,75 ± 0,2) e **42,3%** de rebentamentos da banca com 6 à vista (42 ± 2); o qui-quadrado da baralhada em
    100 000 baralhadas dá 2647 para 2601 graus de liberdade. O kit pede 1 milhão de mãos, mas as 7 mãos de uma
    mesa partilham a banca: medido por lotes, o erro-padrão com 1 milhão é de 0,21 pontos, e o intervalo do kit
    ficaria a ±1σ. Com 10 milhões (~40 s) o teste decide mesmo alguma coisa.
  - **Estratégia básica** como dados (`strategy.ts`), testada célula a célula; a desistência é considerada
    primeiro, exceto num par que a tabela separa (8,8 separa sempre). A dica só existe para as regras em que a
    tabela é válida (4+ baralhos, S17, DAS, americana); noutras mesas a opção fica bloqueada ao criar a sala.
  - **Frases da banca** numa tabela (`dealer-lines.ts`): o motor só emite eventos e cada cliente escolhe a frase
    a partir de uma chave determinística (o mesmo evento dá a mesma frase em todos os ecrãs, nunca duas iguais
    seguidas). Aparecem num balão por cima da banca em vez de irem para o chat, que guarda só 50 mensagens e
    ficaria cheio de "Façam as vossas apostas".
  - **Sair e voltar.** Quem sai e volta à mesma sessão recupera as fichas (sair nunca repõe o stack). Uma sessão
    terminada sem nenhuma ronda jogada fica registada como `aborted`.
  - `PLACE_BET` aparece uma vez nas ações válidas, com a aposta mínima: qualquer múltiplo de 10 entre os limites
    que caiba no stack é aceite.
#   c a r d - g a m e s  
 