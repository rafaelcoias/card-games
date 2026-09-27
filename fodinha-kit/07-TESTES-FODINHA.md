# Testes Obrigatórios — Fodinha

Cobertura mínima de 90% no motor. Todos os testes sobre o motor puro, com baralho injetado.

## 1. Sequência e rotação
- `handSizeForRound` para `max = 1, 2, 3, 5, 7`, 30 rondas cada (ex.: max 5 → 1,2,3,4,5,4,3,2,1,2…).
- `starterIndex` avança 1 por ronda e dá a volta à mesa.
- Validação: 11 jogadores rejeitado; 10 jogadores com `maxHandSize = 6` rejeitado (60 > 52).

## 2. Visibilidade (segurança)
- Ronda de 1 carta: para cada jogador, `me.hand === null` e o JSON da vista **não contém** o id da sua carta.
- Ronda de 1 carta: cada vista contém as cartas de todos os outros.
- Ronda ≥ 2: o JSON da vista de cada jogador **não contém** nenhum id de carta das mãos alheias.
- `CardsDealt` nunca contém cartas.
- Ronda às cegas no meio da partida (ronda 9) também é às cegas.

## 3. Apostas
- Só o jogador da vez pode apostar; fora de vez → erro.
- Aposta fora de `0..N` → erro.
- Segunda aposta do mesmo jogador → erro (bloqueio).
- Ordem começa no `starterIndex`.
- Com `lastBidderRestriction`: o valor que faria soma = N é inválido; os outros são válidos; nos restantes apostadores não há restrição.
- `PLAY_CARD` durante BIDDING → erro.

## 4. Jogo das vazas
- Primeira vaza abre o starter.
- Carta que não está na mão → erro. Jogar fora de vez → erro.
- Todas as vazas da ronda abrem no starter, depois de uma vaza ganha por outro jogador e depois de um empate; na ronda seguinte abre o jogador seguinte (sentido horário, com volta do último ao primeiro).
- Todas as cartas da tabela da secção 9 do 02 resolvem como indicado.
- A♦ bate A♠/A♥/A♣; A♠ + A♥ sem A♦ → empate.
- Três ou mais empatados no topo → ninguém.

## 5. Pontuação
- Acerto exato → 0 pontos. Falha por mais e por menos → valor da ronda.
- Ninguém falha → `carry` +1; ronda seguinte vale `1 + carry`.
- Duas rondas seguidas sem falhas → a terceira vale 3.
- Após uma ronda com falhas, `carry = 0`.
- Todos falham → todos recebem o valor.

## 6. Fim de jogo
- Um jogador atinge `maxPoints` → FINISHED, um perdedor.
- Dois atingem na mesma ronda → dois perdedores.
- Jogador ultrapassa (4 + valor 3 = 7) → perde na mesma.
- `GameResult`: perdedores `LOSER`, restantes `SURVIVOR`, `score` preenchido.

## 7. Sistema e tempo
- `PLAY_CARD` da última carta da vaza devolve `schedule` com `SYS_RESOLVE_TRICK_DONE`.
- Ação de sistema vinda de um jogador → rejeitada.
- Agendamento com `stateVersion` antigo → ignorado.
- `SYS_TIMEOUT` em BIDDING e em PLAYING aplica o comportamento decidido no 09 #5.

## 8. Guião
- Teste de integração do motor que reproduz o `05-GUIAO-DE-PARTIDA.md` (rondas 1, 2, 3 e 9 com cartas exatas; rondas 4–8 com mãos geradas que produzam as falhas indicadas) e verifica pontos, acumulado e perdedores.
- Variante do final com dois perdedores.

## 9. Simulação
- 10 000 partidas com 2–10 jogadores e bots aleatórios.
- Invariantes em cada passo:
  - Conservação: cartas nas mãos + cartas jogadas nesta ronda = `jogadores × handSize`.
  - Soma de `tricksWon` ≤ vazas jogadas.
  - `points` nunca diminui.
  - A partida termina sempre (com `maxPoints = 5` deve terminar em < 200 rondas; registar máximo e média).
