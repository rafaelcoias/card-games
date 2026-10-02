# Gringo — Kit para adicionar o jogo à plataforma

Sétimo jogo da plataforma. Jogo de memória e pontos baixos: cada jogador tem uma grelha de 4 cartas viradas para baixo, só conhece 2, e vai trocando, espreitando e "batendo" cartas até o jogo acabar. Ganha quem tiver menos pontos.

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Kit da Fodinha `04`: `GameResult` genérico, ações de sistema agendadas, configuração por jogo.
- Kit do Blackjack `04` §1 (`createShoe` com 1 ou 2 baralhos) e §2 (fases simultâneas: espreitar no início e "bater" fora da vez).
- Kit do Desconfia `04`: fila única de ações por sala (o "bater" é uma corrida, como o "Desconfia!").

**Sem alterações novas ao núcleo.**

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-GRINGO.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-GRINGO.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-GRINGO.md` | Grelha com posições fixas, estado, ações, poderes, bater, vistas, eventos. |
| 04 | `04-NUCLEO.md` | Dependências. |
| 05 | `05-GUIAO-DE-PARTIDA.md` | Partida completa com baralho fixo. Teste de aceitação. |
| 06 | `06-UI-GRINGO.md` | Grelhas fixas, espreitar, trocar, bater, Gringo, revelação final. |
| 07 | `07-TESTES-GRINGO.md` | Cenários obrigatórios, segurança da informação e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões fechadas + propostas a confirmar. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Fecha o 09 ("ok" aceita as propostas).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
