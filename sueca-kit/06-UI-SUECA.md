# UI da Sueca — "Clean"

Princípio: **parecer uma mesa de sueca a sério, sem ruído.** Reutiliza o baralho clássico e os componentes existentes. Nada de contadores de pontos, badges, confettis ou sons a cada carta.

## 1. Sala (escolha de lugares)
- Mesa vista de cima com os 4 lugares (N, E, S, O) e a etiqueta da equipa em cada par (Equipa A: N/S, Equipa B: E/O), em duas cores sóbrias (azul-escuro e bordô).
- Tocar num lugar livre para sentar; tocar noutro livre para mudar.
- Anfitrião: "Trocar lugares" (arrastar um jogador para outro) e "Sortear equipas".
- Configuração visível: "Partida a 4 jogos".
- "Começar" só ativo com os 4 lugares ocupados.

## 2. Mesa
- Feltro verde clássico (`#1E5631`), sem padrões.
- **Tu estás sempre em baixo**; o teu parceiro em cima; adversários à esquerda e à direita.
- Nome de cada jogador junto ao seu lado; o parceiro com um traço discreto da cor da equipa.
- Indicador de vez: o nome do jogador da vez fica a branco, os outros a cinzento; anel fino de tempo à volta do nome.
- Quem dá: pequeno "D" junto ao nome.

## 3. Corte
- Para o cortador: o baralho ao centro com duas opções grandes: **"De cima"** · **"De baixo"**.
- Para os outros: *"A Carla está a cortar…"*.
- Animação curta: o baralho divide-se, a carta escolhida vira e desliza para junto de quem dá.

## 4. Trunfo
- A carta de trunfo fica **virada para cima junto a quem dá**, ligeiramente rodada, até ser jogada.
- No canto da mesa, um indicador mínimo e permanente do naipe de trunfo (só o símbolo, em grande, com contorno).

## 5. A tua mão
- Leque na base, **ordenada**: trunfo à esquerda, depois os outros naipes alternando cores, cada naipe pela ordem da sueca (Ás, 7, Rei, Valete, Dama, 6…).
- **Só as cartas legais estão ativas.** As outras ficam ligeiramente esbatidas e não respondem ao toque. Nada de mensagens de erro: simplesmente não dá.
- Jogar: tocar na carta (desktop: duplo clique ou arrastar para o centro).

## 6. Vaza
- As cartas jogadas ficam à frente de cada jogador, em cruz, viradas para o centro.
- Fechada a vaza: pausa de 1,2 s, a carta vencedora fica ligeiramente realçada e as quatro deslizam juntas para o lado da equipa que ganhou, onde ficam em monte virado para baixo.
- Junto a cada monte, só o **número de vazas** (pequeno). Pontos não aparecem durante a mão.

## 7. Ver última vaza
- Ícone discreto junto ao monte de vazas: **"Última vaza"** (com o indicador "1×").
- Ao tocar: as 4 cartas da última vaza aparecem ao centro em cruz durante 3 s, com a vencedora realçada.
- Depois de usado, o ícone desaparece até à mão seguinte.

## 8. Fim da mão
- Painel central sóbrio, 5 s:
  - "Nós 79 · Eles 41"
  - "Ganhámos 1 jogo"
  - Marcador da partida: "Nós 1 · Eles 0 (a 4)"
- Mão seguinte começa sozinha (ou o painel fecha ao toque).

## 9. Marcador da partida
- Canto superior, permanente e mínimo: **Nós 1 · Eles 0** e, por baixo, "a 4".
- Histórico das mãos num painel recolhível (mão, quem deu, trunfo, pontos, jogos).

## 10. Chat e comunicação
- Durante a mão: ícone de chat cinzento com cadeado e tooltip *"O chat abre no fim da mão"*. Sem reações.
- Entre mãos e no fim da partida: chat aberto.

## 11. Pausa por desconexão
- Véu escuro sobre a mesa com *"À espera do Bruno… 1:45"*.
- Para o anfitrião, quando o tempo acaba: [Esperar mais 2 min] [Terminar sem resultado].

## 12. Fim da partida
- Ecrã limpo: "Ganharam a Ana e a Carla — 4 a 2", histórico de mãos, botões "Nova partida" e "Voltar ao lobby".

## 13. Som (opcional, desligado por omissão)
- Só três sons suaves: carta na mesa, vaza recolhida, fim de mão.

## 14. Tempos
| Momento | Duração |
|---|---|
| Distribuir 40 cartas | stagger 30 ms |
| Corte | 600 ms |
| Jogar carta | 280 ms |
| Pausa da vaza fechada | 1200 ms |
| Recolher vaza | 350 ms |
| Ver última vaza | 3000 ms |
| Resumo da mão | 5000 ms |
