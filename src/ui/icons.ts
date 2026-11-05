// Calm icons as inline SVG (64×64 viewBox): soft shadow, a fine outline, top-lit shading and a
// white shine, toned down to near-monochrome so the UI stays quiet and relaxing.
// All drawings are original. Every call returns fresh gradient ids so icons can repeat on a page.

// rgba (not hex) so the toning below leaves the outline and shadow alone.
import { fishArt, type FishArt } from './fishart';

const OUT = 'rgba(36,44,62,0.62)';
const SHADOW = 'rgba(16,24,40,0.16)';

/** Tone a color: keep `keep` of its saturation, then lift it toward white by `lift`. */
function calm(hex: string, keep: number, lift: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  const f = (c: number): number => Math.round(Math.min(255, (l + (c - l) * keep) * (1 - lift) + 255 * lift));
  return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}
const toned = (markup: string, keep: number, lift: number): string =>
  markup.replace(/#[0-9a-fA-F]{6}/g, (m) => (m.toLowerCase() === '#ffffff' ? m : calm(m, keep, lift)));
let uid = 0;
const nid = (p: string): string => `gi${p}${++uid}`;

type Stops = Array<[number, string]>;

const grad = (id: string, stops: Stops, y1 = 6, y2 = 58, x1 = 0, x2 = 0): string =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
    .join('')}</linearGradient>`;

const svg = (inner: string, defs: string, cls = ''): string =>
  `<svg class="gi ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>${defs}</defs>${inner}</svg>`;

/** UI icons are mostly white; fish keep a little color so species stay apart. */
const UI_KEEP = 0.08;
const UI_LIFT = 0.5;
const FISH_KEEP = 0.72;
const FISH_LIFT = 0.08;

/** Filled shapes: shadow, outline, gradient body, shine clipped to the body. */
function filled(shapes: string, stops: Stops, shine: string, extra = '', opts: { y1?: number; y2?: number; sw?: number } = {}): { body: string; defs: string } {
  const g = nid('g');
  const c = nid('c');
  const sw = (opts.sw ?? 6) * 0.55;
  const defs = grad(g, stops, opts.y1, opts.y2) + `<clipPath id="${c}">${shapes}</clipPath>`;
  const body =
    `<g transform="translate(0 2.4)" fill="${SHADOW}" stroke="${SHADOW}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
    `<g fill="${OUT}" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>` +
    `<g fill="url(#${g})">${shapes}</g>` +
    `<g clip-path="url(#${c})">${shine}</g>` +
    extra;
  return { body, defs };
}

/** Stroked paths (hook, anchor, X): shadow, outline, gradient stroke, thin shine stroke. */
function stroked(d: string, w: number, stops: Stops, shineD = '', shineW = 2.2): { body: string; defs: string } {
  const g = nid('g');
  const defs = grad(g, stops);
  const p = (attrs: string): string => `<path d="${d}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}/>`;
  const body =
    `<g transform="translate(0 2.4)">${p(`stroke="${SHADOW}" stroke-width="${w + 3.4}"`)}</g>` +
    p(`stroke="${OUT}" stroke-width="${w + 3.4}"`) +
    p(`stroke="url(#${g})" stroke-width="${w}"`) +
    (shineD ? `<path d="${shineD}" fill="none" stroke="#ffffff" stroke-opacity="0.75" stroke-width="${shineW}" stroke-linecap="round"/>` : '');
  return { body, defs };
}

const WHITE = (o: number): string => `fill="#ffffff" fill-opacity="${o}"`;

// ------------------------------------------------------------ the icons

