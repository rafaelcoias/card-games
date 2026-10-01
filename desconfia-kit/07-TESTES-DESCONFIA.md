# Testes Obrigatórios — Desconfia

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 54 cartas distribuídas na totalidade; diferenças de no máximo 1 carta entre jogadores.
- Começa quem recebeu o 3♣, incluindo quando o 3♣ sai num peixinho na distribuição.
- Peixinhos na distribuição removidos e registados em `removedRanks`.

## 2. Jogar
- Fora de vez → erro. Antes do mínimo da janela → erro.
- 0 cartas → erro. Cartas que não estão na mão → erro.
- Anunciar JOKER → erro.
- Pilha em curso: anunciar valor diferente → erro. Pilha nova: qualquer valor.
- Sem limite de cartas (jogar 7 de uma vez é válido).

## 3. Verdade/mentira
- Todas do valor → verdade.
- Valor + jokers → verdade. Só jokers → verdade.
- Uma carta errada no meio de várias certas → mentira.
- Valor que já saiu em peixinho, jogado só com jokers → verdade; com qualquer outra carta → mentira.

## 4. Desconfiar
- Autor da jogada não pode desconfiar de si próprio.
- `playId` antigo → rejeitado.
- Duas desconfianças seguidas para o mesmo `playId` → só a primeira tem efeito.
- Mentira → autor leva a pilha; desconfiante recomeça.
- Verdade → desconfiante leva a pilha; autor recomeça.
- Depois da desconfiança, `claimRank = null`.
- Desconfiar depois de o seguinte já ter jogado → rejeitado (janela fechada).

## 5. Peixinhos
- Levar a pilha e juntar 4 iguais → removidos.
- Levar a pilha e juntar dois peixinhos → ambos removidos.
- Jokers nunca formam nem completam peixinho.

## 6. Fim
- Última carta + janela fecha sem desconfiança → vence.
- Última carta + desconfiança + verdade → vence.
- Última carta + desconfiança + mentira → leva a pilha, jogo continua.
- `playUntilEnd`: posições atribuídas por ordem de saída; o último fica `LOSER`.

## 7. Segurança
- Nenhuma vista contém cartas da pilha, exceto `lastReveal` depois de uma desconfiança.
- Nenhuma vista contém mãos alheias.
- `lastPlay` nunca contém as cartas.

## 8. Concorrência (integração com o servidor)
- 5 desconfianças enviadas no mesmo milissegundo por 5 clientes → exatamente uma aceite.
- Desconfiança e jogada do seguinte em simultâneo → a primeira processada ganha; a outra é rejeitada ou aplicada à jogada certa, sem estado inconsistente.

## 9. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` com o baralho reduzido e verificar cada tabela intermédia e o estado final.

## 10. Simulação
- 10 000 partidas com 3–8 bots (probabilidade de mentir e de desconfiar variáveis).
- Invariantes em cada passo:
  - **Conservação**: mãos + pilha + 4 × peixinhos removidos = 54.
  - Nenhuma mão contém 4 cartas naturais do mesmo valor.
  - `claimRank` nulo sempre que a pilha está vazia.
- Registar duração média e máxima; limite de segurança de 20 000 ações (partida que o ultrapasse é falha).
