# Regras do Pepe Rápido — Especificação (v1.1)

> As regras abaixo descrevem a configuração **por omissão**. Tudo o que está marcado com ⚙️ pode ser mudado na sala (ver §9).

## 1. Objetivo
Ser o primeiro a ficar **sem cartas nenhumas** (colunas e reserva).

## 2. Material e jogadores
- **2 jogadores.**
- ⚙️ **54 cartas** (52 + 2 jokers) → **27 para cada**. Sem jokers: **52 cartas → 26 para cada** (reserva de 11).

## 3. Preparação de uma ronda
Cada jogador baralha as suas cartas e monta, à sua frente:

**5 colunas** com 1, 2, 3, 4 e 5 cartas (15 no total). Só a carta de cima de cada coluna está virada para cima; as outras ficam viradas para baixo.

```
 [1]   [2]   [3]   [4]   [5]
  ▲     ▲     ▲     ▲     ▲      ← carta de cima, visível
        ▫     ▫     ▫     ▫      ← cartas tapadas
              ▫     ▫     ▫
                    ▫     ▫
                          ▫
```

O que sobra fica na **reserva**, virada para baixo (com 27 cartas: 12 na reserva).

Se um jogador tiver **menos de 15 cartas**, preenche as colunas pela ordem (1, 2, 3…) com o que tem e **fica sem reserva** (09 #4).

## 4. Começar
- Contagem decrescente 3-2-1 e os dois jogadores **viram a carta de cima da sua reserva** para o centro, ao mesmo tempo. Ficam **dois montes centrais**, um de cada lado.
- A partir daqui **não há vezes**: cada um joga o mais depressa que conseguir.

## 5. Jogar
### 5.1 Para os montes centrais
- Pega-se na carta de cima de uma coluna e põe-se em **qualquer um dos dois montes** se for:
  - ⚙️ **acima e abaixo** (por omissão): uma acima ou uma abaixo da carta do topo (sobre um 7 pode ir um 6 ou um 8);
  - ⚙️ **só acima**: exatamente uma acima (sobre um 7 só um 8).
- Naipes não contam.
- Ordem: A, 2, 3, …, 10, J, Q, K. ⚙️ O **Ás e o Rei ligam-se** (sobre um K pode ir um A; e, no modo acima e abaixo, sobre um A pode ir um K).
- Quando uma carta sai, a carta de baixo dessa coluna **vira para cima**.

### 5.2 Joker ⚙️ (só quando o baralho tem jokers)
- O joker vale **qualquer carta**: pode ir para qualquer monte central, por cima de qualquer carta.
- Depois de um joker no centro, a carta seguinte nesse monte pode ser **qualquer uma**.

### 5.3 Agrupar nas colunas
- A carta de cima de uma coluna pode ir para cima de outra coluna **com uma carta do mesmo valor** (ex.: um 9 sobre um 9). Assim liberta-se a carta de baixo.
- ⚙️ Agrupar pode ser desligado.
- O **joker agrupa com tudo**: pode ir para cima de qualquer coluna, e qualquer carta pode ir para cima de um joker numa coluna.

### 5.4 Coluna vazia
- ⚙️ Quando uma coluna fica vazia, o jogador pode pôr lá a carta de cima de outra coluna.

### 5.5 Corrida
- Se os dois jogadores puserem carta no mesmo monte ao mesmo tempo, **vale a que chega primeiro** ao servidor. A outra volta para a coluna.

## 6. Ninguém consegue jogar
- Quando nenhum dos dois tem jogada possível, os dois carregam em **"Virar"** e cada um vira a carta de cima da sua reserva para o seu monte central (3-2-1 como no início).
- Se um jogador não tiver reserva, vira só o outro (para o monte do lado de quem tem reserva, ou para os dois montes alternadamente — 09 #6).
- Se nenhum dos dois tiver reserva e ninguém conseguir jogar: ver 09 #7.

## 7. Fim de ronda
- Quando um jogador **esvazia as 5 colunas**, a ronda acaba logo.
- Esse jogador **toca num dos dois montes centrais** para ficar com ele. ⚙️ Por omissão **não sabe quantas cartas tem cada monte** e escolhe o que acha que tem menos. Com a opção "mostrar contagens" ligada, vê o número de cada monte (a escolha deixa de ser às cegas).
- O outro jogador fica com o **outro monte**.
- Cada jogador junta **o monte que levou + a sua reserva + (o outro) as cartas que ainda tinha nas colunas**, baralha, e monta a ronda seguinte (§3).

## 8. Fim do jogo
- Ganha o primeiro a ficar **sem cartas nenhumas**.
- Isso acontece quando um jogador, numa ronda **sem reserva** (já só com as colunas), esvazia as colunas: não há monte para levar e ganha (09 #4).

## 9. Opções configuráveis da sala ⚙️
Definidas por quem cria a sala, visíveis a ambos antes de começar e fixas durante a partida.

### Regras
| Opção | Valores | Por omissão |
|---|---|---|
| `direction` — sentido das jogadas | **Acima e abaixo** / Só acima | Acima e abaixo |
| `jokers` — baralho com jokers | **Sim (54)** / Não (52) | Sim |
| `aceKingWrap` — Ás e Rei ligam-se | **Sim** / Não | Sim |
| `grouping` — agrupar cartas iguais nas colunas | **Sim** / Não | Sim |
| `moveToEmpty` — mover para coluna vazia | **Sim** / Não | Sim |

### Informação visível
| Opção | Valores | Por omissão |
|---|---|---|
| `showCentreCounts` — mostrar nº de cartas de cada monte central | Sim / **Não** | Não (escolha às cegas) |
| `showOwnReserveCount` — ver quantas cartas tens na reserva | **Sim** / Não | Sim |
| `showOpponentCounts` — ver quantas cartas o adversário tem (colunas + reserva) | Sim / **Não** | Não (só se vê se tem reserva) |

### Ritmo
| Opção | Valores | Por omissão |
|---|---|---|
| `countdownMs` — contagem antes de virar | 1–5 s | 3 s |
| `autoFlip` — virar sozinho quando ninguém consegue jogar | Sim / **Não** | Não (os dois carregam em "Virar") |
| `autoFlipDelayMs` — espera antes do virar automático | 1–5 s | 2 s |

### Partida
| Opção | Valores | Por omissão |
|---|---|---|
| `rematch` — botão de revanche no fim | **Sim** / Não | Sim |

### Predefinições rápidas
Para não obrigar a mexer em tudo, a sala oferece três predefinições que preenchem as opções acima (e podem ser afinadas depois):

| Predefinição | Configuração |
|---|---|
| **Clássico** (por omissão) | acima e abaixo · com jokers · Ás↔Rei · agrupar · contagens escondidas |
| **Puro** | acima e abaixo · sem jokers · Ás↔Rei · agrupar · contagens escondidas |
| **Iniciante** | só acima · com jokers · Ás↔Rei · agrupar · mostrar contagens · virar automático |
