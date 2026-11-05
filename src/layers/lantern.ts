// Lantern: a small brass-and-iron lantern hanging from a wooden piling beside the pier, in front of
// the cat. It is barely lit by day and becomes the warm heart of the scene at dusk and night.
//
// Layers (all ids prefixed 'lantern.'):
//   lantern.water   z 260  warm pool + flickering reflection streak on the water beside the pier
//   lantern.pool    z 331  warm light pool on the planks (clipped to the deck), under the cat/bucket
//   lantern.lamp    z 343  the piling, iron bracket and the swaying lantern (flame, lit glass)
//   lantern.core    z 344  bright glow around the glass + moths circling at night
//   lantern.halo    z 405  big soft halo, drawn over the fog so fog scatters it into a large bloom
//   lantern.drops   z 425  a few rain streaks caught in the lamp light (over the rain layer)
//
// Publishes s.shared.lantern = { x, y, lit, sprite } (glass centre in CSS px, 0..1 light incl. flicker,
// and the cached glow sprite) so the fisher can rim-light the cat.
// All glows use two offscreen radial sprites built once at start-up: no gradients are rebuilt per frame.

import {
  Baked,
  C,
  TAU,
  clamp,
  css,
  ctx2d,
  ellipse,
  lerp,
  makeCanvas,
  mix,
  noise1,
  rgb,
  roundRect,
  smoothstep,
  type ColorLike,
  type LayerModule,
  type Pt,
  type Scene,
} from '../engine';

type Ctx = CanvasRenderingContext2D;
type Sprite = HTMLCanvasElement;
/** Lantern drawing scale (its shapes are drawn in u at this scale). */
const SCALE = 1.2;

export interface LanternShared {
  /** Glass centre (CSS px). */
  x: number;
  y: number;
  /** 0..1 light strength this frame, including the flicker. */
  lit: number;
  /** Soft warm radial sprite (alpha falls smoothly to 0 at the edge). */
  sprite: Sprite;
}

/** A soft radial sprite: colour ramps from `inner` to `outer`, alpha is a smooth bell to 0 at the rim. */
function makeGlowSprite(size: number, inner: ColorLike, outer: ColorLike, tight: number): HTMLCanvasElement {
  const cv = makeCanvas(size, size);
  const c = ctx2d(cv);
  const r = size / 2;
  const g = c.createRadialGradient(r, r, 0, r, r, r);
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    // Gaussian-ish falloff, forced to exactly 0 at the rim so there is never a visible edge.
    const a = Math.exp(-q * q * tight) * (1 - q * q) * (1 - q);
    g.addColorStop(q, css(mix(inner, outer, Math.min(1, q * 1.6)), a));
  }
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return cv;
}

