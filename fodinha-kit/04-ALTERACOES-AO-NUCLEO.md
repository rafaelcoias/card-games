# Alterações ao Núcleo da Plataforma

A Fodinha expõe três limitações do contrato original. Estas são as **únicas** alterações permitidas ao núcleo. Todas têm de manter a Mexicana a funcionar (testes verdes) no fim da Fase 0.

## 1. `GameResult` genérico (vencedores, posições ou só perdedores)
**Problema:** o contrato assumia posições finais (1.º, 2.º…). Na Fodinha só há perdedores e sobreviventes.

```ts
type Outcome = "WINNER" | "LOSER" | "SURVIVOR" | "PLACED";

interface GameResult {
  standings: {
    playerId: PlayerId;
    outcome: Outcome;
    position?: number;        // Mexicana usa
    score?: number;           // Fodinha usa (pontos finais)
  }[];
  summary?: Record<string, unknown>;   // específico do jogo, só para mostrar
}
```
- Mexicana: primeiro a sair = `WINNER`, intermédios = `PLACED`, último = `LOSER`.
- Fodinha: quem atingiu `maxPoints` = `LOSER`, restantes = `SURVIVOR`.

**Prisma:**
```prisma
enum Outcome { WINNER LOSER SURVIVOR PLACED }

model MatchPlayer {
  // …campos existentes
  finalPosition Int?
  outcome       Outcome?
  score         Int?
}
```
Migração não destrutiva; preencher `outcome` das partidas antigas da Mexicana a partir de `finalPosition`.

## 2. Ações de sistema agendadas
**Problema:** o motor é puro e não conhece o relógio, mas a Fodinha precisa de pausas (mostrar quem ganhou a vaza, mostrar o resumo da ronda) antes de avançar.

**Solução:** o `Result` do motor passa a poder pedir agendamentos; o servidor executa-os.
```ts
type Result<S> =
  | { ok: true; state: S; events: DomainEvent[]; schedule?: { action: unknown; delayMs: number }[] }
  | { ok: false; error: GameError };
```
- O servidor guarda os agendamentos com a sala (Redis, com TTL) para sobreviverem a reinícios.
- Ações de sistema entram pelo mesmo `applyAction` com `playerId = SYSTEM`; o motor rejeita-as vindas de jogadores.
- O temporizador de turno também passa a usar este mecanismo (`SYS_TIMEOUT`), unificando com a Mexicana.
- Qualquer ação nova invalida agendamentos obsoletos (usar `stateVersion` no agendamento).

## 3. Configuração por jogo no lobby
**Problema:** cada jogo tem opções próprias (Fodinha: pontos máximos, mão máxima, variantes).

**Solução:**
- `GameModule` passa a expor `configUi` (metadados para gerar o formulário: rótulo, tipo, ajuda) além do `configSchema`.
- O ecrã "Criar sala" gera o formulário a partir destes metadados; valores por omissão vêm do schema.
- `minPlayers`/`maxPlayers` passam a vir do módulo (Mexicana 2–6, Fodinha 2–10).
- A configuração fica visível a todos na sala antes de começar.

## O que NÃO muda
- Auth, salas, reconexão, Redis adapter, baralho, componentes de cartas, animações base, persistência do log de ações.
