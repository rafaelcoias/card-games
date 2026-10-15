# Guião de Cenários — Estado injetado

Num jogo em tempo real, um guião linear "vez a vez" não faz sentido. Estes cenários injetam um estado concreto e aplicam ações por ordem de chegada ao servidor. Todos têm de passar como testes automáticos.

Notação: colunas da Ana `A1…A5`, do Bruno `B1…B5`; montes centrais `E` (esquerda) e `D` (direita). Só se indica a carta de cima e, quando importa, a de baixo.

## C1 — Jogada simples e carta revelada
- E = 7♠, D = J♦. Ana A3 = 8♥ (por baixo: 2♣).
- Ana: `PLAY_TO_CENTRE A3 → E` → E = 8♥; A3 mostra 2♣.

## C2 — Ás e Rei ligados
- E = K♣. Ana A1 = A♦ → válido (`aceKingWrap`). Com `aceKingWrap = false` → rejeitado.

## C3 — Joker
- D = 5♥. Bruno B2 = JOKER → `PLAY_TO_CENTRE B2 → D` válido.
- D = JOKER. Ana A4 = Q♠ → válido (depois de um joker vale qualquer carta).

## C4 — Agrupar
- Ana A2 = 9♣ (por baixo 4♦), A5 = 9♥. `GROUP A2 → A5` → A5 = 9♣ sobre 9♥; A2 mostra 4♦.
- Ana A1 = JOKER, A3 = 6♠ → `GROUP A1 → A3` válido; `GROUP A3 → A1` também válido.

## C5 — Coluna vazia
- Ana A1 vazia, A4 = 10♦ (por baixo 3♥). `MOVE_TO_EMPTY A4 → A1` → A1 = 10♦; A4 mostra 3♥.

## C6 — Corrida ao mesmo monte
- E = 6♦. Ana tem A2 = 7♣; Bruno tem B3 = 5♠. Os dois enviam com `expectedTopUid = 6♦`.
- Chega primeiro a Ana → E = 7♣. A ação do Bruno chega com `expectedTopUid = 6♦` mas o topo é 7♣ → **rejeitada** (`TOP_CHANGED`), apesar de o 5♠ não servir de qualquer forma. A carta do Bruno volta à coluna.

## C7 — Bloqueio e virar
- Nenhum dos dois tem jogada para E nem D → `Stalled`.
- Ana `REQUEST_FLIP`; Bruno `REQUEST_FLIP` → contagem 3 s → cada um vira a carta de cima da sua reserva para o seu lado.

## C8 — Fim de ronda às cegas
- Ana esvazia as 5 colunas. Ana tem 4 cartas na reserva. O Bruno tem 6 cartas nas colunas e 3 na reserva.
- Montes: E tem 9 cartas, D tem 32 cartas (a Ana não sabe).
- Ana `CHOOSE_PILE E` → Ana fica com 9 + 4 = **13** cartas; Bruno fica com 32 + 3 + 6 = **41**.
- Ronda 2: a Ana tem menos de 15 → colunas 1, 2, 3, 4 e 3 cartas, **sem reserva**. O Bruno: colunas de 15 + reserva de 26.
- Conservação: 13 + 41 = 54 ✓

## C9 — Ronda com um só jogador com reserva
- Só o Bruno tem reserva → no início e em cada "Virar" só ele vira (09 #6).

## C10 — Vitória
- Ronda em que a Ana não tem reserva. A Ana esvazia as colunas → **ganha** (não há monte para levar).

## C11 — Informação oculta (configuração por omissão)
- Em todos os cenários, nenhuma vista e nenhum evento contém o número de cartas de E ou D, nem cartas tapadas.

## C12 — Só acima (`direction = UP_ONLY`)
- E = 7♠. Ana A2 = 8♦ → válido. Ana A3 = 6♣ → rejeitado.
- E = K♣, `aceKingWrap` → Ás válido. E = A♥ → Rei rejeitado (no modo só acima, o Rei não vai sobre o Ás).

## C13 — Sem jokers (`jokers = false`)
- Baralho de 52, 26 por jogador (colunas 15 + reserva 11). Nenhum joker em lado nenhum.

## C14 — Contagens visíveis
- `showCentreCounts = true`: no C8 a Ana vê E = 9 e D = 32 antes de escolher.
- `showOpponentCounts = true`: a Ana vê o total de cartas do Bruno; com `false`, só sabe se ele tem reserva.
- `showOwnReserveCount = false`: a vista da Ana tem `reserveCount = null`.

## C15 — Agrupar e mover desligados
- `grouping = false`: o `GROUP` do C4 é rejeitado.
- `moveToEmpty = false`: o `MOVE_TO_EMPTY` do C5 é rejeitado.

## C16 — Virar automático (`autoFlip = true`)
- Bloqueio → 2 s depois os dois viram sozinhos, sem carregar em "Virar".
- Bloqueio, mas a Ana agrupa uma carta e passa a ter jogada antes dos 2 s → o virar automático é cancelado.
