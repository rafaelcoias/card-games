# Contrato Técnico — Sueca

## 1. Configuração
```ts
const SuecaConfigSchema = z.object({
  targetGames: z.number().int().min(1).max(10).default(4),
  turnTimeoutMs: z.number().int().min(15_000).max(120_000).default(30_000),
  cutTimeoutMs: z.number().int().min(5_000).max(60_000).default(15_000),
  disconnectGraceMs: z.number().int().min(30_000).max(600_000).default(120_000),
});
```
- `minPlayers: 4`, `maxPlayers: 4`, `lifecycle: "MATCH"` (uma partida = várias mãos).
- `seating: { seats: ["S", "E", "N", "W"], teams: { A: ["S", "N"], B: ["E", "W"] } }` (ver 04 §1).
- `disconnectPolicy: "PAUSE"` (ver 04 §2).
- Baralho: `createShoe({ decks: 1, jokers: false, excludeRanks: ["8", "9", "10"] })`.

## 2. Ordem, força e pontos
```ts
const ORDER = ["A", "7", "K", "J", "Q", "6", "5", "4", "3", "2"];      // índice menor = mais forte
const POINTS = { A: 11, "7": 10, K: 4, J: 3, Q: 2 } as Record<string, number>;   // restantes 0
const PLAY_ORDER: Seat[] = ["S", "E", "N", "W"];                       // sentido contrário aos ponteiros do relógio
```

## 3. Estado
```ts
type Seat = "S" | "E" | "N" | "W";
type Phase = "CUT" | "PLAYING" | "TRICK_DONE" | "HAND_SUMMARY" | "PAUSED" | "FINISHED";

interface SuecaState {
  phase: Phase;
  pausedFrom: Phase | null;
  config: SuecaConfig;
  seats: Record<Seat, PlayerId>;
  handNumber: number;
  dealer: Seat;
  cutter: Seat;                                  // à esquerda de quem dá = anterior na PLAY_ORDER
  trumpCard: CardInstance | null;
  trumpSuit: Suit | null;
  trumpCardPlayed: boolean;
  hands: Record<Seat, CardInstance[]>;
  trick: { leader: Seat; plays: { seat: Seat; card: CardInstance }[] };
  lastTrick: { plays: { seat: Seat; card: CardInstance }[]; winner: Seat } | null;
  lastTrickViewsUsed: Record<Seat, number>;     // por mão (09 #3)
  wonCards: { A: CardInstance[]; B: CardInstance[] };
  tricksWon: { A: number; B: number };
  games: { A: number; B: number };               // jogos da partida
  history: HandSummary[];
  stateVersion: number;
  seed: string;
}

interface HandSummary { hand: number; points: { A: number; B: number }; gamesAwarded: { A: number; B: number }; dealer: Seat; trumpSuit: Suit }
```

## 4. Ações
```ts
type SuecaAction =
  | { type: "CHOOSE_CUT"; from: "TOP" | "BOTTOM" }   // só o cortador
  | { type: "PLAY"; cardUid: string }
  | { type: "VIEW_LAST_TRICK" }
  | { type: "SYS_CUT_TIMEOUT" }
  | { type: "SYS_TURN_TIMEOUT" }
  | { type: "SYS_TRICK_SHOWN" }                     // pausa para ver a vaza fechada (1200 ms)
  | { type: "SYS_NEXT_HAND" }
  | { type: "SYS_PAUSE"; seat: Seat } | { type: "SYS_RESUME" };
```

