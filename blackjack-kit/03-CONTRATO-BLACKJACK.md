# Contrato Técnico — Blackjack

## 1. Configuração
```ts
const BlackjackConfigSchema = z.object({
  decks: z.number().int().min(1).max(8).default(6),
  penetration: z.number().min(0.5).max(0.85).default(0.75),
  startingStack: z.number().int().multipleOf(10).min(100).max(100_000).default(1000),
  minBet: z.number().int().multipleOf(10).default(10),
  maxBet: z.number().int().multipleOf(10).default(500),
  dealerHitsSoft17: z.boolean().default(false),         // false = S17
  holeCard: z.enum(["PEEK", "EUROPEAN"]).default("PEEK"),
  blackjackPayout: z.literal("3:2").default("3:2"),     // 6:5 proibido
  doubleAfterSplit: z.boolean().default(true),
  maxHands: z.number().int().min(2).max(4).default(4),
  splitTensByValue: z.boolean().default(true),          // J+Q pode separar
  surrender: z.boolean().default(true),                 // late surrender
  insurance: z.boolean().default(true),
  allowRebuy: z.boolean().default(true),
  hintsEnabled: z.boolean().default(false),
  betTimeoutMs: z.number().int().default(15_000),
  decisionTimeoutMs: z.number().int().default(20_000),
  insuranceTimeoutMs: z.number().int().default(10_000),
}).refine(c => c.minBet <= c.maxBet && c.maxBet <= c.startingStack);
```
- `minPlayers: 1`, `maxPlayers: 7`.

## 2. Tipos base
```ts
type Chips = number;                         // inteiro, sempre múltiplo de 5
interface Hand {
  id: string;                                // "p1-h0", "p1-h1" após separar
  cards: CardInstance[];
  bet: Chips;
  doubled: boolean;
  fromSplit: boolean;
  splitAces: boolean;
  status: "PLAYING" | "STOOD" | "BUSTED" | "BLACKJACK" | "SURRENDERED" | "DONE";
  outcome?: "WIN" | "LOSE" | "PUSH" | "BLACKJACK" | "SURRENDER";
  payout?: Chips;                            // valor devolvido (aposta + ganho)
}
interface Seat {
  seatIndex: number;                         // 0..6, esquerda do dealer → direita
  playerId: PlayerId | null;
  stack: Chips;
  rebuys: number;
  pendingBet: Chips | null;
  lastBet: Chips | null;
  insurance: Chips | null;                   // null = não oferecido/recusado
  evenMoney: boolean;
  hands: Hand[];
  activeHandIndex: number;
  sittingOut: boolean;
  leaving: boolean;                          // sai no fim da ronda
}
```

## 3. Estado (servidor)
```ts
type Phase =
  | "BETTING" | "DEALING" | "INSURANCE" | "PEEK"
  | "PLAYER_TURNS" | "DEALER_TURN" | "SETTLEMENT" | "SHUFFLING";

interface BlackjackState {
  phase: Phase;
  config: BlackjackConfig;
  round: number;
  seats: Seat[];                             // 7 posições fixas
  turn: { seatIndex: number; handIndex: number } | null;
  dealer: { cards: CardInstance[]; holeRevealed: boolean };
  shoe: CardInstance[];                      // nunca sai do servidor
  cutCardIndex: number;
  cutCardReached: boolean;
  discard: number;                           // só contagem é pública
  phaseDeadline: number | null;              // preenchido pelo servidor
  stateVersion: number;
  seed: string;
}
```

## 4. Ações
```ts
type BlackjackAction =
  // jogador
  | { type: "PLACE_BET"; amount: Chips }
  | { type: "CLEAR_BET" }
  | { type: "INSURANCE"; take: boolean }
  | { type: "EVEN_MONEY"; take: boolean }
  | { type: "HIT" } | { type: "STAND" } | { type: "DOUBLE" } | { type: "SPLIT" } | { type: "SURRENDER" }
  | { type: "REBUY" }
  | { type: "SIT_OUT"; value: boolean }
  // sistema
  | { type: "SYS_BETTING_CLOSED" }
  | { type: "SYS_DEAL_STEP" }                // uma carta por passo
  | { type: "SYS_INSURANCE_CLOSED" }
  | { type: "SYS_PEEK" }
  | { type: "SYS_DECISION_TIMEOUT" }         // = STAND
  | { type: "SYS_DEALER_STEP" }              // revelar ou tirar 1 carta
  | { type: "SYS_SETTLE" }
  | { type: "SYS_NEXT_ROUND" }
  | { type: "SYS_SHUFFLE_DONE" }
  | { type: "SYS_PLAYER_JOINED"; playerId: PlayerId; seatIndex: number }
  | { type: "SYS_PLAYER_LEFT"; playerId: PlayerId };
```

