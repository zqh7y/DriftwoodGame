// The aquarium view: a full-screen canvas with a calm underwater tank (water, god rays, sand,
// pebbles, swaying kelp, bubbles, decorations) and the player's fish living in it.
// Static parts are baked into offscreen canvases (rebuilt on resize / decor change); each fish
// sprite gets its lighting baked once (top light + belly shade + rim, a night/bioluminescent
// copy and a soft glow), so a frame is a few blits, the kelp slices and the fish strips.
// Fish have a small life of their own: they cruise, look around, play in pairs, chat with
// little feeling bubbles, nap near the sand and come up to eat food flakes.

import { C } from '../engine/palette';
import { circle, sparkle, vGrad, poly, withAlpha } from '../engine/draw';
import {
  offscreen, rng, drawWater, pebble, kelp, bush, fan, house, chest, lantern, shell, castle, bubblerStone, mushrooms, DECOR_SPOTS,
  feelingBubble, sleepZ, foodFlake, FLAKE_COLORS, type FeelKind,
} from './art';

/** Decorations the player can buy; each one is drawn at its own fixed spot in the tank. */
export type DecorId = 'kelp' | 'lantern' | 'shell' | 'chest' | 'house' | 'coral' | 'bubbler' | 'mushrooms' | 'castle';

export interface TankFish {
  /** Species id (stable key: the same id keeps its swimming state when the list changes). */
  id: string;
  /** Self-contained SVG markup of the fish (facing LEFT), from fishIcon(). */
  art: string;
  /** Relative size (1 = normal, rare fish up to ~1.45). */
  size: number;
  /** 0 = common … 11 = rarest (rarer fish may glow / swim more gracefully). */
  rank: number;
}

export interface TankView {
  /** Show the tank and start its animation loop. */
  show(): void;
  /** Hide it and stop the loop (no CPU while hidden). */
  hide(): void;
  /** The fish in the tank, in slot order. Fish already swimming keep their position. */
  setFish(list: TankFish[]): void;
  /** Decorations to draw (owned ones). */
  setDecor(ids: DecorId[]): void;
  /** 0 = day … 1 = night: the tank light dims and the lantern/glows come up. */
  setNight(n: number): void;
  /** Current screen position (CSS px) of the fish in slot i, for floating labels. */
  fishPos(i: number): { x: number; y: number } | null;
  /** Called when the player taps a fish (slot index and screen position). */
  onTap(fn: (i: number, x: number, y: number) => void): void;
  /** Called when the player taps open water (not a fish), with the screen position. */
  onWaterTap(fn: (x: number, y: number) => void): void;
  /** Sprinkle food at a screen point (CSS px): flakes sink slowly and nearby fish swim up to eat. */
  feed(x: number, y: number): void;
  /** Battery saver: the most frames per second to draw (0 = no limit). */
  setFpsCap(fps: number): void;
}

// ---------- internals ----------

const TOP_BAND = 140;
const BAR = 150;
const FISH_BOX = 92;
/** Eye of the fishIcon() art (64-unit viewBox, facing left). */
const EYE_U = 15.5 / 64, EYE_V = 30 / 64, EYE_R = 4.8 / 64;

interface Lit { day: HTMLCanvasElement; night: HTMLCanvasElement }
interface Sprite {
  c: HTMLCanvasElement; ready: boolean; failed: boolean; baked: boolean;
  glow: HTMLCanvasElement | null; shade: HTMLCanvasElement | null; rimTop: HTMLCanvasElement | null; rimAll: HTMLCanvasElement | null;
  lid: [number, number, number] | null; lit: Map<number, Lit>;
}

type State = 'cruise' | 'look' | 'play' | 'sleep' | 'talk' | 'eat';

interface Flake { x: number; y: number; vy: number; ph: number; rot: number; k: number; landed: boolean; floor: number; age: number; eaten: boolean; claim: number; a: number }

interface Swimmer {
  key: string;
  fish: TankFish;
  x: number; y: number; vx: number; vy: number; tx: number; ty: number;
  z: number;
  face: 1 | -1;
  state: State; timer: number; dur: number;
  cruise: number;
  turning: boolean; turnT: number; turnFrom: 1 | -1;
  ph: number; bobA: number; bobF: number; bobPh: number; wagF: number; wave: number;
  alpha: number; wig: number; trailAcc: number;
  partner: Swimmer | null; lead: boolean; playKind: 0 | 1; ang: number; cx: number; cy: number; bumpCD: number;
  met: boolean; lineT: number; spk: number;
  food: Flake | null; nib: number; notice: number;
  sleepK: number; zzAcc: number; forceFace: 0 | 1 | -1; flipped: boolean;
  feel: FeelKind | null; feelT: number; happyCD: number;
  bob: number; lunge: number; pulse: number;
}

interface Bubble { x: number; y: number; r: number; vy: number; ph: number; a: number }
interface Spark { x: number; y: number; life: number; max: number; r: number }
interface Crumb { x: number; y: number; vx: number; vy: number; life: number; k: number }
interface ZBub { x: number; y: number; life: number; ph: number }
interface KelpStrand { x: number; base: number; h: number; ph: number; ramp: readonly string[]; c: HTMLCanvasElement; cn: HTMLCanvasElement; ox: number; oy: number; w: number; hh: number }

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const FEEL_LIFE = 2.3;
const FEELS: FeelKind[] = ['heart', 'note', 'smile', 'sparkle', 'zz'];

function glowSprite(color: string, dpr: number): HTMLCanvasElement {
  const { c, x } = offscreen(64, 64, dpr);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(0.3, color.replace(/,\s*[\d.]+\)$/, ',0.5)'));
  g.addColorStop(0.65, color.replace(/,\s*[\d.]+\)$/, ',0.14)'));
  g.addColorStop(1, color.replace(/,\s*[\d.]+\)$/, ',0)'));
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return c;
}

function rawCanvas(w: number, h = w): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return { c, x: c.getContext('2d')! };
}

function svgUrl(markup: string, px: number): string {
  let m = markup.trim();
  if (!/^<svg[^>]*\sxmlns=/.test(m)) m = m.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/^<svg[^>]*\swidth=/.test(m)) m = m.replace(/^<svg\b/, `<svg width="${px}" height="${px}"`);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}

/** Bioluminescent tint by rarity: soft aqua → lilac → warm gold. */
const glowColor = (rank: number): string => (rank >= 8 ? 'rgba(255,224,150,1)' : rank >= 4 ? 'rgba(186,196,255,1)' : 'rgba(140,232,255,1)');

