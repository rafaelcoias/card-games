/**
 * generate-cards.ts
 *
 * Deterministic generator for the complete playing-card artwork used by the game
 * (spec: 06-DESIGN-CARTAS-E-UI.md, sections 1 and 2).
 *
 * Output (written to packages/ui/cards/):
 *   - 52 face cards  AS.svg … KC.svg, 2 jokers JK1.svg / JK2.svg and BACK.svg
 *   - sprite.svg: shared <symbol id="suit-X"> + <symbol id="card-ID"> per card + <symbol id="card-back">
 *
 * Run:  npx tsx packages/ui/scripts/generate-cards.ts [outDir]
 *
 * Design notes
 *   - Everything is drawn from scratch (no third-party artwork, no raster, no external fonts).
 *   - No <clipPath>, <pattern> or gradients are used: the sprite is injected into the page inside an
 *     <svg style="display:none">, and paint servers / clip paths living in a display:none subtree are
 *     not rendered reliably by every browser. Fabric patterns and the back lattice are therefore
 *     emitted as explicit geometry.
 *   - The only ids inside card symbols are `card-<ID>-half` (the double-ended court figure half),
 *     so ids stay globally unique when the sprite is inlined in the DOM.
 *   - Numbers are rounded to one decimal place to keep the sprite small.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/* ================================================================== constants */

const CARD_W = 250;
const CARD_H = 350;
const CX = CARD_W / 2;
const CY = CARD_H / 2;
const CORNER_R = 11;

const COLOR = {
  red: '#D0021B',
  black: '#1A1A1A',
  blue: '#1F3A93',
  gold: '#F2C12E',
  white: '#FFFFFF',
  border: '#D9D9D9',
} as const;

/**
 * Classic bold serif with lining figures. Times New Roman comes first because Georgia only has
 * old-style (descending) figures, which make the rank indices uneven; Georgia stays as a fallback.
 */
const FONT_STACK = "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', Georgia, serif";

/** Line style shared by all court / joker illustrations. */
const INK = COLOR.black;
const LINE_W = 1.2;

type Suit = 'S' | 'H' | 'D' | 'C';
const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

const PIP_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const;
type PipRank = (typeof PIP_RANKS)[number];
const COURT_RANKS = ['J', 'Q', 'K'] as const;
type CourtRank = (typeof COURT_RANKS)[number];
type Rank = PipRank | CourtRank;

interface Pt {
  readonly x: number;
  readonly y: number;
}
const pt = (x: number, y: number): Pt => ({ x, y });

const suitColor = (suit: Suit): string => (suit === 'H' || suit === 'D' ? COLOR.red : COLOR.black);

/* ================================================================== svg helpers */

/** Round to one decimal place and print without trailing zeros. */
function num(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (r === 0 ? 0 : r).toString();
}

/** Tagged template for path data: every interpolated number is rounded by `num`. */
function d(strings: TemplateStringsArray, ...values: number[]): string {
  let out = strings[0] ?? '';
  values.forEach((v, i) => {
    out += num(v) + (strings[i + 1] ?? '');
  });
  return out.replace(/\s+/g, ' ').trim();
}

type AttrValue = string | number | undefined;
type Attrs = Readonly<Record<string, AttrValue>>;

function el(tag: string, attrs: Attrs, children?: string): string {
  let a = '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    a += ` ${k}="${typeof v === 'number' ? num(v) : v.replace(/"/g, '&quot;')}"`;
  }
  return children === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${children}</${tag}>`;
}

const g = (attrs: Attrs, ...children: string[]): string => el('g', attrs, children.join(''));
const path = (dAttr: string, attrs: Attrs = {}): string => el('path', { d: dAttr, ...attrs });
const circle = (x: number, y: number, r: number, attrs: Attrs = {}): string =>
  el('circle', { cx: x, cy: y, r, ...attrs });

/** Stroked "band": a black outline stroke under a coloured stroke (cheap outlined ribbon). */
function band(dAttr: string, color: string, width: number, cap: 'round' | 'butt' = 'round'): string {
  return (
    path(dAttr, { fill: 'none', stroke: INK, 'stroke-width': width + LINE_W * 2, 'stroke-linecap': cap }) +
    path(dAttr, { fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': cap })
  );
}

const rotate180 = (x: number, y: number): string => `rotate(180 ${num(x)} ${num(y)})`;

/* ================================================================== suit symbols */

/** Suit outlines designed in a 100×100 box centred on the origin. */
const SPADE_D =
  'M0,-47C6,-36 20,-26 32,-16C44,-6 49,4 48,14C47,27 37,34 26,34C16,34 8,29 3,22' +
  'C4,32 9,41 18,47L-18,47C-9,41 -4,32 -3,22C-8,29 -16,34 -26,34C-37,34 -47,27 -48,14' +
  'C-49,4 -44,-6 -32,-16C-20,-26 -6,-36 0,-47Z';
const HEART_D =
  'M0,45C-4,37 -13,27 -26,15C-39,3 -48,-7 -48,-21C-48,-36 -37,-45 -25,-45C-13,-45 -4,-37 0,-27' +
  'C4,-37 13,-45 25,-45C37,-45 48,-36 48,-21C48,-7 39,3 26,15C13,27 4,37 0,45Z';
const DIAMOND_D = 'M0,-48Q23.6,-21.2 37,0Q23.6,21.2 0,48Q-23.6,21.2 -37,0Q-23.6,-21.2 0,-48Z';
const CLUB_D =
  'M-20,-22a20,20 0 1 1 40,0a20,20 0 1 1 -40,0Z' +
  'M-44,12a20,20 0 1 1 40,0a20,20 0 1 1 -40,0Z' +
  'M4,12a20,20 0 1 1 40,0a20,20 0 1 1 -40,0Z' +
  'M0,-8L12,14L-12,14Z' +
  'M3.5,10C3.5,28 9,40 18,47L-18,47C-9,40 -3.5,28 -3.5,10Z';

const SUIT_D: Readonly<Record<Suit, string>> = { S: SPADE_D, H: HEART_D, D: DIAMOND_D, C: CLUB_D };

function suitSymbol(suit: Suit): string {
  return el(
    'symbol',
    { id: `suit-${suit}`, viewBox: '-50 -50 100 100' },
    path(SUIT_D[suit], { fill: suitColor(suit) }),
  );
}

/** Place a suit symbol centred on (x, y) with the given size, optionally upside down. */
function useSuit(suit: Suit, x: number, y: number, size: number, flipped = false): string {
  return el('use', {
    href: `#suit-${suit}`,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    transform: flipped ? rotate180(x, y) : undefined,
  });
}

/* ================================================================== card frame & indices */

function cardBase(): string {
  return el('rect', {
    x: 0.5,
    y: 0.5,
    width: CARD_W - 1,
    height: CARD_H - 1,
    rx: CORNER_R,
    fill: COLOR.white,
    stroke: COLOR.border,
    'stroke-width': 1,
    'vector-effect': 'non-scaling-stroke',
  });
}

/** Index geometry: kept inside the left ~20% of the card so it is visible in a fanned hand. */
const INDEX = { x: 28, baseline: 58, fontSize: 54, suitY: 82, suitSize: 30 } as const;

function rankText(rank: Rank, color: string): string {
  const common = {
    'font-family': FONT_STACK,
    'font-weight': 700,
    'font-size': INDEX.fontSize,
    'text-anchor': 'middle',
    fill: color,
  };
  if (rank === '10') {
    // two digits condensed so "10" fits the same column as single-character ranks
    return el(
      'text',
      { ...common, transform: `translate(${INDEX.x} ${INDEX.baseline}) scale(0.74 1)`, 'letter-spacing': -3 },
      '10',
    );
  }
  return el('text', { ...common, x: INDEX.x, y: INDEX.baseline }, rank);
}

/** Top-left index + the same index rotated 180° in the bottom-right corner. */
function cornerIndices(rank: Rank, suit: Suit): string {
  const one = rankText(rank, suitColor(suit)) + useSuit(suit, INDEX.x, INDEX.suitY, INDEX.suitSize);
  return one + g({ transform: rotate180(CX, CY) }, one);
}

function jokerIndices(color: string): string {
  const letters = ['J', 'O', 'K', 'E', 'R'];
  const one = el(
    'text',
    { 'font-family': FONT_STACK, 'font-weight': 700, 'font-size': 25, 'text-anchor': 'middle', fill: color },
    letters.map((ch, i) => el('tspan', { x: 24, y: 38 + i * 25 }, ch)).join(''),
  );
  return one + g({ transform: rotate180(CX, CY) }, one);
}

/* ================================================================== pip cards */

const PIP_SIZE = 45;
const COL = { L: CX - 44, C: CX, R: CX + 44 } as const;
const ROW_TOP = 68;
const ROW_BOTTOM = CARD_H - ROW_TOP;
const rowAt = (fraction: number): number => ROW_TOP + (ROW_BOTTOM - ROW_TOP) * fraction;

/** Traditional pip positions for 2–10 (fractions of the pip area height). */
function pipLayout(rank: Exclude<PipRank, 'A'>): Pt[] {
  const sides = (rows: number[]): Pt[] => rows.flatMap((r) => [pt(COL.L, rowAt(r)), pt(COL.R, rowAt(r))]);
  const centre = (rows: number[]): Pt[] => rows.map((r) => pt(COL.C, rowAt(r)));
  switch (rank) {
    case '2':
      return centre([0, 1]);
    case '3':
      return centre([0, 0.5, 1]);
    case '4':
      return sides([0, 1]);
    case '5':
      return [...sides([0, 1]), ...centre([0.5])];
    case '6':
      return sides([0, 0.5, 1]);
    case '7':
      return [...sides([0, 0.5, 1]), ...centre([0.25])];
    case '8':
      return [...sides([0, 0.5, 1]), ...centre([0.25, 0.75])];
    case '9':
      return [...sides([0, 1 / 3, 2 / 3, 1]), ...centre([0.5])];
    case '10':
      return [...sides([0, 1 / 3, 2 / 3, 1]), ...centre([1 / 6, 5 / 6])];
  }
}

