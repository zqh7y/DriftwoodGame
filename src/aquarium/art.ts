// Static drawing for the aquarium: water, sand, pebbles, kelp sprites and the decorations.
// Every function draws in CSS px into a context that already carries the device-pixel transform.

import { C } from '../engine/palette';
import { ellipse, circle, blob, vGrad, linGrad, glow, sparkle, withAlpha, roundRect, poly, smoothLine, type Pt } from '../engine/draw';

type Ctx = CanvasRenderingContext2D;
const OUT = C.outline;
const LW = 2.6;

/** Small seeded rng so the static art is the same on every rebuild. */
export function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Canvas sized in device px with the CSS-px transform applied. */
export function offscreen(w: number, h: number, dpr: number): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const x = c.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { c, x };
}

// ---------- water + sand ----------

export function drawWater(ctx: Ctx, W: number, H: number, sandY: number, sandTop: (x: number) => number): void {
  const r = rng(7);
  ctx.fillStyle = vGrad(ctx, 0, H, [[0, '#9fe0ea'], [0.18, '#6cc6dc'], [0.5, '#3b9cc8'], [0.8, '#2b7cb0'], [1, '#22679c']]);
  ctx.fillRect(0, 0, W, H);
  withAlpha(ctx, 0.35, () => {
    ctx.fillStyle = linGrad(ctx, 0, 0, W, 0, [[0, C.teal[1]], [0.25, 'rgba(46,154,153,0)'], [0.75, 'rgba(46,154,153,0)'], [1, C.teal[1]]]);
    ctx.fillRect(0, 0, W, H);
  });
  // surface shimmer band
  withAlpha(ctx, 0.5, () => {
    ctx.fillStyle = vGrad(ctx, 0, 130, [[0, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]);
    ctx.fillRect(0, 0, W, 130);
  });
  for (let i = 0; i < Math.ceil(W / 44); i++) {
    const x = 20 + i * 44 + r() * 16, y = 104 + r() * 30;
    withAlpha(ctx, 0.28, () => ellipse(ctx, x, y, 14 + r() * 10, 2.2, { fill: C.water.ripple }));
  }
  // far silhouettes: soft rocks + far kelp (no outlines)
  const b = sandY + 83;
  withAlpha(ctx, 0.35, () => {
    blob(ctx, [{ x: -20, y: b }, { x: 40, y: b - 80 }, { x: 110, y: b - 50 }, { x: 150, y: b }], { fill: '#2a77a6' });
    blob(ctx, [{ x: W - 140, y: b }, { x: W - 90, y: b - 95 }, { x: W - 20, y: b - 80 }, { x: W + 30, y: b }], { fill: '#2a77a6' });
  });
  const farKelp = (x: number, h: number, ph: number): void => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) pts.push({ x: x + Math.sin(i * 0.9 + ph) * 8, y: b - (h * i) / 6 });
    withAlpha(ctx, 0.35, () => smoothLine(ctx, pts, '#2f8a9a', 7));
  };
  farKelp(W * 0.23, 260, 0); farKelp(W * 0.525, 200, 1.5); farKelp(W * 0.77, 300, 2.6); farKelp(W * 0.91, 190, 0.7);

  // sand
  const pts: Pt[] = [];
  for (let x = -10; x <= W + 20; x += 20) pts.push({ x, y: sandTop(x) });
  ctx.beginPath();
  ctx.moveTo(-10, H + 10);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.lineTo(W + 20, H + 10);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, sandY - 12, H, [[0, '#f6e1ad'], [0.22, '#ecca8a'], [1, '#c9a064']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(67,54,43,0.5)';
  ctx.lineWidth = 2.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  // ripples & specks
  for (let i = 0; i < 16; i++) {
    const x = r() * W, y = sandY + 34 + r() * (H - sandY - 40);
    withAlpha(ctx, 0.35, () => {
      ctx.beginPath();
      ctx.ellipse(x, y, 14 + r() * 10, 3, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = '#b98e55';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
  for (let i = 0; i < 40; i++) withAlpha(ctx, 0.25, () => circle(ctx, r() * W, sandY + 20 + r() * (H - sandY), 1 + r(), { fill: '#a8804c' }));
}

// ---------- props ----------

export function pebble(ctx: Ctx, x: number, y: number, rx: number, ry: number, ramp: readonly string[]): void {
  ellipse(ctx, x + 2, y + ry * 0.7, rx * 1.05, ry * 0.35, { fill: 'rgba(60,40,20,0.18)' });
  ellipse(ctx, x, y, rx, ry, { fill: vGrad(ctx, y - ry, y + ry, [[0, ramp[3]], [0.5, ramp[2]], [1, ramp[1]]]), stroke: OUT, line: 2.2 });
  withAlpha(ctx, 0.7, () => ellipse(ctx, x - rx * 0.3, y - ry * 0.45, rx * 0.32, ry * 0.18, { fill: '#ffffff' }, -0.2));
}

/** A kelp strand standing on (x, base), at rest. The tank sways it by slicing the sprite. */
export function kelp(ctx: Ctx, x: number, base: number, h: number, ph: number, ramp: readonly string[]): void {
  const n = Math.max(4, Math.round(h / 42));
  const stem: Pt[] = [];
  for (let i = 0; i <= n; i++) stem.push({ x: x + Math.sin(i * 0.75 + ph) * (3 + i * 1.2), y: base - (h * i) / n });
  smoothLine(ctx, stem, OUT, 6.2);
  smoothLine(ctx, stem, ramp[1], 3.6);
  for (let i = 1; i <= n; i++) {
    const p = stem[i];
    const side = (i + Math.round(ph * 3)) % 2 ? 1 : -1;
    const L = 26 - (i / n) * 9, Wd = 9 - (i / n) * 3;
    const tip = { x: p.x + side * L, y: p.y - 10 };
    const pts: Pt[] = [{ x: p.x, y: p.y + 2 }, { x: p.x + side * L * 0.5, y: p.y - Wd * 0.2 + 3 }, tip, { x: p.x + side * L * 0.45, y: p.y - Wd - 3 }];
    blob(ctx, pts, { fill: linGrad(ctx, p.x, p.y - 12, p.x, p.y + 4, [[0, ramp[3]], [0.5, ramp[2]], [1, ramp[1]]]), stroke: OUT, line: 2.2 }, 0.55);
    withAlpha(ctx, 0.5, () => smoothLine(ctx, [{ x: p.x + side * 4, y: p.y - 2 }, { x: p.x + side * L * 0.6, y: p.y - 6 }], '#ffffff', 1.4));
  }
  const t = stem[n];
  blob(ctx, [{ x: t.x - 6, y: t.y + 4 }, { x: t.x, y: t.y - 18 }, { x: t.x + 6, y: t.y + 4 }], { fill: ramp[2], stroke: OUT, line: 2.2 });
}

export function bush(ctx: Ctx, x: number, y: number, s: number, ramp: readonly string[]): void {
  const lobes: Array<[number, number, number]> = [[-18, -6, 14], [16, -6, 13], [0, -18, 17], [-8, -28, 11], [10, -30, 10]];
  ellipse(ctx, x, y + 2, 32 * s, 5 * s, { fill: 'rgba(60,40,20,0.18)' });
  for (const [dx, dy, r] of lobes) circle(ctx, x + dx * s, y + dy * s, (r + 2.4) * s, { fill: OUT });
  for (const [dx, dy, r] of lobes) {
    const cy = y + dy * s;
    circle(ctx, x + dx * s, cy, r * s, { fill: vGrad(ctx, cy - r * s, cy + r * s, [[0, ramp[3]], [0.45, ramp[2]], [1, ramp[1]]]) });
  }
  for (const [dx, dy, r] of lobes) withAlpha(ctx, 0.55, () => ellipse(ctx, x + (dx - r * 0.35) * s, y + (dy - r * 0.45) * s, r * 0.35 * s, r * 0.2 * s, { fill: '#ffffff' }, -0.4));
}

export function fan(ctx: Ctx, x: number, y: number, s: number, ramp: readonly string[]): void {
  const arms = [-0.9, -0.45, 0, 0.45, 0.9];
  const path = (a: number): Pt[] => {
    const L = (40 - Math.abs(a) * 12) * s;
    return [{ x, y }, { x: x + Math.sin(a) * L * 0.5, y: y - Math.cos(a) * L * 0.55 }, { x: x + Math.sin(a) * L, y: y - Math.cos(a) * L }];
  };
  for (const a of arms) smoothLine(ctx, path(a), OUT, 9 * s);
  for (const a of arms) {
    const p = path(a);
    smoothLine(ctx, p, ramp[2], 4.6 * s);
    circle(ctx, p[2].x, p[2].y, 5.6 * s, { fill: ramp[3], stroke: OUT, line: 2 });
    withAlpha(ctx, 0.8, () => circle(ctx, p[2].x - 1.6 * s, p[2].y - 1.8 * s, 1.6 * s, { fill: '#ffffff' }));
  }
}

export function house(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x, y + 2, 46, 7, { fill: 'rgba(60,40,20,0.2)' });
  roundRect(ctx, x - 32, y - 52, 64, 54, 14, { fill: vGrad(ctx, y - 52, y, [[0, '#fff6ea'], [0.6, '#f3e2cc'], [1, '#dcc4a4']]), stroke: OUT, line: LW });
  blob(ctx, [{ x: x - 44, y: y - 46 }, { x: x - 14, y: y - 86 }, { x, y: y - 92 }, { x: x + 14, y: y - 86 }, { x: x + 44, y: y - 46 }, { x, y: y - 52 }], { fill: vGrad(ctx, y - 92, y - 46, [[0, C.teal[3]], [0.5, C.teal[2]], [1, C.teal[1]]]), stroke: OUT, line: LW }, 0.35);
  withAlpha(ctx, 0.6, () => smoothLine(ctx, [{ x: x - 26, y: y - 60 }, { x: x - 10, y: y - 80 }], '#ffffff', 3));
  roundRect(ctx, x + 16, y - 96, 11, 18, 4, { fill: C.orange[2], stroke: OUT, line: 2.2 });
  ctx.beginPath();
  ctx.moveTo(x - 10, y); ctx.lineTo(x - 10, y - 18); ctx.arc(x, y - 18, 10, Math.PI, 0); ctx.lineTo(x + 10, y); ctx.closePath();
  ctx.fillStyle = vGrad(ctx, y - 28, y, [[0, C.wood.top], [1, C.wood.dark]]); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.stroke();
  circle(ctx, x + 5, y - 12, 1.6, { fill: C.yellow[2] });
  circle(ctx, x - 20, y - 32, 6.5, { fill: C.light.window, stroke: OUT, line: 2.2 });
  circle(ctx, x + 20, y - 32, 6.5, { fill: C.light.window, stroke: OUT, line: 2.2 });
  for (const [dx, dy] of [[-22, -12], [22, -14], [-6, -42], [8, -44]]) withAlpha(ctx, 0.6, () => circle(ctx, x + dx, y + dy, 2, { fill: C.teal[2] }));
}

export function chest(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x, y + 2, 36, 6, { fill: 'rgba(60,40,20,0.22)' });
  glow(ctx, x, y - 30, 40, C.light.lamp, 0.45);
  blob(ctx, [{ x: x - 28, y: y - 30 }, { x: x - 24, y: y - 50 }, { x: x + 24, y: y - 50 }, { x: x + 28, y: y - 30 }], { fill: vGrad(ctx, y - 52, y - 30, [[0, C.wood.hi], [1, C.wood.mid]]), stroke: OUT, line: LW }, 0.2);
  for (const [dx, dy] of [[-14, -32], [-4, -36], [8, -33], [16, -30], [2, -30]]) circle(ctx, x + dx, y + dy, 6, { fill: vGrad(ctx, y + dy - 6, y + dy + 6, [[0, C.yellow[3]], [1, C.yellow[1]]]), stroke: OUT, line: 1.8 });
  roundRect(ctx, x - 30, y - 30, 60, 32, 6, { fill: vGrad(ctx, y - 30, y + 2, [[0, C.wood.top], [1, C.wood.dark]]), stroke: OUT, line: LW });
  for (const dx of [-18, 18]) roundRect(ctx, x + dx - 4, y - 30, 8, 32, 2, { fill: C.yellow[2], stroke: OUT, line: 1.8 });
  roundRect(ctx, x - 6, y - 24, 12, 12, 3, { fill: C.yellow[2], stroke: OUT, line: 1.8 });
  circle(ctx, x, y - 18, 1.8, { fill: OUT });
  sparkle(ctx, x - 10, y - 50, 6, C.light.sparkle);
  sparkle(ctx, x + 18, y - 44, 4, C.light.sparkle);
}

export function lantern(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x, y + 2, 12, 3, { fill: 'rgba(60,40,20,0.2)' });
  roundRect(ctx, x - 3, y - 44, 6, 46, 3, { fill: C.wood.mid, stroke: OUT, line: 2 });
  roundRect(ctx, x - 13, y - 76, 26, 32, 8, { fill: vGrad(ctx, y - 76, y - 44, [[0, '#fff2b8'], [1, C.light.lamp]]), stroke: OUT, line: LW });
  smoothLine(ctx, [{ x: x - 4, y: y - 74 }, { x: x - 4, y: y - 46 }], 'rgba(67,54,43,0.6)', 1.6);
  smoothLine(ctx, [{ x: x + 4, y: y - 74 }, { x: x + 4, y: y - 46 }], 'rgba(67,54,43,0.6)', 1.6);
  roundRect(ctx, x - 15, y - 82, 30, 8, 4, { fill: C.metal.light, stroke: OUT, line: 2 });
  ctx.beginPath(); ctx.arc(x, y - 84, 6, Math.PI, 0); ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.stroke();
}

export function shell(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x, y + 2, 18, 4, { fill: 'rgba(60,40,20,0.2)' });
  ctx.beginPath(); ctx.moveTo(x - 18, y); ctx.quadraticCurveTo(x - 20, y - 26, x, y - 26); ctx.quadraticCurveTo(x + 20, y - 26, x + 18, y); ctx.closePath();
  ctx.fillStyle = vGrad(ctx, y - 26, y, [[0, C.pink[3]], [1, C.pink[2]]]); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.stroke();
  for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) smoothLine(ctx, [{ x: x + a * 2, y: y - 2 }, { x: x + Math.sin(a) * 16, y: y - 22 + Math.abs(a) * 6 }], 'rgba(154,61,107,0.55)', 1.6);
  roundRect(ctx, x - 6, y - 4, 12, 6, 3, { fill: C.pink[2], stroke: OUT, line: 2 });
  withAlpha(ctx, 0.8, () => ellipse(ctx, x - 7, y - 18, 3.5, 2, { fill: '#ffffff' }, -0.5));
}

