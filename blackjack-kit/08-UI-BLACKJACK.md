# UI do Blackjack

Reutiliza o baralho clássico, componentes `Card`, animações base, sons e regras de acessibilidade/responsivo dos outros jogos. Aqui fica só o específico.

## 1. Mesa
- Feltro verde escuro (`#1E5631`), forma de **meia-lua** clássica: dealer no topo ao centro, 7 lugares em arco na base.
- Texto impresso no feltro, em arco, gerado da configuração:
  `BLACKJACK PAGA 3 PARA 2 · A BANCA FICA EM TODOS OS 17 · SEGURO PAGA 2 PARA 1`
- À direita do dealer: **sapato** (com barra discreta de cartas restantes e marca da carta de corte). À esquerda: **descarte**.
- O jogador local fica sempre no lugar central do ecrã (a mesa roda visualmente; a ordem real mantém-se).

## 2. Fichas
| Valor | Cor |
|---|---|
| 10 | azul |
| 20 | amarelo |
| 50 | laranja |
| 100 | preto |
| 500 | roxo |

- Fichas em SVG com as riscas laterais clássicas e valor ao centro; pilhas com leve desalinhamento para parecerem reais.
- As apostas são pilhas no círculo de aposta de cada lugar.

## 3. Fase de apostas
- Barra de fichas na base: tocar numa ficha adiciona ao círculo; tocar na pilha retira a última.
- Botões: **Limpar**, **Repetir** (aposta anterior), **Dobrar** (2× a anterior), **Confirmar**.
- Temporizador circular de 15 s no círculo de aposta.
- Mostrar min/max da mesa e as fichas disponíveis.
- Sem fichas suficientes para o mínimo: botão **Recomprar** (se permitido), com contador de recompras visível.

## 4. Mãos
- Cartas de cada mão em cascata (ligeiramente sobrepostas para cima e para a direita).
- Etiqueta de total por baixo: `16` ou `7 / 17` para mãos moles; `BLACKJACK` em dourado; `REBENTOU` a vermelho.
- Mãos separadas lado a lado; a mão ativa com contorno luminoso.
- Dobrar: a terceira carta entra **atravessada** (rodada 90°), como nos casinos.

## 5. Ações
- Botões grandes na base, só os válidos ficam ativos: **Pedir · Ficar · Dobrar · Separar · Desistir**.
- Atalhos de teclado (desktop): H, S, D, P, R.
- Gestos (telemóvel, opcional): toque duplo = pedir; deslizar horizontal = ficar.
- Dica (se ativa): ícone de lâmpada; ao tocar, destaca o botão recomendado durante 2 s. Nunca automático.
- Temporizador de decisão (20 s) à volta do avatar do jogador da vez.

## 6. Seguro / even money
- Painel compacto sobre a mesa: "Seguro por 25?" [Sim] [Não], com contagem de 10 s.
- Even money para quem tem blackjack: "Receber 1:1 já?" [Sim] [Não].

## 7. Dealer
- Avatar e nome do dealer no topo, balão de fala para as frases do chat (desaparece em 2 s).
- Carta tapada com o verso do baralho; ao revelar, flip 3D de 400 ms.
- Peek: a carta tapada levanta ligeiramente o canto durante 600 ms e volta a pousar.
- Cartas do dealer saem do sapato com deslize real (origem: sapato).

## 8. Liquidação
- Da direita para a esquerda: perdas → fichas deslizam para o dealer; ganhos → o dealer empurra fichas para o círculo; blackjack → fichas extra com brilho curto.
- Etiquetas de resultado por mão: `+100`, `EMPATE`, `−50`, `BLACKJACK +30`.
- Contador de fichas do jogador anima o valor (count-up de 400 ms).

## 9. Baralhar
- Quando sai a carta de corte: aviso discreto "Última ronda do sapato".
- Depois da liquidação: animação de baralhar (2,2 s) e barra do sapato volta a cheia.

## 10. Marcador da sessão
- Painel lateral recolhível: jogador, fichas, saldo (verde/vermelho), recompras, rondas jogadas.
- Fim de sessão: classificação por saldo.

## 11. Responsivo
- Telemóvel: 7 lugares não cabem em arco; mostrar o lugar local em destaque e os outros numa faixa horizontal compacta (fichas + total), expansível.
