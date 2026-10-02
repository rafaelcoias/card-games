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
