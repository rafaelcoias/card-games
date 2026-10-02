# Contrato Técnico — Gringo

## 1. Configuração
```ts
const GringoConfigSchema = z.object({
  redKingValue: z.union([z.literal(-3), z.literal(-1)]).default(-3),
  powerSet: z.enum(["FIGURAS", "SETE_A_DEZ"]).default("FIGURAS"),
  gringoEnabled: z.boolean().default(false),
  gringoMinTurns: z.number().int().min(1).max(20).default(5),
  snapWindowMs: z.number().int().min(2_000).max(6_000).default(3_000),
  decks: z.union([z.literal(1), z.literal(2)]).default(1),
  initialPeekMs: z.number().int().default(10_000),
  turnTimeoutMs: z.number().int().default(30_000),
  powerTimeoutMs: z.number().int().default(15_000),
});
```
- `minPlayers: 2`, `maxPlayers: 10`, `lifecycle: "MATCH"`.
- Baralho: `createShoe({ decks: config.decks, jokers: true })`.

## 2. Grelha com posições fixas
```ts
interface Slot { index: number; card: CardInstance | null }   // null = posição vazia (carta batida)
type Grid = Slot[];                                            // começa com índices 0–3; penalizações acrescentam 4, 5…
```
- Os índices **nunca mudam nem se reordenam**. Uma posição vazia mantém-se vazia (a UI mostra o espaço).
- Penalização → nova posição com o próximo índice livre.
- Trocas (troca própria, Valete, Rei) mudam o `card` de posições concretas.

## 3. Estado (servidor)
```ts
type Phase = "INITIAL_PEEK" | "TURN_DRAW" | "TURN_DECIDE" | "POWER" | "SNAP_WINDOW" | "FINISHED";

interface GringoState {
  phase: Phase;
  config: GringoConfig;
  seats: PlayerId[];
  currentIndex: number;
  turnsPlayed: Record<PlayerId, number>;
  grids: Record<PlayerId, Grid>;
  deck: CardInstance[];
  discard: CardInstance[];
  drawn: CardInstance | null;                    // carta tirada, só visível ao jogador da vez
  power: { type: PowerType; step: "CHOOSE" | "PEEKED"; peeked?: { owner: PlayerId; index: number } } | null;
  snap: { discardId: number; closesAt: number; taken: boolean } | null;
  nextDiscardId: number;
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  stateVersion: number;
  seed: string;
}

type PowerType = "PEEK_OTHER" | "BLIND_SWAP" | "PEEK_OWN" | "PEEK_AND_SWAP";
const POWERS = {
  FIGURAS:    { "10": "PEEK_OTHER", J: "BLIND_SWAP", Q: "PEEK_OWN", K: "PEEK_AND_SWAP" },
  SETE_A_DEZ: { "7": "PEEK_OTHER", "8": "BLIND_SWAP", "9": "PEEK_OWN", "10": "PEEK_AND_SWAP" },
};
```

## 4. Ações
```ts
type GringoAction =
  | { type: "CALL_GRINGO" }                                   // na vez, antes de DRAW
  | { type: "DRAW" }
  | { type: "SWAP_DRAWN"; index: number }                     // põe a tirada na posição; a antiga vai para o descarte
  | { type: "DISCARD_DRAWN"; usePower: boolean }
  | { type: "POWER_PEEK"; owner: PlayerId; index: number }    // PEEK_OTHER, PEEK_OWN, 1.º passo do PEEK_AND_SWAP
  | { type: "POWER_BLIND_SWAP"; myIndex: number; owner: PlayerId; theirIndex: number }
  | { type: "POWER_SWAP_DECISION"; swap: boolean; myIndex?: number }   // 2.º passo do PEEK_AND_SWAP
  | { type: "SNAP"; discardId: number; index: number }        // qualquer jogador com cartas, na janela
  | { type: "SYS_INITIAL_PEEK_END" }
  | { type: "SYS_SNAP_WINDOW_CLOSED"; discardId: number }
  | { type: "SYS_TIMEOUT" };
```