function pipBody(rank: Exclude<PipRank, 'A'>, suit: Suit): string {
  // pips below the horizontal centre line are drawn upside down
  return pipLayout(rank)
    .map((p) => useSuit(suit, p.x, p.y, PIP_SIZE, p.y > CY + 0.01))
    .join('');
}

/** Ace of spades: bigger pip with a double outline, inner filigree and scrolls. */
function aceOfSpades(): string {
  const y = CY - 4;
  return (
    path(SPADE_D, {
      transform: `translate(${CX} ${y}) scale(1.56)`,
      fill: 'none',
      stroke: INK,
      'stroke-width': 0.8,
    }) +
    useSuit('S', CX, y, 138) +
    path(SPADE_D, {
      transform: `translate(${CX} ${y}) scale(1.08)`,
      fill: 'none',
      stroke: COLOR.white,
      'stroke-width': 1.1,
    }) +
    path(
      d`M${CX},${y - 30} C${CX + 8},${y - 16} ${CX + 20},${y - 6} ${CX + 20},${y + 8}
        C${CX + 20},${y + 18} ${CX + 10},${y + 22} ${CX},${y + 14}
        C${CX - 10},${y + 22} ${CX - 20},${y + 18} ${CX - 20},${y + 8}
        C${CX - 20},${y - 6} ${CX - 8},${y - 16} ${CX},${y - 30}Z`,
      { fill: 'none', stroke: COLOR.white, 'stroke-width': 1.4 },
    ) +
    circle(CX, y + 2, 4, { fill: COLOR.white })
  );
}

function aceBody(suit: Suit): string {
  return suit === 'S' ? aceOfSpades() : useSuit(suit, CX, CY, 84);
}

/* ================================================================== court cards: geometry */

/** Inner frame of court cards (leaves the corner index columns free). */
const FRAME = { x0: 54, y0: 14, x1: CARD_W - 54, y1: CARD_H - 14 } as const;
/** Scale applied to the head group (face, hair, headwear). */
const HEAD_SCALE = 1.12;
/** Vertical offset applied to the collars (drawn in card coordinates). */
const COLLAR_DY = 2;
/** Slanted divider through the card centre separating the two halves of the figure. */
const DIV_SLOPE = 0.2;
const yDiv = (x: number): number => CY + (CX - x) * DIV_SLOPE;

type MotifKind = 'dots' | 'lozenges' | 'crosses' | 'trefoils' | 'ermine' | 'chevrons' | 'plain';

interface Fabric {
  readonly base: string;
  readonly motif: MotifKind;
  readonly ink: string;
}

type HeadwearKind =
  | 'crownArched'
  | 'crownFleur'
  | 'crownSpikes'
  | 'crownCross'
  | 'tiaraFleur'
  | 'tiaraPearl'
  | 'tiaraSpikes'
  | 'tiaraCross'
  | 'capFeather'
  | 'hatRolled'
  | 'beretPlume'
  | 'hatTall';
type HairKind = 'kingLong' | 'queenLong' | 'queenBraids' | 'jackCurls' | 'jackBob';
type BeardKind = 'none' | 'full' | 'forked' | 'short';
type MoustacheKind = 'none' | 'full' | 'curled' | 'thin';
type CollarKind = 'ermine' | 'ruff' | 'lace' | 'yoke' | 'chain';
type AttributeKind =
  | 'sword'
  | 'swordBehind'
  | 'axe'
  | 'orb'
  | 'sceptre'
  | 'rose'
  | 'tulip'
  | 'sprig'
  | 'leaf'
  | 'halberd'
  | 'torch'
  | 'arrow';

interface CourtSpec {
  readonly rank: CourtRank;
  readonly suit: Suit;
  readonly headwear: HeadwearKind;
  /** main colour of the headwear (crown cap, hat, veil) */
  readonly headColor: string;
  readonly hair: HairKind;
  readonly beard: BeardKind;
  readonly beardColor: string;
  readonly moustache: MoustacheKind;
  /** pupils: -1 look left, 0 front, 1 look right */
  readonly gaze: -1 | 0 | 1;
  readonly left: Fabric;
  readonly right: Fabric;
  readonly placket: Fabric;
  readonly collar: CollarKind;
  readonly sleeve: string;
  readonly sash?: string;
  readonly attribute: AttributeKind;
  /** secondary colour used by the attribute (grip, flower, tassel…) */
  readonly attrColor: string;
  readonly hand: Pt;
  readonly handAngle: number;
  readonly arm: 'L' | 'R';
  /** side of the frame where the small suit pip sits (opposite the attribute) */
  readonly pipSide: 'L' | 'R';
}

/* ---------- polygons & fabric motifs ---------- */

function sampleCubic(p0: Pt, c1: Pt, c2: Pt, p3: Pt, steps = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push(
      pt(
        u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
        u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
      ),
    );
  }
  return out;
}

function insidePolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** One motif as a filled sub-path (all motifs of a panel are merged into a single <path>). */
function motifD(kind: MotifKind, x: number, y: number): string {
  switch (kind) {
    case 'dots':
      return d`M${x - 1.8},${y}a1.8,1.8 0 1 0 3.6,0a1.8,1.8 0 1 0 -3.6,0Z`;
    case 'lozenges':
      return d`M${x},${y - 4.2}L${x + 2.8},${y}L${x},${y + 4.2}L${x - 2.8},${y}Z`;
    case 'crosses':
      return d`M${x - 1},${y - 3.4}h2v2.4h2.4v2h-2.4v2.4h-2v-2.4h-2.4v-2h2.4Z`;
    case 'trefoils':
      return (
        d`M${x - 1.4},${y - 1.6}a1.4,1.4 0 1 0 2.8,0a1.4,1.4 0 1 0 -2.8,0Z` +
        d`M${x - 2.9},${y + 0.9}a1.4,1.4 0 1 0 2.8,0a1.4,1.4 0 1 0 -2.8,0Z` +
        d`M${x + 0.1},${y + 0.9}a1.4,1.4 0 1 0 2.8,0a1.4,1.4 0 1 0 -2.8,0Z`
      );
    case 'ermine':
      return (
        d`M${x},${y - 1.5}L${x + 1.7},${y + 3.2}L${x},${y + 2.2}L${x - 1.7},${y + 3.2}Z` +
        d`M${x - 0.7},${y - 3.2}a0.7,0.7 0 1 0 1.4,0a0.7,0.7 0 1 0 -1.4,0Z` +
        d`M${x - 2.6},${y - 2}a0.7,0.7 0 1 0 1.4,0a0.7,0.7 0 1 0 -1.4,0Z` +
        d`M${x + 1.2},${y - 2}a0.7,0.7 0 1 0 1.4,0a0.7,0.7 0 1 0 -1.4,0Z`
      );
    case 'chevrons':
      return d`M${x - 3.4},${y - 1.8}L${x},${y + 1.4}L${x + 3.4},${y - 1.8}L${x + 3.4},${y + 0.4}L${x},${y + 3.6}L${x - 3.4},${y + 0.4}Z`;
    case 'plain':
      return '';
  }
}

/** Fill a panel with its base colour, outline it and scatter the motif on a staggered grid. */
function fabricPanel(outline: string, poly: readonly Pt[], fabric: Fabric, spacing = 12): string {
  let motifs = '';
  if (fabric.motif !== 'plain') {
    const margin = 4.6;
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    let row = 0;
    for (let y = CY - Math.ceil((CY - minY) / spacing) * spacing; y <= maxY; y += spacing, row++) {
      const offset = row % 2 === 0 ? 0 : spacing / 2;
      for (let x = CX - Math.ceil((CX - minX) / spacing) * spacing + offset; x <= maxX; x += spacing) {
        const probes = [pt(x, y), pt(x - margin, y), pt(x + margin, y), pt(x, y - margin), pt(x, y + margin)];
        if (probes.every((p) => insidePolygon(p, poly))) motifs += motifD(fabric.motif, x, y);
      }
    }
  }
  return (
    path(outline, { fill: fabric.base }) + (motifs ? path(motifs, { fill: fabric.ink, stroke: 'none' }) : '')
  );
}

/* ---------- robe ---------- */

const SHOULDER_L = { start: pt(FRAME.x0, 138), c1: pt(62, 127), c2: pt(84, 123), end: pt(104, 121) };
const NECK_Y = 121;

function robe(spec: CourtSpec): string {
  const s = SHOULDER_L;
  const mirror = (p: Pt): Pt => pt(2 * CX - p.x, p.y);
  const leftPoly: Pt[] = [
    pt(FRAME.x0, yDiv(FRAME.x0)),
    s.start,
    ...sampleCubic(s.start, s.c1, s.c2, s.end),
    pt(CX, NECK_Y),
    pt(CX, yDiv(CX)),
  ];
  const rightPoly = leftPoly.map(mirror).reverse();
  const leftD = d`M${FRAME.x0},${yDiv(FRAME.x0)}L${s.start.x},${s.start.y}
    C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.end.x},${s.end.y}L${CX},${NECK_Y}L${CX},${yDiv(CX)}Z`;
  const rightD = d`M${2 * CX - FRAME.x0},${yDiv(2 * CX - FRAME.x0)}L${2 * CX - s.start.x},${s.start.y}
    C${2 * CX - s.c1.x},${s.c1.y} ${2 * CX - s.c2.x},${s.c2.y} ${2 * CX - s.end.x},${s.end.y}L${CX},${NECK_Y}L${CX},${yDiv(CX)}Z`;

  const pw = spec.rank === 'J' ? 10 : 13;
  const placketPoly = [
    pt(CX - pw, NECK_Y),
    pt(CX + pw, NECK_Y),
    pt(CX + pw, yDiv(CX + pw)),
    pt(CX - pw, yDiv(CX - pw)),
  ];
  const placketD = d`M${CX - pw},${NECK_Y}L${CX + pw},${NECK_Y}L${CX + pw},${yDiv(CX + pw)}L${CX - pw},${yDiv(CX - pw)}Z`;

  // gold trim running over both shoulders
  const trim = (m: 1 | -1): string =>
    band(
      d`M${CX - m * (CX - FRAME.x0 - 5)},${142}C${CX - m * (CX - 63)},${133} ${CX - m * (CX - 84)},${129} ${CX - m * (CX - 104)},${127}`,
      COLOR.gold,
      4,
      'butt',
    );

  let sash = '';
  if (spec.sash !== undefined) {
    const a = pt(98, 128);
    const b = pt(170, yDiv(170) - 4);
    sash = band(d`M${a.x},${a.y}L${b.x},${b.y}`, spec.sash, 7, 'butt');
  }

  return (
    fabricPanel(leftD, leftPoly, spec.left) +
    fabricPanel(rightD, rightPoly, spec.right) +
    trim(1) +
    trim(-1) +
    fabricPanel(placketD, placketPoly, spec.placket, 9) +
    sash
  );
}

