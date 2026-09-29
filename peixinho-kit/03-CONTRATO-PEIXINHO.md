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
