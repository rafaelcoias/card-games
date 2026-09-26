# Design das Cartas, Mesa e Movimento

Objetivo: o baralho tem de ser reconhecido à primeira como um **baralho clássico francês** (o de qualquer casino ou gaveta de cozinha) e o jogo tem de ser **limpo, rápido e suave**. Nada de estilo "cartoon", nada de gradientes de app de 2012, nada de cartas que parecem botões.

## 1. Baralho — especificação visual

### 1.1 Formato
- Proporção **poker: 2,5 × 3,5** (ratio 0,714). Cantos arredondados com raio ≈ 4,5% da largura.
- Fundo branco puro `#FFFFFF`, contorno subtil `1px` cinza `#D9D9D9` para destacar em fundos claros.
- Tamanho base de desenho: `viewBox="0 0 250 350"`. Renderizar em qualquer tamanho sem perder nitidez (SVG).

### 1.2 Cores
- Vermelho (copas, ouros): `#D0021B`
- Preto (espadas, paus): `#1A1A1A`
- Nunca usar cores alternativas para naipes (sem "quatro cores").

### 1.3 Índices (cantos)
- Valor + naipe no canto superior esquerdo; **repetido rodado 180°** no canto inferior direito.
- Valores: `A 2 3 4 5 6 7 8 9 10 J Q K`. O `10` escreve-se com dois algarismos, alinhado.
- Tipografia: serifada clássica, alto contraste, ex.: uma fonte de sistema serifada ou uma fonte livre de traços largos. Peso bold. Não usar sans-serif geométrica.

### 1.4 Naipes (símbolos)
- Desenhar os quatro símbolos como paths SVG próprios, com a forma tradicional:
  - **Copas** ♥ — coração com ponta inferior fina e lóbulos cheios
  - **Ouros** ♦ — losango com lados ligeiramente convexos
  - **Espadas** ♠ — pá com haste curta e base em cauda
  - **Paus** ♣ — trevo de três lóbulos com haste
- Mesmo símbolo reutilizado (via `<use>`) nos índices e no corpo.

### 1.5 Cartas numéricas (A–10) — disposição dos pips
Seguir **exatamente** a disposição tradicional; os pips da metade inferior ficam **invertidos** (rodados 180°):

| Carta | Disposição |
|---|---|
| A | 1 pip central grande (o Ás de espadas com pip ornamentado, maior que os outros ases) |
| 2 | 2 pips na coluna central (topo e base) |
| 3 | 3 pips na coluna central |
| 4 | 4 pips nos cantos (2 colunas × 2) |
| 5 | 4 nos cantos + 1 central |
| 6 | 2 colunas × 3 |
| 7 | 6 como o seis + 1 no centro superior |
| 8 | 6 como o seis + 1 centro superior + 1 centro inferior |
| 9 | 2 colunas × 4 + 1 central |
| 10 | 2 colunas × 4 + 2 na coluna central (superior e inferior) |

### 1.6 Figuras (J, Q, K)
- Estilo **clássico anglo-americano**: figuras de corpo duplo (espelhadas na diagonal), moldura interior retangular, paleta tradicional (vermelho, azul, amarelo, preto, branco) com traço preto.
- Cada figura distinta por naipe (não repetir a mesma ilustração com o naipe trocado).
- Duas vias aceitáveis:
  1. **Desenhar de raiz** em SVG, fiel ao estilo tradicional.
  2. **Usar um baralho vetorial de domínio público** (licença CC0 / Public Domain, verificada e documentada no repositório) como base, adaptando índices, naipes e cores a esta especificação. É a via recomendada para as figuras: fica profissional e evita meses de ilustração.
- Nunca usar imagens raster nem baralhos com licença restritiva.

### 1.7 Jokers (2)
- Bobo da corte clássico, um a cores (vermelho/azul) e um monocromático (preto), com a palavra **JOKER** na vertical no índice.
- Os dois têm ids diferentes (`JK1`, `JK2`) mas comportamento igual.

### 1.8 Verso
- Padrão simétrico, denso e repetitivo (guilhoché, losangos ou arabescos), **uma cor dominante** (azul `#1F3A93` ou vermelho `#8B1E1E`) sobre branco, com margem branca à volta.
- Simétrico em 180° para nunca se notar a orientação.
- Um único verso para todo o baralho.