/* ---------- collars (card coordinates, around the neck) ---------- */

function collar(kind: CollarKind): string {
  switch (kind) {
    case 'ermine': {
      const outline = d`M90,110C97,126 111,133 ${CX},133C139,133 153,126 160,110C149,105 137,103 ${CX},103C113,103 101,105 90,110Z`;
      const spots = [
        pt(100, 114),
        pt(112, 120),
        pt(125, 123),
        pt(138, 120),
        pt(150, 114),
        pt(118, 111),
        pt(132, 111),
      ]
        .map((p) => motifD('ermine', p.x, p.y))
        .join('');
      return (
        path(outline, { fill: COLOR.white }) +
        path(spots, { fill: INK, stroke: 'none' }) +
        band(d`M92,114C99,128 112,134 ${CX},134C138,134 151,128 158,114`, COLOR.gold, 2.4)
      );
    }
    case 'chain': {
      const base = path(d`M92,108C100,120 112,124 ${CX},124C138,124 150,120 158,108L150,104L100,104Z`, {
        fill: COLOR.white,
      });
      let links = '';
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = 96 + 58 * t;
        const y = 116 + 16 * Math.sin(Math.PI * t);
        links += circle(x, y, 2.6, { fill: COLOR.gold });
      }
      const pendant = path(d`M${CX},136L${CX + 5},142L${CX},149L${CX - 5},142Z`, { fill: COLOR.red });
      return base + links + pendant;
    }
    case 'ruff': {
      let scallops = '';
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI * (i / n);
        const a1 = Math.PI * ((i + 1) / n);
        const p0 = pt(CX - 36 * Math.cos(a0), 106 + 14 * Math.sin(a0));
        const p1 = pt(CX - 36 * Math.cos(a1), 106 + 14 * Math.sin(a1));
        scallops += d`A4,4 0 0 0 ${p1.x},${p1.y}`;
        if (i === 0) scallops = d`M${p0.x},${p0.y}` + scallops;
      }
      const pleats = [-24, -12, 0, 12, 24]
        .map((dx) => d`M${CX + dx * 0.55},${108}L${CX + dx},${118 - Math.abs(dx) * 0.15}`)
        .join('');
      return (
        path(`${scallops}L${num(CX + 22)},100L${num(CX - 22)},100Z`, { fill: COLOR.white }) +
        path(pleats, { fill: 'none', 'stroke-width': 0.8 })
      );
    }
    case 'lace': {
      const outline = d`M94,108L156,108L150,122C140,128 110,128 100,122Z`;
      let teeth = '';
      for (let i = 0; i < 7; i++) {
        const x = 101 + i * 8;
        teeth += d`M${x - 3},${124 + (i === 0 || i === 6 ? -1 : 1)}L${x},${131}L${x + 3},${124 + (i === 0 || i === 6 ? -1 : 1)}Z`;
      }
      return (
        path(teeth, { fill: COLOR.white }) +
        path(outline, { fill: COLOR.white }) +
        path(motifsRow('dots', 103, 147, 116, 7), { fill: COLOR.blue, stroke: 'none' })
      );
    }
    case 'yoke': {
      const outline = d`M88,110L162,110L158,124C146,129 104,129 92,124Z`;
      return (
        path(outline, { fill: COLOR.gold }) +
        path(motifsRow('lozenges', 96, 154, 118, 7), { fill: COLOR.red, stroke: 'none' })
      );
    }
  }
}

function motifsRow(kind: MotifKind, x0: number, x1: number, y: number, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += motifD(kind, x0 + ((x1 - x0) * i) / (count - 1), y);
  return out;
}

/* ---------- head parts (local coordinates, origin = centre of the face) ---------- */

function hair(kind: HairKind, color: string): string {
  const fill = { fill: color };
  const strands = { fill: 'none', 'stroke-width': 0.8 };
  switch (kind) {
    case 'kingLong':
      return (
        path(
          'M-14,-20C-22,-15 -25,-3 -25,12C-25,24 -23,32 -18,38C-14,42 -8,40 -6,36L6,36C8,40 14,42 18,38C23,32 25,24 25,12C25,-3 22,-15 14,-20Z',
          fill,
        ) +
        path(
          'M-20,-6C-23,6 -19,16 -22,30M-17,2C-19,14 -16,22 -17,34M20,-6C23,6 19,16 22,30M17,2C19,14 16,22 17,34',
          strands,
        )
      );
    case 'queenLong':
      return (
        path(
          'M-13,-22C-24,-16 -27,-2 -26,14C-25,28 -30,38 -27,50C-24,57 -15,56 -11,50L11,50C15,56 24,57 27,50C30,38 25,28 26,14C27,-2 24,-16 13,-22Z',
          fill,
        ) +
        path(
          'M-20,-8C-23,6 -19,20 -23,34C-25,42 -23,48 -20,52M-17,4C-19,18 -15,30 -18,44M20,-8C23,6 19,20 23,34C25,42 23,48 20,52M17,4C19,18 15,30 18,44',
          strands,
        )
      );
    case 'queenBraids': {
      let braids = '';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          braids += el('ellipse', { cx: side * 20.5, cy: 4 + i * 6.8, rx: 4.8, ry: 4, fill: color });
        }
      }
      return (
        path('M-14,-22C-21,-18 -23,-8 -22,4L22,4C23,-8 21,-18 14,-22Z', fill) +
        braids +
        circle(-20.5, 53, 2.4, { fill: COLOR.red }) +
        circle(20.5, 53, 2.4, { fill: COLOR.red })
      );
    }
    case 'jackCurls': {
      let curls = '';
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const x = side * (19 + (i % 2) * 2);
          const y = -6 + i * 8.5;
          curls +=
            circle(x, y, 5.4, fill) +
            path(d`M${x - side * 2},${y + 1}a2.2,2.2 0 1 ${side > 0 ? 1 : 0} ${side * 2.6},-2.4`, strands);
        }
      }
      return path('M-14,-21C-21,-16 -22,-8 -21,-2L21,-2C22,-8 21,-16 14,-21Z', fill) + curls;
    }
    case 'jackBob':
      return (
        path(
          'M-14,-21C-22,-17 -24,-3 -23,12C-22,20 -16,22 -11,16L-11,0L11,0L11,16C16,22 22,20 23,12C24,-3 22,-17 14,-21Z',
          fill,
        ) +
        path(
          'M-19,-8C-20,2 -19,10 -18,17M-15,-4C-16,4 -15,12 -14,17M19,-8C20,2 19,10 18,17M15,-4C16,4 15,12 14,17',
          strands,
        )
      );
  }
}

/** Short hair fringe visible between the eyebrows line and the headwear. */
const FRINGE = 'M-15,-12C-11,-19 -5,-19 0,-16C5,-19 11,-19 15,-12L15,-24L-15,-24Z';

interface FaceOpts {
  readonly gaze: number;
  readonly feminine: boolean;
  readonly smile?: boolean;
  /** lip colour (defaults to red; the monochrome joker uses ink) */
  readonly lips?: string;
}

function face(o: FaceOpts): string {
  const hw = o.feminine ? 14 : 15;
  const outline = d`M${-hw},-8C${-hw},-22 -8,-27 0,-27C8,-27 ${hw},-22 ${hw},-8C${hw},8 7,${o.feminine ? 20 : 22} 0,${o.feminine ? 20 : 22}C-7,${o.feminine ? 20 : 22} ${-hw},8 ${-hw},-8Z`;
  const eye = (ex: number): string =>
    path(d`M${ex - 4.6},-5Q${ex},-8.4 ${ex + 4.6},-5Q${ex},-2.4 ${ex - 4.6},-5Z`, {
      fill: COLOR.white,
      'stroke-width': 0.9,
    }) + circle(ex + o.gaze * 1.4, -5.2, 1.7, { fill: INK, stroke: 'none' });
  const browY = o.feminine ? -12 : -10.5;
  const brows = path(
    d`M-11.5,${browY + 1.5}Q-6.5,${browY - 2.5} -2,${browY + 0.5}M11.5,${browY + 1.5}Q6.5,${browY - 2.5} 2,${browY + 0.5}`,
    { fill: 'none', 'stroke-width': o.feminine ? 0.9 : 1.5 },
  );
  const lashes = o.feminine
    ? path('M-11.3,-5.4L-12.8,-6.8M11.3,-5.4L12.8,-6.8', { fill: 'none', 'stroke-width': 0.9 })
    : '';
  const nose = path(d`M${o.gaze * 0.6},-5L${-2.4 + o.gaze},5.5Q${o.gaze * 0.5},7.4 ${2.2 + o.gaze},5.8`, {
    fill: 'none',
    'stroke-width': 1,
  });
  const mouth = o.smile
    ? path('M-5.5,10Q0,15.5 5.5,10Q0,13 -5.5,10Z', { fill: o.lips ?? COLOR.red, 'stroke-width': 0.8 })
    : path('M-4.2,11.4Q-2,10 0,10.8Q2,10 4.2,11.4Q0,14.6 -4.2,11.4Z', {
        fill: o.lips ?? COLOR.red,
        'stroke-width': 0.8,
      });
  const cheeks = o.feminine
    ? circle(-8.5, 5, 2.4, { fill: COLOR.red, stroke: 'none', opacity: 0.35 }) +
      circle(8.5, 5, 2.4, { fill: COLOR.red, stroke: 'none', opacity: 0.35 })
    : '';
  return path(outline, { fill: COLOR.white }) + cheeks + eye(-6.5) + eye(6.5) + lashes + brows + nose + mouth;
}

