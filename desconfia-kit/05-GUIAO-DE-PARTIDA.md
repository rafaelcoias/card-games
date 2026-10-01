# Guião de Partida — Exemplo Completo

Teste automático obrigatório com o **baralho reduzido** abaixo (17 cartas, 1 joker), injetado só para teste. A janela de desconfiança é simulada pelas ações indicadas.

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio).

## Distribuição
| Jogador | Mão |
|---|---|
| Ana | 3♣ 3♥ 7♠ 7♦ K♠ JOKER |
| Bruno | 3♦ 7♥ 9♣ 9♦ Q♥ |
| Carla | 3♠ 7♣ 9♥ K♦ K♥ Q♠ |

Ana tem o **3♣ → começa**.

---

### Jogada 1 — Ana
Pousa **3♣ 3♥** e anuncia **"Dois Treses"** (verdade). Ninguém desconfia.
Pilha: 2 cartas · valor: Treses

### Jogada 2 — Bruno
Tem de anunciar Treses. Pousa **3♦ 9♣** e anuncia **"Dois Treses"** (mentira).
**Carla: "Desconfia!"** → revela 3♦ 9♣ → **mentira** → Bruno leva a pilha (4 cartas).

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 7♠ 7♦ K♠ JOKER | 7♥ 9♦ Q♥ 3♣ 3♥ 3♦ 9♣ | 3♠ 7♣ 9♥ K♦ K♥ Q♠ |
| Cartas | 4 | 7 | 6 |

Bruno tem três Treses (o 3♠ está com a Carla), por isso não há peixinho. **Carla acertou → recomeça.**

### Jogada 3 — Carla
Pousa **K♦ K♥** e anuncia **"Dois Reis"** (verdade).
**Bruno: "Desconfia!"** → revela K♦ K♥ → **verdade** → Bruno leva a pilha (2 cartas).
**Carla ganhou a desconfiança → recomeça.**

### Jogada 4 — Carla
Pousa **9♥ Q♠** e anuncia **"Dois Noves"** (mentira). Ninguém desconfia.

### Jogada 5 — Ana
Tem de anunciar Noves e não tem nenhum. Pousa **JOKER** e anuncia **"Um Nove"** (verdade, graças ao joker).
**Bruno: "Desconfia!"** → revela JOKER → **verdade** → Bruno leva a pilha (3 cartas: 9♥ Q♠ JOKER).
Nota: a mentira da Carla (jogada 4) nunca é revelada; só a última jogada é verificada.
**Ana ganhou → recomeça.**

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 7♠ 7♦ K♠ | 7♥ 9♦ Q♥ 3♣ 3♥ 3♦ 9♣ K♦ K♥ 9♥ Q♠ JOKER | 3♠ 7♣ |
| Cartas | 3 | 12 | 2 |

### Jogada 6 — Ana
Pousa **7♠ 7♦** e anuncia **"Dois Setes"** (verdade). Ninguém desconfia.

### Jogada 7 — Bruno
Pousa **7♥** e anuncia **"Um Sete"** (verdade). Ninguém desconfia.

### Jogada 8 — Carla
Pousa **3♠** e anuncia **"Um Sete"** (mentira; guarda o 7♣).
**Ana: "Desconfia!"** → revela 3♠ → **mentira** → Carla leva a pilha (4 cartas: 7♠ 7♦ 7♥ 3♠).
Carla fica com 7♣ 7♠ 7♦ 7♥ 3♠ → **peixinho de Setes sai do jogo**. Carla fica só com **3♠**.
**Ana acertou → recomeça.**

| | Ana | Bruno | Carla | Fora de jogo |
|---|---|---|---|---|
| Mão | K♠ | 11 cartas | 3♠ | 7♠ 7♦ 7♥ 7♣ |

### Jogada 9 — Ana (última carta)
Pousa **K♠** e anuncia **"Um Rei"** (verdade). A mão fica vazia → janela de 3 s.
**Bruno: "Desconfia!"** → revela K♠ → **verdade** → Bruno leva a pilha (1 carta).
Ana sem cartas e jogada confirmada → **Ana ganha**.

## Estado final
| | Ana | Bruno | Carla | Fora de jogo |
|---|---|---|---|---|
| Cartas | **0** | 12 | 1 | 4 |

Conservação: 0 + 12 + 1 + 4 = **17** ✓

## Variante a testar
Se na jogada 9 a Ana tivesse pousado o K♠ a anunciar outro valor numa pilha com valor fixo (ex.: "Um Sete" sobre Setes) e o Bruno desconfiasse, a Ana levava a pilha e o jogo continuava.
