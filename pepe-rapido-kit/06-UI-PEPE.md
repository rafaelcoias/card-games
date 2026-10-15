# UI do Pepe Rápido

Reutiliza o baralho clássico (com jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo. Prioridade absoluta: **resposta imediata ao toque**.

## 1. Mesa
- Feltro azul (`#1E3A5F`).
- **Tu em baixo, o adversário em cima**, cada um com as suas 5 colunas em leque vertical (as tapadas aparecem como bordas empilhadas, só para dar noção de quantas faltam).
- Ao centro, os **dois montes centrais**, lado a lado. Com as contagens escondidas (por omissão), os montes têm todos **a mesma espessura visual**. Com `showCentreCounts`, a espessura acompanha o número real e aparece um contador discreto por baixo de cada monte.
- Num canto, um selo pequeno com as regras ativas da partida (ex.: *"↑↓ · com jokers"* ou *"só ↑ · sem jokers"*), para ninguém se esquecer em que modo está.
- Reserva de cada jogador ao lado das colunas, virada para baixo. A espessura real só aparece quando a opção correspondente está ligada (`showOwnReserveCount` para a tua, `showOpponentCounts` para a do adversário).

## 2. Jogar
- **Arrastar** uma carta de cima de uma coluna para um monte central, ou **tocar** na carta e depois no monte.
- Atalho rápido: **duplo toque** numa carta envia-a para o único monte onde serve (se servir nos dois, vai para o mais próximo).
- Os montes onde a carta selecionada serve ganham um contorno discreto durante o arrasto.
- Rejeitada (o adversário foi mais rápido): volta para a coluna em 180 ms com um tremor curto. Sem mensagens.

## 3. Agrupar e mover
- Arrastar a carta de uma coluna para outra coluna da mesma figura (ou com joker) agrupa.
- Arrastar para uma coluna vazia move.
- A carta revelada por baixo vira com um flip de 200 ms.

## 4. Virar
- Botão grande **"Virar"** no centro, sempre visível.
- Quando o servidor deteta bloqueio, o botão pulsa.
- Com `autoFlip`, o botão mostra um anel de 2 s e vira sozinho; ainda se pode carregar para acelerar.
- Quem já carregou vê *"À espera do Bruno"*; o adversário vê um indicador no botão.
- Contagem 3-2-1 sobre os montes e as cartas viram ao mesmo tempo.

## 5. Fim de ronda
- Quem esvaziou as colunas: os dois montes ampliam-se ligeiramente com a legenda *"Escolhe o monte que queres levar"*. Tocar num leva-o (animação das cartas para o teu lado); o outro vai para o adversário.
- O adversário vê *"A Ana está a escolher…"*.
- Animação de baralhar e montagem das colunas (stagger 40 ms por carta).

## 6. Informação ao jogador
- Contador de rondas no topo ("Ronda 3").
- Contagens só onde a configuração as permite (montes centrais, a tua reserva, o total do adversário). O que está desligado não aparece em lado nenhum.

## 6.1 Criar sala — configuração
- Três cartões de predefinição grandes: **Clássico**, **Puro**, **Iniciante**, cada um com uma linha a dizer o que muda.
- Por baixo, "Personalizar" abre as opções agrupadas (Regras · Informação visível · Ritmo), com interruptores e uma frase curta de ajuda em cada.
- Mudar uma opção marca a predefinição como "Personalizado".
- Na sala de espera, o adversário vê o resumo das regras antes de dizer "Pronto".

## 7. Som (opcional)
- Carta no monte (curto, seco), rejeição (muito discreto), virar, escolher monte, vitória.

## 8. Telemóvel
- Ecrã em paisagem recomendado; em retrato, as colunas do adversário ficam compactas no topo.
- Alvos de toque com pelo menos 48 px; o duplo toque é o modo principal no telemóvel.

## 9. Desempenho
- Resposta visual ao toque em menos de 16 ms (antes de qualquer resposta do servidor).
- 60 fps garantidos durante trocas rápidas; animar só `transform` e `opacity`.
