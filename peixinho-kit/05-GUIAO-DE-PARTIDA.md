# Guião de Partida — Início jogado a jogada

Teste automático obrigatório com o **baralho fixo** abaixo. Configuração por omissão (reposição de 4, lago a pescar pela ordem do topo).

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio). 3 jogadores → 5 cartas cada. Começa a Ana.

## Distribuição
| Jogador | Mão |
|---|---|
| Ana | 7♠ 7♥ K♣ 3♦ 9♠ |
| Bruno | 7♦ K♥ K♠ 2♣ 5♥ |
| Carla | 7♣ 3♠ 3♥ 4♥ 9♥ |

**Lago** (37 cartas), do topo para baixo: 4♣, K♦, 9♦, 2♦, 5♠, 6♣, Q♠, J♥, 8♠, 8♥, 10♣, A♠, … (restantes em qualquer ordem)

---

## Vez 1 — Ana
1. Pede **Setes** ao Bruno → Bruno tem 7♦ → entrega **1**. Ana: 7♠ 7♥ 7♦ K♣ 3♦ 9♠.
2. Continua. Pede **Setes** à Carla → Carla tem 7♣ → entrega **1**.
3. **Peixinho de Setes!** Ana pousa-o. Mão: K♣ 3♦ 9♠. Joga outra vez.
4. Pede **Reis** à Carla → **"Vai à pesca!"** → pesca **4♣** (não é Rei) → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | K♣ 3♦ 9♠ 4♣ | K♥ K♠ 2♣ 5♥ | 3♠ 3♥ 4♥ 9♥ |
| Peixinhos | 7 | — | — |
| Lago | 36 | | |

## Vez 2 — Bruno
1. Pede **Reis** à Ana → entrega K♣. Bruno: K♥ K♠ K♣ 2♣ 5♥.
2. Pede **Reis** à Carla → **"Vai à pesca!"** → pesca **K♦**, que é o valor pedido: mostra a todos.
3. **Peixinho de Reis!** Pousa. Mão: 2♣ 5♥. Joga outra vez (por ter pescado o pedido e por ter feito peixinho).
4. Pede **Cincos** à Carla → **"Vai à pesca!"** → pesca **9♦** → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 3♦ 9♠ 4♣ | 2♣ 5♥ 9♦ | 3♠ 3♥ 4♥ 9♥ |
| Peixinhos | 7 | K | — |
| Lago | 34 | | |

## Vez 3 — Carla
1. Pede **Treses** à Ana → entrega 3♦. Carla: 3♠ 3♥ 3♦ 4♥ 9♥.
2. Pede **Noves** à Ana → entrega 9♠. Ana fica só com 4♣.
3. Pede **Quatros** à Ana → entrega 4♣. **Ana fica sem cartas → vai buscar 4 ao lago**: 2♦ 5♠ 6♣ Q♠.
4. Pede **Noves** ao Bruno → entrega 9♦. Carla: 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦.
5. Pede **Treses** ao Bruno → **"Vai à pesca!"** → pesca **J♥** → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 2♦ 5♠ 6♣ Q♠ | 2♣ 5♥ | 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦ J♥ |
| Peixinhos | 7 | K | — |
| Lago | 29 | | |

## Vez 4 — Ana
1. Pede **Cincos** ao Bruno → entrega 5♥. Ana: 2♦ 5♠ 5♥ 6♣ Q♠.
2. Pede **Doises** ao Bruno → entrega 2♣. **Bruno fica sem cartas → vai buscar 4**: 8♠ 8♥ 10♣ A♠.
3. Ana continua a vez… (o guião automático para aqui e verifica o estado)

**Estado esperado no fim do guião**
| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 2♦ 2♣ 5♠ 5♥ 6♣ Q♠ | 8♠ 8♥ 10♣ A♠ | 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦ J♥ |
| Peixinhos | 7 | K | — |
| Lago | 25 | | |
| Vez de | **Ana** | | |

Conservação: 6 + 4 + 9 + 25 + 8 (dois peixinhos) = **52** ✓

## Final ilustrativo (não automatizado)
A partida segue até aos 13 peixinhos. Exemplo de fecho: Ana 5 · Bruno 4 · Carla 4 → **Ana ganha**.
