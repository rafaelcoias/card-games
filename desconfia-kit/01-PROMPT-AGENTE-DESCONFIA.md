# PROMPT — Adicionar o jogo "Desconfia" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo e fases simultâneas.

## Objetivo
Adicionar o **Desconfia** como módulo em `packages/games/desconfia`, com UI própria e a mesma qualidade visual dos outros jogos.

## Documentos
- `02-REGRAS-DESCONFIA.md` — regras (fonte de verdade)
- `03-CONTRATO-DESCONFIA.md` — estado, ações, janela de desconfiança, algoritmos, vistas, eventos
- `04-NUCLEO.md` — dependências; não alterar o núcleo além do que lá está
- `05-GUIAO-DE-PARTIDA.md` — teste de aceitação com baralho reduzido injetado
- `06-UI-DESCONFIA.md` — especificação visual e de interação
- `07-TESTES-DESCONFIA.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- Baralho de 54 cartas (com 2 jokers), todas distribuídas. Começa quem tem o 3 de paus.
- Na tua vez pousas, viradas para baixo, quantas cartas quiseres e anuncias o valor. Podes mentir. O joker conta sempre como o valor anunciado.
- O valor fica fixo até alguém desconfiar. Não se pode passar a vez.
- Qualquer jogador pode dizer "Desconfia!" da última jogada. Viram-se essas cartas: se era mentira, quem jogou leva a pilha toda; se era verdade, leva-a quem desconfiou.
- Quem ganha a desconfiança recomeça com o valor que quiser.
- 4 cartas iguais numa mão saem do jogo automaticamente.
- Ganha o primeiro a ficar sem cartas, desde que a última jogada sobreviva à desconfiança.

## Requisitos não negociáveis
1. **Mentir é parte do jogo.** O servidor aceita qualquer combinação de cartas com qualquer anúncio. O número de cartas pousadas é sempre verdadeiro (é visível na mesa), mas o valor anunciado pode não ser.
2. **Informação oculta.** O conteúdo da pilha nunca sai do servidor, exceto as cartas da última jogada quando há desconfiança. Mãos alheias: só contagens. Teste automático sobre todas as vistas.
3. **Janela de desconfiança justa e simples** (ver 03 §4): a primeira desconfiança que chega ao servidor ganha; cada desconfiança indica a jogada a que se refere, para não acertar numa jogada antiga.
4. **Vitória só depois da janela**: quem pousa as últimas cartas só ganha se ninguém desconfiar, ou se desconfiarem e for verdade.
5. **Reutilização visual** do baralho, dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.