export function castle(ctx: Ctx, x: number, y: number): void {
  const sand = (y0: number, y1: number): CanvasGradient => vGrad(ctx, y0, y1, [[0, '#fbe7b8'], [0.6, '#efcf93'], [1, '#d6ad6c']]);
  ellipse(ctx, x, y + 2, 34, 5, { fill: 'rgba(60,40,20,0.2)' });
  const tower = (cx: number, w: number, h: number): void => {
    const top = y - h;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.lineTo(cx - w / 2, top);
    const n = 3, step = w / (n * 2 - 1);
    for (let i = 0; i < n * 2 - 1; i++) {
      const x0 = cx - w / 2 + i * step;
      if (i % 2 === 0) { ctx.lineTo(x0, top - 6); ctx.lineTo(x0 + step, top - 6); } else { ctx.lineTo(x0, top); ctx.lineTo(x0 + step, top); }
    }
    ctx.lineTo(cx + w / 2, top - 6);
    ctx.lineTo(cx + w / 2, y);
    ctx.closePath();
    ctx.fillStyle = sand(top - 6, y); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();
  };
  tower(x - 18, 18, 34);
  tower(x + 18, 18, 30);
  tower(x, 24, 48);
  // flag
  smoothLine(ctx, [{ x, y: y - 54 }, { x, y: y - 72 }], OUT, 2);
  poly(ctx, [{ x, y: y - 72 }, { x: x + 13, y: y - 67 }, { x, y: y - 62 }], { fill: C.pink[2], stroke: OUT, line: 1.8 });
  // arched door + windows
  ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x - 6, y - 10); ctx.arc(x, y - 10, 6, Math.PI, 0); ctx.lineTo(x + 6, y); ctx.closePath();
  ctx.fillStyle = '#8a6a44'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  for (const [dx, dy] of [[0, -32], [-18, -20], [18, -18]]) roundRect(ctx, x + dx - 2.5, y + dy - 4, 5, 8, 2.5, { fill: '#8a6a44', stroke: OUT, line: 1.6 });
  for (const [dx, dy] of [[-22, -8], [12, -40], [22, -6], [-6, -24]]) withAlpha(ctx, 0.5, () => circle(ctx, x + dx, y + dy, 1.2, { fill: '#b98e55' }));
  withAlpha(ctx, 0.55, () => smoothLine(ctx, [{ x: x - 8, y: y - 44 }, { x: x - 8, y: y - 30 }], '#ffffff', 2));
}

