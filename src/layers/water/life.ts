// Living things on and under the lake: fish shadows, lily pads and flowers, the frog on the big
// pad, and a cartoon fish that leaps out of open water every 12–25 s.

import { C, clamp, ellipse, mix, TAU, type Layer, type Rng, type RGB, type Scene } from '../../engine';
import { angleDiff, bobberPos, inPier, inReeds, nearFisher, roamSpan, Sprite, type Ctx } from './util';

// ------------------------------------------------------------------ fish shadows

interface Shadow {
  x: number;
  y: number;
  /** Heading in the water plane (vertical distances count 2.2× for perspective). */
  a: number;
  sp: number;
  tx: number;
  ty: number;
  len: number;
  ph: number;
  timer: number;
}

const PLANE = 2.2;

export function fishShadowLayer(): Layer {
  let fish: Shadow[] = [];
  let rng: Rng | null = null;

  const ok = (s: Scene, x: number, y: number): boolean => {
    const u = s.u;
    const [x0, x1] = roamSpan(s, 0.3);
    return (
      y >= 0.47 * s.H &&
      y <= 0.7 * s.H &&
      x >= x0 &&
      x <= x1 &&
      !inPier(s, x, y, 26 * u) &&
      !inReeds(s, x, y, 24 * u) &&
      !nearFisher(s, x, y, 12 * u)
    );
  };

  const pick = (s: Scene, f: Shadow): void => {
    const r = rng!;
    const [x0, x1] = roamSpan(s, 0.3);
    for (let i = 0; i < 40; i++) {
      const x = r.range(x0, x1);
      const y = r.range(0.47 * s.H, 0.7 * s.H);
      if (ok(s, x, y) && Math.hypot(x - f.x, (y - f.y) * PLANE) > 70 * s.u) {
        f.tx = x;
        f.ty = y;
        f.timer = r.range(9, 18);
        return;
      }
    }
    f.timer = 2;
  };

  return {
    id: 'water.shadows',
    z: 207,
    resize(s) {
      rng = s.rng('water.shadows');
      const r = rng;
      const n = s.W > 700 ? 4 : 3;
      const [x0, x1] = roamSpan(s, 0.3);
      fish = [];
      for (let i = 0; i < n; i++) {
        let x = s.layout.stage.x0 + s.layout.stage.w * 0.6;
        let y = 0.55 * s.H;
        for (let j = 0; j < 80; j++) {
          const cx = r.range(x0, x1);
          const cy = r.range(0.47 * s.H, 0.7 * s.H);
          if (ok(s, cx, cy)) {
            x = cx;
            y = cy;
            break;
          }
        }
        const f: Shadow = { x, y, a: r.chance(0.5) ? 0 : Math.PI, sp: r.range(9, 15), tx: x, ty: y, len: r.range(22, 30), ph: r.range(0, TAU), timer: 0 };
        pick(s, f);
        fish.push(f);
      }
    },
    update(s, dt) {
      const u = s.u;
      for (const f of fish) {
        f.timer -= dt;
        let dx = f.tx - f.x;
        let dy = (f.ty - f.y) * PLANE;
        if (f.timer <= 0 || dx * dx + dy * dy < (14 * u) ** 2) {
          pick(s, f);
          dx = f.tx - f.x;
          dy = (f.ty - f.y) * PLANE;
        }
        const want = Math.atan2(dy, dx);
        const turn = 0.75 * dt;
        f.a += clamp(angleDiff(f.a, want), -turn, turn);
        const sp = f.sp * u * s.persp(f.y) * (0.75 + 0.25 * Math.sin(s.t * 0.7 + f.ph));
        const nx = f.x + Math.cos(f.a) * sp * dt;
        const ny = f.y + (Math.sin(f.a) * sp * dt) / PLANE;
        if (ok(s, nx, ny) || !ok(s, f.x, f.y)) {
          f.x = nx;
          f.y = ny;
        } else if (f.timer > 1.5) {
          // Blocked by the pier or the reeds: choose somewhere else and turn toward it.
          pick(s, f);
        }
      }
    },
    draw(s, ctx) {
      const w = s.weather;
      const alpha = 0.7 * (1 - w.fog * 0.6) * (1 - w.rain * 0.3);
      if (alpha < 0.02) return;
      ctx.fillStyle = s.col(C.water.shadow);
      ctx.globalAlpha = alpha;
      for (const f of fish) {
        const L = f.len * s.u * s.persp(f.y);
        const cx = Math.cos(f.a);
        const sx = (cx < 0 ? -1 : 1) * (0.3 + 0.7 * Math.abs(cx));
        const wag = Math.sin(s.t * 3.1 + f.ph) * 0.1 * L;
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(sx, 1);
        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.5, L * 0.17, 0, 0, TAU);
        ctx.moveTo(-L * 0.4, 0);
        ctx.lineTo(-L * 0.72, -L * 0.17 + wag);
        ctx.quadraticCurveTo(-L * 0.62, wag * 0.5, -L * 0.72, L * 0.17 + wag);
        ctx.closePath();
        ctx.moveTo(-L * 0.05, -L * 0.14);
        ctx.quadraticCurveTo(-L * 0.15, -L * 0.3, -L * 0.25, -L * 0.13);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  };
}

// ------------------------------------------------------------------ lily pads and the frog

interface Pad {
  x: number;
  y: number;
  r: number;
  flower: boolean;
  frog: boolean;
  ph: number;
  notch: number;
  /** Flower position on the pad as a fraction of r. */
  fx: number;
  next: number;
  /** This frame's bob offset (the frog rides on it). */
  dx: number;
  dy: number;
  sw: number;
  sh: number;
  ox: number;
  oy: number;
}

const padRy = (r: number): number => r * 0.4;
const padThick = (s: Scene, r: number): number => Math.max(1.3 * s.u, r * 0.13);
const padLine = (s: Scene, r: number): number => clamp(r * 0.085, 0.9 * s.u, 2.2 * s.u);

function padPath(c: Ctx, x: number, y: number, rx: number, ry: number, notch: number): void {
  c.beginPath();
  c.moveTo(x, y);
  c.ellipse(x, y, rx, ry, 0, notch + 0.3, notch - 0.3 + TAU);
  c.closePath();
}

function paintFlower(s: Scene, c: Ctx, x: number, y: number, fr: number, lw: number): void {
  const sq = 0.66;
  const cs: Array<[number, number]> = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 5 + 0.3;
    cs.push([x + Math.cos(a) * fr * 0.55, y + Math.sin(a) * fr * 0.55 * sq]);
  }
  c.beginPath();
  for (const [px, py] of cs) {
    c.moveTo(px + fr * 0.46, py);
    c.ellipse(px, py, fr * 0.46, fr * 0.4, 0, 0, TAU);
  }
  c.fillStyle = s.col(C.lily.flower);
  c.fill();
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.strokeStyle = s.col(C.outline);
  c.stroke();
  // Lighter petal tops, drawn over the outline joins so the bloom reads as one soft flower.
  c.fillStyle = s.col(C.lily.flowerHi);
  for (const [px, py] of cs) ellipse(c, px - fr * 0.06, py - fr * 0.08, fr * 0.24, fr * 0.17, { fill: c.fillStyle });
  ellipse(c, x, y - fr * 0.02, fr * 0.24, fr * 0.19, { fill: s.col(C.lily.center), stroke: s.col(C.outline), line: lw * 0.8 });
  ellipse(c, x - fr * 0.07, y - fr * 0.07, fr * 0.07, fr * 0.05, { fill: s.colA(C.white, 0.85) });
}

