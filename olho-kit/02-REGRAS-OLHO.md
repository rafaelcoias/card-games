# Regras do Olho — Especificação (v1.3 — fechada)

## 1. Objetivo
Ficar **sem cartas o mais cedo possível**. A ordem de saída define os cargos do jogo seguinte.

## 2. Material e jogadores
- Baralho de **54 cartas**: 52 + 2 jokers.
- **3 a 8 jogadores**.

## 3. Hierarquia
`3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 < Joker`
- Naipes não contam.
- O **2** é a carta normal mais alta e tem poder de corte reduzido (ver 8.2).
- O **Joker** bate tudo, incluindo os 2s.

## 4. Cargos
Atribuídos pela ordem em que os jogadores ficam sem cartas.

| Jogadores | Cargos (1.º → último) |
|---|---|
| 3 | Presidente · Neutro · Olho |
| 4 | Presidente · Vice-Presidente · Vice-olho · Olho |
| 5+ | Presidente · Vice-Presidente · Neutro(s) · Vice-olho · Olho |

No 1.º jogo da sessão ainda não há cargos.

## 5. Distribuição
- Distribuem-se **todas as 54 cartas**, uma a uma.
- Se a divisão não for certa, **alguns jogadores ficam com mais uma carta**. A distribuição começa num jogador **sorteado** em cada jogo, por isso quem fica com a carta a mais é aleatório.

## 6. Troca de cartas (a partir do 2.º jogo)
Depois de distribuir e antes de jogar:
- O **Olho** entrega ao **Presidente** as suas **2 melhores cartas**, escolhidas automaticamente pelo servidor pela hierarquia (Joker, 2, Ás, Rei…).
- O **Presidente** devolve ao Olho **2 cartas à sua escolha**, com temporizador (20 s; ao expirar, devolve as 2 mais baixas).
- O **Vice-olho** entrega ao **Vice-Presidente** a **melhor carta**; o Vice-Presidente devolve **1 à escolha**.
- Com 3 jogadores só há a troca Presidente ↔ Olho.
- As duas trocas decorrem em simultâneo.
- As cartas trocadas só são vistas pelos dois envolvidos.

## 7. Quem começa
- **1.º jogo:** quem tem o **3♣** (não é obrigado a jogá-lo).
- **Jogos seguintes:** o **Olho** do jogo anterior.

## 8. A vaza
### 8.1 Abrir
- Quem abre joga **uma combinação**: carta única, par, tripla ou quádrupla (cartas do mesmo valor), ou um joker.

### 8.2 Seguir
- Os jogadores seguintes (sentido dos ponteiros do relógio) jogam **o mesmo número de cartas** com valor **igual ou superior**, ou **passam**.
- **Quem passa já não volta a jogar nessa vaza.**

#### Bater com 2s (menos cartas)
Os 2s podem bater uma combinação **com menos cartas** do que ela tem:

| Combinação na mesa | 2s precisos |
|---|---|
| Carta única | 1 ou mais dois |
| Par | 1 ou mais dois |
| Tripla | 2 ou mais dois |
| Quádrupla | impossível — a quádrupla corta (8.4) |

- Regra geral: para bater uma combinação de **N** cartas (N ≤ 3) são precisos **pelo menos máx(1, N − 1)** dois. Pode usar-se mais (ex.: dois 2s sobre um 9).
- Os 2s também podem ser jogados da forma normal (par de 2s sobre par de Ases).
- Depois de um corte com 2s, a vaza continua com o **número de 2s jogados** como nova quantidade (ex.: um 2 sobre um par → a vaza passa a ser de cartas únicas).

#### 2s sobre 2s
Quando a mesa tem 2s, só se pode seguir com:
| Jogada | Efeito |
|---|---|
| **Mais 2s** do que os que estão na mesa (ex.: 2 dois sobre 1 dois) | bate; a quantidade da vaza passa a ser o nº de 2s jogados |
| **O mesmo nº de 2s** (ex.: 1 dois sobre 1 dois) | carta igual → salta o seguinte (8.3) |
| **Joker** | corta |

Exemplo: Ana corta um par de Reis com **um 2** → Bruno joga **dois 2s** → Carla só pode seguir com **três 2s** (impossível, só há 4 no baralho e já saíram 3) ou com um **joker**.

