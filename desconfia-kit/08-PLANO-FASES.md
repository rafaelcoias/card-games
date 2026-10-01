# Plano de Fases — Desconfia

## Fase 0 — Verificação do núcleo
- Confirmar as dependências do `04`: fases simultâneas e fila única por sala.
- **Feito quando:** o teste de concorrência do `07` §8 passa numa sala de teste.

## Fase 1 — Motor
- `packages/games/desconfia`: config, estado, janela de desconfiança, algoritmos, vistas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 partidas sem violar invariantes.

## Fase 2 — UI
- Componentes do 06: pilha, valor em jogo, seleção múltipla, anúncio, botão "Desconfia!", revelação com carimbo, peixinho, última carta.
- Página `/dev/desconfia` com estados fixos (pilha nova, pilha em curso, janela aberta, revelação mentira/verdade, peixinho, última carta, fim).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida via sockets com 4 contas (Playwright), incluindo desconfianças simultâneas e reconexão a meio de uma janela.
- **Feito quando:** 5 pessoas em redes diferentes jogam uma partida completa em produção sem estados inconsistentes.
