# PROMPT — Adicionar o jogo "Pepe Rápido" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e fila única de ações por sala.

## Objetivo
Adicionar o **Pepe Rápido** como módulo em `packages/games/pepe-rapido`: jogo de velocidade para 2 jogadores, sem vezes, com a sensação de rapidez de um jogo físico.

## Documentos
- `02-REGRAS-PEPE.md` — regras (fonte de verdade)
- `03-CONTRATO-PEPE.md` — estado, ações, validação, rondas, vistas, eventos
- `04-NUCLEO.md` — dependências e UI otimista
- `05-GUIAO-DE-CENARIOS.md` — cenários de aceitação com estado injetado
- `06-UI-PEPE.md` — especificação visual e de interação
- `07-TESTES-PEPE.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 2 jogadores, 54 cartas (com jokers), 27 para cada.
- Cada jogador monta 5 colunas (1, 2, 3, 4 e 5 cartas); só se vê a carta de cima de cada coluna. O resto forma a sua reserva.
- Os dois viram uma carta da reserva para o centro, criando dois montes. A partir daí, **ao mesmo tempo**, cada um põe cartas das suas colunas nos montes centrais: uma acima ou uma abaixo da carta do topo.
- O joker vale qualquer carta. Cartas iguais podem agrupar-se nas colunas.
- Quando ninguém consegue jogar, os dois viram nova carta da reserva.
- Quem esvazia as colunas toca no monte central que quer levar (sem saber quantas cartas tem); o outro leva o outro monte. Cada um baralha o que tem e começa nova ronda.
- Ganha o primeiro a ficar sem cartas.

## Requisitos não negociáveis
1. **Tempo real, sem vezes.** Qualquer jogador age a qualquer momento; o servidor processa as ações da sala em fila única e valida cada uma contra o estado atual. Se dois jogarem para o mesmo monte ao mesmo tempo, vale a primeira; a segunda é rejeitada.
2. **UI otimista** (04): a carta move-se no toque; se o servidor rejeitar, volta para trás com uma animação curta. Nunca esperar pelo servidor para começar a animação.
3. **Informação oculta.** Cartas tapadas nas colunas, reservas e **o número de cartas de cada monte central** nunca saem do servidor (a escolha do monte é às cegas).
4. **Latência fora de âmbito** nesta versão, mas o código deve isolar a decisão "quem chegou primeiro" numa única função, para poder ser substituída mais tarde.
5. **Reutilização visual** do baralho (com jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.
