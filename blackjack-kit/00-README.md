# Blackjack — Kit para adicionar o jogo à plataforma

Terceiro jogo da plataforma. Jogadores contra um **dealer automático** (bot), até 7 lugares por mesa, com fichas virtuais.

## Pré-requisitos
- Fases 0–3 do kit da Mexicana feitas (plataforma base).
- **Alterações ao núcleo do kit da Fodinha (`04-ALTERACOES-AO-NUCLEO.md`) feitas**: `GameResult` genérico, ações de sistema agendadas, configuração por jogo. O Blackjack depende das três.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-BLACKJACK.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-BLACKJACK.md` | Regras da mesa, pagamentos, fichas. Fonte de verdade. |
| 03 | `03-CONTRATO-BLACKJACK.md` | Estado, ações, fases, vistas, eventos, algoritmos. |
| 04 | `04-ALTERACOES-AO-NUCLEO.md` | Mudanças permitidas no núcleo (sapato, fases simultâneas, entrar/sair). |
| 05 | `05-DEALER-BOT.md` | Comportamento, ritmo e personalidade do dealer automático. |
| 06 | `06-ESTRATEGIA-BASICA.md` | Tabela de estratégia básica: botão de dica + bots de simulação. |
| 07 | `07-GUIAO-DE-SESSAO.md` | Sessão de exemplo com 3 jogadores e 3 rondas. Teste de aceitação. |
| 08 | `08-UI-BLACKJACK.md` | Mesa, fichas, apostas, ações, animações. |
| 09 | `09-TESTES-BLACKJACK.md` | Cenários obrigatórios, invariantes e validação estatística. |
| 10 | `10-PLANO-FASES.md` | Fases com critérios de "feito". |
| 11 | `11-PONTOS-EM-ABERTO.md` | Decisões por fechar, com proposta por omissão. |
| 12 | `12-PROMPT-COMPLETO.md` | 01 a 11 num só ficheiro. |

## Regra legal (não negociável)
Fichas **virtuais, sem valor monetário**: não se compram, não se trocam, não dão prémios. Qualquer coisa diferente transforma isto em jogo de fortuna ou azar regulado (SRIJ) e está fora de âmbito.

## Como usar
1. Fecha o 11 (propostas por omissão; "ok" aceita todas).
2. Cola o 01 (ou o 12) ao agente.
3. Aprova fase a fase com o 10. O guião (07) e a validação estatística (09) têm de passar antes da UI.
