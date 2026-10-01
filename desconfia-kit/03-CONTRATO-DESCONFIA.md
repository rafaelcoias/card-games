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
