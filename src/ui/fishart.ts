// Detailed fish icons (64×64 SVG) for the 12 lake species, drawn from parameters: body shape,
// colour ramp, pattern, rank and an optional special finish. Fish face left. Original drawings.
//
// Every fish is lit from the top-left: a curved body gradient (dark back → light belly) with a
// soft core shadow, edge darkening for volume, a crisp specular crescent, a rim light from the
// water below, contact shadows where fins meet the body, translucent fins with fine rays,
// patterns that wrap around the body and fade toward the belly, and a glossy eye.
// Rarer fish get more: sheen and fin detail (ranks 6–7), then the special finishes in
// fishart-special.ts (gold, crystal, ancient, cosmic).
//
// Lean on purpose: gradients only, no filters, so ~30 icons can show at once on a phone.

import type { FishPattern, FishShape, FishSpecial } from '../game/fish';
import { Defs, FIN_OUT, OUT, WHITE, crescent, halfH, mixHex, n, rng, sparkle, type Ell } from './fishart-kit';
import { SPECIES_GEO, geometry, type Cols, type Fin, type Geo } from './fishart-geo';
import { specialLook, speciesLook } from './fishart-special';

export interface FishArt {
  ramp: readonly string[];
  shape: FishShape;
  pattern: FishPattern;
  sparkle?: boolean;
  glow?: boolean;
  /** Varies spot placement between species. */
  seed?: number;
  /** One-off finish for the rarest fish. */
  special?: FishSpecial;
  /** 0 = most common … 11 = rarest; higher ranks get more detail. */
  rank?: number;
  /** Species name (e.g. "Rainbow Trout"): picks that fish's own silhouette, colours and markings. */
  name?: string;
}

/** The species key for a fish's own drawing (see SPECIES_GEO / speciesLook). */
const NAME_KEY: Record<string, string> = {
  carp: 'carp', perch: 'perch', bass: 'bass', 'rainbow trout': 'trout', catfish: 'catfish', pike: 'pike', salmon: 'salmon',
  sturgeon: 'sturgeon', 'golden koi': 'koi', 'crystal moonfish': 'moonfish', 'ancient megalodon': 'megalodon', 'abyss leviathan': 'leviathan',
};
/** Without a name, the lake's rank order (with its shape as a check) still finds the species. */
const RANK_KEY: Array<[string, FishShape]> = [
  ['carp', 'carp'], ['perch', 'carp'], ['bass', 'carp'], ['trout', 'slim'], ['catfish', 'cat'], ['pike', 'long'],
  ['salmon', 'carp'], ['sturgeon', 'sturgeon'], ['koi', 'koi'], ['moonfish', 'round'], ['megalodon', 'shark'], ['leviathan', 'whale'],
];
export function speciesKey(a: FishArt): string | undefined {
  if (a.name) return NAME_KEY[a.name.toLowerCase()];
  const r = a.rank === undefined ? undefined : RANK_KEY[a.rank];
  return r && r[1] === a.shape ? r[0] : undefined;
}

/** How fins are painted. */
export interface FinLook {
  root: string;
  tip: string;
  rootOp: number;
  tipOp: number;
  ray: string;
  rayOp: number;
  /** Bright margin along the fin edge. */
  edge: number;
  /** Darker band just inside the edge (extra fin detail). */
  band: number;
  outline: string;
}

