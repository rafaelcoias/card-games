# Plataforma de Jogos de Cartas Online — Kit de Prompt

Conjunto de ficheiros para arrancar o projeto com um agente de código (Claude Code, Cursor, etc.) e para servir de referência durante o desenvolvimento.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE.md` | O prompt principal. Cola-se integralmente ao agente no arranque. |
| 02 | `02-REGRAS-MEXICANA.md` | Especificação completa do jogo. O agente lê-o na Fase 4; tu usas para validar. |
| 03 | `03-CONTRATO-E-EVENTOS.md` | Interface `GameModule`, eventos Socket.IO e modelo de dados. Fonte de verdade técnica. |
| 04 | `04-PLANO-FASES.md` | Fases de execução com critérios de "feito". Serve de checklist. |
| 05 | `05-PONTOS-EM-ABERTO.md` | Registo das decisões de regras (fechado). |
| 06 | `06-DESIGN-CARTAS-E-UI.md` | Especificação visual: baralho clássico, mesa, animações, performance. O agente lê-o na Fase 3. |
| 07 | `07-PROMPT-COMPLETO.md` | Os ficheiros 01 a 06 juntos num só, para colar tudo de uma vez ao agente. |

## Como usar
1. Regras fechadas (02 e 05). Qualquer alteração futura faz-se no 02.
2. Cola o 01 ao agente. Ele pede os ficheiros 02 e 03 quando chegar às fases certas — dá-lhos nessa altura, ou cola tudo de uma vez se o contexto aguentar.
3. Usa o 04 para aprovar cada fase antes de avançar para a seguinte.
4. Qualquer alteração de regra faz-se no 02 e nunca "de boca" ao agente — o ficheiro é a fonte de verdade.

## Convenções
- Todos os ficheiros em PT-PT. Código e identificadores em inglês.
- Nome de trabalho do projeto: `cardroom` (mudar à vontade).
