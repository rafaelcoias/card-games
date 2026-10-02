# UI do Olho

Reutiliza o baralho clássico (com os 2 jokers), os componentes `Card`, as animações base, os sons, a acessibilidade e o responsivo.

## 1. Mesa
- Feltro azul-petróleo (`#163A4A`).
- Lugares à volta; cada um com avatar, nome, **contador de cartas**, **insígnia do cargo** e pontos da sessão.
- Insígnias (SVG próprio, discreto):

| Cargo | Insígnia |
|---|---|
| Presidente | coroa dourada |
| Vice-Presidente | coroa prateada pequena |
| Neutro | círculo cinza |
| Vice-olho | olho pequeno |
| Olho | olho grande |

- Centro: **vaza atual**. As jogadas empilham-se ligeiramente desalinhadas, com a última por cima e em destaque.
- Indicadores por baixo da vaza: "Pares", "Triplas"…, e "Primeira vaza: sem 2 nem joker" quando aplicável.

## 2. Mão
- Leque ordenado por força (3 → joker), agrupado por valor.
- Tocar numa carta seleciona-a; tocar noutra do mesmo valor junta-a. Botão: **"Jogar par de 7"**.
- Cartas que não podem ser jogadas ficam esbatidas (valor baixo, quantidade errada, 2/joker na primeira vaza, 2/joker que esvaziaria a mão com a opção desligada).
- Corte com 2s: ao selecionar 2s, o botão mostra o efeito ("Cortar o par com um 2").
- Jogador bloqueado: etiqueta "Bloqueado — só tem 2s/jokers" no avatar.
- Botão **Passar** sempre visível na tua vez (exceto a abrir).

## 3. Salto
- Quando alguém joga carta igual, aparece no avatar do alvo o selo **"Saltado?"**.
- Se o alvo tiver a carta (e `sameCardEscape`): painel para ele *"Tens um 7. Jogas para não seres saltado?"* [**Jogar 7**] [**Ser saltado**], com 5 s.
- Saltado: selo **"Saltado!"** com seta curva a passar por cima do avatar.

## 4. Cortes
- Joker: a carta entra com rotação e brilho; carimbo **"CORTOU!"**; as cartas da vaza deslizam para o descarte.
- Quatro iguais: as quatro cartas alinham-se 600 ms; carimbo **"QUATRO IGUAIS — CORTOU!"**.
- Legenda: *"A Carla abre a próxima."*

## 5. Fim de vaza sem corte
- Quando todos passaram: as cartas deslizam para o descarte; legenda *"Ninguém bateu o Rei do Bruno. Abre o Bruno."*

## 6. Acabar
- Quem fica sem cartas: anel colorido à volta do avatar e o número da posição ("1.º").
- Fim do jogo: ecrã de resumo de 4 s com a ordem, os cargos novos e os pontos (+2, +1, 0, −1, −2).

## 7. Troca
- Ecrã de troca para todos, com a mesa esbatida.
- **Olho / Vice-olho:** vêem as suas melhores cartas a sair sozinhas da mão (não há escolha), com legenda *"O servidor entregou as tuas 2 melhores ao Presidente."*
- **Presidente / Vice-Presidente:** recebem as cartas (com destaque) e escolhem as que devolvem; botão **"Devolver"** ativo quando o número estiver certo; temporizador de 20 s.
- **Restantes:** *"Troca de cartas em curso…"* com as setas entre os cargos, sem mostrar cartas.

## 8. Marcador da sessão
- Painel lateral: jogadores, cargo atual, pontos, nº de vezes Presidente / Olho.
- Botão **"Terminar sessão"** só para o anfitrião, com confirmação.

## 9. Tempos
| Momento | Duração |
|---|---|
| Distribuir 54 cartas | stagger 25 ms |
| Jogar combinação | 300 ms |
| Selo de salto | 700 ms |
| Painel de escape | até 5 s |
| Corte (carimbo + recolha) | 900 + 400 ms |
| Fecho sem corte | 500 ms |
| Resumo do jogo | 4000 ms |
| Troca (animação das cartas) | 500 ms por carta |
