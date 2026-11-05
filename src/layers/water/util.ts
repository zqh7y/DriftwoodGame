// Shared helpers for the lake module: a small sprite cache and the "keep out" zones
// (pier, reeds, fisher, bobber) that fish and pads avoid.

import { ctx2d, lerp, makeCanvas, smoothstep, type Pt, type Scene } from '../../engine';

export type Ctx = CanvasRenderingContext2D;

/**
 * An offscreen drawing painted at device resolution in CSS px (origin at its top-left) and
 * re-painted only when its key changes. Unlike Baked it hands back the canvas, so callers can
 * draw it in slices or with a transform.
 */
export class Sprite {
  canvas: HTMLCanvasElement = makeCanvas(1, 1);
  /** CSS size of the canvas (device pixels / dpr). */
  w = 1;
  h = 1;
  private c: Ctx = ctx2d(this.canvas);
  private key = '';

  get(key: string, w: number, h: number, dpr: number, paintFn: (c: Ctx) => void): HTMLCanvasElement {
    const pw = Math.max(1, Math.ceil(w * dpr));
    const ph = Math.max(1, Math.ceil(h * dpr));
    const k = `${key}|${pw}x${ph}@${dpr}`;
    if (k !== this.key) {
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
        this.c = ctx2d(this.canvas);
      }
      const c = this.c;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, pw, ph);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintFn(c);
      this.key = k;
      this.w = pw / dpr;
      this.h = ph / dpr;
    }
    return this.canvas;
  }
}

/** Left and right pier edges at row y (extrapolated above the far end). */
export function pierEdges(s: Scene, y: number): [number, number] {
  const d = s.layout.dock;
  const t = (y - d.farL.y) / (d.nearL.y - d.farL.y);
  return [lerp(d.farL.x, d.nearL.x, t), lerp(d.farR.x, d.nearR.x, t)];
}

export function inPier(s: Scene, x: number, y: number, m: number): boolean {
  const d = s.layout.dock;
  if (y < d.farL.y - m) return false;
  const [l, r] = pierEdges(s, Math.max(y, d.farL.y));
  return x > l - m && x < r + m;
}

export function inReeds(s: Scene, x: number, y: number, m: number): boolean {
  const r = s.layout.reeds;
  return x > r.x0 - m && x < r.x1 + m && y > r.headY - m;
}

/** The seated fisher and the bucket stick up above the far end of the pier. */
export function nearFisher(s: Scene, x: number, y: number, m: number): boolean {
  const f = s.layout.fisher;
  const u = s.u;
  return Math.abs(x - f.x) < 34 * u + m && y > f.y - 80 * u - m && y < f.y + 10 * u + m;
}

/** Live bobber position if the fisher module shares one, else the layout's resting spot. */
export function bobberPos(s: Scene): Pt {
  const b = s.shared.bobber as Partial<Pt> | undefined;
  if (b && typeof b.x === 'number' && typeof b.y === 'number') return { x: b.x, y: b.y };
  return s.layout.bobber;
}

/** Horizontal span where the lake's living things roam: the stage plus a share of the sides. */
export function roamSpan(s: Scene, extra = 0.32): [number, number] {
  const st = s.layout.stage;
  const m = 14 * s.u;
  return [Math.max(m, st.x0 - st.w * extra), Math.min(s.W - m, st.x0 + st.w * (1 + extra))];
}

/** Mark/pad perspective scale: like s.persp but squeezed further near the shoreline, as in the picture. */
export function farScale(s: Scene, y: number): number {
  const hz = s.layout.horizon;
  return s.persp(y) * (0.38 + 0.62 * smoothstep(hz, hz + 0.13 * s.H, y));
}

export const angleDiff = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