function bone(): string {
  const shapes =
    `<g transform="rotate(-32 32 32)"><rect x="15" y="26" width="34" height="12" rx="5"/>` +
    `<circle cx="15" cy="25" r="7.6"/><circle cx="15" cy="39" r="7.6"/><circle cx="49" cy="25" r="7.6"/><circle cx="49" cy="39" r="7.6"/></g>`;
  const shine =
    `<g transform="rotate(-32 32 32)"><rect x="17" y="27.6" width="30" height="3.4" rx="1.7" ${WHITE(0.85)}/>` +
    `<circle cx="13" cy="22" r="3" ${WHITE(0.9)}/><circle cx="47" cy="22" r="3" ${WHITE(0.9)}/>` +
    `<rect x="14" y="41" width="38" height="8" ${'fill="#c99a63" fill-opacity="0.35"'}/></g>`;
  const { body, defs } = filled(shapes, [[0, '#ffffff'], [0.55, '#f6e3c1'], [1, '#d8b07a']], shine);
  return svg(body, defs);
}

function bolt(): string {
  const shapes = `<path d="M37 4 13 35h15l-6 25 28-33H35l8-23z"/>`;
  const shine = `<path d="M37 4 13 35h6L39 8z" ${WHITE(0.6)}/><circle cx="30" cy="17" r="2.4" ${WHITE(0.9)}/>`;
  const { body, defs } = filled(shapes, [[0, '#fff7a6'], [0.45, '#ffd21f'], [1, '#f28a00']], shine);
  return svg(body, defs);
}

function goldFish(): string {
  return fishSvg(['#b86a00', '#f5a400', '#ffd84a', '#fff6b8'], true);
}

function clover(): string {
  const shapes =
    `<circle cx="22.5" cy="21.5" r="11"/><circle cx="40.5" cy="21.5" r="11"/><circle cx="22.5" cy="38.5" r="11"/><circle cx="40.5" cy="38.5" r="11"/>`;
  const shine =
    `<ellipse cx="19" cy="16.5" rx="4.6" ry="3.2" ${WHITE(0.7)}/><ellipse cx="37" cy="16.5" rx="4.6" ry="3.2" ${WHITE(0.7)}/>` +
    `<ellipse cx="19" cy="33.5" rx="4" ry="2.6" ${WHITE(0.5)}/><ellipse cx="37" cy="33.5" rx="4" ry="2.6" ${WHITE(0.5)}/>` +
    `<path d="M31.5 10v44M10 30h44" stroke="#1f7a17" stroke-opacity="0.35" stroke-width="2.4"/>`;
  const stem = stroked('M36 44c3 7 7 11 13 14', 4.5, [[0, '#7fe33e'], [1, '#2a9a1a']]);
  const leaves = filled(shapes, [[0, '#c4ff7a'], [0.5, '#5fd62e'], [1, '#22941a']], shine);
  return svg(stem.body + leaves.body, stem.defs + leaves.defs);
}

function hook(): string {
  const metal: Stops = [[0, '#ffffff'], [0.45, '#cfd9e6'], [1, '#7f8fa8']];
  const h = stroked('M40 15v20c0 11-6.5 17-14 17s-13-5.5-13-13v-4l6 5', 6.5, metal, 'M38 18v16');
  const eye = filled(`<circle cx="40" cy="10.5" r="6"/>`, metal, `<circle cx="38" cy="8.5" r="2" ${WHITE(0.9)}/>`);
  const hole = `<circle cx="40" cy="10.5" r="2.4" fill="${OUT}"/>`;
  return svg(h.body + eye.body + hole, h.defs + eye.defs);
}

function anchor(): string {
  const metal: Stops = [[0, '#a8e4ff'], [0.5, '#3d8ff0'], [1, '#1f4fb3']];
  const a = stroked('M32 18v36M20 25h24M12 40c2 10 10 15 20 15s18-5 20-15', 6, metal, 'M30 21v26');
  const ring = filled(`<circle cx="32" cy="11.5" r="6.5"/>`, metal, `<circle cx="30" cy="9.5" r="2.1" ${WHITE(0.9)}/>`);
  const hole = `<circle cx="32" cy="11.5" r="2.6" fill="${OUT}"/>`;
  const tips = filled(`<path d="M6 42l8-10 4 11zM58 42l-8-10-4 11z"/>`, metal, '', '', { sw: 5 });
  return svg(a.body + tips.body + ring.body + hole, a.defs + tips.defs + ring.defs);
}