export function mountTank(host: HTMLElement): TankView {
  const canvas = document.createElement('canvas');
  canvas.className = 'tank-view';
  canvas.hidden = true;
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const calm = reduced ? 0.45 : 1;
  const STRIPS = reduced ? 6 : 10;

  let W = 390, H = 844, dpr = 1, sandY = 560;
  let night = 0;
  let decor = new Set<DecorId>();
  let swimmers: Swimmer[] = [];
  const byKey = new Map<string, Swimmer>();
  const sprites = new Map<string, Sprite>();
  let bubbles: Bubble[] = [];
  let sparks: Spark[] = [];
  let flakes: Flake[] = [];
  let crumbs: Crumb[] = [];
  let zbubs: ZBub[] = [];
  let tapFn: ((i: number, x: number, y: number) => void) | null = null;
  let waterFn: ((x: number, y: number) => void) | null = null;
  let populated = false;

  // caches
  let bg: HTMLCanvasElement | null = null;
  let deco: HTMLCanvasElement | null = null;
  let decoTop = 0;
  let rays: HTMLCanvasElement | null = null;
  let rays2: HTMLCanvasElement | null = null;
  let bubbleSpr: HTMLCanvasElement | null = null;
  let sparkSpr: HTMLCanvasElement | null = null;
  let warm: HTMLCanvasElement | null = null;
  let cyan: HTMLCanvasElement | null = null;
  let halo: HTMLCanvasElement | null = null;
  let shadowSpr: HTMLCanvasElement | null = null;
  let glintSpr: HTMLCanvasElement | null = null;
  let zSpr: HTMLCanvasElement | null = null;
  const feelSpr = new Map<FeelKind, HTMLCanvasElement>();
  let flakeSpr: HTMLCanvasElement[] = [];
  let backKelp: KelpStrand[] = [];
  let frontKelp: KelpStrand[] = [];
  let dirty = true;

  const sandTop = (x: number): number => sandY + Math.sin(x / 55) * 9 + Math.sin(x / 23 + 1) * 3;
  const spot = (k: keyof typeof DECOR_SPOTS): { x: number; y: number } => {
    const s = DECOR_SPOTS[k];
    const x = s.fx * W;
    return { x, y: sandTop(x) + s.dy };
  };

  function measure(): void {
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    sandY = Math.round(Math.min(H * 0.665, H - BAR - 122));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    dirty = true;
  }

  function makeKelp(x: number, baseDy: number, h: number, ph: number, ramp: readonly string[]): KelpStrand {
    const w = 110, hh = h + 40;
    const base = sandTop(x) + baseDy;
    const { c, x: kx } = offscreen(w, hh, dpr);
    kelp(kx, w / 2, hh - 6, h, ph, ramp);
    // night copy (same tint as the night overlay) for strands drawn in front of the fish
    const n = rawCanvas(c.width, c.height);
    n.x.drawImage(c, 0, 0);
    n.x.globalCompositeOperation = 'source-atop';
    n.x.fillStyle = 'rgba(6,18,72,0.56)';
    n.x.fillRect(0, 0, c.width, c.height);
    return { x, base, h, ph, ramp, c, cn: n.c, ox: x - w / 2, oy: base - hh + 6, w, hh };
  }

  function rebuild(): void {
    dirty = false;
    const kh = clamp(sandY / 557, 0.7, 1.3);
    // water + sand
    const b = offscreen(W, H, dpr);
    drawWater(b.x, W, H, sandY, sandTop);
    // soft vignette baked into the water
    withAlpha(b.x, 0.5, () => {
      const g = b.x.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.75);
      g.addColorStop(0, 'rgba(10,30,60,0)');
      g.addColorStop(1, 'rgba(10,30,60,0.45)');
      b.x.fillStyle = g;
      b.x.fillRect(0, 0, W, H);
    });
    bg = b.c;

    // god rays at quarter resolution (they are soft anyway)
    const rh = sandY + 20;
    const mkRays = (list: Array<[number, number, number]>): HTMLCanvasElement => {
      const r = offscreen(W, rh, 0.25);
      for (const [fx, w0, w1] of list) {
        const x = fx * W;
        r.x.fillStyle = vGrad(r.x, 0, rh, [[0, 'rgba(240,252,255,0.9)'], [0.6, 'rgba(200,240,250,0.25)'], [1, 'rgba(200,240,250,0)']]);
        poly(r.x, [{ x: x - w0 / 2, y: -10 }, { x: x + w0 / 2, y: -10 }, { x: x + w1 / 2 - 50, y: rh }, { x: x - w1 / 2 - 50, y: rh }], { fill: r.x.fillStyle });
      }
      return r.c;
    };
    rays = mkRays([[0.15, 40, 120], [0.6, 50, 150], [0.85, 30, 90]]);
    rays2 = mkRays([[0.38, 26, 80], [0.72, 22, 60], [1.02, 40, 110]]);

    // kelp strands
    backKelp = [
      makeKelp(34, 24, 300 * kh, 0.2, C.green),
      makeKelp(66, 30, 210 * kh, 1.4, C.teal),
      makeKelp(W - 38, 28, 340 * kh, 2.1, C.green),
      makeKelp(W - 68, 34, 220 * kh, 0.9, C.teal),
    ];
    if (decor.has('kelp')) {
      backKelp.push(makeKelp(W * 0.47, 26, 230 * kh, 0.6, C.green), makeKelp(W * 0.505, 30, 165 * kh, 2.3, C.teal), makeKelp(W * 0.7, 24, 130 * kh, 1.1, C.green));
    }
    frontKelp = [makeKelp(14, 108, 160 * kh, 2.7, C.green), makeKelp(W - 10, 100, 190 * kh, 1.9, C.teal)];

    // decorations + pebbles + bushes (drawn in front of the back kelp)
    decoTop = Math.max(0, sandY - 120);
    const d = offscreen(W, H - decoTop, dpr);
    d.x.translate(0, -decoTop);
    const dx = d.x;
    const at = (k: keyof typeof DECOR_SPOTS, fn: (c: CanvasRenderingContext2D, x: number, y: number) => void): void => {
      const p = spot(k);
      fn(dx, p.x, p.y);
    };
    if (decor.has('coral')) at('coral', (c, x, y) => fan(c, x, y, 0.78, C.pink));
    if (decor.has('house')) at('house', house);
    if (decor.has('castle')) at('castle', castle);
    bush(dx, W * 0.315, sandTop(W * 0.315) + 62, 0.8, C.green);
    if (decor.has('lantern')) at('lantern', lantern);
    bush(dx, W * 0.955, sandTop(W * 0.955) + 64, 0.9, C.green);
    if (decor.has('chest')) at('chest', chest);
    const pb: Array<[number, number, number, number, readonly string[]]> = [
      [0.38, 72, 9, 6, C.gray], [0.477, 60, 9, 6, C.blue], [0.626, 108, 11, 7, C.gray], [0.882, 88, 15, 9, C.gray],
      [0.077, 76, 10, 6, C.purple], [0.923, 108, 8, 5, C.teal], [0.513, 110, 7, 5, C.gray], [0.18, 118, 12, 7, C.brown],
    ];
    for (const [fx, dy, rx, ry, ramp] of pb) pebble(dx, fx * W, sandTop(fx * W) + dy, rx, ry, ramp);
    if (decor.has('shell')) at('shell', shell);
    if (decor.has('coral')) at('coral2', (c, x, y) => fan(c, x, y, 0.6, C.orange));
    if (decor.has('mushrooms')) at('mushrooms', mushrooms);
    if (decor.has('bubbler')) at('bubbler', bubblerStone);
    deco = d.c;

    // small sprites
    const bs = offscreen(24, 24, dpr);
    circle(bs.x, 12, 12, 10, { fill: 'rgba(255,255,255,0.12)', stroke: 'rgba(255,255,255,0.8)', line: 1.6 });
    withAlpha(bs.x, 0.9, () => circle(bs.x, 8.5, 8.5, 2.8, { fill: '#ffffff' }));
    bubbleSpr = bs.c;
    const ss = offscreen(20, 20, dpr);
    withAlpha(ss.x, 0.5, () => circle(ss.x, 10, 10, 6, { fill: 'rgba(255,250,220,0.5)' }));
    sparkle(ss.x, 10, 10, 9, C.light.sparkle);
    sparkSpr = ss.c;
    warm = glowSprite('rgba(255,214,130,1)', 1);
    cyan = glowSprite('rgba(140,255,236,1)', 1);
    halo = glowSprite('rgba(255,236,170,1)', 1);
    shadowSpr = glowSprite('rgba(40,28,12,1)', 1);
    glintSpr = glowSprite('rgba(255,255,255,1)', 1);
    for (const k of FEELS) {
      const f = offscreen(36, 36, dpr);
      feelingBubble(f.x, k);
      feelSpr.set(k, f.c);
    }
    const zs = offscreen(16, 16, dpr);
    sleepZ(zs.x);
    zSpr = zs.c;
    flakeSpr = FLAKE_COLORS.map((_, k) => {
      const f = offscreen(12, 12, dpr);
      foodFlake(f.x, k);
      return f.c;
    });
  }

  // ---------- fish sprites + baked lighting ----------

  function spriteFor(f: TankFish): Sprite {
    let s = sprites.get(f.id);
    if (s) return s;
    const px = Math.ceil(FISH_BOX * clamp(f.size, 0.6, 1.6) * 2);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const sp: Sprite = { c, ready: false, failed: false, baked: false, glow: null, shade: null, rimTop: null, rimAll: null, lid: null, lit: new Map() };
    sprites.set(f.id, sp);
    const img = new Image();
    img.onload = () => {
      const x = c.getContext('2d')!;
      x.drawImage(img, 0, 0, px, px);
      sp.ready = true;
    };
    img.onerror = () => (sp.failed = true);
    img.src = svgUrl(f.art, px);
    return sp;
  }

  /** Once per species: silhouette, edge rims, the far-side shade and the soft night glow. */
  function bakeSprite(sp: Sprite, f: TankFish): void {
    sp.baked = true;
    const px = sp.c.width;
    const sil = rawCanvas(px);
    sil.x.drawImage(sp.c, 0, 0);
    sil.x.globalCompositeOperation = 'source-in';
    sil.x.fillStyle = '#fff';
    sil.x.fillRect(0, 0, px, px);
    const r = Math.max(2, Math.round(px * 0.034));
    const edge = (dirs: Array<[number, number]>, color: string): HTMLCanvasElement => {
      const out = rawCanvas(px);
      const tmp = rawCanvas(px);
      for (const [ox, oy] of dirs) {
        tmp.x.globalCompositeOperation = 'source-over';
        tmp.x.clearRect(0, 0, px, px);
        tmp.x.drawImage(sil.c, 0, 0);
        tmp.x.globalCompositeOperation = 'destination-out';
        tmp.x.drawImage(sil.c, ox, oy);
        out.x.drawImage(tmp.c, 0, 0);
      }
      out.x.globalCompositeOperation = 'source-in';
      out.x.fillStyle = color;
      out.x.fillRect(0, 0, px, px);
      return out.c;
    };
    sp.rimTop = edge([[0, r]], 'rgba(255,253,240,1)');
    sp.rimAll = edge([[0, r], [0, -r], [r, 0], [-r, 0]], glowColor(f.rank));
    const sh = rawCanvas(px);
    sh.x.drawImage(sil.c, 0, 0);
    sh.x.globalCompositeOperation = 'source-in';
    sh.x.fillStyle = 'rgb(10,20,48)';
    sh.x.fillRect(0, 0, px, px);
    sp.shade = sh.c;
    // soft glow: blurred silhouette via an offset shadow (works without ctx.filter)
    const gp = Math.ceil(px * 1.5);
    const g = rawCanvas(gp);
    const off = gp * 3;
    g.x.shadowColor = glowColor(f.rank);
    g.x.shadowBlur = px * 0.1;
    g.x.shadowOffsetX = off;
    g.x.drawImage(sil.c, (gp - px) / 2 - off, (gp - px) / 2);
    g.x.drawImage(sil.c, (gp - px) / 2 - off, (gp - px) / 2);
    sp.glow = g.c;
    // body colour just behind the eye, for the closed-eye lid of a sleeping fish
    try {
      const d = sp.c.getContext('2d')!.getImageData(Math.round(px * (EYE_U + 0.1)), Math.round(px * (EYE_V + 0.02)), 1, 1).data;
      if (d[3] > 200) sp.lid = [d[0], d[1], d[2]];
    } catch {
      sp.lid = null;
    }
  }

  /** Per species + depth bucket: the day-lit and night-lit copies (haze toward the water colour baked in). */
  function litFor(sp: Sprite, z: number): Lit {
    const key = Math.round(z * 20);
    let l = sp.lit.get(key);
    if (l) return l;
    const px = sp.c.width;
    const haze = clamp((1 - key / 20) / 0.35, 0, 1);
    const day = rawCanvas(px);
    const dx = day.x;
    dx.drawImage(sp.c, 0, 0);
    dx.globalCompositeOperation = 'source-atop';
    const g = dx.createLinearGradient(0, 0, 0, px);
    g.addColorStop(0, 'rgba(255,252,236,0.34)');
    g.addColorStop(0.24, 'rgba(255,252,236,0.26)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(0.56, 'rgba(16,30,70,0)');
    g.addColorStop(0.78, 'rgba(16,30,70,0.36)');
    g.addColorStop(1, 'rgba(16,30,70,0.42)');
    dx.fillStyle = g;
    dx.fillRect(0, 0, px, px);
    dx.globalAlpha = 0.42;
    if (sp.rimTop) dx.drawImage(sp.rimTop, 0, 0);
    dx.globalAlpha = 1;
    if (haze > 0) {
      dx.fillStyle = `rgba(78,164,206,${(haze * 0.36).toFixed(3)})`;
      dx.fillRect(0, 0, px, px);
    }
    const nt = rawCanvas(px);
    const nx = nt.x;
    nx.drawImage(sp.c, 0, 0);
    nx.globalCompositeOperation = 'source-atop';
    const gn = nx.createLinearGradient(0, 0, 0, px);
    gn.addColorStop(0, 'rgba(16,34,96,0.22)');
    gn.addColorStop(0.5, 'rgba(12,26,82,0.34)');
    gn.addColorStop(1, 'rgba(8,16,60,0.52)');
    nx.fillStyle = gn;
    nx.fillRect(0, 0, px, px);
    if (haze > 0) {
      nx.fillStyle = `rgba(16,36,96,${(haze * 0.34).toFixed(3)})`;
      nx.fillRect(0, 0, px, px);
    }
    nx.globalCompositeOperation = 'lighter';
    if (sp.rimAll) {
      nx.globalAlpha = 0.5;
      nx.drawImage(sp.rimAll, 0, 0);
    }
    l = { day: day.c, night: nt.c };
    sp.lit.set(key, l);
    return l;
  }

  // ---------- fish life ----------

  const boxOf = (f: TankFish): number => FISH_BOX * clamp(f.size, 0.6, 1.6);
  const bandZ = (f: TankFish, z: number): [number, number] => {
    const B = boxOf(f) * z;
    const lo = TOP_BAND + B * 0.32;
    const hi = Math.max(lo + 10, sandY - 6 - B * 0.28);
    return [lo, hi];
  };
  const band = (s: Swimmer): [number, number] => bandZ(s.fish, s.z);
  const rand = Math.random;

  function newSwimmer(key: string, f: TankFish, entering: boolean): Swimmer {
    const r = rand;
    const rare = f.rank >= 8;
    const z = rare ? 0.86 + r() * 0.14 : 0.65 + r() * 0.35;
    const [lo, hi] = bandZ(f, z);
    const B = boxOf(f) * z;
    const y = lo + r() * (hi - lo);
    const face: 1 | -1 = r() < 0.5 ? 1 : -1;
    const x = entering ? (face === 1 ? -B * 0.25 : W + B * 0.25) : B * 0.5 + r() * Math.max(1, W - B);
    const cruise = (rare ? 13 + r() * 6 : 18 + r() * 12) * calm * (0.62 + 0.38 * z);
    const s: Swimmer = {
      key, fish: f, x, y, vx: face * cruise, vy: 0, tx: x, ty: y, z, face,
      state: 'cruise', timer: 3 + r() * 5, dur: 5, cruise,
      turning: false, turnT: 0, turnFrom: face,
      ph: r() * 6.28, bobA: rare ? 6 + r() * 4 : 2.5 + r() * 3, bobF: (rare ? 0.5 : 0.8 + r() * 0.5) * calm, bobPh: r() * 6.28,
      wagF: (rare ? 3.2 : 5 + r() * 2) * calm, wave: r() * 6.28,
      alpha: 0, wig: 0, trailAcc: 0,
      partner: null, lead: false, playKind: 0, ang: 0, cx: 0, cy: 0, bumpCD: 0,
      met: false, lineT: 0, spk: 0,
      food: null, nib: 0, notice: 0,
      sleepK: 0, zzAcc: 0, forceFace: 0, flipped: false,
      feel: null, feelT: 0, happyCD: 6 + r() * 10,
      bob: 0, lunge: 0, pulse: 0,
    };
    cruiseTarget(s, entering ? face : 0);
    return s;
  }

  function setFish(list: TankFish[]): void {
    const seen = new Map<string, number>();
    const next: Swimmer[] = [];
    for (const f of list) {
      const n = seen.get(f.id) ?? 0;
      seen.set(f.id, n + 1);
      const key = `${f.id}#${n}`;
      let s = byKey.get(key);
      if (!s) {
        s = newSwimmer(key, f, populated);
        byKey.set(key, s);
      }
      s.fish = f;
      spriteFor(f);
      next.push(s);
    }
    const keep = new Set(next.map((s) => s.key));
    for (const k of [...byKey.keys()]) if (!keep.has(k)) byKey.delete(k);
    for (const s of next) if (s.partner && !keep.has(s.partner.key)) { s.partner = null; enter(s, 'cruise'); }
    if (!populated && next.length) {
      // first fill: spread the school over the tank instead of a random clump
      const n = next.length;
      const order = next.map((_, i) => i).sort(() => Math.random() - 0.5);
      next.forEach((s, i) => {
        const [lo, hi] = band(s);
        const B = boxOf(s.fish) * s.z;
        const fy = (order[i] + 0.2 + Math.random() * 0.6) / n;
        s.y = s.ty = lo + (hi - lo) * fy;
        const fx = ((i * 0.618 + 0.15) % 1);
        s.x = B * 0.45 + fx * Math.max(1, W - B * 0.9);
        cruiseTarget(s, 0);
      });
    }
    swimmers = next;
    populated = true;
  }

  function cruiseTarget(s: Swimmer, dir: number): void {
    const B = boxOf(s.fish) * s.z;
    const [lo, hi] = band(s);
    const m = B * 0.42;
    const d = dir || (rand() < 0.72 ? s.face : -s.face);
    const reach = 90 + rand() * W * 0.55;
    let tx = s.x + d * reach;
    if (tx > W - m || tx < m) tx = s.x - d * reach;
    s.tx = clamp(tx, m, W - m);
    s.ty = lo + rand() * (hi - lo);
  }

  function say(s: Swimmer, k: FeelKind): void {
    s.feel = k;
    s.feelT = FEEL_LIFE;
  }

  function pickFlake(s: Swimmer): Flake | null {
    let best: Flake | null = null, bd = 380;
    for (const f of flakes) {
      if (f.eaten || f.a < 0.3 || (f.claim >= 2 && f !== s.food)) continue;
      const d = Math.hypot(f.x - s.x, f.y - s.y) + f.claim * 110;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  function release(s: Swimmer): void {
    if (s.food) s.food.claim = Math.max(0, s.food.claim - 1);
    s.food = null;
  }

  function leavePair(s: Swimmer, partnerTo: State = 'cruise'): void {
    const p = s.partner;
    s.partner = null;
    if (p && p.partner === s) {
      p.partner = null;
      enter(p, partnerTo);
    }
  }

  function enter(s: Swimmer, st: State): void {
    if (s.state === 'eat' && st !== 'eat') release(s);
    s.state = st;
    s.forceFace = 0;
    s.flipped = false;
    const r = rand;
    if (st === 'cruise') { s.dur = 4 + r() * 5; cruiseTarget(s, 0); }
    else if (st === 'look') { s.dur = 1.6 + r() * 2.2; s.tx = s.x + s.face * 8; s.ty = s.y; }
    else if (st === 'sleep') {
      s.dur = 9 + r() * 7 + night * 10;
      const B = boxOf(s.fish) * s.z;
      const rest: Array<[number, number]> = [[34, sandTop(34) + 24], [W - 38, sandTop(W - 38) + 28], [66, sandTop(66) + 30], [W - 68, sandTop(W - 68) + 34]];
      for (const k of ['house', 'castle', 'coral', 'chest', 'shell', 'mushrooms'] as const) if (decor.has(k)) { const p = spot(k); rest.push([p.x, p.y]); }
      if (r() < 0.55 && rest.length) {
        const [px, py] = rest[Math.floor(r() * rest.length)];
        const side = px < W / 2 ? 1 : -1;
        s.tx = clamp(px + side * B * (0.55 + r() * 0.2), B * 0.45, W - B * 0.45);
        s.ty = py - B * (0.34 + r() * 0.12);
      } else {
        s.tx = clamp(s.x + (r() - 0.5) * 120, B * 0.45, W - B * 0.45);
        s.ty = sandTop(s.tx) + 14 + r() * 36 - B * 0.26;
      }
      s.ty = clamp(s.ty, TOP_BAND + B * 0.4, H - BAR - B * 0.3);
    } else if (st === 'eat') { s.dur = 14; s.food = null; }
    else { s.dur = st === 'play' ? 5 + r() * 4 : 6 + r() * 2.5; }
    s.timer = s.dur;
  }

  function findPal(s: Swimmer): Swimmer | null {
    let best: Swimmer | null = null, bd = 330;
    for (const o of swimmers) {
      if (o === s || o.partner || o.alpha < 0.9 || o.notice > 0 || (o.state !== 'cruise' && o.state !== 'look')) continue;
      const d = Math.hypot(o.x - s.x, (o.y - s.y) * 1.3);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  function pair(s: Swimmer, p: Swimmer, st: 'play' | 'talk'): void {
    enter(s, st);
    enter(p, st);
    p.timer = s.timer;
    s.partner = p; p.partner = s;
    s.lead = true; p.lead = false;
    s.playKind = rand() < 0.5 ? 0 : 1;
    const [lo, hi] = band(s);
    s.cx = clamp((s.x + p.x) / 2, 90, W - 90);
    s.cy = clamp((s.y + p.y) / 2, lo + 30, Math.max(lo + 30, hi - 30));
    s.ang = Math.atan2(s.y - s.cy, s.x - s.cx);
    s.met = p.met = false;
    s.lineT = 0.4; s.spk = 0;
  }

  function decide(s: Swimmer): void {
    const pal = findPal(s);
    const opts: Array<[State, number]> = [['cruise', 0.36], ['look', 0.16], ['sleep', 0.05 + 0.5 * night]];
    if (pal) opts.push(['play', 0.16 * (1 - 0.6 * night)], ['talk', 0.13]);
    if (pickFlake(s)) opts.push(['eat', 1.6]);
    let tot = 0;
    for (const o of opts) tot += o[1];
    let r = rand() * tot;
    let st: State = 'cruise';
    for (const o of opts) { r -= o[1]; if (r <= 0) { st = o[0]; break; } }
    if ((st === 'play' || st === 'talk') && pal) pair(s, pal, st);
    else enter(s, st);
  }

  function startTurn(s: Swimmer): void {
    if (s.turning) return;
    s.turning = true;
    s.turnT = 0;
    s.turnFrom = s.face;
  }

  function puff(x: number, y: number, k: number): void {
    for (let i = 0; i < 5 && crumbs.length < 60; i++) {
      const a = rand() * Math.PI * 2;
      crumbs.push({ x, y, vx: Math.cos(a) * (8 + rand() * 10), vy: Math.sin(a) * (6 + rand() * 8) - 4, life: 0.5 + rand() * 0.3, k });
    }
  }

  function stepFish(s: Swimmer, dt: number): void {
    const r = rand;
    const B = boxOf(s.fish) * s.z;
    const [lo, hi] = band(s);
    const m = B * 0.42;
    s.alpha = Math.min(1, s.alpha + dt / 1.2);
    if (s.wig > 0) s.wig = Math.max(0, s.wig - dt);
    if (s.feelT > 0) { s.feelT -= dt; if (s.feelT <= 0) s.feel = null; }
    s.bumpCD -= dt;
    s.timer -= dt;
    s.lunge = 0; s.pulse = 0;
    if (s.notice > 0) {
      s.notice -= dt;
      if (s.notice <= 0 && s.state !== 'eat' && pickFlake(s)) { leavePair(s); enter(s, 'eat'); }
    }
    let spd = s.cruise, acc = 1.3, want: number = 0, sleeping = false;
    const p = s.partner;
    switch (s.state) {
      case 'cruise': {
        if (Math.hypot(s.tx - s.x, (s.ty - s.y) * 2) < 26) cruiseTarget(s, 0);
        s.happyCD -= dt;
        if (s.happyCD <= 0) { s.happyCD = 14 + r() * 18; if (r() < 0.35 * (1 - night * 0.5)) say(s, r() < 0.5 ? 'note' : 'sparkle'); }
        if (s.timer <= 0) decide(s);
        break;
      }
      case 'look': {
        spd = s.cruise * 0.12;
        if (!s.flipped && s.timer < s.dur * 0.5) { s.flipped = true; if (r() < 0.65) s.forceFace = s.face === 1 ? -1 : 1; }
        if (s.forceFace) want = s.forceFace;
        if (s.timer <= 0) decide(s);
        break;
      }
      case 'play': {
        if (!p || p.partner !== s) { s.partner = null; enter(s, 'cruise'); break; }
        const L = s.lead ? s : p;
        spd = s.cruise * 2.3 + 18; acc = 2.6;
        const Rx = 58 + B * 0.2, Ry = 24 + B * 0.1;
        if (s.lead) L.ang += dt * (L.playKind === 0 ? 1.25 : 0.95) * calm;
        const a = L.ang + (s.lead ? 0 : Math.PI);
        if (L.playKind === 0) { s.tx = L.cx + Math.cos(a) * Rx; s.ty = L.cy + Math.sin(a) * Ry; }
        else if (s.lead) { s.tx = L.cx + Math.cos(a) * Rx * 1.5; s.ty = L.cy + Math.sin(a * 2) * Ry * 1.2; }
        else { s.tx = L.x - L.face * B * 0.55; s.ty = L.y; spd *= 1.12; }
        if (s.lead && s.bumpCD <= 0) {
          const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d < B * 0.42 && !reduced) {
            const k = 34 / d;
            s.vx += dx * k; s.vy += dy * k * 0.6; p.vx -= dx * k; p.vy -= dy * k * 0.6;
            s.wig = p.wig = 0.45;
            s.bumpCD = 2.4;
            if (r() < 0.5) say(r() < 0.5 ? s : p, r() < 0.5 ? 'note' : 'sparkle');
          }
        }
        if (s.lead && s.timer <= 0) {
          if (r() < 0.45) { say(s, 'heart'); say(p, r() < 0.5 ? 'heart' : 'smile'); }
          leavePair(s);
          enter(s, 'cruise');
        }
        break;
      }
      case 'talk': {
        if (!p || p.partner !== s) { s.partner = null; enter(s, 'cruise'); break; }
        const L = s.lead ? s : p;
        const gap = (B + boxOf(p.fish) * p.z) * 0.44;
        const left = L.x <= (s.lead ? p.x : s.x) ? L : (s.lead ? p : s);
        s.tx = L.cx + (s === left ? -gap / 2 : gap / 2);
        s.ty = L.cy + (s.lead ? -2 : 2);
        spd = s.cruise * 1.3 + 6;
        const dd = Math.hypot(s.tx - s.x, s.ty - s.y);
        if (dd < 16) s.met = true;
        if (s.met) want = s === left ? 1 : -1;
        if (s.lead && s.met && p.met) {
          s.lineT -= dt;
          if (s.lineT <= 0) {
            s.lineT = 1.15 + r() * 0.5;
            const who = s.spk++ % 2 === 0 ? s : p;
            const other = who === s ? p : s;
            const pool: FeelKind[] = night > 0.6 ? ['heart', 'smile', 'zz', 'note'] : ['heart', 'note', 'smile', 'sparkle'];
            const kind = other.feel && r() < 0.5 ? other.feel : pool[Math.floor(r() * pool.length)];
            say(who, kind);
            who.wig = Math.max(who.wig, 0.3);
          }
        }
        if (s.lead && s.timer <= 0) { leavePair(s); enter(s, 'cruise'); }
        break;
      }
      case 'sleep': {
        const dd = Math.hypot(s.tx - s.x, s.ty - s.y);
        spd = dd > 40 ? s.cruise * 0.8 + 14 : 9 + s.z * 4;
        acc = 0.9;
        sleeping = dd < 22;
        if (sleeping) {
          s.zzAcc += dt * 0.5 * calm * s.sleepK;
          if (s.zzAcc >= 1 && zbubs.length < 30) {
            s.zzAcc = 0;
            zbubs.push({ x: s.x + s.face * B * 0.24, y: s.y + s.bob - B * 0.16, life: 2.6, ph: r() * 6 });
          }
        }
        if (s.timer <= 0) { if (r() < 0.4) say(s, 'sparkle'); decide(s); }
        break;
      }
      case 'eat': {
        if (!s.food || s.food.eaten) {
          release(s);
          const f = pickFlake(s);
          if (!f) { enter(s, 'cruise'); break; }
          s.food = f;
          f.claim++;
        }
        const f = s.food;
        spd = s.cruise * 1.9 + 12; acc = 2.4;
        if (Math.abs(f.x - s.x) > B * 0.12) want = f.x > s.x ? 1 : -1;
        const mo = B * 0.42;
        s.tx = f.x - s.face * mo;
        s.ty = f.y + B * 0.03;
        const mx = s.x + s.face * mo, my = s.y + s.bob;
        const dm = Math.hypot(f.x - mx, f.y - my);
        if (s.nib <= 0 && dm < 10 + B * 0.06 && !s.turning) s.nib = 0.5;
        if (s.timer <= 0) enter(s, 'cruise');
        break;
      }
    }
    if (s.nib > 0) {
      const prev = s.nib;
      s.nib = Math.max(0, s.nib - dt);
      const k = 1 - s.nib / 0.5;
      s.lunge = Math.sin(k * Math.PI) * B * 0.07;
      s.pulse = Math.sin(k * Math.PI);
      if (prev > 0.22 && s.nib <= 0.22 && s.food && !s.food.eaten) {
        s.food.eaten = true;
        puff(s.food.x, s.food.y, s.food.k);
        if (r() < 0.3) say(s, r() < 0.5 ? 'heart' : 'smile');
      }
    }
    // steering toward the target point (arrive)
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy) || 1;
    const v = Math.min(spd, d * 1.3);
    const kk = Math.min(1, dt * acc);
    s.vx += (dx / d * v - s.vx) * kk;
    s.vy += (dy / d * v * 0.7 - s.vy) * kk;
    if (s.turning) s.vx *= 1 - Math.min(1, dt * 2.2);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    const sleepLo = s.state === 'sleep' ? H - BAR - B * 0.3 : hi;
    s.y = clamp(s.y, lo - 6, Math.max(hi, sleepLo));
    s.x = clamp(s.x, -B, W + B);
    if (!want && Math.abs(s.vx) > 5 && Math.abs(s.vx) > Math.abs(s.vy) * 0.35) want = s.vx > 0 ? 1 : -1;
    if (s.state !== 'eat' && s.state !== 'talk' && ((s.face === 1 && s.x > W - m && s.tx > s.x - 4) || (s.face === -1 && s.x < m && s.tx < s.x + 4))) {
      s.tx = clamp(s.x - s.face * 120, m, W - m);
    }
    if (want && want !== s.face && !s.turning) startTurn(s);
    if (s.turning) {
      const prev = s.turnT;
      s.turnT += dt / (s.fish.rank >= 8 ? 1.3 : 0.9) * (reduced ? 0.7 : 1);
      if (prev < 0.5 && s.turnT >= 0.5) s.face = s.turnFrom === 1 ? -1 : 1;
      if (s.turnT >= 1) { s.turning = false; s.turnT = 0; if (s.forceFace === s.face) s.forceFace = 0; }
    }
    // sleepiness: eyes close, bob slows, body settles
    const sk = s.state === 'sleep' && sleeping ? 1 : 0;
    s.sleepK += (sk - s.sleepK) * Math.min(1, dt * (sk ? 0.8 : 2));
    const sn = clamp(Math.hypot(s.vx, s.vy) / Math.max(1, s.cruise), 0, 1.8);
    s.bobPh += dt * s.bobF * (1 - 0.65 * s.sleepK);
    s.bob = Math.sin(s.bobPh + s.ph) * s.bobA * (1 - 0.6 * s.sleepK) * (s.state === 'play' ? 0.4 : 1);
    s.wave += dt * s.wagF * (0.45 + 0.55 * Math.min(1.4, sn)) * (1 - 0.6 * s.sleepK);

    if (s.fish.rank >= 8 && s.alpha > 0.5 && sparks.length < 140 && s.sleepK < 0.5) {
      s.trailAcc += dt * (s.fish.rank >= 10 ? 5 : 3.2) * (0.4 + Math.min(1.5, sn));
      while (s.trailAcc >= 1) {
        s.trailAcc -= 1;
        const life = 1 + r() * 0.8;
        sparks.push({ x: s.x - s.face * B * 0.36 + (r() - 0.5) * 10, y: s.y + s.bob + (r() - 0.5) * B * 0.25, life, max: life, r: 2.5 + r() * 3 });
      }
    }
  }

  // ---------- drawing the fish ----------

  const offs = new Float32Array(16);
  const scl = new Float32Array(16);

  function strips(src: HTMLCanvasElement, B: number, n: number): void {
    const sw = src.width / n, sh = src.height;
    const dw = B / n;
    for (let i = 0; i < n; i++) {
      const sx = i * sw;
      const w = i < n - 1 ? sw * 1.03 : src.width - sx;
      const hs = scl[i];
      ctx.drawImage(src, sx, 0, w, sh, -B / 2 + i * dw, -B / 2 * hs + offs[i], dw * (w / sw), B * hs);
    }
  }

  interface Lamp { x: number; y: number; R: number; spr: 'warm' | 'cyan'; w: number }
  let lamps: Lamp[] = [];
  function updateLamps(): void {
    lamps = [];
    if (decor.has('lantern')) { const p = spot('lantern'); lamps.push({ x: p.x, y: p.y - 60, R: 200, spr: 'warm', w: 1 }); }
    if (decor.has('mushrooms')) { const p = spot('mushrooms'); lamps.push({ x: p.x, y: p.y - 24, R: 160, spr: 'cyan', w: 0.85 }); }
    if (decor.has('chest')) { const p = spot('chest'); lamps.push({ x: p.x, y: p.y - 36, R: 120, spr: 'warm', w: 0.6 }); }
  }

  function drawShadow(s: Swimmer): void {
    if (!shadowSpr) return;
    const B = boxOf(s.fish) * s.z;
    const y = s.y + s.bob;
    const gy = Math.max(sandTop(s.x) + 10, y + B * 0.26);
    const hn = clamp((gy - (y + B * 0.26)) / 230, 0, 1);
    const a = s.alpha * 0.34 * (1 - hn) * (1 - 0.4 * night);
    if (a < 0.01) return;
    const w = B * (0.62 + 0.55 * hn), h = w * 0.24;
    ctx.globalAlpha = a;
    ctx.drawImage(shadowSpr, s.x - w / 2, gy - h / 2, w, h);
  }

  function drawFish(s: Swimmer, t: number): void {
    const f = s.fish;
    const B = boxOf(f);
    const z = s.z;
    const Bz = B * z;
    const sp = sprites.get(f.id);
    if (sp && sp.ready && !sp.baked) bakeSprite(sp, f);
    // turning reads as a roll: squash through zero, a little vertical stretch, far side darker
    let sx: number, sy = 1, shade = 0;
    if (s.turning) {
      const c = -s.turnFrom * Math.cos(Math.PI * s.turnT);
      sx = Math.sign(c || -s.face) * Math.max(0.08, Math.abs(c));
      const mid = Math.sin(Math.PI * s.turnT);
      sy = 1 + 0.07 * mid;
      shade = 0.42 * mid;
    } else sx = -s.face;
    // pitch follows vertical velocity
    const vyTot = s.vy + Math.cos(s.bobPh + s.ph) * s.bobA * s.bobF * (1 - 0.6 * s.sleepK);
    let rot = clamp(Math.atan2(vyTot, Math.max(16, Math.abs(s.vx))) * 0.8, -0.36, 0.36) * s.face;
    if (s.state === 'look') rot += Math.sin(t * 1.4 + s.ph) * 0.06 * calm;
    rot += s.sleepK * 0.07 * s.face;
    let sc = 1, hop = 0;
    if (s.wig > 0) {
      const k = Math.min(1, s.wig / 0.9);
      rot += Math.sin(s.wig * 26) * 0.18 * k;
      sc = 1 + Math.sin(s.wig * 13) * 0.05 * k;
      hop = Math.sin((1 - k) * Math.PI) * 6 * k;
    }
    const x = s.x + s.face * s.lunge;
    const y = s.y + s.bob - hop;
    // light from nearby lanterns / glow mushrooms (stronger at night)
    let prox = 0, lamp: Lamp | null = null;
    for (const L of lamps) {
      const q = Math.max(0, 1 - Math.hypot(L.x - x, L.y - y) / L.R) * L.w;
      if (q > prox) { prox = q; lamp = L; }
    }
    const lampK = prox * (0.35 + 0.65 * night);
    if (lamp && lampK > 0.03) {
      const spr = lamp.spr === 'warm' ? warm : cyan;
      if (spr) {
        const R = Bz * 0.85;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = s.alpha * lampK * 0.4;
        ctx.drawImage(spr, x - R, y - R * 0.8, R * 2, R * 1.6);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (f.rank >= 11 && halo) {
      const R = Bz * 0.85 * (1 + Math.sin(t * 1.3) * 0.05);
      ctx.globalAlpha = s.alpha * (0.38 + 0.12 * Math.sin(t * 1.7)) * (1 - 0.3 * night);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(halo, x - R, y - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx * sc * z, sy * sc * z);
    if (sp && sp.ready && sp.baked) {
      // night bioluminescent glow behind the body (rarer fish glow more)
      const nb = night * (1 - 0.7 * prox);
      if (night > 0.03 && sp.glow) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = s.alpha * night * (0.2 + 0.03 * f.rank) * (0.9 + 0.1 * Math.sin(t * 1.1 + s.ph)) * (1 - 0.4 * s.sleepK);
        ctx.drawImage(sp.glow, -B * 0.75, -B * 0.75, B * 1.5, B * 1.5);
        ctx.globalCompositeOperation = 'source-over';
      }
      // swimming wave along the body (grows toward the tail) + mouth pulse while nibbling
      const sn = clamp(Math.hypot(s.vx, s.vy) / Math.max(1, s.cruise), 0, 1.6);
      const amp = B * 0.045 * (0.3 + 0.55 * sn) * (1 - 0.85 * s.sleepK) * (reduced ? 0.5 : 1) + (s.turning ? B * 0.01 : 0);
      const n = STRIPS;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        offs[i] = amp * (Math.pow(u, 1.8) - 0.14 * (1 - u) * (1 - u)) * Math.sin(s.wave - u * 3.4);
        scl[i] = 1 + s.pulse * 0.15 * Math.max(0, 1 - u / 0.32);
      }
      const lit = litFor(sp, z);
      // One lit copy per fish (drawing both and cross-fading doubled the cost during dusk).
      ctx.globalAlpha = s.alpha;
      strips(nb < 0.5 ? lit.day : lit.night, B, n);
      if (shade > 0.02 && sp.shade) { ctx.globalAlpha = s.alpha * shade; strips(sp.shade, B, n); }
      // closed eye while asleep
      if (s.sleepK > 0.05) {
        const ei = Math.min(n - 1, Math.floor(EYE_U * n));
        const ex = -B / 2 + B * EYE_U, ey = -B / 2 + B * EYE_V + offs[ei], er = B * EYE_R;
        ctx.globalAlpha = s.alpha * Math.min(1, s.sleepK * 1.3);
        if (sp.lid) {
          const k = 1 - 0.5 * nb;
          ctx.fillStyle = `rgb(${Math.round(sp.lid[0] * k)},${Math.round(sp.lid[1] * k)},${Math.round(sp.lid[2] * (1 - 0.3 * nb))})`;
          ctx.beginPath();
          ctx.arc(ex, ey, er, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = C.outline;
        ctx.lineWidth = B * 0.03;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ex, ey - er * 0.35, er * 0.8, 0.18 * Math.PI, 0.82 * Math.PI);
        ctx.stroke();
      }
      // specular glint + caustic flicker sliding over the upper body
      if (glintSpr) {
        const caus = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.9 + s.x * 0.031) * Math.sin(t * 1.3 + s.ph + s.y * 0.02);
        const gx = -B * 0.12 + B * 0.1 * Math.sin(t * 0.55 * calm + s.ph);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = s.alpha * (0.16 + 0.2 * caus) * (1 - 0.55 * night) * (1 - shade);
        ctx.drawImage(glintSpr, gx - B * 0.09, -B * 0.15, B * 0.18, B * 0.08);
        ctx.globalAlpha = s.alpha * 0.1 * caus * (1 - night);
        ctx.drawImage(glintSpr, gx + B * 0.02, -B * 0.1, B * 0.3, B * 0.14);
        ctx.globalCompositeOperation = 'source-over';
      }
    } else if (sp && sp.failed) {
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = C.orange[2];
      ctx.strokeStyle = C.outline;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, B * 0.3, B * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      poly(ctx, [{ x: B * 0.26, y: 0 }, { x: B * 0.42, y: -B * 0.12 }, { x: B * 0.42, y: B * 0.12 }], { fill: C.orange[1], stroke: C.outline, line: 2 });
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFeel(s: Swimmer): void {
    if (!s.feel || s.feelT <= 0) return;
    const spr = feelSpr.get(s.feel);
    if (!spr) return;
    const Bz = boxOf(s.fish) * s.z;
    const k = 1 - s.feelT / FEEL_LIFE;
    const pop = k < 0.14 ? 1 + 0.18 * Math.sin((k / 0.14) * Math.PI) * (k / 0.14) : 1;
    const inS = k < 0.14 ? 0.4 + 0.6 * (k / 0.14) : 1;
    const a = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.1);
    const size = 30 * pop * inS * (0.85 + 0.15 * s.z);
    const x = s.x + s.face * Bz * 0.16 + Bz * 0.06;
    const y = s.y + s.bob - Bz * 0.36 - size * 0.55 - k * 8;
    ctx.globalAlpha = a * s.alpha * (1 - 0.12 * night);
    ctx.drawImage(spr, x - size / 2, y - size / 2, size, size);
  }

  // ---------- scene ----------

  function drawKelp(list: KelpStrand[], t: number, nightA = 0): void {
    const amp = 9 * calm, spd = 0.7 * calm;
    for (const k of list) {
      const strip = 14;
      const n = Math.ceil(k.hh / strip);
      for (let i = 0; i < n; i++) {
        const sy = k.hh - (i + 1) * strip;
        const fy = clamp((k.hh - 6 - (sy + strip / 2)) / k.h, 0, 1);
        const dx = amp * Math.pow(fy, 1.5) * Math.sin(t * spd + k.ph * 2 - fy * 1.6) + Math.pow(fy, 2) * 3 * Math.sin(t * spd * 1.9 + k.ph);
        const y0 = Math.max(0, sy);
        const h0 = sy + strip - y0;
        if (h0 <= 0) continue;
        if (nightA < 0.98) ctx.drawImage(k.c, 0, y0 * dpr, k.c.width, h0 * dpr, k.ox + dx, k.oy + y0, k.w, h0);
        if (nightA > 0.01) {
          ctx.globalAlpha = nightA < 0.98 ? nightA : 1;
          ctx.drawImage(k.cn, 0, y0 * dpr, k.c.width, h0 * dpr, k.ox + dx, k.oy + y0, k.w, h0);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  function spawnBubble(x: number, y: number, r: number, vy: number): void {
    if (bubbles.length < 90) bubbles.push({ x, y, r, vy, ph: rand() * 6.28, a: 0 });
  }
  let ambientAcc = 0, bubblerAcc = 0, chestTimer = 3, naturalT = 7 + rand() * 8;

  function dropFood(x: number, y: number, n: number, spread: number): void {
    for (let i = 0; i < n && flakes.length < 48; i++) {
      flakes.push({
        x: clamp(x + (rand() - 0.5) * spread, 12, W - 12), y: y + (rand() - 0.5) * spread * 0.5, vy: (10 + rand() * 7) * (0.6 + 0.4 * calm), ph: rand() * 6.28,
        rot: rand() * 6.28, k: Math.floor(rand() * FLAKE_COLORS.length), landed: false, floor: 0, age: 0, eaten: false, claim: 0, a: 0,
      });
      const f = flakes[flakes.length - 1];
      f.floor = sandTop(f.x) + 8 + rand() * 34;
    }
  }

  function stepFood(dt: number, t: number): void {
    naturalT -= dt;
    if (naturalT <= 0) {
      naturalT = 16 + rand() * 18;
      const x = 40 + rand() * (W - 80);
      dropFood(x, TOP_BAND - 18, 1 + Math.floor(rand() * 2), 40);
    }
    for (const f of flakes) {
      f.age += dt;
      f.a = Math.min(1, f.a + dt * 3);
      if (!f.landed) {
        f.y += f.vy * dt;
        f.x += Math.sin(t * 1.5 + f.ph) * 7 * dt * calm;
        f.rot += Math.sin(t * 0.9 + f.ph) * dt * 0.8;
        if (f.y >= f.floor) { f.y = f.floor; f.landed = true; f.age = 0; }
      } else if (f.age > 14) f.a = Math.max(0, 1 - (f.age - 14) / 2);
    }
    if (flakes.some((f) => f.eaten || (f.landed && f.age > 16))) flakes = flakes.filter((f) => !(f.eaten || (f.landed && f.age > 16)));
    if (crumbs.length) {
      for (const c of crumbs) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 1 - dt * 3; c.vy *= 1 - dt * 3; }
      crumbs = crumbs.filter((c) => c.life > 0);
    }
    if (zbubs.length) {
      for (const b of zbubs) { b.life -= dt; b.y -= 13 * dt * calm; b.x += Math.sin(t * 1.4 + b.ph) * 6 * dt; }
      zbubs = zbubs.filter((b) => b.life > 0);
    }
  }

  function stepBubbles(dt: number): void {
    ambientAcc += dt * 0.9 * calm;
    while (ambientAcc >= 1) {
      ambientAcc -= 1;
      const x = rand() * W;
      spawnBubble(x, sandTop(x) - 6 - rand() * 200, 1.4 + rand() * 2.6, (16 + rand() * 14) * calm);
    }
    if (decor.has('bubbler')) {
      bubblerAcc += dt * 3.2 * calm;
      const p = spot('bubbler');
      while (bubblerAcc >= 1) {
        bubblerAcc -= 1;
        spawnBubble(p.x + (rand() - 0.5) * 6, p.y - 14, 1.8 + rand() * 2.4, (34 + rand() * 18) * calm);
      }
    }
    if (decor.has('chest')) {
      chestTimer -= dt;
      if (chestTimer <= 0) {
        chestTimer = (4 + rand() * 6) / calm;
        const p = spot('chest');
        spawnBubble(p.x - 4 + rand() * 10, p.y - 44, 2.6 + rand() * 1.6, 26 * calm);
        if (rand() < 0.6) spawnBubble(p.x + rand() * 8, p.y - 40, 1.8, 30 * calm);
      }
    }
    const top = 96;
    bubbles = bubbles.filter((b) => {
      b.y -= b.vy * dt * (1 + b.r * 0.06);
      b.x += Math.sin(b.y * 0.05 + b.ph) * 8 * dt;
      b.a = Math.min(1, b.a + dt * 2);
      return b.y > top;
    });
  }

  let order: Swimmer[] = [];

  function frame(t: number): void {
    if (dirty) { rebuild(); updateLamps(); }
    const day = 1 - night;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(bg!, 0, 0, W, H);

    // god rays: two sets breathing in counter-phase, drifting a little
    if (day > 0.02 && rays && rays2) {
      const rs = 0.25 * calm;
      const rh = sandY + 20;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = day * (0.1 + 0.05 * Math.sin(t * rs * 1.3));
      ctx.drawImage(rays, Math.sin(t * rs) * 14, 0, W, rh);
      ctx.globalAlpha = day * (0.08 + 0.05 * Math.sin(t * rs * 1.1 + 2.2));
      ctx.drawImage(rays2, Math.sin(t * rs * 0.8 + 1) * 18, 0, W, rh);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // caustic shimmer on the sand
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#fffbe3';
    const cs = 0.6 * calm;
    for (let i = 0; i < 16; i++) {
      const bx = ((i * 97.3) % W + Math.sin(t * cs * 0.3 + i) * 18 + W) % W;
      const by = sandTop(bx) + 12 + ((i * 37) % 60);
      const a = (0.1 + 0.1 * Math.sin(t * cs * (1 + (i % 3) * 0.3) + i * 1.7)) * (0.4 + 0.6 * day);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.ellipse(bx, by, 10 + (i % 4) * 4 + Math.sin(t * cs + i) * 3, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawKelp(backKelp, t);
    if (deco) ctx.drawImage(deco, 0, decoTop, W, H - decoTop);

    // bubbles
    if (bubbleSpr) {
      for (const b of bubbles) {
        ctx.globalAlpha = b.a * clamp((b.y - 96) / 60, 0, 1) * 0.95;
        const s = b.r * 2.4;
        ctx.drawImage(bubbleSpr, b.x - s / 2, b.y - s / 2, s, s);
      }
    }
    // soft fish shadows on the sand
    for (const s of swimmers) drawShadow(s);
    ctx.globalAlpha = 1;

    // night: cool, dim water; then the emitted lights come up
    if (night > 0.01) {
      ctx.fillStyle = `rgba(6,18,72,${(0.56 * night).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'lighter';
    if (decor.has('lantern') && warm) {
      const p = spot('lantern');
      const fl = 1 + Math.sin(t * 2.3) * 0.03 + Math.sin(t * 5.1) * 0.02;
      const R = (64 + 40 * night) * fl;
      ctx.globalAlpha = 0.4 + 0.5 * night;
      ctx.drawImage(warm, p.x - R, p.y - 60 - R, R * 2, R * 2);
      ctx.globalAlpha = 0.55 + 0.4 * night;
      ctx.drawImage(warm, p.x - 18, p.y - 78, 36, 36);
    }
    if (decor.has('house') && warm && night > 0.02) {
      const p = spot('house');
      ctx.globalAlpha = 0.7 * night;
      ctx.drawImage(warm, p.x - 36, p.y - 48, 32, 32);
      ctx.drawImage(warm, p.x + 4, p.y - 48, 32, 32);
    }
    if (decor.has('chest') && warm) {
      const p = spot('chest');
      ctx.globalAlpha = 0.18 + 0.35 * night;
      ctx.drawImage(warm, p.x - 34, p.y - 66, 68, 68);
    }
    if (decor.has('mushrooms') && cyan) {
      const p = spot('mushrooms');
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.4 * calm);
      ctx.globalAlpha = (0.22 + 0.6 * night) * pulse;
      ctx.drawImage(cyan, p.x - 40, p.y - 58, 80, 80);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // food flakes (above the darkening so they stay readable at night)
    for (const f of flakes) {
      const spr = flakeSpr[f.k];
      if (!spr) continue;
      ctx.globalAlpha = f.a * (f.landed ? 0.85 : 1);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot);
      ctx.drawImage(spr, -4, -4, 8, 8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // fish, far ones first (lit on top of the night water so they stay visible)
    order = swimmers.slice().sort((a, b) => a.z - b.z);
    for (const s of order) drawFish(s, t);

    // sparkle trails of rare fish
    if (sparkSpr && sparks.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of sparks) {
        const k = p.life / p.max;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.6;
        const s = p.r * 2 * (0.5 + 0.5 * k);
        ctx.drawImage(sparkSpr, p.x - s / 2, p.y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // crumbs + sleepy z bubbles + feeling bubbles
    for (const c of crumbs) {
      const spr = flakeSpr[c.k];
      if (!spr) continue;
      ctx.globalAlpha = clamp(c.life / 0.5, 0, 1);
      ctx.drawImage(spr, c.x - 1.6, c.y - 1.6, 3.2, 3.2);
    }
    if (zSpr) {
      for (const b of zbubs) {
        const k = 1 - b.life / 2.6;
        ctx.globalAlpha = Math.sin(Math.min(1, k * 1.15) * Math.PI) * 0.85;
        const s = 9 + k * 7;
        ctx.drawImage(zSpr, b.x - s / 2, b.y - s / 2, s, s);
      }
    }
    for (const s of order) drawFeel(s);
    ctx.globalAlpha = 1;

    drawKelp(frontKelp, t + 1.3, night);
  }

  // ---------- loop ----------

  let raf = 0;
  let last = 0;
  let clock = 0;
  const step = (dt: number): void => {
    clock += dt;
    for (const s of swimmers) stepFish(s, dt);
    stepBubbles(dt);
    stepFood(dt, clock);
    if (sparks.length) {
      for (const p of sparks) { p.life -= dt; p.y -= 6 * dt; }
      sparks = sparks.filter((p) => p.life > 0);
    }
  };
  let fpsCap = 0;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    if (fpsCap > 0 && last && now - last < 1000 / fpsCap - 3) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    frame(clock);
  };

  const onResize = (): void => {
    measure();
    for (const s of swimmers) {
      const [lo, hi] = band(s);
      s.y = clamp(s.y, lo, Math.max(hi, s.state === 'sleep' ? H - BAR : hi));
      s.ty = clamp(s.ty, lo, hi);
      s.x = clamp(s.x, 0, W);
      s.tx = clamp(s.tx, 0, W);
    }
    if (!canvas.hidden) frame(clock);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  measure();

  // prime a few bubbles so the tank does not start empty
  for (let i = 0; i < 14; i++) spawnBubble(rand() * W, TOP_BAND + 20 + rand() * (sandY - TOP_BAND - 40), 1.4 + rand() * 2.6, (16 + rand() * 14) * calm);
  for (const b of bubbles) b.a = 1;

  canvas.addEventListener('pointerdown', (e) => {
    const rc = canvas.getBoundingClientRect();
    const px = e.clientX - rc.left, py = e.clientY - rc.top;
    let best = -1, bd = Infinity;
    swimmers.forEach((s, i) => {
      const d = Math.hypot(s.x - px, s.y + s.bob - py);
      if (d < boxOf(s.fish) * s.z * 0.45 && d < bd) { bd = d; best = i; }
    });
    if (best < 0) {
      waterFn?.(px, py);
      return;
    }
    const s = swimmers[best];
    s.wig = 0.9;
    if (s.state === 'sleep') { s.timer = Math.min(s.timer, 0.6); say(s, 'sparkle'); }
    const mx = s.x + s.face * boxOf(s.fish) * s.z * 0.36;
    for (let k = 0; k < 3; k++) spawnBubble(mx + (rand() - 0.5) * 6, s.y + s.bob - 4 - k * 7, 1.6 + rand() * 1.4, 28 * calm);
    tapFn?.(best, s.x, s.y + s.bob);
  });

  function feed(x: number, y: number): void {
    const n = 5 + Math.floor(rand() * 4);
    dropFood(x, clamp(y, TOP_BAND - 20, sandY), n, 26);
    for (const s of swimmers) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (s.state === 'eat') continue;
      if (s.state === 'sleep') { if (d < 260 && rand() < 0.6) s.notice = 0.7 + rand() * 1.2; }
      else if (d < 330) s.notice = 0.12 + rand() * 0.8;
    }
  }

  const view: TankView = {
    show: () => {
      if (!canvas.hidden && raf) return;
      canvas.hidden = false;
      last = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    setFpsCap: (fps) => {
      fpsCap = Math.max(0, fps || 0);
    },
    hide: () => {
      canvas.hidden = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    setFish,
    setDecor: (ids) => {
      const next = new Set(ids);
      if (next.size === decor.size && [...next].every((d) => decor.has(d))) return;
      decor = next;
      dirty = true;
    },
    setNight: (n) => {
      night = clamp(Number.isFinite(n) ? n : 0, 0, 1);
    },
    fishPos: (i) => {
      const s = swimmers[i];
      return s ? { x: s.x, y: s.y + s.bob } : null;
    },
    onTap: (fn) => {
      tapFn = fn;
    },
    onWaterTap: (fn) => {
      waterFn = fn;
    },
    feed,
  };
  // dev-only hook for the scratch harness (not part of TankView): force a behaviour / advance time
  Object.defineProperty(view, '__debug', {
    enumerable: false,
    value: {
      force(i: number, st: State, j?: number): void {
        const s = swimmers[i];
        if (!s) return;
        leavePair(s);
        const p = j !== undefined ? swimmers[j] : undefined;
        if (p && (st === 'play' || st === 'talk')) { leavePair(p); pair(s, p, st); } else enter(s, st);
      },
      step(sec: number): void { for (let k = 0; k < sec * 60; k++) step(1 / 60); },
      state: () => swimmers.map((s) => s.state),
    },
  });
  return view;
}
