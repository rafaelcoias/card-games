# Regras da Sueca — Especificação (v1.0)

## 1. Objetivo
Cada equipa tenta fazer **mais de 60 pontos** em cada mão. Ganha a partida a primeira equipa a chegar ao número de **jogos** definido (por omissão **4**).

## 2. Jogadores e equipas
- **Exatamente 4 jogadores reais.**
- 2 equipas de 2; os **parceiros sentam-se frente a frente**.
- Os jogadores **escolhem o lugar** na sala antes de começar (o lugar define a equipa).

```
            Norte
   Oeste            Este
            Sul
Equipa A: Norte + Sul     Equipa B: Este + Oeste
```

## 3. Baralho
- **40 cartas**: baralho francês sem os 8, 9 e 10 (e sem jokers).

## 4. Ordem e pontos (em cada naipe, da mais forte para a mais fraca)
| Carta | Pontos |
|---|---|
| Ás | 11 |
| 7 (bisca/manilha) | 10 |
| Rei | 4 |
| Valete | 3 |
| Dama | 2 |
| 6 · 5 · 4 · 3 · 2 | 0 |

Total do baralho: **120 pontos**. Atenção: o Valete é mais forte que a Dama.

## 5. Sentido do jogo
Tudo roda no **sentido contrário aos ponteiros do relógio** (de Sul para Este, Norte, Oeste…).

## 6. Dar, cortar e trunfo
1. **Quem dá** na primeira mão é sorteado; depois passa ao jogador seguinte (sentido contrário aos ponteiros do relógio).
2. O jogador **à esquerda de quem dá** corta e **escolhe "de cima" ou "de baixo"** (09 #1).
3. A carta escolhida (a de cima ou a de baixo do baralho) é virada para cima: o seu naipe é o **trunfo**. Essa carta **pertence a quem dá**.
4. Distribuem-se **10 cartas a cada jogador** (a carta de trunfo conta como uma das 10 de quem dá).
5. A carta de trunfo fica **visível a todos** até quem dá a jogar.

## 7. Jogar as vazas
1. Abre a primeira vaza o jogador **à direita de quem dá** (o seguinte no sentido do jogo).
2. Cada jogador joga uma carta, por ordem.
3. **Obrigatório assistir:** quem tem cartas do naipe de saída tem de jogar desse naipe.
4. Quem não tem o naipe pode jogar **qualquer carta** (trunfar ou baldar). Não é obrigatório trunfar.
5. Ganha a vaza:
   - o **trunfo mais alto**, se houver trunfos;
   - senão, a **carta mais alta do naipe de saída**.
6. Quem ganha a vaza abre a seguinte.
7. **Renúncia impossível:** o servidor rejeita qualquer carta que não respeite a obrigação de assistir.

## 8. Pontuação da mão
No fim das 10 vazas soma-se o valor das cartas ganhas por cada equipa.

| Pontos da equipa | Jogos ganhos |
|---|---|
| 61 a 90 | 1 |
| 91 a 119 | 2 (capote) |
| 120 | 4 (bandeira) — 09 #2 |
| 60 – 60 | **ninguém pontua** |

## 9. Ver a última vaza
- Durante a mão, cada jogador pode ver **a última vaza fechada**, mas **só uma vez** (09 #3 sobre o âmbito).
- Mostra as 4 cartas e quem jogou cada uma, durante 3 s.

## 10. Partida
- Ganha a equipa que chegar primeiro a **4 jogos** (configurável: 1–10).
- Depois da partida, a sala pode começar outra; o marcador da sala guarda as partidas ganhas por cada equipa.

## 11. Comunicação
- **Chat da mesa bloqueado durante a mão.** Abre entre mãos e no fim da partida.
- Sem reações/emotes durante a mão (podem servir de sinais).
- Comunicação por voz externa: fora de âmbito.

## 12. Temporizadores
| Momento | Por omissão | Ao expirar |
|---|---|---|
| Cortar (escolher cima/baixo) | 15 s | escolha aleatória |
| Jogar carta | 30 s | o servidor joga a carta legal de menor valor (09 #5) |
| Resumo da mão | 5 s | avança para a mão seguinte |

## 13. Opções configuráveis da sala
| Opção | Por omissão |
|---|---|
| `targetGames` — jogos para ganhar a partida | 4 |
| `turnTimeoutMs` | 30 s |
| `cutTimeoutMs` | 15 s |
| `disconnectGraceMs` — pausa máxima antes de decidir (ver 04 §2) | 120 s |
