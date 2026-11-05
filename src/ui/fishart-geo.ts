// Fish silhouettes for the icons (64×64, facing left). Original drawings.
// Each fin carries its root point and the direction its rays fan out, so the renderer can draw
// translucent fins with fine rays and contact shadows where they meet the body.

import type { FishShape } from '../game/fish';
import { OUT, mixHex, n, type Defs, type Ell } from './fishart-kit';

export interface Cols {
  back: string;
  mid: string;
  light: string;
  belly: string;
  fin: string;
  finDark: string;
  iris: string;
}

export interface Fin {
  d: string;
  /** Root point the rays fan out from. */
  o: [number, number];
  /** Ray direction (degrees, 0 = right, -90 = up) and fan spread. */
  a: number;
  s: number;
  /** Gradient radius (roughly the fin length). */
  r?: number;
  /** back: behind the body, darker (far side); top: behind the body; front: over the body. */
  layer: 'back' | 'top' | 'front';
  /** No rays (shark/whale fins). */
  smooth?: boolean;
  /** Own colours for this fin: [root, tip] (e.g. a perch's red belly fins). */
  col?: [string, string];
  /** Own ray colour and opacity (e.g. a perch's dark spines). */
  ray?: [string, number];
}

export interface Geo {
  body: string;
  ell: Ell;
  fins: Fin[];
  eye: [number, number, number];
  gill?: string;
  lat?: string;
  mouth?: string;
  /** Scales start behind this x. */
  scaleX0?: number;
  sx?: number;
  sy?: number;
  /** Details drawn over the body (whiskers, plates). */
  extra?: (c: Cols, D: Defs) => string;
}

const CARP_TAIL: Fin = { d: 'M48.5 32C52.5 27 56.5 20 61.5 15.5C60.8 24 59.2 28 58 32C59.2 36 60.8 40.5 61.5 48.5C56.5 44 52.5 37 48.5 32Z', o: [48.5, 32], a: 0, s: 100, r: 14, layer: 'top' };
const CARP_DORSAL: Fin = { d: 'M20.5 19C24.5 10.5 33.5 8 41 11.5C40.5 14.5 39.8 17 39 20Z', o: [27, 27], a: -66, s: 46, r: 18, layer: 'top' };
const CARP_ANAL: Fin = { d: 'M33 46.2C35.2 50.6 39.6 52.4 43 51.2C41.5 48.6 40.5 46.6 39.5 44.6Z', o: [35, 42], a: 62, s: 44, r: 11, layer: 'back' };
const CARP_PELVIC: Fin = { d: 'M21 45.4C20.2 49.8 17.6 52.6 14.2 53.6C15.2 50.2 16.2 47.4 17.2 44.6Z', o: [20, 42], a: 112, s: 30, r: 11, layer: 'back' };
const CARP_PECT: Fin = { d: 'M23.6 33.6C27.4 32.4 32.4 33.8 36 37C36.2 39.6 34.8 41.8 32.4 42.8C28.8 40.8 25.6 37.6 23.6 33.6Z', o: [23.6, 33.6], a: 36, s: 44, r: 13, layer: 'front' };

export const CARP: Geo = {
  body: 'M7 33C8 22 20 16 33 17C43 18 50 25 51 32C50 40 43 46 33 47C20 48 8 43 7 33Z',
  ell: { cx: 29, cy: 32, rx: 22, ry: 15.4 },
  fins: [CARP_TAIL, CARP_DORSAL, CARP_ANAL, CARP_PELVIC, CARP_PECT],
  eye: [15, 28.5, 3.7],
  gill: 'M22.5 21C26.5 27 26.5 37 22.5 43',
  lat: 'M14 31.5C24 29.5 36 29.5 48 32',
  mouth: 'M7.4 34.4C8.8 35.4 10.4 35.5 11.8 34.8',
  scaleX0: 25,
};

const LONG: Geo = {
  body: 'M3 33C9 28 22 25 36 25C46 25 52 28 54 32C52 36 46 39 36 39C22 39 9 37 3 33Z',
  ell: { cx: 28.5, cy: 32, rx: 25.5, ry: 7 },
  fins: [
    { d: 'M52 32C55 28 58 24 61.8 21C60.8 27 60 30 59 32C60 34 60.8 37 61.8 43C58 40 55 36 52 32Z', o: [52, 32], a: 0, s: 90, r: 10, layer: 'top' },
    { d: 'M37 26C40 19.5 45 18.2 49.2 20.4C48 23.5 47 25.5 46 27.2Z', o: [40, 30], a: -58, s: 50, r: 11, layer: 'top' },
    { d: 'M35 38C37 42.5 41.5 44.8 45.2 43.6C44 41.5 43 40 42 38.8Z', o: [37, 35], a: 58, s: 50, r: 10, layer: 'back' },
    { d: 'M28 38.4C28.6 41.6 27.2 44 25 45.2C25.4 42.6 25.6 40.6 25.4 38.6Z', o: [27, 37], a: 105, s: 30, r: 8, layer: 'back' },
    { d: 'M16.5 34C19.8 34.4 23 36.4 24.2 39.6C21 40.2 18.4 38.2 16.5 34Z', o: [16.5, 34], a: 38, s: 36, r: 9, layer: 'front' },
  ],
  eye: [12, 31.2, 2.8],
  gill: 'M19 27.2C21 30 21 35 19 37.8',
  lat: 'M9 32.2C24 31.2 38 31.2 52 32',
  mouth: 'M3.4 33.3C6 34.1 9 34.3 11.6 33.8',
  scaleX0: 21,
};

