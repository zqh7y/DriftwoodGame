// Special finishes for the rarest fish icons: Golden Koi (metallic gold), Crystal Moonfish
// (faceted translucent crystal), Ancient Megalodon (armoured prehistoric shark) and Abyss
// Leviathan (a whale made of night sky). Original drawings; gradients only, no filters.

import type { FishSpecial } from '../game/fish';
import { OUT, WHITE, halfH, mixHex, n, rng, sparkle, star4, type Defs } from './fishart-kit';
import { SPECIES_GEO, type Cols, type Fin, type Geo } from './fishart-geo';
import { fade, glossyEye, scales, spotField, type FishArt, type Look } from './fishart';

export function specialLook(sp: FishSpecial, base: Look, a: FishArt): Look {
  switch (sp) {
    case 'gold':
      return gold(base);
    case 'crystal':
      return crystal(base);
    case 'ancient':
      return ancient(base);
    case 'cosmic':
      return cosmic(base, a.seed ?? 7);
  }
}

// ---------------- Golden Koi ----------------

function gold(base: Look): Look {
  const c: Cols = { back: '#7a4f0a', mid: '#d29a1e', light: '#ffd54a', belly: '#fff4c4', fin: '#ffd54a', finDark: '#c8901c', iris: '#c0641c' };
  return {
    ...base,
    cols: c,
    fin: { root: '#e2a325', tip: '#fff3b8', rootOp: 0.96, tipOp: 0.62, ray: '#94600e', rayOp: 0.55, edge: 0.7, band: 0.22, outline: 'rgba(84,52,8,0.62)' },
    // Polished metal: alternating bright and dark bands.
    base: (D, g) =>
      `url(#${D.lin(
        [[0, '#6e470a'], [0.13, '#c88c1a'], [0.25, '#fff3ae'], [0.35, '#eab12e'], [0.5, '#b77812'], [0.64, '#f7ca48'], [0.8, '#fff7d0'], [0.92, '#e2a93a'], [1, '#a86e12']],
        0, g.ell.cy - g.ell.ry, 0, g.ell.cy + g.ell.ry,
      )})`,
    skin: (D, g, c2) => scales(D, g, c2, '#7a4a06', '#fffbe6', 1.35),
    gloss: (D, g) => {
      const e = g.ell;
      return (
        `<path d="M${n(e.cx - e.rx * 0.7)} ${n(e.cy + e.ry * 0.05)}C${n(e.cx - e.rx * 0.2)} ${n(e.cy - e.ry * 0.25)} ${n(e.cx + e.rx * 0.4)} ${n(e.cy - e.ry * 0.2)} ${n(e.cx + e.rx * 0.95)} ${n(e.cy)}" fill="none" stroke="${WHITE}" stroke-width="1.1" opacity="0.55"/>` +
        sparkle(D, e.cx - e.rx * 0.05, e.cy - e.ry * 0.55, 2.4, '#fff6c8') +
        sparkle(D, e.cx + e.rx * 0.5, e.cy - e.ry * 0.05, 1.6, '#fff6c8') +
        sparkle(D, e.cx - e.rx * 0.45, e.cy + e.ry * 0.45, 1.2, '#fff6c8')
      );
    },
    halo: (D) => `<circle cx="32" cy="32" r="31" fill="url(#${D.rad([[0, '#fff1a8', 0.6], [0.5, '#ffcf4a', 0.22], [1, '#ffcf4a', 0]], 32, 32, 31)})"/>`,
    top: (D) => sparkle(D, 53, 8, 4.6, '#fff1a8') + sparkle(D, 8, 49, 2.8, '#fff1a8') + sparkle(D, 59, 54, 2, '#fff1a8') + star4(4.5, 15, 1.4, '#fff7d0', false),
    shade: 0.48,
    rimTop: '#fffbe0',
    rimLow: '#ffe7a0',
    outline: 'rgba(72,44,6,0.78)',
    sheen: 0,
  };
}

// ---------------- Crystal Moonfish ----------------

// Facets of the carp body (the round shape scales it). Shade > 0 lights a facet, < 0 darkens it.
const P: Record<string, [number, number]> = {
  A: [12, 24], B: [22, 17.4], C: [34, 17], D: [44, 21], E: [50.8, 30], F: [49, 38], G: [41, 45.4], H: [30, 47.6], I: [18, 45.6], J: [8.6, 38.4], K: [6.4, 31],
  p: [20, 28], q: [31, 25], r: [41, 30.5], s: [35, 38.5], t: [23, 38.6], u: [14, 33],
};
const FACETS: Array<[string, number]> = [
  ['ABp', 0.5], ['BCq', 0.4], ['Bqp', 0.18], ['CDq', 0.28], ['Drq', -0.06], ['DEr', 0.12], ['EFr', -0.16], ['Fsr', -0.08], ['FGs', -0.24],
  ['GHs', -0.28], ['Hts', 0.04], ['HIt', -0.18], ['IJt', -0.12], ['Jut', 0.06], ['JKu', 0.2], ['KAu', 0.38], ['Apu', 0.26], ['upt', 0.02],
  ['pqt', 0.16], ['qst', -0.04], ['qrs', 0.08],
];

