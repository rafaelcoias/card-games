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


---

# Regras do Peixinho — Especificação (v1.0)

## 1. Objetivo
Fazer o maior número de **peixinhos**: grupos de 4 cartas do mesmo valor (os quatro naipes). Há 13 peixinhos possíveis.

## 2. Material e jogadores
- Baralho de **52 cartas**, sem jokers.
- **2 a 6 jogadores** (ver 09 #1).

## 3. Preparação
- Baralhar e distribuir: **7 cartas** a cada jogador se forem **2**; **5 cartas** se forem **3 ou mais**.
- As restantes cartas formam o **lago** (monte de pesca), no centro da mesa, viradas para baixo.
- Se alguém receber logo um peixinho na distribuição, pousa-o de imediato (não dá jogada extra).
- **Quem começa:** ver 09 #4.

## 4. A vez de um jogador
1. O jogador **pede** a **um** outro jogador à escolha (que tenha cartas) um **valor** (ex.: "Tens setes?").
2. **Só pode pedir um valor de que tenha pelo menos uma carta na mão.**
3. **Se o outro tiver:** entrega **todas** as cartas desse valor. O jogador **continua a pedir** (a qualquer jogador, qualquer valor que tenha).
4. **Se o outro não tiver:** responde **"Vai à pesca!"** e o jogador tira **uma carta do lago**.
   - Se a carta pescada for **do valor que pediu**: mostra-a a todos e **joga outra vez**.
   - Se não for: fica com ela e a vez **passa ao jogador seguinte** no sentido dos ponteiros do relógio.
   - Se o lago estiver vazio: a vez passa.

## 5. Peixinhos
- Sempre que um jogador junta 4 cartas do mesmo valor, **pousa o peixinho** à sua frente, virado para cima.
- **Quem faz um peixinho joga outra vez**, mesmo que o tenha feito com a carta pescada que não era a pedida.
  - Ex.: pede Reis, vai à pesca, tira o quarto Oito → pousa o peixinho dos Oitos e joga outra vez.
- Um peixinho completado por **reposição** (ver 6) durante a vez de outro jogador é pousado, mas não dá jogada extra a ninguém.

## 6. Ficar sem cartas
- Quem ficar **sem cartas na mão** (por ter dado cartas ou pousado um peixinho) **vai buscar 4 cartas ao lago** de imediato.
- Se o lago tiver menos de 4, tira as que houver.
- Se as 4 cartas formarem um peixinho, pousa-o e volta a buscar 4.
- Se o lago estiver vazio, o jogador fica sem cartas e **é saltado** nas vezes seguintes (não pode pedir nem ser pedido).

## 7. Fim do jogo
- O jogo termina quando os **13 peixinhos** estiverem pousados.
- **Ganha quem tiver mais peixinhos.** Empate: ver 09 #5.
- Garantia: com o lago vazio, se só um jogador tiver cartas, todas as que tem formam peixinhos completos (as restantes cartas de cada valor já não existem noutras mãos), por isso o jogo termina sempre.

## 8. Informação pública e privada
| Informação | Quem vê |
|---|---|
| A própria mão | só o próprio |
| Número de cartas na mão de cada jogador | todos |
| Número de cartas no lago | todos |
| Pedidos ("Ana pediu Setes ao Bruno") e respostas ("deu 2" / "Vai à pesca!") | todos |
| Cartas entregues num pedido bem-sucedido | todos (o valor já é público) |
| Carta pescada | só quem pescou, **exceto** se for o valor pedido (mostra-se a todos) |
| Peixinhos pousados | todos |

## 9. Temporizador
- **30 s** para cada pedido.
- Ao expirar: pedido automático (ver 09 #6).


---

# Contrato Técnico — Peixinho

## 1. Configuração
```ts
const PeixinhoConfigSchema = z.object({
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  refillCount: z.number().int().min(1).max(7).default(4),
  tableMemory: z.enum(["NONE", "LAST_5", "FULL"]).default("LAST_5"),   // 09 #3
  pondPicking: z.boolean().default(true),                              // 09 #2
});
```
- `minPlayers: 2`, `maxPlayers: 6`, `lifecycle: "MATCH"`.
- Baralho: `createShoe({ decks: 1, jokers: false })`.
- Cartas iniciais: 7 com 2 jogadores, 5 com 3+ (regra fixa, não configurável).

## 2. Estado (servidor)
```ts
interface PeixinhoState {
  phase: "PLAYING" | "FINISHED";
  config: PeixinhoConfig;
  seats: PlayerId[];                               // ordem dos ponteiros do relógio
  currentIndex: number;
  hands: Record<PlayerId, CardInstance[]>;
  peixinhos: Record<PlayerId, Rank[]>;             // valores já pousados
  pond: CardInstance[];                            // lago; ordem fixada ao baralhar
  askLog: AskEntry[];                              // histórico completo (a vista filtra)
  stateVersion: number;
  seed: string;
}

interface AskEntry {
  seq: number;
  askerId: PlayerId;
  targetId: PlayerId;
  rank: Rank;
  result: { type: "GIVEN"; count: number } | { type: "GO_FISH"; caughtAsked: boolean; pondEmpty: boolean };
  peixinhoMade: Rank | null;
}
```

## 3. Ações
```ts
type PeixinhoAction =
  | { type: "ASK"; targetId: PlayerId; rank: Rank }
  | { type: "FISH"; pondPosition?: number }        // só quando pondPicking = true e depois de "Vai à pesca!"
  | { type: "SYS_TIMEOUT" };                        // pedido/pesca automáticos
```
- Com `pondPicking = true`, depois de um "Vai à pesca!" o motor fica num sub-estado `AWAITING_FISH` e espera por `FISH` (5 s; ao expirar pesca automaticamente).
- `pondPosition` é só visual: a ordem do lago foi fixada ao baralhar, e o motor mapeia a posição escolhida para uma carta desse lago baralhado. Escolher a posição não dá vantagem nenhuma.

## 4. Algoritmos
```ts
function ask(s, asker, target, rank) {
  assert(isCurrent(s, asker) && asker !== target);
  assert(s.hands[target].length > 0);
  assert(s.hands[asker].some(c => c.rank === rank));

  const matching = s.hands[target].filter(c => c.rank === rank);
  if (matching.length > 0) {
    move(matching, target → asker);
    refillIfEmpty(s, target, { extraTurn: false });
    const made = layDownPeixinhos(s, asker);
    refillIfEmpty(s, asker, { extraTurn: true });
    // o jogador continua sempre (recebeu cartas)
    return keepTurn(s, asker);
  }

  // Vai à pesca
  if (s.pond.length === 0) return passTurn(s);
  const card = s.pond.shift()!;                       // ou posição mapeada
  s.hands[asker].push(card);
  const caughtAsked = card.rank === rank;
  const made = layDownPeixinhos(s, asker);
  refillIfEmpty(s, asker, { extraTurn: true });
  if (caughtAsked || made.length > 0) return keepTurn(s, asker);
  return passTurn(s);
}

function layDownPeixinhos(s, p): Rank[] {
  const made: Rank[] = [];
  for (const rank of RANKS) {
    const cards = s.hands[p].filter(c => c.rank === rank);
    if (cards.length === 4) { remove(cards, s.hands[p]); s.peixinhos[p].push(rank); made.push(rank); }
  }
  return made;
}

function refillIfEmpty(s, p, _opts) {
  while (s.hands[p].length === 0 && s.pond.length > 0) {
    s.hands[p].push(...s.pond.splice(0, s.config.refillCount));
    layDownPeixinhos(s, p);                          // 4 iguais na reposição → pousa e volta a repor
  }
}

function keepTurn(s, p) {
  if (totalPeixinhos(s) === 13) return finish(s);
  if (s.hands[p].length === 0) return passTurn(s);  // sem cartas e lago vazio
  if (opponentsWithCards(s, p).length === 0) {       // só ele tem cartas → são peixinhos completos
    layDownPeixinhos(s, p); return finish(s);
  }
  return s;                                          // continua a vez
}

function passTurn(s) {
  // avança para o próximo jogador (ponteiros do relógio) com cartas; se ninguém tiver → finish
}
```

## 5. Vista por jogador
```ts
interface PeixinhoPlayerView {
  phase: "PLAYING" | "FINISHED";
  me: { id: PlayerId; hand: CardInstance[] };
  seats: { id: PlayerId; handCount: number; peixinhos: Rank[]; isCurrent: boolean; out: boolean }[];
  pondCount: number;
  awaitingFish: boolean;                             // é a minha vez de tocar no lago
  askLog: AskEntry[];                                // filtrado por tableMemory
  lastFishedByMe: CardInstance | null;               // a carta que eu pesquei (privada)
  validActions: PeixinhoAction[];
  turnDeadline: number | null;
  result: GameResult | null;
}
```
- Mãos alheias: só `handCount`.
- Carta pescada por outro: só aparece se `caughtAsked`.

## 6. Eventos de domínio
| Evento | Payload |
|---|---|
| `Asked` | `{ askerId, targetId, rank }` |
| `CardsGiven` | `{ from, to, cards }` |
| `GoFish` | `{ askerId }` |
| `Fished` | `{ playerId, card?: CardInstance }` (carta só se `caughtAsked`; a vista do próprio recebe-a sempre) |
| `PeixinhoMade` | `{ playerId, rank, extraTurn: boolean }` |
| `Refilled` | `{ playerId, count }` |
| `PlayerOut` | `{ playerId }` (sem cartas e lago vazio) |
| `TurnPassed` | `{ to: PlayerId }` |
| `GameFinished` | `GameResult` |

## 7. Resultado
- `WINNER`: o(s) jogador(es) com mais peixinhos (09 #5).
- Restantes: `PLACED` por número de peixinhos.
- `score` = número de peixinhos.


---

# Núcleo — Sem alterações

O Peixinho **não exige nenhuma alteração ao núcleo**. Usa o que já existe:

| Necessidade | Vem de |
|---|---|
| Baralho de 52 | `createShoe({ decks: 1 })` (kit Blackjack) ou baralho simples original |
| Resultado com vencedores e posições | `GameResult` genérico (kit Fodinha) |
| Temporizador de pedido e de pesca | ações de sistema agendadas (kit Fodinha) |
| Opções da sala (memória da mesa, pescar no lago) | `configUi` (kit Fodinha) |
| Salas, sockets, reconexão, auth | plataforma base |

Se durante a implementação surgir a necessidade de mexer no núcleo, trata-se de um sinal de alarme: o agente tem de parar e justificar antes.


---

# Guião de Partida — Início jogado a jogada

Teste automático obrigatório com o **baralho fixo** abaixo. Configuração por omissão (reposição de 4, lago a pescar pela ordem do topo).

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio). 3 jogadores → 5 cartas cada. Começa a Ana.

## Distribuição
| Jogador | Mão |
|---|---|
| Ana | 7♠ 7♥ K♣ 3♦ 9♠ |
| Bruno | 7♦ K♥ K♠ 2♣ 5♥ |
| Carla | 7♣ 3♠ 3♥ 4♥ 9♥ |

**Lago** (37 cartas), do topo para baixo: 4♣, K♦, 9♦, 2♦, 5♠, 6♣, Q♠, J♥, 8♠, 8♥, 10♣, A♠, … (restantes em qualquer ordem)

---

## Vez 1 — Ana
1. Pede **Setes** ao Bruno → Bruno tem 7♦ → entrega **1**. Ana: 7♠ 7♥ 7♦ K♣ 3♦ 9♠.
2. Continua. Pede **Setes** à Carla → Carla tem 7♣ → entrega **1**.
3. **Peixinho de Setes!** Ana pousa-o. Mão: K♣ 3♦ 9♠. Joga outra vez.
4. Pede **Reis** à Carla → **"Vai à pesca!"** → pesca **4♣** (não é Rei) → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | K♣ 3♦ 9♠ 4♣ | K♥ K♠ 2♣ 5♥ | 3♠ 3♥ 4♥ 9♥ |
| Peixinhos | 7 | — | — |
| Lago | 36 | | |

## Vez 2 — Bruno
1. Pede **Reis** à Ana → entrega K♣. Bruno: K♥ K♠ K♣ 2♣ 5♥.
2. Pede **Reis** à Carla → **"Vai à pesca!"** → pesca **K♦**, que é o valor pedido: mostra a todos.
3. **Peixinho de Reis!** Pousa. Mão: 2♣ 5♥. Joga outra vez (por ter pescado o pedido e por ter feito peixinho).
4. Pede **Cincos** à Carla → **"Vai à pesca!"** → pesca **9♦** → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 3♦ 9♠ 4♣ | 2♣ 5♥ 9♦ | 3♠ 3♥ 4♥ 9♥ |
| Peixinhos | 7 | K | — |
| Lago | 34 | | |

## Vez 3 — Carla
1. Pede **Treses** à Ana → entrega 3♦. Carla: 3♠ 3♥ 3♦ 4♥ 9♥.
2. Pede **Noves** à Ana → entrega 9♠. Ana fica só com 4♣.
3. Pede **Quatros** à Ana → entrega 4♣. **Ana fica sem cartas → vai buscar 4 ao lago**: 2♦ 5♠ 6♣ Q♠.
4. Pede **Noves** ao Bruno → entrega 9♦. Carla: 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦.
5. Pede **Treses** ao Bruno → **"Vai à pesca!"** → pesca **J♥** → a vez passa.

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 2♦ 5♠ 6♣ Q♠ | 2♣ 5♥ | 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦ J♥ |
| Peixinhos | 7 | K | — |
| Lago | 29 | | |

## Vez 4 — Ana
1. Pede **Cincos** ao Bruno → entrega 5♥. Ana: 2♦ 5♠ 5♥ 6♣ Q♠.
2. Pede **Doises** ao Bruno → entrega 2♣. **Bruno fica sem cartas → vai buscar 4**: 8♠ 8♥ 10♣ A♠.
3. Ana continua a vez… (o guião automático para aqui e verifica o estado)

**Estado esperado no fim do guião**
| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 2♦ 2♣ 5♠ 5♥ 6♣ Q♠ | 8♠ 8♥ 10♣ A♠ | 3♠ 3♥ 3♦ 4♥ 4♣ 9♥ 9♠ 9♦ J♥ |
| Peixinhos | 7 | K | — |
| Lago | 25 | | |
| Vez de | **Ana** | | |

Conservação: 6 + 4 + 9 + 25 + 8 (dois peixinhos) = **52** ✓

## Final ilustrativo (não automatizado)
A partida segue até aos 13 peixinhos. Exemplo de fecho: Ana 5 · Bruno 4 · Carla 4 → **Ana ganha**.


---

# UI do Peixinho

Reutiliza o baralho clássico, os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo. Tom visual um pouco mais leve e familiar que o Blackjack, mas com o mesmo baralho e a mesma qualidade.

## 1. Mesa
- Feltro com um toque azul-esverdeado (`#1D5C63`) para diferenciar dos outros jogos.
- Ao centro, o **lago**: as cartas do monte espalhadas "à balda", viradas para baixo, com rotações e posições aleatórias (fixas por partida, geradas por seed), como se faz na mesa de casa. Com o lago a esvaziar, as cartas desaparecem.
- Adversários à volta: avatar, nome, contador de cartas, e à frente o **balde** com os peixinhos pousados.
- Mão do jogador em leque na base, **agrupada por valor** (as cartas do mesmo valor juntas), com contador por grupo quando há 2 ou mais.

## 2. Pedir
1. Tocar num adversário (só os que têm cartas estão ativos).
2. Tocar num grupo de valor da própria mão (só os valores que tens).
3. Botão de confirmação com o texto completo: **"Pedir Setes à Ana"**.
- Atalho: arrastar uma carta da mão para cima do avatar do adversário faz as duas escolhas de uma vez.
- Temporizador de 30 s à volta do avatar.

## 3. Respostas
- Balão de fala no adversário:
  - Tem: **"Tenho! Toma 2."** → as cartas voam da mão dele para a tua (viradas para cima durante o voo) e juntam-se ao grupo.
  - Não tem: **"Vai à pesca!"** com um pequeno ícone de peixe.

## 4. Pescar
- Com `pondPicking` ativo: o lago ganha brilho e és tu a tocar numa carta (5 s; senão, escolha automática). A carta sobe, vira só para ti, e entra na mão.
- **Pescou o valor pedido:** a carta vira para todos, com animação de salto e som "splash", e a legenda *"Pescou o que pediu! Joga outra vez."*
- Não pescou: legenda discreta *"Passa a vez."* e o foco passa ao seguinte.

## 5. Peixinho
- As 4 cartas saem da mão, abrem-se em leque ao centro por 600 ms e seguem para o balde do jogador, empilhadas e ligeiramente rodadas, com o valor visível.
- Legenda: **"Peixinho de Setes! Joga outra vez."**
- Contador de peixinhos do jogador faz "pop".

## 6. Ficar sem cartas
- Legenda *"Sem cartas — vai buscar 4"*; 4 cartas voam do lago para a mão (stagger 80 ms).
- Lago vazio: avatar fica acinzentado com a etiqueta *"Fora de jogo"*.

## 7. Memória da mesa
- Painel lateral (ou faixa colapsável no telemóvel) com os últimos pedidos, conforme `tableMemory`:
  - "Ana pediu **Setes** ao Bruno — levou 1"
  - "Bruno pediu **Reis** à Carla — foi à pesca"
- `NONE` esconde o painel (modo "memória de verdade").

## 8. Marcador e fim
- Placar no topo: peixinhos de cada jogador e **"Peixinhos na mesa: 5 / 13"**.
- Fim: vencedor(es) em destaque, com os baldes de todos lado a lado; botões "Nova partida" e "Voltar ao lobby".

## 9. Tempos
| Momento | Duração |
|---|---|
| Distribuir | stagger 60 ms, 220 ms por carta |
| Balão de resposta | 900 ms |
| Cartas entregues | 350 ms, stagger 60 ms |
| Pescar (subir + virar) | 450 ms |
| Revelar pescado a todos | 400 ms |
| Peixinho (leque + balde) | 600 + 400 ms |
| Reposição de 4 | stagger 80 ms |


---

# Testes Obrigatórios — Peixinho

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 2 jogadores → 7 cartas; 3–6 → 5; lago com o resto.
- Peixinho na distribuição: pousado de imediato, sem jogada extra.

## 2. Pedidos
- Pedir fora de vez → erro.
- Pedir a si próprio → erro.
- Pedir valor que não se tem → erro.
- Pedir a jogador sem cartas → erro.
- Pedido bem-sucedido: entrega **todas** as cartas do valor (1, 2 e 3) e mantém a vez.

## 3. Pesca
- "Vai à pesca" + carta de outro valor → passa a vez ao seguinte.
- Carta do valor pedido → revelada a todos, mantém a vez.
- Carta de outro valor que completa um peixinho → pousa e mantém a vez.
- Lago vazio → passa a vez.
- `pondPicking`: qualquer posição escolhida dá uma carta válida do lago; timeout escolhe automaticamente.

## 4. Peixinhos
- Juntar 4 por pedido → pousa, mantém a vez.
- Juntar 4 por pesca → pousa, mantém a vez.
- Dois peixinhos na mesma jogada (ex.: recebe 2 de um valor que completa) → ambos pousados.

## 5. Reposição
- Quem pede fica sem cartas após pousar peixinho → repõe 4 e continua.
- Quem dá fica sem cartas → repõe 4 de imediato (não é a vez dele).
- Lago com < 4 → repõe o que houver.
- Reposição com 4 iguais → pousa e volta a repor.
- Lago vazio e mão vazia → jogador fica fora e é saltado; não pode ser alvo de pedidos.

## 6. Fim
- 13 peixinhos → FINISHED.
- Só um jogador com cartas e lago vazio → as cartas dele são peixinhos completos → pousa e termina.
- Vencedor único; empate segundo 09 #5.
- `GameResult` com `WINNER`/`PLACED` e `score`.

## 7. Segurança
- Nenhuma vista contém cartas de mãos alheias.
- Nenhuma vista contém cartas do lago.
- Carta pescada por outro jogador só aparece na vista quando `caughtAsked`.
- `askLog` na vista respeita `tableMemory`.

## 8. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` e verificar o estado esperado exato (mãos, peixinhos, lago = 25, vez da Ana).

## 9. Simulação
- 10 000 partidas com 2–6 bots:
  - metade com bots aleatórios (pedido e alvo ao calhas entre os válidos);
  - metade com bots de memória (pedem a quem já pediu esse valor).
- Invariantes em cada passo:
  - **Conservação**: mãos + lago + 4 × peixinhos = 52.
  - Nenhuma mão tem 4 cartas do mesmo valor.
  - Jogador da vez tem sempre cartas (ou o jogo terminou).
  - Termina sempre; registar média e máximo de jogadas (limite de segurança: 5000 ações).


---

# Plano de Fases — Peixinho

## Fase 1 — Motor
- `packages/games/peixinho`: config, estado, algoritmos do 03, vistas, ações válidas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 partidas simuladas sem violar invariantes, **zero alterações ao núcleo**.

## Fase 2 — UI
- Componentes do 06: lago "à balda", mão agrupada por valor, pedir (toque e arrastar), balões, pescar, peixinho no balde, reposição, memória da mesa, marcador.
- Página `/dev/peixinho` com estados fixos (pedir, "Vai à pesca!", pescou o pedido, peixinho, reposição, fim).
- **Feito quando:** estados aprovados visualmente, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida completa via sockets com 3 contas (Playwright), com reconexão a meio.
- **Feito quando:** 4 pessoas em redes diferentes jogam uma partida até aos 13 peixinhos em produção.


---

# Pontos em Aberto — Peixinho

Cada ponto tem proposta por omissão. "ok" aceita todas; ou responde só com os números a mudar.

| # | Questão | Proposta por omissão | Decisão |
|---|---|---|---|
| 1 | **Número de jogadores** | 2 a 6 | |
| 2 | **Pescar no lago**: o jogador toca na carta que quer tirar (como em casa), ou é automático do topo? | Tocar (5 s; senão automático). Não dá vantagem, a ordem já está baralhada | |
| 3 | **Memória da mesa**: mostrar o histórico de pedidos? Em casa depende da memória de cada um | Últimos 5 pedidos, com opção na sala para "nenhum" ou "todos" | |
| 4 | **Quem começa** | Aleatório na primeira partida; depois quem fez menos peixinhos (sorteado entre empatados) | |
| 5 | **Empate** no número de peixinhos | Vitória partilhada | |
| 6 | **Temporizador expira** (30 s) | Pedido automático: o valor de que tens mais cartas, a um adversário ao calhas | |
| 7 | **Crianças** a jogar | Salas do Peixinho privadas por omissão e chat reduzido a frases pré-definidas ("Boa!", "Oh não!", "Vai à pesca!") | |
| 8 | **Bots** para jogar sozinho ou completar a mesa | Fora do MVP; o motor fica preparado (os bots da simulação servem de base) | |


---

