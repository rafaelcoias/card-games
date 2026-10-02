# Cardroom — jogos de cartas online, em tempo real

Plataforma web para jogar cartas com amigos: contas, salas públicas e privadas, chat e mesas em tempo real
com um servidor autoritativo. Os jogos são a **Mexicana**, a **Fodinha** (apostar vazas; especificação em `fodinha-kit/`), o
**Blackjack** (até 7 contra a banca, com fichas virtuais sem valor real; especificação em `blackjack-kit/`), o
**Peixinho** (o *Go Fish* português: pedir cartas, ir à pesca e juntar peixinhos; especificação em `peixinho-kit/`), o
**Desconfia** (o jogo da mentira: pousar cartas viradas para baixo, anunciar o valor e desconfiar dos outros;
especificação em `desconfia-kit/`) e o **Olho** (o *Presidente* português: livrar-se das cartas primeiro, ganhar um
cargo e trocar cartas no jogo seguinte, numa mesa contínua; especificação em `olho-kit/`).
O jogo trivial "Carta Mais Alta" (`packages/games/high-card`) está desativado: o registo está comentado no servidor e
no cliente.

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
    peixinho/   Motor puro do Peixinho (sem I/O)
    desconfia/  Motor puro do Desconfia (sem I/O)
    olho/       Motor puro do Olho (sem I/O)
    high-card/  Jogo trivial (desativado)
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

#### Convidados

Quem não quer conta entra em `/guest` (também a partir do `/login` de um link de sala): escolhe um nome e
joga. Por baixo é o **login anónimo do Firebase**, por isso o resto do fluxo (cookie, socket, REST) é igual; o
token traz `firebase.sign_in_provider = "anonymous"` e é daí que web e servidor sabem que é convidado.

- O nome de um convidado **não é reservado** (não entra em `usernames/`), mas um convidado não pode usar o
  nome de uma conta. Os convidados não aparecem na pesquisa nem têm página pública (`/players/{nome}` dá 404).
- As partidas contam no histórico e nas estatísticas do convidado, e os outros veem a etiqueta *convidado*.
- **Criar conta** a partir do perfil liga um e-mail ao mesmo utilizador anónimo (`linkWithCredential`): o uid
  mantém-se, e com ele o histórico. O `/onboarding` pede então para reservar o nome.
- Sair como convidado não tem volta (não há como voltar a entrar na mesma sessão), por isso pede confirmação.
- Em produção é preciso ativar **Anonymous** em *Firebase Console → Authentication → Sign-in method*.

### Dados no Firestore

| Coleção | Conteúdo |
|---|---|
| `profiles/{uid}` | nome de utilizador, avatar, data de criação, `guest` |
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

- **Contas:** cria-as em `/register` com qualquer e-mail, ou entra como convidado em `/guest`.
- **E-mails:** os links (entrada por link, recuperação) não são enviados. Aparecem na UI dos emuladores, em
  *Authentication*.
- **Jogar sozinho:** para testar vários jogadores, abre várias janelas anónimas.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | Tudo em modo desenvolvimento (Turborepo) |
| `pnpm build` | Build de produção de todos os workspaces |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Qualidade (ESLint com tipos, TS strict, Prettier) |
| `pnpm test` | Testes unitários, incluindo **10 000 partidas simuladas** da Mexicana, do Peixinho, do Desconfia e do Olho e a **validação estatística do Blackjack** (10 milhões de mãos; `BLACKJACK_SIMULATION_HANDS` encurta-a) |
| `pnpm --filter @cardroom/server test:int` | Repositórios Firestore contra o emulador |
| `pnpm --filter @cardroom/server test:e2e` | Clientes Socket.IO jogam partidas completas (com reconexão) e sessões de Blackjack e de Olho onde se entra e sai a meio (`E2E_SERVER_URLS=url1,url2` reparte por 2 instâncias) |
| `pnpm test:e2e` | Playwright: registo, login, link por e-mail, recuperação de palavra-passe, partidas completas (incluindo o Peixinho a 3 e o Desconfia a 4, com um recarregar a meio) e sessões de Blackjack e de Olho pela UI |
| `pnpm emulators` | Emuladores Firebase (Auth + Firestore) |
| `pnpm firebase:deploy-rules` | Publica `firestore.rules` e os índices no projeto Firebase |
| `pnpm cards:generate` | Regenera o baralho SVG |

