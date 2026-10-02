# Contrato Técnico — Olho

## 1. Configuração
```ts
const OlhoConfigSchema = z.object({
  displayName: z.string().default("Olho"),
  allowFinishWithPower: z.boolean().default(true),
  fourOfAKindCuts: z.boolean().default(true),
  sameCardEscape: z.boolean().default(true),
  firstTrickNoPower: z.boolean().default(true),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  escapeTimeoutMs: z.number().int().min(3_000).max(15_000).default(5_000),
  exchangeTimeoutMs: z.number().int().min(10_000).max(60_000).default(20_000),
});
```
- `minPlayers: 3`, `maxPlayers: 8`, `lifecycle: "SESSION"`.
- Baralho: `createShoe({ decks: 1, jokers: true })`.

## 2. Força das cartas
```ts
const STRENGTH = { "3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14,"2":15,"JOKER":16 };
```

## 3. Estado
```ts
type Role = "PRESIDENTE" | "VICE_PRESIDENTE" | "NEUTRO" | "VICE_OLHO" | "OLHO";

interface OlhoState {
  phase: "EXCHANGE" | "PLAYING" | "GAME_SUMMARY";
  config: OlhoConfig;
  gameNumber: number;
  seats: PlayerId[];                                 // ordem dos ponteiros do relógio
  roles: Record<PlayerId, Role | null>;              // do jogo anterior
  points: Record<PlayerId, number>;
  hands: Record<PlayerId, CardInstance[]>;
  exchange: {
    pairs: { giver: PlayerId; receiver: PlayerId; count: 1 | 2; given: CardInstance[]; returned: CardInstance[] | null }[];
  } | null;
  trick: {
    isFirstOfGame: boolean;
    count: number | null;                            // nº de cartas da combinação (null antes de abrir)
    topStrength: number | null;
    plays: { playerId: PlayerId; cards: CardInstance[] }[];
    passed: PlayerId[];
    sameRankRun: { rank: Rank; cards: number } | null;   // para os quatro iguais
    skip: { targetId: PlayerId; rank: Rank; count: number } | null; // salto pendente
    lastPlayerId: PlayerId | null;
  };
  currentPlayerId: PlayerId | null;
  finishOrder: PlayerId[];                           // ordem de saída neste jogo
  stateVersion: number;
  seed: string;
}
```

## 4. Ações
```ts
type OlhoAction =
  | { type: "PLAY"; cardUids: string[] }
  | { type: "PASS" }
  | { type: "ESCAPE"; cardUids: string[] }           // jogar a mesma carta para não ser saltado
  | { type: "ACCEPT_SKIP" }                          // não escapar
  | { type: "RETURN_CARDS"; cardUids: string[] }     // Presidente / Vice-Presidente na troca
  | { type: "SYS_TIMEOUT" }
  | { type: "SYS_EXCHANGE_TIMEOUT" }
  | { type: "SYS_NEXT_GAME" }
  | { type: "SYS_PLAYER_JOINED"; playerId: PlayerId } | { type: "SYS_PLAYER_LEFT"; playerId: PlayerId };
```

## 5. Algoritmos
### 5.1 Validar uma jogada
```ts
function canPlay(s, p, cards): boolean {
  const isJoker = cards.length === 1 && cards[0].rank === "JOKER";
  const sameRank = cards.every(c => c.rank === cards[0].rank) && cards[0].rank !== "JOKER";
  if (!isJoker && !sameRank) return false;
  if (s.trick.isFirstOfGame && s.config.firstTrickNoPower && (isJoker || cards[0].rank === "2")) return false;
  if (!s.config.allowFinishWithPower && wouldEmptyHand(s, p, cards) && isPower(cards)) return false;
  if (s.trick.count === null) return true;                       // abrir
  if (s.trick.passed.includes(p)) return false;
  if (isJoker) return true;                                      // corta qualquer coisa
  if (cards[0].rank === "2" && s.trick.topStrength === STRENGTH["2"]) {
    // 2s sobre 2s: mais 2s batem; o mesmo nº é carta igual (salto)
    return cards.length >= s.trick.count;
  }
  if (cards[0].rank === "2" && s.trick.topStrength! < STRENGTH["2"]) {
    // corte com 2s: pelo menos máx(1, N − 1) dois; pode usar-se mais
    if (cards.length >= Math.max(1, s.trick.count - 1)) return true;
  }
  return cards.length === s.trick.count && STRENGTH[cards[0].rank] >= s.trick.topStrength!;
}
// Depois de jogar 2s (corte ou escalada): s.trick.count = cards.length; s.trick.topStrength = 15
// "Igual" para efeitos de salto = mesmo valor E mesma quantidade que a jogada anterior
// isPower = 2 ou joker; wouldEmptyHand = a jogada esvazia a mão
```

### 5.2 Depois de uma jogada
```ts
function afterPlay(s, p, cards) {
  updateSameRankRun(s, cards);                    // joker faz reset
  const quad = cards.length === 4;                // quádrupla de uma vez: corta sempre
  const cut = isJoker(cards) || quad || (s.config.fourOfAKindCuts && s.trick.sameRankRun!.cards >= 4);
  if (handEmpty(s, p)) registerFinish(s, p, cards);
  if (gameOver(s)) return endGame(s);
  if (cut) return startNewTrick(s, leader = p);   // se p acabou: próximo em jogo
  const equal = previousStrength(s) === STRENGTH[cards[0].rank];
  if (equal) setPendingSkip(s, nextActive(s, p), cards[0].rank, cards.length);
  else advanceToNext(s, p);
}
```