function bucket(): string {
  const metal: Stops = [[0, '#ffffff'], [0.5, '#c9d6e6'], [1, '#8196b5']];
  const handle = stroked('M14 24c0-14 36-14 36 0', 3.6, metal);
  const body = filled(
    `<path d="M10 24h44l-5 29c-.6 3.6-3.4 6-7 6H22c-3.6 0-6.4-2.4-7-6z"/>`,
    metal,
    `<path d="M14 26h8l3 31h-7z" ${WHITE(0.6)}/><path d="M12 38h40M13 47h38" stroke="#6d7f9c" stroke-opacity="0.55" stroke-width="2.2"/>`,
  );
  const rim = filled(`<ellipse cx="32" cy="24" rx="23" ry="6.5"/>`, [[0, '#e8f0fa'], [1, '#93a6c2']], '', '', { y1: 17, y2: 31 });
  const wg = nid('w');
  const water = `<defs>${grad(wg, [[0, '#9fe3ff'], [1, '#2f8fe0']], 19, 29)}</defs><ellipse cx="32" cy="24.6" rx="18.5" ry="4.4" fill="url(#${wg})"/><ellipse cx="25" cy="23.6" rx="5" ry="1.3" ${WHITE(0.8)}/>`;
  const tail = filled(`<path d="M37 22l4-12 3 6 5-4-2 10z"/>`, [[0, '#ffd27a'], [1, '#f07a1a']], '', '', { y1: 8, y2: 24, sw: 4.5 });
  return svg(handle.body + body.body + rim.body + water + tail.body, handle.defs + body.defs + rim.defs + tail.defs);
}

/** Inventory: a wicker fishing creel with a lid and a leather strap. */
function creel(): string {
  const strap = stroked('M15 26C13 10 51 10 49 26', 3.4, [[0, '#d9a37a'], [1, '#8a5a3c']]);
  const body = filled(
    `<path d="M10 27h44l-3.4 24.6C50 56 46.8 59 42.4 59H21.6C17.2 59 14 56 13.4 51.6z"/>`,
    [[0, '#f6dcae'], [0.55, '#dcb27a'], [1, '#a9773f']],
    `<path d="M12 35h40M12.8 43h38.4M13.8 51h36.4" stroke="#8c6236" stroke-opacity="0.5" stroke-width="2"/>` +
      `<path d="M21 27v32M32 27v32M43 27v32" stroke="#8c6236" stroke-opacity="0.32" stroke-width="2"/>` +
      `<path d="M15 29h7l2 28h-6z" ${WHITE(0.45)}/>`,
    '',
    { y1: 27, y2: 59 },
  );
  const lid = filled(`<rect x="7.5" y="20" width="49" height="9.5" rx="4.6"/>`, [[0, '#fbe8c4'], [1, '#c4935a']], `<rect x="10" y="21.6" width="30" height="2.6" rx="1.3" ${WHITE(0.8)}/>`, '', { y1: 20, y2: 30 });
  const clasp = filled(`<rect x="27.5" y="25" width="9" height="10" rx="2.6"/>`, [[0, '#ffffff'], [1, '#9fb0c8']], `<rect x="29.4" y="26.6" width="3" height="3" rx="1.2" ${WHITE(0.9)}/>`, '', { y1: 25, y2: 35, sw: 4.5 });
  const tail = filled(`<path d="M47 21l3-11 4 6 5-2-4 9z"/>`, [[0, '#bfe6ff'], [1, '#4a8fd0']], '', '', { y1: 9, y2: 24, sw: 4.5 });
  return svg(tail.body + strap.body + body.body + lid.body + clasp.body, tail.defs + strap.defs + body.defs + lid.defs + clasp.defs);
}

