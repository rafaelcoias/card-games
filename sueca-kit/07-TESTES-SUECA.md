# Testes Obrigatórios — Sueca

Cobertura ≥ 90% no motor. Motor puro com baralho injetado.

## 1. Baralho e distribuição
- 40 cartas, sem 8/9/10/jokers; 10 por jogador; a carta de trunfo pertence a quem dá.
- "De cima" → trunfo = primeira carta do baralho baralhado; "de baixo" → última.
- Timeout do corte → escolha aleatória determinística pela seed.

## 2. Rotação
- Ordem de jogo S → E → N → W.
- Quem dá roda no mesmo sentido; corta o anterior a quem dá; abre o seguinte a quem dá.

## 3. Assistir
- `legalCards` com naipe → só esse naipe; sem naipe → todas.
- Carta ilegal enviada por cliente adulterado → rejeitada, estado inalterado.
- A abrir → todas legais.

## 4. Vazas
- Sem trunfos → ganha a mais alta do naipe de saída (cartas de outros naipes nunca ganham).
- Com trunfos → ganha o trunfo mais alto.
- Ordem A > 7 > K > J > Q > 6 > 5 > 4 > 3 > 2 em todos os casos (incluindo Valete > Dama).
- Quem ganha abre a seguinte.

## 5. Pontuação
- Soma das cartas ganhas = 120 em todas as mãos.
- Tabela de jogos: 60/61, 90/91, 119/120 nas fronteiras.
- 60–60 → ninguém pontua.
- Partida termina ao atingir `targetGames` (1, 4, 10).

## 6. Última vaza
- Indisponível antes da primeira vaza fechada.
- Cada jogador pode ver uma vez por mão (09 #3); segunda tentativa → rejeitada.
- Mostra a última vaza fechada no momento do pedido.

## 7. Comunicação
- `chatEnabled = false` em CUT, PLAYING e TRICK_DONE; `true` em HAND_SUMMARY e FINISHED.
- Mensagens de chat enviadas durante a mão → rejeitadas pelo servidor (não só escondidas na UI).

## 8. Pausa
- Desconexão → PAUSED; temporizadores congelados; ações de jogo rejeitadas.
- Reconexão → retoma com o tempo restante exato.
- Prazo esgotado → anfitrião: esperar mais ou terminar sem resultado (`GameResult` vazio, não persiste estatísticas).

## 9. Timeout de jogada
- Joga a carta legal de menor valor (desempates do 03 §5).

## 10. Segurança
- Nenhuma vista contém mãos alheias.
- A carta de trunfo aparece em todas as vistas até ser jogada; depois `card = null`.

## 11. Guião
- Reproduzir `05-GUIAO-DE-MAO.md`: cada vaza (vencedor e pontos), resultado 79–41 → 1–0, rotação para a mão seguinte, e os cenários isolados.

## 12. Simulação
- 100 000 mãos com bots aleatórios legais.
- Invariantes: 40 cartas sempre; 10 vazas por mão; pontos A + B = 120; toda a carta jogada é legal; partidas terminam.
