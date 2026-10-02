# UI do Gringo

Reutiliza o baralho clássico (com jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro verde-azeitona (`#3B4A2A`).
- Centro: **baralho** (virado para baixo, com contador) e **descarte** (virado para cima, só a carta do topo bem visível).
- À volta: a **grelha de cada jogador**, sempre na mesma disposição.
- A tua grelha na base, maior.

## 2. Grelhas com posições fixas (requisito central)
- Cada posição tem um **número discreto** no canto ([1], [2]…) e um contorno fixo, mesmo quando está vazia.
- Grelha base 2 × 2; as penalizações acrescentam posições à direita ([5], [6]…), sem mexer nas outras.
- **Nada se reordena.** Qualquer mudança é uma animação de/para uma posição concreta.
- Posição vazia: contorno tracejado com um "✓" discreto (carta batida com sucesso).

## 3. Espreitar inicial
- No início, as tuas posições [3] e [4] viram-se para ti durante 10 s, com uma barra de tempo e a legenda *"Memoriza!"*.
- Os outros veem as tuas cartas a levantar ligeiramente, sem verem a face.

## 4. A tua vez
1. Botão **"Gringo"** visível no início da vez, se for permitido (com o motivo quando não for: *"Faltam 2 voltas"*).
2. Tocar no baralho para tirar. A carta sobe e vira **só para ti**, ao lado do baralho.
3. Opções:
   - **Tocar numa posição tua** → a carta tirada entra nessa posição e a antiga voa virada para cima para o descarte.
   - **Botão "Descartar"** → a carta vai para o descarte; se tiver poder, aparece *"Usar poder: espreitar carta de outro"* [Usar] [Não].

## 5. Poderes
- **Espreitar (de outro ou tua):** as posições válidas brilham; ao tocar, a carta levanta e vira só para ti durante 3 s. Os outros veem um ícone de olho sobre essa posição.
- **Trocar às cegas (Valete):** tocar numa posição tua e depois numa de outro; as duas cartas trocam de lugar em arco (viradas para baixo).
- **Espreitar e decidir (Rei):** primeiro espreita; depois [Trocar com uma minha] [Não trocar].
- Legenda pública: *"A Ana espreitou a carta [2] do Bruno."* / *"A Ana trocou a sua [1] com a [2] da Carla."*

## 6. Bater
- Quando cai uma carta no descarte, aparece à volta do descarte um anel de 3 s e a legenda *"Bater?"*.
- Durante a janela, **toca numa posição tua** para bater (confirmação por toque longo ou duplo toque, para evitar acidentes).
- **Acertou:** a carta voa para o descarte e a posição fica vazia; selo verde *"Bateu!"*.
- **Errou:** a carta vira para todos durante 1,5 s com o selo vermelho *"Errou!"*, volta para a posição, e uma carta nova do baralho entra numa posição nova.
- Quando alguém bate, o anel desaparece para todos.

## 7. Gringo
- Quem diz Gringo fica com o selo **"GRINGO!"** no avatar durante o resto do jogo.
- Faixa no topo: *"Última volta: falta o Bruno e a Carla"*.

## 8. Revelação final
- Todas as grelhas viram posição a posição (stagger 120 ms por jogador).
- Por cima de cada carta aparece o valor (os Reis vermelhos e os jokers em destaque).
- Total por jogador com count-up; vencedor(es) com coroa; restantes por ordem.
- Botões "Nova partida" e "Voltar ao lobby".

## 9. Responsivo (até 10 jogadores)
- Desktop: grelhas dos adversários em círculo, em tamanho `sm`.
- Telemóvel: a tua grelha em grande na base; os adversários numa faixa horizontal com grelhas mini (scroll), e a grelha do alvo amplia-se quando estás a escolher num poder.

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 50 ms |
| Espreitar inicial | 10 s |
| Tirar carta (subir + virar só para ti) | 400 ms |
| Troca própria | 450 ms |
| Espreitar com poder | 3 s visível |
| Troca às cegas | 600 ms |
| Janela de bater | 3 s |
| Batida falhada (mostrar) | 1500 ms |
| Revelação final | 120 ms por jogador + 400 ms por carta |