const SHARK: Geo = {
  body: 'M3 34C10 26 24 22 38 23C47 24 53 28 56 32C53 37 46 41 36 42C22 43 9 40 3 34Z',
  ell: { cx: 29.5, cy: 32.5, rx: 26.5, ry: 10 },
  fins: [
    { d: 'M53 31C56 24 59 16 62.5 10.5C62.5 20 61.5 27 60 32C61.5 36 62.5 41 62.5 46.5C59 42 56 37 53 33Z', o: [53, 32], a: -10, s: 90, r: 16, layer: 'top', smooth: true },
    { d: 'M25 23.5C28.5 13 33 7.5 36.5 6C37.5 13 37.5 19 38.5 23.5Z', o: [31, 24], a: -80, s: 30, r: 18, layer: 'top', smooth: true },
    { d: 'M44 40C45 43.5 47 45.5 49 45.5C48.5 43 48 41.5 47.5 40Z', o: [45, 40], a: 70, s: 30, r: 6, layer: 'back', smooth: true },
    { d: 'M27 40.5C24 48 19 52 15 53C18 48 20.5 44 21.5 40.5Z', o: [24, 40], a: 120, s: 30, r: 13, layer: 'front', smooth: true },
  ],
  eye: [12.5, 30, 2.4],
  mouth: 'M5 36.2C8 37.6 11.5 37.8 14 36.8',
  extra: () => `<path d="M20 28.5v7.5M23 27.8v8.6M26 27.5v8.8" fill="none" stroke="${OUT}" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>`,
};

const ANGLER: Geo = {
  body: 'M6 34C6 20 18 12 32 14C44 16 50 24 50 32C50 42 42 50 30 50C16 50 6 44 6 34Z',
  ell: { cx: 28, cy: 32, rx: 22, ry: 18 },
  fins: [
    { d: 'M48 32C52 28 56 24 60.5 22.5C59.5 28 59 31 58 33C59 36 59.5 39 60.5 43.5C56 41 52 37 48 33Z', o: [48, 32.5], a: 0, s: 80, r: 12, layer: 'top' },
    { d: 'M30 14.5C33 9 38 8 42 10C41 13 40 14.5 38.5 16Z', o: [35, 18], a: -70, s: 50, r: 9, layer: 'top' },
    { d: 'M30 49.5C32 53.5 36 55 39 54C38 51.5 37 50 36 49Z', o: [33, 46], a: 70, s: 50, r: 9, layer: 'back' },
  ],
  eye: [20, 25.5, 3.4],
  extra: (c) =>
    `<path d="M5.5 33.5C10 39 17 41.5 24 40C19 36.5 13 35 5.5 33.5Z" fill="${mixHex(c.back, '#000000', 0.45)}" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M8 34.6l1.4 2.6 1.4-2.2 1.5 3 1.4-2.4 1.6 3 1.5-2.4 1.6 2.6" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linejoin="round" opacity="0.95"/>` +
    `<path d="M20 15C19.5 6 13 3 8.5 6.5" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/><path d="M20 15C19.5 6 13 3 8.5 6.5" fill="none" stroke="${c.mid}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<circle cx="8" cy="7" r="2.6" fill="#ffffff" opacity="0.35"/><circle cx="8" cy="7" r="1.5" fill="${mixHex(c.light, '#ffffff', 0.6)}" stroke="${OUT}" stroke-width="0.8"/>`,
};

export const WHALE: Geo = {
  body: 'M3 30C4 19.5 16 14 30 15C44 16 52 24 54 31C52 40 42 45.5 28 45.5C14 45.5 3 40 3 30Z',
  ell: { cx: 28.5, cy: 30.3, rx: 25.5, ry: 15.3 },
  fins: [
    { d: 'M51.5 31C55 27 57.5 21.5 62.5 18.2C61.6 24 60.5 27.5 58.6 31C60.5 34.5 61.6 37.6 62.5 43.4C57.5 40 55 35 51.5 31Z', o: [51.5, 31], a: 0, s: 90, r: 12, layer: 'top', smooth: true },
    { d: 'M32 15.6C35 11.4 39 10.8 42.2 12.4C40.6 14.6 39.2 15.8 37.6 16.8Z', o: [36, 18], a: -55, s: 40, r: 8, layer: 'top', smooth: true },
    { d: 'M23 41.5C21 47.8 16.6 51.6 11.4 52.2C13.8 48 16.4 44.8 18.2 41.6Z', o: [21, 41], a: 128, s: 26, r: 13, layer: 'front', smooth: true },
  ],
  eye: [13, 31.5, 2.2],
  mouth: 'M3.6 32.6C9 35.4 15 36.4 21 35.6',
};