function paintPad(s: Scene, c: Ctx, p: Pad): void {
  const r = p.r;
  const ry = padRy(r);
  const th = padThick(s, r);
  const lw = padLine(s, r);
  const x = p.ox;
  const y = p.oy;
  const ol = s.col(C.outline);
  // Underside rim, then the top surface.
  padPath(c, x, y + th, r, ry, p.notch);
  c.fillStyle = s.col(C.lily.padDark);
  c.fill();
  c.strokeStyle = ol;
  c.lineWidth = lw;
  c.lineJoin = 'round';
  c.stroke();
  padPath(c, x, y, r, ry, p.notch);
  c.fillStyle = s.col(C.lily.pad);
  c.fill();
  c.save();
  c.clip();
  ellipse(c, x - r * 0.1, y - ry * 0.2, r * 0.86, ry * 0.72, { fill: s.col(C.lily.padHi) });
  // Veins from the notch point.
  c.strokeStyle = s.colA(C.lily.padDark, 0.5);
  c.lineWidth = Math.max(0.6 * s.u, lw * 0.5);
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = p.notch + 0.9 + i * ((TAU - 1.8) / 4);
    c.moveTo(x + Math.cos(a) * r * 0.18, y + Math.sin(a) * ry * 0.18);
    c.lineTo(x + Math.cos(a) * r * 0.72, y + Math.sin(a) * ry * 0.72);
  }
  c.stroke();
  c.restore();
  padPath(c, x, y, r, ry, p.notch);
  c.strokeStyle = ol;
  c.lineWidth = lw;
  c.stroke();
  ellipse(c, x - r * 0.46, y - ry * 0.42, r * 0.15, ry * 0.13, { fill: s.colA(C.white, 0.55) }, -0.15);
  if (p.flower) {
    const fr = clamp(r * 0.42, 3.2 * s.u, 8 * s.u);
    paintFlower(s, c, x + p.fx * r, y - ry * 0.12, fr, Math.max(0.8 * s.u, lw * 0.75));
  }
}