function beard(kind: BeardKind, color: string): string {
  const strands = { fill: 'none', 'stroke-width': 0.8 };
  const inner = 'C13,6 9,13 5,15.6C2,16.6 -2,16.6 -5,15.6C-9,13 -13,6 -15,-2Z';
  switch (kind) {
    case 'none':
      return '';
    case 'full':
      return (
        path(`M-15,-2C-16,14 -12,30 0,42C12,30 16,14 15,-2${inner}`, { fill: color }) +
        path(
          'M-10,12C-10,20 -7,28 -4,34M-4,19C-3,26 -1,32 0,38M10,12C10,20 7,28 4,34M4,19C3,26 1,32 0,38',
          strands,
        )
      );
    case 'forked':
      return (
        path(`M-15,-2C-16,14 -12,30 -5,44L0,35L5,44C12,30 16,14 15,-2${inner}`, { fill: color }) +
        path(
          'M-10,12C-10,22 -8,32 -5,40M-4,19C-3,26 -1,30 0,34M10,12C10,22 8,32 5,40M4,19C3,26 1,30 0,34',
          strands,
        )
      );
    case 'short':
      return (
        path(`M-15,-2C-16,12 -12,24 0,28C12,24 16,12 15,-2${inner}`, { fill: color }) +
        path('M-9,12C-8,18 -6,22 -3,25M9,12C8,18 6,22 3,25M0,18L0,26', strands)
      );
  }
}

function moustache(kind: MoustacheKind, color: string): string {
  switch (kind) {
    case 'none':
      return '';
    case 'full':
      return path(
        'M0,7C-4,5.6 -10,6.6 -13.5,13C-9,10 -4.5,10.2 0,9.4C4.5,10.2 9,10 13.5,13C10,6.6 4,5.6 0,7Z',
        {
          fill: color,
          'stroke-width': 0.9,
        },
      );
    case 'curled':
      return path(
        'M0,7.4C-5,5.4 -10,10.6 -14.5,6.6C-15.5,4.6 -13.5,3.2 -12.4,5C-10.6,8.8 -5,9.8 0,9.6C5,9.8 10.6,8.8 12.4,5C13.5,3.2 15.5,4.6 14.5,6.6C10,10.6 5,5.4 0,7.4Z',
        { fill: color, 'stroke-width': 0.9 },
      );
    case 'thin':
      return path('M-1,8C-5,6.6 -9,7.6 -11.5,10.4M1,8C5,6.6 9,7.6 11.5,10.4', {
        fill: 'none',
        'stroke-width': 1.4,
      });
  }
}

/* ---------- headwear (local coordinates) ---------- */

function crownBand(halfW: number, top: number, bottom: number): string {
  const bandD = d`M${-halfW},${top}Q0,${top - 3} ${halfW},${top}L${halfW},${bottom}Q0,${bottom - 3} ${-halfW},${bottom}Z`;
  const mid = (top + bottom) / 2 - 1.2;
  return (
    path(bandD, { fill: COLOR.gold }) +
    el('ellipse', { cx: 0, cy: mid, rx: 2.8, ry: 3.2, fill: COLOR.red, 'stroke-width': 0.8 }) +
    circle(-halfW * 0.55, mid + 0.4, 2, { fill: COLOR.blue, 'stroke-width': 0.8 }) +
    circle(halfW * 0.55, mid + 0.4, 2, { fill: COLOR.blue, 'stroke-width': 0.8 })
  );
}

const crownCap = (color: string, top: number, halfW: number, height: number): string =>
  path(d`M${-halfW},${top}C${-halfW},${top - height} ${halfW},${top - height} ${halfW},${top}Z`, {
    fill: color,
  });

const trefoil = (x: number, y: number, r: number, color: string): string =>
  path(
    d`M${x - r},${y - r}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z` +
      d`M${x - 2 * r},${y + r * 0.4}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z` +
      d`M${x},${y + r * 0.4}a${r},${r} 0 1 0 ${2 * r},0a${r},${r} 0 1 0 ${-2 * r},0Z`,
    { fill: color, 'stroke-width': 0.8 },
  );

const spike = (x: number, base: number, h: number, w: number): string =>
  path(d`M${x - w},${base}L${x},${base - h}L${x + w},${base}Z`, { fill: COLOR.gold, 'stroke-width': 0.9 });

const crossPattee = (x: number, y: number, s: number, color: string): string =>
  path(
    d`M${x - s * 0.35},${y - s}L${x + s * 0.35},${y - s}L${x + s * 0.12},${y - s * 0.12}L${x + s},${y - s * 0.35}L${x + s},${y + s * 0.35}L${x + s * 0.12},${y + s * 0.12}L${x + s * 0.35},${y + s}L${x - s * 0.35},${y + s}L${x - s * 0.12},${y + s * 0.12}L${x - s},${y + s * 0.35}L${x - s},${y - s * 0.35}L${x - s * 0.12},${y - s * 0.12}Z`,
    { fill: color, 'stroke-width': 0.8 },
  );

function headwear(kind: HeadwearKind, color: string): string {
  const pearl = (x: number, y: number, r = 1.9): string =>
    circle(x, y, r, { fill: COLOR.white, 'stroke-width': 0.8 });
  switch (kind) {
    case 'crownArched':
      return (
        crownCap(color, -33, 18, 22) +
        band('M-17,-33C-16,-44 -8,-48 0,-48C8,-48 16,-44 17,-33M0,-34L0,-48', COLOR.gold, 2.6) +
        circle(0, -51.4, 3.2, { fill: COLOR.gold }) +
        band('M0,-55L0,-60.5M-2.8,-58L2.8,-58', COLOR.gold, 1.6, 'butt') +
        [-12, 12].map((x) => pearl(x, -41.5)).join('') +
        crownBand(19, -33, -23)
      );
    case 'crownFleur':
      return (
        crownCap(color, -33, 18, 22) +
        [-16, -8, 0, 8, 16]
          .map((x) =>
            Math.abs(x) % 16 === 0
              ? spike(x, -32, 12, 3.4) + trefoil(x, -46, 2.5, COLOR.gold)
              : spike(x, -32, 7, 3) + pearl(x, -40.5),
          )
          .join('') +
        crownBand(19, -33, -23)
      );
    case 'crownSpikes':
      return (
        crownCap(color, -33, 17, 20) +
        [-18, -12, -6, 0, 6, 12, 18]
          .map((x, i) => spike(x, -32, i % 2 === 0 ? 15 : 9, 3) + pearl(x, i % 2 === 0 ? -48.5 : -42.5, 2))
          .join('') +
        crownBand(19, -33, -23)
      );
    case 'crownCross':
      return (
        crownCap(color, -33, 18, 24) +
        spike(-8, -32, 8, 3) +
        spike(8, -32, 8, 3) +
        trefoil(-8, -42, 2.2, COLOR.gold) +
        trefoil(8, -42, 2.2, COLOR.gold) +
        [-16, 0, 16].map((x) => crossPattee(x, x === 0 ? -42 : -39, x === 0 ? 7 : 5, COLOR.gold)).join('') +
        crownBand(19, -33, -23)
      );
    case 'tiaraFleur':
      return (
        spike(-10, -30, 7, 2.6) +
        spike(10, -30, 7, 2.6) +
        spike(0, -30, 10, 3) +
        trefoil(-10, -39, 1.9, COLOR.gold) +
        trefoil(10, -39, 1.9, COLOR.gold) +
        trefoil(0, -42.5, 2.3, COLOR.gold) +
        crownBand(16, -31, -24)
      );
    case 'tiaraPearl':
      return (
        path('M-15,-30C-12,-40 -5,-44 0,-44C5,-44 12,-40 15,-30Z', { fill: COLOR.gold }) +
        [-12, -6, 0, 6, 12].map((x) => pearl(x, -39 + Math.abs(x) * 0.45 - (x === 0 ? 5 : 0), 2.1)).join('') +
        el('ellipse', { cx: 0, cy: -36, rx: 2.4, ry: 3, fill: COLOR.red, 'stroke-width': 0.8 }) +
        crownBand(16, -31, -24)
      );
    case 'tiaraSpikes':
      return (
        [-13, -6.5, 0, 6.5, 13]
          .map(
            (x, i) =>
              spike(x, -30, i % 2 === 0 ? 11 : 7, 2.8) +
              circle(x, i % 2 === 0 ? -42.5 : -38.5, 1.9, { fill: COLOR.red, 'stroke-width': 0.8 }),
          )
          .join('') + crownBand(16, -31, -24)
      );
    case 'tiaraCross':
      return (
        [-11, 11].map((x) => spike(x, -30, 6, 2.6) + pearl(x, -37.5)).join('') +
        crossPattee(0, -38, 6, COLOR.gold) +
        crownBand(16, -31, -24)
      );
    case 'capFeather':
      return (
        path('M8,-38C18,-52 36,-53 42,-40C34,-46 24,-44 13,-33Z', { fill: COLOR.gold }) +
        path('M10,-36C20,-46 30,-48 39,-42', { fill: 'none', 'stroke-width': 0.8 }) +
        path('M-17,-29C-18,-42 -8,-47 0,-47C8,-47 18,-42 17,-29Z', { fill: color }) +
        path('M-17.6,-33L17.6,-33L17.6,-29L-17.6,-29Z', { fill: COLOR.gold, 'stroke-width': 1 }) +
        el('ellipse', { cx: 0, cy: -27, rx: 24, ry: 4.6, fill: color }) +
        pearl(-8, -31, 1.5) +
        pearl(0, -31, 1.5) +
        pearl(8, -31, 1.5)
      );
    case 'hatRolled': {
      let stripes = '';
      for (let x = -15; x <= 15; x += 5) stripes += d`M${x - 2},-24.6L${x + 2},-33.4`;
      return (
        path('M-15,-31L-13,-47C-6,-51 6,-51 13,-47L15,-31Z', { fill: color }) +
        path('M-8,-49L-6,-33M8,-49L6,-33', { fill: 'none', 'stroke-width': 0.7 }) +
        el('rect', { x: -21, y: -34, width: 42, height: 10, rx: 5, fill: COLOR.gold }) +
        path(stripes, { fill: 'none', stroke: COLOR.red, 'stroke-width': 1.8 })
      );
    }
    case 'beretPlume':
      return (
        path('M10,-40C14,-52 28,-56 38,-50C30,-50 22,-46 17,-38Z', { fill: COLOR.white }) +
        path('M13,-40C18,-48 26,-51 35,-50', { fill: 'none', 'stroke-width': 0.7 }) +
        path('M-23,-27C-27,-38 -10,-46 6,-45C21,-44 29,-37 25,-29C18,-26 -14,-24 -23,-27Z', { fill: color }) +
        band('M-20,-27.5C-8,-25 10,-26 22,-29', COLOR.gold, 2.4) +
        crossPattee(8, -35, 3.4, COLOR.gold)
      );
    case 'hatTall':
      return (
        path('M-14,-28L-12,-54C-4,-57 4,-57 12,-54L14,-28Z', { fill: color }) +
        path('M-13.2,-38L13.2,-38L13.6,-31L-13.6,-31Z', { fill: COLOR.gold, 'stroke-width': 1 }) +
        path(motifsRow('lozenges', -8, 8, -34.5, 3).replace(/4\.2/g, '2.6'), {
          fill: COLOR.red,
          stroke: 'none',
        }) +
        path('M-24,-26C-20,-31 20,-31 24,-26C20,-22.6 -20,-22.6 -24,-26Z', { fill: color })
      );
  }
}