A galeria do baralho (54 cartas + verso) está em **`/dev/cards`**; os estados fixos da mesa da Mexicana
(escolher visíveis, a jogar, várias iguais, visíveis, às cegas, 6 jogadores) estão em **`/dev/mexicana`**; os estados fixos da mesa da Fodinha (às
cegas, apostas, empate, resumo, fim, 10 jogadores) estão em **`/dev/fodinha`**, os do Blackjack (apostas, dica, separação em 3 mãos, seguro, even money,
peek, banca, liquidação, baralhar, mesa cheia, recompra, entrar a meio) em **`/dev/blackjack`**, e os do Peixinho (pedir,
"Tenho!", "Vai à pesca!", pescou o pedido, peixinho, reposição, fora de jogo, fim, 6 jogadores, sem memória) em
**`/dev/peixinho`**, os do Desconfia (pilha nova, pilha em curso, à espera, desconfiar, mentira, verdade, peixinho,
última carta, fim, 8 jogadores) em **`/dev/desconfia`**, e os do Olho (abrir, seguir com par, salto com escape, saltado,
quatro iguais, joker, ninguém bateu, troca do Presidente, troca do Olho, resumo, bloqueado, 8 jogadores) em
**`/dev/olho`**.

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
- **Peixinho.** Regras do `peixinho-kit/02` com as propostas por omissão dos pontos em aberto (`09`), sem
  nenhuma alteração ao núcleo: 2 a 6 jogadores; pescar tocando numa carta do lago (6 s — os 5 s do kit mais o
  segundo do balão "Vai à pesca!" —, senão automático); memória dos últimos 5 pedidos, com "todos" ou "nenhuma"
  na sala; a primeira partida começa ao calhas e as seguintes quem fez menos peixinhos (sorteado entre
  empatados); empate no primeiro lugar é vitória partilhada; ao fim dos 30 s pede-se o valor de que se tem mais
  cartas (o mais baixo, se empatar) a um adversário ao calhas.
  - **O servidor responde.** Não há sistema de honra: se o jogador pedido tem o valor, as cartas passam
    sozinhas. Tocar numa posição do lago é só visual (a carta tirada é sempre a do topo, fixada ao baralhar);
    as posições (`pondSlots`) servem para todos os ecrãs verem a mesma carta sair do mesmo sítio.
  - **Informação oculta.** A carta pescada só vai nos eventos quando é o valor pedido; as reposições levam só
    a contagem. O próprio recebe a carta pela vista (`lastFish`, que descreve apenas a última ação). Os testes
    serializam todas as vistas e eventos de partidas inteiras à procura de cartas alheias e do lago.
  - **Fim garantido.** Com o lago vazio, quem fica sem cartas fica fora de jogo e é saltado. A simulação de
    10 000 partidas (bots ao calhas e bots de memória) verifica a conservação das 52 cartas em cada passo e que
    todas acabam (média de ~80–90 ações, máximo ~160). Bots que peçam sempre ao mesmo jogador podem andar em
    círculos com o lago vazio, mas o pedido automático do temporizador escolhe o alvo ao calhas.
  - **Crianças** (`09` #7): as salas já são privadas por omissão. O chat reduzido a frases pré-definidas mexe
    na plataforma (chat de todas as salas), por isso ficou de fora.
- **Desconfia.** Regras do `desconfia-kit/02` com as propostas por omissão dos pontos em aberto (`09`), sem
  nenhuma alteração ao núcleo: 54 cartas (com os 2 jokers), todas distribuídas; começa quem recebe o 3♣; 2 a 8
  jogadores; peixinhos só nas mãos e só com cartas naturais; a partida acaba no primeiro sem cartas, ou "até ao
  fim" como opção da sala (o último perde); ao fim dos 30 s joga-se uma carta, do valor da pilha se houver.
  - **Janela de desconfiança sem relógio no motor.** Cada jogada abre uma janela presa ao seu `playId`: o motor
    agenda `SYS_WINDOW_MIN_ELAPSED` (2 s; até lá o seguinte não joga e não corre temporizador) ou, se a jogada
    esvaziou a mão, `SYS_LAST_CARD_WINDOW_CLOSED` (3 s, e só então ganha). Cada `DOUBT` nomeia a jogada: uma
    desconfiança atrasada nunca acerta numa jogada mais nova. Todas as ações de uma sala passam numa só fila
    (cadeia local + lock em Redis), por isso de 5 desconfianças no mesmo instante só a primeira conta — o e2e
    de sockets prova-o.
  - **Mentir é parte do jogo.** O servidor aceita quaisquer cartas da mão com o valor anunciado; o número é
    sempre verdadeiro. As ações válidas listam uma jogada de uma carta por carta da mão (dizem ao cliente que
    pode jogar e com que valor) — as combinações não se podem enumerar.
  - **Informação oculta.** As jogadas vão como quem / quantas / que valor; só a jogada posta em causa é virada
    (`lastReveal`, até à jogada seguinte). As cartas que o próprio jogou também não vão nos eventos: a mesa
    lembra-se do que enviou para as fazer deslizar da mão. Os testes serializam todas as vistas e eventos.
  - **Sem cartas por um peixinho.** Caso que o kit não cobre: quem perde uma desconfiança e fica com a mão vazia
    porque a pilha lhe completou peixinhos também ficou sem cartas, por isso conta como fora (ganha, ou fica
    com a posição seguinte).
  - **Simulação.** 10 000 partidas de 3 a 8 bots, com vontade de mentir e de desconfiar diferente em cada uma,
    verificam a conservação das 54 cartas em cada passo; acabam todas (média ~115 ações, máximo ~680).
- **Olho.** Regras do `olho-kit/02` (v1.3, fechadas), sem nenhuma alteração ao núcleo: 54 cartas, 3 a 8 jogadores,
  todas as opções da sala do kit (acabar com 2/joker, quatro seguidos cortam, escapar ao salto, primeira vaza sem 2
  nem joker, tempos de 30/5/20 s). É uma mesa contínua (`SESSION`), como o Blackjack.
  - **Troca sem batota.** O servidor escolhe as melhores cartas de quem dá (joker, 2, Ás…; empates pelo naipe). A
    distribuição fica 2,2 s na mesa antes de as cartas saírem (`SYS_EXCHANGE_GIVE`), para se ver a mão inteira; depois
    o Presidente e o Vice-Presidente escolhem o que devolvem, em simultâneo, com 20 s (ao fim, as mais baixas). As
    cartas trocadas só vão na vista dos dois da troca (`exchange.mine`), que a guardam até ao fim da primeira vaza.
  - **Ritmo no motor.** Uma vaza decidida fica na mesa (`trick.closing`) e só sai com `SYS_CLOSE_TRICK`: 1,5 s depois
    de um corte (carimbo + recolha), 1,1 s quando todos passaram. O resumo do jogo dura 4,5 s. Como no Blackjack, o
    próximo passo automático deriva do estado (`scheduleFor`).
  - **Casos que o kit não cobre**, decididos e testados: quando a vez voltaria a quem jogou por último — todos os
    outros passaram ou foram saltados — a vaza é dele; quem só tem um 2/joker com a opção desligada é saltado
    automaticamente (e o jogo acaba se só restarem bloqueados); se o Olho anterior saiu, começa o pior classificado que
    ainda está à mesa; quem sai e volta antes do fim do jogo retoma as suas cartas; com menos de 3 sentados a mesa
    espera (`WAITING`) e recomeça quando alguém se senta.
  - **Terminar a sessão** é imediato: o jogo em curso não conta. O resultado ordena por pontos (empates partilham o
    lugar); quem tem mais ganha, quem tem menos perde, e uma sessão toda empatada não tem vencedor. Sem nenhum jogo
    terminado, fica `aborted`.
  - **Textos neutros.** "Perde a vez" em vez de "saltado/saltada", "Bloqueio · só 2/joker" em vez de "bloqueado/a".
  - **Simulação.** 10 000 jogos de 3 a 8 bots ao calhas, com as opções da sala sorteadas e, em parte das sessões,
    jogadores a entrar e a sair a meio, verificam em cada passo a conservação das 54 cartas, que quem tem a vez pode
    jogar e que não há 2 nem joker na primeira vaza; acabam todos com os cargos atribuídos (média ~120 ações).
#   c a r d - g a m e s  
 