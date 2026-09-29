# UI do Peixinho

Reutiliza o baralho clássico, os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo. Tom visual um pouco mais leve e familiar que o Blackjack, mas com o mesmo baralho e a mesma qualidade.

## 1. Mesa
- Feltro com um toque azul-esverdeado (`#1D5C63`) para diferenciar dos outros jogos.
- Ao centro, o **lago**: as cartas do monte espalhadas "à balda", viradas para baixo, com rotações e posições aleatórias (fixas por partida, geradas por seed), como se faz na mesa de casa. Com o lago a esvaziar, as cartas desaparecem.
- Adversários à volta: avatar, nome, contador de cartas, e à frente o **balde** com os peixinhos pousados.
- Mão do jogador em leque na base, **agrupada por valor** (as cartas do mesmo valor juntas), com contador por grupo quando há 2 ou mais.

## 2. Pedir
1. Tocar num adversário (só os que têm cartas estão ativos).
2. Tocar num grupo de valor da própria mão (só os valores que tens).
3. Botão de confirmação com o texto completo: **"Pedir Setes à Ana"**.
- Atalho: arrastar uma carta da mão para cima do avatar do adversário faz as duas escolhas de uma vez.
- Temporizador de 30 s à volta do avatar.

## 3. Respostas
- Balão de fala no adversário:
  - Tem: **"Tenho! Toma 2."** → as cartas voam da mão dele para a tua (viradas para cima durante o voo) e juntam-se ao grupo.
  - Não tem: **"Vai à pesca!"** com um pequeno ícone de peixe.

## 4. Pescar
- Com `pondPicking` ativo: o lago ganha brilho e és tu a tocar numa carta (5 s; senão, escolha automática). A carta sobe, vira só para ti, e entra na mão.
- **Pescou o valor pedido:** a carta vira para todos, com animação de salto e som "splash", e a legenda *"Pescou o que pediu! Joga outra vez."*
- Não pescou: legenda discreta *"Passa a vez."* e o foco passa ao seguinte.

## 5. Peixinho
- As 4 cartas saem da mão, abrem-se em leque ao centro por 600 ms e seguem para o balde do jogador, empilhadas e ligeiramente rodadas, com o valor visível.
- Legenda: **"Peixinho de Setes! Joga outra vez."**
- Contador de peixinhos do jogador faz "pop".

## 6. Ficar sem cartas
- Legenda *"Sem cartas — vai buscar 4"*; 4 cartas voam do lago para a mão (stagger 80 ms).
- Lago vazio: avatar fica acinzentado com a etiqueta *"Fora de jogo"*.

## 7. Memória da mesa
- Painel lateral (ou faixa colapsável no telemóvel) com os últimos pedidos, conforme `tableMemory`:
  - "Ana pediu **Setes** ao Bruno — levou 1"
  - "Bruno pediu **Reis** à Carla — foi à pesca"
- `NONE` esconde o painel (modo "memória de verdade").

## 8. Marcador e fim
- Placar no topo: peixinhos de cada jogador e **"Peixinhos na mesa: 5 / 13"**.
- Fim: vencedor(es) em destaque, com os baldes de todos lado a lado; botões "Nova partida" e "Voltar ao lobby".

## 9. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 60 ms, 220 ms por carta |
| Balão de resposta | 900 ms |
| Cartas entregues | 350 ms, stagger 60 ms |
| Pescar (subir + virar) | 450 ms |
| Revelar pescado a todos | 400 ms |
| Peixinho (leque + balde) | 600 + 400 ms |
| Reposição de 4 | stagger 80 ms |