export function bubblerStone(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x + 2, y + 2, 20, 4, { fill: 'rgba(60,40,20,0.2)' });
  blob(ctx, [{ x: x - 18, y }, { x: x - 14, y: y - 12 }, { x: x - 2, y: y - 17 }, { x: x + 12, y: y - 13 }, { x: x + 18, y }], { fill: vGrad(ctx, y - 17, y, [[0, C.gray[3]], [0.5, C.gray[2]], [1, C.gray[1]]]), stroke: OUT, line: 2.2 }, 0.45);
  for (const [dx, dy, r] of [[-7, -7, 2], [3, -10, 2.4], [9, -5, 1.6], [-1, -4, 1.4]]) circle(ctx, x + dx, y + dy, r, { fill: C.gray[1] });
  withAlpha(ctx, 0.7, () => ellipse(ctx, x - 6, y - 12, 5, 2, { fill: '#ffffff' }, -0.2));
}

export function mushrooms(ctx: Ctx, x: number, y: number): void {
  ellipse(ctx, x, y + 2, 26, 4, { fill: 'rgba(60,40,20,0.2)' });
  const one = (cx: number, h: number, r: number, ramp: readonly string[]): void => {
    roundRect(ctx, cx - 3.5, y - h, 7, h + 1, 3.5, { fill: vGrad(ctx, y - h, y, [[0, '#f5f1ff'], [1, '#c9c0e6']]), stroke: OUT, line: 2 });
    const top = y - h;
    ctx.beginPath();
    ctx.moveTo(cx - r, top + 2);
    ctx.quadraticCurveTo(cx - r, top - r * 1.1, cx, top - r * 1.1);
    ctx.quadraticCurveTo(cx + r, top - r * 1.1, cx + r, top + 2);
    ctx.quadraticCurveTo(cx, top - 2, cx - r, top + 2);
    ctx.closePath();
    ctx.fillStyle = vGrad(ctx, top - r * 1.1, top + 2, [[0, ramp[3]], [0.6, ramp[2]], [1, ramp[1]]]); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.stroke();
    for (const [dx, dy] of [[-0.45, -0.45], [0.2, -0.75], [0.5, -0.3]]) circle(ctx, cx + dx * r, top + dy * r, r * 0.13, { fill: '#effffb' });
  };
  one(x - 15, 16, 11, C.teal);
  one(x + 12, 26, 15, C.purple);
  one(x + 1, 10, 9, C.blue);
}