/** Veil worn by the queens, falling behind the hair onto the shoulders. */
const veil = (color: string): string =>
  path(
    'M-18,-30C-28,-20 -32,4 -34,24C-35,34 -37,40 -40,46L40,46C37,40 35,34 34,24C32,4 28,-20 18,-30C11,-37 -11,-37 -18,-30Z',
    { fill: color },
  ) +
  path('M-30,10C-32,24 -34,36 -37,44M30,10C32,24 34,36 37,44', {
    fill: 'none',
    stroke: COLOR.gold,
    'stroke-width': 1.4,
  });

/* ---------- arms, hands, attributes ---------- */

function arm(shoulder: Pt, hand: Pt, sleeveColor: string, withCuff = true): string {
  const dx = hand.x - shoulder.x;
  const dy = hand.y - shoulder.y;
  const len = Math.hypot(dx, dy);
  const u = pt(dx / len, dy / len);
  const n = pt(-u.y, u.x);
  const wrist = pt(hand.x - u.x * 6.5, hand.y - u.y * 6.5);
  const mid = pt((shoulder.x + wrist.x) / 2, (shoulder.y + wrist.y) / 2);
  const wS = 10;
  const wC = 7.4;
  const bulge = 3.5;
  const sleeve = d`M${shoulder.x + n.x * wS},${shoulder.y + n.y * wS}
    Q${mid.x + n.x * (wS + bulge)},${mid.y + n.y * (wS + bulge)} ${wrist.x + n.x * wC},${wrist.y + n.y * wC}
    L${wrist.x - n.x * wC},${wrist.y - n.y * wC}
    Q${mid.x - n.x * (wS + bulge)},${mid.y - n.y * (wS + bulge)} ${shoulder.x - n.x * wS},${shoulder.y - n.y * wS}
    C${shoulder.x - n.x * wS - u.x * wS * 1.3},${shoulder.y - n.y * wS - u.y * wS * 1.3} ${shoulder.x + n.x * wS - u.x * wS * 1.3},${shoulder.y + n.y * wS - u.y * wS * 1.3} ${shoulder.x + n.x * wS},${shoulder.y + n.y * wS}Z`;
  const c0 = pt(wrist.x - u.x * 5, wrist.y - u.y * 5);
  const cuff = d`M${c0.x + n.x * 8.4},${c0.y + n.y * 8.4}L${wrist.x + n.x * 8},${wrist.y + n.y * 8}
    L${wrist.x - n.x * 8},${wrist.y - n.y * 8}L${c0.x - n.x * 8.4},${c0.y - n.y * 8.4}Z`;
  return path(sleeve, { fill: sleeveColor }) + (withCuff ? path(cuff, { fill: COLOR.white }) : '');
}

/** Closed fist around a vertical handle (local coordinates). */
const FIST =
  path('M-6.4,-4.6C-6.4,-8.4 6.4,-8.4 6.4,-4.6L6.4,4.6C6.4,8.4 -6.4,8.4 -6.4,4.6Z', { fill: COLOR.white }) +
  path('M-6.4,-2L2,-2M-6.4,1.2L2,1.2M-6.4,4.4L1.6,4.4M2,-5.6C5,-5.6 6.4,-3 5.6,-0.6', {
    fill: 'none',
    'stroke-width': 0.8,
  });

interface AttributeArt {
  /** drawn before the hair / head (e.g. a sword passing behind the head) */
  readonly behind: boolean;
  /** drawn after the hand (e.g. an orb resting on the palm) */
  readonly overHand: boolean;
  readonly art: string;
}

