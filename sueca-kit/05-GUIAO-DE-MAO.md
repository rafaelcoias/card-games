# Guião de Mão — Uma mão completa (40 cartas)

Teste automático obrigatório com as mãos e o trunfo abaixo injetados.

## Mesa
| Lugar | Jogador | Equipa |
|---|---|---|
| Sul | Ana | A |
| Este | Bruno | B |
| Norte | Carla | A |
| Oeste | Duarte | B |

Ordem de jogo (sentido contrário aos ponteiros do relógio): **Ana → Bruno → Carla → Duarte → Ana…**

- **Dá:** Duarte (Oeste).
- **Corta:** Carla (à esquerda do Duarte) → escolhe **"de baixo"**.
- **Trunfo:** a carta de baixo é o **4♦** → **trunfo ouros**. O 4♦ fica com o Duarte, visível a todos.
- **Abre:** Ana (à direita do Duarte).

## Mãos iniciais
| Jogador | Cartas |
|---|---|
| Ana | A♠ 7♠ K♠ · 3♥ 5♥ · Q♣ 3♣ 5♣ · A♦ J♦ |
| Bruno | J♠ 5♠ 2♠ · Q♥ 6♥ 4♥ · 7♣ · K♦ 6♦ 5♦ |
| Carla | 6♠ 3♠ · 7♥ 2♥ · A♣ K♣ J♣ 6♣ · 7♦ 3♦ |
| Duarte | Q♠ 4♠ · A♥ K♥ J♥ · 4♣ 2♣ · Q♦ 4♦ (trunfo) 2♦ |

## Vazas
| # | Abre | Cartas (por ordem de jogo) | Ganha | Pontos | Nota |
|---|---|---|---|---|---|
| 1 | Ana | Ana A♠ · Bruno 2♠ · Carla 3♠ · Duarte 4♠ | Ana (A) | 11 | |
| 2 | Ana | Ana 7♠ · Bruno 5♠ · Carla 6♠ · Duarte Q♠ | Ana (A) | 12 | o 7 é a segunda carta mais forte |
| 3 | Ana | Ana K♠ · Bruno J♠ · Carla 2♥ · Duarte 2♦ | Duarte (B) | 7 | Carla e Duarte sem espadas; Duarte trunfa |
| 4 | Duarte | Duarte A♥ · Ana 3♥ · Bruno 4♥ · Carla 7♥ | Duarte (B) | 21 | Carla só tinha o 7♥: obrigada a assistir |
| 5 | Duarte | Duarte K♥ · Ana 5♥ · Bruno 6♥ · Carla 3♦ | Carla (A) | 4 | Carla sem copas, trunfa |
| 6 | Carla | Carla A♣ · Duarte 2♣ · Ana 3♣ · Bruno 7♣ | Carla (A) | 21 | Bruno obrigado a assistir com o 7♣ |
| 7 | Carla | Carla K♣ · Duarte 4♣ · Ana 5♣ · Bruno 5♦ | Bruno (B) | 4 | Bruno sem paus, trunfa |
| 8 | Bruno | Bruno Q♥ · Carla 7♦ · Duarte J♥ · Ana A♦ | Ana (A) | 26 | Ana sobretrunfa o parceiro com o Ás de trunfo |
| 9 | Ana | Ana Q♣ · Bruno K♦ · Carla J♣ · Duarte 4♦ | Bruno (B) | 9 | Duarte joga a carta de trunfo (deixa de estar visível) |
| 10 | Bruno | Bruno 6♦ · Carla 6♣ · Duarte Q♦ · Ana J♦ | Ana (A) | 5 | Valete de trunfo bate a Dama |

## Resultado da mão
| Equipa | Vazas | Pontos | Jogos |
|---|---|---|---|
| A (Ana + Carla) | 6 | **79** | **1** |
| B (Bruno + Duarte) | 4 | 41 | 0 |

Verificação: 79 + 41 = **120** ✓

Mão seguinte: dá a **Ana** (seguinte ao Duarte), corta o **Duarte**, abre o **Bruno**.

## Cenários de pontuação (testes isolados)
| Pontos A – B | Jogos A – B |
|---|---|
| 79 – 41 | 1 – 0 |
| 60 – 60 | 0 – 0 |
| 95 – 25 | 2 – 0 |
| 120 – 0 | 4 – 0 |
| 30 – 90 | 0 – 1 |
| 29 – 91 | 0 – 2 |

## Cenários de legalidade (testes isolados)
- Na vaza 4, a vista da Carla só tem o 7♥ em `legalCardUids`; qualquer outra carta é rejeitada.
- Na vaza 6, o Bruno só pode jogar o 7♣.
- Na vaza 3, a Carla (sem espadas) pode jogar qualquer carta.
