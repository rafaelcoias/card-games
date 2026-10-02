# Núcleo — Dependências

O Gringo **não acrescenta alterações ao núcleo**.

| Necessidade | Vem de |
|---|---|
| Baralho de 54 (ou 108 com 2 baralhos) | `createShoe` — kit Blackjack `04` §1 |
| Espreitar inicial em simultâneo e bater fora da vez | fases simultâneas — kit Blackjack `04` §2 |
| Uma só batida por descarte | fila única por sala — kit Desconfia `04` |
| Janela de bater, temporizadores | ações de sistema agendadas — kit Fodinha |
| Resultado por pontos | `GameResult` genérico — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |
