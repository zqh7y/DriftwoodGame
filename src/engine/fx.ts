// Shared effects: water ripples and particles. Any layer can spawn them; the engine updates and
// draws them, so every splash and sparkle in the scene looks the same.

import { mix, rgb, type ColorLike, type RGB } from './color';
import { sparkle } from './draw';
import { clamp } from './math';
import { C } from './palette';
import type { Scene } from './scene';

// ---------------------------------------------------------------- ripples

export interface Ripple {
  x: number;
  y: number;
  age: number;
  life: number;
  maxR: number;
  strength: number;
}

export interface RippleOpts {
  /** Final horizontal radius in CSS px at the foreground (default 22·u). Shrinks toward the horizon. */
  maxR?: number;
  /** Seconds (default 1.6). */
  life?: number;
  /** 0..1 opacity (default 1). */
  strength?: number;
}

export class Ripples {
  readonly list: Ripple[] = [];

  add(x: number, y: number, o: RippleOpts = {}, u = 1): void {
    if (this.list.length > 240) this.list.shift();
    this.list.push({ x, y, age: 0, life: o.life ?? 1.6, maxR: o.maxR ?? 22 * u, strength: o.strength ?? 1 });
  }

  update(dt: number): void {
    let n = 0;
    for (const r of this.list) {
      r.age += dt;
      if (r.age < r.life) this.list[n++] = r;
    }
    this.list.length = n;
  }

  draw(s: Scene, ctx: CanvasRenderingContext2D): void {
    if (!this.list.length) return;
    const col = s.col(C.water.ripple);
    const hz = s.layout.horizon;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    for (const r of this.list) {
      if (r.y < hz) continue;
      const p = r.age / r.life;
      const ease = 1 - (1 - p) * (1 - p);
      const persp = s.persp(r.y);
      const rad = Math.max(0.5, r.maxR * ease * persp);
      const a = (1 - p) * (1 - p * 0.4) * r.strength;
      ctx.globalAlpha = clamp(a, 0, 1) * 0.9;
      ctx.lineWidth = Math.max(0.8, 2.2 * s.u * persp * (1 - p * 0.5));
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (r.maxR > 12 * s.u && p < 0.7) {
        ctx.globalAlpha = clamp(a * 0.7, 0, 1);
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, rad * 0.55, rad * 0.55 * 0.3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- particles

export type ParticleShape = 'dot' | 'streak' | 'star' | 'leaf';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity px/s² (positive = down). */
  g: number;
  /** Air drag per second (0 = none). */
  drag: number;
  life: number;
  age: number;
  c: RGB;
  c2?: RGB;
  /** Radius (dot/star/leaf) or width (streak) in CSS px. */
  size: number;
  emissive: boolean;
  /** Draw in front of the dock and fisher (true) or on the water plane (false). */
  front: boolean;
  shape: ParticleShape;
  floorY?: number;
  onFloor?: 'ripple' | 'die';
  windK: number;
  spin: number;
  rot: number;
}

export interface ParticleOpts {
  x: number;
  y: number;
  color: ColorLike;
  vx?: number;
  vy?: number;
  g?: number;
  drag?: number;
  life?: number;
  color2?: ColorLike;
  size?: number;
  emissive?: boolean;
  front?: boolean;
  shape?: ParticleShape;
  /** When falling past this y: 'ripple' makes a tiny ripple and dies, 'die' just dies. */
  floorY?: number;
  onFloor?: 'ripple' | 'die';
  /** 0..1 how much wind pushes it. */
  windK?: number;
  /** Rotation speed (leaf). */
  spin?: number;
}

export class Particles {
  readonly list: Particle[] = [];
  max = 1400;

  add(o: ParticleOpts): void {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: o.x,
      y: o.y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      g: o.g ?? 0,
      drag: o.drag ?? 0,
      life: o.life ?? 1,
      age: 0,
      c: rgb(o.color),
      c2: o.color2 !== undefined ? rgb(o.color2) : undefined,
      size: o.size ?? 1.5,
      emissive: o.emissive ?? false,
      front: o.front ?? true,
      shape: o.shape ?? 'dot',
      floorY: o.floorY,
      onFloor: o.onFloor,
      windK: o.windK ?? 0,
      spin: o.spin ?? 0,
      rot: 0,
    });
  }

  update(s: Scene, dt: number): void {
    let n = 0;
    for (const p of this.list) {
      p.age += dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.g * dt;
      p.x += (p.vx + (p.windK ? s.windAt(p.x) * 60 * s.u * p.windK : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      let alive = p.age < p.life;
      if (alive && p.floorY !== undefined && p.vy > 0 && p.y >= p.floorY) {
        if (p.onFloor === 'ripple') s.ripples.add(p.x, p.floorY, { maxR: 6 * s.u + p.size * 2, life: 0.6, strength: 0.7 }, s.u);
        alive = false;
      }
      if (alive) this.list[n++] = p;
    }
    this.list.length = n;
  }

  draw(s: Scene, ctx: CanvasRenderingContext2D, front: boolean): void {
    for (const p of this.list) {
      if (p.front !== front) continue;
      const t = p.age / p.life;
      const c = p.c2 ? mix(p.c, p.c2, t) : p.c;
      const fill = p.emissive ? s.raw(c) : s.col(c);
      ctx.globalAlpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1;
      if (p.emissive) ctx.globalCompositeOperation = 'lighter';
      switch (p.shape) {
        case 'dot':
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'streak': {
          const k = 0.03;
          ctx.strokeStyle = fill;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * k, p.y - p.vy * k);
          ctx.stroke();
          break;
        }
        case 'star': {
          const tw = 0.65 + 0.35 * Math.sin(p.age * 16 + p.x);
          sparkle(ctx, p.x, p.y, p.size * 2.4 * tw, fill);
          break;
        }
        case 'leaf':
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size * 1.6, p.size * 0.7, p.rot, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
}