## 5. Máquina de fases
```
BETTING ──(todos apostaram | timeout)──► DEALING ──(passos de distribuição)──►
  ├─ carta visível Ás e seguro ativo ──► INSURANCE ──► PEEK
  ├─ carta visível 10 (PEEK) ──────────────────────► PEEK
  └─ outra ───────────────────────────────────────► PLAYER_TURNS
PEEK ──(dealer blackjack)──► SETTLEMENT
     └─(sem blackjack)─────► PLAYER_TURNS
PLAYER_TURNS ──(todas as mãos fechadas)──► DEALER_TURN ──(dealer ≥17 ou nada a jogar)──► SETTLEMENT
SETTLEMENT ──► (cutCardReached ? SHUFFLING : BETTING)
SHUFFLING ──► BETTING
```
Tempos das ações de sistema: ver `05-DEALER-BOT.md`.

## 6. Algoritmos
```ts
function handValue(cards: CardInstance[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces++; total += 1; }
    else if (["J", "Q", "K"].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

const isBlackjack = (h: Hand) => !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;

function dealerShouldHit(cards: CardInstance[], hitSoft17: boolean): boolean {
  const { total, soft } = handValue(cards);
  return total < 17 || (hitSoft17 && total === 17 && soft);
}

function settleHand(h: Hand, dealer: CardInstance[]): { outcome: Hand["outcome"]; payout: Chips } {
  if (h.status === "SURRENDERED") return { outcome: "SURRENDER", payout: h.bet / 2 };
  const d = handValue(dealer), dBJ = dealer.length === 2 && d.total === 21;
  if (isBlackjack(h)) return dBJ ? { outcome: "PUSH", payout: h.bet } : { outcome: "BLACKJACK", payout: h.bet + (h.bet * 3) / 2 };
  if (h.status === "BUSTED") return { outcome: "LOSE", payout: 0 };
  if (dBJ) return { outcome: "LOSE", payout: 0 };
  const p = handValue(h.cards).total;
  if (d.total > 21 || p > d.total) return { outcome: "WIN", payout: h.bet * 2 };
  if (p === d.total) return { outcome: "PUSH", payout: h.bet };
  return { outcome: "LOSE", payout: 0 };
}
```
- `bet` é debitado do `stack` no momento de apostar/dobrar/separar; `payout` é creditado no `SETTLEMENT`.
- Com apostas múltiplas de 10: `bet/2` e `bet*3/2` são sempre inteiros.
- **Europeu (`holeCard = "EUROPEAN"`)**: o dealer só recebe a segunda carta no `DEALER_TURN`; se fizer blackjack, perde-se tudo o que estiver apostado nas mãos, incluindo dobras e separações (confirmar no 11 #2).

### Ações válidas
```ts
function validActions(s, seat, hand): BlackjackAction[] {
  // HIT/STAND: mão PLAYING e total < 21
  // DOUBLE: 2 cartas && stack >= bet && (!fromSplit || DAS) && !splitAces
  // SPLIT: 2 cartas mesmo valor && hands.length < maxHands && stack >= bet && !(splitAces)
  // SURRENDER: surrender ativo && primeira decisão && mão original única && 2 cartas
}
```

## 7. Vista por jogador
```ts
interface BlackjackPlayerView {
  phase: Phase; round: number; config: PublicConfig;
  dealer: { cards: (CardInstance | { hidden: true })[]; total: number | null; soft: boolean };
  seats: {
    seatIndex: number; playerId: PlayerId | null; name?: string;
    stack: Chips; rebuys: number; net: Chips;
    pendingBet: Chips | null; insurance: Chips | null;
    hands: { id: string; cards: CardInstance[]; bet: Chips; total: number; soft: boolean;
             status: Hand["status"]; outcome?: Hand["outcome"]; payout?: Chips }[];
    sittingOut: boolean; isMe: boolean;
  }[];
  turn: { seatIndex: number; handIndex: number } | null;
  shoe: { remaining: number; total: number; cutCardReached: boolean };   // só contagens
  discardCount: number;
  validActions: BlackjackAction[];
  hint: "HIT" | "STAND" | "DOUBLE" | "SPLIT" | "SURRENDER" | null;       // só se hintsEnabled
  phaseDeadline: number | null;
}
```
- A carta tapada do dealer aparece como `{ hidden: true }` até `holeRevealed`.
- `dealer.total` só mostra o valor da carta visível até à revelação.
- Cartas dos jogadores são públicas (em blackjack todas as cartas dos jogadores estão viradas para cima).

## 8. Eventos de domínio
| Evento | Payload |
|---|---|
| `BetPlaced` / `BetCleared` | `{ seatIndex, amount }` |
| `CardDealt` | `{ to: "DEALER" \| { seatIndex, handId }, card \| { hidden: true } }` |
| `InsuranceOffered` / `InsuranceTaken` | `{ seatIndex, amount }` |
| `DealerPeeked` | `{ blackjack: boolean }` |
| `HandSplit` | `{ seatIndex, fromHandId, newHandIds }` |
| `HandDoubled` / `HandSurrendered` / `HandBusted` / `HandStood` | `{ seatIndex, handId }` |
| `HoleCardRevealed` | `{ card }` |
| `HandSettled` | `{ seatIndex, handId, outcome, payout }` |
| `ShoeShuffled` | `{ decks }` |
| `PlayerRebought` | `{ seatIndex, stack }` |
