// The Scene: owns the canvas, the clock, weather, lighting, shared FX and the layer stack.
// Everything is drawn as smooth vector art in CSS-pixel coordinates at full device resolution.

import { css, rgb, type ColorLike, type RGB } from './color';
import { ctx2d, type Pt } from './draw';
import { Particles, Ripples, type ParticleOpts, type RippleOpts } from './fx';
import {
  computeLight,
  gradeRGB,
  TOD_PRESETS,
  WEATHER_PRESETS,
  type LightState,
  type SunArc,
  type TodPreset,
  type WeatherPreset,
  type WeatherState,
} from './lighting';
import { clamp, easeInOut, hashString, makeRng, noise1, wrap, type Rng } from './math';
import { C } from './palette';

export interface Layer {
  /** Unique id, prefixed by its module: 'sky.clouds', 'water.surface'. */
  id: string;
  /** Draw order. Each module owns a z band (docs/ART_GUIDE.md). */
  z: number;
  /** Called once when added; layout is ready. */
  init?(s: Scene): void;
  /** Called after init and whenever the screen size changes. Rebuild size-dependent data here. */
  resize?(s: Scene): void;
  update?(s: Scene, dt: number): void;
  draw?(s: Scene, ctx: CanvasRenderingContext2D): void;
}

/** A layer module is a factory: it receives the scene and returns its layers (closure holds state). */
export type LayerModule = (s: Scene) => Layer[];

export interface LilySpot extends Pt {
  /** Pad radius (horizontal) in CSS px. */
  r: number;
  flower: boolean;
}

/**
 * Shared anchor points so modules line up, in CSS px. Proportions come from the reference picture.
 * Everything that belongs to "the picture" is placed inside `stage`, a column as wide as the screen
 * on phones and centered on wide screens; sky, hills and water extend across the whole width.
 */
export interface Layout {
  W: number;
  H: number;
  /** Size unit: 1 on a 390×844 phone. Multiply sizes and line widths by it. */
  u: number;
  stage: { x0: number; w: number };
  /** First row of water (the shoreline). */
  horizon: number;
  /** Roughly the top of the tallest hill or tree. */
  hillTop: number;
  /** The pier: a quad from its far end (by the fisher) to its near end (off the bottom edge). */
  dock: { farL: Pt; farR: Pt; nearL: Pt; nearR: Pt; side: number };
  /** Bottom-centre of the seated fisher, on the far end of the pier. */
  fisher: Pt;
  /** Bottom-centre of the bucket on the pier. */
  bucket: Pt;
  /** Where the rod is held, and its tip while waiting for a bite. */
  rodBase: Pt;
  rodTip: Pt;
  /** Where the bobber rests after a cast. */
  bobber: Pt;
  /** Cattail clump in the bottom-right of the stage. */
  reeds: { x0: number; x1: number; headY: number; baseY: number };
  /** Lily pad spots from the reference composition. */
  lilies: LilySpot[];
  /** Where the sun sits in the day preset (matches the picture). */
  sunDay: Pt & { r: number };
  sunArc: SunArc;
}

/** 'auto' runs its own day cycle, 'clock' follows the player's real local time, a preset holds it. */
export type TodMode = 'auto' | 'clock' | TodPreset;

/** The player's local time of day as 0..1 (0 = midnight). */
export const realTod = (): number => {
  const d = new Date();
  return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
};

declare const __TEST_SHORTCUTS__: boolean | undefined;
/** URL test shortcuts are on in dev, screenshots and the prototype page; the release build turns them off. */
export const TEST_SHORTCUTS: boolean = typeof __TEST_SHORTCUTS__ === 'undefined' ? true : __TEST_SHORTCUTS__;

export function computeLayout(W: number, H: number): Layout {
  const u = H / 844;
  const sw = Math.min(W, H * 0.62);
  const sx = (W - sw) / 2;
  const X = (f: number): number => sx + f * sw;
  const horizon = Math.round(H * 0.4);
  return {
    W,
    H,
    u,
    stage: { x0: sx, w: sw },
    horizon,
    hillTop: H * 0.315,
    dock: {
      farL: { x: X(0.139), y: H * 0.575 },
      farR: { x: X(0.328), y: H * 0.575 },
      nearL: { x: X(-0.517), y: H },
      nearR: { x: X(0.112), y: H },
      side: 8 * u,
    },
    fisher: { x: X(0.265), y: H * 0.572 },
    bucket: { x: X(0.17), y: H * 0.6 },
    rodBase: { x: X(0.33), y: H * 0.535 },
    rodTip: { x: X(0.494), y: H * 0.415 },
    bobber: { x: X(0.58), y: H * 0.505 },
    reeds: { x0: X(0.74), x1: Math.max(W, X(1.02)), headY: H * 0.59, baseY: H * 1.02 },
    lilies: [
      { x: X(0.503), y: H * 0.4985, r: 8.5 * u, flower: true },
      { x: X(0.791), y: H * 0.5235, r: 13 * u, flower: true },
      { x: X(0.545), y: H * 0.4575, r: 4.5 * u, flower: false },
      { x: X(0.59), y: H * 0.4505, r: 4 * u, flower: false },
      { x: X(0.925), y: H * 0.625, r: 19 * u, flower: true },
    ],
    sunDay: { x: X(0.815), y: H * 0.175, r: 30 * u },
    sunArc: { cx: X(0.5), cy: horizon, rx: sw * 0.5, ry: H * 0.2895 },
  };
}

