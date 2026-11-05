// Color helpers. Colors are sRGB 0–255 triples; hex strings are accepted anywhere a ColorLike is.

export type RGB = [number, number, number];
export type ColorLike = string | RGB;

const parsed = new Map<string, RGB>();

/** Parse '#rgb' / '#rrggbb' (cached) or pass an RGB through. Throws on bad input so typos surface early. */
export function rgb(c: ColorLike): RGB {
  if (typeof c !== 'string') return c;
  let v = parsed.get(c);
  if (!v) {
    let h = c.trim();
    if (h[0] === '#') h = h.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (h.length !== 6 || Number.isNaN(n)) throw new Error(`Bad color: ${c}`);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    parsed.set(c, v);
  }
  return v;
}

export const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** RGB → '#rrggbb' (or rgba() when alpha < 1). */
export function css(c: RGB, alpha = 1): string {
  const r = clamp255(c[0]);
  const g = clamp255(c[1]);
  const b = clamp255(c[2]);
  if (alpha < 1) return `rgba(${r},${g},${b},${Math.max(0, alpha).toFixed(3)})`;
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function mix(a: ColorLike, b: ColorLike, t: number): RGB {
  const x = rgb(a);
  const y = rgb(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

/** Sample a multi-stop gradient at t ∈ [0, 1]. */
export function gradient(stops: readonly ColorLike[], t: number): RGB {
  if (stops.length === 1) return rgb(stops[0]);
  const f = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  return mix(stops[i], stops[i + 1], f - i);
}

export const scaleRGB = (c: ColorLike, k: number): RGB => {
  const x = rgb(c);
  return [x[0] * k, x[1] * k, x[2] * k];
};

export const lum = (c: ColorLike): number => {
  const x = rgb(c);
  return 0.299 * x[0] + 0.587 * x[1] + 0.114 * x[2];
};

export const sameRGB = (a: RGB, b: RGB): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Lighten (k > 0, toward warm white) or darken (k < 0, toward a cool deep tone). k in -1..1. */
export function shade(c: ColorLike, k: number): RGB {
  return k >= 0 ? mix(c, [255, 252, 240], k) : mix(c, [34, 30, 52], -k);
}
