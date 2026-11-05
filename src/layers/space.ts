// Space: the night sky's show. Milky Way band, a small ringed planet with a tiny moon, a fish-shaped
// constellation, northern lights, a drifting satellite, shooting stars with regular meteor showers and
// rare fireballs, and a "wishing star" that falls into the lake with a splash.
// Everything here is emitted light (ungraded) and fades with s.light.stars (which already accounts
// for clouds and fog), so it shows at night and around dusk/dawn only.
// z 2–25 behind the clouds, plus z 404 for the wishing star's fall into the lake.

import { C, clamp, css, ctx2d, glow, makeCanvas, mix, noise1, rgb, smoothstep, sparkle, Baked, type LayerModule, type Pt, type RGB, type Scene } from '../engine';

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  len: number;
  w: number;
  col: RGB;
  fire: boolean;
  dropT: number;
}

interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
  col: RGB;
}

interface Wish {
  a: Pt;
  c: Pt;
  b: Pt;
  t: number;
  dur: number;
  trail: Pt[];
}

/** Fish constellation: stars (relative units) and the lines between them. */
const FISH_STARS: Array<[number, number, number]> = [
  [0, 0, 1.3],
  [0.8, -0.38, 1],
  [1.7, -0.32, 1.1],
  [2.5, 0, 1.2],
  [3.15, -0.48, 1],
  [3.05, 0.5, 1],
  [1.6, 0.42, 0.9],
  [0.75, 0.33, 0.9],
  [0.42, -0.06, 0.7],
];
const FISH_LINES: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 3], [3, 6], [6, 7], [7, 0]];