interface TodAnim {
  from: number;
  delta: number;
  t: number;
  dur: number;
}

type Handler = (data: unknown) => void;

export interface SceneState {
  tod: number;
  todMode: TodMode;
  weather: WeatherPreset;
}

export class Scene {
  readonly view: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;

  /** Screen size in CSS px, device pixel ratio, and the size unit (1 on a 390×844 phone). */
  W = 0;
  H = 0;
  dpr = 1;
  u = 1;

  /** Simulation seconds since start, frame delta and count. */
  t = 0;
  dt = 1 / 60;
  frame = 0;

  /** Time of day 0..1 (0 = midnight). Random at every launch; then it runs on its own (players can't change it). */
  tod = Math.random();
  /** Real seconds for one full day. */
  dayLength = 480;
  /** 'auto' keeps the clock running. A preset value pins the time (tooling and tests only). */
  todMode: TodMode = 'auto';
  private todAnim: TodAnim | null = null;

  weather: WeatherState = { ...WEATHER_PRESETS.clear };
  weatherTarget: WeatherState = { ...WEATHER_PRESETS.clear };
  weatherPreset: WeatherPreset = 'clear';

  /** Lightning flash 0..1 (decays) and screen shake in CSS px (decays). */
  flash = 0;
  shake = 0;

  light!: LightState;
  layout!: Layout;

  readonly ripples = new Ripples();
  readonly particles = new Particles();
  /** Blackboard for cross-module state (e.g. shared.bobber = {x, y, state}). */
  readonly shared: Record<string, unknown> = {};

  readonly query: URLSearchParams;
  readonly seed: number;
  readonly reducedMotion: boolean;
  paused = false;
  /** Set while a sheet covers most of the screen: the world draws at half rate to leave room for the UI. */
  dimmed = false;
  /** Battery saver: the most frames per second to draw (0 = as many as the screen shows). */
  fpsCap = 0;
  private lastDraw = 0;
  /** Set while another screen (the aquarium) covers the lake: the world keeps simulating (fishing
   *  goes on) but isn't drawn. */
  offstage = false;
  private skipped = 0;
  private acc = 0;

  private layers: Layer[] = [];
  private only: string[] | null = null;
  private broken = new Set<string>();
  private handlers = new Map<string, Set<Handler>>();
  private colCache = new Map<string, string>();
  private rawCache = new Map<string, string>();
  private lastKey = -1;
  private lastNow = 0;
  private perfOn = false;
  private perfAcc = new Map<string, number>();
  private started = false;

  constructor(view: HTMLCanvasElement, query = new URLSearchParams()) {
    this.view = view;
    this.ctx = ctx2d(view);
    this.query = query;
    this.seed = Number(query.get('seed') ?? 1) || 1;
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.paused = query.get('paused') === '1';
    const only = query.get('only');
    this.only = only ? only.split(',').map((x) => x.trim()).filter(Boolean) : null;

    const tod = TEST_SHORTCUTS ? query.get('tod') : null;
    if (tod !== null && !Number.isNaN(Number(tod))) this.tod = wrap(Number(tod), 1);
    if (TEST_SHORTCUTS && query.get('freeze') === '1') this.todMode = 'day';
    const dl = TEST_SHORTCUTS ? Number(query.get('day') ?? 0) : 0;
    if (dl > 0) this.dayLength = dl;
    const w = (TEST_SHORTCUTS ? query.get('weather') : null) as WeatherPreset | null;
    if (w && w in WEATHER_PRESETS) this.setWeather(w, true);

    this.measure();
    this.refreshLight();

    // Built-in shared effect layers.
    this.layers.push(
      { id: 'engine.ripples', z: 232, draw: (s, c) => s.ripples.draw(s, c) },
      { id: 'engine.particles.back', z: 262, draw: (s, c) => s.particles.draw(s, c, false) },
      { id: 'engine.particles.front', z: 372, draw: (s, c) => s.particles.draw(s, c, true) },
    );

    addEventListener('resize', () => this.measure());
    window.visualViewport?.addEventListener('resize', () => this.measure());
  }