## 5. Algoritmos
```ts
const points = (c: CardInstance, cfg) =>
  c.rank === "JOKER" ? 0 :
  c.rank === "K" && (c.suit === "H" || c.suit === "D") ? cfg.redKingValue :
  ({ A: 1, J: 11, Q: 12, K: 13 } as any)[c.rank] ?? Number(c.rank);   // J/Q/K: 09 #1

function toDiscard(s, card) {                       // qualquer carta que vá para o descarte (exceto batidas)
  s.discard.push(card);
  s.snap = { discardId: s.nextDiscardId++, closesAt: now + cfg.snapWindowMs, taken: false };
  schedule("SYS_SNAP_WINDOW_CLOSED", cfg.snapWindowMs);
}

function snap(s, p, discardId, index) {
  assert(s.snap && !s.snap.taken && s.snap.discardId === discardId);
  const slot = s.grids[p][index]; assert(slot.card);
  s.snap.taken = true;                                       // mais ninguém pode
  const top = s.discard.at(-1)!;
  if (slot.card.rank === top.rank) {                         // mesmo valor (09 #6)
    s.discard.push(slot.card); slot.card = null;             // posição fica vazia
  } else {
    emit("SnapFailed", { p, index, card: slot.card });       // revelada a todos; fica na posição
    if (s.deck.length) s.grids[p].push({ index: nextIndex(s.grids[p]), card: s.deck.shift()! });
  }
}

function afterTurn(s) {
  // espera SYS_SNAP_WINDOW_CLOSED; depois:
  if (s.gringo) { remove current from s.gringo.remaining; if (s.gringo.remaining.length === 0) return finish(s); }
  if (s.deck.length === 0) return finish(s);                 // 09 #7
  advanceToNextWithCards(s);                                 // salta quem não tem cartas
}

function canCallGringo(s, p) {
  return s.config.gringoEnabled && !s.gringo
      && s.seats.every(q => s.turnsPlayed[q] >= s.config.gringoMinTurns || gridEmpty(s, q));
}
```
- `CALL_GRINGO` por um jogador sem cartas: o servidor oferece-lhe o botão quando a vez lhe calharia; se disser, `remaining` = todos os outros com cartas.

## 6. Vista por jogador
```ts
interface GringoPlayerView {
  phase: Phase;
  me: { id: PlayerId; grid: { index: number; empty: boolean; revealed?: CardInstance }[]; drawn: CardInstance | null };
  seats: { id: PlayerId; grid: { index: number; empty: boolean }[]; isCurrent: boolean; turnsPlayed: number }[];
  deckCount: number;
  discardTop: CardInstance | null;
  snapWindow: { discardId: number; closesAt: number; open: boolean } | null;
  power: { type: PowerType; step: string } | null;          // só para o jogador da vez
  peekResult: { owner: PlayerId; index: number; card: CardInstance } | null;  // só para quem espreitou, só nesse momento
  gringo: { calledBy: PlayerId; remaining: PlayerId[] } | null;
  validActions: GringoAction[];
  turnDeadline: number | null;
  final: { grids: Record<PlayerId, CardInstance[]>; scores: Record<PlayerId, number> } | null;
}
```
- `revealed` só existe durante o espreitar inicial (posições 3 e 4 do próprio).
- `peekResult` existe só durante o passo de poder; desaparece na ação seguinte.
- **Nunca** existe na vista um campo com o valor de uma carta virada para baixo fora destes momentos.

## 7. Eventos de domínio
| Evento | Payload (público, salvo indicação) |
|---|---|
| `InitialPeekStarted` / `InitialPeekEnded` | — (cartas só na vista do próprio) |
| `GringoCalled` | `{ playerId }` |
| `Drew` | `{ playerId }` (a carta só vai para o próprio) |
| `Swapped` | `{ playerId, index, discarded: CardInstance }` |
| `DiscardedDrawn` | `{ playerId, card, powerUsed: boolean }` |
| `Peeked` | `{ playerId, owner, index }` (valor só para quem espreitou) |
| `BlindSwapped` | `{ playerId, myIndex, owner, theirIndex }` |
| `PeekSwapDecided` | `{ playerId, swapped: boolean, myIndex? }` |
| `SnapSucceeded` | `{ playerId, index, card }` |
| `SnapFailed` | `{ playerId, index, card, penaltyIndex: number \| null }` |
| `PlayerOut` | `{ playerId }` (sem cartas) |
| `GameFinished` | `{ grids, scores, winners }` |

## 8. Resultado
- `WINNER`: menor pontuação (empates partilham).
- Restantes: `PLACED` por pontuação crescente; `score` = pontos.