/** Per-fish overrides (see fishart-special.ts). Everything left out uses the standard look. */
export interface Look {
  cols: Cols;
  fin: FinLook;
  /** Replaces the silhouette (the megalodon). */
  geo?: Geo;
  /** Between the far fins and the body (an open mouth). */
  under?: (D: Defs, g: Geo, c: Cols) => string;
  /** Body fill (a paint value, usually url(#id)). */
  base?: (D: Defs, g: Geo, c: Cols) => string;
  /** Inside the body, under the shading (replaces the pattern). */
  skin?: (D: Defs, g: Geo, c: Cols) => string;
  /** Inside the body, over the shading. */
  gloss?: (D: Defs, g: Geo, c: Cols) => string;
  /** Behind everything (halo, aura). */
  halo?: (D: Defs) => string;
  /** Over the body outline, inside the shape transform (teeth, plates, spikes). */
  over?: (D: Defs, g: Geo, c: Cols) => string;
  /** On top of everything (sparkles, embers). */
  top?: (D: Defs) => string;
  eye?: (D: Defs, x: number, y: number, r: number, c: Cols) => string;
  /** Strength of the edge darkening (0..1). */
  shade: number;
  rimTop: string;
  rimLow: string;
  outline: string;
  /** Glow line drawn just outside the body outline. */
  outerGlow?: string;
  /** Shimmer band along the flank (0 = none). */
  sheen: number;
  /** Draw the standard pattern. */
  pattern: boolean;
}

export function baseCols(ramp: readonly string[]): Cols {
  const last = ramp.length - 1;
  return {
    back: ramp[0],
    mid: ramp[Math.min(1, last)],
    light: ramp[Math.min(2, last)],
    belly: mixHex(ramp[last], WHITE, 0.55),
    fin: ramp[Math.min(2, last)],
    finDark: ramp[Math.min(1, last)],
    iris: mixHex(ramp[Math.min(2, last)], '#f0b440', 0.55),
  };
}

function standardLook(a: FishArt, rank: number): Look {
  const c = baseCols(a.ramp);
  const hi = rank >= 6;
  return {
    cols: c,
    fin: {
      root: c.mid,
      tip: mixHex(c.light, WHITE, 0.45),
      rootOp: 0.96,
      tipOp: hi ? 0.62 : 0.72,
      ray: mixHex(c.back, '#000000', 0.15),
      rayOp: hi ? 0.5 : 0.38,
      edge: hi ? 0.55 : 0.25,
      band: hi ? 0.28 : 0,
      outline: FIN_OUT,
    },
    shade: 0.42,
    rimTop: WHITE,
    rimLow: mixHex(c.light, '#bfeaff', 0.5),
    outline: OUT,
    sheen: rank >= 6 ? 0.42 : rank >= 3 ? 0.2 : 0,
    pattern: true,
  };
}

// ---------- patterns (wrapped around the body ellipse, fading toward the belly) ----------

/** Vertical fade paint for patterns: strong on the back, gone at the belly. */
export const fade = (D: Defs, e: Ell, color: string, top: number, mid = 0.55, end = 0.9): string =>
  D.lin([[0, color, top], [mid, color, top * 0.6], [end, color, 0]], 0, e.cy - e.ry, 0, e.cy + e.ry);

export function scales(D: Defs, g: Geo, c: Cols, dark: string, light: string, strength = 1, dx = 4.2, width = 0.85): string {
  const e = g.ell;
  const x0 = g.scaleX0 ?? e.cx - e.rx * 0.45;
  const x1 = e.cx + e.rx * 0.96;
  let dd = '';
  let dl = '';
  for (let col = 0, x = x0; x < x1; x += dx, col++) {
    const h = halfH(e, x);
    if (h < 2.5) continue;
    const rows = Math.max(2, Math.round((h * 2) / (dx * 1.05)));
    const du = Math.PI / rows;
    for (let k = -1; k < rows; k++) {
      const u0 = -Math.PI / 2 + (k + (col % 2) * 0.5) * du;
      const u1 = u0 + du;
      if (u1 <= -Math.PI / 2 || u0 >= Math.PI / 2) continue;
      const ya = e.cy + h * Math.sin(Math.max(-Math.PI / 2, u0));
      const yb = e.cy + h * Math.sin(Math.min(Math.PI / 2, u1));
      if (yb - ya < 0.7) continue;
      const bulge = dx * (0.55 + 0.4 * Math.cos((u0 + u1) / 2));
      const ym = (ya + yb) / 2;
      dd += `M${n(x + 0.5)} ${n(ya)}Q${n(x + 0.5 + bulge)} ${n(ym)} ${n(x + 0.5)} ${n(yb)}`;
      dl += `M${n(x - 0.4)} ${n(ya + 0.4)}Q${n(x - 0.4 + bulge * 0.85)} ${n(ym)} ${n(x - 0.4)} ${n(yb - 0.4)}`;
    }
  }
  return (
    `<path d="${dd}" fill="none" stroke="url(#${fade(D, e, dark, 0.6 * strength, 0.5, 0.95)})" stroke-width="${width}"/>` +
    `<path d="${dl}" fill="none" stroke="url(#${fade(D, e, light, 0.55 * strength, 0.45, 0.85)})" stroke-width="${n(width * 0.82)}"/>`
  );
}