/** Frog colors from the green and yellow ramps. */
function drawFrog(s: Scene, ctx: Ctx, x: number, y: number, S: number): void {
  const t = s.t;
  const u = s.u;
  const lw = clamp(S * 0.15, 1.1 * u, 1.8 * u);
  const ol = s.col(C.outline);
  const body = s.col(C.green[2]);
  const dark = s.col(C.green[1]);
  const belly = s.col(mix(C.green[3], C.yellow[3], 0.55) as RGB);
  const breathe = 1 + 0.035 * Math.sin(t * 2.3);
  // Blink every few seconds (never in sync with the breath).
  const bc = (t + 0.7) % 4.3;
  const blink = bc < 0.14 || (bc > 0.32 && bc < 0.44 && Math.floor((t + 0.7) / 4.3) % 3 === 1);
  // Throat puff: a soft double inflate every ~9 s.
  const pc = (t + 3) % 9.2;
  const puff = pc < 1.8 ? Math.pow(Math.sin((pc / 1.8) * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 1.5) : 0;

  const P = { fill: body, stroke: ol, line: lw };
  // Haunches.
  ellipse(ctx, x - S * 0.62, y - S * 0.26, S * 0.4, S * 0.27, { fill: dark, stroke: ol, line: lw }, -0.2);
  ellipse(ctx, x + S * 0.62, y - S * 0.26, S * 0.4, S * 0.27, { fill: dark, stroke: ol, line: lw }, 0.2);
  // Body (a soft dome that breathes).
  const by = y - S * 0.48 * breathe;
  ellipse(ctx, x, by, S * 0.7, S * 0.5 * breathe, P);
  // Eye bumps.
  const ey = y - S * 0.92 * breathe;
  for (const sgn of [-1, 1]) ellipse(ctx, x + sgn * S * 0.36, ey, S * 0.25, S * 0.23, P);
  // Re-fill the join between head and eye bumps so the outline only runs round the silhouette.
  ellipse(ctx, x, by - S * 0.12, S * 0.52, S * 0.3, { fill: body });
  ellipse(ctx, x - S * 0.24, by - S * 0.3, S * 0.13, S * 0.06, { fill: s.col(C.green[3]) }, -0.3);
  // Belly and throat.
  ellipse(ctx, x, y - S * 0.3, S * 0.42, S * 0.25, { fill: belly });
  if (puff > 0.02) {
    const pr = S * (0.16 + 0.2 * puff);
    ellipse(ctx, x, y - S * 0.36, pr * 1.2, pr, { fill: s.col(mix(C.yellow[3], C.white, 0.45) as RGB), stroke: ol, line: lw * 0.7 });
    ellipse(ctx, x - pr * 0.4, y - S * 0.36 - pr * 0.35, pr * 0.28, pr * 0.18, { fill: s.colA(C.white, 0.8) });
  }
  // Front feet.
  for (const sgn of [-1, 1]) ellipse(ctx, x + sgn * S * 0.3, y - S * 0.03, S * 0.17, S * 0.08, P);
  // Eyes.
  for (const sgn of [-1, 1]) {
    const ex = x + sgn * S * 0.36;
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(ex - S * 0.14, ey + S * 0.01);
      ctx.quadraticCurveTo(ex, ey + S * 0.08, ex + S * 0.14, ey + S * 0.01);
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw * 0.9;
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      ellipse(ctx, ex, ey, S * 0.16, S * 0.16, { fill: s.col(C.white) });
      ellipse(ctx, ex + sgn * S * 0.02, ey + S * 0.02, S * 0.09, S * 0.1, { fill: s.col(C.ink) });
      ellipse(ctx, ex - S * 0.03, ey - S * 0.05, S * 0.035, S * 0.035, { fill: s.col(C.white) });
    }
  }
  // Smile and cheeks.
  ctx.beginPath();
  ctx.moveTo(x - S * 0.26, by - S * 0.08);
  ctx.quadraticCurveTo(x, by + S * 0.06, x + S * 0.26, by - S * 0.08);
  ctx.strokeStyle = ol;
  ctx.lineWidth = lw * 0.75;
  ctx.lineCap = 'round';
  ctx.stroke();
  for (const sgn of [-1, 1]) ellipse(ctx, x + sgn * S * 0.42, by - S * 0.04, S * 0.09, S * 0.05, { fill: s.colA(C.pink[2], 0.6) });
}

