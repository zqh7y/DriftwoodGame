// Weather & atmosphere: rain with ripples and splashes, storm lightning, fog and morning mist,
// wind-blown leaves, sun motes and a vignette. z 380–499. On the default clear day it stays almost
// invisible so the scene matches the reference picture.

import { ctx2d, makeCanvas, bump, C, clamp, glow, mix, noise1, shade, smoothstep, type LayerModule, type Pt, type Scene } from '../engine';

interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

interface Bolt {
  pts: Pt[];
  branches: Pt[][];
  age: number;
  life: number;
}

const LAYERS = [
  { n: 70, v: [520, 640], len: [10, 15], w: 1.0, a: 0.32 },
  { n: 55, v: [720, 860], len: [16, 22], w: 1.4, a: 0.46 },
  { n: 30, v: [950, 1100], len: [24, 32], w: 1.9, a: 0.6 },
];

function inQuad(p: Pt, q: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const weather: LayerModule = (s) => {
  const rnd = s.rng('weather');
  let drops: Drop[][] = [];
  let bolt: Bolt | null = null;
  let nextBolt = 4;
  let rippleAcc = 0;
  let leafAcc = 0;
  let motes: Array<{ x: number; y: number; phase: number; speed: number }> = [];
  let vignetteKey = '';
  let vignette: HTMLCanvasElement | null = null;

  const spawnDrop = (s: Scene, layer: number, anywhere: boolean): Drop => {
    const L = LAYERS[layer];
    return {
      x: rnd.range(-0.15, 1.05) * s.W,
      y: anywhere ? rnd.range(-0.1, 1) * s.H : rnd.range(-0.15, -0.02) * s.H,
      v: rnd.range(L.v[0], L.v[1]) * s.u,
      len: rnd.range(L.len[0], L.len[1]) * s.u,
    };
  };

  const makeBolt = (s: Scene): Bolt => {
    const x0 = rnd.range(0.15, 0.85) * s.W;
    const yEnd = s.layout.horizon - rnd.range(0.0, 0.06) * s.H;
    const pts: Pt[] = [{ x: x0, y: -5 }];
    let x = x0;
    let y = -5;
    const step = 16 * s.u;
    while (y < yEnd) {
      y += step * rnd.range(0.6, 1.3);
      x += rnd.range(-1, 1) * 14 * s.u;
      pts.push({ x, y: Math.min(y, yEnd) });
    }
    const branches: Pt[][] = [];
    for (let b = 0; b < 2; b++) {
      const i = rnd.int(2, Math.max(2, pts.length - 3));
      const start = pts[i];
      const br: Pt[] = [start];
      let bx = start.x;
      let by = start.y;
      const dir = rnd.sign();
      for (let k = 0; k < 4; k++) {
        bx += dir * rnd.range(6, 14) * s.u;
        by += rnd.range(8, 16) * s.u;
        br.push({ x: bx, y: by });
      }
      branches.push(br);
    }
    return { pts, branches, age: 0, life: 0.45 };
  };

  return [
    {
      id: 'weather.fog',
      z: 400,
      draw(s, ctx) {
        const fog = s.weather.fog;
        const mist = bump(s.tod, 0.27, 0.06) * 0.55 * (1 - s.weather.rain);
        const amt = Math.max(fog, mist);
        if (amt < 0.02) return;
        const hz = s.layout.horizon;
        const u = s.u;
        const col = mix(s.light.haze, C.cloud.mid, 0.35 * s.light.daylight);
        const bands = [
          { y: hz - 4 * u, h: 26 * u, a: 0.75, sp: 6 },
          { y: hz + 0.06 * s.H, h: 34 * u, a: 0.55, sp: 9 },
          { y: hz + 0.17 * s.H, h: 44 * u, a: fog * 0.5, sp: 13 },
          { y: hz - 0.09 * s.H, h: 50 * u, a: fog * 0.45, sp: 4 },
        ];
        for (const [i, b] of bands.entries()) {
          const alpha = amt * b.a;
          if (alpha < 0.01) continue;
          const n = Math.ceil(s.W / (120 * u)) + 2;
          for (let k = 0; k < n; k++) {
            const span = (n - 1) * 120 * u;
            const x = ((k * 120 * u + s.t * b.sp * u * (0.6 + s.weather.wind)) % span) - 60 * u;
            const wob = (noise1(k * 1.7 + i * 9 + s.t * 0.05, 31) - 0.5) * 14 * u;
            const rx = 110 * u;
            const g = ctx.createRadialGradient(x, b.y + wob, 0, x, b.y + wob, rx);
            g.addColorStop(0, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${Math.min(0.9, alpha * 0.8).toFixed(3)})`);
            g.addColorStop(1, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},0)`);
            ctx.fillStyle = g;
            ctx.save();
            ctx.translate(x, b.y + wob);
            ctx.scale(1, b.h / rx);
            ctx.translate(-x, -(b.y + wob));
            ctx.beginPath();
            ctx.arc(x, b.y + wob, rx, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }
        // Overall veil in thick fog.
        if (fog > 0.15) {
          // A veil that is thickest around the horizon, so the far shore fades most.
          const k = (fog - 0.15) / 0.85;
          const c3 = `${col[0] | 0},${col[1] | 0},${col[2] | 0}`;
          const g = ctx.createLinearGradient(0, 0, 0, s.H);
          g.addColorStop(0, `rgba(${c3},${(k * 0.28).toFixed(3)})`);
          g.addColorStop(hz / s.H, `rgba(${c3},${(k * 0.55).toFixed(3)})`);
          g.addColorStop(Math.min(1, hz / s.H + 0.18), `rgba(${c3},${(k * 0.3).toFixed(3)})`);
          g.addColorStop(1, `rgba(${c3},${(k * 0.12).toFixed(3)})`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, s.W, s.H);
        }
      },
    },

    {
      id: 'weather.rain',
      z: 420,
      resize(s) {
        drops = LAYERS.map((L, i) => Array.from({ length: Math.round(L.n * clamp(s.W / 390, 0.8, 3)) }, () => spawnDrop(s, i, true)));
      },
      update(s, dt) {
        const rain = s.weather.rain;
        if (rain < 0.01) return;
        const wind = s.windAt(s.W / 2);
        for (let li = 0; li < drops.length; li++) {
          for (const d of drops[li]) {
            d.y += d.v * dt;
            d.x += wind * d.v * 0.32 * dt;
            if (d.y > s.H + 20 * s.u) Object.assign(d, spawnDrop(s, li, false));
          }
        }
        // Raindrop rings on the water, tiny splashes on the pier.
        rippleAcc += dt * rain * 26 * clamp(s.W / 390, 1, 3);
        const quad = [s.layout.dock.farL, s.layout.dock.farR, s.layout.dock.nearR, s.layout.dock.nearL];
        while (rippleAcc >= 1) {
          rippleAcc -= 1;
          const p = { x: rnd.range(0, s.W), y: rnd.range(s.layout.horizon + 4 * s.u, s.H) };
          if (inQuad(p, quad)) {
            for (let k = 0; k < 3; k++) {
              s.particle({
                x: p.x,
                y: p.y,
                vx: rnd.range(-30, 30) * s.u,
                vy: -rnd.range(30, 60) * s.u,
                g: 500 * s.u,
                life: 0.35,
                size: 1.1 * s.u,
                color: C.water.ripple,
              });
            }
          } else {
            s.ripple(p.x, p.y, { maxR: 11 * s.u, life: 0.75, strength: 0.55 });
          }
        }
      },
      draw(s, ctx) {
        const rain = s.weather.rain;
        if (rain < 0.01) return;
        const wind = s.windAt(s.W / 2);
        ctx.lineCap = 'round';
        for (let li = 0; li < drops.length; li++) {
          const L = LAYERS[li];
          const n = Math.round(drops[li].length * clamp(rain, 0, 1));
          ctx.strokeStyle = s.colA(mix(C.water.ripple, C.white, 0.5), L.a * (0.6 + 0.4 * rain));
          ctx.lineWidth = L.w * s.u;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const d = drops[li][i];
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - wind * d.len * 0.32, d.y - d.len);
          }
          ctx.stroke();
        }
      },
    },

    {
      id: 'weather.lightning',
      z: 430,
      update(s, dt) {
        if (s.weather.storm < 0.5) {
          bolt = null;
          return;
        }
        nextBolt -= dt;
        if (!bolt && nextBolt <= 0) {
          bolt = makeBolt(s);
          nextBolt = rnd.range(6, 14);
          s.lightning(rnd.range(0.75, 1));
        }
        if (bolt) {
          bolt.age += dt;
          if (bolt.age > bolt.life) bolt = null;
        }
      },
      draw(s, ctx) {
        if (!bolt) return;
        const t = bolt.age / bolt.life;
        const flick = t < 0.2 ? 1 : t < 0.35 ? 0.35 : t < 0.5 ? 0.9 : 1 - t;
        const u = s.u;
        const line = (pts: Pt[], w: number, color: string): void => {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (const p of pts) ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          ctx.stroke();
        };
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, s.W, s.layout.horizon);
        ctx.clip();
        ctx.globalCompositeOperation = 'lighter';
        line(bolt.pts, 9 * u, s.raw(C.light.lightning, 0.18 * flick));
        for (const b of bolt.branches) line(b, 5 * u, s.raw(C.light.lightning, 0.14 * flick));
        ctx.globalCompositeOperation = 'source-over';
        line(bolt.pts, 2.6 * u, s.raw(C.light.lightning, flick));
        for (const b of bolt.branches) line(b, 1.5 * u, s.raw(C.light.lightning, 0.8 * flick));
        ctx.restore();
      },
    },

    {
      id: 'weather.leaves',
      z: 440,
      update(s, dt) {
        const w = s.weather.wind;
        if (w < 0.5) return;
        leafAcc += dt * (w - 0.45) * 2.4;
        while (leafAcc >= 1) {
          leafAcc -= 1;
          s.particle({
            x: -12 * s.u,
            y: rnd.range(0.2, 0.85) * s.H,
            vx: rnd.range(70, 130) * s.u,
            vy: rnd.range(-12, 18) * s.u,
            g: 6 * s.u,
            life: rnd.range(5, 8),
            size: rnd.range(2.6, 3.6) * s.u,
            color: rnd.pick([C.green[2], C.green[3], C.reed.leafHi, C.yellow[2]]),
            shape: 'leaf',
            spin: rnd.range(-5, 5),
            windK: 0.6,
          });
        }
      },
    },

    {
      id: 'weather.motes',
      z: 445,
      resize(s) {
        const r = s.rng('weather.motes');
        const st = s.layout.stage;
        motes = Array.from({ length: 12 }, () => ({
          x: st.x0 + r.range(0.05, 0.98) * st.w,
          y: r.range(0.46, 0.9) * s.H,
          phase: r.range(0, 6.28),
          speed: r.range(0.5, 1.2),
        }));
      },
      draw(s, ctx) {
        const a = smoothstep(0.6, 1, s.light.daylight) * (1 - s.weather.rain) * (1 - s.weather.fog) * (1 - smoothstep(0.55, 0.9, s.weather.cloud));
        if (a < 0.02) return;
        const u = s.u;
        for (const m of motes) {
          const x = m.x + Math.sin(s.t * 0.3 * m.speed + m.phase) * 18 * u;
          const y = m.y - ((s.t * 6 * m.speed * u + m.phase * 30) % (60 * u));
          const tw = Math.pow(Math.max(0, Math.sin(s.t * 1.4 * m.speed + m.phase)), 2);
          glow(ctx, x, y, 5 * u, C.light.sparkle, a * tw * 0.7);
        }
      },
    },

    {
      id: 'weather.vignette',
      z: 490,
      draw(s, ctx) {
        const k = clamp(0.04 + s.light.night * 0.3 + s.weather.storm * 0.22 + s.weather.rain * 0.06 - s.light.daylight * 0.04, 0, 0.5);
        if (k < 0.03) return;
        // Painted once into a tiny canvas and stretched: a smooth gradient needs no resolution,
        // and a full-screen radial gradient every frame is expensive on phones.
        const key = `${s.W}x${s.H}|${k.toFixed(2)}`;
        if (key !== vignetteKey || !vignette) {
          const w = 64;
          const h = Math.max(16, Math.round((64 * s.H) / s.W));
          vignette ??= makeCanvas(w, h);
          vignette.width = w;
          vignette.height = h;
          const vx = ctx2d(vignette);
          const r0 = Math.min(w, h) * 0.35;
          const r1 = Math.hypot(w, h) * 0.62;
          const g = vx.createRadialGradient(w / 2, h * 0.48, r0, w / 2, h * 0.48, r1);
          const ink = shade(C.ink, -0.2);
          g.addColorStop(0, `rgba(${ink[0] | 0},${ink[1] | 0},${ink[2] | 0},0)`);
          g.addColorStop(1, `rgba(${ink[0] | 0},${ink[1] | 0},${ink[2] | 0},${k.toFixed(3)})`);
          vx.clearRect(0, 0, w, h);
          vx.fillStyle = g;
          vx.fillRect(0, 0, w, h);
          vignetteKey = key;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(vignette, 0, 0, s.W, s.H);
      },
    },
  ];
};

export default weather;