function attributeArt(kind: AttributeKind, accent: string): AttributeArt {
  const plain = (art: string, overHand = false, behind = false): AttributeArt => ({ art, overHand, behind });
  switch (kind) {
    case 'sword':
    case 'swordBehind': {
      const L = kind === 'sword' ? 104 : 100;
      return plain(
        path(d`M-3.6,-11L-3.6,${-(L - 12)}L0,${-L}L3.6,${-(L - 12)}L3.6,-11Z`, { fill: COLOR.white }) +
          path(d`M0,-14L0,${-(L - 14)}`, { fill: 'none', 'stroke-width': 0.8 }) +
          path(
            'M-15,-12C-15,-15.5 -10,-14.6 -4,-12.6L4,-12.6C10,-14.6 15,-15.5 15,-12C15,-8.6 10,-8.2 4,-8.8L-4,-8.8C-10,-8.2 -15,-8.6 -15,-12Z',
            {
              fill: COLOR.gold,
            },
          ) +
          el('rect', { x: -2.8, y: -9, width: 5.6, height: 19, fill: accent }) +
          circle(0, 13, 3.8, { fill: COLOR.gold }),
        false,
        kind === 'swordBehind',
      );
    }
    case 'axe':
      return plain(
        el('rect', { x: -2.2, y: -90, width: 4.4, height: 106, rx: 1.5, fill: COLOR.gold }) +
          path('M2.2,-88C13,-95 24,-88 25,-72C24,-58 13,-53 2.2,-60Z', { fill: COLOR.white }) +
          path('M5.4,-84C14,-88 21,-82 21.4,-72C21,-62 14,-58 5.4,-63', {
            fill: 'none',
            'stroke-width': 0.7,
          }) +
          path('M-2.2,-84L-12,-76L-2.2,-68Z', { fill: accent }) +
          path('M-2.2,-90L0,-99L2.2,-90Z', { fill: COLOR.white }) +
          el('rect', { x: -3.2, y: -58, width: 6.4, height: 4, fill: accent }),
      );
    case 'orb':
      return plain(
        circle(0, -18, 12.5, { fill: COLOR.gold }) +
          path('M-12.2,-16.4Q0,-11 12.2,-16.4', { fill: 'none', stroke: COLOR.blue, 'stroke-width': 3 }) +
          path('M0,-30.4C-4.6,-25 -4.6,-10 0,-5.6', { fill: 'none', stroke: COLOR.blue, 'stroke-width': 3 }) +
          circle(0, -18, 12.5, { fill: 'none' }) +
          circle(-6, -14.6, 1.3, { fill: accent, stroke: 'none' }) +
          circle(6, -14.6, 1.3, { fill: accent, stroke: 'none' }) +
          band('M0,-31L0,-42M-4,-37.5L4,-37.5', COLOR.gold, 1.8, 'butt'),
        true,
      );
    case 'sceptre':
      return plain(
        band('M0,16L0,-86', COLOR.gold, 3.4, 'butt') +
          circle(0, -32, 3.4, { fill: COLOR.gold }) +
          circle(0, -64, 3, { fill: COLOR.gold }) +
          circle(0, 18, 3.6, { fill: COLOR.gold }) +
          path('M0,-106C4.4,-100 4.4,-92 0,-88C-4.4,-92 -4.4,-100 0,-106Z', { fill: COLOR.gold }) +
          path(
            'M-1,-89C-8,-94 -13,-88 -9,-83C-7,-86 -4,-87 -1,-86ZM1,-89C8,-94 13,-88 9,-83C7,-86 4,-87 1,-86Z',
            { fill: COLOR.gold },
          ) +
          el('rect', { x: -6.4, y: -88, width: 12.8, height: 4, fill: accent, 'stroke-width': 0.9 }),
      );
    case 'rose': {
      let petals = '';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        petals += circle(5.6 * Math.cos(a), -34 + 5.6 * Math.sin(a), 5, { fill: accent });
      }
      return plain(
        path('M0,6C1,-8 -1,-18 0,-28', { fill: 'none', 'stroke-width': 1.6 }) +
          path(
            'M0,-12C-6,-15 -12,-11 -13,-6C-8,-6 -3,-8 0,-12ZM0,-19C6,-22 12,-19 13,-14C8,-13.6 3,-15 0,-19Z',
            { fill: COLOR.gold },
          ) +
          petals +
          circle(0, -34, 3.6, { fill: COLOR.gold }),
        true,
      );
    }
    case 'tulip':
      return plain(
        path('M0,6C1,-10 -1,-22 0,-34', { fill: 'none', 'stroke-width': 1.6 }) +
          path('M0,-6C-9,-12 -14,-24 -12,-34C-6,-26 -2,-18 0,-10Z', { fill: COLOR.blue }) +
          path(
            'M-8,-35C-10,-44 -8,-51 -4.4,-53L-2,-46L0,-54L2,-46L4.4,-53C8,-51 10,-44 8,-35C4.6,-31 -4.6,-31 -8,-35Z',
            { fill: accent },
          ) +
          path('M-4.4,-35C-5.4,-41 -4,-45 -2,-46M4.4,-35C5.4,-41 4,-45 2,-46', {
            fill: 'none',
            'stroke-width': 0.7,
          }),
        true,
      );
    case 'sprig': {
      const flower = (x: number, y: number): string => {
        let p = '';
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          p += circle(x + 3.4 * Math.cos(a), y + 3.4 * Math.sin(a), 3, { fill: accent, 'stroke-width': 0.9 });
        }
        return p + circle(x, y, 2, { fill: COLOR.gold, 'stroke-width': 0.8 });
      };
      return plain(
        path('M0,6C0,-10 -4,-22 -11,-30M0,-4C1,-18 0,-28 1,-40M0,-2C4,-14 8,-20 12,-27', {
          fill: 'none',
          'stroke-width': 1.4,
        }) +
          path('M0,-14C-7,-16 -11,-13 -12,-9C-7,-9 -3,-10 0,-14Z', { fill: COLOR.gold }) +
          flower(-11, -31) +
          flower(1, -42) +
          flower(12, -28),
        true,
      );
    }
    case 'leaf':
      return plain(
        path('M0,4C-14,-12 -16,-44 -2,-70C13,-46 13,-14 0,4Z', { fill: COLOR.gold }) +
          path(
            'M0,2C-1,-24 -1,-46 -2,-66M-0.6,-14L-8,-22M-0.8,-26L-9,-35M-1,-38L-8,-47M-1.4,-50L-6,-57M-0.4,-18L7,-26M-0.8,-30L7.6,-39M-1,-42L6,-50',
            { fill: 'none', stroke: accent, 'stroke-width': 1 },
          ),
      );
    case 'halberd':
      return plain(
        band('M0,14L0,-100', COLOR.gold, 3.2, 'butt') +
          path('M0,-122C3.4,-114 4.2,-108 3.4,-100L-3.4,-100C-4.2,-108 -3.4,-114 0,-122Z', {
            fill: COLOR.white,
          }) +
          path('M2,-100C11,-104 19,-100 21,-88C17,-82 10,-82 2,-86Z', { fill: COLOR.white }) +
          path('M-2,-98C-8,-96 -14,-92 -16,-85C-10,-87 -6,-89 -2,-90Z', { fill: COLOR.white }) +
          path('M-3.4,-82L3.4,-82L5.4,-70L-5.4,-70Z', { fill: accent }) +
          path('M-3.4,-78L3.4,-78M-4.4,-74L4.4,-74', { fill: 'none', 'stroke-width': 0.6 }),
      );
    case 'torch':
      return plain(
        path('M-3,12L3,12L5,-24L-5,-24Z', { fill: COLOR.gold }) +
          path('M-4,-6L4,-6M-4.6,-15L4.6,-15', { fill: 'none', 'stroke-width': 0.8 }) +
          path('M-8,-24L8,-24L6,-30L-6,-30Z', { fill: accent }) +
          path('M0,-68C4,-58 13,-52 10,-40C9,-34 5,-30 0,-30C-5,-30 -9,-34 -10,-40C-13,-52 -4,-58 0,-68Z', {
            fill: COLOR.red,
          }) +
          path('M0,-56C2,-49 6,-45 5,-38C4,-35 2,-33 0,-33C-2,-33 -4,-35 -5,-38C-6,-45 -2,-49 0,-56Z', {
            fill: COLOR.gold,
            'stroke-width': 0.8,
          }),
      );
    case 'arrow':
      return plain(
        band('M0,22L0,-86', COLOR.gold, 2.2, 'butt') +
          path('M0,-104L6.4,-84L0,-88L-6.4,-84Z', { fill: COLOR.white }) +
          path('M0,14L-6,22L-6,30L0,23ZM0,14L6,22L6,30L0,23Z', { fill: accent, 'stroke-width': 0.9 }),
      );
  }
}

function heldAttribute(spec: CourtSpec, part: 'behind' | 'front'): string {
  const a = attributeArt(spec.attribute, spec.attrColor);
  const transform = `translate(${num(spec.hand.x)} ${num(spec.hand.y)}) rotate(${num(spec.handAngle)})`;
  if (part === 'behind') return a.behind ? g({ transform }, a.art) : '';
  const shoulder = spec.arm === 'L' ? pt(73, 136) : pt(177, 136);
  const art = a.behind ? '' : a.art;
  return arm(shoulder, spec.hand, spec.sleeve) + g({ transform }, a.overHand ? FIST + art : art + FIST);
}

/* ---------- assembling a court card ---------- */

function headOrigin(rank: CourtRank): Pt {
  return pt(CX, rank === 'Q' ? 84 : 82);
}

function courtHalf(spec: CourtSpec): string {
  const head = headOrigin(spec.rank);
  const at = `translate(${num(head.x)} ${num(head.y)}) scale(${HEAD_SCALE})`;
  const isQueen = spec.rank === 'Q';
  const hairColor = COLOR.gold;
  const pipX = spec.pipSide === 'L' ? FRAME.x0 + 17 : FRAME.x1 - 17;

  return (
    robe(spec) +
    heldAttribute(spec, 'behind') +
    g(
      { transform: at },
      isQueen ? veil(spec.headColor) : '',
      hair(spec.hair, hairColor),
      el('rect', { x: -7.5, y: 10, width: 15, height: 24, fill: COLOR.white }),
    ) +
    g({ transform: `translate(0 ${COLLAR_DY})` }, collar(spec.collar)) +
    g(
      { transform: at },
      face({ gaze: spec.gaze, feminine: isQueen }),
      path(FRINGE, { fill: hairColor }),
      beard(spec.beard, spec.beardColor),
      moustache(spec.moustache, spec.beardColor),
      headwear(spec.headwear, spec.headColor),
    ) +
    heldAttribute(spec, 'front') +
    g({ stroke: 'none' }, useSuit(spec.suit, pipX, FRAME.y0 + 19, 24))
  );
}

function courtBody(spec: CourtSpec, cardId: string): string {
  const halfId = `card-${cardId}-half`;
  const frame = el('rect', {
    x: FRAME.x0,
    y: FRAME.y0,
    width: FRAME.x1 - FRAME.x0,
    height: FRAME.y1 - FRAME.y0,
    fill: 'none',
    stroke: INK,
    'stroke-width': 1.4,
  });
  const divider = path(d`M${FRAME.x0},${yDiv(FRAME.x0)}L${FRAME.x1},${yDiv(FRAME.x1)}`, {
    stroke: INK,
    'stroke-width': 1.4,
  });
  return (
    g(
      {
        id: halfId,
        stroke: INK,
        'stroke-width': LINE_W,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      },
      courtHalf(spec),
    ) +
    el('use', { href: `#${halfId}`, transform: rotate180(CX, CY) }) +
    divider +
    frame
  );
}

/* ---------- the twelve court designs ---------- */

const fab = (base: string, motif: MotifKind, ink: string): Fabric => ({ base, motif, ink });
const { red: R, blue: B, gold: Y, black: K, white: Wt } = COLOR;

