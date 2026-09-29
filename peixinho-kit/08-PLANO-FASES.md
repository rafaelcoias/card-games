# Plano de Fases — Peixinho

## Fase 1 — Motor
- `packages/games/peixinho`: config, estado, algoritmos do 03, vistas, ações válidas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 partidas simuladas sem violar invariantes, **zero alterações ao núcleo**.

## Fase 2 — UI
- Componentes do 06: lago "à balda", mão agrupada por valor, pedir (toque e arrastar), balões, pescar, peixinho no balde, reposição, memória da mesa, marcador.
- Página `/dev/peixinho` com estados fixos (pedir, "Vai à pesca!", pescou o pedido, peixinho, reposição, fim).
- **Feito quando:** estados aprovados visualmente, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 3 contas (Playwright), com reconexão a meio.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida até aos 13 peixinhos em produção.
