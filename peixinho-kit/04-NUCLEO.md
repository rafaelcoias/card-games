# Núcleo — Sem alterações

O Peixinho **não exige nenhuma alteração ao núcleo**. Usa o que já existe:

| Necessidade | Vem de |
|---|---|
| Baralho de 52 | `createShoe({ decks: 1 })` (kit Blackjack) ou baralho simples original |
| Resultado com vencedores e posições | `GameResult` genérico (kit Fodinha) |
| Temporizador de pedido e de pesca | ações de sistema agendadas (kit Fodinha) |
| Opções da sala (memória da mesa, pescar no lago) | `configUi` (kit Fodinha) |
| Salas, sockets, reconexão, auth | plataforma base |

Se durante a implementação surgir a necessidade de mexer no núcleo, trata-se de um sinal de alarme: o agente tem de parar e justificar antes.
