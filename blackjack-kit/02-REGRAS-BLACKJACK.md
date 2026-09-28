# Regras do Blackjack — Especificação (v1.0)

## 1. Objetivo
Cada jogador joga **contra o dealer**, não contra os outros. Ganha quem ficar mais perto de 21 sem passar. Os outros jogadores partilham a mesa e o sapato, mas os resultados são independentes.

## 2. Mesa
- **1 a 7 jogadores** humanos + dealer automático.
- **Sapato** de 6 baralhos de 52 cartas (configurável 1–8), sem jokers.
- **Penetração**: carta de corte a 75% do sapato (configurável 50–85%). Quando sai a carta de corte, termina a ronda em curso e o sapato é baralhado antes da ronda seguinte.

## 3. Valor das cartas
| Carta | Valor |
|---|---|
| 2–10 | valor facial |
| J, Q, K | 10 |
| A | 1 ou 11 (o que for melhor sem passar de 21) |

- **Mão mole (soft):** tem um Ás a contar 11 (ex.: A+6 = "7 ou 17", soft 17).
- **Mão dura (hard):** sem Ás a contar 11.
- **Blackjack:** Ás + carta de 10 **nas duas primeiras cartas** da mão original. 21 depois de separar **não** é blackjack.
- **Rebentar:** passar de 21.

## 4. Fichas
- Cada jogador começa a sessão com **1000 fichas** (configurável).
- Aposta mínima **10**, máxima **500** (configurável), sempre em **múltiplos de 10**.
- Fichas sem valor real (ver README).
- Ficar sem fichas: ver 11 #9 (recompra).

## 5. Ronda
### 5.1 Apostas (simultâneas)
- Todos apostam ao mesmo tempo, com temporizador (15 s).
- Quem não apostar fica de fora nessa ronda.
- A aposta tem de caber nas fichas disponíveis.
- Botões de conveniência: repetir aposta anterior, dobrar aposta anterior.

### 5.2 Distribuição
Por ordem dos lugares (da esquerda do dealer para a direita):
1. Uma carta virada para cima a cada jogador com aposta.
2. Uma carta virada para cima ao dealer (**carta visível**).
3. Segunda carta virada para cima a cada jogador.
4. Segunda carta do dealer **virada para baixo** (**carta tapada**) — ver 11 #2.

### 5.3 Seguro e verificação (só se a carta visível do dealer for Ás ou 10)
- **Carta visível Ás:** oferece-se **seguro** a todos (simultâneo, 10 s). Custa metade da aposta e paga 2:1 se o dealer tiver blackjack.
  - Jogador com blackjack recebe a oferta de **even money** (receber já 1:1 e fechar a mão) em vez de seguro.
- **Verificação (peek):** com Ás ou 10 à vista, o dealer espreita a carta tapada.
  - Se tiver blackjack: revela, a ronda termina; perdem todas as apostas exceto blackjacks (empate) e seguros pagam.
  - Se não tiver: seguros perdem-se e a ronda continua.

### 5.4 Turnos dos jogadores
Por ordem dos lugares, cada jogador joga as suas mãos até ficar, rebentar ou fazer 21.
Jogadores com blackjack não jogam (a mão está fechada).

| Ação | Quando | Efeito |
|---|---|---|
| **Pedir** (hit) | sempre que a mão < 21 | +1 carta |
| **Ficar** (stand) | sempre | termina a mão |
| **Dobrar** (double) | só com as 2 primeiras cartas da mão | duplica a aposta, recebe exatamente 1 carta, termina |
| **Separar** (split) | 2 primeiras cartas do mesmo valor | ver 5.5 |
| **Desistir** (surrender) | só como primeira decisão da mão original, se ativo | perde metade da aposta, termina |

- Com 21 (não blackjack), a mão fica automaticamente.
- Dobrar e separar exigem fichas suficientes para a aposta adicional.

### 5.5 Separar
- Cartas do mesmo **valor** (10, J, Q, K contam como iguais) — ver 11 #5.
- Cada carta passa a ser uma mão com aposta igual à original; cada uma recebe uma segunda carta e joga-se por ordem.
- **Reseparar** até um máximo de **4 mãos**.
- **Ases separados**: recebem **uma** carta cada e ficam; não se resseparam Ases.
- **Dobrar depois de separar** permitido.
- 21 numa mão separada paga 1:1 (não é blackjack).

### 5.6 Dealer
- Revela a carta tapada.
- Pede carta com 16 ou menos; **fica com 17 ou mais**.
- **Soft 17**: fica (S17) — ver 11 #1.
- Se todos os jogadores rebentaram, desistiram ou tiveram blackjack pago, o dealer só revela e não tira cartas.

### 5.7 Pagamentos
| Situação | Pagamento |
|---|---|
| Blackjack do jogador (dealer sem blackjack) | **3:2** |
| Ganha ao dealer | 1:1 |
| Dealer rebenta (jogador não rebentou) | 1:1 |
| Empate (push) | devolve a aposta |
| Jogador rebenta | perde (mesmo que o dealer rebente depois) |
| Blackjack vs blackjack | empate |
| Desistência | devolve metade |
| Seguro com dealer blackjack | 2:1 sobre o seguro |
| Even money | 1:1 imediato |

### 5.8 Fim de ronda
- Pagamentos com animação de fichas.
- Cartas para o descarte.
- Se saiu a carta de corte: baralhar o sapato (com animação) antes das apostas seguintes.

## 6. Sessão
- A mesa corre rondas contínuas até o anfitrião terminar a sessão (ou regra do 11 #10).
- Jogadores podem **entrar e sair entre rondas** (11 #11).
- Resultado da sessão: saldo líquido de cada jogador (fichas finais − fichas iniciais − recompras × stack).