### 1.9 Estados
- **Normal**, **selecionada** (levanta 12 px + sombra mais forte + contorno da cor primária da UI), **jogável** (opacidade 1) vs **não jogável** (opacidade 0,45 + sem hover), **escondida** (verso), **a revelar** (flip 3D).

## 2. Implementação técnica das cartas
- Um ficheiro SVG por carta em `packages/ui/cards/` + um `sprite.svg` gerado por script com `<symbol id="card-AS">…`.
- Componente `<Card id="10H" size="md" faceDown state="playable" />` que renderiza `<svg><use href="#card-10H"/></svg>`.
- Tamanhos: `sm` 56 px, `md` 84 px, `lg` 120 px de largura; altura pela proporção.
- Página `/dev/cards` com a galeria das 54 + verso em todos os tamanhos e estados. **Entregue e aprovada antes da mesa.**
- Nada de `<img>` com PNG. Nada de fontes web externas para os índices se não estiverem incluídas no repositório.

## 3. Mesa
- Fundo verde feltro escuro `#1E5631` com vinheta suave nas bordas; sem texturas fotográficas pesadas.
- Layout: adversários em arco no topo (avatar, nome, contador de cartas na mão, as 3 visíveis + 3 versos), pilha de descarte e baralho comum ao centro, mão do jogador em leque na base.
- O leque da mão: cartas sobrepostas ~55%, ligeira rotação (−10° a +10°), a carta em hover/selecionada sobe.
- Indicador claro de quem joga: anel animado à volta do avatar + temporizador circular de 30 s.
- Cartas não jogáveis visivelmente atenuadas; o jogador nunca tem de adivinhar o que pode fazer.
- Botão "Apanhar pilha" só aparece quando não há jogada válida.

## 4. Movimento (Framer Motion)
Toda a transição de cartas é uma animação com posição real de origem/destino (`layoutId`), nunca um "aparece/desaparece".

| Ação | Duração | Easing |
|---|---|---|
| Distribuir (9 cartas por jogador, em sequência) | 60 ms entre cartas, 220 ms cada | `easeOut` |
| Jogar carta para a pilha | 260 ms + pequena rotação aleatória final (−6° a +6°) para a pilha parecer real | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Jogar várias do mesmo valor | mesma, desfasadas 50 ms | idem |
| Comprar do baralho | 220 ms | `easeOut` |
| Apanhar a pilha | cartas voam para a mão em 320 ms com stagger 25 ms | `easeInOut` |
| Queimar (10/Joker/quatro iguais) | pilha encolhe e desvanece 360 ms; leve flash | `easeIn` |
| Revelar escondida | flip 3D 400 ms (`rotateY`) | `easeInOut` |
| Bloqueio do 8 | ícone de "skip" sobre o avatar saltado, 500 ms | — |
| Selecionar carta | 120 ms | `easeOut` |

- **60 fps obrigatório** em portátil médio e telemóvel de gama média. Animar só `transform` e `opacity`; nunca `top/left/width/height`.
- `prefers-reduced-motion` respeitado: transições reduzidas a 80 ms sem deslocação.
- Sons curtos e opcionais (jogar, apanhar, queimar, a tua vez), desligados por omissão, com toggle.

## 5. Responsivo
- Desktop ≥ 1024 px: layout completo.
- Tablet: adversários mais compactos, mão com `md`.
- Telemóvel (portrait): mão em leque com scroll horizontal se > 8 cartas; adversários em linha com avatar + contador; visíveis em `sm`. Tudo jogável com o polegar.

## 6. Acessibilidade
- Cada carta com `aria-label` ("Dez de copas", "Verso de carta").
- Navegação por teclado no desktop: setas para percorrer a mão, Enter para selecionar, Espaço para jogar.
- Contraste mínimo AA em todo o texto da UI.

## 7. Critérios de aceitação (Fase 3)
1. Galeria `/dev/cards` aprovada visualmente.
2. Uma pessoa que não conhece a app identifica qualquer carta em < 1 s.
3. Nenhuma animação abaixo de 55 fps no perfil de performance do Chrome.
4. Nenhuma carta "salta" de posição sem animação.
5. Mesa jogável em telemóvel sem zoom.