function stripes(D: Defs, g: Geo, c: Cols): string {
  const e = g.ell;
  let d = '';
  let i = 0;
  for (let x = e.cx - e.rx * 0.42; x < e.cx + e.rx * 0.82; x += 5.4, i++) {
    const h = halfH(e, x);
    const w = i % 2 ? 1.3 : 2.1;
    const t = e.cy - h - 1;
    const b = e.cy + h * 0.75;
    d += `M${n(x - w)} ${n(t)}C${n(x - w - 0.8)} ${n(e.cy - h * 0.2)} ${n(x - w * 0.5 - 1.4)} ${n(e.cy + h * 0.4)} ${n(x - 1.8)} ${n(b)}L${n(x - 1.2)} ${n(b)}C${n(x + w * 0.5 - 0.6)} ${n(e.cy + h * 0.4)} ${n(x + w + 0.2)} ${n(e.cy - h * 0.2)} ${n(x + w)} ${n(t)}Z`;
  }
  return `<path d="${d}" fill="url(#${fade(D, e, mixHex(c.back, '#000000', 0.25), 0.78, 0.5, 0.92)})"/>`;
}

/** Spots wrapped on the body: squashed near the top/bottom edges. */
export function spotField(e: Ell, seed: number, count: number, rMin: number, rMax: number, xFrom: number, xTo: number, uFrom = -1.2, uTo = 0.9): string {
  const rnd = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = xFrom + rnd() * (xTo - xFrom);
    const u = uFrom + rnd() * (uTo - uFrom);
    const h = halfH(e, x);
    if (h < 2) continue;
    const y = e.cy + h * Math.sin(u);
    const r = rMin + rnd() * (rMax - rMin);
    out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * (0.35 + 0.65 * Math.cos(u)))}"/>`;
  }
  return out;
}

function spots(D: Defs, g: Geo, c: Cols, a: FishArt): string {
  const e = g.ell;
  const seed = a.seed ?? 1;
  if (a.shape === 'long') {
    // Pike: pale bean-shaped spots over a dark back.
    const pale = mixHex(c.light, WHITE, 0.45);
    return `<g fill="url(#${fade(D, e, pale, 0.85, 0.6, 1)})">${spotField(e, seed, 30, 0.9, 1.6, e.cx - e.rx * 0.6, e.cx + e.rx * 0.9, -1.1, 0.6)}</g>`;
  }
  const dark = mixHex(c.back, '#000000', 0.35);
  let band = '';
  if (a.shape === 'slim') {
    // Trout: a rosy band along the flank.
    band = `<path d="M10 33.6C22 29.6 38 29.6 51 32.4C38 36.4 22 37.4 10 33.6Z" fill="url(#${D.lin([[0, '#d8306a', 0], [0.2, '#d8306a', 0.7], [0.7, '#ff5a90', 0.62], [1, '#ff6a9a', 0]], 8, 0, 52, 0)})"/>` +
      `<path d="M12 39C24 42 38 41.6 48 37.6" fill="none" stroke="#f4f8ff" stroke-width="3" opacity="0.35" stroke-linecap="round"/>`;
  } else if (a.shape === 'carp') {
    // Bass: a dark blotchy band along the side.
    band = `<path d="M14 31C20 28.4 24 31.6 29 29.4S38 31.2 42 29.6 48 31.4 50 31.6C46 34.2 42 33 38 34.6S30 33.2 25 35 18 33.4 14 31Z" fill="${dark}" opacity="0.5"/>`;
  }
  return band + `<g fill="url(#${fade(D, e, dark, 0.75, 0.55, 0.95)})">${spotField(e, seed, a.shape === 'slim' ? 26 : 16, 0.6, a.shape === 'slim' ? 1.1 : 1.6, e.cx - e.rx * 0.55, e.cx + e.rx * 0.98)}</g>`;
}

