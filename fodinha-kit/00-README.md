# Fodinha — Kit para adicionar o jogo à plataforma

Segundo jogo da plataforma (depois da Mexicana). Pressupõe que as Fases 0–3 do kit da Mexicana estão feitas: monorepo, `game-core`, servidor de salas, lobby e mesa genérica com o baralho aprovado.

## Ficheiros

| # | Ficheiro | Para que serve |
|---|---|---|
| 01 | `01-PROMPT-AGENTE-FODINHA.md` | Prompt principal para o agente. |
| 02 | `02-REGRAS-FODINHA.md` | Especificação completa das regras. Fonte de verdade. |
| 03 | `03-CONTRATO-FODINHA.md` | Estado, ações, vistas por jogador, eventos, algoritmos. |
| 04 | `04-ALTERACOES-AO-NUCLEO.md` | As únicas mudanças permitidas no núcleo da plataforma (e porquê). |
| 05 | `05-GUIAO-DE-PARTIDA.md` | Partida completa de exemplo, ronda a ronda. Serve de teste de aceitação. |
| 06 | `06-UI-FODINHA.md` | Mesa, ronda às cegas, painel de apostas, marcador, animações. |
| 07 | `07-TESTES-FODINHA.md` | Cenários de teste obrigatórios e invariantes. |
| 08 | `08-PLANO-FASES.md` | Fases com critérios de "feito". |
| 09 | `09-PONTOS-EM-ABERTO.md` | Decisões por fechar, com proposta por omissão. |
| 10 | `10-PROMPT-COMPLETO.md` | 01 a 09 num só ficheiro. |

## Como usar
1. Fecha o ficheiro 09 (há propostas por omissão; basta dizer "ok" ou mudar).
2. Cola o 01 (ou o 10) ao agente.
3. Aprova fase a fase com o 08. O guião do 05 tem de correr como teste automático antes de avançar para a UI.

## Nota sobre o nome
O identificador técnico é `fodinha`, mas o **nome visível vem de configuração** (`displayName`). Entre amigos, tudo bem; se um dia a plataforma for pública (lojas de apps, anúncios), filtros de conteúdo podem implicar com o nome e assim trocas sem tocar em código.
