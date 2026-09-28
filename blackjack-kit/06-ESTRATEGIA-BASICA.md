# Estratégia Básica — Dicas e Bots de Simulação

Tabela para **4–8 baralhos, dealer fica em soft 17 (S17), dobrar após separar (DAS), desistência tardia**. Usos:
1. **Botão de dica** (se `hintsEnabled`): mostra a jogada recomendada.
2. **Bots de simulação** nos testes estatísticos (09).

Se as regras da sala forem diferentes (H17, sem DAS, 1–2 baralhos), gerar a tabela correspondente ou desligar a dica para essa configuração. **A tabela tem de ser validada pela simulação**: vantagem da casa esperada ≈ 0,3–0,5% com estas regras.

Legenda: **H** pedir · **S** ficar · **D** dobrar (se não puder, pedir) · **Ds** dobrar (se não puder, ficar) · **P** separar · **R** desistir (se não puder, pedir)

## Mãos duras
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 17+ | S | S | S | S | S | S | S | S | S | S |
| 16 | S | S | S | S | S | H | H | R | R | R |
| 15 | S | S | S | S | S | H | H | H | R | H |
| 13–14 | S | S | S | S | S | H | H | H | H | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 11 | D | D | D | D | D | D | D | D | D | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 5–8 | H | H | H | H | H | H | H | H | H | H |

## Mãos moles
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,9 | S | S | S | S | S | S | S | S | S | S |
| A,8 | S | S | S | S | S | S | S | S | S | S |
| A,7 | S | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,6 | H | D | D | D | D | H | H | H | H | H |
| A,4–A,5 | H | H | D | D | D | H | H | H | H | H |
| A,2–A,3 | H | H | H | D | D | H | H | H | H | H |

## Pares
| Jogador \ Dealer | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,A | P | P | P | P | P | P | P | P | P | P |
| 10,10 | S | S | S | S | S | S | S | S | S | S |
| 9,9 | P | P | P | P | P | S | P | P | S | S |
| 8,8 | P | P | P | P | P | P | P | P | P | P |
| 7,7 | P | P | P | P | P | P | H | H | H | H |
| 6,6 | P | P | P | P | P | H | H | H | H | H |
| 5,5 | D | D | D | D | D | D | D | D | H | H |
| 4,4 | H | H | H | P | P | H | H | H | H | H |
| 2,2–3,3 | P | P | P | P | P | P | H | H | H | H |

## Regras de consulta
1. Primeiro verificar desistência (só primeira decisão).
2. Depois pares (se puder separar).
3. Depois moles, depois duras.
4. Mãos com 3+ cartas: nunca D/P/R; D → H, Ds → S.
5. Nunca recomendar seguro nem even money.

## Implementação
- Tabelas como dados (`strategy/s17-das-ls.ts`), não como `if`s.
- `getHint(hand, dealerUpCard, config, validActions)` puro e testado célula a célula.