function patternOf(D: Defs, g: Geo, c: Cols, a: FishArt): string {
  switch (a.pattern) {
    case 'scales':
      return scales(D, g, c, mixHex(c.back, '#000000', 0.2), WHITE);
    case 'stripes':
      return stripes(D, g, c);
    case 'spots':
      return spots(D, g, c, a);
    default:
      if (a.shape === 'cat') {
        // Catfish: soft darker mottling on the back.
        const e = g.ell;
        return `<g fill="url(#${fade(D, e, mixHex(c.back, '#000000', 0.3), 0.55, 0.5, 0.8)})">${spotField(e, (a.seed ?? 1) + 3, 14, 1.6, 3.2, e.cx - e.rx * 0.7, e.cx + e.rx * 0.95, -1.2, 0.2)}</g>`;
      }
      return '';
  }
}

// ---------- parts ----------

function finMarkup(D: Defs, f: Fin, L0: FinLook, back: boolean): string {
  let L = L0;
  if (f.col) L = { ...L, root: f.col[0], tip: f.col[1] };
  if (f.ray) L = { ...L, ray: f.ray[0], rayOp: f.ray[1] };
  const r = f.r ?? 14;
  const root = back ? mixHex(L.root, '#000000', 0.22) : L.root;
  const tip = back ? mixHex(L.tip, L.root, 0.35) : L.tip;
  const fill = D.rad([[0, root, L.rootOp], [0.55, mixHex(root, tip, 0.6), (L.rootOp + L.tipOp) / 2], [1, tip, L.tipOp]], f.o[0], f.o[1], r, r);
  let inner = '';
  if (!f.smooth) {
    let d = '';
    const step = Math.max(6, f.s / Math.max(4, Math.round(r * 0.75)));
    for (let ang = f.a - f.s / 2; ang <= f.a + f.s / 2 + 0.01; ang += step) {
      const rad = (ang * Math.PI) / 180;
      d += `M${n(f.o[0])} ${n(f.o[1])}l${n(Math.cos(rad) * r * 1.6)} ${n(Math.sin(rad) * r * 1.6)}`;
    }
    inner += `<path d="${d}" fill="none" stroke="${L.ray}" stroke-width="0.55" opacity="${L.rayOp}"/>`;
  } else {
    // Smooth fins: a soft highlight along the leading edge instead of rays.
    inner += `<path d="${f.d}" fill="none" stroke="${WHITE}" stroke-width="2.2" opacity="0.18" transform="translate(-0.8 -0.8)"/>`;
  }
  if (L.band) inner += `<path d="${f.d}" fill="none" stroke="${mixHex(L.root, '#000000', 0.3)}" stroke-width="3.4" opacity="${L.band}"/>`;
  if (L.edge) inner += `<path d="${f.d}" fill="none" stroke="${WHITE}" stroke-width="1.3" opacity="${L.edge}"/>`;
  const clip = D.clip(f.d);
  return (
    `<path d="${f.d}" fill="url(#${fill})"/>` +
    `<g clip-path="url(#${clip})">${inner}</g>` +
    `<path d="${f.d}" fill="none" stroke="${L.outline}" stroke-width="1.05" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
  );
}

/** Contact shadow a fin casts on the body near its root (drawn inside the body clip). */
function finAO(f: Fin, dark: string): string {
  const rad = (f.a * Math.PI) / 180;
  const k = f.layer === 'front' ? -1 : 1;
  const dx = f.layer === 'front' ? 0.9 : -Math.cos(rad) * 2.2 * k;
  const dy = f.layer === 'front' ? 1.7 : -Math.sin(rad) * 2.2 * k;
  return `<path d="${f.d}" transform="translate(${n(dx)} ${n(dy)})" fill="${dark}" opacity="${f.layer === 'front' ? 0.26 : 0.3}"/>`;
}

export function glossyEye(D: Defs, x: number, y: number, r: number, c: Cols): string {
  const sclera = D.rad([[0, WHITE], [0.7, '#eef2f7'], [1, '#c9d1de']], x - r * 0.35, y - r * 0.4, r * 1.5);
  const iris = D.rad([[0, mixHex(c.iris, WHITE, 0.35)], [0.55, c.iris], [1, mixHex(c.iris, '#000000', 0.55)]], x - r * 0.1, y + r * 0.35, r * 0.75);
  const ix = x - r * 0.14;
  const iy = y + r * 0.06;
  return (
    `<circle cx="${n(x + r * 0.1)}" cy="${n(y + r * 0.2)}" r="${n(r * 1.45)}" fill="url(#${D.rad([[0.62, '#101420', 0.22], [1, '#101420', 0]], x + r * 0.1, y + r * 0.2, r * 1.45)})"/>` +
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${sclera})" stroke="${OUT}" stroke-width="1.05"/>` +
    `<circle cx="${n(ix)}" cy="${n(iy)}" r="${n(r * 0.68)}" fill="url(#${iris})"/>` +
    `<circle cx="${n(ix - r * 0.04)}" cy="${n(iy + r * 0.02)}" r="${n(r * 0.38)}" fill="#0c0f18"/>` +
    `<path d="M${n(x - r * 0.86)} ${n(y - r * 0.3)}A${n(r * 0.9)} ${n(r * 0.9)} 0 0 1 ${n(x + r * 0.86)} ${n(y - r * 0.3)}" fill="none" stroke="#101420" stroke-width="${n(r * 0.28)}" opacity="0.16"/>` +
    `<ellipse cx="${n(x - r * 0.34)}" cy="${n(y - r * 0.3)}" rx="${n(r * 0.3)}" ry="${n(r * 0.22)}" transform="rotate(-30 ${n(x - r * 0.34)} ${n(y - r * 0.3)})" fill="${WHITE}"/>` +
    `<circle cx="${n(x + r * 0.24)}" cy="${n(y + r * 0.3)}" r="${n(r * 0.11)}" fill="${WHITE}" opacity="0.85"/>`
  );
}

