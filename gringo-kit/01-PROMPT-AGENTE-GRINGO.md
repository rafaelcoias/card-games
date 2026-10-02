# PROMPT — Adicionar o jogo "Gringo" à plataforma

## Papel
Atua como engenheiro de software sénior no projeto existente da plataforma de jogos de cartas (monorepo pnpm/Turborepo, Next.js, NestJS + Socket.IO, Redis, Postgres/Prisma, Supabase Auth). Conheces a arquitetura: servidor autoritativo, motores puros, `GameModule`, `GameRegistry`, vistas filtradas, `GameResult` genérico, ações de sistema agendadas, configuração por jogo, fases simultâneas e fila única de ações por sala.

## Objetivo
Adicionar o **Gringo** como módulo em `packages/games/gringo`, com UI própria e a mesma qualidade visual dos outros jogos.

## Documentos
- `02-REGRAS-GRINGO.md` — regras (fonte de verdade)
- `03-CONTRATO-GRINGO.md` — grelha, estado, ações, poderes, bater, vistas, eventos
- `04-NUCLEO.md` — dependências; não alterar o núcleo
- `05-GUIAO-DE-PARTIDA.md` — teste de aceitação com baralho fixo
- `06-UI-GRINGO.md` — especificação visual e de interação
- `07-TESTES-GRINGO.md` — cenários, segurança e invariantes
- `08-PLANO-FASES.md` — fases e critérios
- `09-PONTOS-EM-ABERTO.md` — decisões; implementa as fechadas e pergunta pelas outras

## Resumo do jogo (detalhe no 02)
- 54 cartas, 2 a 10 jogadores. Cada um recebe 4 cartas viradas para baixo, numa grelha com posições fixas, e só conhece 2.
- Na tua vez tiras do baralho e escolhes: trocar com uma carta tua (a antiga vai para o descarte) ou descartar a que tiraste. Se descartares uma carta com poder, podes usá-lo.
- Poderes (por omissão): 10 espreita uma carta de outro; Valete troca uma tua com uma de outro; Dama espreita uma tua; Rei espreita uma de outro e decide se troca.
- Sempre que cai uma carta no descarte, **um** jogador pode "bater" uma carta igual da sua grelha. Se errar, fica com ela e leva mais uma.
- Valores: Ás 1 … 10 vale 10; Joker 0; Reis vermelhos −3 (configurável −1).
- Fim: quando o baralho acaba, ou (opção) uma volta depois de alguém dizer "Gringo". Ganha quem tiver menos pontos.

## Requisitos não negociáveis
1. **Posições fixas.** Cada carta ocupa uma posição numerada na grelha do jogador e nunca muda de sítio sozinha. Trocas, batidas e penalizações mudam o conteúdo de posições concretas, sempre com animação. Posições vazias continuam visíveis como espaço vazio.
2. **Conhecimento por jogador.** O servidor nunca envia o valor de uma carta virada para baixo, exceto a quem a está a ver naquele momento (espreitar inicial, poder, carta tirada). Depois disso, a vista volta a não ter o valor: a memória é do jogador.
3. **Bater justo.** Uma única batida por descarte; a primeira que chega ao servidor ganha; cada batida indica o descarte a que se refere.
4. **Regras configuráveis** (02 §11), validadas com Zod.
5. **Reutilização visual** do baralho (incluindo jokers), dos componentes, das animações e dos sons.

## Método
- Segue o 08 fase a fase e para no fim de cada uma.
- Antes de codificar: tipos finais do 03 e lista de testes do 07.
- Caso não coberto no 02 ou no 09 → pergunta.