  // ------------------------------------------------------------ layers

  add(layers: Layer[]): void {
    for (const l of layers) {
      if (this.layers.some((x) => x.id === l.id)) throw new Error(`duplicate layer id ${l.id}`);
      this.layers.push(l);
      this.safe(l, 'init', () => l.init?.(this));
      this.safe(l, 'resize', () => l.resize?.(this));
    }
    this.layers.sort((a, b) => a.z - b.z);
  }

  /** Layer ids in draw order (debugging). */
  layerIds(): string[] {
    return this.layers.map((l) => `${l.z}:${l.id}`);
  }

  private safe(l: Layer, phase: string, fn: () => void): void {
    if (this.broken.has(l.id)) return;
    try {
      fn();
    } catch (err) {
      this.broken.add(l.id);
      console.error(`[layer ${l.id}] ${phase} threw — layer disabled`, err);
    }
  }

  private visible(l: Layer): boolean {
    if (!this.only || l.id.startsWith('engine.')) return true;
    return this.only.some((p) => l.id.startsWith(p));
  }

  // ------------------------------------------------------------ color

  /** Daytime color → graded CSS for the current light. depth 0 = near, 1 = far haze. */
  col(c: ColorLike, depth = 0): string {
    const dq = depth > 0 ? Math.round(depth * 20) : 0;
    const k = (typeof c === 'string' ? c : `${c[0] | 0},${c[1] | 0},${c[2] | 0}`) + '|' + dq;
    let v = this.colCache.get(k);
    if (v === undefined) {
      if (this.colCache.size > 6000) this.colCache.clear();
      v = css(gradeRGB(this.light, rgb(c), dq / 20));
      this.colCache.set(k, v);
    }
    return v;
  }

  /** Graded color with alpha, as an rgba() string. */
  colA(c: ColorLike, alpha: number, depth = 0): string {
    return css(gradeRGB(this.light, rgb(c), depth), alpha);
  }

  /** Graded color as numbers. */
  grade(c: ColorLike, depth = 0): RGB {
    return gradeRGB(this.light, rgb(c), depth);
  }

  /** Ungraded CSS — for things that emit light (lamps, stars, fireflies, sparkles). */
  raw(c: ColorLike, alpha = 1): string {
    if (typeof c !== 'string' || alpha < 1) return css(rgb(c), alpha);
    let v = this.rawCache.get(c);
    if (v === undefined) {
      v = css(rgb(c));
      this.rawCache.set(c, v);
    }
    return v;
  }

  // ------------------------------------------------------------ helpers

  /** Seeded RNG, stable per name + ?seed. */
  rng(name: string): Rng {
    return makeRng((hashString(name) ^ Math.imul(this.seed, 2654435761)) >>> 0);
  }

  /** Current wind at column x (≈0..1.5, always toward +x). Includes slow gusts. */
  windAt(x: number): number {
    const w = this.weather;
    const base = w.wind * (0.7 + 0.6 * noise1(this.t * 0.4 + x * 0.004, 77));
    const gust = w.storm * 0.6 * Math.max(0, noise1(this.t * 1.3 + x * 0.006, 91) - 0.4);
    return base + gust;
  }

  /** Water perspective factor at row y: ≈0.35 at the horizon, 1 at the bottom edge. */
  persp(y: number): number {
    const hz = this.layout.horizon;
    return clamp(0.35 + 0.65 * ((y - hz) / (this.H - hz)), 0.3, 1.15);
  }

  on(name: string, fn: Handler): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit(name: string, data?: unknown): void {
    this.handlers.get(name)?.forEach((fn) => fn(data));
  }

  // ------------------------------------------------------------ shared effects

  ripple(x: number, y: number, o: RippleOpts = {}): void {
    this.ripples.add(x, y, o, this.u);
  }

  particle(o: ParticleOpts): void {
    this.particles.add(o);
  }

