# UI da Fodinha

Reutiliza **tudo** da especificação visual da Mexicana (`06-DESIGN-CARTAS-E-UI.md`): baralho clássico, feltro, componentes `Card`, tempos de animação, sons, acessibilidade, responsivo, 60 fps. Aqui fica só o que é específico.

## 1. Layout da mesa
- Até 10 lugares à volta de uma mesa oval; o jogador local sempre em baixo, ao centro.
- Cada lugar: avatar, nome, **pontos** (pips), **aposta**, **vazas feitas**, cartas na mão (versos ou cara, conforme a ronda).
- Centro: área da vaza (cartas jogadas em frente a cada lugar, viradas ao centro), e por cima uma **faixa de ronda**.
- Com 7–10 jogadores, cartas dos adversários em `sm` e avatares compactos.

## 2. Faixa de ronda (topo da mesa)
`Ronda 7 · 3 cartas · vale 2 pontos`
- Quando há acumulado, o valor aparece em destaque com um selo "Acumulado ×2".
- Durante as apostas: `Apostas 3 / 5 vazas` atualizado em tempo real, com texto "Faltam 2" ou "Excesso de 1".

## 3. Ronda às cegas (1 carta)
- A **tua carta aparece de costas**, levantada acima do teu avatar ("na testa"), com legenda discreta: *"A tua carta — não a podes ver"*.
- As cartas dos adversários aparecem **de cara para cima** à frente de cada um.
- Na jogada, a tua carta desliza de costas para o centro e **vira só quando chega à mesa** (flip de 400 ms).
- Garantia técnica: o cliente não recebe a carta; o flip usa o valor que chega no evento `CardPlayed`.

## 4. Painel de apostas
- Aparece na base quando é a tua vez: botões `0 1 2 … N`, grandes e com toque fácil.
- Se a restrição do último apostador estiver ativa, o valor proibido aparece riscado com tooltip.
- Confirmação num segundo toque (evita apostas acidentais): primeiro toque seleciona, botão "Apostar 2" confirma.
- Depois de apostar, aparece no teu lugar uma etiqueta fixa **"Aposta 2"** com ícone de cadeado.
- Apostas dos outros aparecem à medida que chegam, com pequena animação.

## 5. Indicador de cada lugar durante o jogo
`Aposta 2 · Feitas 1`
- Verde quando feitas = aposta (neste momento acerta).
- Âmbar quando ainda faltam vazas.
- Vermelho quando já passou da aposta (já falhou, sem volta).

## 6. Resolução da vaza
- Pausa de 1200 ms depois da última carta.
- **Vencedor:** a carta vencedora brilha (contorno dourado 2 px + leve escala 1,05), as cartas deslizam para o monte do vencedor, `Feitas` incrementa com animação.
- **Empate:** as cartas empatadas tremem ligeiramente e ficam acinzentadas, legenda *"Empate — ninguém ganha"*, todas deslizam para fora da mesa.
- Botão/atalho para ver a última vaza (pequeno ícone junto à área central).

## 7. Resumo da ronda (3,5 s, sobreposto)
| Jogador | Aposta | Fez | | Pontos |
|---|---|---|---|---|
| Carla | 1 | 0 | ✗ | +1 → 3 |

- Quem falhou em vermelho; se ninguém falhou: *"Ninguém falhou — a próxima ronda vale 2"*.
- Toque para fechar mais cedo (só para ti; o jogo avança pelo servidor).

## 8. Marcador de pontos
- Pips por jogador: `●●●○○` (preenchidos = pontos, total = `maxPoints`).
- A 1 ponto do limite: pips a vermelho e avatar com contorno vermelho ("em risco").
- Histórico completo de rondas acessível por um painel lateral (tabela ronda a ronda).

## 9. Fim de jogo
- Ecrã com **"Perdeu"** (em destaque, com os pontos) e **"Sobreviveram"**.
- Botões: "Nova partida" (mesma sala e configuração) e "Voltar ao lobby".

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 60 ms, 220 ms por carta |
| Aposta aparece | 180 ms |
| Jogar carta | 260 ms |
| Pausa antes de resolver vaza | 1200 ms (servidor) |
| Resolver vaza | 450 ms |
| Resumo da ronda | 3500 ms (servidor) |
| Flip da carta às cegas | 400 ms |