function eelArt(D: Defs, a: FishArt, L: Look): string {
  const c = L.cols;
  const d = 'M8 30C14 22 20 22 27 30S40 38 47 30S54 23 57 25';
  const g = D.lin([[0, c.back], [0.45, c.mid], [0.75, c.light], [1, c.belly]], 0, 21, 0, 39);
  return (
    `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="12.5" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="url(#${g})" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M10 31.5C16 24 21 24 27 31.5S40 39.5 47 31.5" fill="none" stroke="${mixHex(c.back, '#000000', 0.3)}" stroke-width="3" stroke-linecap="round" opacity="0.25"/>` +
    `<path d="M57 25C60 21 62 21 63 22C62 26 61 28 57 25Z" fill="${c.finDark}" stroke="${OUT}" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M10 27C16 20 21 20 27 27S40 35 47 27" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>` +
    `<path d="M16 22.5C20 19.5 24 20 28 24" fill="none" stroke="${c.finDark}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>` +
    (a.pattern === 'spots' || a.pattern === 'stripes'
      ? `<path d="${d}" fill="none" stroke="${c.back}" stroke-width="10" stroke-dasharray="${a.pattern === 'spots' ? '1.6 5' : '2.6 5.5'}" stroke-linecap="round" opacity="0.4"/>`
      : '') +
    glossyEye(D, 8.5, 28, 2.4, c)
  );
}

// ---------- the fish ----------

