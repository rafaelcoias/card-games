# Testes Obrigatórios — Peixinho

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 2 jogadores → 7 cartas; 3–6 → 5; lago com o resto.
- Peixinho na distribuição: pousado de imediato, sem jogada extra.

## 2. Pedidos
- Pedir fora de vez → erro.
- Pedir a si próprio → erro.
- Pedir valor que não se tem → erro.
- Pedir a jogador sem cartas → erro.
- Pedido bem-sucedido: entrega **todas** as cartas do valor (1, 2 e 3) e mantém a vez.

## 3. Pesca
- "Vai à pesca" + carta de outro valor → passa a vez ao seguinte.
- Carta do valor pedido → revelada a todos, mantém a vez.
- Carta de outro valor que completa um peixinho → pousa e mantém a vez.
- Lago vazio → passa a vez.
- `pondPicking`: qualquer posição escolhida dá uma carta válida do lago; timeout escolhe automaticamente.

## 4. Peixinhos
- Juntar 4 por pedido → pousa, mantém a vez.
- Juntar 4 por pesca → pousa, mantém a vez.
- Dois peixinhos na mesma jogada (ex.: recebe 2 de um valor que completa) → ambos pousados.

## 5. Reposição
- Quem pede fica sem cartas após pousar peixinho → repõe 4 e continua.
- Quem dá fica sem cartas → repõe 4 de imediato (não é a vez dele).
- Lago com < 4 → repõe o que houver.
- Reposição com 4 iguais → pousa e volta a repor.
- Lago vazio e mão vazia → jogador fica fora e é saltado; não pode ser alvo de pedidos.

## 6. Fim
- 13 peixinhos → FINISHED.
- Só um jogador com cartas e lago vazio → as cartas dele são peixinhos completos → pousa e termina.
- Vencedor único; empate segundo 09 #5.
- `GameResult` com `WINNER`/`PLACED` e `score`.

## 7. Segurança
- Nenhuma vista contém cartas de mãos alheias.
- Nenhuma vista contém cartas do lago.
- Carta pescada por outro jogador só aparece na vista quando `caughtAsked`.
- `askLog` na vista respeita `tableMemory`.

## 8. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` e verificar o estado esperado exato (mãos, peixinhos, lago = 25, vez da Ana).

## 9. Simulação
- 10 000 partidas com 2–6 bots:
  - metade com bots aleatórios (pedido e alvo ao calhas entre os válidos);
  - metade com bots de memória (pedem a quem já pediu esse valor).
- Invariantes em cada passo:
  - **Conservação**: mãos + lago + 4 × peixinhos = 52.
  - Nenhuma mão tem 4 cartas do mesmo valor.
  - Jogador da vez tem sempre cartas (ou o jogo terminou).
  - Termina sempre; registar média e máximo de jogadas (limite de segurança: 5000 ações).