const RAY: Geo = {
  body: 'M32 9C40 17 52 25.5 60.5 30C52 34.5 40 42 32 52C24 42 12 34.5 3.5 30C12 25.5 24 17 32 9Z',
  ell: { cx: 32, cy: 30.5, rx: 28, ry: 20 },
  fins: [],
  eye: [27.5, 22.5, 1.9],
  extra: (c) =>
    `<path d="M31 50C31.5 54 33 58.5 36 62.5" fill="none" stroke="${OUT}" stroke-width="3.2" stroke-linecap="round"/><path d="M31 50C31.5 54 33 58.5 36 62.5" fill="none" stroke="${c.mid}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="36.5" cy="22.5" r="1.9" fill="#ffffff" stroke="${OUT}" stroke-width="1"/><circle cx="36.5" cy="22.8" r="0.95" fill="${OUT}"/>`,
};

export const whiskers = (c: Cols, d: string, w = 1.9, col = mixHex(c.mid, '#ffffff', 0.25)): string =>
  `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w}" stroke-linecap="round"/>` +
  `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n(w * 0.47)}" stroke-linecap="round"/>`;

export function geometry(shape: FishShape, pattern: string, rank: number): Geo {
  switch (shape) {
    case 'slim':
      return { ...CARP, sy: 0.74 };
    case 'round':
      return { ...CARP, sx: 0.92, sy: 1.22 };
    case 'cat':
      return {
        ...CARP,
        sy: 0.86,
        body: 'M6.5 34C7 23 19 16.5 33 17C43 17.5 50 25 51 32C50 40 43 46 33 47C20 48 6.5 44 6.5 34Z',
        fins: [CARP_TAIL, { ...CARP_DORSAL, d: 'M24 18.2C27 11.5 32 10 36 12C35.5 14.5 35 16.5 34.6 18.6Z', o: [29, 24] }, CARP_ANAL, CARP_PELVIC, CARP_PECT],
        mouth: 'M6.8 35.6C9 37 11.6 37.2 14 36.2',
        extra: (c) => whiskers(c, 'M8.4 35.2C5 37.6 3.2 41.4 2.6 45.6M9.4 36.2C7.8 40 7.8 43.4 8.8 47.2M7.8 31.6C4 31 1.6 29 0.8 25.8'),
      };
    case 'koi':
      return {
        ...CARP,
        fins: [
          { d: 'M47.5 32C52.5 25 56.5 14.5 63 10.5C62.2 21 59.6 27 58.4 32C59.6 37 62.2 43 63 53.5C56.5 49.5 52.5 39 47.5 32Z', o: [47.5, 32], a: 0, s: 110, r: 17, layer: 'top' },
          { d: 'M20 19C23.5 9.5 34 6.5 43 11C42 14.5 40.5 17.5 39.5 20.5Z', o: [27, 27], a: -66, s: 50, r: 19, layer: 'top' },
          CARP_ANAL,
          { d: 'M22.5 41C20.5 49 16.5 54.5 12.6 56.6C14 50.4 16.2 45.4 18 41Z', o: [21, 40], a: 118, s: 26, r: 16, layer: 'back' },
          { ...CARP_PECT, d: 'M23.4 33.4C27.8 32 33.6 33.8 37.8 37.8C38 41 36.4 43.8 33.4 45C29.2 42.4 25.6 38.4 23.4 33.4Z', r: 15 },
        ],
        extra: (c) => whiskers(c, 'M8.6 34.8C6.4 36.8 5.4 39.2 5.4 41.6M9.6 35.4C9 37.6 9.4 39.6 10.4 41.2'),
      };
    case 'long':
      return { ...LONG, sx: 1.02, sy: 1.14 };
    case 'sturgeon':
      return {
        ...LONG,
        sy: 1.1,
        body: 'M1.6 34.6C7 30.6 14 28.4 22 27C28 26 32 25.6 36 25.8C46 26 52 28.5 54 32C52 36 46 39 36 39C22 39 9 38.2 1.6 34.6Z',
        ell: { cx: 28, cy: 32.4, rx: 26.4, ry: 6.6 },
        fins: [{ ...LONG.fins[0], d: 'M52 32C55 27 58 21.5 62.6 17.6C61.6 25 60.4 29 59 32.4C60 34.6 60.8 37.2 61.6 41.6C58 39.6 55 36 52 32Z', a: -8 }, ...LONG.fins.slice(1)],
        mouth: 'M7 36.6C8.4 37.4 10 37.6 11.4 37.2',
        extra: (c) => {
          let plates = '';
          for (let x = 16; x <= 48; x += 5.4) {
            const y = 26.6 - Math.sin(((x - 16) / 34) * Math.PI) * 0.6;
            plates +=
              `<path d="M${n(x - 2.3)} ${n(y + 0.9)}L${n(x)} ${n(y - 2.6)}L${n(x + 2.3)} ${n(y + 0.9)}Q${n(x)} ${n(y + 2)} ${n(x - 2.3)} ${n(y + 0.9)}Z" fill="${c.light}" stroke="${OUT}" stroke-width="0.85" stroke-linejoin="round"/>` +
              `<path d="M${n(x - 1.3)} ${n(y + 0.4)}L${n(x)} ${n(y - 1.6)}" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`;
          }
          for (let x = 20; x <= 44; x += 6) plates += `<path d="M${x - 1.4} 36.4L${x} 34.6L${x + 1.4} 36.4Z" fill="${mixHex(c.light, '#ffffff', 0.4)}" opacity="0.7"/>`;
          return plates + whiskers(c, 'M6.4 36.4C5.4 37.8 4.6 39 3.6 39.8M8.4 37C7.8 38.6 7.2 39.8 6.4 40.8');
        },
      };
    case 'shark':
      return SHARK;
    case 'angler':
      return ANGLER;
    case 'whale':
      return WHALE;
    case 'ray':
      return RAY;
    default: {
      // Perch-like stripes get a spiny dorsal; the higher-rank carp body (salmon) an adipose fin.
      const fins = [...CARP.fins];
      if (pattern === 'stripes') fins[1] = { ...CARP_DORSAL, d: 'M19.5 20L21.6 11.6L24.2 16.6L26.8 9.4L29.4 15.6L32.2 9.2L34.8 15.4L37.4 10.8L39 13.6L39.4 19.8Z' };
      if (rank >= 6) fins.splice(2, 0, { d: 'M42.6 20.6C44.6 17.6 47.6 17.4 49.6 19.2C48 21 46.6 22.4 45.4 23.6Z', o: [44, 23], a: -40, s: 30, r: 7, layer: 'top' });
      return { ...CARP, fins };
    }
  }
}

