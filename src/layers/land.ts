// Far shore: soft rolling green hills with a detailed tree line (big round leafy trees, pines and
// bushes, each with layered shading, leaf-cluster highlights, small trunks and ground shadows), a
// hazier row of small trees on the far hills, and a pale band where the land meets the lake.
// z 100–199. Background art: no outlines.

import { Baked, C, fbm1, mix, shade, smoothstep, vGrad, type ColorLike, type LayerModule, type RGB, type Rng, type Scene } from '../engine';

type Kind = 'round' | 'pine' | 'bush';

interface Lobe {
  dx: number;
  dy: number;
  r: number;
}

interface Tree {
  kind: Kind;
  x: number;
  /** Ground y at the trunk. */
  y: number;
  /** Canopy radius (round/bush) or half-width (pine). */
  R: number;
  far: boolean;
  /** -1..1 color variation: negative = bluer, positive = yellower. */
  tint: number;
  lobes: Lobe[];
  /** Pine: number of tiers and height factor. */
  tiers: number;
  tall: number;
  seed: number;
}

/** Ridge height above the horizon at column x. */
function ridge(s: Scene, x: number, far: boolean): number {
  const H = s.H;
  if (far) return H * (0.045 + 0.04 * fbm1(x * 0.0042 + 3.1, 3, 11));
  return H * (0.022 + 0.042 * fbm1(x * 0.0055 + 9.7, 3, 23));
}

/** A dome of lobes for a round tree or bush (offsets in units of R, origin at the ground). */
function makeLobes(r: Rng, kind: Kind): Lobe[] {
  const j = (v: number): number => v + r.range(-0.07, 0.07);
  if (kind === 'bush') {
    return [
      { dx: j(-0.55), dy: j(-0.42), r: j(0.48) },
      { dx: j(0.5), dy: j(-0.4), r: j(0.46) },
      { dx: j(0), dy: j(-0.62), r: j(0.58) },
    ];
  }
  const lobes: Lobe[] = [
    { dx: j(0), dy: j(-1.42), r: j(0.5) }, // crown
    { dx: j(-0.5), dy: j(-1.12), r: j(0.46) },
    { dx: j(0.52), dy: j(-1.1), r: j(0.44) },
    { dx: j(-0.78), dy: j(-0.68), r: j(0.4) },
    { dx: j(0.8), dy: j(-0.66), r: j(0.39) },
    { dx: j(-0.28), dy: j(-0.62), r: j(0.48) },
    { dx: j(0.3), dy: j(-0.6), r: j(0.47) },
  ];
  if (r.chance(0.5)) lobes.push({ dx: j(r.sign() * 0.25), dy: j(-1.62), r: j(0.32) });
  return lobes;
}

