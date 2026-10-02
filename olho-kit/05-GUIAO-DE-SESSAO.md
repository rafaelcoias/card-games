# Guião de Sessão — Dois jogos com troca

Teste automático obrigatório com **baralho reduzido** injetado (12 cartas por jogo, 3 por jogador), só para teste. Opções por omissão.

**Mesa:** Ana, Bruno, Carla, Duarte (sentido dos ponteiros do relógio). 4 jogadores → cargos P · VP · VO · O.

---

## Jogo 1

| Jogador | Mão |
|---|---|
| Ana | 3♣ 7♠ 2♥ |
| Bruno | 7♥ 9♦ K♠ |
| Carla | 5♣ 7♦ JOKER |
| Duarte | 4♦ 7♣ Q♥ |

Ana tem o 3♣ → **começa**. Primeira vaza: sem 2 nem joker.

### Vaza 1 — saltos e quatro iguais
1. Ana abre com **3♣**.
2. Bruno joga **7♥**.
3. Carla joga **7♦**, igual ao anterior → Duarte vai ser saltado…
4. …mas Duarte tem um 7 → **escapa** com **7♣** → agora a Ana vai ser saltada…
5. …mas a Ana tem um 7 → **escapa** com **7♠** → **quatro Setes seguidos → corta!**
6. A Ana abre a vaza seguinte.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Mão | 2♥ | 9♦ K♠ | 5♣ JOKER | 4♦ Q♥ |

### Vaza 2 — acabar com um 2 e joker a cortar
1. Ana joga **2♥** → fica sem cartas → **1.º lugar** (acabar com 2 é permitido por omissão).
2. Bruno passa (só um joker bate um 2).
3. Carla joga **JOKER** → **corta**. A Carla abre a seguinte.

### Vaza 3
1. Carla joga **5♣** → fica sem cartas → **2.º lugar**.
2. Duarte joga **Q♥**.
3. Bruno joga **K♠**.
4. Duarte passa (só tem 4♦).
5. Todos os outros em jogo passaram → a vaza fecha → o Bruno abre.

### Vaza 4
1. Bruno joga **9♦** → fica sem cartas → **3.º lugar**.
2. Só o Duarte tem cartas → **último**.

**Cargos:** Ana **Presidente** · Carla **Vice-Presidente** · Bruno **Vice-olho** · Duarte **Olho**
**Pontos:** Ana +2 · Carla +1 · Bruno −1 · Duarte −2

---

## Jogo 2

### Distribuição
| Jogador (cargo) | Mão |
|---|---|
| Duarte (Olho) | JOKER A♠ 4♣ |
| Ana (Presidente) | 3♥ 6♦ 8♣ |
| Bruno (Vice-olho) | 2♠ 9♣ 5♥ |
| Carla (Vice-Presidente) | 10♦ J♠ 3♦ |

### Troca (simultânea)
- O servidor tira ao Duarte as 2 melhores: **JOKER, A♠** → Ana. A Ana escolhe devolver **3♥, 6♦** → Duarte.
- O servidor tira ao Bruno a melhor: **2♠** → Carla. A Carla escolhe devolver **3♦** → Bruno.

| | Ana | Bruno | Carla | Duarte |
|---|---|---|---|---|
| Mão | 8♣ JOKER A♠ | 9♣ 5♥ 3♦ | 10♦ J♠ 2♠ | 4♣ 3♥ 6♦ |

O **Olho (Duarte) começa**. Primeira vaza: sem 2 nem joker.

### Vaza 1
1. Duarte **3♥** · Ana **8♣** · Bruno **9♣** · Carla **10♦**.
2. Duarte passa · Ana **A♠** (joker proibido nesta vaza) · Bruno passa · Carla passa (o 2♠ é proibido na primeira vaza e o J♠ não chega).
3. Vaza fecha → a Ana abre.

### Vaza 2
1. Ana joga **JOKER** → fica sem cartas → **1.º lugar** e corta.
2. Como a Ana já não tem cartas, abre o seguinte em jogo: **Bruno**.

### Vaza 3
1. Bruno **3♦** · Carla **J♠** · Duarte passa · Bruno passa.
2. Vaza fecha → a Carla abre.

### Vaza 4
1. Carla joga **2♠** → fica sem cartas → **2.º lugar**.
2. Duarte passa · Bruno passa → vaza fecha → como a Carla já acabou, abre o seguinte em jogo: **Duarte**.

### Vaza 5
1. Duarte **4♣** · Bruno **5♥** → Bruno fica sem cartas → **3.º lugar**.
2. Só o Duarte tem cartas → **último**.

**Cargos:** Ana Presidente · Carla Vice-Presidente · Bruno Vice-olho · Duarte Olho

---

## Fim da sessão (anfitrião termina)
| Posição | Jogador | Pontos |
|---|---|---|
| 1 | Ana | **+4** |
| 2 | Carla | +2 |
| 3 | Bruno | −2 |
| 4 | Duarte | −4 |

## Variantes a testar sobre o jogo 1, vaza 1
- `sameCardEscape = false`: depois do 7♦ da Carla, o Duarte é saltado mesmo tendo o 7♣; joga a Ana.
- `fourOfAKindCuts = false`: os quatro Setes não cortam; a vaza continua e o Bruno (sem nenhum 7) é saltado; joga a Carla.
- `allowFinishWithPower = false`: na vaza 2 do jogo 1, a Ana só tem o 2♥ e não o pode jogar (esvaziaria a mão). Fica bloqueada: a abertura passa ao Bruno e a Ana passa em todas as vazas seguintes.

## Cortes com 2s (cenários isolados para teste)
| Na mesa | Jogada | Resultado |
|---|---|---|
| 9 | 1 dois | válido; a vaza continua com cartas únicas |
| Par de Reis | 1 dois | válido; a vaza passa a cartas únicas |
| Par de Reis | par de 2s | válido (forma normal) |
| Tripla de 8 | 1 dois | inválido |
| Tripla de 8 | 2 dois | válido; a vaza passa a pares |
| 9 | 2 dois | válido; a vaza passa a pares de 2s |
| Par de Reis | 3 dois | válido |
| (abrir) | quádrupla de 5 | corta de imediato; quem jogou abre a seguinte |
| 1 dois | 2 dois | válido; a vaza passa a pares de 2s |
| 1 dois | 1 dois | válido; carta igual → salta o seguinte |
| 2 dois | 3 dois | válido |
| 2 dois | 1 dois | inválido |
| 1 dois | JOKER | válido; corta |
| Tripla de Ases | JOKER | válido; corta |
