// Cattails with life: springy stems that wind gusts ripple through in a wave, cartoon wind swooshes,
// fluffy seeds drifting off the heads, raindrops splashing on them, a warm rim light at sunset,
// and a tap reaction (shake + a puff of seeds). Part of the dock module, z 352 and 358.

import { C, clamp, mix, shade, type Layer, type Pt, type Scene } from '../../engine';

interface Spring {
  /** Extra bend in radians and its angular velocity. */
  d: number;
  v: number;
}

interface Stem extends Spring {
  x: number;
  headTop: number;
  headBot: number;
  w: number;
  phase: number;
  lean: number;
  /** Last drawn tip and head centre (for perching critters and seed puffs). */
  tip: Pt;
  head: Pt;
}

interface Leaf extends Spring {
  x: number;
  tipX: number;
  tipY: number;
  w: number;
  flip: boolean;
  phase: number;
}

interface Clump {
  stems: Stem[];
  leaves: Leaf[];
  x0: number;
  x1: number;
  top: number;
  main: boolean;
}

interface Gust {
  x: number;
  speed: number;
  strength: number;
  y: number;
  lines: Array<{ dy: number; len: number; lag: number }>;
}

export interface Reeds {
  layers: Layer[];
  /** Tip points of the main clump's stems, updated every frame. */
  tips(): Pt[];
  /** Called when the reeds are tapped or a strong gust hits. */
  onStartle(fn: () => void): void;
}

const K = 36; // spring stiffness (≈1 Hz)
const DAMP = 3.0; // damping

