# Testes Obrigatórios — Blackjack

Cobertura ≥ 90% no motor. Motor puro com sapato injetado.

## 1. Valores
- `handValue` para todas as combinações relevantes: A+6 (soft 17), A+6+10 (hard 17), A+A (soft 12), A+A+9 (soft 21), A+A+A+A+7 (soft 21), 10+6+A (hard 17), 5+5+A (soft 21).
- `isBlackjack`: A+K ✓; A+K após separar ✗; A+5+5 ✗.

## 2. Dealer
- S17: fica em A+6; H17: pede em A+6.
- Pede em 16, fica em 17 duro.
- Não tira cartas se todas as mãos estão rebentadas/desistidas/BJ pago.
- Peek com A e com 10; modo europeu sem peek.

## 3. Ações
- DOUBLE só com 2 cartas; após separar só se DAS; recebe exatamente 1 carta.
- SPLIT: mesmo valor (J+Q válido se `splitTensByValue`); limite de 4 mãos; Ases uma carta cada e sem resseparar; fichas insuficientes → inválido.
- SURRENDER só na primeira decisão da mão original; nunca após separar.
- HIT/STAND fora de vez → erro; 21 fecha a mão automaticamente.

## 4. Apostas e fichas
- Aposta < min, > max, não múltiplo de 10, > stack → erro.
- Débito no momento de apostar/dobrar/separar/seguro; crédito na liquidação.
- Recompra só com stack < minBet (e se permitida); incrementa `rebuys`.
- **Conservação**: soma de stacks + fichas em jogo + ganho/perda acumulado do dealer = constante inicial (+ recompras).
- Todos os valores inteiros em todas as fases.

## 5. Liquidação (matriz completa)
Para cada combinação — jogador {BJ, 21, 20, 17, rebentou, desistiu} × dealer {BJ, 21, 20, 17, rebentou} — resultado e pagamento corretos. Mais: dobrada, separada, seguro com/sem BJ do dealer, even money.

## 6. Segurança
- Vista de cada jogador em todas as fases: não contém a carta tapada antes de `holeRevealed`, nem nenhuma carta do sapato.
- `CardDealt` para a tapada não contém a carta.

## 7. Sapato
- 6 baralhos = 312 cartas, 24 de cada valor, `uid` únicos.
- Carta de corte: a ronda em curso acaba; baralha antes da seguinte; nunca baralha a meio de uma ronda.
- Sapato que esgotaria a meio de uma ronda (penetração alta + 7 jogadores + separações) → baralhar o descarte como reserva (caso extremo, testado).

## 8. Sessão
- Entrar a meio → `sittingOut` até à próxima `BETTING`.
- Sair a meio de uma mão → mãos ficam e liquidam normalmente; lugar livre no fim da ronda.
- Timeouts: apostas → fora da ronda; seguro → recusa; decisão → ficar.
- `GameResult` ordenado por saldo com recompras descontadas.

## 9. Guião
- Reproduzir `07-GUIAO-DE-SESSAO.md` com sapato fixo: cartas, ações, pagamentos e fichas finais exatas.

## 10. Validação estatística (bloqueante)
- **Simulação de 1 000 000 de mãos** com bots de estratégia básica (06), aposta fixa, regras por omissão:
  - Vantagem da casa medida entre **0,2% e 0,7%** (esperado ≈ 0,4% para 6 baralhos S17 DAS LS).
  - Frequência de blackjack do jogador ≈ 4,75% (±0,2 p.p.).
  - Frequência de rebentar do dealer com carta visível 6 ≈ 42% (±2 p.p.).
- **RNG**: teste qui-quadrado à distribuição das cartas por posição após 100 000 baralhadas.
- Os números medidos ficam registados no relatório de testes.