### 5.3 Salto pendente
```ts
function resolveSkipTarget(s) {
  const { targetId, rank, count } = s.trick.skip!;
  const canEscape = s.config.sameCardEscape && countRank(s.hands[targetId], rank) >= count;
  if (canEscape) { s.currentPlayerId = targetId; /* ações válidas: ESCAPE | ACCEPT_SKIP */ }
  else { s.trick.skip = null; advanceToNext(s, targetId); }       // saltado: perde só esta vez
}
// ESCAPE → conta como jogada igual: volta a criar salto para o seguinte (e alimenta os quatro iguais)
// ACCEPT_SKIP → saltado; joga o seguinte
```

### 5.4 Fechar sem corte
- Depois de cada `PASS`: se todos os jogadores em jogo, exceto `lastPlayerId`, estão em `passed` → `startNewTrick(leader = lastPlayerId)` (ou o próximo em jogo, se ele já acabou).

### 5.5 Acabar e cargos
```ts
function registerFinish(s, p) { s.finishOrder.push(p); }
// Com allowFinishWithPower = false a jogada proibida nunca chega aqui (canPlay rejeita).

function isBlocked(s, p) {                     // só tem 2s/jokers e a opção está desligada
  return !s.config.allowFinishWithPower && s.hands[p].every(c => c.rank === "2" || c.rank === "JOKER")
         && !hasNonFinishingPowerPlay(s, p);   // ex.: dois 2s permitem jogar um e ficar com outro
}
// Bloqueado: só PASS; se for abrir, a abertura passa ao seguinte não bloqueado.
// Todos os que têm cartas bloqueados → fim do jogo; entre eles, menos cartas = melhor posição; empate → sorteio (seed).
// Ordem final = finishOrder + restantes
function assignRoles(order: PlayerId[]): Record<PlayerId, Role> {
  // 3: P, N, O · 4: P, VP, VO, O · 5+: P, VP, N…, VO, O
}
const POINTS = { PRESIDENTE: 2, VICE_PRESIDENTE: 1, NEUTRO: 0, VICE_OLHO: -1, OLHO: -2 };
```

### 5.6 Troca
```ts
function bestCards(hand, n) { return [...hand].sort(byStrengthDescThenSuit).slice(0, n); }
// Distribuição: começa num jogador sorteado (seed), uma carta de cada vez; as cartas a mais calham a quem calhar.
// EXCHANGE: o servidor move bestCards(Olho, 2) → Presidente e bestCards(ViceOlho, 1) → VicePresidente
// Espera RETURN_CARDS (qualquer carta da mão, incluindo as recebidas) com temporizador
// Timeout → devolve as mais baixas
// Quando todas as trocas fecham → PLAYING, começa o Olho
```

## 6. Vista por jogador
```ts
interface OlhoPlayerView {
  phase: OlhoState["phase"]; gameNumber: number; config: PublicConfig;
  me: { id: PlayerId; hand: CardInstance[]; role: Role | null };
  seats: { id: PlayerId; handCount: number; role: Role | null; points: number;
           passed: boolean; finishedPosition: number | null; isCurrent: boolean }[];
  trick: { count: number | null; plays: { playerId: PlayerId; cards: CardInstance[] }[];
           isFirstOfGame: boolean; sameRankRun: { rank: Rank; cards: number } | null };
  skipPrompt: { rank: Rank; count: number; deadline: number } | null;     // só para o alvo
  exchange: { iGive: CardInstance[] | null; iReceive: CardInstance[] | null; mustReturn: number | null; deadline: number | null } | null;
  validActions: OlhoAction[];
  turnDeadline: number | null;
  lastGameSummary: { order: PlayerId[]; roles: Record<PlayerId, Role> } | null;
}
```
- As cartas da troca só aparecem na vista dos dois envolvidos.

## 7. Eventos de domínio
| Evento | Payload |
|---|---|
| `GameDealt` | `{ gameNumber, counts }` |
| `ExchangeGiven` | `{ giver, receiver, count }` (cartas só para os envolvidos) |
| `ExchangeReturned` | `{ giver, receiver, count }` |
| `Played` | `{ playerId, cards }` |
| `Passed` | `{ playerId }` |
| `Skipped` | `{ playerId }` |
| `Escaped` | `{ playerId, cards }` |
| `Cut` | `{ playerId, reason: "JOKER" \| "QUAD" \| "FOUR_IN_A_ROW" }` |
| `TrickClosed` | `{ leaderId }` |
| `PlayerFinished` | `{ playerId, position }` |
| `PlayerBlocked` | `{ playerId }` (só tem 2s/jokers e a opção está desligada) |
| `GameEnded` | `{ order, roles, pointsDelta }` |

## 8. Resultado da sessão
- `PLACED` por pontos totais; `score` = pontos. Presidente com mais pontos = `WINNER`; último = `LOSER`.
