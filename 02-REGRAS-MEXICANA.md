# Regras da Mexicana — Especificação para Implementação (v1.1 — fechada)

> Referência: a mecânica base é semelhante ao jogo conhecido como "Shithead" / "Palace". Usar só como referência de estrutura; estas regras prevalecem sempre.

## 1. Objetivo
Ficar sem cartas. Quem esvazia primeiro ganha; o jogo continua até restar um jogador, que perde.

## 2. Material
- Baralho de **54 cartas**: 52 + 2 jokers
- **2 a 6 jogadores** (6 × 9 = 54 → com 6 jogadores o baralho comum começa vazio)

## 3. Preparação
Cada jogador recebe **9 cartas** em três camadas:

| Camada | Qtd | Quem vê | Código |
|---|---|---|---|
| Escondidas (mesa, viradas para baixo) | 3 | **Ninguém**, nem o próprio | `faceDown` |
| Visíveis (mesa, por cima das escondidas) | 3 | **Todos** | `faceUp` |
| Mão | 3 | Só o próprio | `hand` |

**Fase de escolha:** o jogador recebe as 3 escondidas (sem as ver) + 6 cartas na mão e escolhe 3 para `faceUp`. O jogo só arranca quando todos confirmam (temporizador de 30 s; ao expirar, escolha automática das 3 mais altas).

As restantes formam o **baralho comum** (`drawPile`).

**Quem começa:** na primeira partida da sala, aleatório. Nas seguintes, **quem perdeu a anterior**.

## 4. Hierarquia
`2 < 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A`
- Naipes não contam.
- **Joker** não tem posição na hierarquia; é só poder (igual ao 10).

## 5. Turno
1. Turnos pela ordem da lista de jogadores (sentido dos ponteiros do relógio).
2. O **primeiro jogador pode jogar qualquer carta**.
3. Da **mão**, podem jogar-se **1 ou mais cartas do mesmo valor** de uma vez (ex.: sobre um 4 → um 5, dois 5, três 5…). Jogar várias é sempre opcional — o jogador pode jogar uma de cada vez.
4. A jogada tem de ser **igual ou superior** ao **valor efetivo do topo** da pilha (ver 7.1). **Não é preciso ser sequencial** — pode saltar-se do 4 para o 9, ou do 2 para o Rei. Só conta ser ≥.
5. **2, 3, 10 e Joker podem ser jogados sobre qualquer carta**, mesmo sobre um Ás ou sob restrição do 7.
6. Depois de jogar, enquanto houver baralho comum, compra até ter **no mínimo 3 cartas na mão**.
7. Sem jogada válida → **apanha a pilha de descarte inteira para a mão** e **perde a vez** (joga o seguinte, com pilha vazia).

## 6. Ordem de esvaziamento das camadas
1. **Mão** — repõe até 3 enquanto houver baralho comum.
2. Baralho comum vazio e mão vazia → **visíveis** (`faceUp`), **uma de cada vez** (sem jogada múltipla).
3. Visíveis vazias → **escondidas** (`faceDown`), **uma de cada vez, às cegas**: escolhe a posição, a carta só é revelada ao ser jogada. Se for inválida, vai para a mão juntamente com a pilha e perde a vez.
- Quem apanha a pilha volta a ter mão e tem de a esvaziar antes de regressar às visíveis/escondidas.
- O servidor nunca envia o valor das `faceDown` a nenhum cliente antes da revelação.

## 7. Cartas de poder

| Carta | Poder | Efeito |
|---|---|---|
| **2** | Reset | Joga-se sobre qualquer carta. A pilha fica reiniciada: o seguinte pode jogar qualquer carta. |
| **3** | Vidro | Joga-se sobre qualquer carta. Assume o **valor e o poder** da carta efetiva abaixo: 3 sobre 8 conta como 8 e bloqueia o seguinte; 3 sobre 7 mantém a restrição "7 ou inferior"; 3 sobre 2 conta como reset. Sobre pilha vazia, não impõe restrição. |
| **4, 5, 6** | — | Cartas normais. |
| **7** | Limite | O jogador seguinte tem de jogar **7 ou inferior** (2–7) **ou 2/3/10/Joker** (ver ponto 5.5). |
| **8** | Bloqueio | Salta o jogador seguinte. N oitos numa jogada saltam N jogadores. **Acumula**: se o primeiro jogador não bloqueado jogar outro 8, salta o seguinte a ele. |
| **9, J, Q, K, A** | — | Cartas normais (altas). |
| **10** | Queimar | Joga-se sobre qualquer carta. A pilha sai **definitivamente do jogo** (`burnPile`). **O mesmo jogador joga outra vez**, com pilha vazia. |
| **Joker** | Queimar | Exatamente igual ao 10. Jogar 2 jokers juntos tem o mesmo efeito que jogar 1 (queima uma vez, joga outra vez). |

**Quatro iguais:** se o topo da pilha acumular **4 cartas do mesmo valor estritamente seguidas** (numa ou várias jogadas, de um ou vários jogadores), queima como o 10: pilha para `burnPile` e **quem jogou a quarta joga outra vez**. **O 3 não conta e interrompe a sequência**: K, K, K, 3 não queima e K, K, K, 3, K também não — os quatro Reis têm de estar fisicamente seguidos no topo.

## 8. Temporizador
- **30 s por turno.** Ao expirar, o jogador **apanha a pilha de descarte inteira para a mão e perde a vez** (mesmo tratamento de "sem jogada válida"). Assim ninguém ganha por deixar o relógio correr.
- Fase de escolha: 30 s, escolha automática das 3 cartas mais altas.

## 9. Fim de partida
- Jogador sem cartas em nenhuma camada → sai do jogo com a posição seguinte na classificação.
- O último com cartas perde e começa a partida seguinte.
- Resultado gravado com posições finais.

## 10. Notas de implementação
- `effectiveTop`: percorrer a pilha do topo para baixo ignorando os 3; o primeiro valor não-3 é o efetivo. Pilha vazia ou só 3s → sem restrição.
- Estado de restrição da pilha: `none | reset | maxSeven`.
- `pendingSkips: number` no estado; cada 8 (ou 3-sobre-8) jogado incrementa; cada jogador saltado decrementa.
- `sameRankRun: number` para os quatro iguais; qualquer carta de valor diferente (incluindo 3) faz reset a 1.
- Após queimar, `currentIndex` não avança.
- Efeitos numa tabela `cardEffects` configurável, para permitir variantes sem reescrever o motor.
- Testes obrigatórios: cada poder isolado; 3 sobre 7; 3 sobre 8; 3 sobre 3; 3 sobre 2; 8 múltiplos e 8 encadeados; K,K,K,3 não queima; K,K,K,3,K não queima; K,K,K,K queima; poder revelado numa escondida; 2 jokers = 1 joker; jogar outra vez após queimar; perder a vez após apanhar; timeout apanha a pilha.
