# Testes Obrigatórios — Olho

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Distribuição e início
- 54 cartas distribuídas; diferenças de no máximo 1 carta.
- 1.º jogo começa quem tem o 3♣; jogos seguintes começa o Olho.

## 2. Validação de jogadas
- Combinação com valores diferentes → erro.
- Quantidade diferente da vaza → erro.
- Valor inferior → erro; igual → válido; superior → válido.
- Joker sozinho sobre carta única, par, tripla, quádrupla e 2s → válido; corta.
- Cortes com 2s: 1 dois sobre única e sobre par → válido; 1 dois sobre tripla → inválido; 2 dois sobre tripla → válido; 2 dois sobre única → válido; 3 dois sobre par → válido.
- Quádrupla de uma vez (incluindo quatro 2s) → corta sempre, mesmo com `fourOfAKindCuts = false`.
- Depois de um corte com 2s, a quantidade da vaza passa a ser o nº de 2s jogados.
- 2s sobre 2s: mais 2s → bate (1→2, 2→3, 1→3); o mesmo nº → salto; menos → inválido.
- Joker sobre qualquer quantidade de 2s → corta.
- Joker misturado com outras cartas → erro.
- Primeira vaza com `firstTrickNoPower`: 2 ou joker → erro (a abrir e a seguir); vaza 2 → válido.
- Quem passou volta a tentar jogar na mesma vaza → erro.

## 3. Salto
- Carta igual → seguinte saltado se não tiver a carta.
- Seguinte com a carta e `sameCardEscape` → pode ESCAPE (só com a mesma carta e quantidade) ou ACCEPT_SKIP.
- ESCAPE cria salto para o seguinte (cadeia).
- `sameCardEscape = false` → saltado sempre.
- Saltado não fica em `passed`; volta a jogar na mesma vaza.
- Timeout do escape → saltado.
- Pares iguais (par de 7 sobre par de 7) → salto aplicado com quantidade 2.

## 4. Cortes
- Joker corta e o autor abre a seguinte.
- Quatro iguais numa jogada (quádrupla) → corta sempre.
- Quatro iguais em várias jogadas (1+1+1+1, 2+2, 1+3) → corta.
- Joker pelo meio interrompe a sequência.
- `fourOfAKindCuts = false` → quatro iguais em várias jogadas não cortam (a quádrupla de uma vez continua a cortar).
- O 2 não corta: a vaza continua e um joker ainda o pode bater.

## 5. Fecho e liderança
- Todos os outros em jogo passaram → fecha; abre o último a jogar.
- Quem devia abrir já acabou → abre o seguinte em jogo.
- Corte por quem acabou de ficar sem cartas → abre o seguinte em jogo.

## 6. Acabar e cargos
- Cargos para 3, 4, 5 e 8 jogadores.
- `allowFinishWithPower = false`: jogada que esvazia a mão com 2/joker → rejeitada; com dois 2s pode jogar um e ficar com o outro.
- Jogador só com 2s/jokers e opção desligada → bloqueado: só passa; abertura passa ao seguinte.
- Todos os jogadores com cartas bloqueados → jogo termina; menos cartas = melhor; empate resolvido pela seed.
- Último com cartas → Olho, jogo termina.
- Pontos por cargo corretos e acumulados na sessão.

## 7. Troca
- O Olho entrega as 2 cartas mais fortes (joker > 2 > A > K…); empates resolvidos de forma determinística.
- O Presidente devolve qualquer 2 (incluindo as recebidas); número errado → erro.
- Vice-olho ↔ Vice-Presidente com 1 carta; com 3 jogadores não existe.
- Timeout → devolve as mais baixas.
- Trocas simultâneas: a fase só fecha quando ambas acabam.
- Cartas trocadas visíveis só aos envolvidos.

## 8. Segurança
- Nenhuma vista contém mãos alheias.
- `skipPrompt` só aparece ao alvo.

## 9. Sessão
- Entrar a meio → só joga no jogo seguinte, sem cargo.
- Sair a meio → passa automaticamente; pior posição livre.
- Terminar sessão → `GameResult` por pontos.

## 10. Guião
- Reproduzir `05-GUIAO-DE-SESSAO.md` com o baralho reduzido: cada vaza, cada tabela, cargos e pontos finais. Mais as três variantes.

## 11. Simulação
- 10 000 jogos com 3–8 bots aleatórios (escapes e passes ao calhas).
- Invariantes em cada passo:
  - **Conservação**: mãos + vaza + descarte = 54.
  - O jogador da vez tem cartas e não passou nesta vaza.
  - Na primeira vaza não aparece nenhum 2 nem joker (com a opção ligada).
- Cada jogo termina com todos os cargos atribuídos, também com `allowFinishWithPower = false`; limite de segurança de 5000 ações por jogo.
