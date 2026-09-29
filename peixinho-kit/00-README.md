# Peixinho — Kit para adicionar o jogo à plataforma

Quarto jogo da plataforma. A versão portuguesa do *Go Fish*: pedir cartas aos outros, ir à pesca e juntar "peixinhos" (4 cartas do mesmo valor).

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Alterações ao núcleo do kit da Fodinha (`GameResult` genérico, ações de sistema agendadas, configuração por jogo).
- Do kit do Blackjack, só o `createShoe` (usa `decks: 1`). Se o Blackjack ainda não estiver feito, o baralho simples atual também serve.

**Não exige nenhuma alteração nova ao núcleo.** É o primeiro jogo que prova que a plataforma já é extensível sem mexer no núcleo.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-PEIXINHO.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-PEIXINHO.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-PEIXINHO.md` | Estado, ações, algoritmos, vistas, eventos. |
| 04 | `04-NUCLEO.md` | Confirmação de que não há alterações ao núcleo + dependências. |
| 05 | `05-GUIAO-DE-PARTIDA.md` | Início de partida jogada a jogada, com baralho fixo. Teste de aceitação. |
| 06 | `06-UI-PEIXINHO.md` | Mesa, lago, pedir, pescar, balde de peixinhos, memória da mesa. |
| 07 | `07-TESTES-PEIXINHO.md` | Cenários obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões por fechar, com proposta por omissão. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Atenção: é um jogo de miúdos
Se crianças forem jogar com contas próprias, há duas implicações:
- Em Portugal, contas de menores de 13 anos em serviços online precisam de consentimento parental (RGPD).
- O chat livre em salas com crianças é um risco.

Proposta no 09 (#7): salas do Peixinho privadas por omissão e chat reduzido a frases pré-definidas.

## Como usar
1. Fecha o 09 ("ok" aceita as propostas).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
