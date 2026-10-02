# Plano de Fases — Olho

## Fase 1 — Motor
- `packages/games/olho`: config, estado, validação, saltos, cortes, fecho, cargos, troca, sessão, vistas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião e variantes reproduzidos, 10 000 jogos sem violar invariantes, zero alterações ao núcleo.

## Fase 2 — UI
- Componentes do 06: insígnias de cargo, seleção de combinações, salto com painel de escape, cortes, troca, resumo e marcador.
- Página `/dev/olho` com estados fixos (abrir, seguir com par, salto com escape, quatro iguais, joker, troca do Presidente, troca do Olho, resumo).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Sessão de 3 jogos via sockets com 4 contas (Playwright), com troca de cartas real e um jogador a sair a meio.
- **Feito quando:** 5 pessoas em redes diferentes jogam uma sessão de 5 jogos em produção.
