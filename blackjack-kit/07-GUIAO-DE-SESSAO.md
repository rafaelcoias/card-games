# Guião de Sessão — Exemplo Completo

Tem de ser reproduzido por teste automático com **sapato fixo** (as cartas saem pela ordem indicada).

**Mesa:** Ana (lugar 1), Bruno (lugar 2), Carla (lugar 3). Dealer "Rui".
**Configuração por omissão:** 6 baralhos, S17, PEEK, 3:2, DAS, até 4 mãos, desistência ativa, seguro ativo.
**Stack inicial:** 1000 cada.

---

## Ronda 1 — separações, dobrar e blackjack
**Apostas:** Ana 50 · Bruno 100 · Carla 20

**Distribuição:** Ana 10♠ · Bruno 8♦ · Carla A♥ · Dealer **9♠** · Ana 6♥ · Bruno 8♣ · Carla K♣ · Dealer [tapada 7♦]

| | Cartas | Total |
|---|---|---|
| Ana | 10♠ 6♥ | 16 |
| Bruno | 8♦ 8♣ | 16 (par) |
| Carla | A♥ K♣ | **Blackjack** |
| Dealer | 9♠ + ? | 9 |

Carta visível 9 → sem seguro, sem peek.

**Ana:** 16 vs 9 → Pede → 3♣ → 19 → Fica.

**Bruno:** Separa 8s (+100).
- Mão A: 8♦ + 2♠ = 10 → Dobra (+100) → K♥ → **20**.
- Mão B: 8♣ + 8♥ → Resepara (+100).
  - Mão B: 8♣ + 5♦ = 13 → Pede → Q♠ → **23, rebenta**.
  - Mão C: 8♥ + 10♦ = **18** → Fica.
- Em jogo no total: 200 + 100 + 100 = 400.

**Carla:** blackjack, não joga.

**Dealer:** revela 7♦ → 16 → pede → 4♣ → **20** → fica.

| Jogador | Mão | Resultado | Líquido |
|---|---|---|---|
| Ana | 19 | perde | −50 |
| Bruno A | 20 (dobrada, 200) | empate | 0 |
| Bruno B | 23 | perde | −100 |
| Bruno C | 18 | perde | −100 |
| Carla | BJ | 3:2 | +30 |

**Fichas:** Ana 950 · Bruno 800 · Carla 1030

---

## Ronda 2 — seguro, even money e blackjack do dealer
**Apostas:** Ana 100 · Bruno 50 · Carla 40

**Distribuição:** Ana 10♣ · Bruno 9♠ · Carla A♠ · Dealer **A♦** · Ana 10♥ · Bruno 2♦ · Carla Q♦ · Dealer [tapada K♠]

**Seguro** (Ás visível):
- Ana (20) aceita seguro: 50.
- Bruno (11) recusa.
- Carla tem blackjack → oferecem even money → aceita → recebe 40 já, mão fechada.

**Peek:** dealer tem blackjack → revela K♠ → ronda termina. Bruno nem chega a dobrar o 11 (é para isso que serve o peek: não perde a dobra).

| Jogador | Resultado | Líquido |
|---|---|---|
| Ana | perde 100, seguro paga 2:1 (+100) | 0 |
| Bruno | perde | −50 |
| Carla | even money | +40 |

**Fichas:** Ana 950 · Bruno 750 · Carla 1070

---

## Ronda 3 — mão mole dobrada e dealer rebenta
**Apostas:** Ana 20 · Bruno 100 · Carla 50

**Distribuição:** Ana 7♠ · Bruno A♣ · Carla 9♥ · Dealer **6♥** · Ana 5♣ · Bruno 7♥ · Carla 7♣ · Dealer [tapada 10♣]

**Ana:** 12 vs 6 → Fica (estratégia básica: S).
**Bruno:** soft 18 vs 6 → Dobra (+100) → 2♣ → **soft 20**.
**Carla:** 16 vs 6 → Pede (contra a estratégia básica: a dica diria "Ficar") → K♦ → **26, rebenta**.
**Dealer:** revela 10♣ → 16 → pede → Q♥ → **26, rebenta**.

| Jogador | Resultado | Líquido |
|---|---|---|
| Ana | ganha 1:1 | +20 |
| Bruno | ganha 1:1 sobre 200 | +200 |
| Carla | rebentou antes do dealer → perde | −50 |

**Fichas:** Ana 970 · Bruno 950 · Carla 1020

---

## Fecho da sessão (anfitrião termina)
| Posição | Jogador | Fichas | Saldo |
|---|---|---|---|
| 1 | Carla | 1020 | **+20** |
| 2 | Ana | 970 | −30 |
| 3 | Bruno | 950 | −50 |

`GameResult`: `PLACED` por esta ordem, `score` = saldo.

## Casos extra a cobrir nos testes (fora do guião)
- Desistência de 16 vs 10 (devolve metade).
- Separar Ases: uma carta cada, sem resseparar, A+K depois de separar paga 1:1.
- Carta de corte a meio de uma ronda → a ronda acaba normalmente, baralha antes da seguinte.
- Jogador que entra a meio da sessão: fica de fora até à fase de apostas seguinte.
