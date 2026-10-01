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


---

# Regras do Desconfia — Especificação (v1.0)

## 1. Objetivo
Ser o primeiro a ficar **sem cartas na mão**.

## 2. Material e jogadores
- Baralho de **54 cartas**: 52 + 2 jokers.
- **2 a 8 jogadores** (recomendado 3 ou mais) — ver 09 #6.

## 3. Preparação
- Baralhar e **distribuir todas as cartas**, uma a uma, pelos jogadores (alguns podem ficar com mais uma).
- **Peixinhos na distribuição:** quem receber 4 cartas do mesmo valor tira-as logo do jogo (ver 6).
- **Começa o jogador que recebeu o 3 de paus** (mesmo que o 3♣ tenha saído num peixinho).

## 4. Jogar
1. Na sua vez, o jogador pousa **uma ou mais cartas** viradas para baixo na pilha central e **anuncia** quantas são e o valor: *"Três Setes"*.
2. **Não há limite** de cartas por jogada.
3. **Valor anunciado:**
   - Quem abre uma pilha nova escolhe **qualquer valor**.
   - Os jogadores seguintes têm de anunciar **sempre o mesmo valor**, até alguém desconfiar.
4. **Pode mentir-se:** as cartas pousadas não têm de ser do valor anunciado.
5. **O joker** conta sempre como o valor anunciado (uma jogada só com jokers e cartas do valor anunciado é verdade).
6. **Não se passa a vez:** quem tem cartas joga sempre.
7. A ordem segue o sentido dos ponteiros do relógio.

## 5. Desconfiar
1. Depois de cada jogada, **qualquer outro jogador** pode dizer **"Desconfia!"** sobre essa jogada (só a última).
2. Viram-se **as cartas da última jogada** para todos verem:
   - **Mentira** (pelo menos uma carta não é do valor anunciado nem joker): quem jogou **leva a pilha toda** para a mão.
   - **Verdade**: quem desconfiou **leva a pilha toda** para a mão.
3. **Quem ganhou a desconfiança recomeça**: abre uma pilha nova com o valor que quiser.
   - Se quem desconfiou acertou, é ele que joga a seguir.
   - Se errou, joga a seguir quem tinha jogado (e falou verdade).
4. Só a última jogada é verificada; as cartas de baixo da pilha nunca são reveladas.

### Janela de desconfiança (online)
- Depois de cada jogada abre-se uma janela: dura **até o jogador seguinte jogar**, com um **mínimo de 2 s** (nesses 2 s o seguinte ainda não pode jogar).
- Quando a jogada deixa o jogador **sem cartas**, a janela é de **3 s** fixos.
- Se dois jogadores desconfiarem quase ao mesmo tempo, conta **o primeiro que chega ao servidor**.