export function lilyLayers(): Layer[] {
  let pads: Pad[] = [];
  // All pads share one atlas canvas: one big (GPU-backed) image instead of many tiny ones,
  // which Chromium would re-upload every frame.
  const atlas = new Sprite();
  let slots: number[] = [];
  let atlasDpr = 0;
  let aw = 1;
  let ah = 1;
  const layoutAtlas = (dpr: number): void => {
    slots = [];
    let x = 0;
    let hMax = 0;
    for (const p of pads) {
      slots.push(x);
      x += Math.ceil(p.sw * dpr) + 2;
      hMax = Math.max(hMax, Math.ceil(p.sh * dpr));
    }
    aw = Math.max(x + 2, 256) / dpr;
    ah = Math.max(hMax + 2, 136) / dpr;
    atlasDpr = dpr;
  };

  const makePad = (s: Scene, x: number, y: number, r: number, flower: boolean, rng: Rng, frog = false): Pad => {
    const u = s.u;
    const sw = r * 2 + 10 * u;
    const sh = r * 1.75 + 10 * u;
    const notches = [0.5, 0.85, 2.3, 2.65, -0.5];
    return {
      x,
      y,
      r,
      flower,
      frog,
      ph: rng.range(0, TAU),
      notch: frog ? 0.55 : rng.pick(notches) + rng.range(-0.15, 0.15),
      fx: frog ? 0.42 : rng.range(-0.25, 0.2),
      next: rng.range(1.5, 8),
      dx: 0,
      dy: 0,
      sw,
      sh,
      ox: sw / 2,
      oy: sh - (padRy(r) + padThick(s, r) + padLine(s, r) + 3 * u),
    };
  };

  const lilies: Layer = {
    id: 'water.lilies',
    z: 240,
    resize(s) {
      const rng = s.rng('water.lilies');
      const u = s.u;
      pads = s.layout.lilies.map((l, i) => makePad(s, l.x, l.y, l.r, l.flower, rng, i === 4));
      atlasDpr = 0;
      // Wide screens: a few more pads on the open water beside the stage.
      const st = s.layout.stage;
      const side = st.x0;
      if (side > 40 * u) {
        const want = side > 240 * u ? 4 : side > 120 * u ? 3 : 2;
        let tries = 0;
        let added = 0;
        while (added < want && tries++ < 120) {
          const left = added % 2 === 0;
          const x = left ? rng.range(Math.max(20 * u, st.x0 - side * 0.9), st.x0 - 24 * u) : rng.range(st.x0 + st.w + 24 * u, Math.min(s.W - 20 * u, st.x0 + st.w + side * 0.9));
          const y = rng.range(0.46, 0.74) * s.H;
          const k = s.persp(y);
          const r = rng.range(9, 17) * u * k;
          if (inPier(s, x, y, r + 14 * u) || inReeds(s, x, y, r + 10 * u)) continue;
          if (pads.some((p) => Math.abs(p.x - x) < (p.r + r) * 1.6 && Math.abs(p.y - y) < (p.r + r) * 0.9)) continue;
          pads.push(makePad(s, x, y, r, rng.chance(0.5), rng));
          added++;
        }
      }
    },
    update(s, dt) {
      for (const p of pads) {
        p.next -= dt;
        if (p.next > 0) continue;
        const k = s.persp(p.y);
        const rr = s.rng(`lily${p.x | 0}|${Math.floor(s.t)}`);
        if (rr.chance(0.6)) s.ripple(p.x, p.y + padRy(p.r) * 0.3, { maxR: (p.r * 1.7) / k, life: 2.2, strength: 0.4 });
        else s.ripple(p.x + rr.sign() * p.r * rr.range(0.9, 1.15), p.y + padRy(p.r) * 0.5, { maxR: (5 + p.r / s.u * 0.25) * s.u, life: 1.3, strength: 0.55 });
        p.next = rr.range(5, 11);
      }
    },
    draw(s, ctx) {
      const u = s.u;
      const dpr = s.dpr;
      if (atlasDpr !== dpr || slots.length !== pads.length) layoutAtlas(dpr);
      const img = atlas.get(`${s.light.key}|${pads.length}`, aw, ah, dpr, (c) => {
        for (let i = 0; i < pads.length; i++) {
          c.save();
          c.translate(slots[i] / dpr, 0);
          paintPad(s, c, pads[i]);
          c.restore();
        }
      });
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const k = s.persp(p.y);
        p.dy = Math.sin(s.t * 1.2 + p.ph) * 0.75 * u * (0.5 + 0.5 * k);
        p.dx = Math.sin(s.t * 0.55 + p.ph * 1.7) * 0.6 * u + s.weather.wind * 0.6 * u * Math.sin(s.t * 0.9 + p.ph);
        const sq = 1 + 0.025 * Math.sin(s.t * 1.2 + p.ph + 1.2);
        const swd = Math.ceil(p.sw * dpr);
        const shd = Math.ceil(p.sh * dpr);
        ctx.drawImage(img, slots[i], 0, swd, shd, p.x - p.ox + p.dx, p.y - p.oy * sq + p.dy, swd / dpr, (shd / dpr) * sq);
      }
    },
  };

  const frog: Layer = {
    id: 'water.frog',
    z: 244,
    draw(s, ctx) {
      const p = pads.find((q) => q.frog);
      if (!p) return;
      const S = clamp(p.r * 0.5, 5 * s.u, 14 * s.u);
      drawFrog(s, ctx, p.x - p.r * 0.2 + p.dx, p.y + padRy(p.r) * 0.25 + p.dy, S);
    },
  };

  return [lilies, frog];
}

