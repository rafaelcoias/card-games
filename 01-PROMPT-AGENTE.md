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
