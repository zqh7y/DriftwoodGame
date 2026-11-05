// Sky: gradient, sun with its soft halo, drifting cartoon clouds, birds, stars and the moon.
// The rest of the night show (meteors, aurora, Milky Way, planet) lives in space.ts.
// z 0–99. Everything is clipped above the horizon.

import {
  ctx2d,
  makeCanvas,
  C,
  css,
  glow,
  hash1,
  mix,
  shade,
  skyAt,
  smoothstep,
  sparkle,
  TAU,
  vGrad,
  wrap,
  type LayerModule,
  type RGB,
  type Scene,
} from '../engine';

interface Puff {
  dx: number;
  dy: number;
  r: number;
}

interface Cloud {
  /** Base position at t = 0 (x in px, y as a fraction of H). */
  x0: number;
  yF: number;
  w: number;
  puffs: Puff[];
  speed: number;
  /** Cloud cover needed for this cloud to show (fair-weather clouds have 0). */
  need: number;
  depth: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  big: boolean;
  /** Most stars are white; some are tinted blue, yellow or pink. */
  col: string;
  /** Twinkles live each frame (big sparkles and ~20% of dots); the rest are baked at mean brightness. */
  live: boolean;
}

interface Bird {
  x: number;
  y: number;
  vx: number;
  phase: number;
  size: number;
}

/** A fluffy cumulus: a bottom row of puffs resting on a flat base line, plus a couple of top bumps. */
function makeCloud(s: Scene, seed: string, w: number): Puff[] {
  const r = s.rng(seed);
  const puffs: Puff[] = [];
  const n = 4 + r.int(0, 1);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const rad = w * (0.13 + 0.09 * Math.sin(f * Math.PI)) * r.range(0.9, 1.1);
    puffs.push({ dx: (f - 0.5) * w * 0.7, dy: -rad, r: rad });
  }
  puffs.push({ dx: -w * r.range(0.06, 0.14), dy: -w * 0.3, r: w * r.range(0.19, 0.23) });
  puffs.push({ dx: w * r.range(0.1, 0.17), dy: -w * 0.24, r: w * r.range(0.15, 0.18) });
  return puffs;
}

function cloudPath(ctx: CanvasRenderingContext2D, c: Cloud, x: number, y: number, lift: number, k: number): void {
  ctx.beginPath();
  for (const p of c.puffs) {
    const cx = x + p.dx;
    const cy = y + p.dy - p.r * lift;
    ctx.moveTo(cx + p.r * k, cy);
    ctx.arc(cx, cy, p.r * k, 0, Math.PI * 2);
  }
  // A rounded base that keeps the bottom flat and soft.
  const bw = c.w * 0.78;
  const bh = c.w * 0.15;
  ctx.roundRect(x - bw / 2, y - bh - c.w * lift * 0.12, bw, bh, bh / 2);
}

function drawCloud(ctx: CanvasRenderingContext2D, c: Cloud, x: number, y: number, lit: string, shadeCol: string, under: string): void {
  ctx.fillStyle = under;
  cloudPath(ctx, c, x, y + c.w * 0.012, 0, 1);
  ctx.fill();
  ctx.fillStyle = shadeCol;
  cloudPath(ctx, c, x, y, 0.04, 0.99);
  ctx.fill();
  ctx.fillStyle = lit;
  cloudPath(ctx, c, x - c.w * 0.012, y, 0.16, 0.9);
  ctx.fill();
}