## 5. Algoritmos
```ts
function deal(s, from) {
  const deck = shuffledShoe(s.seed, s.handNumber);
  s.trumpCard = from === "TOP" ? deck[0] : deck[deck.length - 1];
  s.trumpSuit = s.trumpCard.suit;
  // remove a carta de trunfo do baralho, distribui 9 a quem dá + a carta de trunfo, 10 aos restantes
  // ordem de distribuição: começa no jogador à direita de quem dá (cosmético; determinístico pela seed)
}

function legalCards(s, seat): CardInstance[] {
  const hand = s.hands[seat];
  if (s.trick.plays.length === 0) return hand;                       // abrir: qualquer carta
  const leadSuit = s.trick.plays[0].card.suit;
  const follow = hand.filter(c => c.suit === leadSuit);
  return follow.length > 0 ? follow : hand;                           // assistir obrigatório
}

function trickWinner(plays, trumpSuit): Seat {
  const trumps = plays.filter(p => p.card.suit === trumpSuit);
  const pool = trumps.length ? trumps : plays.filter(p => p.card.suit === plays[0].card.suit);
  return pool.sort((a, b) => ORDER.indexOf(a.card.rank) - ORDER.indexOf(b.card.rank))[0].seat;
}

function gamesFor(points: number): number {
  if (points === 120) return 4;
  if (points >= 91) return 2;
  if (points >= 61) return 1;
  return 0;                                                           // inclui 60–60
}

function endHand(s) {
  const pA = sum(s.wonCards.A), pB = 120 - pA;
  const gA = gamesFor(pA), gB = gamesFor(pB);
  s.games.A += gA; s.games.B += gB;
  s.history.push({ hand: s.handNumber, points: { A: pA, B: pB }, gamesAwarded: { A: gA, B: gB }, dealer: s.dealer, trumpSuit: s.trumpSuit! });
  if (s.games.A >= s.config.targetGames || s.games.B >= s.config.targetGames) return finish(s);
  s.phase = "HAND_SUMMARY";                                           // agenda SYS_NEXT_HAND
}
// Próxima mão: dealer = seguinte na PLAY_ORDER; cutter = anterior ao novo dealer.

function timeoutCard(s, seat) {
  // carta legal de menor valor: menos pontos; empate → mais fraca na ORDER; empate → não trunfo antes de trunfo
}
```

## 6. Vista por jogador
```ts
interface SuecaPlayerView {
  phase: Phase;
  mySeat: Seat; myTeam: "A" | "B";
  seats: { seat: Seat; playerId: PlayerId; name: string; team: "A" | "B"; handCount: number; isCurrent: boolean; connected: boolean }[];
  myHand: CardInstance[];                         // ordenada: trunfo primeiro, depois naipes, ORDER dentro do naipe
  legalCardUids: string[];
  dealer: Seat; cutter: Seat;
  trump: { suit: Suit; card: CardInstance | null; holder: Seat };   // card = null depois de jogada
  trick: { leader: Seat; plays: { seat: Seat; card: CardInstance }[] };
  tricksWon: { A: number; B: number };            // só nº de vazas; pontos ficam escondidos até ao fim (09 #4)
  lastTrickAvailable: boolean;                    // há última vaza e ainda não usei a minha vez
  lastTrickView: { plays: { seat: Seat; card: CardInstance }[]; winner: Seat } | null;   // só durante os 3 s
  games: { A: number; B: number }; targetGames: number;
  handSummary: HandSummary | null;                // só em HAND_SUMMARY
  chatEnabled: boolean;                           // false durante a mão
  pause: { seat: Seat; resumeDeadline: number } | null;
  turnDeadline: number | null;
}
```

## 7. Eventos de domínio
| Evento | Payload |
|---|---|
| `HandStarted` | `{ hand, dealer, cutter }` |
| `CutChosen` | `{ cutter, from }` |
| `TrumpRevealed` | `{ card, holder }` |
| `CardPlayed` | `{ seat, card }` |
| `TrickWon` | `{ winner, team }` |
| `LastTrickViewed` | `{ seat }` (só informa que viu) |
| `HandEnded` | `HandSummary` |
| `GamePaused` / `GameResumed` | `{ seat }` |
| `MatchFinished` | `GameResult` |

## 8. Resultado
- Equipa com `games ≥ targetGames`: os dois jogadores `WINNER`; os outros dois `LOSER`.
- `score` = jogos da equipa.
- `summary`: histórico das mãos.