/** Where each decoration sits: x as a fraction of the width, y below the sand line. */
export const DECOR_SPOTS = {
  house: { fx: 0.2, dy: 60 },
  castle: { fx: 0.41, dy: 38 },
  lantern: { fx: 0.545, dy: 50 },
  coral: { fx: 0.65, dy: 30 },
  coral2: { fx: 0.595, dy: 106 },
  chest: { fx: 0.77, dy: 76 },
  shell: { fx: 0.44, dy: 100 },
  bubbler: { fx: 0.31, dy: 112 },
  mushrooms: { fx: 0.17, dy: 100 },
} as const;

// ---------- fish life: feeling bubbles, food flakes, sleepy z ----------

export type FeelKind = 'heart' | 'note' | 'smile' | 'sparkle' | 'zz';

function zGlyph(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x - s / 2, y - s / 2);
  ctx.lineTo(x + s / 2, y - s / 2);
  ctx.lineTo(x - s / 2, y + s / 2);
  ctx.lineTo(x + s / 2, y + s / 2);
  ctx.stroke();
}

/** A soft white speech bubble (36×36 box, centre 18,16) with a small vector feeling icon. */
export function feelingBubble(ctx: Ctx, kind: FeelKind): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const edge = 'rgba(32,52,84,0.3)';
  circle(ctx, 9.5, 31, 2.2, { fill: '#ffffff', stroke: edge, line: 1.1 });
  circle(ctx, 18, 16, 13, { fill: 'rgba(255,255,255,0.96)', stroke: edge, line: 1.3 });
  if (kind === 'heart') {
    ctx.beginPath();
    ctx.moveTo(18, 22.5);
    ctx.bezierCurveTo(9.5, 16.5, 11, 9.2, 15, 9.5);
    ctx.bezierCurveTo(16.7, 9.6, 17.6, 10.8, 18, 12.1);
    ctx.bezierCurveTo(18.4, 10.8, 19.3, 9.6, 21, 9.5);
    ctx.bezierCurveTo(25, 9.2, 26.5, 16.5, 18, 22.5);
    ctx.fillStyle = '#ff7896';
    ctx.fill();
    withAlpha(ctx, 0.85, () => ellipse(ctx, 14.6, 12.6, 1.7, 1.1, { fill: '#ffffff' }, -0.6));
  } else if (kind === 'note') {
    ctx.strokeStyle = '#5b7bd6';
    ctx.fillStyle = '#5b7bd6';
    ctx.lineWidth = 1.9;
    ellipse(ctx, 15.4, 20.4, 3.2, 2.4, { fill: '#5b7bd6' }, -0.4);
    ctx.beginPath();
    ctx.moveTo(18.3, 19.8);
    ctx.lineTo(18.3, 9.2);
    ctx.quadraticCurveTo(19.2, 12.6, 23.4, 13.6);
    ctx.stroke();
  } else if (kind === 'smile') {
    circle(ctx, 14.4, 13.4, 1.4, { fill: '#4b5a7a' });
    circle(ctx, 21.6, 13.4, 1.4, { fill: '#4b5a7a' });
    withAlpha(ctx, 0.45, () => { circle(ctx, 11.6, 17.4, 1.8, { fill: '#ff9aae' }); circle(ctx, 24.4, 17.4, 1.8, { fill: '#ff9aae' }); });
    ctx.strokeStyle = '#4b5a7a';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(18, 15.2, 4.6, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  } else if (kind === 'sparkle') {
    sparkle(ctx, 17, 17, 7.2, '#ffc93c');
    sparkle(ctx, 23.6, 10.2, 3.2, '#ffd970');
  } else {
    ctx.strokeStyle = '#7d8fd6';
    ctx.lineWidth = 1.8;
    zGlyph(ctx, 15.2, 18, 6.4);
    ctx.lineWidth = 1.5;
    zGlyph(ctx, 22.4, 11.2, 4.2);
  }
}

