# Plano de Fases — Sueca

## Fase 0 — Núcleo
- `excludeRanks` no `createShoe` (se faltar).
- Alteração 1 (`seating` com equipas) e Alteração 2 (`disconnectPolicy: "PAUSE"`) do `04`.
- **Feito quando:** todos os jogos anteriores continuam verdes; uma sala de teste com `seating` deixa escolher lugares e uma com `PAUSE` congela e retoma corretamente.

## Fase 1 — Motor
- `packages/games/sueca`: config, distribuição com corte, legalidade, vazas, pontuação, partida, última vaza, chat, pausa, timeouts, vistas, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 100 000 mãos sem violar invariantes.

## Fase 2 — UI
- Componentes do 06: escolha de lugares, corte, trunfo, mão ordenada com cartas legais, vaza em cruz, última vaza, resumo, marcador, pausa.
- Página `/dev/sueca` com estados fixos (sala, corte, vaza a meio, vaza fechada, última vaza, resumo de mão, pausa, fim).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel. Revisão final "limpeza": retirar tudo o que não seja essencial.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 4 contas (Playwright), com uma desconexão e retoma a meio de uma vaza.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida a 4 jogos em produção, e um jogador habitual de sueca não encontra nada "fora do sítio".
