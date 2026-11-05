// Small SVG helpers shared by the fish icons (fishart.ts and fishart-special.ts).
// Every gradient/clip id starts with "fx" so the toning regex in icons.ts (#rrggbb) never touches it,
// and every call gets fresh ids so the same fish can render many times on one page.

/** Outline used on the fish (rgba so the toning step leaves it alone). */
export const OUT = 'rgba(30,36,52,0.72)';
export const FIN_OUT = 'rgba(30,36,52,0.5)';
export const WHITE = '#ffffff';

let uid = 0;
export const nid = (p: string): string => `fx${p}${(++uid).toString(36)}`;

/** Round to 2 decimals for compact markup. */
export const n = (v: number): number => Math.round(v * 100) / 100;

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number): number => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}

/** Seeded 0..1 random (tiny LCG, stable per seed). */
export function rng(seed: number): () => number {
  let s = Math.abs(Math.floor(seed * 7919 + 104729)) % 233280;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}

/** [offset, color, opacity?] */
export type Stop = [number, string, number?];

const stops = (st: Stop[]): string =>
  st.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined || a === 1 ? '' : ` stop-opacity="${a}"`}/>`).join('');

/** Collects <defs> for one SVG. */
export class Defs {
  out = '';
  lin(st: Stop[], x1: number, y1: number, x2: number, y2: number): string {
    const id = nid('l');
    this.out += `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${stops(st)}</linearGradient>`;
    return id;
  }
  /** Linear gradient across each shape's own box (0..1). */
  box(st: Stop[], x1 = 0, y1 = 0, x2 = 0, y2 = 1): string {
    const id = nid('l');
    this.out += `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops(st)}</linearGradient>`;
    return id;
  }
  /** Elliptic radial gradient in user space, optionally rotated (degrees). */
  rad(st: Stop[], cx: number, cy: number, rx: number, ry = rx, rot = 0): string {
    const id = nid('r');
    const tf = `translate(${n(cx)} ${n(cy)})${rot ? ` rotate(${rot})` : ''} scale(${n(rx)} ${n(ry)})`;
    this.out += `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="${tf}">${stops(st)}</radialGradient>`;
    return id;
  }
  clip(d: string, tf = ''): string {
    const id = nid('c');
    this.out += `<clipPath id="${id}"><path d="${d}"${tf ? ` transform="${tf}"` : ''}/></clipPath>`;
    return id;
  }
  /** One cheap blur, only for glow halos. */
  blur(sd: number): string {
    const id = nid('b');
    this.out += `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
    return id;
  }
}

/** A four-point twinkle star. */
export function star4(x: number, y: number, r: number, fill = WHITE, outline = true, thin = 0.18): string {
  const k = r * thin;
  const d =
    `M${n(x)} ${n(y - r)}Q${n(x + k)} ${n(y - k)} ${n(x + r)} ${n(y)}Q${n(x + k)} ${n(y + k)} ${n(x)} ${n(y + r)}` +
    `Q${n(x - k)} ${n(y + k)} ${n(x - r)} ${n(y)}Q${n(x - k)} ${n(y - k)} ${n(x)} ${n(y - r)}Z`;
  return `<path d="${d}" fill="${fill}"${outline ? ` stroke="rgba(30,36,52,0.42)" stroke-width="0.6" stroke-linejoin="round"` : ''}/>`;
}

/** A sparkle with a soft glow dot behind it. */
export function sparkle(D: Defs, x: number, y: number, r: number, tint = WHITE): string {
  const g = D.rad([[0, tint, 0.75], [1, tint, 0]], x, y, r * 1.2);
  return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 1.2)}" fill="url(#${g})"/>` + star4(x, y, r);
}

/** Body outline approximated by an ellipse (used to wrap patterns around the body). */
export interface Ell {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Half-height of the body ellipse at x (0 outside). */
export const halfH = (e: Ell, x: number): number => {
  const t = (x - e.cx) / e.rx;
  return t >= 1 || t <= -1 ? 0 : e.ry * Math.sqrt(1 - t * t);
};

/** A crisp crescent highlight hugging the top-front of the body ellipse. */
export function crescent(e: Ell, a0 = 196, a1 = 286, outer = 0.86, thick = 0.15): string {
  const pts: string[] = [];
  const steps = 14;
  const at = (deg: number, s: number): string => {
    const r = (deg * Math.PI) / 180;
    return `${n(e.cx + e.rx * s * Math.cos(r))} ${n(e.cy + e.ry * s * Math.sin(r))}`;
  };
  for (let i = 0; i <= steps; i++) pts.push(at(a0 + ((a1 - a0) * i) / steps, outer));
  for (let i = steps; i >= 0; i--) pts.push(at(a0 + ((a1 - a0) * i) / steps, outer - thick * Math.sin((Math.PI * i) / steps)));
  return `M${pts.join('L')}Z`;
}
