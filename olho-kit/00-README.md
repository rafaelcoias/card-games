# Olho — Kit para adicionar o jogo à plataforma

Sexto jogo da plataforma. Versão portuguesa do jogo conhecido lá fora como *Presidente*: livrar-se das cartas primeiro, ganhar cargos e trocar cartas no jogo seguinte.

## Nome
O nome tradicional costuma ser abreviado para "Olho". Proposta: `id = "olho"`, nome visível configurável (`displayName`, por omissão "Olho"). Se a plataforma alguma vez for pública, evita problemas com filtros de conteúdo e lojas de apps.

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Kit da Fodinha `04`: `GameResult` genérico, ações de sistema agendadas, configuração por jogo.
- Kit do Blackjack `04`: ponto 2 (fases simultâneas, usado na troca de cartas) e ponto 3 (`lifecycle: "SESSION"`, os cargos passam de jogo para jogo).

**Sem alterações novas ao núcleo.**

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-OLHO.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-OLHO.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-OLHO.md` | Estado, ações, algoritmos (vaza, salto, cortes, troca), vistas, eventos. |
| 04 | `04-NUCLEO.md` | Dependências. |
| 05 | `05-GUIAO-DE-SESSAO.md` | Dois jogos completos com baralho reduzido, incluindo a troca. Teste de aceitação. |
| 06 | `06-UI-OLHO.md` | Mesa, cargos, combinações, saltos, cortes, troca, marcador. |
| 07 | `07-TESTES-OLHO.md` | Cenários obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Registo de todas as decisões (fechado). |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Regras fechadas (02 e 09).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