export function createReeds(s: Scene): Reeds {
  let clumps: Clump[] = [];
  let gust: Gust | null = null;
  let nextGust = 2.2;
  const rnd = s.rng('dock.reeds.fx');
  const startle: Array<() => void> = [];

  const build = (s: Scene): void => {
    const st = s.layout.stage;
    const H = s.H;
    const u = s.u;
    const X = (f: number): number => st.x0 + f * st.w;
    const r = s.rng('dock.reeds');
    const stem = (x: number, top: number, bot: number, lean = 0): Stem => ({
      x,
      headTop: top * H,
      headBot: bot * H,
      w: 11 * u,
      phase: r.range(0, 6.28),
      lean,
      d: 0,
      v: 0,
      tip: { x, y: top * H - 14 * u },
      head: { x, y: ((top + bot) / 2) * H },
    });
    const leaf = (x: number, tipX: number, tipY: number, w: number, flip: boolean): Leaf => ({
      x,
      tipX,
      tipY,
      w,
      flip,
      phase: r.range(0, 6.28),
      d: 0,
      v: 0,
    });
    const finish = (c: Omit<Clump, 'x0' | 'x1' | 'top'>): Clump => {
      c.stems.sort((a, b) => a.headTop - b.headTop);
      const xs = c.stems.map((t) => t.x).concat(c.leaves.flatMap((l) => [l.x, l.tipX]));
      return { ...c, x0: Math.min(...xs), x1: Math.max(...xs), top: Math.min(...c.stems.map((t) => t.headTop)) - 16 * u };
    };

    clumps = [
      finish({
        main: true,
        stems: [
          stem(X(0.735), 0.712, 0.742, -0.02),
          stem(X(0.772), 0.6775, 0.704, -0.01),
          stem(X(0.822), 0.655, 0.683, 0),
          stem(X(0.885), 0.628, 0.664, 0.005),
          stem(X(0.872), 0.668, 0.696, -0.015),
          stem(X(0.961), 0.611, 0.645, 0.01),
          stem(X(1.01), 0.655, 0.686, 0.02),
        ],
        leaves: [
          leaf(X(0.75), X(0.6), H * 0.875, 24 * u, true),
          leaf(X(0.8), X(0.7), H * 0.835, 22 * u, true),
          leaf(X(0.88), X(0.9), H * 0.815, 20 * u, false),
          leaf(X(0.92), X(1.04), H * 0.85, 24 * u, false),
          leaf(X(0.85), X(0.74), H * 0.9, 26 * u, true),
        ],
      }),
    ];
    // Wide screens: smaller clumps near the edges so the sides aren't empty.
    const rightGap = s.W - (st.x0 + st.w);
    if (rightGap > 90 * u) {
      const bx = s.W - Math.min(rightGap * 0.45, 70 * u);
      clumps.push(
        finish({
          main: false,
          stems: [stem(bx - 18 * u, 0.7, 0.728), stem(bx, 0.672, 0.702), stem(bx + 20 * u, 0.69, 0.718)],
          leaves: [leaf(bx - 6 * u, bx - 50 * u, H * 0.87, 20 * u, true), leaf(bx + 8 * u, bx + 48 * u, H * 0.86, 20 * u, false)],
        }),
      );
    }
    if (st.x0 > 160 * u) {
      const bx = Math.min(st.x0 * 0.35, 90 * u);
      clumps.push(
        finish({
          main: false,
          stems: [stem(bx - 16 * u, 0.69, 0.718), stem(bx + 4 * u, 0.664, 0.694), stem(bx + 22 * u, 0.7, 0.728)],
          leaves: [leaf(bx - 4 * u, bx - 46 * u, H * 0.86, 20 * u, true), leaf(bx + 10 * u, bx + 50 * u, H * 0.88, 20 * u, false)],
        }),
      );
    }
  };

  /** Calm idle sway (small) + steady wind lean. Gusts and taps add spring bend on top. */
  const sway = (s: Scene, x: number, phase: number): number =>
    Math.sin(s.t * 0.9 + phase) * 0.016 + Math.sin(s.t * 2.3 + phase * 1.7) * 0.005 + s.windAt(x) * 0.03;

  const seeds = (st: Stem, n: number, burst = false): void => {
    const u = s.u;
    const wind = s.windAt(st.x);
    for (let i = 0; i < n; i++) {
      s.particle({
        x: st.head.x + rnd.range(-4, 4) * u,
        y: st.head.y + rnd.range(-9, 9) * u,
        vx: (burst ? rnd.range(-40, 40) : rnd.range(14, 30)) * u + wind * 40 * u,
        vy: -rnd.range(burst ? 18 : 5, burst ? 46 : 16) * u,
        g: -2.5 * u,
        drag: 0.45,
        life: rnd.range(3.5, 6.5),
        size: rnd.range(1.1, 1.9) * u,
        color: rnd.chance(0.7) ? C.white : C.sun.glow,
        windK: 0.7,
      });
    }
  };

  const shake = (c: Clump, x: number, power: number): void => {
    const u = s.u;
    for (const st of c.stems) {
      const dir = Math.sign(st.x - x) || 1;
      const k = clamp(1 - Math.abs(st.x - x) / (150 * u), 0.3, 1);
      st.v += dir * power * k;
      if (rnd.chance(0.75)) seeds(st, rnd.int(2, 4), true);
    }
    for (const lf of c.leaves) lf.v += (Math.sign(lf.x - x) || 1) * power * 0.5;
    for (const fn of startle) fn();
  };

  const drawStem = (ctx: CanvasRenderingContext2D, st: Stem): void => {
    const u = s.u;
    const baseY = s.H + 12 * u;
    const L = baseY - (st.headTop - 14 * u);
    const a = sway(s, st.x, st.phase) + st.lean + st.d;
    const top = { x: st.x + Math.sin(a) * L, y: baseY - Math.cos(a) * L };
    const ctrl = { x: st.x + Math.sin(a) * L * 0.35, y: baseY - L * 0.5 };
    const at = (t: number): Pt => {
      const v = 1 - t;
      return { x: v * v * st.x + 2 * v * t * ctrl.x + t * t * top.x, y: v * v * baseY + 2 * v * t * ctrl.y + t * t * top.y };
    };
    const out = s.col(C.outline);
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(st.x, baseY);
      ctx.quadraticCurveTo(ctrl.x, ctrl.y, top.x, top.y);
    };
    ctx.lineCap = 'round';
    path();
    ctx.strokeStyle = out;
    ctx.lineWidth = 7.4 * u;
    ctx.stroke();
    path();
    ctx.strokeStyle = s.col(C.reed.stem);
    ctx.lineWidth = 3.6 * u;
    ctx.stroke();

    // Head: a rounded capsule along the stem.
    const headLen = st.headBot - st.headTop;
    const p1 = at(1 - (14 * u) / L);
    const p0 = at(1 - (14 * u + headLen) / L);
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    st.tip = top;
    st.head = { x: cx, y: cy };
    const ang = Math.atan2(p1.x - p0.x, -(p1.y - p0.y));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const hw = st.w / 2;
    const hh = headLen / 2 + hw * 0.35;
    const capsule = (): void => {
      ctx.beginPath();
      ctx.moveTo(-hw, -hh + hw);
      ctx.arc(0, -hh + hw, hw, Math.PI, 0);
      ctx.lineTo(hw, hh - hw);
      ctx.arc(0, hh - hw, hw, 0, Math.PI);
      ctx.closePath();
    };
    capsule();
    ctx.fillStyle = s.col(C.reed.head);
    ctx.fill();
    ctx.fillStyle = s.col(C.reed.headHi);
    ctx.beginPath();
    ctx.ellipse(-hw * 0.38, -hh * 0.12, hw * 0.28, hh * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    // Warm rim light on the right side at sunrise and sunset.
    const g = s.light.golden;
    if (g > 0.04) {
      ctx.beginPath();
      ctx.moveTo(hw * 0.55, -hh + hw * 0.6);
      ctx.lineTo(hw * 0.55, hh - hw * 0.6);
      ctx.strokeStyle = s.raw(C.orange[3], 0.75 * g);
      ctx.lineWidth = 2 * u;
      ctx.stroke();
    }
    capsule();
    ctx.strokeStyle = out;
    ctx.lineWidth = 2.5 * u;
    ctx.stroke();
    ctx.restore();

    // Spike above the head.
    for (const [w, col] of [[3.6 * u, out], [1.4 * u, s.col(C.reed.stemHi)]] as const) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(top.x, top.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    }
  };

  const drawLeaf = (ctx: CanvasRenderingContext2D, lf: Leaf): void => {
    const u = s.u;
    const baseY = s.H + 10 * u;
    const a = sway(s, lf.x, lf.phase) * 0.6 + lf.d;
    const tip = { x: lf.tipX + Math.sin(a) * 34 * u, y: lf.tipY + Math.abs(a) * 12 * u };
    const dir = lf.flip ? -1 : 1;
    const mid = { x: lf.x + (tip.x - lf.x) * 0.38, y: tip.y - (baseY - tip.y) * 0.25 };
    const w = lf.w;
    const blade = (): void => {
      ctx.beginPath();
      ctx.moveTo(lf.x - w * 0.5, baseY);
      ctx.quadraticCurveTo(mid.x - dir * w * 0.6, mid.y - w * 0.3, tip.x, tip.y);
      ctx.quadraticCurveTo(mid.x + dir * w * 0.7, mid.y + w * 0.5, lf.x + w * 0.5, baseY);
      ctx.closePath();
    };
    blade();
    ctx.fillStyle = s.col(C.reed.leaf);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(lf.x, baseY);
    ctx.quadraticCurveTo(mid.x + dir * w * 0.1, mid.y + w * 0.1, tip.x, tip.y);
    ctx.quadraticCurveTo(mid.x + dir * w * 0.7, mid.y + w * 0.5, lf.x + w * 0.5, baseY);
    ctx.closePath();
    ctx.fillStyle = s.col(C.reed.leafDark);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(lf.x - w * 0.15, baseY - 10 * u);
    ctx.quadraticCurveTo(mid.x - dir * w * 0.25, mid.y + w * 0.1, tip.x - dir * 7 * u, tip.y + 5 * u);
    ctx.strokeStyle = s.colA(C.reed.leafHi, 0.6);
    ctx.lineWidth = 1.5 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
    blade();
    ctx.strokeStyle = s.col(C.outline);
    ctx.lineWidth = 2.5 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const layers: Layer[] = [
    {
      id: 'dock.reeds',
      z: 352,
      init(s) {
        // Tap the reeds: they shake and puff out seeds.
        s.view.addEventListener('pointerdown', (e) => {
          const r = s.view.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          for (const c of clumps) {
            if (x > c.x0 - 24 * s.u && x < c.x1 + 24 * s.u && y > c.top - 30 * s.u) {
              shake(c, x, 1.5);
              s.sparkle(x, y, { count: 4, spread: 10 });
              s.emit('reeds:tap', { x, y });
            }
          }
        });
      },
      resize(s) {
        build(s);
        gust = null;
      },
      update(s, dt) {
        const u = s.u;
        const w = s.weather;
        // Springs.
        for (const c of clumps) {
          for (const st of c.stems) {
            st.v += (-K * st.d - DAMP * st.v) * dt;
            st.d += st.v * dt;
          }
          for (const lf of c.leaves) {
            lf.v += (-K * 0.7 * lf.d - DAMP * lf.v) * dt;
            lf.d += lf.v * dt;
          }
        }
        // Gusts sweep left to right through every clump.
        nextGust -= dt * (0.55 + w.wind * 1.2 + w.storm);
        if (!gust && nextGust <= 0) {
          nextGust = rnd.range(3.2, 7.5);
          gust = {
            x: Math.min(...clumps.map((c) => c.x0)) - 90 * u,
            speed: (230 + 260 * w.wind) * u,
            strength: 0.4 + 0.75 * w.wind + 0.55 * w.storm,
            y: s.H * rnd.range(0.6, 0.72),
            lines: Array.from({ length: rnd.int(2, 3) }, (_, i) => ({ dy: (i - 1) * 16 * u + rnd.range(-5, 5) * u, len: rnd.range(36, 58) * u, lag: i * 22 * u })),
          };
        }
        if (gust) {
          const prev = gust.x;
          gust.x += gust.speed * dt;
          for (const c of clumps) {
            for (const st of c.stems) {
              if (st.x > prev && st.x <= gust.x) {
                st.v += gust.strength * rnd.range(0.75, 1.05);
                if (rnd.chance(0.25 + gust.strength * 0.4)) seeds(st, rnd.int(1, 2));
              }
            }
            for (const lf of c.leaves) if (lf.x > prev && lf.x <= gust.x) lf.v += gust.strength * 0.4;
          }
          if (gust.strength > 0.8 && prev < clumps[0].x0 && gust.x >= clumps[0].x0) for (const fn of startle) fn();
          if (gust.x > s.W + 220 * u) gust = null;
        }
        // Raindrops hitting the heads.
        if (w.rain > 0.15) {
          for (const c of clumps) {
            for (const st of c.stems) {
              if (!rnd.chance(dt * w.rain * 1.4)) continue;
              for (let i = 0; i < 3; i++) {
                s.particle({
                  x: st.head.x + rnd.range(-3, 3) * u,
                  y: st.head.y - 8 * u,
                  vx: rnd.range(-36, 36) * u,
                  vy: -rnd.range(30, 70) * u,
                  g: 520 * u,
                  life: 0.45,
                  size: 1.2 * u,
                  color: C.water.ripple,
                });
              }
              st.v += rnd.range(-0.12, 0.12);
            }
          }
        }
        // Now and then a single seed floats away even on calm days.
        if (w.rain < 0.2 && rnd.chance(dt * 0.12)) {
          const c = clumps[0];
          if (c) seeds(rnd.pick(c.stems), 1);
        }
      },
      draw(s, ctx) {
        for (const c of clumps) {
          for (const st of c.stems) drawStem(ctx, st);
          for (const lf of c.leaves) drawLeaf(ctx, lf);
        }
      },
    },
    {
      id: 'dock.wind',
      z: 358,
      draw(s, ctx) {
        if (!gust) return;
        const u = s.u;
        const a0 = clamp(gust.strength * 1.25, 0.4, 0.9) * (0.45 + 0.55 * s.light.daylight) * (1 - s.weather.rain * 0.5);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const col = mix(C.white, shade(C.water.ripple, 0.2), 0.3);
        for (const l of gust.lines) {
          const x = gust.x - l.lag;
          const y = gust.y + l.dy + Math.sin((x / u) * 0.03) * 3 * u;
          // Fade in as it enters the screen and out as it leaves.
          const a = a0 * clamp((x + 40 * u) / (120 * u), 0, 1) * clamp((s.W + 120 * u - x) / (160 * u), 0, 1);
          if (a < 0.02) continue;
          ctx.strokeStyle = s.colA(col, a);
          ctx.lineWidth = 2.6 * u;
          ctx.beginPath();
          ctx.moveTo(x - l.len, y + 3 * u);
          ctx.quadraticCurveTo(x - l.len * 0.45, y - 5 * u, x, y);
          // Little curl at the front.
          ctx.arc(x + 4 * u, y - 4.5 * u, 5 * u, Math.PI * 0.75, Math.PI * 2.05);
          ctx.stroke();
        }
      },
    },
  ];

  return {
    layers,
    tips: () => (clumps[0] ? clumps[0].stems.map((st) => st.tip) : []),
    onStartle: (fn) => startle.push(fn),
  };
}