function crystal(base: Look): Look {
  const c: Cols = { back: '#1f6f73', mid: '#2e9a99', light: '#86e4dc', belly: '#e9fffc', fin: '#9ce6dd', finDark: '#2e9a99', iris: '#5fd8f0' };
  return {
    ...base,
    cols: c,
    fin: { root: '#5ccbc8', tip: '#f2ffff', rootOp: 0.78, tipOp: 0.42, ray: '#ffffff', rayOp: 0.55, edge: 0.75, band: 0, outline: 'rgba(22,78,92,0.6)' },
    base: (D, g) => `url(#${D.lin([[0, '#23838a', 0.94], [0.45, '#5cc9c6', 0.86], [0.8, '#c6f7f2', 0.9], [1, '#f0fffd', 0.95]], 0, g.ell.cy - g.ell.ry, 0, g.ell.cy + g.ell.ry)})`,
    skin: (D) => {
      let lit = '';
      let dim = '';
      let edges = '';
      for (const [k, s] of FACETS) {
        const pts = k.split('').map((ch) => P[ch]);
        const d = `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
        if (s > 0) lit += `<path d="${d}" opacity="${n(s)}"/>`;
        else dim += `<path d="${d}" opacity="${n(-s * 1.4)}"/>`;
        edges += d;
      }
      // Moonlight inside: a soft core glow and a crescent.
      const core = D.rad([[0, WHITE, 0.75], [0.5, '#c8fbff', 0.3], [1, '#c8fbff', 0]], 30, 33, 11);
      const prism = D.lin([[0, '#ff9ad8', 0], [0.3, '#ff9ad8', 0.5], [0.55, '#fff59a', 0.5], [0.8, '#8af2ff', 0.55], [1, '#8af2ff', 0]], 16, 40, 44, 22);
      return (
        `<g fill="${WHITE}">${lit}</g><g fill="#0b3a46">${dim}</g>` +
        `<circle cx="30" cy="33" r="11" fill="url(#${core})"/>` +
        `<path d="M18 41L44 23.5L45.4 25.6L19.6 43Z" fill="url(#${prism})"/>` +
        `<path d="M32 27.4A5.6 5.6 0 1 0 32 38.6A6.8 6.8 0 0 1 32 27.4Z" fill="${WHITE}" opacity="0.8"/>` +
        `<path d="${edges}" fill="none" stroke="${WHITE}" stroke-width="0.55" stroke-linejoin="round" opacity="0.5"/>` +
        `<path d="M14 26L27 21M37 20L47 27M24 44L38 42" stroke="${WHITE}" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>`
      );
    },
    gloss: (D) => sparkle(D, 22, 17.6, 2.2, '#e8ffff') + sparkle(D, 44, 21.2, 1.4, '#e8ffff') + sparkle(D, 12, 24.2, 1.2, '#e8ffff'),
    halo: (D) =>
      `<circle cx="32" cy="32" r="31.5" fill="url(#${D.rad([[0, '#e8ffff', 0.85], [0.42, '#9cf2ff', 0.42], [0.72, '#6fd8ff', 0.14], [1, '#6fd8ff', 0]], 32, 32, 31.5)})"/>`,
    top: (D) => sparkle(D, 53, 8.5, 4.4, '#d8fdff') + sparkle(D, 8, 50, 2.6, '#d8fdff') + sparkle(D, 57, 52, 1.8, '#d8fdff') + star4(6, 10, 1.3, '#e8ffff', false),
    eye: (D, x, y, r, c2) => glossyEye(D, x, y, r, c2),
    shade: 0.3,
    rimTop: WHITE,
    rimLow: '#c8fbff',
    outline: 'rgba(18,70,84,0.78)',
    outerGlow: '#d8fdff',
    sheen: 0,
    pattern: false,
  };
}

// ---------------- Ancient Megalodon ----------------

const MEGA: Geo = {
  body: 'M1.4 29.4C6 22.6 16 18.4 30 18.4C42 18.4 51 23.4 55.6 29.8C51 36 43 40.6 32 41.6C24 42.2 17 41.6 12 40.4C9.6 39.8 7.4 39 5.6 38L13.8 34.4L2.2 31.2Z',
  ell: { cx: 28.5, cy: 30, rx: 27.2, ry: 11.6 },
  fins: [
    { d: 'M53.4 28.6C56 21.6 59 14 63.2 8.6C63.4 18 62.2 25 59.8 30.4C61.6 34.4 62.8 38.4 63.2 43.2C59 40 56 36 53.4 32Z', o: [54, 30], a: -15, s: 80, r: 17, layer: 'top', smooth: true },
    { d: 'M23.6 19.4C26.8 10 31.4 4.4 36.2 2.6C36.8 9.4 37.4 15 39.2 19.8Z', o: [31, 21], a: -82, s: 30, r: 18, layer: 'top', smooth: true },
    { d: 'M45.4 23.4C46.8 20.6 48.4 19.2 50.2 19C50 21 50.2 22.8 50.8 24.8Z', o: [47.5, 23.5], a: -70, s: 30, r: 5, layer: 'top', smooth: true },
    { d: 'M20.4 39.2C19.4 44.2 16.8 47.8 14 49.6C15.2 45.8 16.2 42.6 16.6 39.4Z', o: [18, 39], a: 115, s: 30, r: 10, layer: 'back', smooth: true },
    { d: 'M38 40.6C38.6 43.8 40.4 46.2 42.8 46.8C42.2 44.2 42 42.2 42.2 40.2Z', o: [40, 40.5], a: 80, s: 30, r: 6, layer: 'back', smooth: true },
    { d: 'M47 36.8C47.8 39.4 49.4 41.2 51.4 41.6C50.8 39.6 50.6 38 50.8 36Z', o: [49, 37], a: 70, s: 30, r: 5, layer: 'back', smooth: true },
    { d: 'M24.6 38.4C21.6 46.2 16.4 51.4 10.4 53.4C13.6 47.8 16.6 42.8 18.4 38.6Z', o: [21.5, 38.5], a: 125, s: 30, r: 15, layer: 'front', smooth: true },
  ],
  eye: [11.4, 26.2, 2.25],
};

/** Teeth along a jaw edge from (x0,y0) to (x1,y1), pointing along (nx,ny). */
function teeth(x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, count: number, len: number, inset: number): string {
  let d = '';
  const dx = (x1 - x0) / count;
  const dy = (y1 - y0) / count;
  for (let i = 0; i < count; i++) {
    const ax = x0 + dx * i - nx * inset;
    const ay = y0 + dy * i - ny * inset;
    const l = len * (1 - (i / count) * 0.45);
    d += `M${n(ax)} ${n(ay)}L${n(ax + dx * 0.5 + nx * l)} ${n(ay + dy * 0.5 + ny * l)}L${n(ax + dx)} ${n(ay + dy)}Z`;
  }
  return d;
}

function ancient(base: Look): Look {
  const c: Cols = { back: '#22262e', mid: '#434955', light: '#6c7484', belly: '#d9d0bd', fin: '#5a6170', finDark: '#2e333c', iris: '#ff7a2a' };
  return {
    ...base,
    cols: c,
    geo: MEGA,
    fin: { root: '#3a404c', tip: '#6c7484', rootOp: 1, tipOp: 0.96, ray: '#000000', rayOp: 0, edge: 0.12, band: 0, outline: 'rgba(10,10,14,0.8)' },
    base: (D, g) => `url(#${D.lin([[0, '#1a1d24'], [0.3, '#363b46'], [0.55, '#57606e'], [1, '#6c7484']], 0, g.ell.cy - g.ell.ry, 0, g.ell.cy + g.ell.ry)})`,
    under: (D) => `<path d="M1.6 30.6L15 34.4L5 38.8Z" fill="url(#${D.rad([[0, '#7a1416'], [0.6, '#3a080a'], [1, '#160304']], 12, 34.4, 11)})" stroke="${OUT}" stroke-width="0.9" stroke-linejoin="round"/>`,
    skin: (D, g) => {
      const e = g.ell;
      // Pale countershaded belly with a ragged edge.
      let out = `<path d="M0 36.4C6 35 11 36.6 16 35.4S25 36.8 31 35.2S41 35.4 47 33.6S54 31.6 58 30.4L60 50L0 50Z" fill="url(#${D.lin([[0, '#a9a091'], [0.3, '#d8cfbc'], [1, '#efe8d6']], 0, 34, 0, 44)})"/>`;
      out += scales(D, g, base.cols, '#0c0e12', '#9aa2b2', 0.55);
      // Armour plates along the back.
      const plate = D.box([[0, '#a3abba'], [0.5, '#6a7282'], [1, '#353a45']]);
      let plates = '';
      let shine = '';
      for (let i = 0; i < 8; i++) {
        const x = 12.5 + i * 5;
        const yt = e.cy - halfH(e, x) + 1.2;
        const w = 2.7;
        const h = 4.2 - Math.abs(i - 3.5) * 0.3;
        plates += `<path d="M${n(x - w)} ${n(yt + h * 0.7)}Q${n(x - w)} ${n(yt)} ${n(x)} ${n(yt - 0.3)}Q${n(x + w * 1.1)} ${n(yt)} ${n(x + w)} ${n(yt + h * 0.75)}Q${n(x)} ${n(yt + h * 1.15)} ${n(x - w)} ${n(yt + h * 0.7)}Z"/>`;
        shine += `M${n(x - w * 0.6)} ${n(yt + h * 0.45)}Q${n(x - w * 0.55)} ${n(yt + 0.6)} ${n(x + 0.4)} ${n(yt + 0.3)}`;
      }
      out += `<g fill="url(#${plate})" stroke="rgba(10,12,16,0.7)" stroke-width="0.55">${plates}</g><path d="${shine}" fill="none" stroke="${WHITE}" stroke-width="0.6" opacity="0.5" stroke-linecap="round"/>`;
      // Gill slits.
      let gills = '';
      for (let i = 0; i < 5; i++) {
        const x = 17 + i * 1.9;
        gills += `M${n(x)} ${n(25.4 + i * 0.2)}C${n(x + 1.5)} 28.6 ${n(x + 1.5)} 31.6 ${n(x + 0.2)} ${n(35 - i * 0.2)}`;
      }
      out += `<path d="${gills}" fill="none" stroke="#0a0b0e" stroke-width="0.85" opacity="0.7" stroke-linecap="round"/><path d="${gills}" transform="translate(0.8 0)" fill="none" stroke="#9aa2b2" stroke-width="0.5" opacity="0.6" stroke-linecap="round"/>`;
      // Old battle scars: three claw marks and one across the snout.
      const scar = 'M31.4 26.2Q34 29.6 36.2 34.6M35.4 25.6Q37.8 29 39.8 33.6M8.4 23.4Q10.6 26.4 12.4 31';
      out +=
        `<path d="${scar}" fill="none" stroke="#0c0d10" stroke-width="1.7" stroke-linecap="round" opacity="0.5"/>` +
        `<path d="${scar}" fill="none" stroke="#e6c4bc" stroke-width="0.75" stroke-linecap="round" opacity="0.85"/>`;
      return out;
    },
    over: (D, g) => {
      const e = g.ell;
      // Bony spikes along the ridge, in front of and behind the dorsal fin.
      let spikes = '';
      for (const x of [9, 13.5, 18, 41.5, 46.5, 51]) {
        if (x > 44 && x < 51.5) continue;
        const h = halfH(e, x);
        const y = e.cy - h + 0.9;
        const tilt = (x - e.cx) / e.rx;
        spikes += `M${n(x - 1.3)} ${n(y + 0.4)}L${n(x + 0.6 + tilt * 0.8)} ${n(y - 2.4)}L${n(x + 1.5)} ${n(y + 0.6)}Z`;
      }
      const ivory = '#f4ecd8';
      return (
        `<path d="${spikes}" fill="url(#${D.lin([[0, '#9aa2b2'], [1, '#3a404c']], 0, 16, 0, 22)})" stroke="rgba(10,10,14,0.8)" stroke-width="0.7" stroke-linejoin="round"/>` +
        // Back rows of teeth, then the front rows.
        `<path d="${teeth(3.2, 31.6, 13, 34.4, -0.27, 0.96, 6, 1.5, -0.9)}${teeth(6.2, 37.8, 13, 34.8, -0.41, -0.91, 5, 1.2, -0.9)}" fill="#bfb296" stroke="rgba(40,16,8,0.55)" stroke-width="0.35"/>` +
        `<path d="${teeth(2.2, 31.2, 13.6, 34.4, -0.27, 0.96, 6, 2.4, 0)}${teeth(5.6, 38, 13.6, 34.4, -0.41, -0.91, 5, 2, 0)}" fill="${ivory}" stroke="rgba(40,16,8,0.7)" stroke-width="0.45" stroke-linejoin="round"/>` +
        // Heavy brow over the eye.
        `<path d="M7.6 23.4Q11.4 21.4 15.6 23.6" fill="none" stroke="#0c0d10" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`
      );
    },
    eye: (D, x, y, r) => {
      const glow = D.rad([[0, '#ffd27a', 0.9], [0.35, '#ff7a2a', 0.55], [1, '#ff3a10', 0]], x, y, r * 2.9);
      const iris = D.rad([[0, '#fff6c0'], [0.35, '#ffc03a'], [0.75, '#f0501c'], [1, '#5a0c08']], x - r * 0.1, y - r * 0.05, r);
      return (
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 2.9)}" fill="url(#${glow})"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${iris})" stroke="rgba(10,6,4,0.85)" stroke-width="0.9"/>` +
        `<ellipse cx="${n(x + r * 0.05)}" cy="${n(y)}" rx="${n(r * 0.24)}" ry="${n(r * 0.8)}" fill="#120302"/>` +
        `<circle cx="${n(x - r * 0.38)}" cy="${n(y - r * 0.38)}" r="${n(r * 0.2)}" fill="${WHITE}" opacity="0.9"/>`
      );
    },
    halo: (D) =>
      `<ellipse cx="32" cy="31" rx="31.6" ry="27" fill="url(#${D.rad([[0, '#1a0406', 0.9], [0.5, '#2c0808', 0.7], [0.74, '#a8260e', 0.3], [0.86, '#ff6a24', 0.12], [1, '#ff6a24', 0]], 32, 31, 31.6, 27)})"/>`,
    top: (D) => {
      const rnd = rng(31);
      let embers = '';
      for (let i = 0; i < 9; i++) {
        const ang = rnd() * Math.PI * 2;
        const x = 32 + Math.cos(ang) * (25 + rnd() * 4);
        const y = 31 + Math.sin(ang) * (19 + rnd() * 4);
        const r = 0.5 + rnd() * 0.7;
        embers += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 2.2)}" fill="url(#${D.rad([[0, '#ffb04a', 0.7], [1, '#ff5a1a', 0]], x, y, r * 2.2)})"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.6)}" fill="#ffe0a0"/>`;
      }
      return embers;
    },
    shade: 0.55,
    rimTop: '#c9d0dc',
    rimLow: '#ff7a3a',
    outline: 'rgba(8,8,12,0.86)',
    sheen: 0,
    pattern: false,
  };
}

// ---------------- Abyss Leviathan ----------------

function cosmic(base: Look, seed: number): Look {
  const c: Cols = { back: '#1a1240', mid: '#3b2a7a', light: '#9a7bd6', belly: '#c9b5f0', fin: '#9a7bd6', finDark: '#3b2a7a', iris: '#7fe8ff' };
  return {
    ...base,
    cols: c,
    fin: { root: '#2a1f66', tip: '#c2a8ff', rootOp: 0.96, tipOp: 0.6, ray: '#d8c8ff', rayOp: 0.3, edge: 0.4, band: 0, outline: 'rgba(16,10,44,0.75)' },
    base: (D) => `url(#${D.rad([[0, '#3a2a86'], [0.55, '#1c1450'], [1, '#0a0822']], 24, 25, 32, 20)})`,
    skin: (D, g) => {
      const e = g.ell;
      const cloud = (x: number, y: number, rx: number, ry: number, rot: number, col: string, op: number): string =>
        `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="url(#${D.rad([[0, col, op], [0.5, col, op * 0.45], [1, col, 0]], x, y, rx, ry, rot)})"/>`;
      let out =
        cloud(30, 29, 22, 11, -8, '#8a5cff', 0.75) +
        cloud(18, 23, 12, 7, -20, '#ff6ad0', 0.6) +
        cloud(41, 35, 13, 6.5, 12, '#4ad8ff', 0.55) +
        cloud(12, 35, 8, 5, 10, '#6a7cff', 0.5) +
        // A dark dust lane across the nebula.
        `<path d="M6 33C16 29 26 33 36 30S50 27 56 30" fill="none" stroke="#08061a" stroke-width="2.4" stroke-linecap="round" opacity="0.38"/>`;
      // Galaxy swirl: two arms around a bright core.
      const gx = 33;
      const gy = 27.5;
      let arms = '';
      let dots = '';
      for (let k = 0; k < 2; k++) {
        const pts: string[] = [];
        for (let t = 0; t <= Math.PI * 2.3; t += 0.28) {
          const phi = t + k * Math.PI;
          const r = 0.6 + 1.05 * t;
          const x0 = r * Math.cos(phi);
          const y0 = r * Math.sin(phi) * 0.48;
          const x = gx + x0 * 0.97 - y0 * -0.26;
          const y = gy + x0 * -0.26 + y0 * 0.97;
          pts.push(`${n(x)} ${n(y)}`);
          if (t > 1.6 && Math.round(t / 0.28) % 3 === 0) dots += `<circle cx="${n(x)}" cy="${n(y)}" r="0.42"/>`;
        }
        arms += `M${pts.join('L')}`;
      }
      out +=
        `<path d="${arms}" fill="none" stroke="#e0a8ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>` +
        `<path d="${arms}" fill="none" stroke="${WHITE}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>` +
        `<g fill="${WHITE}">${dots}</g>` +
        `<ellipse cx="${gx}" cy="${gy}" rx="4" ry="2.6" transform="rotate(-15 ${gx} ${gy})" fill="url(#${D.rad([[0, WHITE, 1], [0.3, '#ffe0ff', 0.85], [1, '#c48cff', 0]], gx, gy, 4, 2.6, -15)})"/>`;
      // Star field.
      const rnd = rng(seed * 3 + 11);
      let stars = '';
      for (let i = 0; i < 48; i++) {
        const x = e.cx - e.rx + rnd() * e.rx * 2;
        const h = halfH(e, x);
        const y = e.cy - h + rnd() * h * 2;
        const r = 0.22 + rnd() * rnd() * 0.6;
        stars += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" opacity="${n(0.45 + rnd() * 0.55)}"/>`;
      }
      out += `<g fill="${WHITE}">${stars}</g>`;
      // A small constellation on the back.
      out += `<path d="M39 21.6L43.6 24.4L47.8 22.8L46.4 28" fill="none" stroke="#d8ccff" stroke-width="0.35" opacity="0.6"/>`;
      out += star4(39, 21.6, 1.1, WHITE, false) + star4(43.6, 24.4, 0.9, WHITE, false) + star4(47.8, 22.8, 1.2, WHITE, false) + star4(46.4, 28, 0.8, WHITE, false);
      out += star4(16, 26, 1.5, WHITE, false) + star4(24, 38.5, 1.1, '#bff4ff', false);
      // Throat grooves.
      out += `<path d="M7 37.4C15 40.4 25 41.4 37 40M9.4 40.2C17 42.6 26 43.4 35 42.4" fill="none" stroke="#c9b5f0" stroke-width="0.6" stroke-linecap="round" opacity="0.4"/>`;
      return out;
    },
    eye: (D, x, y, r) => {
      const glow = D.rad([[0, '#bff8ff', 0.95], [0.4, '#7fe8ff', 0.45], [1, '#7fe8ff', 0]], x, y, r * 3);
      const iris = D.rad([[0, WHITE], [0.45, '#9ff0ff'], [1, '#3a7ad8']], x - r * 0.15, y - r * 0.1, r);
      return (
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 3)}" fill="url(#${glow})"/>` +
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${iris})" stroke="rgba(12,8,40,0.8)" stroke-width="0.9"/>` +
        `<circle cx="${n(x + r * 0.08)}" cy="${n(y + r * 0.1)}" r="${n(r * 0.42)}" fill="#120c36"/>` +
        star4(x - r * 0.32, y - r * 0.34, r * 0.5, WHITE, false)
      );
    },
    halo: (D) =>
      `<circle cx="32" cy="31" r="31.6" fill="url(#${D.rad([[0, '#e2ccff', 0.75], [0.42, '#a47aff', 0.42], [0.72, '#6a46e0', 0.16], [1, '#6a46e0', 0]], 32, 31, 31.6)})"/>`,
    top: (D) =>
      sparkle(D, 54, 8.5, 4.4, '#e6d8ff') + sparkle(D, 8, 11, 2.2, '#bff4ff') + sparkle(D, 58, 52, 2.4, '#e6d8ff') + sparkle(D, 7, 51, 1.6, '#ffc8f0') +
      `<g fill="${WHITE}"><circle cx="46" cy="6" r="0.6"/><circle cx="17" cy="7.4" r="0.5"/><circle cx="62" cy="38" r="0.5"/><circle cx="3" cy="22" r="0.5"/><circle cx="30" cy="56" r="0.55"/></g>`,
    shade: 0.5,
    rimTop: '#efe6ff',
    rimLow: '#7fe8ff',
    outline: 'rgba(14,8,40,0.82)',
    outerGlow: '#c8b0ff',
    sheen: 0,
    pattern: false,
  };
}