function moon(): string {
  // Crescent: the outer circle (30,34,r22) minus an inner circle (40,26,r18); the arcs meet at their intersections.
  const shapes = `<path d="M28.6 12A22 22 0 1 0 51.1 40.2A18 18 0 0 1 28.6 12z"/>`;
  const shine = `<path d="M22 17a18 18 0 0 0-8 18" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="21" cy="44" r="3.4" fill="#e8a400" fill-opacity="0.5"/><circle cx="31" cy="51" r="2.2" fill="#e8a400" fill-opacity="0.5"/><circle cx="14" cy="33" r="2" fill="#e8a400" fill-opacity="0.5"/>`;
  const m = filled(shapes, [[0, '#fffbd0'], [0.5, '#ffdf4f'], [1, '#f2a600']], shine);
  const z1 = stroked('M40 10h9l-9 10h9', 3.2, [[0, '#ffffff'], [1, '#c9b8ff']]);
  const z2 = stroked('M50 26h6l-6 7h6', 2.6, [[0, '#ffffff'], [1, '#c9b8ff']]);
  return svg(m.body + z1.body + z2.body, m.defs + z1.defs + z2.defs);
}

function closeX(): string {
  const x = stroked('M18 18l28 28M46 18 18 46', 7, [[0, '#ffffff'], [1, '#e9e3f5']]);
  return svg(x.body, x.defs);
}

function arrowUp(): string {
  const shapes = `<path d="M32 5 57 31H43v25H21V31H7z"/>`;
  const shine = `<path d="M32 9 12 29h6L35 11z" ${WHITE(0.6)}/><rect x="24" y="33" width="5" height="20" rx="2.5" ${WHITE(0.35)}/>`;
  const { body, defs } = filled(shapes, [[0, '#d8ff8a'], [0.5, '#62dc2e'], [1, '#249a1b']], shine);
  return svg(body, defs);
}


function gear(): string {
  let teeth = '';
  for (let i = 0; i < 8; i++) teeth += `<rect x="27.5" y="4" width="9" height="14" rx="2.6" transform="rotate(${i * 45} 32 32)"/>`;
  const shapes = `${teeth}<circle cx="32" cy="32" r="19"/>`;
  const shine = `<path d="M18 26a15 15 0 0 1 12-11" stroke="#ffffff" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-opacity="0.85"/>`;
  const g = filled(shapes, [[0, '#f4f6fb'], [0.55, '#b9c2d3'], [1, '#77819a']], shine);
  const hole = `<circle cx="32" cy="32" r="7.5" fill="${OUT}"/><circle cx="32" cy="32" r="4.6" fill="#3b3550"/>`;
  return svg(g.body + hole, g.defs);
}

function star(): string {
  const shapes = `<path d="M32 4l8.3 17 18.7 2.6-13.6 13 3.3 18.5L32 46.3 15.3 55.1l3.3-18.5L5 23.6 23.7 21z"/>`;
  const shine = `<path d="M32 9l-6.3 13-13 2 9 8.6z" ${WHITE(0.55)}/><circle cx="27" cy="22" r="2.4" ${WHITE(0.9)}/>`;
  const { body, defs } = filled(shapes, [[0, '#fff6a8'], [0.5, '#ffd024'], [1, '#f08c00']], shine);
  return svg(body, defs);
}

function lock(): string {
  const shackle = stroked('M21 30v-8a11 11 0 0 1 22 0v8', 5, [[0, '#f4f6fb'], [1, '#8a94ad']]);
  const body = filled(`<rect x="13" y="28" width="38" height="30" rx="7"/>`, [[0, '#ffe27a'], [0.5, '#ffbf1a'], [1, '#e48900']], `<rect x="16" y="30" width="32" height="6" rx="3" ${WHITE(0.5)}/>`, '', { y1: 28, y2: 58 });
  const hole = `<circle cx="32" cy="41" r="4" fill="${OUT}"/><rect x="30.2" y="42" width="3.6" height="8" rx="1.8" fill="${OUT}"/>`;
  return svg(shackle.body + body.body + hole, shackle.defs + body.defs);
}

