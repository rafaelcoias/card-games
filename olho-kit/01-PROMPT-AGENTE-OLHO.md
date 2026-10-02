# PROMPT — Adicionar o jogo "Olho" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e `lifecycle: "SESSION"`.

## Objetivo
Adicionar o **Olho** como módulo em `packages/games/olho`: sessão contínua de jogos em que a ordem de saída define cargos (Presidente, Vice-Presidente, Neutro, Vice-olho, Olho) e os cargos obrigam a trocar cartas no jogo seguinte.

## Documentos
- `02-REGRAS-OLHO.md` — regras (fonte de verdade)
- `03-CONTRATO-OLHO.md` — estado, ações, algoritmos, vistas, eventos
- `04-NUCLEO.md` — dependências; não alterar o núcleo
- `05-GUIAO-DE-SESSAO.md` — teste de aceitação com baralho reduzido injetado
- `06-UI-OLHO.md` — especificação visual e de interação
- `07-TESTES-OLHO.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 54 cartas (com jokers). Hierarquia: 3 < 4 < … < A < 2 < Joker. 3 a 8 jogadores.
- Joga-se carta única, par, tripla ou quádrupla; os seguintes respeitam o número de cartas e jogam igual ou mais alto.
- Carta igual à anterior salta o jogador seguinte, a não ser que ele jogue também essa carta.
- O joker corta tudo (fecha a vaza). Quatro cartas iguais seguidas também cortam. Quem corta abre a vaza seguinte.
- Quem passa já não volta a jogar nessa vaza. Na primeira vaza de cada jogo não se joga 2 nem joker.
- No 1.º jogo começa quem tem o 3♣; depois começa o Olho.
- A partir do 2.º jogo: o Olho dá as 2 melhores cartas ao Presidente (o servidor escolhe) e o Presidente devolve 2 à escolha; o Vice-olho e o Vice-Presidente trocam 1.
- A sessão acaba quando o anfitrião decide.

## Requisitos não negociáveis
1. **Troca de cartas sem batota possível.** O servidor escolhe as melhores cartas de quem dá. Quem recebe escolhe quais devolve, com temporizador.
2. **Informação oculta.** Mãos alheias: só contagens. As cartas trocadas só são vistas pelos dois envolvidos.
3. **Regras configuráveis** (02 §10), validadas com Zod, com os valores por omissão indicados.
4. **Motor puro e determinístico**, com baralho injetável.
5. **Reutilização visual** do baralho (incluindo jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.