const space: LayerModule = (s) => {
  const rnd = s.rng('space');
  const milky = new Baked();
  const meteors: Meteor[] = [];
  const debris: Debris[] = [];
  let nextMeteor = 2;
  let nextShower = 18;
  let showerLeft = 0;
  let showerGap = 0;
  let showerDir = 0;
  let radiant: Pt = { x: 0, y: 0 };
  let wish: Wish | null = null;
  let wishGlow: { x: number; y: number; t: number } | null = null;
  let nextWish = 24;
  let sat: { x: number; y: number; vx: number } | null = null;
  let nextSat = 10;

  // Aurora curtain strips: a 1px-wide vertical gradient per color, stretched into columns.
  const auroraCols: RGB[] = [mix(C.green[3], C.teal[3], 0.45), mix(C.purple[3], C.pink[3], 0.5)];
  const strips = auroraCols.map((c) => {
    const cv = makeCanvas(1, 128);
    const x = ctx2d(cv);
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, css(c, 0));
    g.addColorStop(0.55, css(c, 0.22));
    g.addColorStop(0.88, css(c, 0.85));
    g.addColorStop(1, css(c, 0.15));
    x.fillStyle = g;
    x.fillRect(0, 0, 1, 128);
    return cv;
  });

  // The aurora is painted into a small offscreen canvas at ~1/4 resolution, re-painted about every
  // AURORA_DT seconds (every 3 frames at 60 fps) and composited with one drawImage per frame. Its
  // overall strength k is applied at composite time, so fades never force a re-paint.
  const AURORA_RES = 0.25;
  const AURORA_DT = 0.05;
  const aurCanvas = makeCanvas(1, 1);
  let aurCtx = ctx2d(aurCanvas);
  let aurT = Number.NEGATIVE_INFINITY;
  let aurKey = '';
  /** Rows of the offscreen canvas the last paint touched (only those are composited). */
  let aurY0 = 0;
  let aurY1 = 0;

  const night = (s: Scene): number => s.light.stars;

  const clipSky = (ctx: CanvasRenderingContext2D): void => {
    ctx.beginPath();
    ctx.rect(0, 0, s.W, s.layout.horizon);
    ctx.clip();
  };

  // ------------------------------------------------------------ Milky Way (baked once per size)

  const paintMilkyWay = (ctx: CanvasRenderingContext2D): void => {
    const r = s.rng('space.milkyway');
    const W = s.W;
    const hz = s.layout.horizon;
    const H = s.H;
    const a = { x: -0.15 * W, y: hz * 0.92 };
    const b = { x: 1.15 * W, y: -0.05 * hz };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    const nx = -dy / L;
    const ny = dx / L;
    const bw = 0.16 * H;
    const gauss = (): number => (r.next() + r.next() + r.next() - 1.5) / 1.5;
    const tints = [C.purple[3], C.blue[3], C.pink[3], C.teal[3]];
    // Soft glowing dust.
    for (let i = 0; i < 46; i++) {
      const t = r.next();
      const o = gauss() * bw * 0.5;
      const x = a.x + dx * t + nx * o;
      const y = a.y + dy * t + ny * o;
      const rad = r.range(0.05, 0.12) * H;
      const c = rgb(r.pick(tints));
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const al = r.range(0.05, 0.11);
      g.addColorStop(0, css(c, al));
      g.addColorStop(1, css(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // Dark dust lanes along the middle.
    for (let i = 0; i < 9; i++) {
      const t = r.range(0.05, 0.95);
      const o = gauss() * bw * 0.12;
      const x = a.x + dx * t + nx * o;
      const y = a.y + dy * t + ny * o;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.atan2(dy, dx));
      const rad = r.range(0.04, 0.08) * H;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      const dk = rgb(C.purple[0]);
      g.addColorStop(0, css(dk, 0.22));
      g.addColorStop(1, css(dk, 0));
      ctx.scale(2.6, 0.55);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Dense tiny stars inside the band.
    const n = Math.round(160 * clamp(W / 390, 1, 3));
    ctx.fillStyle = s.raw(C.light.star);
    for (let i = 0; i < n; i++) {
      const t = r.next();
      const o = gauss() * bw * 0.42;
      const x = a.x + dx * t + nx * o;
      const y = a.y + dy * t + ny * o;
      if (y > hz) continue;
      ctx.globalAlpha = r.range(0.25, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r.range(0.35, 0.95) * s.u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // ------------------------------------------------------------ aurora (low-res offscreen)

  /** Paint both curtain colors into the offscreen canvas `c` (q offscreen px per CSS px), full strength. */
  const paintAurora = (c: CanvasRenderingContext2D, q: number, pw: number, ph: number): void => {
    let top = Infinity;
    let bot = -Infinity;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, pw, ph);
    c.setTransform(q, 0, 0, q, 0, 0);
    c.globalCompositeOperation = 'lighter';
    const u = s.u;
    const H = s.H;
    const hz = s.layout.horizon;
    // Columns sit on whole offscreen pixels (drawImage doesn't anti-alias rects of 1px or more, so
    // fractional ones snap): spacing S px, width 2S px, so every pixel is covered by exactly two.
    // Alpha x0.9 keeps the old full-resolution brightness (columns 1.8 steps wide, ~1.8x overlap).
    const S = Math.max(1, Math.round(4 * u * q));
    const step = S / q;
    for (let i = 0; i < strips.length; i++) {
      const strip = strips[i];
      for (let px = -S; px < pw; px += S) {
        const x0 = px / q;
        const x = x0 + step; // column centre, where the curtain is sampled
        // Low-frequency noise so neighbouring columns blend into soft, slowly folding curtains.
        const by =
          hz * (0.74 + 0.07 * i) +
          Math.sin(x * 0.0035 + s.t * 0.1 + i * 2.1) * 0.035 * H +
          (noise1(x * 0.0022 + s.t * 0.04, 40 + i) - 0.5) * 0.05 * H;
        const h = (0.07 + 0.11 * noise1(x * 0.0032 + s.t * 0.12, 60 + i)) * H;
        const band = smoothstep(0.25, 0.65, noise1(x * 0.0028 - s.t * 0.06, 80 + i));
        const a = band * (i === 0 ? 0.62 : 0.46) * 0.9;
        if (a < 0.01) continue;
        c.globalAlpha = a;
        c.drawImage(strip, x0, by - h, step * 2, h);
        if (by - h < top) top = by - h;
        if (by > bot) bot = by;
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // Offscreen rows in use, with a 2px margin so the upscale's filtering never meets a hard edge.
    aurY0 = top < bot ? Math.max(0, Math.floor(top * q) - 2) : 0;
    aurY1 = top < bot ? Math.min(ph, Math.ceil(bot * q) + 2) : 0;
  };

  // ------------------------------------------------------------ meteors

  const spawnMeteor = (s: Scene, shower: boolean): void => {
    const u = s.u;
    const hz = s.layout.horizon;
    const fire = !shower && rnd.chance(0.12);
    let x: number;
    let y: number;
    let ang: number;
    if (shower) {
      ang = showerDir + rnd.range(-0.05, 0.05);
      const off = rnd.range(-0.35, 0.35) * s.W;
      x = radiant.x + Math.cos(ang + Math.PI / 2) * off;
      y = radiant.y + Math.sin(ang + Math.PI / 2) * off * 0.4 + rnd.range(0, 0.12) * hz;
    } else {
      const right = rnd.chance(0.5);
      ang = right ? rnd.range(0.32, 0.62) : Math.PI - rnd.range(0.32, 0.62);
      x = rnd.range(0.1, 0.9) * s.W;
      y = rnd.range(0.02, 0.35) * hz;
    }
    const speed = (fire ? rnd.range(260, 320) : rnd.range(420, 640)) * u;
    const warm = fire || rnd.chance(0.25);
    meteors.push({
      x,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      age: 0,
      life: fire ? rnd.range(1.3, 1.7) : rnd.range(0.45, 0.95),
      len: (fire ? rnd.range(170, 240) : rnd.range(50, 120)) * u,
      w: (fire ? 3.4 : rnd.range(1.4, 2.3)) * u,
      col: warm ? mix(C.yellow[3], C.orange[3], fire ? 0.5 : 0.2) : rnd.chance(0.5) ? rgb(C.light.star) : rgb(C.blue[3]),
      fire,
      dropT: 0,
    });
  };

  const drawMeteor = (ctx: CanvasRenderingContext2D, m: Meteor, k: number): void => {
    const p = m.age / m.life;
    const env = Math.pow(Math.sin(Math.PI * clamp(p, 0, 1)), 0.6) * k;
    if (env < 0.01) return;
    const sp = Math.hypot(m.vx, m.vy);
    const ux = m.vx / sp;
    const uy = m.vy / sp;
    const len = m.len * (0.4 + 0.6 * Math.min(1, p * 3));
    const tx = m.x - ux * len;
    const ty = m.y - uy * len;
    const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
    g.addColorStop(0, css(m.col, 0.95 * env));
    g.addColorStop(0.3, css(m.col, 0.45 * env));
    g.addColorStop(1, css(m.col, 0));
    ctx.lineCap = 'round';
    // Soft wide glow, then the bright core.
    ctx.strokeStyle = g;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = m.w * 3.2;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = m.w;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    glow(ctx, m.x, m.y, m.w * (m.fire ? 7 : 4.5), m.col, 0.75 * env);
    sparkle(ctx, m.x, m.y, m.w * (m.fire ? 2.4 : 1.6), s.raw(mix(m.col, C.light.star, 0.6), env));
  };

  return [
    {
      id: 'space.milkyway',
      z: 3,
      draw(s, ctx) {
        const k = night(s);
        if (k < 0.02) return;
        ctx.globalAlpha = k * 0.9;
        milky.draw(ctx, 'mw', { x: 0, y: 0, w: s.W, h: s.layout.horizon }, s.dpr, paintMilkyWay);
        ctx.globalAlpha = 1;
      },
    },

    {
      id: 'space.planet',
      z: 6,
      draw(s, ctx) {
        const k = night(s);
        if (k < 0.03) return;
        clipSky(ctx);
        const u = s.u;
        const st = s.layout.stage;
        const x = st.x0 + st.w * 0.2;
        const y = s.H * 0.085;
        const r = 8.5 * u;
        const tilt = -0.38;
        const ringA = css(rgb(C.purple[3]), 0.75 * k);
        const moonA = (s.t / 11) * Math.PI * 2;
        const mx = x + Math.cos(moonA) * r * 2.6;
        const my = y + Math.sin(moonA) * r * 0.75 - Math.cos(moonA) * r * 0.25;
        const moonBehind = Math.sin(moonA) < 0;
        glow(ctx, x, y, r * 3.2, C.pink[3], 0.22 * k);
        const ring = (a0: number, a1: number): void => {
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.9, r * 0.5, tilt, a0, a1);
          ctx.strokeStyle = ringA;
          ctx.lineWidth = 1.8 * u;
          ctx.stroke();
        };
        if (moonBehind) {
          ctx.fillStyle = css(rgb(C.light.moon), 0.85 * k);
          ctx.beginPath();
          ctx.arc(mx, my, 1.8 * u, 0, Math.PI * 2);
          ctx.fill();
        }
        ring(Math.PI, Math.PI * 2);
        const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        g.addColorStop(0, css(rgb(C.orange[3]), k));
        g.addColorStop(1, css(rgb(C.pink[2]), k));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        // Soft bands.
        ctx.save();
        ctx.clip();
        ctx.fillStyle = css(rgb(C.pink[1]), 0.35 * k);
        ctx.fillRect(x - r, y - r * 0.15, r * 2, r * 0.28);
        ctx.fillStyle = css(rgb(C.yellow[3]), 0.35 * k);
        ctx.fillRect(x - r, y - r * 0.6, r * 2, r * 0.2);
        ctx.restore();
        ring(0, Math.PI);
        if (!moonBehind) {
          ctx.fillStyle = css(rgb(C.light.moon), 0.9 * k);
          ctx.beginPath();
          ctx.arc(mx, my, 1.8 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },

    {
      id: 'space.constellation',
      z: 7,
      draw(s, ctx) {
        const k = night(s);
        if (k < 0.05) return;
        clipSky(ctx);
        const u = s.u;
        const st = s.layout.stage;
        const ox = st.x0 + st.w * 0.36;
        const oy = s.H * 0.062;
        const sc = 25 * u;
        const breathe = 0.5 + 0.5 * Math.sin(s.t * 0.35);
        ctx.strokeStyle = css(rgb(C.blue[3]), 0.32 * k * (0.35 + 0.65 * breathe));
        ctx.lineWidth = 1 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [i, j] of FISH_LINES) {
          const a = FISH_STARS[i];
          const b = FISH_STARS[j];
          ctx.moveTo(ox + a[0] * sc, oy + a[1] * sc);
          ctx.lineTo(ox + b[0] * sc, oy + b[1] * sc);
        }
        ctx.stroke();
        FISH_STARS.forEach(([fx, fy, size], i) => {
          const tw = 0.7 + 0.3 * Math.sin(s.t * 2.2 + i * 1.9);
          const x = ox + fx * sc;
          const y = oy + fy * sc;
          glow(ctx, x, y, 5 * u * size, C.light.star, 0.35 * k * tw);
          sparkle(ctx, x, y, 2.6 * u * size * tw, s.raw(C.light.star, k));
        });
      },
    },

    {
      id: 'space.aurora',
      z: 8,
      draw(s, ctx) {
        const base = night(s);
        if (base < 0.05) return;
        const k = base * (0.4 + 0.6 * smoothstep(0.3, 0.7, noise1(s.t * 0.02 + 1.3, 17)));
        if (k < 0.03) return;
        const hz = s.layout.horizon;
        const q = AURORA_RES * s.dpr;
        const pw = Math.max(1, Math.ceil(s.W * q));
        const ph = Math.max(1, Math.ceil(hz * q));
        if (aurCanvas.width !== pw || aurCanvas.height !== ph) {
          aurCanvas.width = pw;
          aurCanvas.height = ph;
          aurCtx = ctx2d(aurCanvas);
        }
        const key = `${pw}x${ph}|${s.W}x${hz}|${s.u}`;
        if (key !== aurKey || Math.abs(s.t - aurT) >= AURORA_DT) {
          paintAurora(aurCtx, q, pw, ph);
          aurKey = key;
          aurT = s.t;
        }
        clipSky(ctx);
        ctx.imageSmoothingEnabled = true;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        if (aurY1 > aurY0) ctx.drawImage(aurCanvas, 0, aurY0, pw, aurY1 - aurY0, 0, aurY0 / q, pw / q, (aurY1 - aurY0) / q);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    {
      id: 'space.satellite',
      z: 9,
      update(s, dt) {
        if (night(s) < 0.5) {
          sat = null;
          return;
        }
        nextSat -= dt;
        if (!sat && nextSat <= 0) {
          sat = { x: -10, y: rnd.range(0.04, 0.16) * s.H, vx: rnd.range(14, 20) * s.u };
          nextSat = rnd.range(35, 70);
        }
        if (sat) {
          sat.x += sat.vx * dt;
          sat.y -= sat.vx * 0.05 * dt;
          if (sat.x > s.W + 10) sat = null;
        }
      },
      draw(s, ctx) {
        if (!sat) return;
        const k = night(s);
        const u = s.u;
        ctx.fillStyle = s.raw(C.light.star, 0.85 * k);
        ctx.beginPath();
        ctx.arc(sat.x, sat.y, 1.2 * u, 0, Math.PI * 2);
        ctx.fill();
        if (Math.sin(s.t * 5) > 0.75) glow(ctx, sat.x, sat.y, 4 * u, C.red[3], 0.8 * k);
      },
    },

    {
      id: 'space.meteors',
      z: 22,
      update(s, dt) {
        const k = night(s);
        const u = s.u;
        if (k > 0.3) {
          nextMeteor -= dt;
          if (nextMeteor <= 0) {
            spawnMeteor(s, false);
            nextMeteor = rnd.range(2.2, 5.5);
          }
          nextShower -= dt;
          if (nextShower <= 0 && showerLeft === 0) {
            showerLeft = rnd.int(8, 13);
            showerGap = 0;
            const fromRight = rnd.chance(0.6);
            radiant = { x: fromRight ? s.W * 1.02 : -s.W * 0.02, y: -0.02 * s.H };
            showerDir = fromRight ? Math.PI - rnd.range(0.45, 0.6) : rnd.range(0.45, 0.6);
            nextShower = rnd.range(32, 55);
          }
          if (showerLeft > 0) {
            showerGap -= dt;
            if (showerGap <= 0) {
              spawnMeteor(s, true);
              showerLeft--;
              showerGap = rnd.range(0.18, 0.55);
            }
          }
        }
        for (const m of meteors) {
          m.age += dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          if (m.fire) {
            m.dropT -= dt;
            if (m.dropT <= 0) {
              m.dropT = 0.04;
              debris.push({ x: m.x, y: m.y, vx: m.vx * 0.05 + rnd.range(-12, 12) * u, vy: m.vy * 0.05 + rnd.range(-6, 18) * u, age: 0, life: rnd.range(0.5, 1.1), r: rnd.range(1.4, 2.6) * u, col: m.col });
            }
          }
        }
        for (let i = meteors.length - 1; i >= 0; i--) if (meteors[i].age >= meteors[i].life) meteors.splice(i, 1);
        for (const d of debris) {
          d.age += dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vy += 20 * u * dt;
        }
        for (let i = debris.length - 1; i >= 0; i--) if (debris[i].age >= debris[i].life) debris.splice(i, 1);
      },
      draw(s, ctx) {
        if (!meteors.length && !debris.length) return;
        const k = clamp(night(s) * 1.4, 0, 1);
        clipSky(ctx);
        ctx.globalCompositeOperation = 'lighter';
        for (const m of meteors) drawMeteor(ctx, m, k);
        for (const d of debris) {
          const a = (1 - d.age / d.life) * k;
          sparkle(ctx, d.x, d.y, d.r * (0.6 + 0.4 * Math.sin(d.age * 30)), css(d.col, a));
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    },

    {
      id: 'space.wish',
      z: 404,
      update(s, dt) {
        const u = s.u;
        const L = s.layout;
        if (wishGlow) {
          wishGlow.t -= dt;
          if (wishGlow.t <= 0) wishGlow = null;
        }
        if (wish) {
          const w = wish;
          w.t += dt;
          const q = Math.min(1, w.t / w.dur);
          const e = q * q;
          const m = 1 - e;
          const p = { x: m * m * w.a.x + 2 * m * e * w.c.x + e * e * w.b.x, y: m * m * w.a.y + 2 * m * e * w.c.y + e * e * w.b.y };
          w.trail.push(p);
          if (w.trail.length > 26) w.trail.shift();
          if (rnd.chance(0.6)) debris.push({ x: p.x, y: p.y, vx: rnd.range(-15, 15) * u, vy: rnd.range(-5, 20) * u, age: 0, life: 0.7, r: rnd.range(1.4, 2.4) * u, col: rgb(C.light.sparkle) });
          if (q >= 1) {
            s.splash(w.b.x, w.b.y, { count: 10, power: 100, ripple: 30 * u });
            s.ripple(w.b.x, w.b.y, { maxR: 46 * u, life: 2.4, strength: 0.8 });
            s.sparkle(w.b.x, w.b.y - 4 * u, { count: 14, spread: 16, front: false });
            wishGlow = { x: w.b.x, y: w.b.y, t: 1.8 };
            s.emit('space:wish', { x: w.b.x, y: w.b.y });
            wish = null;
          }
          return;
        }
        if (night(s) < 0.55 || s.weather.rain > 0.2) return;
        nextWish -= dt;
        if (nextWish > 0) return;
        nextWish = rnd.range(35, 75);
        const st = L.stage;
        const x0 = Math.max(L.dock.farR.x + 60 * u, st.x0 + st.w * 0.45);
        const bx = rnd.range(x0, st.x0 + st.w * 0.95);
        const by = L.horizon + rnd.range(0.025, 0.09) * s.H;
        const dir = rnd.sign();
        const ax = bx - dir * rnd.range(90, 170) * u;
        const ay = rnd.range(0.03, 0.12) * s.H;
        wish = { a: { x: ax, y: ay }, c: { x: (ax + bx) / 2 - dir * 10 * u, y: ay - 20 * u }, b: { x: bx, y: by }, t: 0, dur: 1.7, trail: [] };
      },
      draw(s, ctx) {
        const u = s.u;
        if (wishGlow) {
          const a = Math.min(1, wishGlow.t / 1.8);
          glow(ctx, wishGlow.x, wishGlow.y, 34 * u, C.light.sparkle, 0.55 * a);
          ctx.save();
          ctx.translate(wishGlow.x, wishGlow.y);
          ctx.scale(1, 0.3);
          glow(ctx, 0, 0, 60 * u, C.light.sparkle, 0.35 * a);
          ctx.restore();
        }
        if (!wish || wish.trail.length < 2) return;
        const tr = wish.trail;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < tr.length; i++) {
          const f = i / tr.length;
          ctx.strokeStyle = s.raw(C.light.sparkle, 0.75 * f);
          ctx.lineWidth = (1 + 3 * f) * u;
          ctx.beginPath();
          ctx.moveTo(tr[i - 1].x, tr[i - 1].y);
          ctx.lineTo(tr[i].x, tr[i].y);
          ctx.stroke();
        }
        const h = tr[tr.length - 1];
        glow(ctx, h.x, h.y, 16 * u, C.light.sparkle, 0.9);
        sparkle(ctx, h.x, h.y, 7 * u * (0.85 + 0.15 * Math.sin(s.t * 30)), s.raw(C.white));
        for (const d of debris) {
          if (d.y < s.layout.horizon) continue;
          sparkle(ctx, d.x, d.y, d.r, css(d.col, 1 - d.age / d.life));
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    },
  ];
};

export default space;
