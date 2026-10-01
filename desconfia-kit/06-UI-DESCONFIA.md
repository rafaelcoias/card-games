# UI do Desconfia

Reutiliza o baralho clássico (incluindo os 2 jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro bordô escuro (`#5A1E2B`) para dar ar de "jogo de bluff".
- Centro: **pilha** desarrumada (cartas viradas para baixo com rotações aleatórias), com contador grande.
- Por cima da pilha, **o valor em jogo**: "A pilha está em **Setes**". Pilha nova: "Valor livre".
- Adversários à volta: avatar, nome e **contador de cartas em destaque** (é a informação mais importante do jogo).
- Faixa discreta "Fora de jogo": os valores que já saíram em peixinho.

## 2. Mão
- Leque na base, ordenada por valor, jokers no fim.
- Seleção múltipla com toque (as cartas selecionadas sobem).

## 3. Jogar
1. Selecionar as cartas.
2. Escolher o valor a anunciar:
   - Pilha nova: grelha com os 13 valores.
   - Pilha em curso: o valor já vem fixo.
3. Botão com o anúncio completo: **"Jogar 3 como Setes"**.
- O botão fica bloqueado nos primeiros 2 s depois da jogada anterior, com um anel a encher (a janela dos outros).
- Temporizador de 30 s à volta do avatar.

## 4. Anúncio
- Balão no jogador: **"Três Setes"**, com as cartas a deslizarem viradas para baixo para a pilha.
- Histórico curto das últimas 3 jogadas da pilha atual, por baixo do valor em jogo.

## 5. "Desconfia!"
- Botão grande e vermelho, sempre visível para quem pode desconfiar enquanto a janela está aberta. Pulsa de leve.
- Atalho de teclado: **Espaço**.
- Ao carregar: o nome de quem desconfiou aparece num balão ("Desconfia!") e todos os botões desaparecem.

## 6. Revelação
- As cartas da última jogada sobem e viram para todos (flip de 400 ms, stagger 80 ms).
- Carimbo em cima: **MENTIRA!** (vermelho) ou **VERDADE!** (verde), 900 ms.
- A pilha inteira desliza para a mão de quem perdeu; o contador de cartas dele sobe com animação.
- Legenda: *"Carla acertou. Recomeça a Carla."*

## 7. Peixinho
- As 4 cartas saem da mão de quem as juntou, abrem-se em leque no centro (600 ms) e vão para a faixa "Fora de jogo".
- Legenda: **"Peixinho de Setes — fora de jogo"**.

## 8. Última carta
- Quando alguém pousa a última carta: anel de 3 s à volta da pilha e legenda *"Última carta! Alguém desconfia?"*.
- Ao fechar sem desconfiança: confettis discretos e ecrã de vitória.

## 9. Fim
- Vencedor em destaque; restantes ordenados por cartas na mão.
- Botões "Nova partida" e "Voltar ao lobby".

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir 54 cartas | stagger 25 ms |
| Jogar cartas para a pilha | 300 ms |
| Bloqueio do seguinte | 2000 ms |
| Revelação (flip) | 400 ms + stagger 80 ms |
| Carimbo verdade/mentira | 900 ms |
| Pilha para a mão | 450 ms |
| Peixinho | 600 + 400 ms |
| Janela da última carta | 3000 ms |