const COURTS: readonly CourtSpec[] = [
  // Kings
  {
    rank: 'K',
    suit: 'S',
    headwear: 'crownArched',
    headColor: B,
    hair: 'kingLong',
    beard: 'full',
    beardColor: Wt,
    moustache: 'full',
    gaze: -1,
    left: fab(R, 'lozenges', Y),
    right: fab(B, 'crosses', Y),
    placket: fab(Y, 'lozenges', K),
    collar: 'ermine',
    sleeve: Y,
    attribute: 'sword',
    attrColor: R,
    hand: pt(163, 146),
    handAngle: 0,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'K',
    suit: 'H',
    headwear: 'crownFleur',
    headColor: R,
    hair: 'kingLong',
    beard: 'forked',
    beardColor: Y,
    moustache: 'none',
    gaze: 1,
    left: fab(B, 'trefoils', Y),
    right: fab(R, 'dots', Wt),
    placket: fab(Wt, 'ermine', K),
    collar: 'chain',
    sleeve: R,
    attribute: 'swordBehind',
    attrColor: B,
    hand: pt(160, 100),
    handAngle: -64,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'K',
    suit: 'D',
    headwear: 'crownSpikes',
    headColor: R,
    hair: 'kingLong',
    beard: 'short',
    beardColor: Y,
    moustache: 'curled',
    gaze: 1,
    left: fab(Y, 'lozenges', R),
    right: fab(R, 'crosses', Y),
    placket: fab(B, 'dots', Wt),
    collar: 'ermine',
    sleeve: R,
    sash: B,
    attribute: 'axe',
    attrColor: R,
    hand: pt(86, 144),
    handAngle: -6,
    arm: 'L',
    pipSide: 'R',
  },
  {
    rank: 'K',
    suit: 'C',
    headwear: 'crownCross',
    headColor: B,
    hair: 'kingLong',
    beard: 'full',
    beardColor: Y,
    moustache: 'full',
    gaze: 0,
    left: fab(B, 'dots', Wt),
    right: fab(Y, 'trefoils', K),
    placket: fab(R, 'lozenges', Y),
    collar: 'chain',
    sleeve: R,
    attribute: 'orb',
    attrColor: R,
    hand: pt(92, 146),
    handAngle: 0,
    arm: 'L',
    pipSide: 'R',
  },
  // Queens
  {
    rank: 'Q',
    suit: 'S',
    headwear: 'tiaraFleur',
    headColor: B,
    hair: 'queenLong',
    beard: 'none',
    beardColor: Y,
    moustache: 'none',
    gaze: 1,
    left: fab(R, 'dots', Y),
    right: fab(B, 'lozenges', Y),
    placket: fab(Y, 'crosses', R),
    collar: 'ruff',
    sleeve: R,
    attribute: 'sceptre',
    attrColor: R,
    hand: pt(163, 146),
    handAngle: 3,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'Q',
    suit: 'H',
    headwear: 'tiaraSpikes',
    headColor: R,
    hair: 'queenBraids',
    beard: 'none',
    beardColor: Y,
    moustache: 'none',
    gaze: -1,
    left: fab(Y, 'trefoils', R),
    right: fab(R, 'dots', Y),
    placket: fab(B, 'dots', Wt),
    collar: 'lace',
    sleeve: B,
    attribute: 'rose',
    attrColor: R,
    hand: pt(94, 146),
    handAngle: -14,
    arm: 'L',
    pipSide: 'R',
  },
  {
    rank: 'Q',
    suit: 'D',
    headwear: 'tiaraPearl',
    headColor: R,
    hair: 'queenLong',
    beard: 'none',
    beardColor: Y,
    moustache: 'none',
    gaze: -1,
    left: fab(B, 'crosses', Y),
    right: fab(Y, 'lozenges', B),
    placket: fab(R, 'dots', Wt),
    collar: 'ruff',
    sleeve: B,
    sash: R,
    attribute: 'tulip',
    attrColor: R,
    hand: pt(158, 138),
    handAngle: 12,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'Q',
    suit: 'C',
    headwear: 'tiaraCross',
    headColor: B,
    hair: 'queenBraids',
    beard: 'none',
    beardColor: Y,
    moustache: 'none',
    gaze: 1,
    left: fab(R, 'lozenges', Y),
    right: fab(B, 'trefoils', Wt),
    placket: fab(Y, 'dots', K),
    collar: 'lace',
    sleeve: Y,
    attribute: 'sprig',
    attrColor: Y,
    hand: pt(92, 146),
    handAngle: -8,
    arm: 'L',
    pipSide: 'R',
  },
  // Jacks
  {
    rank: 'J',
    suit: 'S',
    headwear: 'capFeather',
    headColor: B,
    hair: 'jackCurls',
    beard: 'none',
    beardColor: Y,
    moustache: 'thin',
    gaze: -1,
    left: fab(Y, 'chevrons', R),
    right: fab(B, 'dots', Y),
    placket: fab(R, 'crosses', Y),
    collar: 'yoke',
    sleeve: R,
    attribute: 'halberd',
    attrColor: R,
    hand: pt(164, 148),
    handAngle: 0,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'J',
    suit: 'H',
    headwear: 'hatRolled',
    headColor: R,
    hair: 'jackBob',
    beard: 'none',
    beardColor: Y,
    moustache: 'none',
    gaze: 1,
    left: fab(R, 'dots', Y),
    right: fab(Y, 'lozenges', R),
    placket: fab(B, 'chevrons', Wt),
    collar: 'lace',
    sleeve: Y,
    attribute: 'leaf',
    attrColor: R,
    hand: pt(90, 146),
    handAngle: -10,
    arm: 'L',
    pipSide: 'R',
  },
  {
    rank: 'J',
    suit: 'D',
    headwear: 'beretPlume',
    headColor: B,
    hair: 'jackCurls',
    beard: 'none',
    beardColor: Y,
    moustache: 'full',
    gaze: 1,
    left: fab(B, 'lozenges', Y),
    right: fab(R, 'dots', Wt),
    placket: fab(Y, 'chevrons', B),
    collar: 'yoke',
    sleeve: B,
    sash: Y,
    attribute: 'arrow',
    attrColor: R,
    hand: pt(160, 146),
    handAngle: 16,
    arm: 'R',
    pipSide: 'L',
  },
  {
    rank: 'J',
    suit: 'C',
    headwear: 'hatTall',
    headColor: K,
    hair: 'jackBob',
    beard: 'none',
    beardColor: Y,
    moustache: 'curled',
    gaze: -1,
    left: fab(Y, 'crosses', B),
    right: fab(R, 'trefoils', Y),
    placket: fab(B, 'dots', Y),
    collar: 'lace',
    sleeve: R,
    attribute: 'torch',
    attrColor: B,
    hand: pt(90, 146),
    handAngle: -6,
    arm: 'L',
    pipSide: 'R',
  },
];

/* ================================================================== jokers */

interface JesterPalette {
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly aInk: string;
  readonly bInk: string;
  readonly mono: boolean;
}

function jester(p: JesterPalette): string {
  const head = pt(CX, 118);
  const bell = (x: number, y: number): string =>
    circle(x, y, 4.2, { fill: p.c }) +
    path(d`M${x - 2.6},${y + 0.6}L${x + 2.6},${y + 0.6}`, { fill: 'none', 'stroke-width': 0.8 });

  // legs & shoes
  const legs =
    path('M106,246L98,300L112,300L120,246Z', { fill: p.b }) +
    path('M130,246L138,300L152,300L144,246Z', { fill: p.a }) +
    path('M113,298L98,298C90,298 82,299 76,294C73,302 80,311 93,311L113,311Z', { fill: p.a }) +
    path('M137,298L152,298C160,298 168,299 174,294C177,302 170,311 157,311L137,311Z', { fill: p.b }) +
    bell(75, 291) +
    bell(175, 291);

  // tunic with harlequin lozenges and a pointed hem
  const tunicL = 'M92,158C84,190 84,220 90,236L96,254L104,242L112,256L120,242L125,252L125,152L100,152Z';
  const tunicR = 'M158,158C166,190 166,220 160,236L154,254L146,242L138,256L130,242L125,252L125,152L150,152Z';
  const polyL = [pt(92, 158), pt(86, 200), pt(90, 236), pt(125, 240), pt(125, 152), pt(100, 152)];
  const polyR = polyL.map((q) => pt(2 * CX - q.x, q.y));
  let lozL = '';
  let lozR = '';
  for (let y = 164; y <= 232; y += 14) {
    for (let x = 97; x <= 153; x += 14) {
      const q = pt(x + (((y - 164) / 14) % 2) * 7, y);
      const dd = d`M${q.x},${q.y - 6.6}L${q.x + 4.8},${q.y}L${q.x},${q.y + 6.6}L${q.x - 4.8},${q.y}Z`;
      const probe = [pt(q.x, q.y - 7), pt(q.x, q.y + 7), pt(q.x - 5, q.y), pt(q.x + 5, q.y)];
      if (probe.every((r) => insidePolygon(r, polyL))) lozL += dd;
      if (probe.every((r) => insidePolygon(r, polyR))) lozR += dd;
    }
  }
  const tunic =
    path(tunicL, { fill: p.a }) +
    path(tunicR, { fill: p.b }) +
    path(lozL, { fill: p.aInk, 'stroke-width': 0.6 }) +
    path(lozR, { fill: p.bInk, 'stroke-width': 0.6 }) +
    band('M90,230C104,236 146,236 160,230', p.c, 4, 'butt') +
    bell(104, 245) +
    bell(125, 255) +
    bell(146, 245);

  // arms: left holds the marotte, right rests on the hip
  const leftArm = arm(pt(96, 166), pt(80, 212), p.b);
  const rightArm =
    arm(pt(156, 166), pt(176, 200), p.a, false) +
    arm(pt(177, 199), pt(152, 226), p.a) +
    el('ellipse', { cx: 151, cy: 227, rx: 6.4, ry: 5.4, fill: COLOR.white });

  // marotte: stick with a tiny jester head
  const marotte =
    band('M80,214L62,134', p.c, 3, 'butt') +
    circle(60, 124, 9, { fill: COLOR.white }) +
    path('M54,121a1,1 0 1 0 2,0a1,1 0 1 0 -2,0ZM63,121a1,1 0 1 0 2,0a1,1 0 1 0 -2,0Z', {
      fill: INK,
      stroke: 'none',
    }) +
    path('M55,127Q60,131 65,127', { fill: 'none', 'stroke-width': 1 }) +
    path(
      'M51,118C46,108 42,104 36,104C42,100 50,104 55,114ZM60,115C58,104 60,96 66,92C66,100 66,106 64,115ZM69,118C74,110 80,108 86,110C80,112 76,116 72,121Z',
      {
        fill: p.a,
      },
    ) +
    circle(36, 104, 2.6, { fill: p.c }) +
    circle(66, 92, 2.6, { fill: p.c }) +
    circle(86, 110, 2.6, { fill: p.c }) +
    path('M51,132L69,132L66,138L54,138Z', { fill: p.b }) +
    el('ellipse', { cx: 79, cy: 212, rx: 6, ry: 5, fill: COLOR.white });

  // pointed collar
  let collarPts = '';
  const pts = 7;
  for (let i = 0; i < pts; i++) {
    const x0 = 90 + (70 / pts) * i;
    const x1 = x0 + 70 / pts;
    const tip = pt((x0 + x1) / 2, 170 + (i === 0 || i === pts - 1 ? -4 : i === 3 ? 6 : 2));
    collarPts +=
      path(d`M${x0},150L${x1},150L${tip.x},${tip.y}Z`, { fill: i % 2 === 0 ? p.a : p.b }) +
      bell(tip.x, tip.y + 2);
  }

  // head: cap with three lobes and bells
  const cap =
    path('M-20,-26C-30,-40 -44,-48 -56,-36C-50,-36 -44,-32 -40,-24C-34,-22 -26,-22 -20,-26Z', { fill: p.b }) +
    path('M20,-26C30,-40 44,-48 56,-36C50,-36 44,-32 40,-24C34,-22 26,-22 20,-26Z', { fill: p.b }) +
    path('M-18,-24C-20,-50 -8,-72 8,-80C4,-66 6,-52 18,-24Z', { fill: p.a }) +
    path('M-20,-24C-20,-36 20,-36 20,-24Z', { fill: p.a }) +
    band('M-20,-25C-8,-28 8,-28 20,-25', p.c, 5, 'butt') +
    bell(-57, -33) +
    bell(57, -33) +
    bell(9, -83);

  const jesterFace =
    face({ gaze: 1, feminine: false, smile: true, lips: p.mono ? INK : COLOR.red }) +
    (p.mono
      ? ''
      : circle(-9, 5, 2.4, { fill: COLOR.red, stroke: 'none', opacity: 0.35 }) +
        circle(9, 5, 2.4, { fill: COLOR.red, stroke: 'none', opacity: 0.35 }));

  return g(
    { stroke: INK, 'stroke-width': LINE_W, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' },
    legs,
    tunic,
    rightArm,
    leftArm,
    marotte,
    el('rect', { x: head.x - 8, y: head.y + 12, width: 16, height: 24, fill: COLOR.white }),
    collarPts,
    g({ transform: `translate(${head.x} ${head.y}) scale(1.24 1.12)` }, jesterFace, cap),
  );
}

function jokerBody(variant: 1 | 2): string {
  const palette: JesterPalette =
    variant === 1
      ? { a: COLOR.red, b: COLOR.blue, c: COLOR.gold, aInk: COLOR.gold, bInk: COLOR.gold, mono: false }
      : { a: COLOR.black, b: COLOR.white, c: COLOR.white, aInk: COLOR.white, bInk: COLOR.black, mono: true };
  return jester(palette) + jokerIndices(variant === 1 ? COLOR.red : COLOR.black);
}

/* ================================================================== back */

/** Clip the infinite line {p : n·p = c} to an axis-aligned rectangle. */
function clipLine(n: Pt, c: number, x0: number, y0: number, x1: number, y1: number): [Pt, Pt] | null {
  const hits: Pt[] = [];
  const add = (p: Pt): void => {
    if (p.x >= x0 - 1e-6 && p.x <= x1 + 1e-6 && p.y >= y0 - 1e-6 && p.y <= y1 + 1e-6) {
      if (!hits.some((h) => Math.abs(h.x - p.x) < 1e-6 && Math.abs(h.y - p.y) < 1e-6)) hits.push(p);
    }
  };
  if (Math.abs(n.y) > 1e-9) {
    add(pt(x0, (c - n.x * x0) / n.y));
    add(pt(x1, (c - n.x * x1) / n.y));
  }
  if (Math.abs(n.x) > 1e-9) {
    add(pt((c - n.y * y0) / n.x, y0));
    add(pt((c - n.y * y1) / n.x, y1));
  }
  const [a, b] = hits;
  return a !== undefined && b !== undefined ? [a, b] : null;
}

function latticePath(
  spacing: number,
  offset: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): string {
  let out = '';
  for (const dir of [pt(1, 1.45), pt(-1, 1.45)]) {
    const len = Math.hypot(dir.x, dir.y);
    const n = pt(dir.y / len, -dir.x / len);
    const c0 = n.x * CX + n.y * CY;
    for (let k = -40; k <= 40; k++) {
      const seg = clipLine(n, c0 + (k + offset) * spacing, x0, y0, x1, y1);
      if (seg) out += d`M${seg[0].x},${seg[0].y}L${seg[1].x},${seg[1].y}`;
    }
  }
  return out;
}

function rosette(x: number, y: number, rx: number, ry: number, count: number, width: number): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += el('ellipse', {
      cx: x,
      cy: y,
      rx,
      ry,
      transform: `rotate(${num((180 / count) * i)} ${num(x)} ${num(y)})`,
    });
  }
  return g({ fill: 'none', stroke: COLOR.white, 'stroke-width': width }, out);
}