export function fishArt(a: FishArt): string {
  const rank = a.rank ?? 0;
  const D = new Defs();
  const key = speciesKey(a);
  const base = standardLook(a, rank);
  const L0: Look = a.special ? specialLook(a.special, base, a) : base;
  const L: Look = key ? speciesLook(key, L0, a) : L0;
  const c = L.cols;
  const cls = `gi fish-gi${a.special ? ` fish-${a.special}` : ''}`;

  const halo = L.halo
    ? L.halo(D)
    : a.glow
      ? `<circle cx="32" cy="32" r="31" fill="url(#${D.rad([[0, mixHex(c.light, WHITE, 0.55), 0.8], [0.5, c.light, 0.32], [1, c.light, 0]], 32, 32, 31)})"/>`
      : '';
  const shadow = `<ellipse cx="32" cy="58" rx="23" ry="3.6" fill="url(#${D.rad([[0, '#0a1020', 0.34], [0.6, '#0a1020', 0.14], [1, '#0a1020', 0]], 32, 58, 23, 3.6)})"/>`;

  let fish: string;
  if (a.shape === 'eel') {
    fish = eelArt(D, a, L);
  } else {
    const g: Geo = L.geo ?? (key ? SPECIES_GEO[key] : undefined) ?? geometry(a.shape, a.pattern, rank);
    fish = body(D, a, g, L, rank);
  }
  const top = (L.top ? L.top(D) : '') + (a.sparkle && !L.top ? sparkle(D, 52, 8.5, 4.4) + sparkle(D, 9, 50, 2.6) : '');
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>${D.out}</defs>${halo}${shadow}${fish}${top}</svg>`;
}

function body(D: Defs, a: FishArt, g: Geo, L: Look, rank: number): string {
  const c = L.cols;
  const e = g.ell;
  const sx = g.sx ?? 1;
  const sy = g.sy ?? 1;
  const tf = sx !== 1 || sy !== 1 ? ` transform="matrix(${sx} 0 0 ${sy} ${n(32 * (1 - sx))} ${n(32 * (1 - sy))})"` : '';
  const dark = mixHex(c.back, '#000000', 0.55);
  const top = e.cy - e.ry;
  const bot = e.cy + e.ry;

  const fill = L.base
    ? L.base(D, g, c)
    : `url(#${D.lin([[0, mixHex(c.back, '#000000', 0.12)], [0.3, c.mid], [0.58, c.light], [0.82, c.belly], [1, mixHex(c.belly, c.light, 0.35)]], 0, top, 0, bot)})`;
  const clip = D.clip(g.body);

  const behind = g.fins
    .filter((f) => f.layer !== 'front')
    .sort((p, q) => (p.layer === 'back' ? -1 : 0) - (q.layer === 'back' ? -1 : 0))
    .map((f) => finMarkup(D, f, L.fin, f.layer === 'back'))
    .join('');
  const front = g.fins.filter((f) => f.layer === 'front').map((f) => finMarkup(D, f, L.fin, false)).join('');

  // Inside the body.
  let inner = L.skin ? L.skin(D, g, c) : L.pattern ? patternOf(D, g, c, a) : '';
  if (L.sheen) {
    const sh = D.lin([[0, '#ff9ad5', 0], [0.2, '#ff9ad5', L.sheen], [0.5, '#9af0ff', L.sheen], [0.8, '#fff3a0', L.sheen * 0.8], [1, '#fff3a0', 0]], e.cx - e.rx, 0, e.cx + e.rx, 0);
    inner += `<ellipse cx="${n(e.cx + 2)}" cy="${n(e.cy + e.ry * 0.12)}" rx="${n(e.rx * 0.9)}" ry="${n(e.ry * 0.2)}" fill="url(#${sh})"/>`;
  }
  // Core shadow line below the middle, then the volume (edges fall off into shadow).
  inner += `<rect x="0" y="${n(top)}" width="64" height="${n(e.ry * 2)}" fill="url(#${D.lin([[0.5, dark, 0], [0.68, dark, 0.24], [0.84, dark, 0]], 0, top, 0, bot)})"/>`;
  inner += `<ellipse cx="${n(e.cx - e.rx * 0.18)}" cy="${n(e.cy - e.ry * 0.25)}" rx="${n(e.rx * 1.22)}" ry="${n(e.ry * 1.38)}" fill="url(#${D.rad([[0, WHITE, 0.2], [0.35, WHITE, 0], [0.7, dark, 0], [1, dark, L.shade]], e.cx - e.rx * 0.18, e.cy - e.ry * 0.25, e.rx * 1.22, e.ry * 1.38)})"/>`;
  inner += g.fins.filter((f) => f.layer !== 'back').map((f) => finAO(f, dark)).join('');
  if (g.gill) inner += `<path d="${g.gill}" fill="none" stroke="${dark}" stroke-width="1.1" opacity="0.38" stroke-linecap="round"/><path d="${g.gill}" transform="translate(0.9 0)" fill="none" stroke="${WHITE}" stroke-width="0.7" opacity="0.32" stroke-linecap="round"/>`;
  if (g.lat) inner += `<path d="${g.lat}" fill="none" stroke="${WHITE}" stroke-width="0.8" opacity="0.45" stroke-dasharray="1.6 1.1"/>`;
  if (L.gloss) inner += L.gloss(D, g, c);
  // Specular: a soft bloom, a crisp crescent and a small dot further back.
  inner += `<ellipse cx="${n(e.cx - e.rx * 0.32)}" cy="${n(e.cy - e.ry * 0.55)}" rx="${n(e.rx * 0.42)}" ry="${n(e.ry * 0.26)}" fill="url(#${D.rad([[0, WHITE, 0.45], [1, WHITE, 0]], e.cx - e.rx * 0.32, e.cy - e.ry * 0.55, e.rx * 0.42, e.ry * 0.26)})"/>`;
  inner += `<path d="${crescent(e, 198, 282, 0.86, 0.12)}" fill="${WHITE}" opacity="0.72"/>`;
  inner += `<ellipse cx="${n(e.cx + e.rx * 0.38)}" cy="${n(e.cy - e.ry * 0.66)}" rx="${n(Math.min(2.4, e.rx * 0.09))}" ry="${n(Math.min(1, e.ry * 0.07))}" transform="rotate(10 ${n(e.cx + e.rx * 0.38)} ${n(e.cy - e.ry * 0.66)})" fill="${WHITE}" opacity="0.7"/>`;
  // Rim light: bright along the top edge, cool bounce light along the belly.
  inner += `<path d="${g.body}" fill="none" stroke="url(#${D.lin([[0, L.rimTop, 0.55], [0.22, L.rimTop, 0], [0.74, L.rimLow, 0], [1, L.rimLow, 0.7]], 0, top, 0, bot)})" stroke-width="2.8"/>`;

  const glow = L.outerGlow ? `<path d="${g.body}" fill="none" stroke="${L.outerGlow}" stroke-width="3.6" opacity="0.45" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` : '';
  const outline = `<path d="${g.body}" fill="none" stroke="${L.outline}" stroke-width="1.3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  const mouth = g.mouth ? `<path d="${g.mouth}" fill="none" stroke="${OUT}" stroke-width="0.9" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : '';
  const over = (L.over ? L.over(D, g, c) : '') + (g.extra ? g.extra(c, D) : '');

  const ex = 32 + (g.eye[0] - 32) * sx;
  const ey = 32 + (g.eye[1] - 32) * sy;
  const er = g.eye[2] * (rank >= 6 ? 1.02 : 1);
  const eye = L.eye ? L.eye(D, ex, ey, er, c) : glossyEye(D, ex, ey, er, c);
  return `<g${tf}>${glow}${behind}${L.under ? L.under(D, g, c) : ''}<path d="${g.body}" fill="${fill}"/><g clip-path="url(#${clip})">${inner}</g>${outline}${mouth}${front}${over}</g>${eye}`;
}
