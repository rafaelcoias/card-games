# Núcleo — Dependências

O Desconfia não acrescenta alterações novas ao núcleo. Usa:

| Necessidade | Vem de |
|---|---|
| Baralho de 54 | `createShoe({ decks: 1, jokers: true })` |
| Desconfiar fora da vez (qualquer jogador) | **Fases simultâneas** — kit Blackjack, `04` ponto 2 |
| Janela de desconfiança e temporizadores | ações de sistema agendadas — kit Fodinha |
| Resultado com vencedor/posições | `GameResult` genérico — kit Fodinha |

**Se o Blackjack ainda não estiver feito:** implementar aqui só o ponto 2 do `04` do Blackjack (o gateway deixa de assumir um "jogador da vez" e valida apenas com `getValidActions`).

**Verificação obrigatória:** confirmar que o servidor processa as ações de cada sala **em fila única** (uma de cada vez). Se não estiver garantido, implementar uma fila por sala (Redis lock ou fila em memória por instância dona da sala). Sem isto, duas desconfianças simultâneas podem ser ambas aceites.
