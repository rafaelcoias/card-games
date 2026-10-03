# PROMPT — Adicionar o jogo "Sueca" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas e configuração por jogo.

## Objetivo
Adicionar a **Sueca** como módulo em `packages/games/sueca`, com a qualidade de um produto de referência: regras tradicionais portuguesas sem atalhos, impossibilidade total de batota pela plataforma e uma interface limpa.

## Documentos
- `02-REGRAS-SUECA.md` — regras (fonte de verdade)
- `03-CONTRATO-SUECA.md` — estado, ações, algoritmos, vistas, eventos
- `04-NUCLEO.md` — as duas únicas alterações ao núcleo permitidas
- `05-GUIAO-DE-MAO.md` — mão completa; teste automático obrigatório com baralho fixo
- `06-UI-SUECA.md` — especificação visual e de interação
- `07-TESTES-SUECA.md` — cenários e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 4 jogadores reais, 2 equipas, parceiros frente a frente; os jogadores escolhem os lugares.
- 40 cartas (sem 8, 9, 10). Ordem: Ás, 7, Rei, Valete, Dama, 6, 5, 4, 3, 2. Pontos: 11, 10, 4, 3, 2 (total 120).
- Quem corta escolhe se o trunfo é a carta de cima ou de baixo; o trunfo fica com quem dá.
- Joga-se no sentido contrário aos ponteiros do relógio; é obrigatório assistir; o servidor impede a renúncia.
- Mão: 61–90 = 1 jogo · 91–119 = 2 · 120 = 4 · 60–60 = ninguém pontua. Partida até 4 jogos (configurável).

## Requisitos não negociáveis
1. **Batota impossível.** O servidor só aceita cartas legais (assistir ao naipe). A UI só deixa tocar nas cartas legais.
2. **Sem sinais entre parceiros pela plataforma.** Chat da mesa bloqueado durante a mão; sem reações durante a mão. (Voz externa fica fora de âmbito.)
3. **Só 4 jogadores reais.** Sem bots. Se alguém cair, o jogo pausa (ver 04 §2).
4. **Informação oculta.** Mãos alheias nunca saem do servidor. A carta de trunfo é pública até ser jogada.
5. **"Ver última vaza" limitado** conforme o 02 §9.
6. **Interface limpa** (06): sem contadores de pontos durante a mão, sem decoração supérflua.
7. **Reutilização visual** do baralho e dos componentes existentes.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: diff ao núcleo (04), tipos finais do 03, lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta. Não inventes variantes regionais.
