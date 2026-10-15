# Testes Obrigatórios — Pepe Rápido

Cobertura ≥ 90% no motor. Motor puro com estado injetado.

## 1. Preparação
- 54 cartas, 27 para cada; colunas 1–5 com só a carta de cima visível; reserva com o resto.
- Menos de 15 cartas: colunas preenchidas pela ordem, sem reserva.

## 2. Jogadas para o centro
- ±1 válido; diferença 0 ou ≥ 2 inválida; A↔K conforme `aceKingWrap`.
- Joker sobre qualquer carta; qualquer carta sobre joker.
- `expectedTopUid` diferente do topo atual → rejeitado (`TOP_CHANGED`).
- Coluna vazia → inválido.
- Jogar fora da fase PLAYING (contagem, escolha de monte) → inválido.

## 3. Agrupar e mover
- Mesma figura → válido; diferente → inválido; joker nos dois sentidos → válido.
- Mover para coluna vazia → válido; para coluna com carta → inválido (só agrupar).
- Só nas próprias colunas.

## 4. Corrida
- Duas jogadas para o mesmo monte com o mesmo `expectedTopUid` → só a primeira processada é aceite.
- Jogadas para montes diferentes ao mesmo tempo → ambas aceites.

## 5. Bloqueio e virar
- Deteção correta de "ninguém pode jogar para o centro".
- Virar só quando os dois pedem (ou quem tem reserva, se o outro não tiver).
- Reserva vazia de um lado (09 #6) e dos dois lados (09 #7).

## 6. Fim de ronda
- Esvaziar as 5 colunas termina a ronda logo; ações seguintes do adversário rejeitadas.
- Escolha do monte só por quem esvaziou.
- Redistribuição: conservação de 54 cartas; cada jogador recebe exatamente o que o 02 §7 diz.

## 7. Vitória
- Ronda sem reserva + colunas vazias → vitória.

## 8. Informação oculta
- Nenhuma vista/evento contém contagens dos montes centrais, cartas tapadas ou cartas da reserva.

## 9. Guião
- Cenários C1–C16 do `05` como testes.

## 9.1 Configuração
- Schema Zod: valores por omissão, limites, predefinições preenchem as opções certas, mudar uma opção → `PERSONALIZADO`.
- Configuração congelada: alterar a sala a meio da partida não muda o comportamento do motor.
- `direction` × `aceKingWrap`: matriz completa para A, 2, Q, K sobre A, 2, Q, K.
- `jokers = false`: 52 cartas, 26 por jogador; nenhuma vista contém jokers.
- Cada opção de visibilidade: o campo vai a `null` no servidor quando desligada (teste sobre o JSON serializado, não sobre a UI).
- `autoFlip`: agendamento, cancelamento por jogada e por agrupar.

## 10. Simulação
- 10 000 partidas **por predefinição** (Clássico, Puro, Iniciante) + 10 000 com configurações aleatórias, com 2 bots (um rápido e um lento, ações intercaladas aleatoriamente).
- Invariantes: 54 ou 52 cartas sempre (conforme `jokers`); nenhuma carta duplicada; cada coluna tem a carta de cima visível ou está vazia.
- Termina sempre (registar média de rondas; limite de segurança de 200 rondas).