function sun(): string {
  let rays = '';
  for (let i = 0; i < 8; i++) rays += `<rect x="29" y="2" width="6" height="12" rx="3" transform="rotate(${i * 45} 32 32)"/>`;
  const r = filled(rays, [[0, '#fff2a0'], [1, '#ffa800']], '', '', { sw: 5 });
  const c = filled(`<circle cx="32" cy="32" r="15"/>`, [[0, '#fff9c4'], [0.5, '#ffd630'], [1, '#f59500']], `<ellipse cx="27" cy="26" rx="6" ry="4" ${WHITE(0.75)}/>`, '', { y1: 17, y2: 47 });
  return svg(r.body + c.body, r.defs + c.defs);
}

function cloudShape(y = 0): string {
  return `<g transform="translate(0 ${y})"><circle cx="22" cy="30" r="10"/><circle cx="34" cy="24" r="13"/><circle cx="46" cy="31" r="9"/><rect x="12" y="29" width="42" height="12" rx="6"/></g>`;
}

function cloudIcon(stops: Stops, extra = '', y = 0): string {
  const c = filled(cloudShape(y), stops, `<ellipse cx="28" cy="${20 + y}" rx="7" ry="4" ${WHITE(0.8)}/>`, '', { y1: 10 + y, y2: 42 + y });
  return svg(c.body + extra, c.defs);
}

function rain(): string {
  const drops = filled(`<path d="M20 46c-2 4-2 7 0 8s4-2 2-6zM33 46c-2 4-2 7 0 8s4-2 2-6zM46 46c-2 4-2 7 0 8s4-2 2-6z"/>`, [[0, '#a8e6ff'], [1, '#2f86e6']], '', '', { y1: 44, y2: 56, sw: 4 });
  const c = filled(cloudShape(-4), [[0, '#ffffff'], [1, '#a9c3e0']], `<ellipse cx="28" cy="16" rx="7" ry="4" ${WHITE(0.8)}/>`, '', { y1: 6, y2: 38 });
  return svg(c.body + drops.body, c.defs + drops.defs);
}

function storm(): string {
  const c = filled(cloudShape(-6), [[0, '#9aa3bf'], [1, '#4a5170']], `<ellipse cx="28" cy="14" rx="7" ry="4" ${WHITE(0.45)}/>`, '', { y1: 4, y2: 36 });
  const b = filled(`<path d="M34 32 24 46h7l-4 13 13-17h-7l4-10z"/>`, [[0, '#fff7a6'], [1, '#f2a000']], '', '', { y1: 32, y2: 59, sw: 4.5 });
  return svg(c.body + b.body, c.defs + b.defs);
}

function fogIcon(): string {
  const lines = stroked('M10 50h30M18 58h36', 4.2, [[0, '#ffffff'], [1, '#c5d2e6']]);
  const c = filled(cloudShape(-6), [[0, '#ffffff'], [1, '#b7c4d8']], `<ellipse cx="28" cy="14" rx="7" ry="4" ${WHITE(0.8)}/>`, '', { y1: 4, y2: 36 });
  return svg(c.body + lines.body, c.defs + lines.defs);
}

