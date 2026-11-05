// The lake, z 200–231 (surface) and 233–259 (things on the water).
//   200 water.surface   cached gradient + sun/moon column + the soft shaft by the pier
//   204 water.shore     wobbling tree-line reflections and the pale shoreline
//   207 water.shadows   fish shadows under the surface              (water/life.ts)
//   210 water.marks     the picture's white chevron ripple marks
//   214 water.glints    twinkling sparkles in the sun or moon path
//   240 water.lilies    lily pads and flowers                       (water/life.ts)
//   244 water.frog      the frog on the big pad                      (water/life.ts)
//   250 water.jumper    a fish that leaps every 12–25 s              (water/life.ts)

import {
  Baked,
  C,
  clamp,
  css,
  hash1,
  lerp,
  linGrad,
  mix,
  smoothstep,
  sparkle,
  TAU,
  vGrad,
  wrap,
  type Layer,
  type LayerModule,
  type Scene,
} from '../engine';
import { fishShadowLayer, jumperLayer, lilyLayers } from './water/life';
import { Sprite, type Ctx } from './water/util';

/** How clear the sky is for reflections and glints (1 = sunny). */
function clearness(s: Scene): number {
  const w = s.weather;
  return (1 - w.cloud * 0.55) * (1 - w.fog * 0.75) * (1 - w.rain * 0.6);
}

/** Half-width of the sun/moon column at depth v (0 at the horizon, 1 at the bottom). */
const columnHalf = (s: Scene, v: number): number => lerp(12, 80, clamp(v / 0.8, 0, 1)) * s.u;

// ------------------------------------------------------------------ surface

/** A soft column of reflected light widening downward, painted as thin strips with sideways falloff. */
function column(c: Ctx, s: Scene, x: number, col: (a: number) => string, alpha: number, wk: number): void {
  const hz = s.layout.horizon;
  const y1 = lerp(hz, s.H, 0.8);
  const n = 36;
  const sh = (y1 - hz) / n;
  for (let i = 0; i < n; i++) {
    const v = (i + 0.5) / n;
    const a = alpha * (1 - smoothstep(0.25, 1, v)) * (0.85 + 0.15 * (1 - v));
    if (a < 0.003) continue;
    const hw = columnHalf(s, v * 0.8) * wk * 1.25;
    c.fillStyle = linGrad(c, x - hw, 0, x + hw, 0, [
      [0, col(0)],
      [0.3, col(a * 0.45)],
      [0.5, col(a)],
      [0.7, col(a * 0.45)],
      [1, col(0)],
    ]);
    c.fillRect(x - hw, hz + i * sh, hw * 2, sh + 0.5);
  }
}

function paintSurface(s: Scene, c: Ctx): void {
  const L = s.light;
  const hz = s.layout.horizon;
  const H = s.H;
  const f = (fy: number): number => (fy * H - hz) / (H - hz);
  // Dawn, sunset and night tint the far water with the horizon sky.
  const tint = clamp(L.golden * 0.4 + L.night * 0.22, 0, 0.5);
  const at = (col: string, k: number): string => css(k > 0.001 ? mix(s.grade(col), L.skyBot, k) : s.grade(col));
  c.fillStyle = vGrad(c, hz, H, [
    [0, at(C.water.horizon, tint)],
    [f(0.447), at(C.water.high, tint * 0.7)],
    [f(0.54), at(C.water.mid, tint * 0.3)],
    [f(0.62), at(C.water.mid, tint * 0.1)],
    [f(0.77), at(C.water.low, 0)],
    [f(0.9), at(C.water.deep, 0)],
    [1, at(C.water.deepest, 0)],
  ]);
  c.fillRect(0, hz, s.W, H - hz);

  const clear = clearness(s);

  // Sun column: pale cyan by day, warm at sunrise and sunset.
  const sunK = smoothstep(-0.03, 0.08, L.sun.alt) * L.daylight * clear;
  if (sunK > 0.02) {
    const sc = mix(s.grade(C.water.shaft), L.sunCol, L.golden * 0.65);
    column(c, s, L.sun.x, (a) => css(sc, a), 0.3 * sunK * (1 + L.golden * 0.5), 1 + L.golden * 0.25);
  }
  // Moon path at night (emitted light).
  const moonK = smoothstep(-0.02, 0.1, L.moon.alt) * L.night * clear;
  if (moonK > 0.02) {
    c.globalCompositeOperation = 'lighter';
    column(c, s, L.moon.x, (a) => s.raw(C.light.moon, a), 0.16 * moonK, 0.45);
    c.globalCompositeOperation = 'source-over';
  }

  // Faint diagonal shaft of light by the pier.
  const shK = L.daylight * clear;
  if (shK > 0.02) {
    const st = s.layout.stage;
    const X = (fx: number): number => st.x0 + fx * st.w;
    const y0 = 0.55 * H;
    const sh = s.grade(C.water.shaft);
    const n = 28;
    const sh2 = (H - y0) / n;
    for (let i = 0; i < n; i++) {
      const v = (i + 0.5) / n;
      const a = shK * lerp(0.03, 0.12, smoothstep(0, 0.35, v)) * (1 - v * 0.35);
      const cx = lerp(X(0.372), X(0.44), v);
      const hw = lerp(0.045, 0.085, v) * st.w;
      c.fillStyle = linGrad(c, cx - hw, 0, cx + hw, 0, [
        [0, css(sh, 0)],
        [0.5, css(sh, a)],
        [1, css(sh, 0)],
      ]);
      c.fillRect(cx - hw, y0 + i * sh2, hw * 2, sh2 + 0.5);
    }
  }
}

