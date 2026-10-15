# Núcleo — Dependências e UI otimista

## Dependências (sem alterações novas)
| Necessidade | Vem de |
|---|---|
| Ações dos dois jogadores a qualquer momento | fases simultâneas — kit Blackjack `04` §2 |
| "Quem chegou primeiro" | fila única por sala — kit Desconfia `04` |
| Contagem 3-2-1, preparação de ronda | ações de sistema agendadas — kit Fodinha |
| Baralho de 54 | `createShoe` — kit Blackjack `04` §1 |

## UI otimista (obrigatória neste jogo)
Num jogo de velocidade, esperar pela resposta do servidor (50–150 ms) mata a sensação de rapidez.
1. No toque/arrasto, a carta move-se **logo** para o destino.
2. O cliente envia a ação com `expectedTopUid` e um `clientActionId`.
3. Servidor aceita → nada a fazer (a vista seguinte confirma).
4. Servidor rejeita → a carta volta à coluna com uma animação curta (180 ms) e um tremor ligeiro.
5. As atualizações do adversário chegam como eventos e animam normalmente.

Isto vive no componente de mesa do jogo; não exige mudanças no núcleo, mas deve ficar como utilitário reutilizável (`useOptimisticAction`) para futuros jogos rápidos.

## Latência (fora de âmbito, preparado para depois)
- A decisão "quem chegou primeiro" fica numa única função do servidor (`resolveRace`), hoje "ordem de chegada".
- Mais tarde pode passar a usar marcas de tempo do cliente com tolerância, sem tocar no motor.
