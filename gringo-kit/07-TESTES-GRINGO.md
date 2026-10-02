# Testes Obrigatórios — Gringo

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 4 cartas por jogador, índices 0–3; baralho com o resto (54 ou 108).
- Espreitar inicial: só as posições 3 e 4 do próprio aparecem na vista dele, e só durante `INITIAL_PEEK`.

## 2. Vez
- Fora de vez → erro. Tirar duas vezes → erro.
- Trocar: a antiga vai para o descarte e a tirada fica na posição exata.
- Descartar sem poder / com poder.
- Poder só a partir de carta tirada e descartada diretamente; carta de poder que sai por troca ou por batida → sem poder.
- Os dois conjuntos de poderes (`FIGURAS`, `SETE_A_DEZ`) mapeados corretamente.

## 3. Poderes
- Espreitar outro: `peekResult` só na vista de quem espreitou, só nesse passo.
- Espreitar a tua: idem.
- Trocar às cegas: as cartas trocam de posição exata; ninguém recebe valores.
- Espreitar e decidir: trocar e não trocar.
- Alvo sem cartas ou posição vazia → inválido.
- Timeout no poder → ignorado.

## 4. Bater
- Batida certa → posição vazia; a carta vai para o descarte.
- Batida errada → carta revelada, volta à mesma posição, nova posição com carta do baralho.
- Batida errada com baralho vazio → sem carta de penalização.
- Segunda batida no mesmo descarte → rejeitada.
- Batida com `discardId` antigo → rejeitada.
- 5 batidas simultâneas → exatamente uma aceite.
- Batida sobre carta batida → impossível (não abre janela).
- Rei vermelho bate Rei preto (mesmo valor); joker bate joker.
- Jogador da vez também pode bater.

## 5. Posições fixas
- Nenhuma operação altera os índices existentes; penalizações acrescentam o próximo índice.
- Posição vazia continua na grelha como `empty`.

## 6. Gringo
- Antes de todos terem `gringoMinTurns` voltas → inválido.
- Depois de tirar carta → inválido.
- Com `gringoEnabled = false` → nunca disponível.
- Depois do Gringo: quem chamou joga; cada um dos outros joga uma vez; termina.
- Jogador sem cartas pode chamar quando lhe calharia a vez.
- Segundo Gringo → inválido.

## 7. Fim e pontuação
- Baralho vazio → termina (09 #7).
- Pontos: Ás 1, números, J/Q/K (09 #1), Rei vermelho −3 / −1, joker 0, posições vazias 0.
- Menor pontuação ganha; empates partilham.

## 8. Segurança da informação
- Em nenhuma vista, fora dos momentos previstos, aparece o valor de uma carta virada para baixo (de ninguém, incluindo o próprio).
- `drawn` só na vista do jogador da vez.
- Eventos públicos de espreitar e trocar nunca contêm valores.

## 9. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` (cada tabela e a revelação final) e as três variantes.

## 10. Simulação
- 10 000 partidas com 2–10 bots (memória perfeita ou aleatória, batidas com probabilidade variável).
- Invariantes em cada passo:
  - **Conservação**: grelhas + baralho + descarte + carta tirada = 54 × `decks`.
  - Índices de posição estritamente crescentes por jogador e nunca reutilizados.
  - No máximo uma batida por `discardId`.
- Termina sempre (baralho finito); registar duração média por nº de jogadores.