function surfaceLayer(): Layer {
  const baked = new Baked();
  return {
    id: 'water.surface',
    z: 200,
    draw(s, ctx) {
      const L = s.light;
      const w = s.weather;
      const hz = s.layout.horizon;
      const key = `${L.key}|${Math.round(L.sun.x / 2)}|${Math.round(L.moon.x / 2)}|${Math.round(w.cloud * 20)}|${Math.round(w.fog * 20)}|${Math.round(w.rain * 20)}`;
      baked.draw(ctx, key, { x: 0, y: hz, w: s.W, h: s.H - hz }, s.dpr, (c) => paintSurface(s, c));
      // Rain and storms darken the lake a little.
      const dark = w.rain * 0.13 + w.storm * 0.08;
      if (dark > 0.005) {
        ctx.fillStyle = s.colA(C.water.deepest, dark);
        ctx.fillRect(0, hz, s.W, s.H - hz);
      }
    },
  };
}

// ------------------------------------------------------------------ shore reflections

interface ShoreBlob {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

function shoreLayer(): Layer {
  const spr = new Sprite();
  let blobs: ShoreBlob[] = [];
  let bandH = 1;
  let pad = 0;
  return {
    id: 'water.shore',
    z: 204,
    resize(s) {
      const r = s.rng('water.shore');
      const u = s.u;
      bandH = Math.ceil(0.055 * s.H);
      pad = 12 * u;
      blobs = [];
      let x = -30 * u;
      while (x < s.W + 30 * u) {
        const rx = r.range(11, 27) * u;
        blobs.push({ x: x + rx, y: r.range(-1, 1.5) * u, rx, ry: r.range(0.4, 0.78) * bandH });
        if (r.chance(0.6)) {
          const rx2 = rx * r.range(0.45, 0.75);
          blobs.push({ x: x + rx * r.range(0.4, 1.7), y: r.range(0, 2.5) * u, rx: rx2, ry: r.range(0.45, 0.9) * bandH });
        }
        x += rx * r.range(1.35, 2.5);
      }
    },
    draw(s, ctx) {
      const u = s.u;
      const hz = s.layout.horizon;
      const dpr = s.dpr;
      const sw = s.W + pad * 2;
      const img = spr.get(`${s.light.key}`, sw, bandH, dpr, (c) => {
        c.fillStyle = vGrad(c, 0, bandH, [
          [0, s.colA(C.shore.reflect, 0.78)],
          [0.55, s.colA(C.shore.reflect, 0.55)],
          [1, s.colA(C.shore.reflect, 0.2)],
        ]);
        c.beginPath();
        for (const b of blobs) {
          c.moveTo(b.x + pad + b.rx, b.y);
          c.ellipse(b.x + pad, b.y, b.rx, b.ry, 0, 0, TAU);
        }
        c.fill();
      });
      // Draw in horizontal slices that sway out of step: the gentle wobble of a reflection. Four
      // slices, each swaying with the phase the old eight-slice wave had at its middle (j = 2i + 0.5).
      const n = 4;
      const sh = bandH / n;
      const k = s.reducedMotion ? 0.4 : 1;
      for (let i = 0; i < n; i++) {
        const j = 2 * i + 0.5;
        const v = j / (2 * n);
        const off = Math.sin(s.t * 0.85 + j * 1.25) * (0.5 + 2 * v) * u * k + Math.sin(s.t * 0.37 + j * 0.6) * 0.6 * u * k;
        const sy = Math.floor(i * sh * dpr);
        const sh2 = Math.min(img.height - sy, Math.ceil(sh * dpr) + 1);
        if (sh2 <= 0) continue;
        ctx.drawImage(img, 0, sy, img.width, sh2, -pad + off, hz + sy / dpr, img.width / dpr, sh2 / dpr);
      }
      // A thin pale line where the water meets the shore.
      ctx.fillStyle = s.colA(C.shore.foam, 0.85);
      ctx.fillRect(0, hz, s.W, 1.4 * u);
      ctx.fillStyle = s.colA(C.shore.haze, 0.3);
      ctx.fillRect(0, hz + 1.4 * u, s.W, 2.4 * u);
    },
  };
}

// ------------------------------------------------------------------ ripple marks

interface Mark {
  x0: number;
  y: number;
  len: number;
  h: number;
  sk: number;
  a: number;
  dim: number;
  per: number;
  ph: number;
  /** 0 at the horizon → 1 at the bottom. */
  k: number;
  wb: number;
  id: number;
}

const WB = 6; // line-width buckets
const AB = 6; // alpha buckets

function marksLayer(): Layer {
  let marks: Mark[] = [];
  let xmin = 0;
  let span = 1;
  let drift = 0;
  let clock = 0;
  let mx = new Float32Array(0);
  let my = new Float32Array(0);
  let ml = new Float32Array(0);
  let mh = new Float32Array(0);
  // Marks are batched into one stroke per (width, alpha, color) bucket.
  const buckets: number[][] = Array.from({ length: WB * (AB + 1) * 2 }, () => []);
  return {
    id: 'water.marks',
    z: 210,
    resize(s) {
      const r = s.rng('water.marks');
      const u = s.u;
      const hz = s.layout.horizon;
      const H = s.H;
      xmin = -40 * u;
      span = s.W + 80 * u;
      marks = [];
      let y = hz + 0.05 * s.H;
      let id = 0;
      while (y < H + 4 * u) {
        const k = clamp((y - hz) / (H - hz), 0, 1);
        const len = lerp(13, 32, k) * u;
        const gap = lerp(13, 33, k) * u;
        let x = xmin + r.range(0, len * 4);
        while (x < xmin + span) {
          const l = len * r.range(0.75, 1.3);
          marks.push({
            x0: x,
            y: y + r.range(-0.2, 0.2) * gap,
            len: l,
            h: l * r.range(0.1, 0.16),
            sk: r.range(-0.14, 0.14),
            a: r.range(0.58, 0.8),
            dim: r.chance(0.28) ? 1 : 0,
            per: r.range(5, 10),
            ph: r.next(),
            k,
            wb: Math.min(WB - 1, Math.floor(k * WB)),
            id: id++,
          });
          x += l * r.range(3.6, 6.4) + r.range(4, 10) * u;
        }
        y += gap * r.range(0.85, 1.15);
      }
      const n = marks.length;
      mx = new Float32Array(n);
      my = new Float32Array(n);
      ml = new Float32Array(n);
      mh = new Float32Array(n);
    },
    update(s, dt) {
      const w = s.weather;
      drift += dt * (1.3 + w.wind * 9 + w.storm * 7);
      clock += dt * (1 + w.rain * 0.7 + w.storm * 0.5);
    },
    draw(s, ctx) {
      const u = s.u;
      const w = s.weather;
      const chop = 1 + w.rain * 0.8 + w.storm * 0.7;
      const env = (1 - w.fog * 0.45) * (1 - s.light.night * 0.25);
      const t = s.t;
      for (const b of buckets) b.length = 0;
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i];
        const cyc = clock / m.per + m.ph;
        const n = Math.floor(cyc);
        const f = cyc - n;
        const vis = smoothstep(0, 0.25, f) * (1 - smoothstep(0.7, 1, f));
        const a = m.a * vis * env * (1 - w.fog * 0.5 * (1 - m.k));
        const ab = Math.round(a * AB);
        if (ab <= 0) continue;
        const jx = (hash1(n, m.id) - 0.5) * m.len * 1.4;
        const pk = 0.4 + 0.6 * m.k;
        const sway = Math.sin(t * 0.45 + m.ph * TAU) * 1.4 * u * pk;
        mx[i] = xmin + wrap(m.x0 + jx + sway + drift * u * pk - xmin, span);
        my[i] = m.y + Math.sin(t * (0.6 + 0.9 * w.rain) + m.id * 1.7) * 0.5 * u * pk * chop;
        ml[i] = m.len * (0.8 + 0.2 * vis) * 0.5;
        mh[i] = m.h * chop * (0.85 + 0.15 * Math.sin(t * 0.8 + m.id));
        buckets[(m.wb * (AB + 1) + ab) * 2 + m.dim].push(i);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const cols = [s.col(C.water.ripple), s.col(C.water.rippleDim)];
      for (let wb = 0; wb < WB; wb++) {
        ctx.lineWidth = lerp(1.1, 2.7, (wb + 0.5) / WB) * u;
        for (let ab = 1; ab <= AB; ab++) {
          for (let d = 0; d < 2; d++) {
            const list = buckets[(wb * (AB + 1) + ab) * 2 + d];
            if (!list.length) continue;
            ctx.globalAlpha = ab / AB;
            ctx.strokeStyle = cols[d];
            ctx.beginPath();
            // A flattened chevron: two straight arms with a round join, like a wide shallow "^".
            for (const i of list) {
              const l = ml[i];
              const x = mx[i];
              const y = my[i];
              const h = mh[i];
              ctx.moveTo(x - l, y);
              ctx.lineTo(x + marks[i].sk * l * 2, y - h);
              ctx.lineTo(x + l, y + h * 0.12);
            }
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  };
}

// ------------------------------------------------------------------ glints

interface Glint {
  ox: number;
  v: number;
  per: number;
  ph: number;
  sz: number;
  /** Scattered across the stage rather than in the light column. */
  free: boolean;
  fx: number;
}

function glintLayer(): Layer {
  let glints: Glint[] = [];
  return {
    id: 'water.glints',
    z: 214,
    resize(s) {
      const r = s.rng('water.glints');
      glints = [];
      for (let i = 0; i < 18; i++) {
        const free = i >= 12;
        glints.push({
          ox: r.range(-0.8, 0.8),
          v: free ? r.range(0.12, 0.6) : r.range(0.02, 0.55),
          per: r.range(1.6, 3.6),
          ph: r.next(),
          sz: free ? r.range(1.6, 2.6) : r.range(2, 3.6),
          free,
          fx: r.range(0.05, 0.95),
        });
      }
    },
    draw(s, ctx) {
      const L = s.light;
      const clear = clearness(s);
      const sunK = smoothstep(-0.03, 0.08, L.sun.alt) * L.daylight * clear;
      const moonK = smoothstep(-0.02, 0.1, L.moon.alt) * L.night * clear * 0.75;
      if (sunK < 0.03 && moonK < 0.03) return;
      const useSun = sunK >= moonK;
      const K = useSun ? sunK : moonK;
      const cx = useSun ? L.sun.x : L.moon.x;
      const col = useSun ? s.raw(mix(C.light.sparkle, L.sunCol, L.golden * 0.6)) : s.raw(C.light.moon);
      const hz = s.layout.horizon;
      const st = s.layout.stage;
      const u = s.u;
      // Drawn source-over (no composite switch). The alpha boost stands in for the additive blend's
      // extra brightness: strong over the bright day water, small over the dark night water.
      const boost = lerp(1.2, 1.7, L.daylight);
      for (let i = 0; i < glints.length; i++) {
        const g = glints[i];
        if (g.free && !useSun) continue;
        const cyc = s.t / g.per + g.ph;
        const n = Math.floor(cyc);
        const f = cyc - n;
        const tw = Math.pow(Math.sin(Math.PI * f), 3);
        if (tw < 0.05) continue;
        const v = clamp(g.v + (hash1(n, i * 31) - 0.5) * 0.08, 0.01, 0.9);
        const y = hz + v * (s.H - hz);
        const x = g.free
          ? st.x0 + st.w * wrap(g.fx + (hash1(n, i * 17) - 0.5) * 0.2, 1)
          : cx + (g.ox + (hash1(n, i * 7) - 0.5) * 0.3) * columnHalf(s, v) * (useSun ? 0.8 : 0.45);
        const k = s.persp(y);
        ctx.globalAlpha = clamp(tw * K * (g.free ? 0.7 : 1) * boost, 0, 1);
        sparkle(ctx, x, y, g.sz * u * k * (0.6 + 0.4 * tw) * 1.6, col);
      }
      ctx.globalAlpha = 1;
    },
  };
}

// ------------------------------------------------------------------ module

const water: LayerModule = () => [
  surfaceLayer(),
  shoreLayer(),
  fishShadowLayer(),
  marksLayer(),
  glintLayer(),
  ...lilyLayers(),
  jumperLayer(),
];

export default water;
