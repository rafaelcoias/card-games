# Núcleo — Dependências

O Olho **não acrescenta alterações ao núcleo**.

| Necessidade | Vem de |
|---|---|
| Baralho de 54 | `createShoe({ decks: 1, jokers: true })` |
| Troca simultânea (Presidente e Vice-Presidente ao mesmo tempo) | fases simultâneas — kit Blackjack `04` §2 |
| Sessão contínua com cargos entre jogos | `lifecycle: "SESSION"` — kit Blackjack `04` §3 |
| Temporizadores (jogada, salto, troca, resumo) | ações de sistema agendadas — kit Fodinha |
| Resultado por pontos | `GameResult` genérico — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |

**Entrar e sair a meio da sessão:** quem entra fica de fora até ao próximo jogo e começa sem cargo. Quem sai a meio de um jogo passa automaticamente em todas as vazas e fica com a pior posição livre. Se sair o Presidente ou o Olho, a troca do jogo seguinte faz-se só entre os cargos que existirem.
