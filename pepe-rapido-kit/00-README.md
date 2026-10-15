# Pepe Rápido — Kit para adicionar o jogo à plataforma

Nono jogo da plataforma e o primeiro em **tempo real sem vezes**: 2 jogadores jogam ao mesmo tempo para dois montes centrais; ganha quem se livrar de todas as cartas ao longo de várias rondas. (Família do jogo conhecido lá fora como *Spit* / *Speed*.)

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Kit da Fodinha `04`: `GameResult` genérico, ações de sistema agendadas, configuração por jogo.
- Kit do Blackjack `04` §1 (`createShoe`) e §2 (fases simultâneas).
- Kit do Desconfia `04`: fila única de ações por sala.

**Sem alterações novas ao núcleo.** A latência fica fora de âmbito nesta versão: ganha a ação que o servidor processa primeiro.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-PEPE.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-PEPE.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-PEPE.md` | Estado, ações em tempo real, validação, rondas, vistas, eventos. |
| 04 | `04-NUCLEO.md` | Dependências e a regra de UI otimista. |
| 05 | `05-GUIAO-DE-CENARIOS.md` | Cenários com estado injetado (jogadas, joker, agrupar, corrida, virar, fim de ronda, vitória). |
| 06 | `06-UI-PEPE.md` | Mesa, colunas, montes centrais, virar, tocar no monte, velocidade. |
| 07 | `07-TESTES-PEPE.md` | Cenários obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões fechadas + propostas a confirmar. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Fecha o 09 ("ok" aceita as propostas).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
