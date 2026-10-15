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
