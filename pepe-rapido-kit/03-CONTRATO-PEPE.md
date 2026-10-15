# Contrato Técnico — Pepe Rápido

## 1. Configuração
```ts
const PepeConfigSchema = z.object({
  preset: z.enum(["CLASSICO", "PURO", "INICIANTE", "PERSONALIZADO"]).default("CLASSICO"),
  // regras
  direction: z.enum(["UP_DOWN", "UP_ONLY"]).default("UP_DOWN"),
  jokers: z.boolean().default(true),
  aceKingWrap: z.boolean().default(true),
  grouping: z.boolean().default(true),
  moveToEmpty: z.boolean().default(true),
  // informação visível
  showCentreCounts: z.boolean().default(false),
  showOwnReserveCount: z.boolean().default(true),
  showOpponentCounts: z.boolean().default(false),
  // ritmo
  countdownMs: z.number().int().min(1_000).max(5_000).default(3_000),
  autoFlip: z.boolean().default(false),
  autoFlipDelayMs: z.number().int().min(1_000).max(5_000).default(2_000),
  // partida
  rematch: z.boolean().default(true),
});

const PRESETS = {
  CLASSICO:  { direction: "UP_DOWN", jokers: true,  aceKingWrap: true, grouping: true, showCentreCounts: false, autoFlip: false },
  PURO:      { direction: "UP_DOWN", jokers: false, aceKingWrap: true, grouping: true, showCentreCounts: false, autoFlip: false },
  INICIANTE: { direction: "UP_ONLY", jokers: true,  aceKingWrap: true, grouping: true, showCentreCounts: true,  autoFlip: true  },
} as const;
// Mudar qualquer opção depois de escolher uma predefinição passa preset para "PERSONALIZADO".
// A configuração fica congelada no setup: o motor nunca lê opções da sala a meio da partida.
```
- `minPlayers: 2`, `maxPlayers: 2`, `lifecycle: "MATCH"` (uma partida = várias rondas).
- Baralho: `createShoe({ decks: 1, jokers: config.jokers })` → 54 ou 52 cartas; cada jogador recebe metade (27 ou 26).

## 2. Estado
```ts
type Phase = "COUNTDOWN" | "PLAYING" | "STALLED" | "CHOOSING_PILE" | "ROUND_SETUP" | "FINISHED";

interface PlayerArea {
  columns: CardInstance[][];          // 5 colunas; o último elemento é a carta de cima (visível)
  reserve: CardInstance[];
  wantsFlip: boolean;
}

interface PepeState {
  phase: Phase;
  config: PepeConfig;
  players: [PlayerId, PlayerId];
  areas: Record<PlayerId, PlayerArea>;
  centre: [CardInstance[], CardInstance[]];   // monte da esquerda e da direita; topo = último
  round: number;
  roundWinner: PlayerId | null;               // quem esvaziou as colunas
  winner: PlayerId | null;
  stateVersion: number;
  seed: string;
}
```

## 3. Ações
```ts
type PepeAction =
  | { type: "PLAY_TO_CENTRE"; column: number; pile: 0 | 1; expectedTopUid: string }
  | { type: "GROUP"; fromColumn: number; toColumn: number }
  | { type: "MOVE_TO_EMPTY"; fromColumn: number; toColumn: number }
  | { type: "REQUEST_FLIP" }
  | { type: "CHOOSE_PILE"; pile: 0 | 1 }       // só quem esvaziou as colunas
  | { type: "SYS_COUNTDOWN_DONE" }
  | { type: "SYS_ROUND_SETUP_DONE" }
  | { type: "SYS_AUTO_FLIP"; stateVersion: number };
```
- `expectedTopUid`: o cliente diz em que carta do topo estava a jogar. Se o topo já mudou (o outro foi mais rápido), a jogada é **rejeitada** mesmo que ainda fosse válida, para não haver surpresas ("joguei num 7 e afinal era um 9").