const sky: LayerModule = (s) => {
  let clouds: Cloud[] = [];
  let stars: Star[] = [];
  let liveStars: Star[] = [];
  /** The static field, baked once per size into one path per (color, brightness) group. */
  let starField: Array<{ col: string; alpha: number; path: Path2D }> = [];
  let gradKey = '';
  let grad: HTMLCanvasElement | null = null;

  const birds: Bird[] = [];
  let nextFlock = 6;
  let bats = false;
  const rnd = s.rng('sky.events');

  const clipSky = (ctx: CanvasRenderingContext2D): void => {
    ctx.beginPath();
    ctx.rect(0, 0, s.W, s.layout.horizon);
    ctx.clip();
  };

  return [
    {
      id: 'sky.gradient',
      z: 0,
      draw(s, ctx) {
        const hz = s.layout.horizon;
        // A 1-px-wide strip holds the gradient; stretching it is cheaper than a full gradient fill.
        const key = `${s.light.key}|${hz}`;
        if (key !== gradKey || !grad) {
          const L = s.light;
          const h = Math.max(32, Math.ceil(hz));
          grad ??= makeCanvas(1, h);
          grad.height = h;
          const gx = ctx2d(grad);
          gx.fillStyle = vGrad(gx, 0, h, [
            [0, css(skyAt(L, 0))],
            [0.3, css(skyAt(L, 0.3))],
            [0.55, css(skyAt(L, 0.55))],
            [0.8, css(skyAt(L, 0.8))],
            [1, css(skyAt(L, 1))],
          ]);
          gx.fillRect(0, 0, 1, h);
          gradKey = key;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(grad, 0, 0, s.W, hz + 1);
      },
    },

    {
      id: 'sky.stars',
      z: 5,
      resize(s) {
        const r = s.rng('sky.stars');
        const n = Math.round((s.W * s.layout.horizon) / 2600);
        stars = [];
        for (let i = 0; i < n; i++) {
          stars.push({
            x: r.range(0, s.W),
            y: r.range(0, s.layout.horizon * 0.85) ** 1.0,
            r: r.range(0.6, 1.5) * s.u,
            phase: r.range(0, 6.28),
            speed: r.range(1.2, 3.2),
            big: r.chance(0.08),
            col: r.chance(0.72) ? C.light.star : r.pick([C.blue[3], C.yellow[3], C.pink[3]]),
            live: false,
          });
        }
        // Separate hash (not the rng) picks the live dots, so star positions stay exactly as before.
        for (let i = 0; i < stars.length; i++) stars[i].live = stars[i].big || hash1(i, 523) < 0.2;
        liveStars = stars.filter((st) => st.live);
        // Static stars shine at the twinkle's mean (0.55), dimmer low in the sky as before.
        const groups = new Map<string, { col: string; alpha: number; path: Path2D }>();
        const hz = s.layout.horizon;
        for (const st of stars) {
          if (st.live) continue;
          const alpha = 0.55 * (st.y < hz * 0.7 ? 1 : 0.6);
          const key = `${st.col}|${alpha}`;
          let g = groups.get(key);
          if (!g) groups.set(key, (g = { col: st.col, alpha, path: new Path2D() }));
          g.path.moveTo(st.x + st.r, st.y);
          g.path.arc(st.x, st.y, st.r, 0, TAU);
        }
        starField = [...groups.values()];
      },
      draw(s, ctx) {
        const a = s.light.stars;
        if (a < 0.01) return;
        clipSky(ctx);
        const hz = s.layout.horizon;
        // Static field: a handful of fills of the pre-built paths.
        for (const g of starField) {
          ctx.fillStyle = s.raw(g.col);
          ctx.globalAlpha = a * g.alpha;
          ctx.fill(g.path);
        }
        for (const st of liveStars) {
          const tw = 0.55 + 0.45 * Math.sin(s.t * st.speed + st.phase);
          const star = s.raw(st.col);
          ctx.fillStyle = star;
          ctx.globalAlpha = a * tw * (st.y < hz * 0.7 ? 1 : 0.6);
          if (st.big) sparkle(ctx, st.x, st.y, st.r * 3.2 * (0.7 + 0.3 * tw), star);
          else {
            ctx.beginPath();
            ctx.arc(st.x, st.y, st.r, 0, TAU);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      },
    },

    {
      id: 'sky.moon',
      z: 10,
      draw(s, ctx) {
        const m = s.light.moon;
        const vis = smoothstep(-0.05, 0.12, m.alt) * smoothstep(0.25, 0.75, s.light.night);
        if (vis < 0.01) return;
        clipSky(ctx);
        const u = s.u;
        const r = 20 * u;
        glow(ctx, m.x, m.y, r * 4.2, C.light.moon, 0.32 * vis * (1 - s.weather.cloud * 0.5));
        ctx.globalAlpha = vis;
        ctx.fillStyle = s.raw(C.light.moon);
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        // Soft craters.
        ctx.fillStyle = s.raw(shade(C.light.moon, -0.14));
        for (const [dx, dy, cr] of [[-0.35, -0.2, 0.22], [0.3, 0.25, 0.16], [0.1, -0.45, 0.1], [-0.15, 0.42, 0.12]] as const) {
          ctx.beginPath();
          ctx.arc(m.x + dx * r, m.y + dy * r, cr * r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      },
    },

    {
      id: 'sky.sun',
      z: 12,
      draw(s, ctx) {
        const L = s.light;
        const sun = L.sun;
        const vis = smoothstep(-0.12, 0.06, sun.alt);
        if (vis < 0.01) return;
        clipSky(ctx);
        const r = s.layout.sunDay.r;
        const clear = 1 - smoothstep(0.55, 1, s.weather.cloud) * 0.85;
        const warm = L.golden;
        const core: RGB = mix(C.sun.core, L.sunCol, 0.55 + warm * 0.4);
        const pulse = 1 + 0.025 * Math.sin(s.t * 0.7);
        // Big soft halo that lightens the sky around the sun, like the picture.
        const haloR = r * (2.5 + warm * 1.4) * pulse;
        const g = ctx.createRadialGradient(sun.x, sun.y, r * 0.9, sun.x, sun.y, haloR);
        const hc = mix(C.sun.glow, L.sunCol, warm * 0.7);
        g.addColorStop(0, css(hc, 0.85 * vis * clear));
        g.addColorStop(0.4, css(hc, 0.38 * vis * clear));
        g.addColorStop(1, css(hc, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, haloR, 0, Math.PI * 2);
        ctx.fill();
        // Disc.
        ctx.globalAlpha = vis * (0.35 + 0.65 * clear);
        ctx.fillStyle = css(core);
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      },
    },

    {
      id: 'sky.clouds',
      z: 30,
      resize(s) {
        const u = s.u;
        const st = s.layout.stage;
        const H = s.H;
        const r = s.rng('sky.clouds');
        // Fair-weather clouds placed like the picture, then extra ones that appear as cover rises.
        const base: Array<Omit<Cloud, 'puffs'>> = [
          { x0: st.x0 + st.w * 0.07, yF: 0.152, w: 92 * u, speed: 4.2, need: 0, depth: 1 },
          { x0: st.x0 + st.w * 0.68, yF: 0.226, w: 108 * u, speed: 3.4, need: 0, depth: 1 },
          { x0: st.x0 + st.w * 0.42, yF: 0.085, w: 64 * u, speed: 2.6, need: 0.2, depth: 0.6 },
        ];
        const extraN = Math.max(5, Math.round(s.W / (110 * u)));
        for (let i = 0; i < extraN; i++) {
          base.push({
            x0: r.range(0, s.W),
            yF: r.range(0.05, 0.3),
            w: r.range(70, 150) * u,
            speed: r.range(2.2, 5),
            need: r.range(0.38, 0.95),
            depth: r.range(0.6, 1),
          });
        }
        // Wide screens: a few more fair-weather clouds outside the stage.
        if (s.W > st.w * 1.3) {
          const n = Math.round((s.W - st.w) / (260 * u));
          for (let i = 0; i < n; i++) {
            base.push({ x0: r.range(0, s.W), yF: r.range(0.08, 0.26), w: r.range(70, 120) * u, speed: r.range(2.5, 4.5), need: 0, depth: r.range(0.7, 1) });
          }
        }
        clouds = base
          .map((c, i) => ({ ...c, puffs: makeCloud(s, `cloud${i}`, c.w) }))
          .sort((a, b) => a.depth - b.depth);
      },
      draw(s, ctx) {
        clipSky(ctx);
        const L = s.light;
        const w = s.weather;
        const u = s.u;
        const cover = w.cloud;
        const storm = w.storm;
        const lit = mix(L.cloudLit, shade(L.cloudLit, -0.35), storm * 0.6);
        const sh = mix(L.cloudShade, shade(L.cloudShade, -0.4), storm * 0.6);
        const under = mix(sh, shade(sh, -0.12), 0.6);
        // Overcast deck dims the upper sky.
        const deck = smoothstep(0.55, 1, cover);
        if (deck > 0.01) {
          ctx.fillStyle = vGrad(ctx, 0, s.layout.horizon, [
            [0, css(mix(sh, shade(sh, -0.2), storm), 0.85 * deck)],
            [0.6, css(sh, 0.45 * deck)],
            [1, css(sh, 0)],
          ]);
          ctx.fillRect(0, 0, s.W, s.layout.horizon);
        }
        for (const c of clouds) {
          const vis = c.need === 0 ? 1 : smoothstep(c.need - 0.08, c.need + 0.08, cover);
          if (vis < 0.02) continue;
          const span = s.W + c.w * 2.4;
          const speed = c.speed * u * (0.4 + s.windAt(c.x0) * 1.6) * c.depth;
          const x = wrap(c.x0 + c.w * 1.2 + s.t * speed, span) - c.w * 1.2;
          const y = c.yF * s.H;
          ctx.globalAlpha = vis * (0.75 + 0.25 * c.depth);
          const k = 1 - c.depth;
          drawCloud(ctx, c, x, y, css(mix(lit, L.skyMid, k * 0.35)), css(mix(sh, L.skyMid, k * 0.3)), css(mix(under, L.skyMid, k * 0.3)));
        }
        ctx.globalAlpha = 1;
      },
    },

    {
      id: 'sky.birds',
      z: 50,
      update(s, dt) {
        const L = s.light;
        const fine = s.weather.rain < 0.4 && s.weather.storm < 0.2;
        const duskish = L.night > 0.35 && L.night < 0.85;
        nextFlock -= dt;
        if (nextFlock <= 0 && birds.length === 0 && fine && (L.daylight > 0.5 || duskish)) {
          nextFlock = rnd.range(18, 36);
          bats = duskish && L.daylight <= 0.5;
          const fromLeft = rnd.chance(0.6);
          const n = bats ? rnd.int(2, 3) : rnd.int(3, 5);
          const y0 = rnd.range(0.08, 0.27) * s.H;
          for (let i = 0; i < n; i++) {
            birds.push({
              x: fromLeft ? -20 * s.u - i * rnd.range(14, 26) * s.u : s.W + 20 * s.u + i * rnd.range(14, 26) * s.u,
              y: y0 + rnd.range(-12, 12) * s.u + i * 4 * s.u,
              vx: (fromLeft ? 1 : -1) * rnd.range(34, 46) * s.u * (bats ? 1.3 : 1),
              phase: rnd.range(0, 6.28),
              size: rnd.range(0.8, 1.15),
            });
          }
        }
        for (const b of birds) b.x += b.vx * dt;
        for (let i = birds.length - 1; i >= 0; i--) {
          const b = birds[i];
          if ((b.vx > 0 && b.x > s.W + 60 * s.u) || (b.vx < 0 && b.x < -60 * s.u)) birds.splice(i, 1);
        }
      },
      draw(s, ctx) {
        if (!birds.length) return;
        clipSky(ctx);
        const u = s.u;
        ctx.strokeStyle = s.col(bats ? C.purple[0] : C.gray[0], 0.15);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const b of birds) {
          const flap = Math.sin(s.t * (bats ? 16 : 9) + b.phase);
          const bob = Math.sin(s.t * 1.6 + b.phase) * 3 * u + (bats ? Math.sin(s.t * 5 + b.phase) * 4 * u : 0);
          const x = b.x;
          const y = b.y + bob;
          const w = 8 * u * b.size;
          const lift = flap * 4.5 * u * b.size;
          ctx.lineWidth = 2 * u;
          ctx.beginPath();
          ctx.moveTo(x - w, y - lift);
          ctx.quadraticCurveTo(x - w * 0.45, y - 3 * u - lift * 0.3, x, y);
          ctx.quadraticCurveTo(x + w * 0.45, y - 3 * u - lift * 0.3, x + w, y - lift);
          ctx.stroke();
        }
      },
    },
  ];
};

export default sky;