// ---------------- the lake fish, one look each ----------------
// Colours, fins and markings that make every species its own: the golden Carp with big
// scales and orange fins, the barred Perch with red belly fins, the olive Bass with its dark
// side stripe, the pink-banded speckled Trout, the mottled Catfish, the bean-spotted Pike,
// the red Salmon with a silver-green head, the slate Sturgeon and the koi's white/orange patches.

const cl = (back: string, mid: string, light: string, belly: string, iris: string): Cols => ({ back, mid, light, belly, fin: light, finDark: mid, iris });

function lake(base: Look, c: Cols, fin: [string, string], extra: Partial<Look>): Look {
  return { ...base, cols: c, fin: { ...base.fin, root: fin[0], tip: fin[1], ray: mixHex(c.back, '#000000', 0.2) }, rimLow: mixHex(c.light, '#bfeaff', 0.5), pattern: false, ...extra };
}

/** Vertical body paint: back → flank → belly. */
const paint = (stops: Array<[number, string]>) => (D: Defs, g: Geo): string =>
  `url(#${D.lin(stops.map(([o, col]) => [o, col] as [number, string]), 0, g.ell.cy - g.ell.ry, 0, g.ell.cy + g.ell.ry)})`;

export function speciesLook(key: string, base: Look, a: FishArt): Look {
  return fantasy(key, lakeLook(key, base, a), a);
}