  /** Water splash: droplets that fall back and make tiny rings, plus a main ripple. */
  splash(x: number, y: number, o: { count?: number; power?: number; color?: ColorLike; ripple?: number } = {}): void {
    const r = this.rng(`splash${this.frame}|${x | 0}`);
    const u = this.u;
    const k = this.persp(y);
    this.ripples.add(x, y, { maxR: o.ripple ?? 26 * u, life: 1.5 }, u);
    const n = o.count ?? 9;
    const pw = (o.power ?? 120) * u * k;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: x + r.range(-3, 3) * u * k,
        y: y - u,
        vx: r.range(-0.45, 0.45) * pw,
        vy: -r.range(0.5, 1) * pw,
        g: 700 * u * k,
        life: 2,
        size: r.range(1.2, 2.6) * u * k,
        color: r.chance(0.6) ? C.water.ripple : C.white,
        floorY: y + r.range(-2, 4) * u * k,
        onFloor: 'ripple',
        front: false,
      });
    }
  }

  /** Twinkling sparkles (emissive). */
  sparkle(x: number, y: number, o: { count?: number; color?: ColorLike; spread?: number; front?: boolean; life?: number } = {}): void {
    const r = this.rng(`spark${this.frame}|${x | 0}|${y | 0}`);
    const u = this.u;
    const n = o.count ?? 6;
    const sp = (o.spread ?? 18) * u;
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: x + r.range(-sp, sp),
        y: y + r.range(-sp, sp) * 0.7,
        vx: r.range(-14, 14) * u,
        vy: r.range(-34, -8) * u,
        drag: 1.6,
        life: o.life ?? r.range(0.6, 1.2),
        color: o.color ?? C.light.sparkle,
        shape: 'star',
        size: r.range(1.4, 2.6) * u,
        emissive: true,
        front: o.front ?? true,
      });
    }
  }

  /** Lightning flash + rumble. The weather module calls this; it respects reduced motion. */
  lightning(strength = 1): void {
    const k = this.reducedMotion ? 0.3 : 1;
    this.flash = Math.max(this.flash, clamp(strength, 0, 1) * k);
    if (!this.reducedMotion) this.shake = Math.max(this.shake, 3 * strength * this.u);
    this.emit('lightning', strength);
  }

  // ------------------------------------------------------------ time & weather control

  setTodMode(mode: TodMode): void {
    this.todMode = mode;
    if (mode === 'auto') return;
    // Glide to the new time over a few seconds rather than jumping.
    const target = mode === 'clock' ? realTod() : TOD_PRESETS[mode];
    const delta = wrap(target - this.tod, 1);
    if (delta < 0.002 || delta > 0.998) return;
    this.todAnim = { from: this.tod, delta, t: 0, dur: clamp(delta * 10, 1.4, 3.6) };
  }

  setWeather(preset: WeatherPreset, instant = false): void {
    this.weatherPreset = preset;
    this.weatherTarget = { ...WEATHER_PRESETS[preset] };
    if (instant) this.weather = { ...this.weatherTarget };
    this.emit('weather', preset);
  }

  getState(): SceneState {
    return { tod: this.tod, todMode: this.todMode, weather: this.weatherPreset };
  }

  setState(st: Partial<SceneState>): void {
    if (typeof st.tod === 'number') this.tod = wrap(st.tod, 1);
    if (st.todMode) this.todMode = st.todMode;
    if (st.weather && st.weather in WEATHER_PRESETS) this.setWeather(st.weather, true);
    this.refreshLight();
  }

  // ------------------------------------------------------------ sizing

  private measure(): void {
    // Capped at 2× by default: sharp on phones and smooth on mid-range Android devices. ?dpr=3 to override.
    const maxDpr = Number(this.query.get('dpr') ?? 0) || 2;
    const dpr = clamp(window.devicePixelRatio || 1, 1, maxDpr);
    const W = Math.max(1, this.view.clientWidth || window.innerWidth);
    const H = Math.max(1, this.view.clientHeight || window.innerHeight);
    const dw = Math.round(W * dpr);
    const dh = Math.round(H * dpr);
    if (this.view.width !== dw || this.view.height !== dh) {
      this.view.width = dw;
      this.view.height = dh;
      this.ctx = ctx2d(this.view);
    }
    const changed = W !== this.W || H !== this.H || dpr !== this.dpr;
    this.dpr = dpr;
    if (!changed) return;
    this.W = W;
    this.H = H;
    this.layout = computeLayout(W, H);
    this.u = this.layout.u;
    this.refreshLight();
    for (const l of this.layers) this.safe(l, 'resize', () => l.resize?.(this));
  }

  // ------------------------------------------------------------ loop

  private refreshLight(): void {
    this.light = computeLight(this.tod, this.weather, this.flash, this.layout.sunArc);
    if (this.light.key !== this.lastKey) {
      this.lastKey = this.light.key;
      this.colCache.clear();
    }
  }

  step(dt: number): void {
    this.dt = dt;
    this.t += dt;
    this.frame++;

    if (this.todAnim) {
      const a = this.todAnim;
      a.t += dt;
      const p = Math.min(1, a.t / a.dur);
      this.tod = wrap(a.from + a.delta * easeInOut(p), 1);
      if (p >= 1) this.todAnim = null;
    } else if (this.todMode === 'auto') {
      this.tod = wrap(this.tod + dt / this.dayLength, 1);
    } else if (this.todMode === 'clock') {
      this.tod = realTod();
    }

    const k = 1 - Math.exp(-dt * 0.55);
    const w = this.weather;
    const g = this.weatherTarget;
    w.cloud += (g.cloud - w.cloud) * k;
    w.rain += (g.rain - w.rain) * k;
    w.storm += (g.storm - w.storm) * k;
    w.fog += (g.fog - w.fog) * k;
    w.wind += (g.wind - w.wind) * k;

    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 8 * this.u);
    this.refreshLight();

    this.ripples.update(dt);
    this.particles.update(this, dt);
    for (const l of this.layers) if (l.update) this.safe(l, 'update', () => l.update!(this, dt));
  }

  render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = css(this.light.skyBot);
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.shake > 0.05) {
      ctx.translate(Math.sin(this.t * 91) * this.shake, Math.cos(this.t * 73) * this.shake);
    }
    for (const l of this.layers) {
      if (!l.draw || !this.visible(l) || this.broken.has(l.id)) continue;
      const t0 = this.perfOn ? performance.now() : 0;
      ctx.save();
      this.safe(l, 'draw', () => l.draw!(this, ctx));
      ctx.restore();
      if (this.perfOn) this.perfAcc.set(l.id, (this.perfAcc.get(l.id) ?? 0) + performance.now() - t0);
    }
  }

  private tick = (now: number): void => {
    const dt = this.lastNow ? clamp((now - this.lastNow) / 1000, 0, 0.05) : 1 / 60;
    this.lastNow = now;
    if (this.fpsCap > 0 && now - this.lastDraw < 1000 / this.fpsCap - 3) {
      this.acc += dt;
      requestAnimationFrame(this.tick);
      return;
    }
    this.lastDraw = now;
    if (this.offstage) {
      if (!this.paused) this.step(Math.min(0.1, dt + this.acc));
      this.acc = 0;
      requestAnimationFrame(this.tick);
      return;
    }
    if (this.dimmed && ++this.skipped % 2 === 1) {
      this.acc += dt;
      requestAnimationFrame(this.tick);
      return;
    }
    const step = Math.min(0.1, dt + this.acc);
    this.acc = 0;
    if (!this.paused) this.step(step);
    this.render();
    requestAnimationFrame(this.tick);
  };

  start(): void {
    if (this.started) return;
    this.started = true;
    const pre = TEST_SHORTCUTS ? Number(this.query.get('t') ?? 0) : 0;
    if (pre > 0) this.advance(pre, 30);
    else this.render();
    (window as unknown as { __ready?: boolean }).__ready = true;
    requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------ tooling (used by tools/shot.mjs)

  /** Step the simulation deterministically, then draw once. */
  advance(seconds: number, fps = 60): void {
    const n = Math.max(0, Math.round(seconds * fps));
    for (let i = 0; i < n; i++) this.step(1 / fps);
    this.render();
  }

  configure(c: { tod?: number; weather?: WeatherPreset; t?: number; todMode?: TodMode }): void {
    if (typeof c.tod === 'number') {
      this.tod = wrap(c.tod, 1);
      this.todAnim = null;
    }
    if (c.todMode) this.todMode = c.todMode;
    if (c.weather) this.setWeather(c.weather, true);
    this.refreshLight();
    if (c.t) this.advance(c.t);
    else this.render();
  }

  /** PNG data URL of the canvas (optionally cropped, in CSS px), scaled by `zoom`. */
  snapshot(zoom = 1, crop?: [number, number, number, number]): string {
    const [cx, cy, cw, ch] = crop ?? [0, 0, this.W, this.H];
    const d = this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * d * zoom));
    c.height = Math.max(1, Math.round(ch * d * zoom));
    const x = ctx2d(c);
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    x.drawImage(this.view, cx * d, cy * d, cw * d, ch * d, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  /** Average ms per layer over n simulated frames. */
  benchmark(n = 240): { total: number; layers: Array<{ id: string; ms: number }> } {
    this.perfOn = true;
    this.perfAcc.clear();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      this.step(1 / 60);
      this.render();
    }
    const total = (performance.now() - t0) / n;
    this.perfOn = false;
    const layers = [...this.perfAcc.entries()].map(([id, ms]) => ({ id, ms: ms / n })).sort((a, b) => b.ms - a.ms);
    return { total, layers };
  }
}
