# PROMPT — Adicionar o jogo "Blackjack" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas e configuração por jogo.

## Objetivo
Adicionar o **Blackjack** como módulo em `packages/games/blackjack`: até 7 jogadores humanos contra um **dealer automático**, com fichas virtuais por sessão, regras de mesa configuráveis e a mesma qualidade visual dos outros jogos.

## Documentos
- `02-REGRAS-BLACKJACK.md` — regras e pagamentos (fonte de verdade)
- `03-CONTRATO-BLACKJACK.md` — estado, ações, fases, vistas, eventos, algoritmos
- `04-ALTERACOES-AO-NUCLEO.md` — únicas alterações permitidas ao núcleo
- `05-DEALER-BOT.md` — comportamento e ritmo do dealer
- `06-ESTRATEGIA-BASICA.md` — tabela para dicas e bots de simulação
- `07-GUIAO-DE-SESSAO.md` — sessão de exemplo; teste automático obrigatório com sapato fixo
- `08-UI-BLACKJACK.md` — especificação visual
- `09-TESTES-BLACKJACK.md` — testes, invariantes, validação estatística
- `10-PLANO-FASES.md` — fases e critérios
- `11-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas, pergunta pelas outras

## Requisitos não negociáveis
1. **Fichas sem valor real.** Nenhuma compra, troca, levantamento, prémio ou integração de pagamentos. Não criar nada que se pareça com uma "loja de fichas".
2. **Informação oculta.** A carta tapada do dealer e a ordem do sapato nunca saem do servidor antes da revelação. Teste automático que serializa todas as vistas e verifica.
3. **Sapato baralhado no início**, com `crypto.randomInt`; as cartas saem pela ordem do sapato, nunca são geradas "na hora".
4. **Motor puro.** O dealer joga através de ações de sistema agendadas (uma carta de cada vez, com pausa para animação).
5. **Aritmética inteira.** Apostas em múltiplos de 10, de forma que 3:2, seguro e desistência dão sempre inteiros. Nunca usar floats para fichas.
6. **Validação estatística.** O motor com bots de estratégia básica tem de reproduzir a vantagem da casa esperada para as regras configuradas (ver 09). Se não bater, há bug; não se avança.
7. **Reutilização visual**: baralho, componentes `Card`, animações e sons existentes.

## Método
- Segue o 10 fase a fase e para no fim de cada uma.
- Antes de codificar: diff ao núcleo (04), tipos finais (03), lista de testes (09).
- Não inventes regras. Caso não coberto no 02 ou no 11 → pergunta.