/** A glossy fish in any color ramp (dark → light; 2+ entries). */
function fishSvg(ramp: readonly string[], sparkle = false): string {
  const d = ramp[0];
  const m = ramp[Math.min(1, ramp.length - 1)];
  const l = ramp[Math.min(2, ramp.length - 1)];
  const h = ramp[ramp.length - 1];
  const tail = filled(`<path d="M44 32 60 18c-2 7-2 21 0 28z"/>`, [[0, l], [1, d]], '', '', { y1: 18, y2: 46, sw: 5.5 });
  const fin = filled(`<path d="M18 22c5-9 15-11 22-7l-4 7z"/>`, [[0, l], [1, m]], '', '', { y1: 12, y2: 24, sw: 5 });
  const body = filled(
    `<ellipse cx="28" cy="33" rx="21" ry="14.5"/>`,
    [[0, h], [0.45, l], [1, m]],
    `<ellipse cx="25" cy="44" rx="20" ry="6.5" fill="${d}" fill-opacity="0.35"/><ellipse cx="22" cy="25" rx="10" ry="4" ${WHITE(0.7)}/>` +
      `<path d="M36 22c3 6 3 16 0 22" stroke="${d}" stroke-opacity="0.55" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    '',
    { y1: 18, y2: 48 },
  );
  const eye = `<circle cx="15.5" cy="30" r="4.6" fill="#ffffff" stroke="${OUT}" stroke-width="2"/><circle cx="14.6" cy="30.6" r="2.3" fill="${OUT}"/><circle cx="14" cy="29.4" r="0.9" fill="#ffffff"/>`;
  const spark = sparkle
    ? `<path d="M52 4l2.2 5.8L60 12l-5.8 2.2L52 20l-2.2-5.8L44 12l5.8-2.2z" fill="#ffffff" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>`
    : '';
  return svg(tail.body + fin.body + body.body + eye + spark, tail.defs + fin.defs + body.defs);
}

function bootSvg(): string {
  const b = filled(
    `<path d="M14 8h22v28c8 0 18 4 20 12v8H12z"/>`,
    [[0, '#b98a5e'], [0.5, '#8a5a35'], [1, '#5c3a22']],
    `<rect x="16" y="10" width="6" height="26" rx="3" ${WHITE(0.35)}/><path d="M12 50h44" stroke="#3a2416" stroke-width="3"/>`,
    '',
    { y1: 8, y2: 56 },
  );
  const cuff = filled(`<rect x="11" y="5" width="28" height="8" rx="3"/>`, [[0, '#d7b088'], [1, '#9a6a42']], '', '', { y1: 5, y2: 13, sw: 5 });
  return svg(b.body + cuff.body, b.defs + cuff.defs);
}

export type IconName =
  | 'bone' | 'speed' | 'value' | 'luck' | 'hook' | 'depth' | 'bucket' | 'bag' | 'afk' | 'sell'
  | 'close' | 'up' | 'gear' | 'star' | 'lock' | 'sun' | 'rain' | 'storm' | 'fog';

const MAKERS: Record<IconName, () => string> = {
  bone,
  speed: bolt,
  value: goldFish,
  luck: clover,
  hook,
  depth: anchor,
  bucket,
  bag: creel,
  sell: bone,
  afk: moon,
  close: closeX,
  up: arrowUp,
  gear,
  star,
  lock,
  sun,
  rain,
  storm,
  fog: fogIcon,
};

/** A calm icon; `cls` adds a size/placement class. */
export const icon = (name: IconName, cls = ''): string => toned(MAKERS[name](), UI_KEEP, UI_LIFT).replace('class="gi ', `class="gi ${cls} `);

/** The same icon with most of its color kept, for the heavily blurred art behind cards. */
export const iconArt = (name: IconName): string => toned(MAKERS[name](), 0.85, 0.04);

/** A detailed fish icon for a species (see fishart.ts); colors toned slightly to sit in the calm UI. */
export const fishIcon = (art: FishArt, cls = ''): string => toned(fishArt(art), FISH_KEEP, FISH_LIFT).replace('class="gi ', `class="gi ${cls} `);

// Unused helper kept for icons that need a plain cloud.
export const cloud = (): string => cloudIcon([[0, '#ffffff'], [1, '#b7c4d8']]);
