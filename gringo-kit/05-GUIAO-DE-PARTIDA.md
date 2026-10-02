# Guião de Partida — Exemplo Completo

Teste automático obrigatório com o baralho injetado abaixo. Para o guião ser curto, usa `gringoEnabled = true` e `gringoMinTurns = 1`. Restantes opções por omissão (poderes "Figuras", Rei vermelho −3).

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio). Começa a Ana.

## Distribuição
Grelhas (posições `[1][2]` em cima, `[3][4]` em baixo):

| Jogador | [1] | [2] | [3] | [4] | Espreita no início |
|---|---|---|---|---|---|
| Ana | 9♣ | K♥ | 2♦ | 7♠ | 2♦, 7♠ |
| Bruno | 4♥ | J♣ | A♠ | 10♦ | A♠, 10♦ |
| Carla | 6♦ | JOKER | Q♠ | 3♣ | Q♠, 3♣ |

**Baralho** (topo primeiro): 10♠, 5♥, J♦, 3♥, J♥, K♦, 2♣, … (resto em qualquer ordem)

---

### Vez 1 — Ana
1. Tira **10♠**. Descarta-a e usa o poder (espreitar uma carta de outro): espreita **Bruno [2] = J♣**. Só a Ana vê.
2. Janela de bater sobre o 10♠: o **Bruno bate** a posição [4] (sabe que é o 10♦) → **acertou** → Bruno [4] fica **vazia**.

### Vez 2 — Bruno
1. Tira **5♥**. Troca com a posição [2] (não sabe o que lá está) → sai o **J♣** para o descarte. Não há poder (a carta saiu por troca).
2. Janela sobre o J♣: a **Carla bate** a posição [1] às cegas → é o **6♦** → **errou**. O 6♦ é mostrado a todos e volta para Carla [1]; a Carla leva a carta de cima do baralho (**J♦**) numa posição nova **[5]**, sem a ver.

| | [1] | [2] | [3] | [4] | [5] |
|---|---|---|---|---|---|
| Bruno | 4♥ | 5♥ | A♠ | — | |
| Carla | 6♦ | JOKER | Q♠ | 3♣ | J♦ |

### Vez 3 — Carla
1. Tira **3♥**. Troca com a posição [3] (sabe que é a Q♠, 12 pontos) → sai a **Q♠**.
2. Janela sobre a Q♠: ninguém bate.

### Vez 4 — Ana: "Gringo!"
Todos já jogaram pelo menos uma vez → a Ana pode chamar.
1. Diz **"Gringo"** antes de tirar.
2. Tira **J♥**. Descarta-a e usa o poder (trocar às cegas): troca a sua posição **[1]** com a **Carla [2]**.
   - Ana [1] passa a ter o **JOKER**; Carla [2] passa a ter o **9♣**. Ninguém vê os valores.
3. Janela sobre o J♥: ninguém bate.
4. Falta jogar **uma vez** o Bruno e a Carla.

### Vez 5 — Bruno (última)
1. Tira **K♦** (Rei vermelho, −3). Podia descartá-lo e usar o poder do Rei, mas prefere ficar com ele: troca com a posição **[1]** → sai o **4♥**.
2. Ninguém bate.

### Vez 6 — Carla (última)
1. Tira **2♣**. Troca com a posição **[5]** → sai o **J♦**.
2. Ninguém bate. O jogo acaba.

---

## Revelação final
| Jogador | Grelha | Pontos |
|---|---|---|
| Ana | JOKER (0) · K♥ (−3) · 2♦ (2) · 7♠ (7) | **6** |
| Bruno | K♦ (−3) · 5♥ (5) · A♠ (1) · — | **3** |
| Carla | 6♦ (6) · 9♣ (9) · 3♥ (3) · 3♣ (3) · 2♣ (2) | **23** |

**Ganha o Bruno (3 pontos).** A Ana chamou Gringo sem saber que tinha um Rei vermelho escondido, e não chegou: perde, sem penalização extra.

## Variantes a testar
- `gringoEnabled = false`: as vezes continuam até o baralho acabar.
- `redKingValue = -1`: Ana 8, Bruno 5.
- `powerSet = "SETE_A_DEZ"`: o 10♠ da vez 1 passa a ter o poder "espreitar e decidir trocar"; o J♥ da vez 4 deixa de ter poder.