function lakeLook(key: string, base: Look, a: FishArt): Look {
  const seed = a.seed ?? 1;
  switch (key) {
    case 'carp': {
      const c = cl('#7a4a0c', '#c88a1c', '#f2c24a', '#fff0c0', '#e07a20');
      return lake(base, c, ['#d89a2a', '#ff7a2a'], {
        base: paint([[0, '#6a3c08'], [0.28, '#b47614'], [0.55, '#eab43a'], [0.8, '#fbe08a'], [1, '#f6d070']]),
        // Big round overlapping scales, each with a dark rim and a bright inner crescent.
        skin: (D, g) => {
          const e = g.ell;
          const r = 2.9;
          let dark = '';
          let lite = '';
          for (let col = 0, x = 22; x < 52; x += 4.4, col++) {
            const h = halfH(e, x);
            for (let y = e.cy - h - (col % 2) * r; y < e.cy + h + r; y += r * 1.9) {
              dark += `M${n(x)} ${n(y - r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + r)}`;
              lite += `M${n(x - 0.9)} ${n(y - r * 0.7)}A${n(r * 0.75)} ${n(r * 0.75)} 0 0 1 ${n(x - 0.9)} ${n(y + r * 0.7)}`;
            }
          }
          return (
            `<path d="${dark}" fill="none" stroke="url(#${fade(D, e, '#5a3006', 0.8, 0.6, 1)})" stroke-width="1.05"/>` +
            `<path d="${lite}" fill="none" stroke="url(#${fade(D, e, '#fff4c8', 0.7, 0.6, 1)})" stroke-width="0.8"/>`
          );
        },
      });
    }
    case 'perch': {
      const c = cl('#3e5a14', '#82a020', '#d6cc48', '#f6f0c4', '#ff9a2a');
      return lake(base, c, ['#8aa030', '#e6e080'], {
        base: paint([[0, '#2e4410'], [0.3, '#6e921c'], [0.6, '#c8c440'], [0.85, '#f2eab0'], [1, '#e8dc98']]),
        skin: (D, g) => {
          // Six bold dark bars, wide on the back and tapering down the side.
          const e = g.ell;
          let d = '';
          [18, 23.6, 29.2, 34.8, 40.4, 45.6].forEach((x, i) => {
            const h = halfH(e, x);
            const w = i % 2 ? 1.5 : 2.4;
            const t = e.cy - h - 1;
            const b = e.cy + h * 0.62;
            d += `M${n(x - w)} ${n(t)}Q${n(x - w * 0.8 - 0.6)} ${n(e.cy)} ${n(x - 1.2)} ${n(b)}L${n(x - 0.2)} ${n(b)}Q${n(x + w * 0.6)} ${n(e.cy)} ${n(x + w)} ${n(t)}Z`;
          });
          return `<path d="${d}" fill="url(#${fade(D, e, '#18240a', 0.92, 0.62, 0.96)})"/>`;
        },
      });
    }
    case 'bass': {
      const c = cl('#2c4414', '#5c7c28', '#a6b85a', '#f0f0cc', '#e8a020');
      return lake(base, c, ['#5c7c28', '#c4d08a'], {
        base: paint([[0, '#203410'], [0.3, '#4e6e22'], [0.6, '#98b052'], [0.82, '#e6eabc'], [1, '#d8dca8']]),
        skin: (D, g) => {
          // A ragged dark stripe from gill to tail, plus a dark back.
          const e = g.ell;
          const rnd = rng(seed + 5);
          const top: string[] = [];
          const bot: string[] = [];
          for (let x = 15; x <= 51; x += 2) {
            const k = 1 - Math.max(0, (x - 44) / 10);
            const yc = e.cy + 0.6 - (x - 15) * 0.02;
            const j = 1.4 + rnd() * 1.4;
            top.push(`${n(x)} ${n(yc - j * k)}`);
            bot.unshift(`${n(x)} ${n(yc + (1.2 + rnd() * 1.4) * k)}`);
          }
          const back = `<rect x="0" y="${n(e.cy - e.ry)}" width="64" height="${n(e.ry)}" fill="url(#${fade(D, e, '#162408', 0.4, 0.4, 0.55)})"/>`;
          return back + `<path d="M${top.join('L')}L${bot.join('L')}Z" fill="#16220a" opacity="0.78" stroke-linejoin="round"/>`;
        },
      });
    }
    case 'trout': {
      const c = cl('#3c5a50', '#7e9a8c', '#d6e0dc', '#ffffff', '#e8b040');
      return lake(base, c, ['#8a9a7c', '#f0c8d4'], {
        base: paint([[0, '#2e4a40'], [0.3, '#6e8c7c'], [0.55, '#c8d6d0'], [0.75, '#f4f8fa'], [1, '#e2eaee']]),
        sheen: 0.32,
        skin: (D, g) => {
          const e = g.ell;
          // The rainbow: an iridescent pink-magenta band along the flank.
          const band = D.lin([[0, '#e0306e', 0], [0.12, '#e0306e', 0.85], [0.5, '#ff5aa0', 0.85], [0.8, '#c860e0', 0.7], [1, '#c860e0', 0]], 6, 0, 52, 0);
          return (
            `<path d="M7 32.4C18 28.8 36 28.6 51 31.4C38 35.6 20 36.4 7 32.4Z" fill="url(#${band})"/>` +
            `<path d="M10 31.6C20 30 34 29.8 46 31" fill="none" stroke="#ffd0e8" stroke-width="0.8" opacity="0.6"/>` +
            // Fine black speckles all over the back and flank.
            `<g fill="#1a1416" opacity="0.85">${spotField(e, seed, 70, 0.35, 0.7, e.cx - e.rx * 0.7, e.cx + e.rx * 1, -1.3, 0.55)}</g>`
          );
        },
      });
    }
    case 'catfish': {
      const c = cl('#3a2818', '#6e4e30', '#a8845a', '#eedcbe', '#3a2a1a');
      return lake(base, c, ['#5a4028', '#b09070'], {
        base: paint([[0, '#2a1c10'], [0.35, '#5e4228'], [0.62, '#987450'], [0.82, '#e6d2b0'], [1, '#d8c29c']]),
        skin: (D, g) => {
          // Smooth skin, soft dark mottling and a few pale freckles; no scales.
          const e = g.ell;
          return (
            `<g fill="url(#${fade(D, e, '#1c120a', 0.6, 0.55, 0.85)})">${spotField(e, seed + 3, 18, 1.4, 3, e.cx - e.rx * 0.8, e.cx + e.rx * 0.95, -1.3, 0.3)}</g>` +
            `<g fill="#f0d8b0" opacity="0.45">${spotField(e, seed + 9, 12, 0.4, 0.8, e.cx - e.rx * 0.6, e.cx + e.rx * 0.9, -1, 0.2)}</g>`
          );
        },
        shade: 0.5,
      });
    }
    case 'pike': {
      const c = cl('#22381a', '#4a6a2a', '#8ea24c', '#f2f0d6', '#f0c030');
      return lake(base, c, ['#5a7a30', '#c8b060'], {
        base: paint([[0, '#18280f'], [0.32, '#3e5c22'], [0.6, '#7e9640'], [0.82, '#eeecc8'], [1, '#e0dcb0']]),
        skin: (D, g) => {
          // Rows of pale bean-shaped spots.
          const e = g.ell;
          let d = '';
          [-0.75, -0.2, 0.32].forEach((u, row) => {
            for (let x = 18 + row * 1.6; x < 52; x += 3.4) {
              const h = halfH(e, x);
              if (h < 2) continue;
              const y = e.cy + h * Math.sin(u);
              d += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="1.3" ry="${n(0.62 * Math.cos(u) + 0.2)}" transform="rotate(-12 ${n(x)} ${n(y)})"/>`;
            }
          });
          return `<g fill="url(#${fade(D, e, '#f4f0b8', 0.95, 0.7, 1)})">${d}</g>`;
        },
      });
    }
    case 'salmon': {
      const c = cl('#3a3c3c', '#c4382e', '#ec6c54', '#f4e8e0', '#e0a040');
      return lake(base, c, ['#8a3a30', '#e88a70'], {
        base: paint([[0, '#2e3430'], [0.25, '#9a2e26'], [0.5, '#e04a38'], [0.78, '#f4b8a4'], [1, '#e8d8d0']]),
        sheen: 0.18,
        skin: (D, g) => {
          const e = g.ell;
          // Silver-green head fading into the red spawning flank, then black spots on the back.
          const head = D.lin([[0, '#6c8a74', 0.95], [0.6, '#8aa490', 0.7], [1, '#8aa490', 0]], 3, 0, 24, 0);
          return (
            `<rect x="0" y="0" width="26" height="64" fill="url(#${head})"/>` +
            `<g fill="url(#${fade(D, e, '#120c0c', 0.9, 0.5, 0.75)})">${spotField(e, seed, 22, 0.6, 1.2, e.cx - e.rx * 0.2, e.cx + e.rx * 1, -1.3, -0.1)}</g>`
          );
        },
      });
    }
    case 'sturgeon': {
      const c = cl('#26344a', '#4e6280', '#92a4ba', '#eef0f2', '#c8d0e0');
      return lake(base, c, ['#4e6280', '#b8c4d4'], {
        base: paint([[0, '#1c2638'], [0.3, '#425672'], [0.6, '#8496ae'], [0.82, '#e6eaee'], [1, '#d4dae2']]),
      });
    }
    case 'koi': {
      // Gold koi with white and orange patches.
      return {
        ...base,
        skin: (D, g, c2) => {
          const goldScales = scales(D, g, c2, '#7a4a06', '#fffbe6', 0.8);
          const patch = (d: string, col: string, op: number): string => `<path d="${d}" fill="${col}" opacity="${op}"/>`;
          return (
            patch('M8 27C11 22 17 20.6 22 21.4C22.6 25 20 28.4 16 29.6C12.4 30.6 9.4 30 8 27Z', '#ffffff', 0.95) +
            patch('M26 20.6C31 20.2 36 21 39 23C38 27.4 34 30.4 29.6 30.2C26.6 30 25 26 26 20.6Z', '#ff5a10', 0.95) +
            patch('M36 34C40 32.6 44.6 33.2 47.4 34C45 38.4 40.6 40.6 36.6 40.8C34.6 38.8 34.6 36 36 34Z', '#ffffff', 0.92) +
            patch('M17 36C20 33.6 25 33.6 27.6 35.6C27 39 23.6 41.2 19.6 41C17.6 39.6 16.6 37.8 17 36Z', '#ff5a10', 0.88) +
            goldScales
          );
        },
      };
    }
    default:
      return base;
  }
}

// ---------------- Fantasy twists ----------------
// Every species keeps its silhouette and markings but gets one magical idea: flame fins (Carp),
// leaf fins and a sprout (Perch), bubble glass (Bass), prism bands (Trout), a night-sky catfish
// with star-tipped whiskers, crystal thorns (Pike), a sunset Salmon, rune-carved Sturgeon plates
// and a Koi whose ribbon fins fade into light. The top three get a little extra sparkle.

/** The species' own geometry with every fin repainted. */
function refin(key: string, root: string, tip: string, ray?: [string, number], tweak?: (f: Fin) => Partial<Fin>): Geo {
  const g = SPECIES_GEO[key];
  return { ...g, fins: g.fins.map((f) => ({ ...f, col: [root, tip] as [string, string], ...(ray ? { ray } : {}), ...(tweak ? tweak(f) : {}) })) };
}
/** A soft glowing dot with a bright core. */
const glowDot = (D: Defs, x: number, y: number, r: number, col: string, core = WHITE): string =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${D.rad([[0, col, 0.85], [0.45, col, 0.35], [1, col, 0]], x, y, r)})"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.26)}" fill="${core}"/>`;
/** A little flame tongue rising from (x, y). */
const flame = (x: number, y: number, s: number, rot: number): string =>
  `<path d="M${n(x - 1.6 * s)} ${n(y)}C${n(x - 2 * s)} ${n(y - 2.4 * s)} ${n(x - 0.4 * s)} ${n(y - 3 * s)} ${n(x + 0.2 * s)} ${n(y - 5.4 * s)}C${n(x + 0.9 * s)} ${n(y - 3.4 * s)} ${n(x + 2.4 * s)} ${n(y - 2 * s)} ${n(x + 1.6 * s)} ${n(y)}Q${n(x)} ${n(y + 1.2 * s)} ${n(x - 1.6 * s)} ${n(y)}Z" transform="rotate(${rot} ${n(x)} ${n(y)})"/>`;
const topY = (g: Geo, x: number): number => g.ell.cy - halfH(g.ell, x);
const join = <T extends unknown[]>(f: ((...a: T) => string) | undefined, h: (...a: T) => string) => (...a: T): string => (f ? f(...a) : '') + h(...a);

function fantasy(key: string, L: Look, a: FishArt): Look {
  const seed = a.seed ?? 1;
  switch (key) {
    case 'carp': {
      // Fins and tail of soft flame, embers glowing in the gold scales.
      const geo = refin('carp', '#ffc23a', '#ff4a1a', ['#fff0a0', 0.55]);
      const fl = (D: Defs): string => {
        const paint = D.lin([[0, '#ff5a1a', 0.9], [0.55, '#ffa424', 0.95], [1, '#fff2a0', 1]], 0, 14, 0, 2);
        return `<g fill="url(#${paint})" stroke="rgba(120,40,10,0.45)" stroke-width="0.5">${flame(29, 11.6, 1.2, -18)}${flame(36.5, 10.4, 1.45, 4)}${flame(44, 14.4, 1.1, 30)}${flame(61.4, 17, 1.15, 52)}${flame(61.6, 47.6, 1.05, 128)}</g>`;
      };
      return {
        ...L,
        geo,
        fin: { ...L.fin, rootOp: 0.98, tipOp: 0.9, edge: 0.5, band: 0 },
        halo: (D) => `<circle cx="34" cy="32" r="30" fill="url(#${D.rad([[0, '#ffb040', 0.42], [0.55, '#ff7a2a', 0.14], [1, '#ff7a2a', 0]], 34, 32, 30)})"/>`,
        gloss: join(L.gloss, (D) => glowDot(D, 30, 26, 3, '#ffb03a', '#fff6c8') + glowDot(D, 38.5, 35, 2.4, '#ff8a2a', '#fff0b0') + glowDot(D, 27, 39, 2, '#ffa030', '#fff0b0')),
        over: join(L.over, fl),
        top: (D) => glowDot(D, 50, 10, 1.8, '#ffb040', '#fff4c0') + glowDot(D, 55.5, 6, 1.2, '#ff8a2a', '#fff4c0') + glowDot(D, 22, 8, 1.1, '#ffb040', '#fff4c0'),
        outerGlow: '#ffb24a',
      };
    }
    case 'perch': {
      // Leaf fins with dark veins, and a little sprout growing from the head.
      const geo = refin('perch', '#4a9a2a', '#c4ec6a', ['#245010', 0.85]);
      const sprout = (): string => {
        const x = 13.2;
        const y = topY(geo, x) + 1.4;
        return (
          `<path d="M${n(x)} ${n(y)}C${n(x - 0.4)} ${n(y - 3)} ${n(x + 0.6)} ${n(y - 5)} ${n(x + 0.2)} ${n(y - 7)}" fill="none" stroke="#3c7a1c" stroke-width="1.3" stroke-linecap="round"/>` +
          `<path d="M${n(x + 0.2)} ${n(y - 6.6)}C${n(x - 2)} ${n(y - 9.4)} ${n(x - 5.6)} ${n(y - 9)} ${n(x - 6.6)} ${n(y - 7.4)}C${n(x - 4.6)} ${n(y - 5.4)} ${n(x - 1.6)} ${n(y - 5.4)} ${n(x + 0.2)} ${n(y - 6.6)}Z" fill="#7cc83a" stroke="rgba(30,52,20,0.7)" stroke-width="0.7" stroke-linejoin="round"/>` +
          `<path d="M${n(x + 0.3)} ${n(y - 6.8)}C${n(x + 1.4)} ${n(y - 10)} ${n(x + 4.6)} ${n(y - 11.4)} ${n(x + 6.6)} ${n(y - 10.6)}C${n(x + 5.8)} ${n(y - 8)} ${n(x + 3)} ${n(y - 6.4)} ${n(x + 0.3)} ${n(y - 6.8)}Z" fill="#a8e050" stroke="rgba(30,52,20,0.7)" stroke-width="0.7" stroke-linejoin="round"/>` +
          `<path d="M${n(x - 0.6)} ${n(y - 6.8)}L${n(x - 5)} ${n(y - 7.6)}M${n(x + 1)} ${n(y - 7.4)}L${n(x + 5.2)} ${n(y - 10)}" stroke="#ecffc0" stroke-width="0.5" opacity="0.8"/>`
        );
      };
      return {
        ...L,
        geo,
        fin: { ...L.fin, tipOp: 0.92, edge: 0.4, band: 0.15 },
        over: join(L.over, sprout),
        top: () => `<path d="M53 9C55 6.6 58 6.4 59.6 7.6C58.2 10 55.4 10.8 53 9Z" fill="#a8e050" stroke="rgba(30,52,20,0.6)" stroke-width="0.6"/><path d="M8 52C9 49.6 11.4 48.8 13 49.4C12.2 51.8 10 52.8 8 52Z" fill="#7cc83a" stroke="rgba(30,52,20,0.6)" stroke-width="0.6"/>`,
      };
    }
    case 'bass': {
      // Bubble glass: a clear aqua body with tiny bubbles inside and a bubble trail.
      const bub = (x: number, y: number, r: number): string =>
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#e8fffb" fill-opacity="0.18" stroke="#f4ffff" stroke-width="${n(Math.max(0.45, r * 0.3))}" stroke-opacity="0.85"/><circle cx="${n(x - r * 0.35)}" cy="${n(y - r * 0.35)}" r="${n(r * 0.28)}" fill="${WHITE}"/>`;
      return {
        ...L,
        geo: refin('bass', '#3aa6a4', '#c8fff4', ['#1a5a5e', 0.5]),
        fin: { ...L.fin, rootOp: 0.8, tipOp: 0.45, edge: 0.6 },
        base: (D, g) => `url(#${D.lin([[0, '#1e5a66', 0.92], [0.35, '#3a9aa2', 0.7], [0.65, '#8ae0d8', 0.55], [1, '#dcfff6', 0.75]], 0, g.ell.cy - g.ell.ry, 0, g.ell.cy + g.ell.ry)})`,
        skin: (D, g) => {
          const e = g.ell;
          return `<path d="M14 32C22 29.6 34 30.2 50 31.4C36 34.6 22 34.8 14 32Z" fill="#12404a" opacity="0.45"/>` +
            `<ellipse cx="${n(e.cx + 2)}" cy="${n(e.cy - 1)}" rx="${n(e.rx * 0.7)}" ry="${n(e.ry * 0.55)}" fill="url(#${D.rad([[0, '#c8fff6', 0.5], [1, '#c8fff6', 0]], e.cx + 2, e.cy - 1, e.rx * 0.7, e.ry * 0.55)})"/>`;
        },
        gloss: join(L.gloss, () => bub(26, 27.4, 1.9) + bub(33, 35.6, 1.4) + bub(40, 28.8, 1.1) + bub(21, 36.4, 1) + bub(45, 33.6, 0.8)),
        top: () => bub(5.4, 23.4, 1.7) + bub(3.4, 17, 1.25) + bub(6.6, 11.6, 0.95),
        rimTop: '#e8ffff',
        shade: 0.3,
        outerGlow: '#9ff4ea',
      };
    }
    case 'trout': {
      // Prism bands that shimmer along the flank, star speckles instead of dark ones.
      return {
        ...L,
        geo: refin('trout', '#b48ae8', '#9ff0ff', ['#5a4a9a', 0.45]),
        sheen: 0,
        skin: (D, g) => {
          const e = g.ell;
          const prism = D.lin([[0, '#ff4a7a', 0], [0.1, '#ff4a7a', 0.9], [0.3, '#ffa83a', 0.9], [0.48, '#f8f04a', 0.85], [0.64, '#4ae08a', 0.85], [0.8, '#4aa8ff', 0.85], [0.94, '#a86af0', 0.8], [1, '#a86af0', 0]], 6, 0, 52, 0);
          const prism2 = D.lin([[0, '#a86af0', 0], [0.2, '#4aa8ff', 0.55], [0.5, '#4ae08a', 0.5], [0.8, '#ffa83a', 0.5], [1, '#ff4a7a', 0]], 10, 0, 50, 0);
          let st = '';
          const rnd = rng(seed + 11);
          for (let i = 0; i < 9; i++) {
            const x = 16 + rnd() * 32;
            const y = topY(g, x) + 1.2 + rnd() * (halfH(e, x) * 0.7);
            st += star4(x, y, 0.8 + rnd() * 0.7, i % 3 ? WHITE : '#fff4a0', false, 0.22);
          }
          return `<path d="M7 32.6C18 28.6 36 28.4 51 31.4C38 36 20 36.8 7 32.6Z" fill="url(#${prism})"/>` +
            `<path d="M11 28.4C22 26 36 26.2 47 28.2C36 29.8 22 30 11 28.4Z" fill="url(#${prism2})"/>` + st;
        },
        top: () => star4(54, 22, 1.8, '#fff4a0', false, 0.2) + star4(8, 42, 1.3, WHITE, false, 0.2),
        outerGlow: '#d8b8ff',
      };
    }
    case 'catfish': {
      // Night-sky mottling and moon-pale whiskers that end in tiny glowing stars.
      const g0 = SPECIES_GEO.catfish;
      const geo: Geo = {
        ...refin('catfish', '#3a3a78', '#9a8ae0', ['#1a1a40', 0.5]),
        extra: (c, D) =>
          (g0.extra ? g0.extra(c, D).replace(/#d8b88a/g, '#eef0ff') : '') +
          glowDot(D, 13.4, 13.2, 2.6, '#cfe0ff') + glowDot(D, 8.8, 53, 2.4, '#cfe0ff') + glowDot(D, 9.4, 46.6, 1.8, '#e8dcff') + glowDot(D, 13.6, 43.6, 1.6, '#e8dcff'),
      };
      return {
        ...L,
        geo,
        base: paint([[0, '#121838'], [0.35, '#262a5c'], [0.62, '#4e4884'], [0.84, '#c4bce0'], [1, '#aea6cc']]),
        skin: (D, g) => {
          const e = g.ell;
          let st = '';
          const rnd = rng(seed + 4);
          for (let i = 0; i < 12; i++) {
            const x = e.cx - e.rx * 0.6 + rnd() * e.rx * 1.5;
            const y = topY(g, x) + 1 + rnd() * halfH(e, x) * 0.9;
            st += i % 4 === 0 ? star4(x, y, 1.1, '#fff6d0', false, 0.22) : `<circle cx="${n(x)}" cy="${n(y)}" r="${n(0.3 + rnd() * 0.3)}" fill="${WHITE}" opacity="0.85"/>`;
          }
          return `<g fill="url(#${fade(D, e, '#0a0c24', 0.6, 0.55, 0.85)})">${spotField(e, seed + 3, 14, 1.4, 3, e.cx - e.rx * 0.8, e.cx + e.rx * 0.95, -1.3, 0.3)}</g>` +
            `<g fill="#8a7ae0" opacity="0.35">${spotField(e, seed + 8, 8, 1.6, 2.8, e.cx - e.rx * 0.5, e.cx + e.rx * 0.9, -1, 0.2)}</g>` + st;
        },
        cols: { ...L.cols, iris: '#ffe080' },
        rimLow: '#b8c8ff',
        outerGlow: '#9aa8ff',
      };
    }
    case 'pike': {
      // Crystal thorns along the back, icy blue-green glow lines along the flank.
      const thorns = (D: Defs, g: Geo): string => {
        const paint = D.box([[0, '#f2ffff'], [0.5, '#9af0f0'], [1, '#3ab0c0']]);
        let d = '';
        let hi = '';
        [17, 22, 27, 32, 37].forEach((x, i) => {
          const y = topY(g, x) + 0.9;
          const h = i % 2 ? 3.6 : 5;
          d += `M${n(x - 1.5)} ${n(y)}L${n(x + 0.4)} ${n(y - h)}L${n(x + 1.6)} ${n(y)}Z`;
          hi += `M${n(x - 0.6)} ${n(y - 0.4)}L${n(x + 0.3)} ${n(y - h + 1)}`;
        });
        return `<path d="${d}" fill="url(#${paint})" stroke="rgba(20,60,80,0.7)" stroke-width="0.6" stroke-linejoin="round"/><path d="${hi}" stroke="${WHITE}" stroke-width="0.5" opacity="0.9"/>`;
      };
      const lake0 = L.skin;
      return {
        ...L,
        geo: refin('pike', '#2a8a8a', '#b8fff0', ['#0e3a40', 0.55]),
        base: paint([[0, '#0e2e3c'], [0.32, '#1a5e66'], [0.6, '#4aa8a4'], [0.84, '#dcfff4'], [1, '#c4ece6']]),
        skin: (D, g, c) => (lake0 ? lake0(D, g, c).replace(/#f4f0b8/g, '#c8fffa') : ''),
        gloss: join(L.gloss, () => `<path d="M10 31.6C22 30.4 38 30.6 53 32" fill="none" stroke="#8ffcff" stroke-width="0.9" opacity="0.85" stroke-linecap="round"/><path d="M16 34.4C28 34.2 40 34 50 33.4" fill="none" stroke="#c8fff8" stroke-width="0.6" opacity="0.6" stroke-linecap="round"/>`),
        over: join(L.over, thorns),
        top: () => star4(52, 20, 1.6, '#d8ffff', false, 0.2) + star4(10, 22, 1.1, '#d8ffff', false, 0.2),
        outerGlow: '#8ff0ff',
      };
    }
    case 'salmon': {
      // A sunset: gold to coral to violet, with sun rays fanning back from the head.
      return {
        ...L,
        geo: refin('salmon', '#ff7a5a', '#ffd870', ['#a03a5a', 0.45]),
        base: paint([[0, '#4a2470'], [0.26, '#a83a86'], [0.5, '#ff6a5a'], [0.76, '#ffb24a'], [1, '#ffe6a0']]),
        sheen: 0,
        skin: (D, g) => {
          const e = g.ell;
          const ox = 13;
          const oy = e.cy;
          const ray = D.lin([[0, '#fff0a0', 0.75], [0.6, '#ffd070', 0.35], [1, '#ffd070', 0]], ox, 0, 54, 0);
          let d = '';
          for (let k = -3; k <= 3; k++) {
            const t = (k * 13 * Math.PI) / 180;
            const w = 0.06;
            d += `M${ox} ${n(oy)}L${n(ox + 44 * Math.cos(t - w))} ${n(oy + 44 * Math.sin(t - w))}L${n(ox + 44 * Math.cos(t + w))} ${n(oy + 44 * Math.sin(t + w))}Z`;
          }
          return `<path d="${d}" fill="url(#${ray})"/>` +
            `<circle cx="${ox}" cy="${n(oy)}" r="7" fill="url(#${D.rad([[0, '#fff4b0', 0.8], [1, '#ffb04a', 0]], ox, oy, 7)})"/>`;
        },
        halo: (D) => `<circle cx="32" cy="32" r="30" fill="url(#${D.rad([[0, '#ff9a6a', 0.3], [0.6, '#c060a0', 0.1], [1, '#c060a0', 0]], 32, 32, 30)})"/>`,
        cols: { ...L.cols, iris: '#ffd040' },
        outerGlow: '#ffb080',
      };
    }
    case 'sturgeon': {
      // Bony plates engraved with softly glowing runes.
      const g0 = SPECIES_GEO.sturgeon;
      const R = ['M-0.7 -0.8L0 0.8L0.7 -0.8', 'M0 -1V1M-0.7 -0.3L0.7 0.3', 'M-0.6 0.8V-0.8L0.6 0M-0.6 0L0.6 0.8', 'M-0.7 -0.8H0.7L-0.7 0.8H0.7', 'M0 -1L0.7 0L0 1L-0.7 0Z'];
      const runes = (D: Defs): string => {
        let d = '';
        let i = 0;
        for (let x = 15; x <= 40; x += 5, i++) {
          const y = 27.6 - Math.sin(((x - 15) / 30) * Math.PI) * 0.8;
          d += `<path transform="translate(${n(x)} ${n(y - 0.2)}) scale(0.95)" d="${R[i % R.length]}"/>`;
        }
        // A line of larger runes glowing along the flank.
        i = 2;
        for (let x = 20; x <= 44; x += 6, i++) d += `<path transform="translate(${n(x + 2)} 34.3) scale(1.25)" d="${R[i % R.length]}"/>`;
        return `<g fill="none" stroke="#7ff0ff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" opacity="0.55">${d}</g><g fill="none" stroke="#f0ffff" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
      };
      return {
        ...L,
        geo: { ...refin('sturgeon', '#3a5a8a', '#9fe0ff', ['#1a2a48', 0.5]), extra: (c, D) => (g0.extra ? g0.extra(c, D).replace(/#ece6cc/g, '#c8d8e8') : '') + runes(D) },
        base: paint([[0, '#141e34'], [0.3, '#2e4466'], [0.6, '#6a86a6'], [0.84, '#dce6ee'], [1, '#c8d4e0']]),
        top: (D) => glowDot(D, 56, 22, 1.6, '#7ff0ff') + glowDot(D, 9, 24, 1.2, '#7ff0ff'),
        outerGlow: '#7fdcff',
      };
    }
    case 'koi': {
      // Ribbon fins that fade into light, and tiny petals drifting around.
      const petal = (D: Defs, x: number, y: number, r: number, rot: number): string =>
        `<path d="M${n(x)} ${n(y - r)}C${n(x + r * 0.9)} ${n(y - r * 0.5)} ${n(x + r * 0.7)} ${n(y + r * 0.6)} ${n(x)} ${n(y + r)}C${n(x - r * 0.7)} ${n(y + r * 0.6)} ${n(x - r * 0.9)} ${n(y - r * 0.5)} ${n(x)} ${n(y - r)}Z" transform="rotate(${rot} ${n(x)} ${n(y)})" fill="url(#${D.box([[0, '#fff0f6'], [1, '#ff8ab8']])})" stroke="rgba(150,40,90,0.45)" stroke-width="0.5"/>`;
      return {
        ...L,
        geo: refin('koi', '#ffc23a', '#ffffff'),
        fin: { ...L.fin, rootOp: 0.95, tipOp: 0.12, edge: 0, band: 0, rayOp: 0.35, outline: 'rgba(120,80,20,0.32)' },
        top: (D) => (L.top ? L.top(D) : '') + petal(D, 44, 9.5, 1.9, 30) + petal(D, 18, 53, 1.6, -40) + petal(D, 57, 41, 1.4, 70) + petal(D, 6, 21, 1.3, -10),
      };
    }
    case 'moonfish':
    case 'megalodon':
    case 'leviathan': {
      const tint = key === 'moonfish' ? '#d8fdff' : key === 'megalodon' ? '#ffb070' : '#e0c8ff';
      return { ...L, top: (D) => (L.top ? L.top(D) : '') + sparkle(D, 4.5, 30, 1.8, tint) + star4(60, 30, 1.2, tint, false) + star4(30, 4, 1.1, tint, false) };
    }
    default:
      return L;
  }
}
