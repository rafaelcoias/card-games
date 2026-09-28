# Dealer Automático (bot)

O dealer **não toma decisões estratégicas**: segue regras fixas. O "bot" é a automatização, o ritmo e a personalidade. Deve parecer um croupier real, não um algoritmo instantâneo.

## 1. Comportamento (determinístico)
1. Distribui por ordem: jogadores (esquerda→direita), dealer (visível), jogadores, dealer (tapada).
2. Com Ás visível e seguro ativo: abre janela de seguro.
3. Com Ás ou 10 visível (modo PEEK): espreita. Tem blackjack → revela e liquida. Não tem → continua.
4. Aguarda os jogadores.
5. Na sua vez: revela a tapada; enquanto `dealerShouldHit` → tira carta; depois fica.
6. Se nenhuma mão viva precisar de comparação (todas rebentadas, desistidas ou blackjack pago), só revela.
7. Liquida mão a mão, da direita para a esquerda (como num casino: primeiro recolhe perdas, depois paga).
8. Se saiu a carta de corte, anuncia e baralha.

## 2. Ritmo (ações de sistema agendadas)
| Passo | Pausa antes |
|---|---|
| Cada carta na distribuição | 280 ms |
| Espreitar (peek) | 900 ms |
| Revelar carta tapada | 700 ms |
| Cada carta do dealer | 750 ms |
| Liquidação (por mão) | 350 ms |
| Resumo antes das próximas apostas | 2500 ms |
| Baralhar | 2200 ms |

Todos os tempos são configuráveis centralmente (constante do módulo), não na sala.

## 3. Personalidade (opcional, ligar por omissão)
- Nome e avatar fixos por mesa (ex.: "Rui", "Sofia", "Tiago", escolhido aleatoriamente ao criar a sala).
- Frases curtas no chat da mesa, em PT-PT, disparadas por eventos, com probabilidade e sem repetir seguidas:

| Evento | Exemplos |
|---|---|
| Início das apostas | "Façam as vossas apostas." · "Mesa aberta." |
| Fim das apostas | "Apostas fechadas." |
| Blackjack de um jogador | "Blackjack! Parabéns, {nome}." |
| Dealer blackjack | "Blackjack da casa. Lamento." |
| Dealer rebenta | "A casa rebentou. Pago a todos." |
| Jogador rebenta | "Passou, {nome}." |
| Seguro | "Seguro, alguém?" |
| Baralhar | "Carta de corte. Vou baralhar." |

- Nunca frases trocistas, ofensivas ou que incentivem a apostar mais.
- Frases numa tabela de configuração, não no código do motor (o motor só emite eventos; o servidor escolhe a frase).

## 4. O que o dealer NÃO faz
- Não "faz batota" nem ajusta cartas. A ordem do sapato é fixada ao baralhar e é auditável pelo `seed` + log.
- Não aconselha jogadores (a dica é uma funcionalidade separada, ver 06).
