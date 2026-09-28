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