function backBody(): string {
  const M = 12;
  const field = { x0: M, y0: M, x1: CARD_W - M, y1: CARD_H - M };
  const inner = { x0: M + 7, y0: M + 7, x1: CARD_W - M - 7, y1: CARD_H - M - 7 };
  const blue = COLOR.blue;
  const corner = (x: number, y: number): string =>
    circle(x, y, 13, { fill: blue, stroke: COLOR.white, 'stroke-width': 1.4 }) +
    rosette(x, y, 10, 3.4, 6, 0.7) +
    circle(x, y, 1.8, { fill: COLOR.white });
  return (
    el('rect', {
      x: field.x0,
      y: field.y0,
      width: field.x1 - field.x0,
      height: field.y1 - field.y0,
      rx: 6,
      fill: blue,
    }) +
    el('rect', {
      x: inner.x0 - 3,
      y: inner.y0 - 3,
      width: inner.x1 - inner.x0 + 6,
      height: inner.y1 - inner.y0 + 6,
      rx: 3,
      fill: 'none',
      stroke: COLOR.white,
      'stroke-width': 1.2,
    }) +
    path(latticePath(11, 0, inner.x0, inner.y0, inner.x1, inner.y1), {
      stroke: COLOR.white,
      'stroke-width': 1.1,
      fill: 'none',
    }) +
    path(latticePath(11, 0.5, inner.x0, inner.y0, inner.x1, inner.y1), {
      stroke: COLOR.white,
      'stroke-width': 0.4,
      fill: 'none',
    }) +
    el('ellipse', { cx: CX, cy: CY, rx: 52, ry: 70, fill: blue, stroke: COLOR.white, 'stroke-width': 3 }) +
    el('ellipse', {
      cx: CX,
      cy: CY,
      rx: 46,
      ry: 64,
      fill: 'none',
      stroke: COLOR.white,
      'stroke-width': 0.8,
    }) +
    rosette(CX, CY, 40, 13, 18, 0.7) +
    rosette(CX, CY, 22, 7, 12, 0.7) +
    el('ellipse', {
      cx: CX,
      cy: CY - 46,
      rx: 6,
      ry: 8,
      fill: 'none',
      stroke: COLOR.white,
      'stroke-width': 0.9,
    }) +
    el('ellipse', {
      cx: CX,
      cy: CY + 46,
      rx: 6,
      ry: 8,
      fill: 'none',
      stroke: COLOR.white,
      'stroke-width': 0.9,
    }) +
    circle(CX, CY, 3.5, { fill: COLOR.white }) +
    corner(inner.x0 + 14, inner.y0 + 14) +
    corner(inner.x1 - 14, inner.y0 + 14) +
    corner(inner.x0 + 14, inner.y1 - 14) +
    corner(inner.x1 - 14, inner.y1 - 14)
  );
}

/* ================================================================== deck assembly */

interface CardArt {
  /** file name / sprite id suffix: "AS", "10H", "JK1", "BACK" */
  readonly id: string;
  readonly symbolId: string;
  readonly body: string;
  readonly suits: readonly Suit[];
}

function faceCard(rank: Rank, suit: Suit): CardArt {
  const id = `${rank}${suit}`;
  let content: string;
  if (rank === 'A') content = aceBody(suit);
  else if (rank === 'J' || rank === 'Q' || rank === 'K') {
    const spec = COURTS.find((c) => c.rank === rank && c.suit === suit);
    if (spec === undefined) throw new Error(`missing court design for ${id}`);
    content = courtBody(spec, id);
  } else content = pipBody(rank, suit);
  return {
    id,
    symbolId: `card-${id}`,
    body: cardBase() + content + cornerIndices(rank, suit),
    suits: [suit],
  };
}

function buildDeck(): CardArt[] {
  const ranks: readonly Rank[] = [...PIP_RANKS, ...COURT_RANKS];
  const cards: CardArt[] = [];
  for (const suit of SUITS) for (const rank of ranks) cards.push(faceCard(rank, suit));
  cards.push({ id: 'JK1', symbolId: 'card-JK1', body: cardBase() + jokerBody(1), suits: [] });
  cards.push({ id: 'JK2', symbolId: 'card-JK2', body: cardBase() + jokerBody(2), suits: [] });
  cards.push({ id: 'BACK', symbolId: 'card-back', body: cardBase() + backBody(), suits: [] });
  return cards;
}

const VIEWBOX = `0 0 ${CARD_W} ${CARD_H}`;

function standaloneSvg(card: CardArt): string {
  const defs = card.suits.length > 0 ? el('defs', {}, card.suits.map(suitSymbol).join('')) : '';
  return (
    el(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', viewBox: VIEWBOX, width: CARD_W, height: CARD_H },
      defs + card.body,
    ) + '\n'
  );
}

function spriteSvg(cards: readonly CardArt[]): string {
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">',
    ...SUITS.map(suitSymbol),
    ...cards.map((c) => el('symbol', { id: c.symbolId, viewBox: VIEWBOX }, c.body)),
    '</svg>',
  ];
  return lines.join('\n') + '\n';
}

function main(): void {
  const scriptDir = dirname(resolve(process.argv[1] ?? '.'));
  const outDir = resolve(process.argv[2] ?? join(scriptDir, '..', 'cards'));
  mkdirSync(outDir, { recursive: true });
  const cards = buildDeck();
  for (const card of cards) writeFileSync(join(outDir, `${card.id}.svg`), standaloneSvg(card), 'utf8');
  const sprite = spriteSvg(cards);
  writeFileSync(join(outDir, 'sprite.svg'), sprite, 'utf8');
  console.log(
    `wrote ${cards.length} cards + sprite.svg (${(Buffer.byteLength(sprite) / 1024).toFixed(1)} KB) to ${outDir}`,
  );
}

main();