const land: LayerModule = (s) => {
  let trees: Tree[] = [];
  const baked = new Baked();

  // ------------------------------------------------------------ placement

  const build = (s: Scene): void => {
    const r = s.rng('land.trees');
    const u = s.u;
    const hz = s.layout.horizon;
    trees = [];
    const add = (kind: Kind, x: number, far: boolean, R: number): void => {
      const y = hz - ridge(s, x, far) + (kind === 'bush' ? R * 0.3 : R * 0.25);
      trees.push({
        kind,
        x,
        y,
        R,
        far,
        tint: r.range(-1, 1),
        lobes: makeLobes(r, kind),
        tiers: r.int(3, 4),
        tall: r.range(2.1, 2.7),
        seed: r.next(),
      });
    };

    // Far row: small, hazy, mostly round with a few pines.
    for (let x = -20 * u; x < s.W + 30 * u; x += r.range(26, 44) * u) {
      add(r.chance(0.25) ? 'pine' : 'round', x, true, r.range(6.5, 10) * u);
    }
    // Near row: clusters like the picture (a big tree, a smaller one, sometimes a pine), bushes between.
    let x = -14 * u;
    while (x < s.W + 40 * u) {
      const big = r.range(15, 21) * u;
      const n = r.int(2, 3);
      for (let i = 0; i < n; i++) {
        const kind: Kind = i > 0 && r.chance(0.32) ? 'pine' : 'round';
        const R = i === 0 ? big : big * r.range(0.62, 0.85);
        add(kind, x + (i === 0 ? 0 : r.sign() * big * r.range(0.9, 1.35)), false, kind === 'pine' ? R * 0.62 : R);
      }
      // Bushes at the feet of the cluster.
      add('bush', x + r.range(-1.2, 1.2) * big, false, r.range(6.5, 9.5) * u);
      if (r.chance(0.5)) add('bush', x + r.range(1.4, 2.2) * big * r.sign(), false, r.range(5.5, 8) * u);
      x += big * r.range(2.6, 4.4) + r.range(4, 26) * u;
    }

    // Keep the tallest crowns near the picture's tree line (≈0.315H).
    for (const t of trees) {
      if (t.far) continue;
      const top = t.y - (t.kind === 'pine' ? t.R * t.tall : t.kind === 'bush' ? t.R * 1.15 : t.R * 1.95);
      const limit = s.layout.hillTop - 6 * u;
      if (top < limit) t.y += limit - top;
    }
    // Back to front: the far row, then near trees from higher (farther) to lower, bushes last.
    const rank = (t: Tree): number => (t.far ? 0 : t.kind === 'bush' ? 2 : 1);
    trees.sort((a, b) => rank(a) - rank(b) || a.y - b.y);
  };

  // ------------------------------------------------------------ painting

  /** Tree colors with a little per-tree variation, all mixed from the palette. */
  const tones = (t: Tree): { deep: RGB; dark: RGB; mid: RGB; light: RGB; hi: RGB } => {
    const warm = Math.max(0, t.tint) * 0.22;
    const cool = Math.max(0, -t.tint) * 0.18;
    const vary = (c: ColorLike): RGB => mix(mix(c, C.green[3], warm), C.teal[1], cool);
    if (t.kind === 'pine') {
      return {
        deep: vary(mix(C.tree.deep, C.teal[0], 0.35)),
        dark: vary(mix(C.tree.deep, C.teal[1], 0.18)),
        mid: vary(mix(C.tree.dark, C.teal[1], 0.15)),
        light: vary(mix(C.tree.mid, C.tree.light, 0.35)),
        hi: vary(C.tree.light),
      };
    }
    return {
      deep: vary(C.tree.deep),
      dark: vary(C.tree.dark),
      mid: vary(C.tree.mid),
      light: vary(C.tree.light),
      hi: vary(shade(C.tree.light, 0.28)),
    };
  };

  const fillLobes = (ctx: CanvasRenderingContext2D, t: Tree, ox: number, oy: number, k: number): void => {
    ctx.beginPath();
    for (const l of t.lobes) {
      const cx = t.x + (l.dx + ox) * t.R;
      const cy = t.y + (l.dy + oy) * t.R;
      const rr = l.r * t.R * k;
      ctx.moveTo(cx + rr, cy);
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  const paintRound = (ctx: CanvasRenderingContext2D, t: Tree, depth: number): void => {
    const c = tones(t);
    const col = (x: ColorLike): string => s.col(x, depth);
    const R = t.R;
    // Ground shadow on the hill.
    ctx.fillStyle = s.colA(C.hill.shadow, t.far ? 0.25 : 0.4, depth);
    ctx.beginPath();
    ctx.ellipse(t.x + R * 0.12, t.y + R * 0.02, R * (t.kind === 'bush' ? 1.05 : 0.95), R * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    // Trunk peeking under the canopy.
    if (t.kind === 'round' && !t.far) {
      ctx.fillStyle = col(C.tree.trunk);
      ctx.beginPath();
      ctx.roundRect(t.x - R * 0.09, t.y - R * 0.55, R * 0.18, R * 0.58, R * 0.05);
      ctx.fill();
      ctx.fillStyle = col(shade(C.tree.trunk, -0.25));
      ctx.fillRect(t.x + R * 0.01, t.y - R * 0.55, R * 0.08, R * 0.56);
    }
    // 1. Shadow body (slightly bigger, down-right): the soft dark rim.
    ctx.fillStyle = col(c.deep);
    fillLobes(ctx, t, 0.05, 0.06, 1.04);
    // 2. Main body in two tones.
    ctx.fillStyle = col(c.dark);
    fillLobes(ctx, t, 0.01, 0.01, 1);
    ctx.fillStyle = col(c.mid);
    fillLobes(ctx, t, -0.035, -0.045, 0.9);
    // 3. Sunlit top-left on the upper lobes only (lower lobes stay in the mid tone).
    ctx.fillStyle = col(c.light);
    ctx.beginPath();
    for (const l of t.lobes) {
      if (t.kind !== 'bush' && l.dy > -0.85) continue;
      if (t.kind === 'bush' && l.dy > -0.55) continue;
      const rr = l.r * R * 0.5;
      const cx = t.x + (l.dx - l.r * 0.3) * R;
      const cy = t.y + (l.dy - l.r * 0.32) * R;
      ctx.moveTo(cx + rr, cy);
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    }
    ctx.fill();
    if (t.far) return;
    // 4. Leaf-cluster highlights: little scallops along the lit edge of the upper lobes.
    ctx.fillStyle = col(c.hi);
    ctx.beginPath();
    for (const l of t.lobes) {
      if (t.kind !== 'bush' && l.dy > -1.0) continue;
      if (t.kind === 'bush' && l.dy > -0.55) continue;
      for (let i = 0; i < 3; i++) {
        const a = -2.35 + i * 0.42 + Math.sin(t.seed * 50 + i) * 0.12;
        const rr = l.r * R * (0.16 - i * 0.025);
        const cx = t.x + (l.dx - l.r * 0.3 + Math.cos(a) * l.r * 0.42) * R;
        const cy = t.y + (l.dy - l.r * 0.34 + Math.sin(a) * l.r * 0.42) * R;
        ctx.moveTo(cx + rr, cy);
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    // 5. One soft shadow band under the upper canopy (offset to the right, away from the light).
    if (t.kind === 'round') {
      ctx.fillStyle = s.colA(c.deep, 0.4, depth);
      ctx.beginPath();
      ctx.ellipse(t.x + R * 0.18, t.y - R * 0.86, R * 0.42, R * 0.07, -0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const paintPine = (ctx: CanvasRenderingContext2D, t: Tree, depth: number): void => {
    const c = tones(t);
    const col = (x: ColorLike): string => s.col(x, depth);
    const W = t.R;
    const Ht = t.R * t.tall;
    // Ground shadow and trunk.
    ctx.fillStyle = s.colA(C.hill.shadow, t.far ? 0.25 : 0.4, depth);
    ctx.beginPath();
    ctx.ellipse(t.x + W * 0.1, t.y + W * 0.04, W * 0.9, W * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col(C.tree.trunk);
    ctx.fillRect(t.x - W * 0.12, t.y - W * 0.5, W * 0.24, W * 0.54);
    // Tiers from the bottom up, each a soft triangle with a scalloped hem.
    const n = t.tiers;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const yb = t.y - W * 0.35 - f * Ht * 0.78;
      const yt = yb - Ht * (0.42 - f * 0.06);
      const hw = W * (1 - f * 0.55);
      const tier = (ox: number, oy: number, k: number): void => {
        const x0 = t.x + ox * W;
        ctx.beginPath();
        ctx.moveTo(x0, yt + oy * W);
        ctx.quadraticCurveTo(x0 + hw * 0.35 * k, yt + (yb - yt) * 0.45, x0 + hw * k, yb + oy * W);
        const bumps = 3;
        for (let b = bumps; b > 0; b--) {
          const xa = x0 - hw * k + ((b - 0.5) / bumps) * 2 * hw * k;
          const xe = x0 - hw * k + ((b - 1) / bumps) * 2 * hw * k;
          ctx.quadraticCurveTo(xa, yb + oy * W + W * 0.22 * k, xe, yb + oy * W);
        }
        ctx.quadraticCurveTo(x0 - hw * 0.35 * k, yt + (yb - yt) * 0.45, x0, yt + oy * W);
        ctx.closePath();
        ctx.fill();
      };
      ctx.fillStyle = col(c.deep);
      tier(0.05, 0.05, 1.04);
      ctx.fillStyle = col(c.mid);
      tier(0, 0, 1);
      // Lit left half.
      ctx.save();
      ctx.beginPath();
      ctx.rect(t.x - W * 1.2, yt - W, W * 1.12, yb - yt + W * 1.4);
      ctx.clip();
      ctx.fillStyle = col(c.light);
      tier(-0.04, -0.02, 0.86);
      ctx.restore();
      if (!t.far) {
        ctx.fillStyle = col(c.hi);
        ctx.beginPath();
        ctx.ellipse(t.x - hw * 0.42, yb - (yb - yt) * 0.3, hw * 0.12, (yb - yt) * 0.09, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  const paintTree = (ctx: CanvasRenderingContext2D, t: Tree): void => {
    const depth = t.far ? 0.42 : t.kind === 'bush' ? 0.06 : 0.08;
    if (t.kind === 'pine') paintPine(ctx, t, depth);
    else paintRound(ctx, t, depth);
  };

  const paintHills = (ctx: CanvasRenderingContext2D): void => {
    const hz = s.layout.horizon;
    const u = s.u;
    const W = s.W;
    const step = 6 * u;

    const hillPath = (far: boolean): void => {
      ctx.beginPath();
      ctx.moveTo(-10, hz + 1);
      for (let x = -10; x <= W + step; x += step) ctx.lineTo(x, hz - ridge(s, x, far));
      ctx.lineTo(W + 10, hz + 1);
      ctx.closePath();
    };

    // Far hills: pale, hazy, with their own small trees.
    hillPath(true);
    ctx.fillStyle = vGrad(ctx, hz - s.H * 0.09, hz, [
      [0, s.col(C.hill.far, 0.45)],
      [1, s.col(mix(C.hill.far, C.hill.light, 0.5), 0.4)],
    ]);
    ctx.fill();
    for (const t of trees) if (t.far) paintTree(ctx, t);

    // Near hills.
    hillPath(false);
    ctx.fillStyle = vGrad(ctx, hz - s.H * 0.07, hz, [
      [0, s.col(shade(C.hill.light, 0.06), 0.16)],
      [0.55, s.col(mix(C.hill.light, C.hill.mid, 0.55), 0.14)],
      [1, s.col(C.hill.mid, 0.12)],
    ]);
    ctx.fill();
    // Sunlit rim along the near ridge.
    ctx.beginPath();
    for (let x = -10; x <= W + step; x += step) {
      const y = hz - ridge(s, x, false) + 1.2 * u;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = s.colA(shade(C.hill.light, 0.28), 0.75, 0.16);
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();

    for (const t of trees) if (!t.far) paintTree(ctx, t);

    // Pale band where the land meets the lake.
    ctx.fillStyle = vGrad(ctx, hz - 7 * u, hz + 1, [
      [0, s.colA(C.shore.haze, 0, 0.1)],
      [1, s.colA(C.shore.haze, 0.85, 0.1)],
    ]);
    ctx.fillRect(0, hz - 7 * u, W, 8 * u);
  };

  return [
    {
      id: 'land.hills',
      z: 120,
      resize(s) {
        build(s);
      },
      draw(s, ctx) {
        const hz = s.layout.horizon;
        const top = Math.max(0, s.layout.hillTop - 70 * s.u);
        const fogK = smoothstep(0, 1, s.weather.fog);
        baked.draw(ctx, `${s.light.key}|${fogK.toFixed(2)}`, { x: 0, y: top, w: s.W, h: hz - top + 2 }, s.dpr, paintHills);
      },
    },
  ];
};

export default land;