/** A tiny rising sleep bubble with a "z" (16×16 box). */
export function sleepZ(ctx: Ctx): void {
  circle(ctx, 8, 8, 6.6, { fill: 'rgba(255,255,255,0.55)', stroke: 'rgba(255,255,255,0.95)', line: 1 });
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7d8fd6';
  ctx.lineWidth = 1.4;
  zGlyph(ctx, 8, 8.2, 4.6);
}

export const FLAKE_COLORS: ReadonlyArray<readonly [string, string]> = [['#f4a25a', '#c46a2c'], ['#f3cb6a', '#bf9233'], ['#ec8996', '#b35a68']];

/** One food flake (12×12 box). */
export function foodFlake(ctx: Ctx, k: number): void {
  const [fill, edge] = FLAKE_COLORS[k % FLAKE_COLORS.length];
  const r = rng(11 + k * 5);
  const pts: Pt[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r() * 0.5;
    const d = 3.2 + r() * 1.6;
    pts.push({ x: 6 + Math.cos(a) * d, y: 6 + Math.sin(a) * d * 0.8 });
  }
  poly(ctx, pts, { fill, stroke: edge, line: 0.9 });
  withAlpha(ctx, 0.6, () => circle(ctx, 4.8, 4.8, 1, { fill: '#fff6dc' }));
}
