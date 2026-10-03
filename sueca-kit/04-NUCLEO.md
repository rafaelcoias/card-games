# Núcleo — Alterações e Dependências

## Dependências já existentes
| Necessidade | Vem de |
|---|---|
| Resultado por equipas | `GameResult` genérico — kit Fodinha |
| Temporizadores e pausas de animação | ações de sistema agendadas — kit Fodinha |
| Opções da sala | `configUi` — kit Fodinha |
| Baralho de 40 | `createShoe` com `excludeRanks` (acrescentar o parâmetro se faltar; é um utilitário do `game-core`, previsto desde o início) |

## Alteração 1 — Escolha de lugares por equipas
**Problema:** a sala ordena os jogadores por ordem de entrada. A sueca precisa de lugares fixos que definem equipas.

**Solução:**
```ts
interface GameModule {
  // …
  seating?: { seats: string[]; teams?: Record<string, string[]> };
}
```
- Quando o módulo declara `seating`, a sala mostra a mesa com os lugares; cada jogador toca num lugar livre para se sentar, ou troca para outro livre.
- O anfitrião pode **trocar dois jogadores de lugar** e **baralhar equipas** (sorteio).
- O botão "Começar" só fica ativo com todos os lugares ocupados (e, havendo `teams`, todas as equipas completas).
- O motor recebe `seats: Record<seat, PlayerId>` no `setup`.
- Jogos sem `seating` mantêm o comportamento atual.
- Reutilizável em futuros jogos de equipas.

## Alteração 2 — Política de desconexão "PAUSE"
**Problema:** nos outros jogos, quem cai é substituído por ações automáticas depois de um período de graça. Com 4 jogadores reais obrigatórios, isso estraga a mão.

**Solução:**
```ts
interface GameModule {
  // …
  disconnectPolicy?: "AUTO_ACTION" | "PAUSE";     // por omissão AUTO_ACTION (comportamento atual)
}
```
- `PAUSE`: quando um jogador cai, o servidor envia `SYS_PAUSE`; os temporizadores param; todos veem "À espera do Bruno (1:45)".
- Volta dentro de `disconnectGraceMs` → `SYS_RESUME`; os temporizadores retomam do ponto onde estavam.
- Passado o prazo, o **anfitrião decide**: esperar mais (+2 min) ou terminar a partida **sem resultado** (não conta para estatísticas). Ver 09 #6.
- Jogos sem `disconnectPolicy` mantêm o comportamento atual.

## O que NÃO muda
Auth, salas, reconexão (mecanismo), Redis, componentes de cartas, animações base, persistência.
