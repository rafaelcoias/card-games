# Desconfia — Kit para adicionar o jogo à plataforma

Quinto jogo da plataforma. O jogo da mentira: pousar cartas viradas para baixo, anunciar o valor (verdade ou não) e desconfiar dos outros.

## Pré-requisitos
- Plataforma base (kit da Mexicana, Fases 0–3).
- Alterações ao núcleo do kit da Fodinha (`GameResult` genérico, ações de sistema agendadas, configuração por jogo).
- **Fases simultâneas** do kit do Blackjack (`04`, ponto 2). Se o Blackjack ainda não estiver feito, essa alteração faz-se aqui (ver `04-NUCLEO.md`).

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-DESCONFIA.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-DESCONFIA.md` | Regras completas (fonte de verdade). |
| 03 | `03-CONTRATO-DESCONFIA.md` | Estado, ações, janela de desconfiança, algoritmos, vistas, eventos. |
| 04 | `04-NUCLEO.md` | Dependências e a única verificação ao núcleo. |
| 05 | `05-GUIAO-DE-PARTIDA.md` | Partida completa com baralho reduzido. Teste de aceitação. |
| 06 | `06-UI-DESCONFIA.md` | Mesa, anunciar, botão "Desconfia!", revelação, peixinhos. |
| 07 | `07-TESTES-DESCONFIA.md` | Cenários obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões fechadas + as poucas que faltam. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Fecha o 09 ("ok" aceita as propostas).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08.
