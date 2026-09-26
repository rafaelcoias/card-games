# Contrato Técnico — GameModule, Eventos e Modelo de Dados

## 1. Interface `GameModule`
```ts
interface GameModule<State, Action, Config> {
  id: string;                          // "mexicana"
  name: string;
  minPlayers: number;
  maxPlayers: number;
  configSchema: ZodSchema<Config>;
  actionSchema: ZodSchema<Action>;

  setup(players: PlayerId[], config: Config, rng: Rng): State;
  applyAction(state: State, action: Action, playerId: PlayerId): Result<State, GameError>;
  getPlayerView(state: State, playerId: PlayerId): PlayerView;
  getSpectatorView(state: State): SpectatorView;
  getValidActions(state: State, playerId: PlayerId): Action[];
  getDefaultAction(state: State, playerId: PlayerId): Action;   // ao expirar o temporizador
  getCurrentPlayer(state: State): PlayerId | null;
  isFinished(state: State): boolean;
  getResult(state: State): GameResult;
}
```
- `Result<State, GameError>` — nunca lança exceções; devolve `{ ok, state, events }` ou `{ ok: false, error }`.
- `events` são eventos de domínio (`CardsPlayed`, `PileBurned`, `PlayerSkipped`, `PilePickedUp`, `CardRevealed`…) que o gateway traduz para mensagens de socket e animações.
- `GameRegistry` guarda os módulos por `id`; o núcleo só fala com a interface.

## 2. Ações da Mexicana
```ts
type MexicanaAction =
  | { type: "CHOOSE_FACE_UP"; cardIds: [CardId, CardId, CardId] }
  | { type: "PLAY_CARDS"; cardIds: CardId[] }          // 1+ do mesmo valor (só da mão); faceUp = 1
  | { type: "PLAY_FACE_DOWN"; position: 0 | 1 | 2 }    // às cegas
  | { type: "PICK_UP_PILE" }                            // apanha e perde a vez
  | { type: "TIMEOUT_PICK_UP" };                        // só o servidor emite (getDefaultAction) = PICK_UP_PILE
```

## 3. Estado da Mexicana (servidor)
```ts
interface MexicanaState {
  phase: "CHOOSING" | "PLAYING" | "FINISHED";
  players: Record<PlayerId, {
    hand: Card[];
    faceUp: Card[];
    faceDown: Card[];        // valores nunca saem do servidor
    finishedPosition: number | null;
  }>;
  turnOrder: PlayerId[];
  currentIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  burnPile: Card[];
  restriction: "none" | "reset" | "maxSeven";
  pendingSkips: number;      // 8s por resolver
  sameRankRun: number;       // contagem para quatro iguais (3 faz reset)
  turnTimeoutMs: number;     // 30_000 por omissão
  seed: string;
}
```

## 4. Eventos Socket.IO
### Cliente → Servidor
| Evento | Payload | Notas |
|---|---|---|
| `room:create` | `{ gameId, maxPlayers, isPrivate, config }` | |
| `room:join` | `{ code }` | |
| `room:leave` | — | |
| `room:ready` | `{ ready: boolean }` | |
| `room:start` | — | só anfitrião |
| `room:kick` | `{ playerId }` | só anfitrião |
| `room:chat` | `{ text }` | rate limited |
| `game:action` | `{ action }` | validado com `actionSchema` |

### Servidor → Cliente
| Evento | Payload | Notas |
|---|---|---|
| `room:state` | `RoomState` | lista de jogadores, ready, anfitrião |
| `room:chat` | `{ playerId, text, at }` | |
| `game:view` | `PlayerView` | vista filtrada, enviada por jogador |
| `game:events` | `DomainEvent[]` | para animações |
| `game:error` | `{ code, message }` | ação rejeitada |
| `game:finished` | `GameResult` | |
| `player:reconnected` / `player:disconnected` | `{ playerId }` | |

- Handshake: `auth: { token }` (JWT Supabase). Rejeitar sem token válido.
- Todos os payloads têm schema Zod em `packages/shared`.

## 5. Modelo de dados (Prisma)
```prisma
model Profile {
  id        String   @id            // = auth.users.id
  username  String   @unique
  avatarUrl String?
  createdAt DateTime @default(now())
  matches   MatchPlayer[]
}

model Room {
  id         String   @id @default(cuid())
  code       String   @unique
  gameId     String
  hostId     String
  isPrivate  Boolean
  maxPlayers Int
  status     RoomStatus   // OPEN | PLAYING | CLOSED
  createdAt  DateTime @default(now())
  matches    Match[]
}

model Match {
  id         String   @id @default(cuid())
  roomId     String
  gameId     String
  seed       String
  config     Json
  startedAt  DateTime
  finishedAt DateTime?
  room       Room     @relation(fields: [roomId], references: [id])
  players    MatchPlayer[]
  actions    MatchAction[]
}

model MatchPlayer {
  matchId       String
  profileId     String
  seat          Int
  finalPosition Int?
  match         Match   @relation(fields: [matchId], references: [id])
  profile       Profile @relation(fields: [profileId], references: [id])
  @@id([matchId, profileId])
}

model MatchAction {
  id        Int      @id @default(autoincrement())
  matchId   String
  seq       Int
  profileId String
  action    Json
  at        DateTime @default(now())
  match     Match    @relation(fields: [matchId], references: [id])
  @@unique([matchId, seq])
}
```
- Estado vivo da partida fica em **Redis**, não em Postgres. Postgres guarda seed + log de ações → qualquer partida é reconstruível por replay.

## 6. Reconexão
1. Socket cai → jogador marcado `disconnected`, temporizador de graça (por omissão 60 s).
2. Regressa com o mesmo JWT → recebe `game:view` completo e retoma.
3. Expira → ação por omissão em cada turno dele (`getDefaultAction`) até voltar; o anfitrião pode expulsá-lo.