#### Joker
- O **joker** joga-se **sozinho** e **corta qualquer coisa**: carta única, par, tripla, quádrupla ou 2s.

### 8.3 Carta igual → salto
- Se alguém joga **o mesmo valor** que a jogada anterior (ex.: um 7 sobre um 7), o **jogador seguinte é saltado**…
- …**a não ser que tenha também essa carta** (o mesmo valor, na mesma quantidade) **e a jogue**. Nesse caso não é saltado, e é o seguinte a ele que fica sujeito ao salto.
- Quem escapa só o pode fazer com a mesma carta; não pode jogar mais alto em vez disso.
- Ser saltado só faz perder aquela vez; o jogador continua na vaza.
- Opção configurável `sameCardEscape` (por omissão **ligada**): se desligada, o seguinte é sempre saltado, mesmo tendo a carta.

### 8.4 Cortar
"Cortar" fecha a vaza de imediato, e **quem cortou abre a seguinte**.
- **Joker:** corta sempre.
- **Quádrupla jogada de uma vez** (4 cartas iguais na mesma jogada, incluindo quatro 2s): **corta sempre**, como o joker. Ninguém a pode bater.
- **Quatro iguais seguidos em várias jogadas** (ex.: 7, 7, 7, 7 de jogadores diferentes, ou par + par): corta. Opção configurável `fourOfAKindCuts`, por omissão **ligada**. Um joker pelo meio interrompe a sequência.
- Os **2s** batem com menos cartas (8.2), mas não fecham a vaza: ainda podem levar com um joker.

### 8.5 Fechar a vaza sem corte
- Quando **todos os outros jogadores ainda em jogo passaram**, a vaza fecha e **quem jogou por último abre a seguinte**.
- Se quem devia abrir já não tem cartas, abre o seguinte em jogo no sentido dos ponteiros do relógio.

### 8.6 Primeira vaza de cada jogo
- **Não se pode jogar 2 nem joker**. Opção configurável `firstTrickNoPower`, por omissão ligada.

## 9. Acabar
- Quem fica sem cartas sai e recebe a próxima posição livre.
- **Acabar com um 2 ou joker:** opção configurável `allowFinishWithPower`, por omissão **permitido**.
  - Se desligada, **a jogada é proibida**: não se pode jogar um 2 ou joker que deixe a mão vazia.
  - Quem só tiver 2s/jokers fica **bloqueado**: passa sempre e, se lhe calhar abrir, a abertura passa ao seguinte.
  - Se todos os jogadores com cartas estiverem bloqueados, o jogo termina: ficam com as últimas posições, **melhor quem tiver menos cartas**; empate → sorteio.
- Quando só resta um jogador com cartas, ele é o **Olho** e o jogo termina.
- Pausa de resumo, nova distribuição, troca, e o jogo seguinte começa.

## 10. Opções configuráveis da sala
| Opção | Por omissão |
|---|---|
| `allowFinishWithPower` — pode acabar-se com 2 ou joker | sim |
| `fourOfAKindCuts` — quatro iguais seguidos em várias jogadas cortam (a quádrupla de uma vez corta sempre) | sim |
| `sameCardEscape` — quem tem a mesma carta escapa ao salto jogando-a | sim |
| `firstTrickNoPower` — na primeira vaza de cada jogo não há 2 nem joker | sim |
| `turnTimeoutMs` / `escapeTimeoutMs` / `exchangeTimeoutMs` | 30 s / 5 s / 20 s |
| `displayName` | "Olho" |

## 11. Sessão
- Jogos seguidos até o **anfitrião terminar**.
- Pontos por jogo: Presidente +2 · Vice-Presidente +1 · Neutro 0 · Vice-olho −1 · Olho −2.
- No fim da sessão, classificação por pontos.

## 12. Temporizadores (configuráveis na sala)
| Temporizador | Por omissão | Ao expirar |
|---|---|---|
| Jogada | 30 s | Passa; se for ele a abrir, joga a carta mais baixa permitida |
| Escapar ao salto | 5 s | É saltado |
| Troca | 20 s | Devolve as cartas mais baixas |
