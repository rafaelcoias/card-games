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
