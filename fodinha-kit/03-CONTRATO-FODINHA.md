# Contrato Técnico — Fodinha

Implementa `GameModule` (ver contrato da plataforma, com as alterações do `04`).

## 1. Configuração
```ts
const FodinhaConfigSchema = z.object({
  displayName: z.string().default("Fodinha"),
  maxPoints: z.number().int().min(1).max(20).default(5),
  maxHandSize: z.number().int().min(1).max(10).default(5),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  lastBidderRestriction: z.boolean().default(false),       // 09 #1
});
// Validação cruzada no setup: players.length * maxHandSize <= 52
```
- `minPlayers: 2`, `maxPlayers: 10`.
- Baralho: `createDeck({ jokers: false })` do `game-core`.

## 2. Força das cartas
```ts
const RANK_STRENGTH = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14 };
const strength = (c: Card) => (c.rank === "A" && c.suit === "D") ? 15 : RANK_STRENGTH[c.rank];
```

## 3. Sequência de mãos
```ts
function handSizeForRound(round: number /* 1-based */, max: number): number {
  if (max === 1) return 1;
  const cycle = [...range(1, max), ...range(max - 1, 2)]; // max=5 → [1,2,3,4,5,4,3,2]
  return cycle[(round - 1) % cycle.length];
}
```

## 4. Estado (servidor)
```ts
type Phase = "BIDDING" | "PLAYING" | "TRICK_RESOLVED" | "ROUND_SCORED" | "FINISHED";

interface FodinhaState {
  phase: Phase;
  config: FodinhaConfig;
  seats: PlayerId[];                         // ordem dos ponteiros do relógio
  round: number;                             // 1-based
  handSize: number;
  starterIndex: number;                      // quem aposta e joga primeiro nesta ronda
  currentIndex: number;                      // de quem é a vez
  hands: Record<PlayerId, Card[]>;
  bids: Record<PlayerId, number | null>;
  tricksWon: Record<PlayerId, number>;
  trick: { leaderIndex: number; plays: { playerId: PlayerId; card: Card }[] };
  lastTrick: { plays: { playerId: PlayerId; card: Card }[]; winner: PlayerId | null } | null;
  tricksPlayed: number;
  points: Record<PlayerId, number>;
  carry: number;                             // rondas seguidas sem falhas
  history: RoundSummary[];
  losers: PlayerId[];
  seed: string;
}

interface RoundSummary {
  round: number; handSize: number; value: number;
  rows: { playerId: PlayerId; bid: number; won: number; failed: boolean; pointsAdded: number }[];
  carryAfter: number;
}
```

## 5. Ações
```ts
type FodinhaAction =
  // jogador
  | { type: "PLACE_BID"; bid: number }
  | { type: "PLAY_CARD"; cardId: CardId }        // ronda às cegas: ver 09 #6
  // sistema (só o servidor emite; ver 04)
  | { type: "SYS_RESOLVE_TRICK_DONE" }           // após mostrar a vaza
  | { type: "SYS_NEXT_ROUND" }                   // após o resumo da ronda
  | { type: "SYS_TIMEOUT" };                     // ao expirar o temporizador (09 #5)
```

### Transições
| Fase | Ação | Efeito |
|---|---|---|
| BIDDING | PLACE_BID (jogador da vez) | regista, avança; após o último → PLAYING, vez = starter |
| PLAYING | PLAY_CARD (jogador da vez) | carta sai da mão para `trick.plays`; após o último da vaza → resolve, `TRICK_RESOLVED` + agenda `SYS_RESOLVE_TRICK_DONE` (1200 ms) |
| TRICK_RESOLVED | SYS_RESOLVE_TRICK_DONE | se houver vazas por jogar → PLAYING, abre de novo o starter da ronda; senão pontua → `ROUND_SCORED` + agenda `SYS_NEXT_ROUND` (3500 ms) ou `FINISHED` |
| ROUND_SCORED | SYS_NEXT_ROUND | round+1, starter+1, distribui, BIDDING |

## 6. Algoritmos
```ts
function resolveTrick(plays: Play[]): PlayerId | null {
  const top = Math.max(...plays.map(p => strength(p.card)));
  const best = plays.filter(p => strength(p.card) === top);
  return best.length === 1 ? best[0].playerId : null;
}

function scoreRound(s: FodinhaState) {
  const value = 1 + s.carry;
  const failed = s.seats.filter(p => s.tricksWon[p] !== s.bids[p]);
  if (failed.length > 0) { failed.forEach(p => s.points[p] += value); s.carry = 0; }
  else { s.carry += 1; }
  s.losers = s.seats.filter(p => s.points[p] >= s.config.maxPoints);
  s.phase = s.losers.length ? "FINISHED" : "ROUND_SCORED";
}

function validBids(s: FodinhaState, player: PlayerId): number[] {
  const all = range(0, s.handSize);
  const isLast = s.seats.filter(p => s.bids[p] === null).length === 1;
  if (!s.config.lastBidderRestriction || !isLast) return all;
  const sum = s.seats.reduce((a, p) => a + (s.bids[p] ?? 0), 0);
  return all.filter(b => sum + b !== s.handSize);
}
```

## 7. Vista por jogador
```ts
interface FodinhaPlayerView {
  phase: Phase;
  round: number; handSize: number; roundValue: number; carry: number;
  blind: boolean;                                  // handSize === 1
  me: {
    id: PlayerId;
    hand: Card[] | null;                           // null na ronda às cegas
    handCount: number;
  };
  seats: {
    id: PlayerId;
    handCount: number;
    visibleHand: Card[] | null;                    // só na ronda às cegas, e nunca para "me"
    bid: number | null;
    tricksWon: number;
    points: number;
    isStarter: boolean;
  }[];
  currentPlayerId: PlayerId | null;
  bidsSum: number;
  trick: { playerId: PlayerId; card: Card }[];     // cartas já jogadas nesta vaza (públicas)
  lastTrick: { plays: { playerId: PlayerId; card: Card }[]; winner: PlayerId | null } | null;
  validActions: FodinhaAction[];                   // só do próprio
  history: RoundSummary[];
  losers: PlayerId[];
  turnDeadline: number | null;                     // epoch ms, preenchido pelo servidor
}
```
**Regra de ouro:** na ronda às cegas, `me.hand` é `null` e o próprio **não aparece** com `visibleHand` preenchido em nenhum sítio da vista. Nas outras rondas, `visibleHand` é `null` para todos.

## 8. Eventos de domínio (para animações)
| Evento | Payload |
|---|---|
| `RoundStarted` | `{ round, handSize, value, starterId, blind }` |
| `CardsDealt` | `{ counts }` (nunca as cartas) |
| `BidPlaced` | `{ playerId, bid, bidsSum }` |
| `CardPlayed` | `{ playerId, card }` |
| `TrickResolved` | `{ winner: PlayerId \| null, tiedPlayerIds: PlayerId[] }` |
| `RoundScored` | `RoundSummary` |
| `GameFinished` | `{ losers, survivors, points }` |
