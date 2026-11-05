// Dock & shore: the wooden pier from the bottom-left corner out to the fisher, its shadow and posts,
// the cattail clump in the bottom-right, and small critters (dragonfly, butterfly, fireflies).
// z 265–329 (pier) and 350–369 (cattails, critters).

import {
  Baked,
  C,
  clamp,
  glow,
  mix,
  noise1,
  poly,
  shade,
  smoothstep,
  type LayerModule,
  type Pt,
  type Scene,
} from '../engine';
import { createReeds } from './dock/reeds';

interface Firefly {
  bx: number;
  by: number;
  phase: number;
  speed: number;
}

const dock: LayerModule = (s) => {
  const deck = new Baked();
  const reeds = createReeds(s);
  let fireflies: Firefly[] = [];
  const rnd = s.rng('dock.critters');

  // Dragonfly state.
  const fly = { x: 0, y: 0, tx: 0, ty: 0, mode: 'hover' as 'hover' | 'dart' | 'perch', timer: 2, face: 1, vis: 0, perch: 0 };
  reeds.onStartle(() => {
    if (fly.mode === 'dart') return;
    fly.mode = 'dart';
    fly.tx = fly.x + rnd.range(-90, 90) * s.u;
    fly.ty = fly.y - rnd.range(30, 70) * s.u;
    fly.face = fly.tx >= fly.x ? 1 : -1;
    fly.timer = 0.7;
  });
  // Butterfly state.
  let bfly: { x: number; y: number; vx: number; phase: number; hue: number } | null = null;
  let nextB = 9;

  // ------------------------------------------------------------ pier geometry

  const edgeX = (a: Pt, b: Pt, y: number): number => a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y));
  const leftX = (y: number): number => edgeX(s.layout.dock.farL, s.layout.dock.nearL, y);
  const rightX = (y: number): number => edgeX(s.layout.dock.farR, s.layout.dock.nearR, y);

  const paintDeck = (ctx: CanvasRenderingContext2D): void => {
    const d = s.layout.dock;
    const u = s.u;
    const H = s.H;
    const y0 = d.farL.y;
    const side = d.side;
    const endH = side * 1.05;
    const out = s.col(C.outline);
    const off = { x: side * 0.55, y: side * 0.95 };

    // Side face along the right edge and the end face under the far edge.
    poly(ctx, [d.farR, d.nearR, { x: d.nearR.x + off.x, y: d.nearR.y + off.y }, { x: d.farR.x + off.x, y: d.farR.y + off.y }], {
      fill: s.col(C.wood.side),
      stroke: out,
      line: 2.6 * u,
    });
    poly(ctx, [d.farL, d.farR, { x: d.farR.x + off.x, y: d.farR.y + off.y }, { x: d.farR.x + off.x * 0.2, y: d.farR.y + endH }, { x: d.farL.x, y: d.farL.y + endH }], {
      fill: s.col(mix(C.wood.side, C.wood.dark, 0.45)),
      stroke: out,
      line: 2.6 * u,
    });

    // Planks across the pier, thinner toward the far end.
    const bounds: number[] = [y0];
    let y = y0;
    while (y < H + 40 * u) {
      const t = clamp((y - y0) / (H - y0), 0, 1.2);
      y += (13.5 + 13 * t) * u;
      bounds.push(y);
    }
    const r = s.rng('dock.planks');
    for (let i = 0; i < bounds.length - 1; i++) {
      const ya = bounds[i];
      const yb = bounds[i + 1];
      const k = 0.78 + 0.42 * clamp((ya - y0) / (H - y0), 0, 1);
      const base = i % 2 === 0 ? C.wood.top : C.wood.alt;
      const tone = mix(base, C.wood.mid, r.range(0, 0.18));
      poly(ctx, [
        { x: leftX(ya), y: ya },
        { x: rightX(ya), y: ya },
        { x: rightX(yb), y: yb },
        { x: leftX(yb), y: yb },
      ], { fill: s.col(tone) });
      // Soft highlight along the plank's top edge.
      ctx.strokeStyle = s.colA(C.wood.hi, 0.75);
      ctx.lineWidth = 1.6 * u * k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(leftX(ya + 2 * u * k) + 3 * u, ya + 2 * u * k);
      ctx.lineTo(rightX(ya + 2 * u * k) - 3 * u, ya + 2 * u * k);
      ctx.stroke();
      // A short grain stroke on some planks.
      if (r.chance(0.55)) {
        const gy = ya + (yb - ya) * r.range(0.45, 0.7);
        const lx = leftX(gy);
        const rx = rightX(gy);
        const gx = lx + (rx - lx) * r.range(0.25, 0.55);
        ctx.strokeStyle = s.colA(C.wood.side, 0.55);
        ctx.lineWidth = 1.2 * u * k;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + (rx - lx) * r.range(0.12, 0.22), gy);
        ctx.stroke();
      }
      // Dark gap line between planks.
      ctx.strokeStyle = s.col(C.wood.line);
      ctx.lineWidth = 2.3 * u * k;
      ctx.beginPath();
      ctx.moveTo(leftX(yb), yb);
      ctx.lineTo(rightX(yb), yb);
      ctx.stroke();
      // Nails near both sides.
      const ny = (ya + yb) / 2;
      const nl = leftX(ny);
      const nr = rightX(ny);
      const inset = Math.min(10 * u * k, (nr - nl) * 0.12);
      ctx.fillStyle = s.col(C.wood.line);
      for (const nx of [nl + inset, nr - inset]) {
        ctx.beginPath();
        ctx.arc(nx, ny + 0.5 * u, 1.75 * u * k, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Thick outline around the top surface.
    poly(ctx, [d.farL, d.farR, d.nearR, d.nearL], { stroke: out, line: 3.2 * u });
  };

  // ------------------------------------------------------------ fireflies

  const buildFireflies = (s: Scene): void => {
    const st = s.layout.stage;
    const H = s.H;
    const X = (f: number): number => st.x0 + f * st.w;
    fireflies = [];
    const fr = s.rng('dock.fireflies');
    const spots: Pt[] = [
      { x: X(0.85), y: H * 0.62 },
      { x: X(0.7), y: H * 0.66 },
      { x: X(0.95), y: H * 0.7 },
      { x: X(0.4), y: H * 0.6 },
      { x: X(0.6), y: H * 0.56 },
    ];
    const n = Math.round(9 * clamp(s.W / 390, 1, 2.4));
    for (let i = 0; i < n; i++) {
      const sp = spots[i % spots.length];
      fireflies.push({
        bx: i < spots.length ? sp.x : fr.range(0, s.W),
        by: i < spots.length ? sp.y : fr.range(0.48, 0.8) * H,
        phase: fr.range(0, 6.28),
        speed: fr.range(0.6, 1.3),
      });
    }
    fly.x = X(0.86);
    fly.y = H * 0.56;
    fly.tx = fly.x;
    fly.ty = fly.y;
  };

  // ------------------------------------------------------------ critters

  const drawDragonfly = (s: Scene, ctx: CanvasRenderingContext2D): void => {
    if (fly.vis < 0.02) return;
    const u = s.u;
    const out = s.col(C.outline);
    ctx.save();
    ctx.globalAlpha = fly.vis;
    ctx.translate(fly.x, fly.y + (fly.mode === 'perch' ? 0 : Math.sin(s.t * 3.2) * 1.5 * u));
    ctx.scale(fly.face, 1);
    // Wings (fast flutter).
    const fl = fly.mode === 'perch' ? 0.8 + 0.2 * Math.sin(s.t * 2) : 0.45 + 0.55 * Math.abs(Math.sin(s.t * 38));
    ctx.fillStyle = s.colA(C.white, 0.55);
    ctx.strokeStyle = s.colA(C.outline, 0.45);
    ctx.lineWidth = 0.9 * u;
    for (const [dx, ang, len] of [[-1.5, -0.5, 9], [-1.5, 0.5, 9], [1.5, -0.35, 8], [1.5, 0.35, 8]] as const) {
      ctx.beginPath();
      ctx.ellipse(dx * u, (ang < 0 ? -1 : 1) * 2.4 * u * fl, len * u, 2.2 * u * fl, ang * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Body: abdomen, thorax, head.
    ctx.lineCap = 'round';
    ctx.strokeStyle = out;
    ctx.lineWidth = 3.6 * u;
    ctx.beginPath();
    ctx.moveTo(-2 * u, 0);
    ctx.lineTo(-15 * u, 1.2 * u);
    ctx.stroke();
    ctx.strokeStyle = s.col(C.teal[2]);
    ctx.lineWidth = 1.9 * u;
    ctx.beginPath();
    ctx.moveTo(-2 * u, 0);
    ctx.lineTo(-15 * u, 1.2 * u);
    ctx.stroke();
    ctx.fillStyle = s.col(C.teal[1]);
    ctx.beginPath();
    ctx.ellipse(0.5 * u, 0, 3.4 * u, 2.4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = out;
    ctx.lineWidth = 1.4 * u;
    ctx.stroke();
    ctx.fillStyle = s.col(C.teal[3]);
    ctx.beginPath();
    ctx.arc(4.2 * u, -0.4 * u, 2.1 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const drawButterfly = (s: Scene, ctx: CanvasRenderingContext2D): void => {
    if (!bfly) return;
    const u = s.u;
    const flap = Math.abs(Math.sin(s.t * 9 + bfly.phase));
    const x = bfly.x;
    const y = bfly.y + Math.sin(s.t * 2.4 + bfly.phase) * 10 * u;
    const col = bfly.hue > 0.5 ? C.yellow[2] : C.pink[2];
    const col2 = bfly.hue > 0.5 ? C.orange[2] : C.pink[3];
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.3 * u;
    ctx.strokeStyle = s.col(C.outline);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side * (0.25 + 0.75 * flap), 1);
      ctx.fillStyle = s.col(col);
      ctx.beginPath();
      ctx.ellipse(4.2 * u, -3 * u, 4.4 * u, 3.6 * u, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = s.col(col2);
      ctx.beginPath();
      ctx.ellipse(3.4 * u, 2.6 * u, 3 * u, 2.4 * u, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = s.col(C.outline);
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.1 * u, 4 * u, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /** One round wooden post: reflection, cylinder body, deck shadow, bark, rope, wet band, end-grain cap. */
  const drawPiling = (s: Scene, ctx: CanvasRenderingContext2D, p: Piling): void => {
    const u = s.u;
    const k = p.k;
    const w = p.w;
    const x = p.x - w / 2;
    const ry = w * 0.27; // ellipse depth of the round cross-section
    const out = s.col(C.outline);
    const day = s.light.daylight;
    // ---- reflection: the post continues upside down, wavy and fading into the lake
    const rh = (p.water - p.deckBottom) * 1.3 + 10 * u * k;
    const slices = 9;
    for (let i = 0; i < slices; i++) {
      const t0 = i / slices;
      const yy = p.water + ry * 0.6 + t0 * rh;
      const wob = Math.sin(s.t * 1.7 + i * 1.25 + p.x * 0.04) * 2 * u * (0.3 + t0);
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, s.colA(C.wood.line, 0.5 * (1 - t0)));
      g.addColorStop(0.35, s.colA(C.wood.mid, 0.45 * (1 - t0)));
      g.addColorStop(1, s.colA(C.wood.line, 0.5 * (1 - t0)));
      ctx.fillStyle = g;
      ctx.fillRect(x + wob + w * 0.06, yy, w * 0.88, rh / slices + 0.6);
    }
    // ---- the body (cylinder), clipped so all shading stays inside
    const body = (): void => {
      ctx.beginPath();
      ctx.moveTo(x, p.cap);
      ctx.lineTo(x, p.water);
      ctx.ellipse(p.x, p.water, w / 2, ry, 0, Math.PI, 0, true);
      ctx.lineTo(x + w, p.cap);
      ctx.closePath();
    };
    ctx.save();
    body();
    ctx.clip();
    const cyl = ctx.createLinearGradient(x, 0, x + w, 0);
    cyl.addColorStop(0, s.col(C.wood.line));
    cyl.addColorStop(0.1, s.col(C.wood.dark));
    cyl.addColorStop(0.3, s.col(C.wood.hi));
    cyl.addColorStop(0.45, s.col(C.wood.top));
    cyl.addColorStop(0.72, s.col(C.wood.side));
    cyl.addColorStop(0.9, s.col(C.wood.dark));
    cyl.addColorStop(1, s.col(C.wood.line));
    ctx.fillStyle = cyl;
    ctx.fillRect(x, p.cap - 2 * u, w, p.water - p.cap + ry + 2 * u);
    // Bark grooves that wrap with the curve (bunched toward the edges), and a knot.
    ctx.lineWidth = 1 * u * Math.min(1.4, k);
    ctx.strokeStyle = s.colA(C.wood.line, 0.4);
    for (const f of [0.12, 0.2, 0.55, 0.78, 0.88]) {
      ctx.beginPath();
      ctx.moveTo(x + w * f, p.cap + ry);
      ctx.bezierCurveTo(x + w * (f + 0.03), p.cap + (p.water - p.cap) * 0.4, x + w * (f - 0.03), p.cap + (p.water - p.cap) * 0.7, x + w * f, p.water);
      ctx.stroke();
    }
    const ky = p.deckBottom + (p.water - p.deckBottom) * 0.45;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.62, ky, w * 0.09, w * 0.13, 0, 0, Math.PI * 2);
    ctx.fillStyle = s.colA(C.wood.line, 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + w * 0.62, ky, w * 0.15, w * 0.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = s.colA(C.wood.line, 0.3);
    ctx.stroke();
    // Specular strip from the sky.
    const sp = ctx.createLinearGradient(x + w * 0.22, 0, x + w * 0.4, 0);
    sp.addColorStop(0, 'rgba(255,255,255,0)');
    sp.addColorStop(0.5, `rgba(255,255,255,${(0.18 + 0.22 * day).toFixed(3)})`);
    sp.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sp;
    ctx.fillRect(x + w * 0.22, p.cap + ry, w * 0.18, p.deckBottom - p.cap);
    // The deck's shadow: everything below the deck edge sits in shade, softening downward.
    const ao = ctx.createLinearGradient(0, p.deckBottom - 2 * u, 0, p.deckBottom + (p.water - p.deckBottom) * 0.8);
    ao.addColorStop(0, s.colA(C.wood.line, 0.62));
    ao.addColorStop(0.35, s.colA(C.wood.line, 0.32));
    ao.addColorStop(1, s.colA(C.wood.line, 0.12));
    ctx.fillStyle = ao;
    ctx.fillRect(x, p.deckBottom - 2 * u, w, p.water - p.deckBottom + ry + 2 * u);
    // Wet, mossy band at the waterline.
    const wetTop = p.water - 9 * u * k;
    const wet = ctx.createLinearGradient(0, wetTop, 0, p.water + ry);
    wet.addColorStop(0, s.colA(C.reed.leafDark, 0));
    wet.addColorStop(0.55, s.colA(C.reed.leafDark, 0.5));
    wet.addColorStop(1, s.colA(C.wood.line, 0.75));
    ctx.fillStyle = wet;
    ctx.fillRect(x, wetTop, w, p.water - wetTop + ry);
    ctx.restore();
    // Outline of the body.
    body();
    ctx.strokeStyle = out;
    ctx.lineWidth = 2.2 * u;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // ---- rope lashing, wrapping round the post just under the deck
    const ropeY = p.deckBottom + 3 * u * k;
    for (let j = 0; j < 3; j++) {
      const yy = ropeY + j * 2.6 * u * k;
      ctx.beginPath();
      ctx.ellipse(p.x, yy, w / 2 + 0.6 * u, ry * 0.75, 0, 0.05, Math.PI - 0.05);
      ctx.strokeStyle = out;
      ctx.lineWidth = 3.4 * u * Math.min(1.5, k);
      ctx.stroke();
      ctx.strokeStyle = s.col(C.reed.headHi);
      ctx.lineWidth = 2 * u * Math.min(1.5, k);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p.x, yy - 0.5 * u, w / 2, ry * 0.7, 0, 0.6, 1.3);
      ctx.strokeStyle = s.colA(C.wood.hi, 0.9);
      ctx.lineWidth = 0.9 * u;
      ctx.stroke();
    }
    // ---- end-grain cap (the post is round: its top shows the tree rings)
    ctx.beginPath();
    ctx.ellipse(p.x, p.cap, w / 2, ry, 0, 0, Math.PI * 2);
    const cg = ctx.createRadialGradient(p.x - w * 0.12, p.cap - ry * 0.3, 0, p.x, p.cap, w * 0.55);
    cg.addColorStop(0, s.col(C.wood.hi));
    cg.addColorStop(0.7, s.col(C.wood.top));
    cg.addColorStop(1, s.col(C.wood.mid));
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = s.colA(C.wood.mid, 0.9);
    ctx.lineWidth = 1 * u;
    for (const r of [0.66, 0.38]) {
      ctx.beginPath();
      ctx.ellipse(p.x + w * 0.03, p.cap, (w / 2) * r, ry * r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(p.x + w * 0.05, p.cap);
    ctx.lineTo(p.x + w * 0.32, p.cap - ry * 0.35);
    ctx.strokeStyle = s.colA(C.wood.line, 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.x, p.cap, w / 2, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = out;
    ctx.lineWidth = 2.2 * u;
    ctx.stroke();
    // ---- where the post meets the water: a dark wet ring, then a breathing foam ring
    if (p.water < s.H) {
      ctx.beginPath();
      ctx.ellipse(p.x, p.water + ry * 0.2, w * 0.62, ry * 1.1, 0, 0, Math.PI * 2);
      ctx.strokeStyle = s.colA(C.water.deepest, 0.3);
      ctx.lineWidth = 2.4 * u;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(p.x, p.water + ry * 0.3, w * 0.82 + Math.sin(s.t * 2 + p.x) * 1.2 * u, ry * 1.45, 0, 0, Math.PI * 2);
      ctx.strokeStyle = s.colA(C.water.ripple, 0.85);
      ctx.lineWidth = 1.6 * u;
      ctx.stroke();
    }
  };

  /** The pilings (footings): thick round posts along the open-water side of the pier, far to near,
   *  standing just outside the deck edge and poking a little above it. */
  interface Piling {
    x: number;
    /** Centre of the end-grain cap (above the deck). */
    cap: number;
    /** Where the deck's side face ends (below this the post is in the deck's shadow). */
    deckBottom: number;
    water: number;
    w: number;
    k: number;
  }
  const pilings = (s: Scene): Piling[] => {
    const d = s.layout.dock;
    const u = s.u;
    const out: Piling[] = [];
    for (const t of [0.06, 0.36, 0.66, 0.94]) {
      const k = 1 + t * 1.6;
      const ex = d.farR.x + (d.nearR.x - d.farR.x) * t;
      const ey = d.farR.y + (d.nearR.y - d.farR.y) * t;
      const w = 13 * u * k;
      out.push({
        x: ex + d.side * 0.55 + w * 0.32,
        cap: ey - 5 * u * k,
        deckBottom: ey + d.side * 0.95,
        water: ey + d.side * 0.95 + 20 * u * k,
        w,
        k,
      });
    }
    return out;
  };

  return [
    {
      id: 'dock.shadow',
      z: 270,
      draw(s, ctx) {
        const d = s.layout.dock;
        const u = s.u;
        const side = d.side;
        const a = 0.2 * (0.4 + 0.6 * s.light.daylight);
        ctx.fillStyle = s.colA(C.water.deepest, a);
        poly(ctx, [
          { x: d.farR.x + side * 0.6, y: d.farR.y + side },
          { x: d.nearR.x + side * 0.6, y: d.nearR.y + side },
          { x: d.nearR.x + side + 30 * u, y: d.nearR.y + side },
          { x: d.farR.x + side + 12 * u, y: d.farR.y + side + 8 * u },
        ], { fill: s.colA(C.water.deepest, a) });
        // Shadow under the far end.
        ctx.beginPath();
        ctx.ellipse((d.farL.x + d.farR.x) / 2 + 6 * u, d.farR.y + side * 2.2, (d.farR.x - d.farL.x) * 0.62, 7 * u, 0, 0, Math.PI * 2);
        ctx.fillStyle = s.colA(C.water.deepest, a * 1.1);
        ctx.fill();
      },
    },

    {
      id: 'dock.posts',
      z: 305,
      update(s, dt) {
        // Gentle foam rings where the pilings meet the water.
        if (rnd.chance(dt * 1.1)) {
          const ps = pilings(s);
          const p = ps[Math.floor(rnd.next() * ps.length)];
          if (p && p.water < s.H) s.ripple(p.x, p.water, { maxR: p.w * 1.1, life: 1.8, strength: 0.6 });
        }
      },
      draw(s, ctx) {
        for (const p of pilings(s)) if (p.cap < s.H + 20 * s.u) drawPiling(s, ctx, p);
      },
    },

    {
      id: 'dock.deck',
      z: 300,
      draw(s, ctx) {
        const d = s.layout.dock;
        const u = s.u;
        const x0 = Math.max(0, Math.floor(Math.min(d.nearL.x, d.farL.x) - 6 * u));
        const x1 = Math.min(s.W, Math.ceil(d.farR.x + d.side + 8 * u));
        const y0 = Math.floor(d.farL.y - 6 * u);
        deck.draw(ctx, String(s.light.key), { x: x0, y: y0, w: x1 - x0, h: s.H - y0 }, s.dpr, paintDeck);
      },
    },

    ...reeds.layers,

    {
      id: 'dock.critters',
      z: 360,
      resize(s) {
        buildFireflies(s);
      },
      update(s, dt) {
        const st = s.layout.stage;
        const H = s.H;
        const u = s.u;
        const fine = s.light.daylight > 0.45 && s.weather.rain < 0.3 && s.weather.storm < 0.2;
        fly.vis += ((fine ? 1 : 0) - fly.vis) * Math.min(1, dt * 1.5);
        fly.timer -= dt;
        const tips = reeds.tips();
        if (fly.mode === 'hover' && fly.timer <= 0) {
          if (tips.length && rnd.chance(0.4)) {
            // Land on a cattail tip for a while, riding its sway.
            fly.mode = 'perch';
            fly.perch = rnd.int(0, tips.length - 1);
            fly.timer = rnd.range(2.5, 5);
            fly.face = tips[fly.perch].x >= fly.x ? 1 : -1;
          } else {
            fly.mode = 'dart';
            fly.tx = st.x0 + st.w * rnd.range(0.52, 0.97);
            fly.ty = H * rnd.range(0.5, 0.64);
            fly.face = fly.tx >= fly.x ? 1 : -1;
            fly.timer = 0.6;
          }
        } else if (fly.mode === 'perch') {
          const tip = tips[fly.perch];
          if (tip) {
            const k = 1 - Math.exp(-dt * 9);
            fly.x += (tip.x - fly.x) * k;
            fly.y += (tip.y - 2.5 * u - fly.y) * k;
          }
          if (fly.timer <= 0 || !tip) {
            fly.mode = 'dart';
            fly.tx = st.x0 + st.w * rnd.range(0.5, 0.95);
            fly.ty = H * rnd.range(0.5, 0.62);
            fly.face = fly.tx >= fly.x ? 1 : -1;
            fly.timer = 0.6;
          }
        } else if (fly.mode === 'dart') {
          const k = 1 - Math.exp(-dt * 7);
          fly.x += (fly.tx - fly.x) * k;
          fly.y += (fly.ty - fly.y) * k;
          if (Math.hypot(fly.tx - fly.x, fly.ty - fly.y) < 1.5 * u || fly.timer <= 0) {
            fly.mode = 'hover';
            fly.timer = rnd.range(1.2, 3.4);
          }
        }

        nextB -= dt;
        if (!bfly && nextB <= 0 && fine) {
          const fromLeft = rnd.chance(0.5);
          bfly = {
            x: fromLeft ? -20 * u : s.W + 20 * u,
            y: H * rnd.range(0.48, 0.6),
            vx: (fromLeft ? 1 : -1) * rnd.range(22, 32) * u,
            phase: rnd.range(0, 6),
            hue: rnd.next(),
          };
        }
        if (bfly) {
          bfly.x += bfly.vx * dt;
          bfly.y += Math.sin(s.t * 0.7 + bfly.phase) * 6 * u * dt;
          if (bfly.x < -40 * u || bfly.x > s.W + 40 * u) {
            bfly = null;
            nextB = rnd.range(20, 40);
          }
        }
      },
      draw(s, ctx) {
        drawDragonfly(s, ctx);
        drawButterfly(s, ctx);
        const night = smoothstep(0.35, 0.85, s.light.night);
        if (night < 0.02) return;
        const u = s.u;
        const col = C.light.firefly;
        for (const f of fireflies) {
          const x = f.bx + (noise1(s.t * 0.25 * f.speed + f.phase, 5) - 0.5) * 70 * u;
          const y = f.by + (noise1(s.t * 0.2 * f.speed + f.phase + 40, 6) - 0.5) * 40 * u;
          const blink = Math.pow(Math.max(0, Math.sin(s.t * 1.7 * f.speed + f.phase)), 3);
          const a = night * (0.15 + 0.85 * blink);
          glow(ctx, x, y, 11 * u, col, a * 0.75);
          ctx.fillStyle = s.raw(shade(col, 0.4), a);
          ctx.beginPath();
          ctx.arc(x, y, 1.8 * u, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
  ];
};

export default dock;