const lantern: LayerModule = (s) => {
  // Emitted light colours (ungraded).
  const WARM = mix(C.light.lamp, C.orange[2], 0.35);
  const spriteCore: Sprite = makeGlowSprite(256, mix(C.yellow[3], C.white, 0.35), C.orange[2], 3.2);
  const spriteWide: Sprite = makeGlowSprite(256, C.light.lamp, C.orange[1], 2.4);
  const spritePool: Sprite = makeGlowSprite(256, C.light.lamp, C.orange[2], 1.8);
  // All sprites are 256 px: Chrome keeps smaller canvases CPU-backed and re-uploads them every time
  // they are drawn, which costs milliseconds a frame.

  const shared: LanternShared = { x: 0, y: 0, lit: 0, sprite: spriteWide };
  s.shared.lantern = shared;

  // ------------------------------------------------------------ geometry (rebuilt on resize)
  const G = {
    yp: 0, // deck row the piling stands beside
    px: 0, // piling centre x
    top: 0, // piling top
    bottom: 0, // piling waterline
    hook: { x: 0, y: 0 } as Pt, // lantern pivot
    water: 0, // water surface row under the lantern
  };
  let glassGrad: CanvasGradient | null = null;
  let glassCtx: Ctx | null = null;

  function layout(sc: Scene): void {
    const d = sc.layout.dock;
    const u = sc.u;
    const f = 0.255;
    const yp = lerp(d.farR.y, d.nearR.y, f);
    const rx = lerp(d.farR.x, d.nearR.x, f);
    G.yp = yp;
    G.px = rx + d.side * 0.4 + 1.5 * u;
    G.top = yp - 47 * u;
    G.bottom = yp + d.side * 0.95 + 13 * u;
    G.hook = { x: G.px + 17 * u, y: G.top + 4.5 * u };
    G.water = G.bottom - 1 * u;
  }

  // ------------------------------------------------------------ light level

  let lit = 0; // smoothed base level (no flicker)
  let flick = 1;
  let sway = 0;

  const baseLevel = (sc: Scene): number => {
    const w = sc.weather;
    const dark = clamp(sc.light.night + 0.3 * w.storm + 0.12 * w.rain + 0.18 * w.fog + 0.1 * smoothstep(0.5, 1, w.cloud), 0, 1);
    return 0.12 + 0.88 * smoothstep(0.1, 0.78, dark);
  };

  /** Glass centre for the current sway. */
  const glassPos = (sc: Scene): Pt => {
    const r = 14 * SCALE * sc.u;
    return { x: G.hook.x - Math.sin(sway) * r, y: G.hook.y + Math.cos(sway) * r };
  };

  function update(sc: Scene, dt: number): void {
    const t = sc.t;
    const target = baseLevel(sc);
    lit += (target - lit) * Math.min(1, dt * 2);
    if (sc.reducedMotion) {
      flick = 0.96 + 0.04 * noise1(t * 0.8, 5);
      sway = 0.04 * sc.windAt(G.hook.x);
    } else {
      flick = 0.88 + 0.1 * noise1(t * 5.5, 3) + 0.05 * noise1(t * 15, 9) - 0.03 * Math.max(0, noise1(t * 2.1, 4) - 0.7) * 6;
      const wind = sc.windAt(G.hook.x);
      sway = 0.05 * wind + (0.035 + 0.06 * wind) * Math.sin(t * 1.7) + 0.02 * Math.sin(t * 0.63 + 1);
    }
    const g = glassPos(sc);
    shared.x = g.x;
    shared.y = g.y;
    shared.lit = clamp(lit * flick, 0, 1);
  }

  const L = (): number => lit * flick;

  /** Warm light: a source-over tint (keeps it reading warm on blue night colours) plus an additive lift. */
  const shine = (ctx: Ctx, sp: Sprite, x: number, y: number, w: number, h: number, tint: number, add: number): void => {
    if (tint > 0.004) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = Math.min(1, tint);
      ctx.drawImage(sp, x, y, w, h);
    }
    if (add > 0.004) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, add);
      ctx.drawImage(sp, x, y, w, h);
    }
  };

  // ------------------------------------------------------------ water: pool + reflection streak

  function drawWater(sc: Scene, ctx: Ctx): void {
    const u = sc.u;
    const k = L();
    const t = sc.t;
    const g = glassPos(sc);
    const wy = G.water;
    const hgt = wy - g.y;
    const refY = wy + hgt * 0.95;
    const p = sc.persp(wy);
    // Warm pool on the surface around the piling.
    const prx = 50 * u * p;
    shine(ctx, spritePool, g.x - prx, wy - prx * 0.26, prx * 2, prx * 0.52, 0.36 * k, 0);
    // Long soft column of reflected light.
    const len = (refY - wy) * 2 + 26 * u;
    shine(ctx, spriteWide, g.x - 12 * u * p, wy - 4 * u, 24 * u * p, len, 0.4 * k, 0);
    // Broken glints that shimmer across the ripples.
    const n = 12;
    const warm = css(mix(C.light.lamp, C.orange[2], 0.55));
    const hot = css(rgb(C.yellow[3]));
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const q = i / (n - 1);
      const yy = wy + 2.5 * u + q * (len - 8 * u);
      const pp = sc.persp(yy);
      const rm = sc.reducedMotion ? 0.15 : 1;
      const wob = Math.sin(t * 1.1 * rm + i * 1.9) * (1.5 + 4 * q) * u * pp;
      const w = (4 + 7 * noise1(i * 3.1 + t * 0.6 * rm, 17)) * u * pp * (1 - 0.45 * q);
      const tw = 0.45 + 0.55 * noise1(t * (1.6 + 0.2 * i) * rm + i * 7, 23);
      const a = k * tw * (1 - q) ** 1.3;
      if (a < 0.02) continue;
      const cx = g.x + wob;
      ctx.globalAlpha = Math.min(1, a * 0.9);
      ctx.strokeStyle = warm;
      ctx.lineWidth = 2.2 * u * pp;
      ctx.beginPath();
      ctx.moveTo(cx - w, yy);
      ctx.lineTo(cx + w, yy);
      ctx.stroke();
      if (q < 0.5) {
        ctx.globalAlpha = Math.min(1, a * 0.6);
        ctx.strokeStyle = hot;
        ctx.lineWidth = 1.1 * u * pp;
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.5, yy);
        ctx.lineTo(cx + w * 0.5, yy);
        ctx.stroke();
      }
    }
  }

  // ------------------------------------------------------------ deck light pool

  function drawPool(sc: Scene, ctx: Ctx): void {
    const k = L();
    if (k < 0.02) return;
    const d = sc.layout.dock;
    const u = sc.u;
    const cx = G.px - 16 * u;
    const cy = G.yp + 1 * u;
    const rx = 84 * u;
    const area = { x: cx - rx, y: cy - rx * 0.52, w: rx * 2, h: rx * 1.04 };
    // The pool is baked at full strength, clipped to the deck (a clip per frame is costly), as a tint
    // map and an additive map; each frame they are drawn with the lamp's current strength.
    const paint = (add: boolean) => (c: Ctx): void => {
      const off = { x: d.side * 0.55, y: d.side * 0.95 };
      c.beginPath();
      c.moveTo(d.farL.x, d.farL.y);
      c.lineTo(d.farR.x, d.farR.y);
      c.lineTo(d.farR.x + off.x, d.farR.y + off.y);
      c.lineTo(d.nearR.x + off.x, d.nearR.y + off.y);
      c.lineTo(d.nearR.x, d.nearR.y);
      c.lineTo(d.nearL.x, d.nearL.y);
      c.closePath();
      c.clip();
      // Wide, faint spill and a brighter core where the planks are closest to the lamp.
      const r2 = 44 * u;
      if (!add) {
        c.globalAlpha = 0.48;
        c.drawImage(spritePool, area.x, area.y, area.w, area.h);
      }
      c.globalAlpha = add ? 0.26 : 0.3;
      c.drawImage(spritePool, cx + 8 * u - r2, cy - r2 * 0.42, r2 * 2, r2 * 0.84);
    };
    ctx.globalAlpha = k;
    poolTint.draw(ctx, 'tint', area, sc.dpr, paint(false));
    ctx.globalCompositeOperation = 'lighter';
    poolAdd.draw(ctx, 'add', area, sc.dpr, paint(true));
  }
  const poolTint = new Baked();
  const poolAdd = new Baked();

  // ------------------------------------------------------------ piling, bracket and lantern

  // Lantern shape constants (lantern-local units, origin at the hook, scaled by u * SCALE).
  const GX = -5.2;
  const GY = 8.6;
  const GW = 10.4;
  const GH = 12.6;
  const PW = 7.5; // piling width (u)

  // The piling + bracket and the lantern's frame are baked (graded colours → keyed by the light);
  // only the glass glow, flame, foam and the lamp light on the piling are drawn live.
  const bakedPiling = new Baked();
  const bakedFrame = new Baked();
  const FRAME_AREA = { x: -9, y: -3, w: 18, h: 31 };

  function paintPiling(c: Ctx): void {
    const sc = s;
    const u = sc.u;
    const out = sc.col(C.outline);
    const iron = sc.col(mix(C.brown[0], C.outline, 0.4));
    const pw = PW * u;
    const x0 = G.px - pw / 2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    c.roundRect(x0, G.top, pw, G.bottom - G.top, [2.5 * u, 2.5 * u, 3 * u, 3 * u]);
    c.fillStyle = sc.col(C.wood.mid);
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = sc.col(C.wood.side);
    c.fillRect(G.px + pw * 0.12, G.top, pw, G.bottom - G.top);
    c.fillStyle = sc.colA(C.wood.hi, 0.8);
    c.fillRect(x0 + 1.2 * u, G.top + 3 * u, 1.4 * u, G.bottom - G.top - 6 * u);
    // Darker wet band at the waterline.
    c.fillStyle = sc.colA(C.wood.dark, 0.7);
    c.fillRect(x0, G.bottom - 6 * u, pw, 6 * u);
    c.restore();
    c.strokeStyle = out;
    c.lineWidth = 2.2 * u;
    c.stroke();
    // Cap.
    ellipse(c, G.px, G.top + 0.6 * u, pw * 0.62, 2.1 * u, { fill: sc.col(C.wood.hi), stroke: out, line: 1.8 * u });
    // Iron bracket: an arm out over the water with a little curl, and a diagonal brace.
    const ax = G.px + pw / 2 - 0.5 * u;
    const ay = G.top + 6 * u;
    const H = G.hook;
    const bracket = (): void => {
      c.beginPath();
      c.moveTo(ax, ay);
      c.quadraticCurveTo(lerp(ax, H.x, 0.5), ay - 2.6 * u, H.x + 1.5 * u, H.y - 1.2 * u);
      c.quadraticCurveTo(H.x + 5 * u, H.y - 1.6 * u, H.x + 4.2 * u, H.y + 1.4 * u);
      c.quadraticCurveTo(H.x + 3.2 * u, H.y + 3.2 * u, H.x + 1.8 * u, H.y + 2 * u);
      c.moveTo(ax, ay + 8 * u);
      c.quadraticCurveTo(ax + 4 * u, ay + 3 * u, lerp(ax, H.x, 0.62), ay - 1.4 * u);
    };
    bracket();
    c.strokeStyle = out;
    c.lineWidth = 3.4 * u;
    c.stroke();
    bracket();
    c.strokeStyle = iron;
    c.lineWidth = 1.5 * u;
    c.stroke();
    // Bolt plate on the piling.
    roundRect(c, ax - 2.2 * u, ay - 2 * u, 3 * u, 12 * u, 1.2 * u, { fill: iron, stroke: out, line: 1.3 * u });
  }

  function paintFrame(c: Ctx): void {
    const sc = s;
    const out = sc.col(C.outline);
    const ironHi = sc.col(C.brown[2]);
    const frame = sc.col(mix(C.brown[0], C.teal[0], 0.25));
    const brass = sc.col(C.yellow[1]);
    const brassHi = sc.col(C.yellow[2]);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // Bail.
    c.beginPath();
    c.moveTo(-4.6, 6);
    c.quadraticCurveTo(-4.2, -0.6, 0, -0.4);
    c.quadraticCurveTo(4.2, -0.6, 4.6, 6);
    c.strokeStyle = out;
    c.lineWidth = 2.4;
    c.stroke();
    c.strokeStyle = ironHi;
    c.lineWidth = 0.9;
    c.stroke();
    // Glass shine.
    c.beginPath();
    c.moveTo(GX + 2.1, GY + 2.6);
    c.lineTo(GX + 2.1, GY + GH - 3.4);
    c.strokeStyle = sc.raw(C.white, 0.4);
    c.lineWidth = 1.1;
    c.stroke();
    // Cage: outer frame and two slim bars.
    roundRect(c, GX, GY, GW, GH, 2.4, { stroke: out, line: 1.8 });
    c.beginPath();
    c.moveTo(-1.9, GY + 0.6);
    c.lineTo(-1.9, GY + GH - 0.6);
    c.moveTo(3.4, GY + 0.6);
    c.lineTo(3.4, GY + GH - 0.6);
    c.strokeStyle = sc.colA(frame, 0.9);
    c.lineWidth = 0.9;
    c.stroke();
    // Roof: a little hood with a brass knob and ring.
    c.beginPath();
    c.moveTo(-7.2, 9.4);
    c.quadraticCurveTo(-6.6, 7.6, -4.6, 6.8);
    c.quadraticCurveTo(-2.8, 3.6, 0, 3.4);
    c.quadraticCurveTo(2.8, 3.6, 4.6, 6.8);
    c.quadraticCurveTo(6.6, 7.6, 7.2, 9.4);
    c.quadraticCurveTo(0, 10.4, -7.2, 9.4);
    c.closePath();
    c.fillStyle = frame;
    c.fill();
    c.strokeStyle = out;
    c.lineWidth = 1.7;
    c.stroke();
    c.beginPath();
    c.moveTo(-4.2, 7.2);
    c.quadraticCurveTo(-2.4, 4.8, -0.4, 4.6);
    c.strokeStyle = sc.colA(C.teal[2], 0.55);
    c.lineWidth = 0.9;
    c.stroke();
    // Warm underside of the hood, lit by the flame (scaled with the night so it is subtle by day).
    const k = baseLevel(sc);
    c.beginPath();
    c.moveTo(-6, 9.4);
    c.quadraticCurveTo(0, 10.3, 6, 9.4);
    c.strokeStyle = sc.raw(C.orange[2], 0.7 * k);
    c.lineWidth = 0.9;
    c.stroke();
    ellipse(c, 0, 3, 2, 1.5, { fill: brass, stroke: out, line: 1.3 });
    ellipse(c, -0.5, 2.6, 0.8, 0.5, { fill: brassHi });
    // Base.
    roundRect(c, -6.4, GY + GH - 0.6, 12.8, 3.4, 1.4, { fill: frame, stroke: out, line: 1.6 });
    c.beginPath();
    c.moveTo(-4.8, GY + GH + 0.4);
    c.lineTo(4.4, GY + GH + 0.4);
    c.strokeStyle = brassHi;
    c.lineWidth = 0.8;
    c.stroke();
    ellipse(c, 0, GY + GH + 3.9, 2.4, 1.3, { fill: brass, stroke: out, line: 1.2 });
  }

  function drawLamp(sc: Scene, ctx: Ctx): void {
    const u = sc.u;
    const t = sc.t;
    const k = L();
    const key = String(sc.light.key);
    const pw = PW * u;
    const x0 = G.px - pw / 2;
    const H = G.hook;
    const pa = { x: x0 - 3 * u, y: G.top - 4 * u, w: H.x + 8 * u - (x0 - 3 * u), h: G.bottom - G.top + 7 * u };
    bakedPiling.draw(ctx, key, pa, sc.dpr, paintPiling);
    // Warm light on the side of the piling facing the lamp.
    if (k > 0.03) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * k;
      const r = 40 * u;
      const g = glassPos(sc);
      const sy0 = G.top + 2.5 * u;
      const sh = G.bottom - 3 * u - sy0;
      const f = spritePool.width / (2 * r);
      const ya = Math.max(sy0, g.y - r);
      const yb = Math.min(sy0 + sh, g.y + r);
      const xa = x0 + 1 * u;
      const wa = pw - 2 * u;
      if (yb > ya) ctx.drawImage(spritePool, (xa - g.x + r) * f, (ya - g.y + r) * f, wa * f, (yb - ya) * f, xa, ya, wa, yb - ya);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Waterline foam.
    ctx.beginPath();
    ctx.ellipse(G.px, G.bottom - 0.5 * u, 7 * u + Math.sin(t * 2.1 + 1.3) * 0.8 * u, 2.1 * u, 0, 0, TAU);
    ctx.strokeStyle = sc.colA(C.water.ripple, 0.7);
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();

    // The lantern swings from the hook.
    ctx.save();
    ctx.translate(H.x, H.y);
    ctx.rotate(sway);
    ctx.scale(u * SCALE, u * SCALE);
    // Glass (lit from inside); plain rects, the cage outline in the baked frame covers the corners.
    ctx.fillStyle = sc.colA(mix(C.yellow[3], C.white, 0.3), 0.85);
    ctx.fillRect(GX + 0.5, GY + 0.5, GW - 1, GH - 1);
    if (k > 0.01) {
      if (!glassGrad || glassCtx !== ctx) {
        glassCtx = ctx;
        glassGrad = ctx.createRadialGradient(0, 16, 0.5, 0, 15.5, 9.5);
        glassGrad.addColorStop(0, css(mix(C.yellow[3], C.white, 0.5)));
        glassGrad.addColorStop(0.35, css(rgb(C.light.lamp)));
        glassGrad.addColorStop(0.75, css(rgb(C.orange[2])));
        glassGrad.addColorStop(1, css(rgb(C.orange[1])));
      }
      ctx.globalAlpha = clamp(0.25 + k * 0.9, 0, 1);
      ctx.fillStyle = glassGrad;
      ctx.fillRect(GX + 0.5, GY + 0.5, GW - 1, GH - 1);
      ctx.globalAlpha = 1;
    }
    // Flame: two soft ellipses that lean and stretch with the flicker.
    const fl = sc.reducedMotion ? 0 : noise1(t * 6.3, 41) - 0.5;
    const fh = 5.4 + 1.3 * (flick - 0.9) * 6 + fl * 0.6;
    const lean = fl * 0.25 - sway * 0.8;
    const fb = 18.6;
    ctx.fillStyle = sc.raw(C.orange[2]);
    ctx.beginPath();
    ctx.ellipse(Math.sin(lean) * fh * 0.5, fb - fh * 0.5, 2.1, fh * 0.55, lean, 0, TAU);
    ctx.fill();
    ctx.fillStyle = sc.raw(mix(C.yellow[3], C.white, 0.55));
    ctx.beginPath();
    ctx.ellipse(Math.sin(lean) * fh * 0.35, fb - fh * 0.32, 1.15, fh * 0.34, lean, 0, TAU);
    ctx.fill();
    // Wick.
    ctx.fillStyle = sc.col(C.outline);
    ctx.fillRect(-0.45, fb + 0.2, 0.9, 1.4);
    bakedFrame.draw(ctx, key, FRAME_AREA, sc.dpr * u * SCALE, paintFrame);
    ctx.restore();
  }

  // ------------------------------------------------------------ core glow + moths

  const moths = [0, 1, 2].map((i) => ({ ph: i * 2.3 + 0.7, sp: 1.1 + i * 0.37, rx: 13 + i * 5, ry: 9 + i * 3 }));

  function drawCore(sc: Scene, ctx: Ctx): void {
    const u = sc.u;
    const k = L();
    const g = glassPos(sc);
    // A bright bloom around the glass (the wide warm tint is the halo layer).
    const r = (24 + 6 * k) * u;
    shine(ctx, spriteCore, g.x - r, g.y - r, r * 2, r * 2, 0, clamp(0.1 + 0.55 * k, 0, 1));

    // Moths flutter round the lamp on calm nights.
    const mk = smoothstep(0.55, 0.85, sc.light.night) * (1 - smoothstep(0.2, 0.6, sc.weather.rain)) * (1 - sc.weather.storm);
    if (mk < 0.02) return;
    const t = sc.t * (sc.reducedMotion ? 0.25 : 1);
    ctx.globalCompositeOperation = 'source-over';
    for (const m of moths) {
      const a = t * m.sp + m.ph;
      const x = g.x + Math.cos(a) * m.rx * u + Math.sin(a * 2.7) * 3 * u;
      const y = g.y - 2 * u + Math.sin(a * 1.3) * m.ry * u + Math.cos(a * 3.1) * 2 * u;
      const near = 1 - clamp(Math.hypot(x - g.x, y - g.y) / (30 * u), 0, 1);
      const flap = 0.35 + 0.65 * Math.abs(Math.sin(sc.t * (sc.reducedMotion ? 4 : 26) + m.ph * 3));
      const dir = Math.sin(a) > 0 ? -1 : 1; // facing along the orbit
      ctx.globalAlpha = mk * (0.5 + 0.5 * near);
      ctx.fillStyle = sc.raw(mix(C.yellow[3], C.orange[3], 0.4 + 0.4 * (1 - near)));
      for (const sd of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(x + sd * 1.7 * u * flap, y - 0.3 * u, 2.1 * u * flap, 1.4 * u, sd * 0.55 * dir, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = sc.col(C.brown[1]);
      ctx.beginPath();
      ctx.ellipse(x, y, 0.6 * u, 1.3 * u, 0, 0, TAU);
      ctx.fill();
    }
  }

  // ------------------------------------------------------------ halo (over the fog) and lit rain

  function drawHalo(sc: Scene, ctx: Ctx): void {
    const u = sc.u;
    const k = L();
    if (k < 0.02) return;
    const w = sc.weather;
    const g = glassPos(sc);
    const r = (70 + 50 * w.fog + 12 * w.rain) * u;
    // One pass: a warm tint (an additive pass here would double the fill cost of the biggest sprite).
    shine(ctx, spriteWide, g.x - r, g.y - r, r * 2, r * 2, k * (0.32 + 0.22 * w.fog), 0);
    if (w.fog > 0.05) {
      // A tighter bright bloom: light scattering in the mist right around the lamp.
      const r2 = 32 * u;
      shine(ctx, spriteCore, g.x - r2, g.y - r2, r2 * 2, r2 * 2, 0, k * 0.4 * w.fog);
    }
  }

  function drawDrops(sc: Scene, ctx: Ctx): void {
    const rain = sc.weather.rain;
    const k = L() * smoothstep(0.1, 0.5, rain);
    if (k < 0.03) return;
    const u = sc.u;
    const g = glassPos(sc);
    const t = sc.t;
    const wind = sc.windAt(g.x);
    const R = 34 * u;
    const fall = 520 * u;
    const n = 12;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = sc.raw(WARM);
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.1 * u;
    for (let i = 0; i < n; i++) {
      const per = (2 * R) / fall;
      const ph = (t / per + i * 0.618) % 1;
      const col = (i * 0.37 + Math.floor(t / per + i * 0.618) * 0.53) % 1;
      const y = g.y - R + ph * 2 * R;
      const x = g.x - R + col * 2 * R + (ph - 0.5) * wind * 18 * u;
      const dist = Math.hypot(x - g.x, y - g.y) / R;
      const a = (1 - dist) * k;
      if (a <= 0.02) continue;
      ctx.globalAlpha = Math.min(1, a * 0.9);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - wind * 2.5 * u, y - 7 * u);
      ctx.stroke();
    }
  }

  return [
    { id: 'lantern.water', z: 260, init: layout, resize: layout, update, draw: drawWater },
    { id: 'lantern.pool', z: 331, draw: drawPool },
    { id: 'lantern.lamp', z: 343, draw: drawLamp },
    { id: 'lantern.core', z: 344, draw: drawCore },
    { id: 'lantern.halo', z: 405, draw: drawHalo },
    { id: 'lantern.drops', z: 425, draw: drawDrops },
  ];
};

export default lantern;