## 6. Peixinhos
- **Sempre que um jogador tiver 4 cartas do mesmo valor na mão**, essas 4 cartas **saem do jogo** automaticamente e o valor fica visível a todos.
- Acontece na distribuição e sempre que alguém leva a pilha.
- Jokers não contam para peixinhos (09 #2).
- Um valor que já saiu em peixinho pode continuar a ser anunciado, mas, se for verificado, só será verdade se as cartas forem jokers.

## 7. Fim do jogo
- Um jogador que pousa as últimas cartas da mão **ganha** se:
  - ninguém desconfiar dentro da janela de 3 s; ou
  - alguém desconfiar e a jogada for verdade.
- Se desconfiarem e for mentira, leva a pilha e o jogo continua.
- Ver 09 #4 sobre continuar para atribuir posições.

## 8. Informação pública e privada
| Informação | Quem vê |
|---|---|
| A própria mão | só o próprio |
| Nº de cartas de cada jogador | todos |
| Nº de cartas na pilha | todos |
| Cada jogada: quem, quantas cartas, valor anunciado | todos |
| Cartas da última jogada quando há desconfiança | todos |
| Restantes cartas da pilha | ninguém (vão para a mão de quem a leva) |
| Peixinhos que saíram (valores) | todos |

## 9. Temporizador
- **30 s** por jogada; ao expirar, jogada automática (09 #5).


---

# Contrato Técnico — Desconfia

## 1. Configuração
```ts
const DesconfiaConfigSchema = z.object({
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  doubtMinWindowMs: z.number().int().min(1_000).max(5_000).default(2_000),
  lastCardWindowMs: z.number().int().min(2_000).max(8_000).default(3_000),
  playUntilEnd: z.boolean().default(false),          // 09 #4
});
```
- `minPlayers: 2`, `maxPlayers: 8`, `lifecycle: "MATCH"`.
- Baralho: `createShoe({ decks: 1, jokers: true })` (54). Testes podem injetar um baralho reduzido.

## 2. Estado (servidor)
```ts
interface DesconfiaState {
  phase: "PLAYING" | "FINISHED";
  config: DesconfiaConfig;
  seats: PlayerId[];                               // ordem dos ponteiros do relógio
  currentIndex: number;
  hands: Record<PlayerId, CardInstance[]>;
  pile: { playId: number; playerId: PlayerId; cards: CardInstance[]; claimRank: Rank; count: number }[];
  claimRank: Rank | null;                          // null = pilha nova (valor livre)
  doubtWindow: { playId: number; opensAt: number; minUntil: number; lastCard: boolean } | null;
  removedRanks: Rank[];                            // peixinhos fora de jogo
  finishedOrder: PlayerId[];                       // vencedor(es) por ordem
  nextPlayId: number;
  stateVersion: number;
  seed: string;
}
```

## 3. Ações
```ts
type DesconfiaAction =
  | { type: "PLAY"; cardUids: string[]; claimRank: Rank }   // claimRank tem de ser igual ao atual, se existir
  | { type: "DOUBT"; playId: number }                        // qualquer jogador exceto o autor da jogada
  | { type: "SYS_WINDOW_MIN_ELAPSED"; playId: number }       // liberta o jogador seguinte
  | { type: "SYS_LAST_CARD_WINDOW_CLOSED"; playId: number }  // confirma vitória
  | { type: "SYS_TIMEOUT" };
```

## 4. Janela de desconfiança
- Cada `PLAY` cria `playId` novo e abre `doubtWindow` para esse `playId`. O motor devolve `schedule`:
  - jogada normal: `SYS_WINDOW_MIN_ELAPSED` após `doubtMinWindowMs`;
  - jogada que esvazia a mão: `SYS_LAST_CARD_WINDOW_CLOSED` após `lastCardWindowMs`.
- O jogador seguinte só pode `PLAY` depois de `SYS_WINDOW_MIN_ELAPSED`. Quando ele joga, a janela anterior fecha (a nova abre-se para a jogada dele).
- `DOUBT` só é válido se `playId === doubtWindow.playId` e a janela está aberta. Desconfianças com `playId` antigo são rejeitadas sem efeito.
- **Concorrência:** o servidor processa as ações de cada sala em fila única (uma de cada vez). A primeira `DOUBT` válida fecha a janela; as seguintes chegam com a janela fechada e são rejeitadas. Não é preciso sorteio.

## 5. Algoritmos
```ts
function isTruthful(play): boolean {
  return play.cards.every(c => c.rank === "JOKER" || c.rank === play.claimRank);
}

function play(s, p, cardUids, claimRank) {
  assert(isCurrent(s, p) && windowMinElapsed(s));
  assert(cardUids.length >= 1 && allInHand(s, p, cardUids));
  assert(claimRank !== "JOKER");
  assert(s.claimRank === null || claimRank === s.claimRank);
  moveToPile(s, p, cardUids, claimRank);
  s.claimRank = claimRank;
  openWindow(s, lastCard = s.hands[p].length === 0);
  if (!lastCard) advanceTurn(s);                   // o seguinte fica bloqueado até ao mínimo
}

function doubt(s, doubter, playId) {
  const last = s.pile.at(-1)!;
  assert(s.doubtWindow?.playId === playId && doubter !== last.playerId);
  const truth = isTruthful(last);
  const loser = truth ? doubter : last.playerId;
  const winner = truth ? last.playerId : doubter;
  takePile(s, loser);                              // pilha toda para a mão de quem perdeu
  removePeixinhos(s, loser);
  s.claimRank = null;                              // pilha nova, valor livre
  s.doubtWindow = null;
  if (truth && s.hands[winner].length === 0) return declareWinner(s, winner);
  setCurrent(s, winner);
}

function removePeixinhos(s, p) {
  for (const rank of RANKS_WITHOUT_JOKER) {
    const cards = s.hands[p].filter(c => c.rank === rank);
    if (cards.length === 4) { remove(cards); s.removedRanks.push(rank); }
  }
}
```
- `declareWinner`: se `playUntilEnd` for falso, termina o jogo; se for verdadeiro, regista a posição e o jogador sai da rotação.
- `SYS_LAST_CARD_WINDOW_CLOSED` sem desconfiança → `declareWinner` do autor.

## 6. Vista por jogador
```ts
interface DesconfiaPlayerView {
  phase: "PLAYING" | "FINISHED";
  me: { id: PlayerId; hand: CardInstance[] };
  seats: { id: PlayerId; handCount: number; isCurrent: boolean; finishedPosition: number | null }[];
  pileCount: number;
  claimRank: Rank | null;
  lastPlay: { playId: number; playerId: PlayerId; count: number; claimRank: Rank } | null;   // sem cartas
  doubtWindow: { playId: number; canDoubt: boolean; minUntil: number; lastCard: boolean } | null;
  lastReveal: { playId: number; cards: CardInstance[]; truthful: boolean; loserId: PlayerId } | null;
  removedRanks: Rank[];
  validActions: DesconfiaAction[];
  turnDeadline: number | null;
  result: GameResult | null;
}
```

## 7. Eventos de domínio
| Evento | Payload |
|---|---|
| `Played` | `{ playId, playerId, count, claimRank }` |
| `DoubtCalled` | `{ playId, doubterId }` |
| `Revealed` | `{ playId, cards, truthful }` |
| `PileTaken` | `{ playerId, count }` |
| `PeixinhoRemoved` | `{ playerId, rank }` |
| `NewPile` | `{ starterId }` |
| `PlayerWon` | `{ playerId, position }` |
| `GameFinished` | `GameResult` |

## 8. Resultado
- O primeiro a acabar: `WINNER`.
- Restantes: `PLACED` pela ordem de saída (se `playUntilEnd`) ou por menos cartas na mão no fim; o último fica `LOSER` quando se joga até ao fim.
- `score` = cartas na mão no fim (menos é melhor).


---

# Núcleo — Dependências

O Desconfia não acrescenta alterações novas ao núcleo. Usa:

| Necessidade | Vem de |
|---|---|
| Baralho de 54 | `createShoe({ decks: 1, jokers: true })` |
| Desconfiar fora da vez (qualquer jogador) | **Fases simultâneas** — kit Blackjack, `04` ponto 2 |
| Janela de desconfiança e temporizadores | ações de sistema agendadas — kit Fodinha |
| Resultado com vencedor/posições | `GameResult` genérico — kit Fodinha |

**Se o Blackjack ainda não estiver feito:** implementar aqui só o ponto 2 do `04` do Blackjack (o gateway deixa de assumir um "jogador da vez" e valida apenas com `getValidActions`).

**Verificação obrigatória:** confirmar que o servidor processa as ações de cada sala **em fila única** (uma de cada vez). Se não estiver garantido, implementar uma fila por sala (Redis lock ou fila em memória por instância dona da sala). Sem isto, duas desconfianças simultâneas podem ser ambas aceites.


---

# Guião de Partida — Exemplo Completo

Teste automático obrigatório com o **baralho reduzido** abaixo (17 cartas, 1 joker), injetado só para teste. A janela de desconfiança é simulada pelas ações indicadas.

**Mesa:** Ana, Bruno, Carla (sentido dos ponteiros do relógio).

## Distribuição
| Jogador | Mão |
|---|---|
| Ana | 3♣ 3♥ 7♠ 7♦ K♠ JOKER |
| Bruno | 3♦ 7♥ 9♣ 9♦ Q♥ |
| Carla | 3♠ 7♣ 9♥ K♦ K♥ Q♠ |

Ana tem o **3♣ → começa**.

---

### Jogada 1 — Ana
Pousa **3♣ 3♥** e anuncia **"Dois Treses"** (verdade). Ninguém desconfia.
Pilha: 2 cartas · valor: Treses

### Jogada 2 — Bruno
Tem de anunciar Treses. Pousa **3♦ 9♣** e anuncia **"Dois Treses"** (mentira).
**Carla: "Desconfia!"** → revela 3♦ 9♣ → **mentira** → Bruno leva a pilha (4 cartas).

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 7♠ 7♦ K♠ JOKER | 7♥ 9♦ Q♥ 3♣ 3♥ 3♦ 9♣ | 3♠ 7♣ 9♥ K♦ K♥ Q♠ |
| Cartas | 4 | 7 | 6 |

Bruno tem três Treses (o 3♠ está com a Carla), por isso não há peixinho. **Carla acertou → recomeça.**

### Jogada 3 — Carla
Pousa **K♦ K♥** e anuncia **"Dois Reis"** (verdade).
**Bruno: "Desconfia!"** → revela K♦ K♥ → **verdade** → Bruno leva a pilha (2 cartas).
**Carla ganhou a desconfiança → recomeça.**

### Jogada 4 — Carla
Pousa **9♥ Q♠** e anuncia **"Dois Noves"** (mentira). Ninguém desconfia.

### Jogada 5 — Ana
Tem de anunciar Noves e não tem nenhum. Pousa **JOKER** e anuncia **"Um Nove"** (verdade, graças ao joker).
**Bruno: "Desconfia!"** → revela JOKER → **verdade** → Bruno leva a pilha (3 cartas: 9♥ Q♠ JOKER).
Nota: a mentira da Carla (jogada 4) nunca é revelada; só a última jogada é verificada.
**Ana ganhou → recomeça.**

| | Ana | Bruno | Carla |
|---|---|---|---|
| Mão | 7♠ 7♦ K♠ | 7♥ 9♦ Q♥ 3♣ 3♥ 3♦ 9♣ K♦ K♥ 9♥ Q♠ JOKER | 3♠ 7♣ |
| Cartas | 3 | 12 | 2 |

### Jogada 6 — Ana
Pousa **7♠ 7♦** e anuncia **"Dois Setes"** (verdade). Ninguém desconfia.

### Jogada 7 — Bruno
Pousa **7♥** e anuncia **"Um Sete"** (verdade). Ninguém desconfia.

### Jogada 8 — Carla
Pousa **3♠** e anuncia **"Um Sete"** (mentira; guarda o 7♣).
**Ana: "Desconfia!"** → revela 3♠ → **mentira** → Carla leva a pilha (4 cartas: 7♠ 7♦ 7♥ 3♠).
Carla fica com 7♣ 7♠ 7♦ 7♥ 3♠ → **peixinho de Setes sai do jogo**. Carla fica só com **3♠**.
**Ana acertou → recomeça.**

| | Ana | Bruno | Carla | Fora de jogo |
|---|---|---|---|---|
| Mão | K♠ | 11 cartas | 3♠ | 7♠ 7♦ 7♥ 7♣ |

### Jogada 9 — Ana (última carta)
Pousa **K♠** e anuncia **"Um Rei"** (verdade). A mão fica vazia → janela de 3 s.
**Bruno: "Desconfia!"** → revela K♠ → **verdade** → Bruno leva a pilha (1 carta).
Ana sem cartas e jogada confirmada → **Ana ganha**.

## Estado final
| | Ana | Bruno | Carla | Fora de jogo |
|---|---|---|---|---|
| Cartas | **0** | 12 | 1 | 4 |

Conservação: 0 + 12 + 1 + 4 = **17** ✓

## Variante a testar
Se na jogada 9 a Ana tivesse pousado o K♠ a anunciar outro valor numa pilha com valor fixo (ex.: "Um Sete" sobre Setes) e o Bruno desconfiasse, a Ana levava a pilha e o jogo continuava.


---

# UI do Desconfia

Reutiliza o baralho clássico (incluindo os 2 jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro bordô escuro (`#5A1E2B`) para dar ar de "jogo de bluff".
- Centro: **pilha** desarrumada (cartas viradas para baixo com rotações aleatórias), com contador grande.
- Por cima da pilha, **o valor em jogo**: "A pilha está em **Setes**". Pilha nova: "Valor livre".
- Adversários à volta: avatar, nome e **contador de cartas em destaque** (é a informação mais importante do jogo).
- Faixa discreta "Fora de jogo": os valores que já saíram em peixinho.

## 2. Mão
- Leque na base, ordenada por valor, jokers no fim.
- Seleção múltipla com toque (as cartas selecionadas sobem).

## 3. Jogar
1. Selecionar as cartas.
2. Escolher o valor a anunciar:
   - Pilha nova: grelha com os 13 valores.
   - Pilha em curso: o valor já vem fixo.
3. Botão com o anúncio completo: **"Jogar 3 como Setes"**.
- O botão fica bloqueado nos primeiros 2 s depois da jogada anterior, com um anel a encher (a janela dos outros).
- Temporizador de 30 s à volta do avatar.

## 4. Anúncio
- Balão no jogador: **"Três Setes"**, com as cartas a deslizarem viradas para baixo para a pilha.
- Histórico curto das últimas 3 jogadas da pilha atual, por baixo do valor em jogo.

## 5. "Desconfia!"
- Botão grande e vermelho, sempre visível para quem pode desconfiar enquanto a janela está aberta. Pulsa de leve.
- Atalho de teclado: **Espaço**.
- Ao carregar: o nome de quem desconfiou aparece num balão ("Desconfia!") e todos os botões desaparecem.

## 6. Revelação
- As cartas da última jogada sobem e viram para todos (flip de 400 ms, stagger 80 ms).
- Carimbo em cima: **MENTIRA!** (vermelho) ou **VERDADE!** (verde), 900 ms.
- A pilha inteira desliza para a mão de quem perdeu; o contador de cartas dele sobe com animação.
- Legenda: *"Carla acertou. Recomeça a Carla."*

## 7. Peixinho
- As 4 cartas saem da mão de quem as juntou, abrem-se em leque no centro (600 ms) e vão para a faixa "Fora de jogo".
- Legenda: **"Peixinho de Setes — fora de jogo"**.

## 8. Última carta
- Quando alguém pousa a última carta: anel de 3 s à volta da pilha e legenda *"Última carta! Alguém desconfia?"*.
- Ao fechar sem desconfiança: confettis discretos e ecrã de vitória.

## 9. Fim
- Vencedor em destaque; restantes ordenados por cartas na mão.
- Botões "Nova partida" e "Voltar ao lobby".

## 10. Tempos
| Momento | Duração |
|---|---|
| Distribuir 54 cartas | stagger 25 ms |
| Jogar cartas para a pilha | 300 ms |
| Bloqueio do seguinte | 2000 ms |
| Revelação (flip) | 400 ms + stagger 80 ms |
| Carimbo verdade/mentira | 900 ms |
| Pilha para a mão | 450 ms |
| Peixinho | 600 + 400 ms |
| Janela da última carta | 3000 ms |


---

# Testes Obrigatórios — Desconfia

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Preparação
- 54 cartas distribuídas na totalidade; diferenças de no máximo 1 carta entre jogadores.
- Começa quem recebeu o 3♣, incluindo quando o 3♣ sai num peixinho na distribuição.
- Peixinhos na distribuição removidos e registados em `removedRanks`.

## 2. Jogar
- Fora de vez → erro. Antes do mínimo da janela → erro.
- 0 cartas → erro. Cartas que não estão na mão → erro.
- Anunciar JOKER → erro.
- Pilha em curso: anunciar valor diferente → erro. Pilha nova: qualquer valor.
- Sem limite de cartas (jogar 7 de uma vez é válido).

## 3. Verdade/mentira
- Todas do valor → verdade.
- Valor + jokers → verdade. Só jokers → verdade.
- Uma carta errada no meio de várias certas → mentira.
- Valor que já saiu em peixinho, jogado só com jokers → verdade; com qualquer outra carta → mentira.

## 4. Desconfiar
- Autor da jogada não pode desconfiar de si próprio.
- `playId` antigo → rejeitado.
- Duas desconfianças seguidas para o mesmo `playId` → só a primeira tem efeito.
- Mentira → autor leva a pilha; desconfiante recomeça.
- Verdade → desconfiante leva a pilha; autor recomeça.
- Depois da desconfiança, `claimRank = null`.
- Desconfiar depois de o seguinte já ter jogado → rejeitado (janela fechada).

## 5. Peixinhos
- Levar a pilha e juntar 4 iguais → removidos.
- Levar a pilha e juntar dois peixinhos → ambos removidos.
- Jokers nunca formam nem completam peixinho.

## 6. Fim
- Última carta + janela fecha sem desconfiança → vence.
- Última carta + desconfiança + verdade → vence.
- Última carta + desconfiança + mentira → leva a pilha, jogo continua.
- `playUntilEnd`: posições atribuídas por ordem de saída; o último fica `LOSER`.

## 7. Segurança
- Nenhuma vista contém cartas da pilha, exceto `lastReveal` depois de uma desconfiança.
- Nenhuma vista contém mãos alheias.
- `lastPlay` nunca contém as cartas.

## 8. Concorrência (integração com o servidor)
- 5 desconfianças enviadas no mesmo milissegundo por 5 clientes → exatamente uma aceite.
- Desconfiança e jogada do seguinte em simultâneo → a primeira processada ganha; a outra é rejeitada ou aplicada à jogada certa, sem estado inconsistente.

## 9. Guião
- Reproduzir `05-GUIAO-DE-PARTIDA.md` com o baralho reduzido e verificar cada tabela intermédia e o estado final.

## 10. Simulação
- 10 000 partidas com 3–8 bots (probabilidade de mentir e de desconfiar variáveis).
- Invariantes em cada passo:
  - **Conservação**: mãos + pilha + 4 × peixinhos removidos = 54.
  - Nenhuma mão contém 4 cartas naturais do mesmo valor.
  - `claimRank` nulo sempre que a pilha está vazia.
- Registar duração média e máxima; limite de segurança de 20 000 ações (partida que o ultrapasse é falha).


---

# Plano de Fases — Desconfia

## Fase 0 — Verificação do núcleo
- Confirmar as dependências do `04`: fases simultâneas e fila única por sala.
- **Feito quando:** o teste de concorrência do `07` §8 passa numa sala de teste.

## Fase 1 — Motor
- `packages/games/desconfia`: config, estado, janela de desconfiança, algoritmos, vistas, timeouts, registo no `GameRegistry`.
- Todos os testes do 07, com guião e simulação.
- **Feito quando:** cobertura ≥ 90%, guião reproduzido, 10 000 partidas sem violar invariantes.

## Fase 2 — UI
- Componentes do 06: pilha, valor em jogo, seleção múltipla, anúncio, botão "Desconfia!", revelação com carimbo, peixinho, última carta.
- Página `/dev/desconfia` com estados fixos (pilha nova, pilha em curso, janela aberta, revelação mentira/verdade, peixinho, última carta, fim).
- **Feito quando:** estados aprovados, 60 fps, jogável em telemóvel.

## Fase 3 — Integração e E2E
- Partida via sockets com 4 contas (Playwright), incluindo desconfianças simultâneas e reconexão a meio de uma janela.
- **Feito quando:** 5 pessoas em redes diferentes jogam uma partida completa em produção sem estados inconsistentes.


---

# Pontos em Aberto — Desconfia

## Decisões fechadas
| Tema | Decisão |
|---|---|
| Valor anunciado | Livre a abrir; depois sempre o mesmo até alguém desconfiar |
| Cartas por jogada | Sem limite |
| Quem desconfia | Qualquer jogador; se acertar, joga a seguir |
| Passar a vez | Não se pode |
| Depois da desconfiança | Recomeça quem ganhou, com qualquer valor |
| Baralho | 54 cartas (2 jokers) |
| Quem começa | Quem tem o 3♣ |
| Peixinho | 4 iguais saem do jogo sempre que se juntam |
| Janela | Até o seguinte jogar, mínimo 2 s; última carta 3 s; vale a primeira desconfiança a chegar |

## Por fechar (proposta por omissão — "ok" aceita todas)
| # | Questão | Proposta |
|---|---|---|
| 1 | **4 iguais na pilha** também saem? (Ninguém sabe o que está na pilha, por isso só se pode detetar nas mãos) | Só nas mãos |
| 2 | **Jokers contam para peixinho?** | Não; peixinho são 4 cartas naturais |
| 3 | A **primeira jogada tem de incluir o 3♣**? | Não, quem o tem só começa |
| 4 | **Fim:** acaba no primeiro vencedor ou continua até sobrar um? | Acaba no primeiro, com opção de sala "jogar até ao fim" |
| 5 | **Tempo esgotado** (30 s) | Joga automaticamente 1 carta: do valor em jogo se tiver; senão uma ao calhas (com valor livre, anuncia o valor real) |
| 6 | **Nº de jogadores** | 2 a 8 (recomendado 3+) |


---

