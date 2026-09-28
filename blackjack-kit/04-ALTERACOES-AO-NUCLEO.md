# Alterações ao Núcleo — Blackjack

Pressupõe feitas as alterações do kit da Fodinha (`GameResult` genérico, ações de sistema agendadas, `configUi`). Estas são as **únicas** alterações adicionais permitidas. Mexicana e Fodinha continuam verdes.

## 1. Sapato com vários baralhos
**Problema:** o `game-core` cria um baralho de 52/54 com ids únicos por carta ("AS"). Com 6 baralhos há seis "AS".

**Solução:**
```ts
interface CardInstance { uid: string; id: CardId; rank: Rank; suit: Suit }  // uid = "AS#3"
createShoe({ decks: number, jokers: boolean }): CardInstance[]
```
- `id` continua a identificar a face (para desenhar); `uid` identifica a instância física.
- Mexicana e Fodinha passam a usar `createShoe({ decks: 1 })`; o `uid` coincide com o id + "#0". Ajustar tipos, sem mudar comportamento.

## 2. Fases simultâneas
**Problema:** o gateway assume sempre um "jogador da vez" e um temporizador por jogador. No Blackjack, apostas e seguro são **simultâneos**.

**Solução:**
- `getCurrentPlayer` pode devolver `null`; o gateway valida apenas com `getValidActions(state, playerId)`.
- Temporizadores passam a ser **por fase**, pedidos pelo motor através do `schedule` (já existente), nunca inferidos pelo gateway.
- `phaseDeadline` é preenchido pelo servidor na vista para a UI mostrar a contagem.

## 3. Entrar e sair entre rondas
**Problema:** hoje uma partida começa com jogadores fixos e acaba. O Blackjack é uma **sessão contínua**.

**Solução no contrato:**
```ts
interface GameModule {
  // …
  lifecycle: "MATCH" | "SESSION";                         // Mexicana/Fodinha: MATCH; Blackjack: SESSION
  onPlayerJoin?(state, playerId, seatIndex): Result<State>;
  onPlayerLeave?(state, playerId): Result<State>;
}
```
- Em `SESSION`, a sala aceita entradas enquanto houver lugar; o jogador senta-se com `sittingOut = true` até à próxima fase `BETTING`.
- Sair a meio de uma ronda: as mãos dele ficam automaticamente (stand) e são liquidadas normalmente; o lugar liberta-se no fim da ronda.
- Reconexão igual aos outros jogos; timeout de decisão = ficar.
- Ao terminar a sessão (anfitrião ou todos saem), o `GameResult` usa `outcome: "PLACED"` ordenado por saldo, com `score = saldo líquido`.
- Log de ações continua por partida (`Match` = sessão); para sessões longas, guardar snapshots a cada 50 rondas para o replay não ficar lento.

## O que NÃO muda
Auth, salas, reconexão, Redis adapter, componentes de cartas, animações base, persistência.
