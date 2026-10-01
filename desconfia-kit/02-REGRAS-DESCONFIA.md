# Regras do Desconfia — Especificação (v1.0)

## 1. Objetivo
Ser o primeiro a ficar **sem cartas na mão**.

## 2. Material e jogadores
- Baralho de **54 cartas**: 52 + 2 jokers.
- **2 a 8 jogadores** (recomendado 3 ou mais) — ver 09 #6.

## 3. Preparação
- Baralhar e **distribuir todas as cartas**, uma a uma, pelos jogadores (alguns podem ficar com mais uma).
- **Peixinhos na distribuição:** quem receber 4 cartas do mesmo valor tira-as logo do jogo (ver 6).
- **Começa o jogador que recebeu o 3 de paus** (mesmo que o 3♣ tenha saído num peixinho).

## 4. Jogar
1. Na sua vez, o jogador pousa **uma ou mais cartas** viradas para baixo na pilha central e **anuncia** quantas são e o valor: *"Três Setes"*.
2. **Não há limite** de cartas por jogada.
3. **Valor anunciado:**
   - Quem abre uma pilha nova escolhe **qualquer valor**.
   - Os jogadores seguintes têm de anunciar **sempre o mesmo valor**, até alguém desconfiar.
4. **Pode mentir-se:** as cartas pousadas não têm de ser do valor anunciado.
5. **O joker** conta sempre como o valor anunciado (uma jogada só com jokers e cartas do valor anunciado é verdade).
6. **Não se passa a vez:** quem tem cartas joga sempre.
7. A ordem segue o sentido dos ponteiros do relógio.

## 5. Desconfiar
1. Depois de cada jogada, **qualquer outro jogador** pode dizer **"Desconfia!"** sobre essa jogada (só a última).
2. Viram-se **as cartas da última jogada** para todos verem:
   - **Mentira** (pelo menos uma carta não é do valor anunciado nem joker): quem jogou **leva a pilha toda** para a mão.
   - **Verdade**: quem desconfiou **leva a pilha toda** para a mão.
3. **Quem ganhou a desconfiança recomeça**: abre uma pilha nova com o valor que quiser.
   - Se quem desconfiou acertou, é ele que joga a seguir.
   - Se errou, joga a seguir quem tinha jogado (e falou verdade).
4. Só a última jogada é verificada; as cartas de baixo da pilha nunca são reveladas.

### Janela de desconfiança (online)
- Depois de cada jogada abre-se uma janela: dura **até o jogador seguinte jogar**, com um **mínimo de 2 s** (nesses 2 s o seguinte ainda não pode jogar).
- Quando a jogada deixa o jogador **sem cartas**, a janela é de **3 s** fixos.
- Se dois jogadores desconfiarem quase ao mesmo tempo, conta **o primeiro que chega ao servidor**.

## 6. Peixinhos
- **Sempre que um jogador tiver 4 cartas do mesmo valor na mão**, essas 4 cartas **saem do jogo** automaticamente e o valor fica visível a todos.
- Acontece na distribuição e sempre que alguém leva a pilha.
- Jokers não contam para peixinhos (09 #2).
- Um valor que já saiu em peixinho pode continuar a ser anunciado, mas, se for verificado, só será verdade se as cartas forem jokers.

## 7. Fim do jogo
- Um jogador que pousa as últimas cartas da mão **ganha** se:
  - ninguém desconfiar dentro da janela de 3 s; ou
  - alguém desconfiar e a jogada for verdade.
- Se desconfiarem e for mentira, leva a pilha e o jogo continua.
- Ver 09 #4 sobre continuar para atribuir posições.

## 8. Informação pública e privada
| Informação | Quem vê |
|---|---|
| A própria mão | só o próprio |
| Nº de cartas de cada jogador | todos |
| Nº de cartas na pilha | todos |
| Cada jogada: quem, quantas cartas, valor anunciado | todos |
| Cartas da última jogada quando há desconfiança | todos |
| Restantes cartas da pilha | ninguém (vão para a mão de quem a leva) |
| Peixinhos que saíram (valores) | todos |

## 9. Temporizador
- **30 s** por jogada; ao expirar, jogada automática (09 #5).
