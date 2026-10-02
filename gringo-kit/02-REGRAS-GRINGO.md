# Regras do Gringo — Especificação (v1.0)

## 1. Objetivo
Acabar o jogo com **o menor número de pontos** na grelha.

## 2. Material e jogadores
- **54 cartas** (52 + 2 jokers).
- **2 a 10 jogadores.** Com muitos jogadores o baralho acaba depressa (ver 09 #11).

## 3. Valor das cartas
| Carta | Pontos |
|---|---|
| Ás | 1 |
| 2 a 10 | valor facial |
| Valete / Dama / Rei preto | ver 09 #1 (proposta: 11 / 12 / 13) |
| **Rei vermelho** (♥ ♦) | **−3** (configurável: −1) |
| **Joker** | **0** |

## 4. Preparação
- Cada jogador recebe **4 cartas viradas para baixo**, numa grelha 2 × 2 com **posições fixas**:

```
 [1] [2]      ← linha de cima
 [3] [4]      ← linha de baixo (as que podes espreitar)
```

- No início, todos espreitam ao mesmo tempo as **2 cartas da linha de baixo** (posições 3 e 4) durante alguns segundos. Depois voltam a ficar viradas para baixo, e a partir daí só se sabe o que se memorizou (09 #2).
- O resto forma o **baralho** (virado para baixo). O **descarte** começa vazio.
- Quem começa: ver 09 #9.

## 5. A vez de um jogador
1. *(Opcional)* Dizer **"Gringo"**, antes de jogar (ver 9).
2. **Tirar uma carta do baralho.** Só tu a vês. Não se pode tirar do descarte.
3. Escolher:
   - **Trocar:** pões a carta tirada numa posição tua (virada para baixo) e a carta que lá estava vai para o descarte, virada para cima.
   - **Descartar:** pões a carta tirada diretamente no descarte. Se tiver poder, podes usá-lo (ver 6).
4. Abre-se a janela para **bater** (ver 7).
5. Passa ao seguinte no sentido dos ponteiros do relógio.

## 6. Poderes
Só se ativam quando a carta **tirada do baralho é descartada diretamente** (09 #3). Usar o poder é sempre opcional.

### Configuração por omissão: "Figuras"
| Carta | Poder |
|---|---|
| **10** | Espreitar **uma carta de outro jogador** |
| **Valete** | **Trocar** uma carta tua com uma carta de outro jogador, ambas à tua escolha, sem as ver |
| **Dama** | Espreitar **uma carta tua** |
| **Rei** | Espreitar **uma carta de outro jogador** e decidir se a **trocas** com uma carta tua |

### Configuração alternativa: "Sete a Dez"
| Carta | Poder |
|---|---|
| **7** | Espreitar uma carta de outro jogador |
| **8** | Trocar uma tua com uma de outro, sem ver |
| **9** | Espreitar uma carta tua |
| **10** | Espreitar uma de outro e decidir se trocas |

- Numa troca, cada carta vai para a posição exata de onde veio a outra.
- Todos veem **que** posições foram espreitadas ou trocadas; ninguém, além de quem espreitou, vê os valores.

## 7. Bater
- Sempre que uma carta vai para o descarte, abre-se uma **janela curta** (3 s, configurável).
- Nessa janela, **um único jogador** pode **bater**: escolhe uma posição da **sua** grelha e atira essa carta para cima do descarte, por achar que é do **mesmo valor** (09 #4 e #6).
  - **Acertou:** a carta fica no descarte e a posição fica **vazia**. Tens menos uma carta.
  - **Errou:** a carta é mostrada a todos, **volta para a mesma posição** virada para baixo, e levas **mais uma carta do baralho** numa posição nova da tua grelha, sem a ver (09 #5).
- Depois da primeira batida (certa ou errada), **mais ninguém pode bater** sobre essa carta.
- Uma carta batida não abre nova janela, e uma carta de poder batida não ativa o poder.
- O jogador seguinte só tira do baralho quando a janela fecha.

## 8. Jogador sem cartas
- Quem fica sem cartas (todas batidas) **já não joga**: é saltado.
- Pode na mesma dizer **"Gringo"** quando lhe calharia a vez, se a opção Gringo estiver ligada.
- Não pode ser alvo de poderes.

## 9. "Gringo" (opcional, configurável)
- Só se pode dizer **na própria vez, antes de tirar carta**.
- Só depois de cada jogador ter jogado pelo menos **5 vezes** (configurável).
- Quem diz Gringo **joga a sua vez normalmente**; depois **cada um dos outros joga mais uma vez**, e o jogo acaba.
- Não há penalização para quem diz Gringo: se não tiver a menor pontuação, simplesmente perde.

## 10. Fim do jogo e pontuação
- O jogo acaba:
  - quando o **baralho acaba** (09 #7); ou
  - com a opção Gringo ligada, depois da volta final a seguir ao Gringo (o que acontecer primeiro).
- Viram-se todas as grelhas e somam-se os pontos.
- **Ganha quem tiver menos pontos.** Empate: vitória partilhada (09 #10).
- Cada partida é independente (sem pontuação acumulada).

## 11. Opções configuráveis da sala
| Opção | Valores | Por omissão |
|---|---|---|
| `redKingValue` | −3 / −1 | −3 |
| `powerSet` | "FIGURAS" (10–K) / "SETE_A_DEZ" (7–10) | FIGURAS |
| `gringoEnabled` | sim / não | não (o jogo acaba quando o baralho acaba) — 09 #7 |
| `gringoMinTurns` | 1–20 voltas | 5 |
| `snapWindowMs` | 2–6 s | 3 s |
| `decks` | 1 / 2 | 1 (09 #11) |
| Temporizadores | ver 12 | — |

## 12. Temporizadores
| Momento | Por omissão | Ao expirar |
|---|---|---|
| Espreitar inicial | 10 s | as cartas voltam a ficar viradas para baixo |
| Vez (tirar + decidir) | 30 s | descarta a carta tirada, sem usar poder |
| Usar poder | 15 s | o poder é ignorado |
| Janela de bater | 3 s | ninguém bateu |