// ---------- one silhouette per species ----------
// Each lake fish gets its own outline and signature parts so they read apart at a glance,
// even at 40 px: the Carp's deep body and barbels, the Perch's spiny crest, the Bass's huge
// jaw, the slender Trout, the flat-headed Catfish, the needle-long Pike, the hump-backed
// Salmon with its hooked jaw, the shark-tailed Sturgeon, the ribbon-finned Koi and the tall
// disc of the Moonfish.

/** Small white teeth along a jaw line (x0 → x1 at y, pointing down when dir = 1). */
const jawTeeth = (x0: number, x1: number, y0: number, y1: number, count: number, len: number, dir = 1): string => {
  let d = '';
  const dx = (x1 - x0) / count;
  const dy = (y1 - y0) / count;
  for (let i = 0; i < count; i++) {
    const x = x0 + dx * i;
    const y = y0 + dy * i;
    d += `M${n(x)} ${n(y)}L${n(x + dx * 0.45)} ${n(y + len * dir)}L${n(x + dx * 0.9)} ${n(y + dy * 0.9)}Z`;
  }
  return `<path d="${d}" fill="#ffffff" stroke="rgba(30,36,52,0.55)" stroke-width="0.35" stroke-linejoin="round"/>`;
};

export const SPECIES_GEO: Record<string, Geo> = {
  carp: {
    body: 'M6 34C6.5 24 16 16 30 15.5C42 15 50 23 51.5 32C50 41 42 47.5 30 48C17 48.5 6 44 6 34Z',
    ell: { cx: 29, cy: 32, rx: 22.5, ry: 16.3 },
    fins: [
      { d: 'M49.5 32C53 27 56 21 62.4 14.5C61.8 22 60.6 26.5 57.5 32C60.6 37.5 61.8 42 62.4 49.5C56 43 53 37 49.5 32Z', o: [49.5, 32], a: 0, s: 100, r: 14, layer: 'top', col: ['#d89a2a', '#ff7a2a'] },
      { d: 'M20 18.6C22 12 28 9 35 9.6C41 10.2 45 13.6 47.4 20.8L45.6 22.4C38 17 30 16 20 18.6Z', o: [33, 22], a: -80, s: 80, r: 15, layer: 'top', col: ['#d89a2a', '#ff7a2a'] },
      { d: 'M34 46.8C36 51 40 53 43.4 52C42 49.4 41.2 47.2 40.4 45Z', o: [36, 43], a: 62, s: 44, r: 11, layer: 'back', col: ['#d89a2a', '#ff6a2a'] },
      { d: 'M21 46.2C20.2 50.6 17.6 53.4 14.2 54.4C15.2 51 16.2 48.2 17.2 45.4Z', o: [20, 43], a: 112, s: 30, r: 11, layer: 'back', col: ['#d89a2a', '#ff6a2a'] },
      { ...CARP_PECT, col: ['#e0a63a', '#ff8a3a'] },
    ],
    eye: [15.5, 28.4, 3.3],
    gill: 'M22.5 20.6C27 27 27 37 22.5 44',
    mouth: 'M6.2 35.4C7.6 37 9.6 37.2 11 36.2',
    scaleX0: 24,
    extra: (c) => whiskers(c, 'M7.4 36.4C5.6 38.6 5.4 41.4 6.6 43.6M9.6 37C9.2 39 9.6 40.6 10.8 41.8', 2.6, '#f0b860'),
  },
  perch: {
    body: 'M7 35C8 27 14 21 24 18.5C36 15.5 48 22 51 32C49 40 41 45 30 45.5C18 46 8 42 7 35Z',
    ell: { cx: 29, cy: 32, rx: 22, ry: 13.6 },
    fins: [
      { d: 'M49 32C52.5 27.5 56 23 61.6 18.6C61 25 60 28.6 58 32C60 35.4 61 39 61.6 45.4C56 41 52.5 36.5 49 32Z', o: [49, 32], a: 0, s: 90, r: 13, layer: 'top' },
      { d: 'M17.6 21.6L18.6 9.4L21.8 16.4L23.6 6.6L26.8 15L29 6.4L31.8 15L33.8 8.4L35.2 15.6L36.4 11.4L37 19Z', o: [26, 23], a: -88, s: 44, r: 15, layer: 'top', ray: ['#141c0c', 0.95] },
      { d: 'M38.4 18.6C41 13.6 45.6 13 48.6 16.2C48 19 47.2 21.4 46.4 24Z', o: [42, 22], a: -60, s: 50, r: 10, layer: 'top' },
      { d: 'M34 44.6C36 49.4 40.4 51.4 44 50.4C42.6 47.8 41.6 45.8 40.6 43.4Z', o: [36, 42], a: 62, s: 44, r: 11, layer: 'back', col: ['#e04a24', '#ff8a4a'] },
      { d: 'M21 44.8C20 49.6 17.2 52.6 13.6 53.6C14.8 50 15.8 47 16.8 44Z', o: [20, 42], a: 112, s: 30, r: 11, layer: 'back', col: ['#e04a24', '#ff8a4a'] },
      { ...CARP_PECT, d: 'M22.6 33.6C26.4 32.6 31 34 34.4 37C34.6 39.6 33.2 41.6 31 42.4C27.6 40.6 24.6 37.6 22.6 33.6Z', col: ['#d8a028', '#ffb04a'] },
    ],
    eye: [15, 29, 3.3],
    gill: 'M21.6 21.4C25.6 27 25.6 36.4 21.6 42.6',
    mouth: 'M7.2 35.6C8.8 36.8 10.8 37 12.6 36.2',
    // The black blotch at the back of the spiny fin.
    extra: () => `<ellipse cx="34.4" cy="14.4" rx="1.8" ry="2.6" fill="#141c0c" opacity="0.85"/>`,
  },
  bass: {
    body: 'M2.6 32.8C3.2 31 4.4 29.4 5.8 27.8C9.4 23.4 16 20.6 26 20.4C38 20.2 47 24 51.5 31C47 38 38 42.4 26 42.4C15 42.4 7.8 39.6 4.8 36.2C3.6 35.2 2.6 34.2 2.6 32.8Z',
    ell: { cx: 27, cy: 31.4, rx: 24.5, ry: 11 },
    fins: [
      { d: 'M50 31C53 27 56 23.5 61.6 21C61 26 60 28.6 58.6 31.2C60 33.8 61 36.4 61.6 41.4C56 39 53 35.4 50 31Z', o: [50, 31], a: 0, s: 80, r: 12, layer: 'top' },
      { d: 'M17 22L18.6 15.4L20.8 18.6L22.6 13.6L24.8 17.6L26.8 13.2L28.8 17.2L30.6 14.8L32 20.2C34.4 14.4 40 12.6 44.2 15C44 18 43.4 21 43 24.4Z', o: [30, 23], a: -78, s: 64, r: 15, layer: 'top', ray: ['#1a2610', 0.7] },
      { d: 'M35 41.4C37 45.8 41 47.6 44.4 46.6C43 44.4 42.2 42.6 41.4 40.4Z', o: [37, 39], a: 62, s: 44, r: 10, layer: 'back' },
      { d: 'M22 42C21 46 18.6 48.6 15.6 49.6C16.6 46.6 17.4 44.2 18.2 41.6Z', o: [21, 40], a: 112, s: 30, r: 10, layer: 'back' },
      { d: 'M18.6 33.4C22.4 32.6 26.6 34 29.4 37C29.4 39.4 28 41.2 25.8 41.8C22.6 40 20.2 37.2 18.6 33.4Z', o: [18.6, 33.4], a: 36, s: 44, r: 11, layer: 'front' },
    ],
    eye: [11.6, 27.2, 2.9],
    gill: 'M17.4 22.6C21 27 21 35.6 17.4 41',
    extra: () =>
      // The huge mouth: a wide dark gape that runs back past the eye, lower jaw jutting forward.
      `<path d="M2.4 32.4C7 32.6 11 32.6 16.2 31.4C15.6 33.4 12 35.4 4.6 35.4Z" fill="#3a1414" stroke="rgba(30,36,52,0.8)" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<path d="M2.4 32.4C7 32.6 11 32.6 16.2 31.4C16.8 30.4 16.4 29.4 15.4 29" fill="none" stroke="rgba(30,36,52,0.85)" stroke-width="1.1" stroke-linecap="round"/>` +
      `<path d="M4 33.4C8 33.8 11 33.6 14.4 32.6" fill="none" stroke="#c04040" stroke-width="0.7" opacity="0.6"/>`,
  },
  trout: {
    body: 'M4.5 32C7.5 27 16 24.2 28 24C40 23.8 48 27 51.5 32C48 37 40 40.2 28 40C16 39.8 7.5 37 4.5 32Z',
    ell: { cx: 28, cy: 32, rx: 23.5, ry: 8 },
    fins: [
      { d: 'M50 32C53 28 56.5 24.5 61.6 22C60.8 27 60.2 29.6 59 32C60.2 34.4 60.8 37 61.6 42C56.5 39.5 53 36 50 32Z', o: [50, 32], a: 0, s: 80, r: 12, layer: 'top' },
      { d: 'M24 24.8C26 18.6 31.4 17 35.6 18.4C35.2 20.6 34.8 22.6 34.6 24.6Z', o: [28, 26], a: -70, s: 50, r: 9, layer: 'top' },
      { d: 'M42.6 25.6C44 23.2 46.6 23 47.8 24.6C46.8 25.8 45.6 26.6 44.4 27.2Z', o: [44, 26], a: -50, s: 30, r: 4, layer: 'top', smooth: true },
      { d: 'M36 39.4C37.5 43 40.5 44.4 43.2 43.6C42.2 41.8 41.4 40.2 41 38.8Z', o: [37, 38], a: 60, s: 44, r: 8, layer: 'back' },
      { d: 'M27 39.8C26.6 42.8 25 44.6 23 45.4C23.6 43 24 41.4 24.2 39.8Z', o: [26, 39], a: 110, s: 30, r: 7, layer: 'back' },
      { d: 'M13.6 34C17 34.4 20 36 21.4 38.8C18 39.4 15.4 37.6 13.6 34Z', o: [13.6, 34], a: 38, s: 36, r: 9, layer: 'front' },
    ],
    eye: [11, 30.4, 2.6],
    gill: 'M17 26C19 29 19 35 17 38',
    mouth: 'M4.8 32.6C6.6 33.6 9 33.8 11.2 33.2',
    extra: () => {
      // Fine black speckles carry on over the tail and back fins.
      let d = '';
      for (const [x, y] of [[54, 27.4], [56.6, 25.4], [58.4, 23.8], [55.6, 30], [57.8, 28.4], [54.4, 36], [56.8, 37.8], [58.6, 39.6], [55.8, 34.2], [29, 21.4], [31.6, 20.4], [33.2, 22.4], [30.4, 23.4]]) d += `M${x} ${y}h0.01`;
      return `<path d="${d}" stroke="#1a1416" stroke-width="1.05" stroke-linecap="round" opacity="0.8"/>`;
    },
  },
  catfish: {
    body: 'M3.5 33.5C3.5 27.4 8.4 23.2 16.5 22.4C28.5 21.4 42 25 52.5 31C44 36 32 41.6 18 42.4C9 42.8 3.5 39.5 3.5 33.5Z',
    ell: { cx: 26, cy: 32.2, rx: 24, ry: 10.2 },
    fins: [
      { d: 'M51 31C54 27.6 57 25.2 61.6 24.2C61 28 60.4 30 59.6 31.4C60.4 33 61 35 61.6 38.8C57 37.8 54 35 51 31.4Z', o: [51, 31], a: 0, s: 80, r: 10, layer: 'top' },
      { d: 'M18.6 22.6C19.6 17.6 22.6 14.6 25.8 14C26 17 26.4 19.8 27.2 22.2Z', o: [22, 23], a: -80, s: 30, r: 9, layer: 'top' },
      { d: 'M38.6 25.8C41.4 23.2 45.2 23.4 47.2 26.6C44.2 27.4 41.4 27.4 38.6 25.8Z', o: [42, 26], a: -60, s: 30, r: 4, layer: 'top', smooth: true },
      { d: 'M26 41.6C32 46 42 44.2 50.4 35.2C45 37 37 39.8 26 41.6Z', o: [36, 40], a: 80, s: 50, r: 9, layer: 'back' },
      { d: 'M12.6 37.4C15.8 39 18.4 42 18.8 46C15.4 45 13.2 41.8 12.6 37.4Z', o: [12.6, 37.4], a: 60, s: 30, r: 9, layer: 'front' },
    ],
    eye: [10.2, 28.4, 1.6],
    gill: 'M17.6 25.6C19.4 29.4 19.4 35 17.6 39',
    mouth: 'M3.8 34.8C7 36.6 11 36.8 14 35.6',
    extra: (c) =>
      whiskers(c, 'M5.4 33.4C1.6 30.4 0.8 24 3.6 18.6C5.6 14.6 9.6 12.6 13.4 13.2', 2.1, '#d8b88a') +
      whiskers(c, 'M5.6 35.8C2.6 38.2 1.4 42.4 2.2 46.8C2.8 50 5.4 52.4 8.8 53', 1.9, '#d8b88a') +
      whiskers(c, 'M8.4 36.6C7.2 40 7.4 43.4 9.4 46.6M11 36.8C11 39.6 12 42 13.6 43.6', 1.4, '#d8b88a'),
  },
  pike: {
    body: 'M1.4 31.6C4 29.4 10 28.6 16 28C26 26.6 36 26.6 44 28C49 29 52 30.4 54 32C52 34 48 35.6 43 36.4C34 37.6 24 37.6 15 36.8C9 36.2 4 34.6 1.4 33.2Z',
    ell: { cx: 28, cy: 32.2, rx: 26.4, ry: 5.4 },
    fins: [
      { d: 'M52 32C55 28.4 58 25 62.4 23C61.6 27.6 60.8 30 59.6 32C60.8 34 61.6 36.4 62.4 41C58 39 55 35.6 52 32Z', o: [52, 32], a: 0, s: 80, r: 10, layer: 'top' },
      { d: 'M40 28C42 23 46 21.4 49.6 22.4C49.2 25.2 48.8 27.4 48.2 29.6Z', o: [44, 29], a: -60, s: 50, r: 8, layer: 'top' },
      { d: 'M40 36.4C42 41.4 46 43 49.6 42C49 39.4 48.4 37.2 47.6 35.4Z', o: [44, 36], a: 60, s: 50, r: 8, layer: 'back' },
      { d: 'M30 37.4C30 40 28.8 42 27 43C27.2 40.8 27.4 39.2 27 37.6Z', o: [29, 37], a: 105, s: 30, r: 6, layer: 'back' },
      { d: 'M17.6 34.4C20.4 34.8 22.8 36.4 23.6 38.8C21 39.2 19 37.8 17.6 34.4Z', o: [17.6, 34.4], a: 38, s: 36, r: 7, layer: 'front' },
    ],
    eye: [13.4, 30, 2.3],
    gill: 'M19.4 28.4C21 30.6 21 33.8 19.4 36.2',
    mouth: 'M1.6 32.4C5 32.6 10 33 15.4 32.6',
    extra: () => jawTeeth(3, 14, 32.5, 32.9, 7, 1.1, 1) + jawTeeth(3.4, 13, 32.4, 32.8, 5, -1, 1).replace('fill="#ffffff"', 'fill="#e8e8e0"'),
  },
  salmon: {
    body: 'M3.6 33.4C4 29.6 7 26.4 11 24.4C17 20.4 26 17.6 34 18.6C44 20.2 50.5 26 52 32C49.5 38 42 42 32 42.4C21 42.8 11.6 40.6 7 38.2C5 37.2 3.6 35.6 3.6 33.4Z',
    ell: { cx: 28, cy: 31, rx: 24, ry: 12 },
    fins: [
      { d: 'M50 31.6C53.6 27 56.8 22 61.8 19.4C61 25.6 60 28.6 58.6 31.6C60 34.6 61 37.6 61.8 43.8C56.8 41.2 53.6 36.2 50 31.6Z', o: [50, 31.6], a: 0, s: 90, r: 13, layer: 'top' },
      { d: 'M23.4 20C26.4 13.4 32.6 11.6 36.8 13.2C36.2 15.8 35.8 17.6 35.4 19.8Z', o: [29, 22], a: -76, s: 50, r: 11, layer: 'top' },
      { d: 'M44 22.4C45.6 20.2 48 20 49 21.6C48 22.8 47 23.6 46 24.2Z', o: [46, 23], a: -50, s: 30, r: 4, layer: 'top', smooth: true },
      { d: 'M37 41.6C38.8 45.4 42 47 45 46.2C43.8 44.2 43 42.6 42.4 40.6Z', o: [39, 40], a: 60, s: 44, r: 9, layer: 'back' },
      { d: 'M25 42.2C24.4 45.6 22.6 47.8 20 48.8C20.8 46 21.4 44 21.6 42Z', o: [23, 41], a: 110, s: 30, r: 8, layer: 'back' },
      { d: 'M15.4 34.6C19 34.8 22.4 36.8 23.8 40C20.2 40.6 17.4 38.4 15.4 34.6Z', o: [15.4, 34.6], a: 38, s: 36, r: 9, layer: 'front' },
    ],
    eye: [11.6, 28.4, 2.7],
    gill: 'M18.4 23.6C21.6 28.4 21.6 35.4 18.4 40',
    mouth: 'M4.4 34.6C7.6 35.8 11.4 35.8 15 34.6',
    extra: (c) =>
      // The hooked kype: the lower jaw curls up past the snout.
      `<path d="M4.8 35C2.6 35.6 1 34.2 1.2 31.8C1.4 30.2 2.4 29 3.6 29.4C3 30.8 3 32.6 5.6 34Z" fill="#7e9886" stroke="rgba(30,36,52,0.8)" stroke-width="0.9" stroke-linejoin="round"/>` +
      jawTeeth(5.4, 12.6, 34.8, 35.4, 4, -1, 1),
  },
  sturgeon: {
    body: 'M0.8 33.4C4 31.6 8 30.4 13 29C19 27.4 26 26 34 26C45 26 51 28.8 53.4 32C51 35.6 45 38.6 34 38.8C22 39 10 37.6 4 35.6C2.4 35 1.4 34.4 0.8 33.4Z',
    ell: { cx: 28, cy: 32.4, rx: 26, ry: 6.4 },
    fins: [
      // Shark-like tail: a long upper lobe, a short lower one.
      { d: 'M51 31C54.6 26.4 58.6 19.6 63.4 13.8C62.8 21.8 61.4 27 59.6 31.6C60 33.8 60.4 36 60.6 38.8C57 37.8 54 35.2 51 33Z', o: [51, 32], a: -20, s: 80, r: 14, layer: 'top' },
      { d: 'M41 26.4C43.4 22 46.8 20.8 49.8 22C49.2 24.6 48.4 26.6 47.6 28.6Z', o: [44, 27], a: -60, s: 50, r: 7, layer: 'top' },
      { d: 'M40 38.4C42 42.4 45.6 43.8 48.6 42.8C47.6 40.8 46.8 39.4 46 37.6Z', o: [43, 37], a: 60, s: 50, r: 7, layer: 'back' },
      { d: 'M28 38.6C28.4 41.6 27.2 44 25 45.2C25.4 42.6 25.6 40.8 25.4 38.8Z', o: [27, 38], a: 105, s: 30, r: 7, layer: 'back' },
      { d: 'M15 35.6C18.4 36 21.6 38 22.8 41.2C19.6 41.6 17 39.6 15 35.6Z', o: [15, 35.6], a: 38, s: 36, r: 9, layer: 'front' },
    ],
    eye: [12.6, 31, 2],
    mouth: 'M7.6 36.6C9 37.4 10.6 37.6 12 37.2',
    extra: (c) => {
      // Three rows of bony scutes: along the back, along the flank and low on the side.
      let plates = '';
      const row = (x0: number, x1: number, y: (x: number) => number, s: number, step: number): void => {
        for (let x = x0; x <= x1; x += step)
          plates +=
            `<path d="M${n(x - s)} ${n(y(x) + s * 0.4)}L${n(x)} ${n(y(x) - s * 1.1)}L${n(x + s)} ${n(y(x) + s * 0.4)}Q${n(x)} ${n(y(x) + s * 0.9)} ${n(x - s)} ${n(y(x) + s * 0.4)}Z" fill="#ece6cc" stroke="rgba(30,36,52,0.75)" stroke-width="0.7" stroke-linejoin="round"/>`;
      };
      row(15, 40, (x) => 27.6 - Math.sin(((x - 15) / 30) * Math.PI) * 0.8, 2.1, 5);
      row(18, 46, () => 32.2, 1.3, 4);
      row(20, 42, () => 36.4, 1, 4.4);
      return plates + whiskers(c, 'M4.4 34.6C4 36.6 3.6 38 2.8 39.4M6.4 35.2C6.2 37 5.8 38.6 5 40', 1.5, '#e8e0c8');
    },
  },
  koi: {
    body: 'M5.5 32C6.5 25 14 20.8 26 20.6C37 20.4 45 24.4 48.5 31C45 37.6 37 41.4 26 41.4C14 41.4 6.5 39 5.5 32Z',
    ell: { cx: 27, cy: 31, rx: 21.5, ry: 10.4 },
    fins: [
      // Long flowing ribbon tail (butterfly koi).
      { d: 'M46.6 31C50 25.6 53 18.6 57 13C59 10.2 62 8.8 63.6 10.4C61.2 14 60.4 18 61.2 22C62 25.6 60 28.8 57.4 31C60 33.2 62 36.4 61.2 40C60.4 44 61.2 48 63.6 51.6C62 53.2 59 51.8 57 49C53 43.4 50 36.4 46.6 31Z', o: [46.6, 31], a: 0, s: 110, r: 18, layer: 'top' },
      { d: 'M17 21.8C20 15 28 12.4 36 13C41.6 13.4 46 15.6 49.4 19.2C46.6 19.6 44.6 21.4 43.4 24C36 21 28 20.6 17 21.8Z', o: [30, 22], a: -80, s: 80, r: 16, layer: 'top' },
      { d: 'M36.4 40C38.4 44.4 42.4 46.6 45.6 45.8C44 43.6 43 41.6 42.4 39Z', o: [38, 38], a: 62, s: 44, r: 10, layer: 'back' },
      { d: 'M27 40.6C28.4 45.4 27.4 50.6 24.4 54C24.4 50 24 45.6 23.4 41.2Z', o: [25, 40], a: 105, s: 30, r: 12, layer: 'back' },
      { d: 'M16.6 34.6C20.8 36.6 24.6 41.4 25.6 47.6C26 51.2 24.2 54.8 21 56.2C20.4 52 18.6 47 16 43.2C14.4 40.8 14.4 37.4 16.6 34.6Z', o: [16.6, 34.6], a: 70, s: 40, r: 16, layer: 'front' },
    ],
    eye: [12.4, 28.2, 2.8],
    mouth: 'M5.8 33.2C7 34.2 8.6 34.4 10 33.8',
    extra: (c) => whiskers(c, 'M7 33.8C4.6 35.4 3.6 37.6 3.8 40.4M8.8 34.4C8.2 36.4 8.6 38.4 9.8 40', 1.9, '#fff0b0'),
  },
  moonfish: {
    ...CARP,
    sx: 0.84,
    sy: 1.2,
    lat: undefined,
    fins: [
      { d: 'M49.5 32C52 28 55 24.4 60 22C59 26 58.2 29 57.2 32C58.2 35 59 38 60 42C55 39.6 52 36 49.5 32Z', o: [49.5, 32], a: 0, s: 80, r: 10, layer: 'top' },
      // Tall sickle fins above and below make the disc.
      { d: 'M21 18.4C25 10.4 32 6.2 42 5.4C38.6 9.4 37.6 13.6 38.6 20Z', o: [32, 19], a: -80, s: 50, r: 16, layer: 'top' },
      { d: 'M22 45.6C26 53 33 57.4 42 58.4C38.6 54.6 37.6 50.4 38.6 44.4Z', o: [32, 45], a: 80, s: 50, r: 16, layer: 'back' },
      CARP_PECT,
    ],
  },
};
