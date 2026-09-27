# PROMPT — Adicionar o jogo "Fodinha" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores de jogo puros, contrato `GameModule`, `GameRegistry`, vistas filtradas por jogador.

## Objetivo
Adicionar o segundo jogo, **Fodinha**, como módulo novo em `packages/games/fodinha`, com UI própria, reutilizando todo o núcleo (salas, sockets, auth, baralho, componentes de cartas, animações).

Isto é também o **teste de extensibilidade** da plataforma: se precisares de mexer no núcleo para além do que está em `04-ALTERACOES-AO-NUCLEO.md`, para e explica porquê antes de o fazer.

## Documentos
- `02-REGRAS-FODINHA.md` — regras (fonte de verdade)
- `03-CONTRATO-FODINHA.md` — estado, ações, vistas, eventos, algoritmos
- `04-ALTERACOES-AO-NUCLEO.md` — mudanças permitidas no núcleo
- `05-GUIAO-DE-PARTIDA.md` — partida de exemplo; tem de ser reproduzida por um teste automático com baralho fixo
- `06-UI-FODINHA.md` — especificação visual e de interação
- `07-TESTES-FODINHA.md` — cenários e invariantes obrigatórios
- `08-PLANO-FASES.md` — fases e critérios de aceitação
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as que estiverem fechadas, pergunta sobre as outras

## Resumo do jogo (detalhe no 02)
- Baralho de 52 cartas, sem jokers. 2 a 10 jogadores.
- Rondas com 1, 2, 3, 4, 5, 4, 3, 2, 1, 2… cartas por jogador.
- Antes de jogar, cada jogador aposta quantas vazas vai fazer (bloqueado após apostar).
- Quem falha a aposta leva os pontos da ronda. Se ninguém falhar, o valor acumula para a ronda seguinte.
- Ao atingir 5 pontos (configurável) perde-se e o jogo acaba. Pode perder mais do que um.
- Rondas de 1 carta são **às cegas**: vês as cartas dos outros, não a tua.
- Ganha a vaza a carta mais alta; o Ás de Ouros bate todos. Empate na carta mais alta: ninguém ganha a vaza.

## Requisitos não negociáveis
1. **Informação oculta à prova de fugas.** Na ronda às cegas, o servidor NUNCA envia a um jogador a sua própria carta; nas outras rondas, nunca envia as mãos alheias. Teste automático obrigatório que serializa cada `PlayerView` e verifica isto.
2. **Motor puro e determinístico**, com esperas (mostrar vaza, resumo de ronda) feitas através de ações de sistema agendadas pelo servidor (ver 04).
3. **Configuração por sala** validada com Zod: `maxPoints`, `maxHandSize`, temporizador, e as opções de variante do 09.
4. **Reutilização visual total**: baralho, feltro, componentes `Card`, animações e sons da Mexicana. Só criar componentes novos quando o 06 o pedir.
5. **Guião do 05 como teste**: com a ordem de baralho fixa do guião, o motor tem de produzir exatamente os resultados descritos.

## Método
- Segue o 08 fase a fase e para no fim de cada uma para aprovação.
- Antes de codificar, apresenta: diff proposto ao núcleo (04), tipos finais do 03, e a lista de testes do 07 que vais implementar.
- Não inventes regras. Se o 02 ou o 09 não cobrirem um caso, pergunta.
