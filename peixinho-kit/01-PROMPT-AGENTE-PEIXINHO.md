# PROMPT — Adicionar o jogo "Peixinho" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas e configuração por jogo.

## Objetivo
Adicionar o **Peixinho** (versão portuguesa do *Go Fish*) como módulo em `packages/games/peixinho`, com UI própria e a mesma qualidade visual dos outros jogos.

**Não é permitido alterar o núcleo.** Se achares que é preciso, para e explica porquê antes de mexer.

## Documentos
- `02-REGRAS-PEIXINHO.md` — regras (fonte de verdade)
- `03-CONTRATO-PEIXINHO.md` — estado, ações, algoritmos, vistas, eventos
- `04-NUCLEO.md` — dependências
- `05-GUIAO-DE-PARTIDA.md` — teste de aceitação com baralho fixo
- `06-UI-PEIXINHO.md` — especificação visual e de interação
- `07-TESTES-PEIXINHO.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- Baralho de 52 cartas. Distribuem-se 7 cartas a 2 jogadores, ou 5 cartas cada se forem mais; o resto forma o "lago".
- Na tua vez pedes a outro jogador um valor que tenhas na mão. Se ele tiver, entrega todas as cartas desse valor e continuas; se não tiver, vais à pesca.
- Se pescares o valor que pediste, jogas outra vez; senão passa a vez.
- 4 cartas do mesmo valor fazem um peixinho: pousa-se e joga-se outra vez.
- Quem fica sem cartas vai buscar 4 ao lago.
- Ganha quem fizer mais peixinhos.

## Requisitos não negociáveis
1. **O servidor substitui o "sistema de honra".** Não há respostas manuais: se o jogador pedido tem o valor, as cartas são entregues automaticamente. Ninguém pode mentir.
2. **Informação oculta.** Mãos alheias e lago nunca saem do servidor. A carta pescada só é revelada a todos quando é o valor pedido. Teste automático sobre todas as vistas.
3. **Motor puro e determinístico**, com baralho injetável para os testes.
4. **Reposição automática**: qualquer jogador (quem pede ou quem dá) que fique sem cartas vai buscar 4 ao lago no mesmo instante, se houver.
5. **Reutilização visual** do baralho clássico, dos componentes `Card`, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.