## 4. Validação
```ts
const VAL = { A: 1, J: 11, Q: 12, K: 13 } as any;
const v = (c: CardInstance) => VAL[c.rank] ?? Number(c.rank);

function fitsCentre(card, top, cfg): boolean {
  if (card.rank === "JOKER" || top.rank === "JOKER") return true;
  const up = v(card) === v(top) + 1 || (cfg.aceKingWrap && top.rank === "K" && card.rank === "A");
  if (cfg.direction === "UP_ONLY") return up;
  const down = v(card) === v(top) - 1 || (cfg.aceKingWrap && top.rank === "A" && card.rank === "K");
  return up || down;
}

function canGroup(card, target, cfg): boolean {
  if (!cfg.grouping) return false;
  return card.rank === "JOKER" || target.rank === "JOKER" || card.rank === target.rank;
}
// MOVE_TO_EMPTY só é válido com cfg.moveToEmpty.
```

## 5. Fluxo
```ts
// PLAY_TO_CENTRE: valida fase PLAYING, coluna com carta, topo === expectedTopUid, fitsCentre.
//   move a carta; a nova carta de cima da coluna fica visível; limpa wantsFlip dos dois.
//   se as 5 colunas do jogador ficaram vazias → fim de ronda (§6).
// GROUP / MOVE_TO_EMPTY: só nas próprias colunas; não mexem no centro.
// REQUEST_FLIP: marca wantsFlip; quando os dois querem (ou quem tem reserva, se o outro não tiver) → COUNTDOWN → vira.
// autoFlip: ao entrar em STALLED, o motor agenda SYS_AUTO_FLIP após autoFlipDelayMs (cancelado se alguém jogar entretanto).
// Deteção de bloqueio: depois de cada ação, se nenhum jogador tem jogada para o centro → phase STALLED
//   (a UI realça o botão "Virar"); agrupar/mover continua permitido.
```

## 6. Fim de ronda e preparação
```ts
function endRound(s, finisher) {
  if (s.areas[finisher].reserve.length === 0 && singleCentreMode(s)) return finishGame(s, finisher);  // §8 das regras
  s.roundWinner = finisher; s.phase = "CHOOSING_PILE";
}
function choosePile(s, p, pile) {
  const other = otherPlayer(s, p);
  const mine = s.centre[pile], theirs = s.centre[1 - pile];
  s.areas[p].pool = [...mine, ...s.areas[p].reserve];
  s.areas[other].pool = [...theirs, ...s.areas[other].reserve, ...flatten(s.areas[other].columns)];
  // baralhar cada pool com a seed (ronda) e montar colunas 1–5 + reserva (§3 das regras)
  s.round++; s.phase = "ROUND_SETUP";
}
```

## 7. Vista por jogador
```ts
interface PepePlayerView {
  phase: Phase; round: number;
  config: PepeConfig;                                                     // visível a ambos
  me: { columns: { top: CardInstance | null; hiddenCount: number }[]; reserveCount: number | null; wantsFlip: boolean };
  opponent: { columns: { top: CardInstance | null; hiddenCount: number }[]; hasReserve: boolean;
              totalCount: number | null; wantsFlip: boolean };
  centre: [{ top: CardInstance | null; count: number | null }, { top: CardInstance | null; count: number | null }];
  canChoosePile: boolean;
  stalled: boolean;
  countdownEndsAt: number | null;
  winner: PlayerId | null;
}
```
- Os campos de contagem só são preenchidos quando a opção correspondente está ligada; caso contrário vão a `null` **no servidor** (nunca escondidos só na UI):
  - `centre[i].count` ← `showCentreCounts`
  - `me.reserveCount` ← `showOwnReserveCount`
  - `opponent.totalCount` ← `showOpponentCounts`
- Os eventos seguem a mesma regra: nenhum evento revela contagens que a vista esconde.

## 8. Eventos de domínio
| Evento | Payload |
|---|---|
| `Played` | `{ playerId, column, pile, card, revealed: CardInstance \| null }` |
| `Rejected` | `{ playerId, action, reason: "TOP_CHANGED" \| "INVALID" }` (só para o próprio) |
| `Grouped` / `MovedToEmpty` | `{ playerId, from, to, card, revealed }` |
| `Stalled` | — |
| `Flipped` | `{ cards: [CardInstance \| null, CardInstance \| null] }` |
| `ColumnsEmptied` | `{ playerId }` |
| `PileChosen` | `{ playerId, pile }` |
| `RoundSetUp` | `{ round }` |
| `GameWon` | `{ playerId }` |

## 9. Resultado
- `WINNER` / `LOSER`; `score` = nº de rondas jogadas.
