// Vector drawing helpers for the cartoon look: smooth shapes, soft gradients, warm outlines.
// All coordinates are CSS pixels; the scene has already applied the device-pixel transform.

import { css, rgb, type ColorLike } from './color';

type Ctx = CanvasRenderingContext2D;

export interface Pt {
  x: number;
  y: number;
}

/** Fill and/or stroke style for a shape. `line` is the outline width in CSS px. */
export interface Paint {
  fill?: string | CanvasGradient | CanvasPattern;
  stroke?: string;
  line?: number;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): Ctx {
  const x = c.getContext('2d');
  if (!x) throw new Error('2D canvas unavailable');
  return x;
}

/** Apply a Paint to the current path (fill first, then a round-joined outline). */
export function paint(ctx: Ctx, p: Paint): void {
  if (p.fill) {
    ctx.fillStyle = p.fill;
    ctx.fill();
  }
  if (p.stroke && (p.line ?? 0) > 0) {
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = p.line!;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, p: Paint): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  paint(ctx, p);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, p: Paint): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  paint(ctx, p);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, p: Paint, rotation = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2);
  paint(ctx, p);
}

export function circle(ctx: Ctx, x: number, y: number, r: number, p: Paint): void {
  ellipse(ctx, x, y, r, r, p);
}

export function poly(ctx: Ctx, pts: Pt[], p: Paint, closed = true): void {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (closed) ctx.closePath();
  paint(ctx, p);
}

/** Add a smooth Catmull-Rom curve through the points to the current path. */
export function curveThrough(ctx: Ctx, pts: Pt[], closed: boolean, tension = 0.5): void {
  const n = pts.length;
  if (n < 2) return;
  const get = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const k = tension / 3;
  ctx.moveTo(pts[0].x, pts[0].y);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) * k,
      p1.y + (p2.y - p0.y) * k,
      p2.x - (p3.x - p1.x) * k,
      p2.y - (p3.y - p1.y) * k,
      p2.x,
      p2.y,
    );
  }
  if (closed) ctx.closePath();
}

/** Closed smooth blob through points (bushes, clouds, pads). */
export function blob(ctx: Ctx, pts: Pt[], p: Paint, tension = 0.5): void {
  ctx.beginPath();
  curveThrough(ctx, pts, true, tension);
  paint(ctx, p);
}

/** Open smooth line through points (stems, fishing line, ripple marks). */
export function smoothLine(ctx: Ctx, pts: Pt[], stroke: string, width: number, tension = 0.5): void {
  ctx.beginPath();
  curveThrough(ctx, pts, false, tension);
  paint(ctx, { stroke, line: width });
}

/** Quadratic curve stroke from a to b bending through control c. */
export function quadLine(ctx: Ctx, a: Pt, c: Pt, b: Pt, stroke: string, width: number): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
  paint(ctx, { stroke, line: width });
}

/** Vertical linear gradient helper: stops are [offset 0..1, css color]. */
export function vGrad(ctx: Ctx, y0: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

export function linGrad(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(Math.max(0, Math.min(1, o)), c);
  return g;
}

/**
 * Soft radial light. mode 'lighter' adds light (lamps, sun glow, sparkles); 'source-over' paints a
 * translucent halo. Color is used as given (pass s.raw(...) for emitted light).
 */
export function glow(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  color: ColorLike,
  alpha = 1,
  mode: GlobalCompositeOperation = 'lighter',
): void {
  if (alpha <= 0.002 || r <= 0) return;
  const c = rgb(color);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, css(c, 1));
  g.addColorStop(0.35, css(c, 0.55));
  g.addColorStop(0.7, css(c, 0.16));
  g.addColorStop(1, css(c, 0));
  const op = ctx.globalCompositeOperation;
  const a = ctx.globalAlpha;
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = a * Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = a;
}

/** Four-point twinkle star (sparkles on water, rare catches). */
export function sparkle(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  const w = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + w, y - w, x + r, y);
  ctx.quadraticCurveTo(x + w, y + w, x, y + r);
  ctx.quadraticCurveTo(x - w, y + w, x - r, y);
  ctx.quadraticCurveTo(x - w, y - w, x, y - r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Run `fn` with temporary alpha (multiplied) and composite mode. */
export function withAlpha(ctx: Ctx, alpha: number, fn: () => void, mode?: GlobalCompositeOperation): void {
  if (alpha <= 0) return;
  const a = ctx.globalAlpha;
  const op = ctx.globalCompositeOperation;
  ctx.globalAlpha = a * Math.min(1, alpha);
  if (mode) ctx.globalCompositeOperation = mode;
  fn();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = op;
}

/**
 * Caches an expensive, mostly static drawing (hills, tree line, dock planks) in an offscreen canvas
 * at device resolution and re-paints it only when `key` changes. Pass s.light.key in the key when the
 * drawing uses graded colors, so it re-paints as the light changes.
 */
export class Baked {
  private canvas = makeCanvas(1, 1);
  private bctx = ctx2d(this.canvas);
  private lastKey = '';

  draw(
    ctx: Ctx,
    key: string,
    area: { x: number; y: number; w: number; h: number },
    dpr: number,
    paintFn: (ctx: Ctx) => void,
  ): void {
    const k = `${key}|${area.x},${area.y},${area.w},${area.h}@${dpr}`;
    if (k !== this.lastKey) {
      const w = Math.max(1, Math.ceil(area.w * dpr));
      const h = Math.max(1, Math.ceil(area.h * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        this.bctx = ctx2d(this.canvas);
      }
      this.bctx.setTransform(1, 0, 0, 1, 0, 0);
      this.bctx.clearRect(0, 0, w, h);
      this.bctx.setTransform(dpr, 0, 0, dpr, -area.x * dpr, -area.y * dpr);
      paintFn(this.bctx);
      this.lastKey = k;
    }
    ctx.drawImage(this.canvas, area.x, area.y, area.w, area.h);
  }
}