// ------------------------------------------------------------------ jumping fish

interface Jump {
  x0: number;
  y0: number;
  dir: 1 | -1;
  t: number;
  dur: number;
  h: number;
  dx: number;
  len: number;
  ramp: readonly string[];
}

export function jumperLayer(): Layer {
  let rng: Rng | null = null;
  let next = 6;
  let jump: Jump | null = null;
  const ramps = [C.orange, C.teal, C.blue, C.pink] as const;

  const clearOf = (s: Scene, x: number, y: number): boolean => {
    const u = s.u;
    const b = bobberPos(s);
    if (Math.hypot(x - b.x, (y - b.y) * 1.6) < 60 * u) return false;
    if (inPier(s, x, y, 34 * u) || inReeds(s, x, y, 30 * u) || nearFisher(s, x, y, 30 * u)) return false;
    for (const l of s.layout.lilies) if (Math.hypot(x - l.x, (y - l.y) * 2) < l.r + 22 * u) return false;
    return true;
  };

  const start = (s: Scene): boolean => {
    const r = rng!;
    const [x0, x1] = roamSpan(s, 0.25);
    for (let i = 0; i < 40; i++) {
      const x = r.range(x0, x1);
      const y = r.range(0.47, 0.76) * s.H;
      const k = s.persp(y);
      const dir = r.sign();
      const dx = dir * r.range(30, 42) * s.u * k;
      if (!clearOf(s, x, y) || !clearOf(s, x + dx, y) || !clearOf(s, x + dx / 2, y)) continue;
      if (x + dx < x0 || x + dx > x1) continue;
      jump = { x0: x, y0: y, dir, t: 0, dur: r.range(1, 1.25), h: r.range(26, 36) * s.u * k, dx, len: r.range(22, 28) * s.u * k, ramp: r.pick(ramps) };
      s.splash(x, y, { count: 6, power: 85, ripple: 16 * s.u });
      return true;
    }
    return false;
  };

  return {
    id: 'water.jumper',
    z: 250,
    resize(s) {
      rng = s.rng('water.jumper');
      jump = null;
      next = rng.range(4, 8);
    },
    update(s, dt) {
      if (jump) {
        jump.t += dt;
        if (jump.t >= jump.dur) {
          s.splash(jump.x0 + jump.dx, jump.y0, { count: 10, power: 115, ripple: 24 * s.u });
          jump = null;
          next = rng!.range(12, 25);
        }
        return;
      }
      next -= dt;
      if (next <= 0 && !start(s)) next = 2;
    },
    draw(s, ctx) {
      const j = jump;
      if (!j) return;
      const p = j.t / j.dur;
      const x = j.x0 + j.dx * p;
      const y = j.y0 - j.h * 4 * p * (1 - p);
      const vy = -j.h * 4 * (1 - 2 * p);
      const ang = Math.atan2(vy, Math.abs(j.dx));
      const L = j.len;
      const u = s.u;
      const lw = clamp(L * 0.07, 1.2 * u, 2 * u);
      const ol = s.col(C.outline);
      // Only the part above the waterline shows.
      ctx.beginPath();
      ctx.rect(x - L * 2, j.y0 - j.h - L * 2, L * 4, j.h + L * 2 + 0.6 * u);
      ctx.clip();
      ctx.translate(x, y);
      ctx.scale(j.dir, 1);
      ctx.rotate(ang);
      const flick = Math.sin(s.t * 22) * 0.12;
      // Tail.
      ctx.save();
      ctx.translate(-L * 0.36, 0);
      ctx.rotate(flick);
      ctx.beginPath();
      ctx.moveTo(L * 0.04, 0);
      ctx.quadraticCurveTo(-L * 0.12, -L * 0.1, -L * 0.24, -L * 0.22);
      ctx.quadraticCurveTo(-L * 0.17, 0, -L * 0.24, L * 0.22);
      ctx.quadraticCurveTo(-L * 0.12, L * 0.1, L * 0.04, 0);
      ctx.closePath();
      ctx.fillStyle = s.col(j.ramp[1]);
      ctx.fill();
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
      // Dorsal fin.
      ctx.beginPath();
      ctx.moveTo(-L * 0.12, -L * 0.17);
      ctx.quadraticCurveTo(-L * 0.02, -L * 0.36, L * 0.14, -L * 0.17);
      ctx.closePath();
      ctx.fillStyle = s.col(j.ramp[1]);
      ctx.fill();
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw;
      ctx.stroke();
      // Body with a lighter belly.
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.42, L * 0.2, 0, 0, TAU);
      ctx.fillStyle = s.col(j.ramp[2]);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ellipse(ctx, L * 0.02, L * 0.14, L * 0.4, L * 0.12, { fill: s.col(j.ramp[3]) });
      ellipse(ctx, -L * 0.06, -L * 0.1, L * 0.2, L * 0.045, { fill: s.colA(C.white, 0.5) });
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.42, L * 0.2, 0, 0, TAU);
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw;
      ctx.stroke();
      // Side fin, gill and eye.
      ellipse(ctx, -L * 0.02, L * 0.06, L * 0.08, L * 0.04, { fill: s.col(j.ramp[1]), stroke: ol, line: lw * 0.7 }, 0.5);
      ctx.beginPath();
      ctx.moveTo(L * 0.18, -L * 0.1);
      ctx.quadraticCurveTo(L * 0.13, 0, L * 0.18, L * 0.1);
      ctx.strokeStyle = ol;
      ctx.lineWidth = lw * 0.6;
      ctx.lineCap = 'round';
      ctx.stroke();
      ellipse(ctx, L * 0.27, -L * 0.04, L * 0.055, L * 0.055, { fill: s.col(C.white) });
      ellipse(ctx, L * 0.285, -L * 0.035, L * 0.03, L * 0.032, { fill: s.col(C.ink) });
    },
  };
}
