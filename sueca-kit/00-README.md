# Sueca — Kit para adicionar o jogo à plataforma

Oitavo jogo da plataforma e o primeiro de **equipas**: 4 jogadores reais, 2 contra 2, parceiros frente a frente, baralho de 40 cartas, trunfo, obrigação de assistir. Objetivo de produto: **uma sueca limpa** — regras rigorosas, nenhuma batota possível, UI mínima e sem canais para sinais entre parceiros.

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Kit da Fodinha `04`: `GameResult` genérico, ações de sistema agendadas, configuração por jogo.
- `createShoe` (kit Blackjack `04` §1) com exclusão de valores (baralho de 40). Se ainda não suportar exclusão, acrescentar o parâmetro no `game-core` (previsto desde o kit da Mexicana: "baralho configurável").

**Duas alterações novas ao núcleo** (ver `04-NUCLEO.md`): escolha de lugares por equipas e política de pausa em desconexão. Ambas reutilizáveis em futuros jogos de equipas.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-SUECA.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-SUECA.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-SUECA.md` | Estado, ações, validação de assistir, vazas, pontuação, vistas, eventos. |
| 04 | `04-NUCLEO.md` | As duas alterações ao núcleo + dependências. |
| 05 | `05-GUIAO-DE-MAO.md` | Uma mão completa de 40 cartas, vaza a vaza. Teste de aceitação. |
| 06 | `06-UI-SUECA.md` | Mesa limpa, escolha de lugares, corte, trunfo, mão, vazas, marcador. |
| 07 | `07-TESTES-SUECA.md` | Cenários obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões fechadas + propostas a confirmar. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Fecha o 09 ("ok" aceita as propostas).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
