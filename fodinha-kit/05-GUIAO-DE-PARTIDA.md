# Guião de Partida — Exemplo Completo

Serve para validar a compreensão das regras e **tem de ser reproduzido por um teste automático** com as cartas indicadas (injeção de baralho fixo).

**Mesa:** Ana, Bruno, Carla, Duarte (por esta ordem, sentido dos ponteiros do relógio).
**Configuração:** `maxPoints = 5`, `maxHandSize = 5`, restantes por omissão. Quem começa a ronda abre todas as vazas dessa ronda.
**Sorteio inicial:** Ana começa.

## Calendário de rondas
| Ronda | Cartas | Começa |
|---|---|---|
| 1 | 1 (às cegas) | Ana |
| 2 | 2 | Bruno |
| 3 | 3 | Carla |
| 4 | 4 | Duarte |
| 5 | 5 | Ana |
| 6 | 4 | Bruno |
| 7 | 3 | Carla |
| 8 | 2 | Duarte |
| 9 | 1 (às cegas) | Ana |
| 10 | 2 | Bruno |

---

## Ronda 1 — 1 carta, às cegas, vale 1
**Cartas:** Ana 7♣ · Bruno K♠ · Carla 3♥ · Duarte K♦

**O que cada um vê:**
| Jogador | Vê | Não vê |
|---|---|---|
| Ana | K♠, 3♥, K♦ | a sua (7♣) |
| Bruno | 7♣, 3♥, K♦ | a sua (K♠) |
| Carla | 7♣, K♠, K♦ | a sua (3♥) |
| Duarte | 7♣, K♠, 3♥ | a sua (K♦) |

**Apostas** (Ana → Bruno → Carla → Duarte):
- Ana vê dois Reis: só ganharia com um Ás. Aposta **0**.
- Bruno vê um Rei: se o dele for Rei, empata; só ganha com Ás. Aposta **0**.
- Carla vê dois Reis. Aposta **0**.
- Duarte vê um Rei. Aposta **0**.

Soma das apostas: 0 de 1.

**Vaza:** 7♣, K♠, 3♥, K♦ → empate nos Reis → **ninguém ganha**.

**Resultado:** todos apostaram 0 e fizeram 0 → **ninguém falhou**. Acumulado passa a 1.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 0 | 0 | 0 | 0 |

➡️ Ronda 2 vale **2**.

---

## Ronda 2 — 2 cartas, vale 2
**Mãos:** Bruno A♦ 4♠ · Carla 9♥ 9♣ · Duarte Q♠ 5♦ · Ana A♠ 2♣

**Apostas** (Bruno → Carla → Duarte → Ana): Bruno **1**, Carla **0**, Duarte **1**, Ana **1**. Soma 3 de 2 vazas (alguém vai falhar).

**Vaza 1** (abre Bruno): Bruno 4♠, Carla 9♥, Duarte Q♠, Ana A♠ → **Ana ganha**.
**Vaza 2** (abre Bruno): Bruno A♦, Carla 9♣, Duarte 5♦, Ana 2♣ → **Bruno ganha** (Ás de Ouros).

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Bruno | 1 | 1 | ✓ |
| Carla | 0 | 0 | ✓ |
| Duarte | 1 | 0 | ✗ +2 |
| Ana | 1 | 1 | ✓ |

Acumulado volta a 0.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 0 | 0 | 0 | 2 |

➡️ Ronda 3 vale **1**.

---

## Ronda 3 — 3 cartas, vale 1
**Mãos:** Carla J♥ 6♠ 2♦ · Duarte J♠ 10♣ 3♣ · Ana 8♦ 7♥ 4♦ · Bruno K♥ 5♠ 3♠

**Apostas** (Carla → Duarte → Ana → Bruno): Carla **1**, Duarte **1**, Ana **0**, Bruno **1**. Soma 3 de 3.

**Vaza 1** (abre Carla): Carla J♥, Duarte J♠, Ana 8♦, Bruno 5♠ → empate nos Valetes → **ninguém**.
**Vaza 2** (abre Carla): Carla 2♦, Duarte 10♣, Ana 4♦, Bruno K♥ → **Bruno ganha**.
**Vaza 3** (abre Carla): Carla 6♠, Duarte 3♣, Ana 7♥, Bruno 3♠ → **Ana ganha** (contra a vontade dela).

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Carla | 1 | 0 | ✗ +1 |
| Duarte | 1 | 0 | ✗ +1 |
| Ana | 0 | 1 | ✗ +1 |
| Bruno | 1 | 1 | ✓ |

Nota: só se ganharam 2 vazas em 3 (uma empatou).

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 1 | 0 | 1 | 3 |

---

## Rondas 4 a 8 — resumo
| Ronda | Cartas | Começa | Vale | Falharam | Acumulado depois | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 4 | Duarte | 1 | Bruno | 0 | 1 | 1 | 1 | 3 |
| 5 | 5 | Ana | 1 | Ana | 0 | 2 | 1 | 1 | 3 |
| 6 | 4 | Bruno | 1 | ninguém | 1 | 2 | 1 | 1 | 3 |
| 7 | 3 | Carla | **2** | Carla | 0 | 2 | 1 | 3 | 3 |
| 8 | 2 | Duarte | 1 | todos | 0 | 3 | 2 | 4 | 4 |

---

## Ronda 9 — 1 carta, às cegas, vale 1
**Cartas:** Ana 10♥ · Bruno 4♣ · Carla Q♦ · Duarte 2♠

**Apostas** (Ana → Bruno → Carla → Duarte):
- Ana vê 4♣, Q♦, 2♠: precisa de K ou Ás. Aposta **0**.
- Bruno vê 10♥, Q♦, 2♠: aposta **0**.
- Carla vê 10♥, 4♣, 2♠: a mais alta que vê é um 10, arrisca. Aposta **1**.
- Duarte vê 10♥, 4♣, Q♦: acha que tem hipótese. Aposta **1**.

**Vaza:** 10♥, 4♣, Q♦, 2♠ → **Carla ganha**.

| Jogador | Aposta | Fez | |
|---|---|---|---|
| Ana | 0 | 0 | ✓ |
| Bruno | 0 | 0 | ✓ |
| Carla | 1 | 1 | ✓ |
| Duarte | 1 | 0 | ✗ +1 |

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Pontos | 3 | 2 | 4 | **5** |

## Fim
Duarte atinge 5 → **o jogo termina**.
- **Perdeu:** Duarte
- **Sobreviveram:** Ana, Bruno, Carla

### Variante do final (para testar múltiplos perdedores)
Se na ronda 9 a Carla tivesse apostado **0** (e ganho a vaza na mesma), falhava também: Carla 5, Duarte 5 → **perdem os dois**; Ana e Bruno sobrevivem.
