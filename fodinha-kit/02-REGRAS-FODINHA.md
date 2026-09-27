# Regras da Fodinha — Especificação (v1.0)

> Família de jogos de "apostar vazas" (semelhante a *Oh Hell*). Estas regras prevalecem sempre.

## 1. Objetivo
**Não perder.** Não há vencedores: há perdedores e sobreviventes.
Cada jogador acumula pontos de penalização. Quem atingir `maxPoints` (por omissão **5**) perde e o jogo termina.

## 2. Material e jogadores
- Baralho de **52 cartas, sem jokers**.
- **2 a 10 jogadores.**
- Restrição de configuração: `jogadores × maxHandSize ≤ 52` (com 10 jogadores e mão máxima de 5 → 50 cartas).

## 3. Hierarquia
`2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < A♦`
- Os naipes **não contam**, com uma exceção: o **Ás de Ouros** é a carta mais forte do jogo e bate os outros três Ases.
- Duas cartas do mesmo valor (ex.: 9♠ e 9♥) têm a mesma força.

## 4. Sequência de rondas
O número de cartas por jogador segue um ciclo que sobe e desce:

`1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, …`

- Com `maxHandSize = 5`, o ciclo tem 8 rondas: `[1, 2, 3, 4, 5, 4, 3, 2]` e repete.
- `maxHandSize` é configurável (proposta: 3 a 7, respeitando a restrição da secção 2).

## 5. Quem começa
- Na **primeira ronda** da partida, o jogador inicial é sorteado.
- Em cada ronda seguinte, começa o **próximo jogador no sentido dos ponteiros do relógio**.
- Quem começa a apostar é também quem joga a primeira carta da ronda.

## 6. Visibilidade das cartas
| Ronda | O próprio vê a sua mão? | Os outros veem a mão dele? |
|---|---|---|
| 1 carta (às cegas) | **Não** | **Sim** |
| 2 ou mais cartas | Sim | Não |

Isto aplica-se a **todas** as rondas de 1 carta, não só à primeira da partida.

## 7. Apostas
1. Depois de distribuir, cada jogador aposta, **por ordem dos ponteiros do relógio** a partir de quem começa, quantas vazas vai ganhar nessa ronda.
2. A aposta é um inteiro entre **0 e o número de cartas da ronda**.
3. A aposta é **pública** e fica **bloqueada** assim que é feita; não se pode alterar.
4. Todos veem, em tempo real, a soma das apostas face ao número de vazas em jogo.
5. Restrição do último a apostar: ver `09-PONTOS-EM-ABERTO.md` (#1).

## 8. Jogar as vazas
1. Uma ronda com N cartas tem **N vazas**.
2. Na primeira vaza, joga primeiro quem começou a apostar; segue-se a ordem dos ponteiros do relógio, uma carta por jogador.
3. Pode jogar-se **qualquer carta** da mão (não há obrigação de seguir naipe — confirmar no 09 #3).
4. Na ronda às cegas, cada jogador tem uma única carta que não conhece; ao chegar a sua vez, joga-a (ver 09 #6).
5. **Quem aposta primeiro abre todas as vazas da ronda**, seja qual for o resultado da vaza anterior (ganha por alguém ou empatada). Na ronda seguinte começa o jogador seguinte no sentido dos ponteiros do relógio. Não é configurável.

## 9. Quem ganha a vaza
- Ganha a vaza quem jogou a **carta mais alta**, se for a **única** com essa força.
- Se **dois ou mais** jogadores jogarem cartas com a mesma força máxima, **ninguém ganha a vaza**. As cartas saem da mesa e a vaza não conta para ninguém.
- O Ás de Ouros nunca empata (é único).

| Cartas na vaza | Resultado |
|---|---|
| 9♠, K♥, 4♣ | K♥ ganha |
| K♥, K♠, 4♣ | Ninguém (empate nos Reis) |
| A♠, A♥, K♦ | Ninguém (empate nos Ases) |
| A♠, A♦, A♥ | A♦ ganha |
| Q♠, Q♥, Q♦, J♣ | Ninguém |
| 5♣, 5♦ (2 jogadores) | Ninguém |

Consequência: numa ronda, a soma das vazas ganhas pode ser **menor** que o número de cartas.

## 10. Pontuação
No fim da ronda, cada jogador compara vazas ganhas com a sua aposta.
- Acertou exatamente → não leva pontos.
- Falhou (mais ou menos) → **falhou a ronda**.

**Valor da ronda** = `1 + acumulado`.
- Se **pelo menos um** jogador falhou: cada jogador que falhou recebe o valor da ronda em pontos; o acumulado volta a 0.
- Se **ninguém** falhou: ninguém recebe pontos e o acumulado sobe 1 (a ronda seguinte vale mais 1 ponto).

Exemplo: ronda 6 sem falhas → ronda 7 vale 2; ronda 7 também sem falhas → ronda 8 vale 3; na ronda 8 dois jogadores falham → cada um leva 3 pontos, acumulado volta a 0.

O valor por falhar não depende de quanto se falhou (falhar por 1 ou por 3 dá o mesmo).

## 11. Fim do jogo
- Depois de pontuar cada ronda: se algum jogador tiver `pontos ≥ maxPoints`, o jogo termina.
- **Perdem todos** os que estiverem nessa situação (pode ser mais do que um).
- Os restantes são **sobreviventes**.
- Nova partida na mesma sala: ver 09 #4.

## 12. Temporizador
- 30 s por decisão (apostar ou jogar carta), configurável.
- O que acontece ao expirar: ver 09 #5.
