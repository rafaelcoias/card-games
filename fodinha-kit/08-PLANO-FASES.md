# Plano de Fases — Fodinha

## Fase 0 — Alterações ao núcleo
- Implementar o `04-ALTERACOES-AO-NUCLEO.md`: `GameResult` genérico + migração, ações de sistema agendadas (Redis), `configUi` + formulário no lobby, min/max jogadores por módulo.
- Adaptar a Mexicana ao novo `GameResult` e ao `SYS_TIMEOUT`.
- **Feito quando:** todos os testes da Mexicana passam, uma partida da Mexicana joga-se normalmente, e o formulário de criação de sala muda consoante o jogo escolhido.

## Fase 1 — Motor da Fodinha
- `packages/games/fodinha`: config, estado, ações, algoritmos do `03`, `getPlayerView`, `getValidActions`, `getDefaultAction`.
- Todos os testes do `07`, incluindo guião e simulação.
- Registo no `GameRegistry`.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 simulações sem violar invariantes.

## Fase 2 — UI da Fodinha
- Componentes do `06`: mesa até 10 lugares, faixa de ronda, ronda às cegas, painel de apostas, indicadores, resolução de vaza, resumo de ronda, marcador, fim de jogo.
- Página `/dev/fodinha` com estados fixos (às cegas, apostas, empate, resumo, fim) para aprovação visual sem precisar de jogar.
- **Feito quando:** estados aprovados visualmente, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 4 contas (Playwright), incluindo reconexão a meio de uma ronda às cegas (a carta própria continua escondida após reconectar).
- Histórico e resultado gravados com `outcome` e `score`.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida inteira em produção.
