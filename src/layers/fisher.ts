// Fisher: an orange tabby cat in a yellow bucket hat and a teal scarf, fishing off the far end of the pier.
// Cat life: the tail swishes (and shoots up on a catch), ears twitch through the hat, the scarf tails
// flutter in the wind, whiskers on the visible cheek.
//
// Layers: bobber on the water (z 255), cat + rod + line (z 336), bucket (z 341), catch arc and
// the "!" bubble (z 346). Automatic loop: cast -> wait (nibbles) -> bite -> reel -> catch -> recast.
// Publishes s.shared.bobber = { x, y, state } and emits 'fisher:cast' | 'fisher:bite' | 'fisher:catch'.

import {
  Baked,
  C,
  TAU,
  circle,
  clamp,
  curveThrough,
  easeInOut,
  easeOutBack,
  easeOutQuad,
  ellipse,
  glow,
  lerp,
  mix,
  roundRect,
  type LayerModule,
  type Pt,
  type Scene,
} from '../engine';
import type { FishLook, FishingApi, Hooked } from '../game/game';
import { audio } from '../audio/audio';

type Ctx = CanvasRenderingContext2D;
type Phase = 'cast' | 'wait' | 'bite' | 'reel' | 'catch';
/** Looks used when no game is attached (e.g. art screenshots of the fisher alone). */
const FALLBACK: FishLook[] = [
  { ramp: C.blue, size: 1, sparkle: false, boot: false },
  { ramp: C.orange, size: 1, sparkle: false, boot: false },
  { ramp: C.pink, size: 1, sparkle: false, boot: false },
  { ramp: C.yellow, size: 1.1, sparkle: true, boot: false },
  { ramp: C.brown, size: 1, sparkle: false, boot: true },
];

// Cast timeline (seconds into the cast phase).
const WIND = 0.5; // rod swings back
const FWD = 0.24; // rod snaps forward
const REL = 0.62; // bobber leaves the tip
const FLY = 0.9; // bobber flight
const LAND = REL + FLY;
const ANG_BACK = -0.8;
const ANG_FWD = 0.3;
const BITE = 0.55;
const ARC = 1.05; // catch flight to the bucket
const NIB = 0.45; // one nibble dip
const RECAST = ARC + 1.25;

// Cat body outline, in u, origin at the bottom-centre (seen from behind, 3/4 toward upper right):
// wide haunches, narrower shoulders.
const BODY: Pt[] = [
  { x: -17, y: -2.5 },
  { x: -18, y: -11.5 },
  { x: -13.5, y: -20.5 },
  { x: -6, y: -25.5 },
  { x: 6.5, y: -25.5 },
  { x: 13.5, y: -20 },
  { x: 18, y: -11 },
  { x: 16.5, y: -2 },
  { x: 7, y: 0.8 },
  { x: -7, y: 0.8 },
];

/** Sample a smooth Catmull-Rom curve through points (for the tail). */
function sampleCurve(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  const seg = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * seg;
    const k = Math.min(seg - 1, Math.floor(f));
    const t = f - k;
    const p0 = pts[Math.max(0, k - 1)];
    const p1 = pts[k];
    const p2 = pts[k + 1];
    const p3 = pts[Math.min(pts.length - 1, k + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    const cr = (a: number, b: number, c: number, d: number): number =>
      0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) });
  }
  return out;
}

interface Fly {
  x: number;
  y: number;
  rot: number;
  flip: boolean;
  look: FishLook;
  clipY: number;
}

interface Pose {
  frame: number;
  W: number;
  H: number;
  /** Cat origin (bottom-centre, including the hop). */
  O: Pt;
  /** Rod butt, control point, tip. */
  B: Pt;
  K: Pt;
  T: Pt;
  bob: Pt;
  br: number;
  sub: number;
  tilt: number;
  onWater: boolean;
  lineC: Pt;
  headTilt: number;
  breathe: number;
  lean: number;
  bubble: number;
  bubbleA: number;
  fly: Fly | null;
}

const qpt = (a: Pt, c: Pt, b: Pt, t: number): Pt => {
  const m = 1 - t;
  return { x: m * m * a.x + 2 * m * t * c.x + t * t * b.x, y: m * m * a.y + 2 * m * t * c.y + t * t * b.y };
};

/** Stereo position for a world x (gentle: the dock is mostly centre stage). */
const sfxPan = (sc: Scene, x: number): number => clamp((x / Math.max(1, sc.W)) * 2 - 1, -1, 1) * 0.5;

const fisher: LayerModule = (s) => {
  const rng = s.rng('fisher');
  let phase: Phase = 'wait';
  let pt = 0;
  let waitDur = 7.5;
  let nibbles: number[] = [3.2, 5.4];
  let reelDur = 2;
  let look: FishLook = FALLBACK[1];
  let hooked: Hooked | null = null;
  let landU: Pt = { x: 0, y: 0 }; // landing offset (u) from layout.bobber
  let rel: Pt = { x: 0, y: 0 }; // release point (px)
  let released = false;
  let landedCatch = false;
  let ringT = 0.6;
  let wakeT = 0;
  let dripT = 0;
  let sparkT = 0;
  let twitchAt = 2.5;
  let twitchEar = 1;
  const tails: FishLook[] = [FALLBACK[0]];
  const shared = { x: 0, y: 0, state: 'wait' };
  s.shared.bobber = shared;
  let pose: Pose | null = null;

  const api = (): FishingApi | undefined => s.shared.fishing as FishingApi | undefined;

  const pickLook = (): FishLook => {
    const r = rng.next();
    if (r < 0.07) return FALLBACK[3];
    if (r < 0.17) return FALLBACK[4];
    return rng.pick(FALLBACK.slice(0, 3));
  };

  const startWait = (): void => {
    phase = 'wait';
    pt = 0;
    waitDur = rng.range(6, 12);
    const n = rng.int(1, 3);
    nibbles = [];
    for (let i = 0; i < n; i++) nibbles.push(rng.range(1.4, waitDur - 1.2));
    nibbles.sort((a, b) => a - b);
    ringT = 0.4;
  };

  const startCast = (): void => {
    phase = 'cast';
    pt = 0;
    released = false;
    landU = { x: rng.range(-12, 12), y: rng.range(-5, 6) };
  };

  // ------------------------------------------------------------ pose (pure function of state + time)

  function computePose(): Pose {
    const L = s.layout;
    const u = s.u;
    const t = s.t;
    const wx = s.weather;
    const breathe = Math.sin(t * 1.9);
    let hop = 0;
    let headTilt = 0.05 * Math.sin(t * 0.6) + 0.025 * Math.sin(t * 1.37 + 1);
    let lean = 0;
    let ang = 0;
    let bend = 0.12;
    let bubble = 0;
    let bubbleA = 0;
    let mode: 'dangle' | 'air' | 'water' = 'water';
    let taut = false;
    let dip = 0;
    let sub = 0;
    let fly: Fly | null = null;
    const Lp = { x: L.bobber.x + landU.x * u, y: L.bobber.y + landU.y * u };
    const Pend = { x: L.fisher.x + 64 * u, y: L.fisher.y - 30 * u };

    switch (phase) {
      case 'cast': {
        if (pt < WIND) ang = ANG_BACK * easeInOut(pt / WIND);
        else if (pt < WIND + FWD) ang = lerp(ANG_BACK, ANG_FWD, easeOutQuad((pt - WIND) / FWD));
        else ang = ANG_FWD * (1 - easeInOut(clamp((pt - WIND - FWD) / 0.8, 0, 1)));
        bend = pt > WIND && pt < WIND + FWD + 0.12 ? -0.22 : 0.05;
        headTilt -= 0.08 * Math.sin(Math.PI * clamp(pt / (WIND + FWD), 0, 1));
        lean = ang * 0.08;
        mode = pt < REL ? 'dangle' : 'air';
        break;
      }
      case 'wait': {
        for (const n of nibbles) {
          const q = (pt - n) / NIB;
          if (q > 0 && q < 1) dip = Math.max(dip, Math.sin(Math.PI * q));
        }
        bend = 0.12 + 0.3 * dip;
        ang = 0.03 * dip;
        break;
      }
      case 'bite': {
        sub = 0.8 * easeOutQuad(clamp(pt / 0.15, 0, 1));
        bend = 0.12 + 0.6 * easeOutQuad(clamp(pt / 0.25, 0, 1));
        ang = 0.06 * bend;
        taut = pt > 0.12;
        hop = 2.5 * Math.sin(Math.PI * clamp(pt / 0.3, 0, 1));
        headTilt -= 0.1 * Math.sin(Math.PI * clamp(pt / 0.4, 0, 1));
        bubble = easeOutBack(clamp(pt / 0.22, 0, 1));
        bubbleA = 1;
        break;
      }
      case 'reel': {
        sub = 0.5;
        bend = 0.85 + 0.1 * Math.sin(t * 8);
        ang = 0.1 + (s.reducedMotion ? 0 : 0.03 * Math.sin(t * 17));
        lean = -0.07;
        taut = true;
        headTilt -= 0.05;
        bubble = 1;
        bubbleA = 1 - clamp((pt - 0.5) / 0.25, 0, 1);
        break;
      }
      case 'catch': {
        ang = -0.45 * Math.sin(Math.PI * clamp(pt / 0.6, 0, 1));
        bend = 0.85 * (1 - clamp(pt / 0.2, 0, 1));
        mode = 'dangle';
        if (pt < ARC) {
          const q = pt / ARC;
          const boot = look.boot;
          const to = { x: L.bucket.x, y: L.bucket.y - 18 * u };
          const hgt = (boot ? 62 : 74) * u;
          const x = lerp(Pend.x, to.x, q);
          const y = lerp(Pend.y, to.y, q) - hgt * 4 * q * (1 - q);
          const dx = to.x - Pend.x;
          const dy = to.y - Pend.y - hgt * 4 * (1 - 2 * q);
          const flip = dx < 0;
          let rot = Math.atan2(dy, flip ? -dx : dx) + 0.22 * Math.sin(pt * 20);
          if (boot) rot = q * TAU * 1.2;
          fly = { x, y, rot, flip, look, clipY: q < 0.7 ? Infinity : L.bucket.y - 19.3 * u };
        } else if (!look.boot) {
          const h = clamp((pt - ARC) / 0.8, 0, 1);
          hop = Math.abs(Math.sin(h * TAU)) * 5 * (1 - 0.5 * h) * (s.reducedMotion ? 0.4 : 1);
          headTilt += 0.12 * Math.sin(h * TAU * 2) * (1 - h);
        } else {
          headTilt += 0.1 * Math.sin(clamp((pt - ARC) / 0.9, 0, 1) * Math.PI);
        }
        break;
      }
    }
    ang += 0.02 * s.windAt(L.rodBase.x) * Math.sin(t * 1.3);

    // Rod: rotates around the grip; the tip bends toward the line under tension.
    const O = { x: L.fisher.x, y: L.fisher.y - hop * u };
    const Dx = L.rodTip.x - L.rodBase.x;
    const Dy = L.rodTip.y - L.rodBase.y;
    const len = Math.hypot(Dx, Dy);
    const th = Math.atan2(Dy, Dx) + ang;
    const back = Math.max(0, -ang) / 0.8;
    const G = {
      x: L.rodBase.x - 4 * u * back - (phase === 'reel' ? 3 * u : 0),
      y: L.rodBase.y - hop * u - 3 * u * back + breathe * 0.4 * u,
    };
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    const B = { x: G.x - cx * len * 0.3, y: G.y - cy * len * 0.3 };
    const K = { x: G.x + cx * len * 0.42, y: G.y + cy * len * 0.42 };
    const tb = th + bend * 0.4;
    const tl = len * (1 - 0.04 * Math.abs(bend));
    const T = { x: G.x + Math.cos(tb) * tl, y: G.y + Math.sin(tb) * tl };

    // Bobber.
    let bx = Lp.x;
    let by = Lp.y;
    let tilt = 0;
    const br = 13 * u * s.persp(phase === 'reel' ? lerp(Lp.y, Pend.y, easeInOut(clamp(pt / reelDur, 0, 1))) : Lp.y);
    if (mode === 'dangle') {
      const sw = Math.sin(t * 2.4) * 2 * u - ang * 9 * u;
      bx = T.x + sw;
      by = T.y + 13 * u;
      tilt = (-sw / (13 * u)) * 0.8;
    } else if (mode === 'air') {
      const q = clamp((pt - REL) / FLY, 0, 1);
      bx = lerp(rel.x, Lp.x, q);
      by = lerp(rel.y, Lp.y, q) - 34 * u * 4 * q * (1 - q);
      tilt = (1 - q) * 1.2;
    } else if (phase === 'reel') {
      const q = clamp(pt / reelDur, 0, 1);
      const e = easeInOut(q);
      bx = lerp(Lp.x, Pend.x, e);
      by = lerp(Lp.y, Pend.y, e);
      const zig = Math.sin(pt * 7.5) * 3 * u * s.persp(by) * (1 - q * 0.5);
      bx += zig * 0.6;
      by += zig * 0.25;
      tilt = 0.35 + 0.15 * Math.sin(pt * 9);
    } else {
      const k = s.persp(Lp.y);
      const amp = 1 + wx.storm * 1.6 + wx.rain * 0.4;
      bx = Lp.x + Math.sin(t * 0.8) * 0.6 * u * k * amp;
      by = Lp.y + (Math.sin(t * 2.3) * 0.9 + Math.sin(t * 1.1 + 1) * 0.4) * u * k * amp + dip * 3 * u * k;
      sub = Math.max(sub, dip * 0.35);
      tilt = 0.12 * Math.sin(t * 1.9) * amp + dip * 0.2;
    }

    // Line: sags while waiting, straight under tension.
    const top = { x: bx + Math.sin(tilt) * br, y: by - Math.cos(tilt) * br + sub * br * 1.3 };
    const mid = { x: (T.x + top.x) / 2, y: (T.y + top.y) / 2 };
    let lineC: Pt;
    if (taut || mode === 'dangle') lineC = mid;
    else if (mode === 'air') lineC = { x: mid.x, y: mid.y + 8 * u };
    else {
      const w = s.windAt(T.x) * 4 * u;
      lineC = { x: T.x + (top.x - T.x) * 0.3 + w, y: T.y + (top.y - T.y) * 0.85 + 2 * u };
    }

    return {
      frame: s.frame,
      W: s.W,
      H: s.H,
      O,
      B,
      K,
      T,
      bob: { x: bx, y: by },
      br,
      sub,
      tilt,
      onWater: mode === 'water',
      lineC,
      headTilt,
      breathe,
      lean,
      bubble,
      bubbleA,
      fly,
    };
  }

  const getPose = (): Pose => {
    if (!pose || pose.frame !== s.frame || pose.W !== s.W || pose.H !== s.H) pose = computePose();
    return pose;
  };

  // ------------------------------------------------------------ simulation

  function update(sc: Scene, dt: number): void {
    const u = sc.u;
    const prev = phase === 'cast' && !released ? computePose() : null;
    const game = api();
    // Cast, reel and catch speed up when the catch time is short, so a cycle always fits.
    pt += phase === 'wait' ? dt : dt / (game ? game.animScale() : 1);

    if (phase === 'cast') {
      if (!released && pt >= REL && prev) {
        released = true;
        rel = { x: prev.bob.x, y: prev.bob.y };
        audio.play('cast', { pan: sfxPan(sc, prev.bob.x), vol: 0.8 });
      }
      if (pt >= LAND) {
        startWait();
        const P = computePose();
        sc.splash(P.bob.x, P.bob.y, { count: 7, power: 80, ripple: 20 * u });
        sc.emit('fisher:cast', { x: P.bob.x, y: P.bob.y });
        audio.play('plop', { pan: sfxPan(sc, P.bob.x), vol: 0.8, pitch: rng.range(0.92, 1.08) });
      }
    } else if (phase === 'wait') {
      const P = computePose();
      ringT -= dt;
      if (ringT <= 0) {
        ringT = 1.5 + rng.range(-0.2, 0.2);
        sc.ripple(P.bob.x, P.bob.y + P.br * 0.5, { maxR: 13 * u, life: 1.7, strength: 0.55 });
      }
      for (const n of nibbles) {
        if (pt - dt < n && pt >= n) sc.ripple(P.bob.x, P.bob.y + P.br * 0.5, { maxR: 9 * u, life: 1, strength: 0.7 });
      }
      const bite = game ? game.takeBite() : null;
      if (game ? bite : pt >= waitDur) {
        phase = 'bite';
        pt = 0;
        hooked = bite;
        look = bite ? bite.look : pickLook();
        sc.splash(P.bob.x, P.bob.y, { count: 10, power: 110, ripple: 24 * u });
        sc.emit('fisher:bite', { x: P.bob.x, y: P.bob.y });
        audio.play('bite', { pan: sfxPan(sc, P.bob.x) });
      }
    } else if (phase === 'bite') {
      if (pt >= BITE) {
        phase = 'reel';
        pt = 0;
        reelDur = rng.range(1.5, 2.5);
        wakeT = 0;
        audio.play('reel', { vol: 0.7 });
      }
    } else if (phase === 'reel') {
      const P = computePose();
      wakeT -= dt;
      if (wakeT <= 0) {
        wakeT = 0.22;
        sc.ripple(P.bob.x, P.bob.y + P.br * 0.4, { maxR: 10 * u, life: 1, strength: 0.6 });
      }
      if (pt >= reelDur) {
        phase = 'catch';
        pt = 0;
        landedCatch = false;
        dripT = 0;
        sc.splash(P.bob.x, P.bob.y, { count: 12, power: 140, ripple: 26 * u });
        audio.play('splash', { pan: sfxPan(sc, P.bob.x), vol: 0.85 });
      }
    } else if (phase === 'catch') {
      const P = computePose();
      const f = P.fly;
      if (f) {
        dripT -= dt;
        if (dripT <= 0) {
          dripT = 0.09;
          sc.particle({
            x: f.x,
            y: f.y,
            color: C.water.ripple,
            vx: rng.range(-20, 20) * u,
            vy: rng.range(-10, 25) * u,
            g: 600 * u,
            life: 0.55,
            size: 1.3 * u,
          });
        }
        if (f.look.sparkle) {
          sparkT -= dt;
          if (sparkT <= 0) {
            sparkT = 0.1;
            sc.sparkle(f.x, f.y, { count: 1, spread: 6 });
          }
        }
      }
      if (!landedCatch && pt >= ARC) {
        landedCatch = true;
        const L = sc.layout;
        {
          const rx = L.bucket.x;
          const ry = L.bucket.y - 19.5 * u;
          for (let i = 0; i < 6; i++) {
            sc.particle({
              x: rx + rng.range(-7, 7) * u,
              y: ry,
              color: rng.chance(0.6) ? C.water.ripple : C.white,
              vx: rng.range(-40, 40) * u,
              vy: -rng.range(60, 120) * u,
              g: 520 * u,
              life: 0.5,
              size: rng.range(1.2, 2) * u,
            });
          }
          if (game && hooked) game.landed(hooked);
          else if (!look.boot) {
            tails.push(look);
            if (tails.length > 3) tails.shift();
          }
          if (look.sparkle) sc.sparkle(rx, ry - 6 * u, { count: 12, spread: 16 });
          hooked = null;
        }
        sc.emit('fisher:catch', { look });
      }
      if (pt >= RECAST) startCast();
    }

    // Ear twitch scheduling.
    if (sc.t > twitchAt + 0.3) {
      twitchAt = sc.t + rng.range(3, 7);
      twitchEar = rng.chance(0.5) ? 0 : 1;
    }

    pose = computePose();
    shared.x = pose.bob.x;
    shared.y = pose.bob.y;
    let dipping = false;
    if (phase === 'wait') for (const n of nibbles) if (pt > n && pt < n + NIB) dipping = true;
    shared.state = dipping ? 'nibble' : phase;
  }

  // ------------------------------------------------------------ drawing

  function drawBobber(ctx: Ctx): void {
    const P = getPose();
    const u = s.u;
    const r = P.br;
    const { x, y } = P.bob;
    const out = s.col(C.outline);
    if (P.onWater || phase === 'reel' || phase === 'bite') {
      ellipse(ctx, x, y + r * 0.6, r * 1.6, r * 0.5, { fill: s.colA(C.water.deep, 0.35) });
    }
    ctx.save();
    ctx.translate(x, y);
    if (P.sub > 0) {
      ctx.beginPath();
      ctx.rect(-r * 4, -r * 6, r * 8, r * 6.55);
      ctx.clip();
    }
    ctx.translate(0, P.sub * r * 1.3);
    ctx.rotate(P.tilt);
    // stem
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.9);
    ctx.lineTo(0, -r * 1.35);
    ctx.strokeStyle = out;
    ctx.lineWidth = 1.6 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
    // white bottom, red top
    circle(ctx, 0, 0, r, { fill: s.col(C.bobber.white) });
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, TAU);
    ctx.quadraticCurveTo(0, r * 0.22, -r, 0);
    ctx.closePath();
    ctx.fillStyle = s.col(C.bobber.red);
    ctx.fill();
    ellipse(ctx, -r * 0.38, -r * 0.48, r * 0.3, r * 0.17, { fill: s.col(C.bobber.redHi) }, -0.5);
    circle(ctx, -r * 0.5, -r * 0.18, r * 0.09, { fill: s.col(C.white) });
    circle(ctx, 0, 0, r, { stroke: out, line: 1.5 * u });
    ctx.restore();
    if (P.onWater || P.sub > 0) {
      // waterline ring in front of the bobber
      ctx.beginPath();
      ctx.ellipse(x, y + r * 0.55, r * 1.3, r * 0.36, 0, 0.15, Math.PI - 0.15);
      ctx.strokeStyle = s.colA(C.water.ripple, 0.75);
      ctx.lineWidth = 1.1 * u;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  function strokeDouble(ctx: Ctx, w: number, fill: string, out: string, ow = 2.4): void {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = out;
    ctx.lineWidth = w + ow * 2;
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
  }

  function drawRodAndLine(ctx: Ctx, P: Pose): void {
    const u = s.u;
    const out = s.col(C.outline);
    // line first (it hangs from the tip in front of the water)
    ctx.beginPath();
    const top = { x: P.bob.x + Math.sin(P.tilt) * P.br * 1.3, y: P.bob.y - Math.cos(P.tilt) * P.br * 1.3 + P.sub * P.br * 1.3 };
    ctx.moveTo(P.T.x, P.T.y);
    ctx.quadraticCurveTo(P.lineC.x, P.lineC.y, top.x, top.y);
    ctx.strokeStyle = s.colA(C.fishingLine, 0.95);
    ctx.lineWidth = 1.2 * u;
    ctx.lineCap = 'round';
    ctx.stroke();
    // rod
    ctx.beginPath();
    ctx.moveTo(P.B.x, P.B.y);
    ctx.quadraticCurveTo(P.K.x, P.K.y, P.T.x, P.T.y);
    strokeDouble(ctx, 2.1 * u, s.col(C.wood.mid), out, 1.1 * u);
    // thicker handle section near the paws
    const h1 = qpt(P.B, P.K, P.T, 0.3);
    const hc = { x: lerp(P.B.x, P.K.x, 0.3), y: lerp(P.B.y, P.K.y, 0.3) };
    ctx.beginPath();
    ctx.moveTo(P.B.x, P.B.y);
    ctx.quadraticCurveTo(hc.x, hc.y, h1.x, h1.y);
    strokeDouble(ctx, 3.2 * u, s.col(C.wood.dark), out, 1.1 * u);
    // reel
    const r = qpt(P.B, P.K, P.T, 0.15);
    circle(ctx, r.x + 1.5 * u, r.y + 1.2 * u, 3.3 * u, { fill: s.col(C.metal.light), stroke: out, line: 1.5 * u });
    circle(ctx, r.x + 1.5 * u, r.y + 1.2 * u, 1.1 * u, { fill: s.col(C.metal.dark) });
    // tip ring
    circle(ctx, P.T.x, P.T.y, 1.1 * u, { fill: s.col(C.metal.hi), stroke: out, line: 0.8 * u });
  }

  // Static parts of the cat are cached (graded colours → keyed by the light), then drawn with the
  // breathing / tilt / hop transforms. Tail, ears, scarf tails, legs, arm and paws stay live.
  const bakedBody = new Baked();
  const bakedHead = new Baked();
  const BODY_AREA = { x: -24, y: -32, w: 48, h: 36 };
  const HEAD_AREA = { x: -20, y: -52, w: 48, h: 38 };

  const FUR = (): string => s.col(C.orange[2]);
  const FUR_D = (): string => s.col(C.orange[1]);
  const FUR_L = (): string => s.col(C.orange[3]);
  const STRIPE = (): string => s.col(mix(C.orange[1], C.orange[0], 0.45));
  const CREAM = (): string => s.col(mix(C.orange[3], C.white, 0.55));

  function paintBody(c: Ctx): void {
    const out = s.col(C.outline);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.beginPath();
    curveThrough(c, BODY, true);
    c.fillStyle = FUR();
    c.fill();
    c.save();
    c.clip();
    // Shading: darker haunches and right side, light on the upper-left back.
    ellipse(c, 2, 2.5, 24, 5, { fill: FUR_D() });
    ellipse(c, 19, -12, 7, 16, { fill: FUR_D() });
    ellipse(c, -7, -17, 6, 7.5, { fill: FUR_L() }, 0.3);
    // Tabby stripes across the back.
    c.strokeStyle = STRIPE();
    c.lineWidth = 2.3;
    c.beginPath();
    for (const [y, w] of [[-9, 11], [-15, 9.5], [-20.5, 7]] as const) {
      c.moveTo(-w, y + 1.5);
      c.quadraticCurveTo(-1, y - 2.2, w * 0.55, y + 0.6);
    }
    c.stroke();
    c.restore();
    c.beginPath();
    curveThrough(c, BODY, true);
    c.strokeStyle = out;
    c.lineWidth = 2.5;
    c.stroke();
    // Teal scarf around the neck, knotted on the right.
    c.beginPath();
    c.moveTo(-12, -19.2);
    c.quadraticCurveTo(1, -13.8, 13.4, -18.4);
    c.strokeStyle = out;
    c.lineWidth = 7.8;
    c.stroke();
    c.strokeStyle = s.col(C.teal[2]);
    c.lineWidth = 5;
    c.stroke();
    c.beginPath();
    c.moveTo(-10.4, -20.4);
    c.quadraticCurveTo(1, -15.6, 12.2, -19.6);
    c.strokeStyle = s.col(C.teal[3]);
    c.lineWidth = 1.3;
    c.stroke();
    circle(c, 13.6, -17.6, 3.4, { fill: s.col(C.teal[1]), stroke: out, line: 2 });
  }

  function paintHead(c: Ctx): void {
    const out = s.col(C.outline);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    // Cheek and whisker pad peeking out on the right.
    ellipse(c, 13.8, -29.8, 5.4, 4.3, { fill: CREAM(), stroke: out, line: 2.1 }, -0.12);
    // Head.
    const headPath = (): void => {
      c.beginPath();
      c.ellipse(0, -32.5, 14.6, 12.6, 0, 0, TAU);
    };
    headPath();
    c.fillStyle = FUR();
    c.fill();
    c.save();
    c.clip();
    ellipse(c, 2, -20.5, 17, 5.2, { fill: FUR_D() });
    ellipse(c, -6.5, -36, 5, 4, { fill: FUR_L() }, 0.3);
    // Tabby stripes on the back of the head, below the brim.
    c.strokeStyle = STRIPE();
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5, -38.5);
    c.quadraticCurveTo(-5.8, -34.5, -4.4, -31.5);
    c.moveTo(0.5, -38.8);
    c.lineTo(0.6, -33);
    c.moveTo(6, -38.4);
    c.quadraticCurveTo(6.8, -34.5, 5.6, -31.6);
    c.stroke();
    c.restore();
    headPath();
    c.strokeStyle = out;
    c.lineWidth = 2.5;
    c.stroke();
    // A happy closed eye at the edge of the face, nose and whiskers.
    c.beginPath();
    c.moveTo(9.2, -34.6);
    c.quadraticCurveTo(10.9, -33, 12.6, -34.4);
    c.strokeStyle = out;
    c.lineWidth = 1.5;
    c.stroke();
    ellipse(c, 18.6, -31.1, 1.6, 1.25, { fill: s.col(C.pink[1]) });
    c.beginPath();
    c.moveTo(16.4, -29.9);
    c.lineTo(24.6, -31.8);
    c.moveTo(16.6, -29);
    c.lineTo(25, -28.6);
    c.moveTo(16.2, -28.1);
    c.lineTo(23.6, -25.6);
    c.strokeStyle = out;
    c.lineWidth = 0.75;
    c.stroke();
    // Hat brim.
    ellipse(c, 0.5, -41, 16.6, 4.6, { fill: s.col(C.yellow[2]), stroke: out, line: 2.5 }, -0.06);
    c.beginPath();
    c.ellipse(0.5, -40.8, 13.6, 3.3, -0.06, 0.1, Math.PI - 0.1);
    c.strokeStyle = s.col(C.yellow[1]);
    c.lineWidth = 1.1;
    c.stroke();
    // Crown with a darker band.
    const crownPath = (): void => {
      c.beginPath();
      c.moveTo(-10.5, -42);
      c.lineTo(-8.6, -46);
      c.quadraticCurveTo(0.5, -50.5, 9.6, -46);
      c.lineTo(11.5, -42);
      c.quadraticCurveTo(0.5, -39.2, -10.5, -42);
      c.closePath();
    };
    crownPath();
    c.fillStyle = s.col(C.yellow[2]);
    c.fill();
    c.save();
    c.clip();
    c.beginPath();
    c.moveTo(-13, -44.4);
    c.quadraticCurveTo(0.5, -41.6, 14, -44.4);
    c.lineTo(14, -34);
    c.lineTo(-13, -34);
    c.closePath();
    c.fillStyle = s.col(C.yellow[1]);
    c.fill();
    c.restore();
    crownPath();
    c.strokeStyle = out;
    c.lineWidth = 2.5;
    c.stroke();
    ellipse(c, -4, -46.6, 3, 1.15, { fill: s.col(C.yellow[3]) }, -0.3);
  }

  /** Tail pose: idle swish, tense on a bite/reel, straight up and quivering after a catch. */
  function tailPoints(t: number): Pt[] {
    let lift = 0;
    let quiver = 0;
    if (phase === 'bite') lift = 0.55 * clamp(pt / 0.2, 0, 1);
    else if (phase === 'reel') lift = 0.45;
    else if (phase === 'catch') {
      const up = pt < ARC ? clamp(pt / 0.3, 0, 1) * 0.6 : 1 - clamp((pt - ARC - 0.9) / 0.4, 0, 1);
      lift = Math.max(0.35, up);
      quiver = pt > ARC && pt < ARC + 0.9 ? 1 : 0;
    }
    const sw = Math.sin(t * 1.5) * (1 - lift * 0.6) + (s.reducedMotion ? 0 : quiver * Math.sin(t * 30) * 0.25);
    const sw2 = Math.sin(t * 1.5 - 0.9) * (1 - lift * 0.5);
    return [
      { x: -12, y: -4.5 },
      { x: -24 + lift * 6, y: -1 - lift * 6 + sw * 1.2 },
      { x: -32 + lift * 12 + sw * 2.5, y: -9 - lift * 20 },
      { x: -31 + lift * 16 + sw2 * 5, y: -19 - lift * 22 },
      { x: -26 + lift * 18 + sw2 * 7, y: -23.5 - lift * 21 },
    ];
  }

  function drawTail(ctx: Ctx, t: number): void {
    const out = s.col(C.outline);
    const pts = sampleCurve(tailPoints(t), 22);
    const line = (from: number, to: number, w: number, col: string): void => {
      ctx.beginPath();
      ctx.moveTo(pts[from].x, pts[from].y);
      for (let i = from + 1; i <= to; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
    };
    const n = pts.length - 1;
    line(0, n, 8.6, out);
    line(0, n, 5.4, FUR());
    line(n - 4, n, 5.4, CREAM());
    // Stripes across the tail.
    ctx.strokeStyle = STRIPE();
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (const i of [6, 10, 14]) {
      const a = pts[i - 1];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      const nx = (-dy / L) * 2.3;
      const ny = (dx / L) * 2.3;
      ctx.moveTo(pts[i].x - nx, pts[i].y - ny);
      ctx.lineTo(pts[i].x + nx, pts[i].y + ny);
    }
    ctx.stroke();
  }

  /**
   * Warm light from the lantern (src/layers/lantern.ts publishes s.shared.lantern) on the side of the
   * cat that faces it: a soft wash over the fur plus a rim just inside the outline. Drawn in the cat's
   * local units right after the baked body / head, so it follows the breathing, lean and head tilt.
   */
  // The rim light is baked at full strength (a clip per frame is costly on the GPU canvas) and only
  // re-painted when the lamp moves relative to the cat by a whole unit; each frame it is just drawn
  // additively with the lamp's current strength.
  const bakedRim = [new Baked(), new Baked()];
  function lanternRim(ctx: Ctx, P: Pose, head: boolean): void {
    const lan = s.shared.lantern as { x: number; y: number; lit: number; sprite: HTMLCanvasElement | ImageBitmap } | undefined;
    if (!lan) return;
    const k = clamp((lan.lit - 0.16) / 0.84, 0, 1);
    if (k < 0.02) return;
    const u = s.u;
    // Lantern in body-local units (undo the lean; the breathing / head tilt are tiny), rounded so
    // the bake is reused while the lamp sways.
    const gx = (lan.x - P.O.x) / u;
    const gy = (lan.y - P.O.y) / u;
    const cl = Math.cos(-P.lean);
    const sl = Math.sin(-P.lean);
    const lx = Math.round(gx * cl - gy * sl);
    const ly = Math.round(gx * sl + gy * cl);
    const A = head ? HEAD_AREA : BODY_AREA;
    const paintRim = (c: Ctx): void => {
      const cy = head ? -32.5 : -12;
      const dl = Math.hypot(lx, ly - cy) || 1;
      const dx = lx / dl;
      const dy = (ly - cy) / dl;
      const shape = (ox: number, oy: number): void => {
        if (head) c.ellipse(ox, -32.5 + oy, 14.6, 12.6, 0, 0, TAU);
        else {
          c.save();
          c.translate(ox, oy);
          curveThrough(c, BODY, true);
          c.restore();
        }
      };
      c.save();
      c.beginPath();
      shape(0, 0);
      c.clip();
      // Wash: warm light falling off with distance from the lamp.
      const R = 95;
      c.globalAlpha = 0.42;
      c.drawImage(lan.sprite, lx - R, ly - R, R * 2, R * 2);
      // Rim: the band of fur just inside the outline on the lamp side.
      c.beginPath();
      shape(dx * 1.3, dy * 1.3);
      c.clip();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = s.raw(mix(C.light.lamp, C.orange[2], 0.3));
      for (const [w, a] of [[4.2, 0.22], [2.4, 0.42]] as const) {
        c.beginPath();
        c.rect(A.x, A.y, A.w, A.h);
        shape(-dx * w, -dy * w);
        c.globalAlpha = a;
        c.fill('evenodd');
      }
      c.restore();
    };
    const ga = ctx.globalAlpha;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * k;
    bakedRim[head ? 1 : 0].draw(ctx, `${lx},${ly}`, A, s.dpr * u, paintRim);
    ctx.globalAlpha = ga;
    ctx.globalCompositeOperation = op;
  }

  function drawCat(ctx: Ctx): void {
    const P = getPose();
    const L = s.layout;
    const u = s.u;
    const t = s.t;
    const out = s.col(C.outline);
    const fur = FUR();
    const furD = FUR_D();
    const cream = CREAM();
    const key = String(s.light.key);
    const bd = s.dpr * u;
    const toLocal = (p: Pt): Pt => ({ x: (p.x - P.O.x) / u, y: (p.y - P.O.y) / u });

    // Contact shadow on the deck (does not hop).
    ellipse(ctx, L.fisher.x + 1 * u, L.fisher.y - 0.5 * u, 22 * u, 4 * u, { fill: s.colA(C.wood.dark, 0.32) });

    ctx.save();
    ctx.translate(P.O.x, P.O.y);
    ctx.scale(u, u);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Tail curls along the deck behind the cat.
    drawTail(ctx, t);
    // Hind legs dangling over the right edge (far leg first), cream socks.
    const legs = [
      { hx: 14.5, hy: -9, a: 0.55, ph: 2.1, c: furD },
      { hx: 10.5, hy: -5.5, a: 0.8, ph: 0, c: fur },
    ];
    for (const g of legs) {
      const a = g.a + (s.reducedMotion ? 0.05 : 0.17) * Math.sin(t * 1.6 + g.ph);
      const fx = g.hx + Math.cos(a) * 10;
      const fy = g.hy + Math.sin(a) * 10;
      ctx.beginPath();
      ctx.moveTo(g.hx, g.hy);
      ctx.lineTo(fx, fy);
      strokeDouble(ctx, 5, g.c, out, 2.2);
      ellipse(ctx, fx, fy, 3.9, 3.2, { fill: cream, stroke: out, line: 2 }, a);
    }
    ctx.restore();

    // Rod + line in screen space.
    drawRodAndLine(ctx, P);

    ctx.save();
    ctx.translate(P.O.x, P.O.y);
    ctx.scale(u, u);
    ctx.rotate(P.lean);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Far paw on the rod (behind the body).
    const pawFar = toLocal(qpt(P.B, P.K, P.T, 0.245));
    circle(ctx, pawFar.x, pawFar.y, 3.1, { fill: cream, stroke: out, line: 2 });

    // Body (breathes).
    ctx.save();
    ctx.scale(1, 1 + 0.018 * P.breathe);
    bakedBody.draw(ctx, key, BODY_AREA, bd, paintBody);
    lanternRim(ctx, P, false);
    ctx.restore();

    // Scarf tails flutter from the knot in the wind.
    const wind = s.windAt(L.fisher.x);
    for (let i = 0; i < 2; i++) {
      const fl = Math.sin(t * (5 + i * 1.3) + i * 2) * (1.2 + wind * 1.6);
      const ex = 15.5 + i * 2.5 + wind * 4 + fl * 0.5;
      const ey = -15 + i * 1.5 + fl;
      ctx.beginPath();
      ctx.moveTo(14, -16.8);
      ctx.quadraticCurveTo(17 + fl * 0.4, -13.5, ex + 2, ey + 6);
      strokeDouble(ctx, 3, s.col(i === 0 ? C.teal[2] : C.teal[1]), out, 1.6);
    }

    // Head group (tilts around the neck); ears first so the hat crown covers their bases.
    const lift = -28 * 0.018 * P.breathe;
    ctx.save();
    ctx.translate(2, -22 + lift);
    ctx.rotate(P.headTilt);
    ctx.translate(-2, 22);
    const q = (t - twitchAt) / 0.3;
    for (let i = 0; i < 2; i++) {
      const ex = i === 0 ? -8.2 : 9.4;
      const ey = i === 0 ? -44.5 : -44;
      const lean = i === 0 ? -0.28 : 0.3;
      const tw = i === twitchEar && q > 0 && q < 1 ? Math.sin(Math.PI * q) * 0.4 * (i === 0 ? -1 : 1) : 0;
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(lean + tw);
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.quadraticCurveTo(-3.2, -6, -0.4, -10);
      ctx.quadraticCurveTo(0.6, -10.6, 1.2, -9.6);
      ctx.quadraticCurveTo(3.6, -5.5, 5, 2);
      ctx.closePath();
      ctx.fillStyle = fur;
      ctx.fill();
      ctx.strokeStyle = out;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      if (i === 1) {
        ctx.beginPath();
        ctx.moveTo(-1.6, 0.5);
        ctx.quadraticCurveTo(-0.4, -4.6, 0.6, -6.8);
        ctx.quadraticCurveTo(2, -3.5, 2.6, 0.5);
        ctx.closePath();
        ctx.fillStyle = s.col(C.pink[2]);
        ctx.fill();
      }
      ctx.restore();
    }
    bakedHead.draw(ctx, key, HEAD_AREA, bd, paintHead);
    lanternRim(ctx, P, true);
    ctx.restore();

    // Near arm reaching to the rod, cream paw on top.
    const paw = toLocal(qpt(P.B, P.K, P.T, 0.2));
    ctx.beginPath();
    ctx.moveTo(11.5, -16);
    ctx.quadraticCurveTo(20, -17, paw.x, paw.y);
    strokeDouble(ctx, 4.8, fur, out, 2.2);
    circle(ctx, paw.x, paw.y, 3.4, { fill: cream, stroke: out, line: 2 });
    ctx.restore();
  }

  function drawFishShape(ctx: Ctx, lk: FishLook): void {
    const R = lk.ramp;
    const out = s.col(C.outline);
    // tail
    ctx.beginPath();
    ctx.moveTo(-6.5, 0);
    ctx.quadraticCurveTo(-10, -1.5, -12.8, -5.6);
    ctx.quadraticCurveTo(-11, 0, -12.8, 5.6);
    ctx.quadraticCurveTo(-10, 1.5, -6.5, 0);
    ctx.closePath();
    ctx.fillStyle = s.col(R[1]);
    ctx.fill();
    ctx.strokeStyle = out;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // dorsal fin
    ctx.beginPath();
    ctx.moveTo(-3.6, -3.8);
    ctx.quadraticCurveTo(-1, -8.8, 3.4, -4.4);
    ctx.closePath();
    ctx.fillStyle = s.col(R[1]);
    ctx.fill();
    ctx.stroke();
    // body + belly
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.4, 5.3, 0, 0, TAU);
    ctx.fillStyle = s.col(R[2]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ellipse(ctx, 1, 3.8, 8.5, 2.9, { fill: s.col(R[3]) });
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.4, 5.3, 0, 0, TAU);
    ctx.strokeStyle = out;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    // gill, eye, shine
    ctx.beginPath();
    ctx.arc(1.6, 0, 3.2, -1.0, 1.0);
    ctx.strokeStyle = s.col(R[0]);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    circle(ctx, 4.7, -1.3, 1.8, { fill: s.col(C.white) });
    circle(ctx, 5.1, -1.2, 1.0, { fill: s.col(C.ink) });
    ellipse(ctx, -1.8, -2.6, 2.4, 0.9, { fill: s.colA(C.white, 0.7) }, -0.1);
  }

  function drawBoot(ctx: Ctx): void {
    const out = s.col(C.outline);
    ctx.translate(-2.5, 4);
    ctx.beginPath();
    ctx.moveTo(-5, -10);
    ctx.lineTo(2.5, -10);
    ctx.lineTo(2.5, -3);
    ctx.quadraticCurveTo(9.5, -3.2, 10, 1);
    ctx.lineTo(10, 3.5);
    ctx.lineTo(-5, 3.5);
    ctx.closePath();
    ctx.fillStyle = s.col(C.brown[1]);
    ctx.fill();
    ctx.strokeStyle = out;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();
    roundRect(ctx, -5.6, 1.8, 16.2, 2.6, 1.2, { fill: s.col(C.brown[0]), stroke: out, line: 1.3 });
    roundRect(ctx, -5.8, -12, 9.2, 3.2, 1.2, { fill: s.col(C.brown[2]), stroke: out, line: 1.4 });
    ctx.beginPath();
    ctx.moveTo(-3, -7.5);
    ctx.lineTo(-3, -1);
    ctx.strokeStyle = s.col(C.brown[2]);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  function drawBucket(ctx: Ctx): void {
    const L = s.layout;
    const u = s.u;
    const t = s.t;
    const out = s.col(C.outline);
    ellipse(ctx, L.bucket.x + 1 * u, L.bucket.y, 15.5 * u, 3.6 * u, { fill: s.colA(C.wood.dark, 0.32) });
    ctx.save();
    ctx.translate(L.bucket.x, L.bucket.y);
    ctx.scale(u, u);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // handle (leaning back)
    ctx.beginPath();
    ctx.ellipse(0, -20, 14.4, 9.5, 0, Math.PI, TAU);
    strokeDouble(ctx, 1.5, s.col(C.metal.mid), out, 1.1);
    // body
    ctx.beginPath();
    ctx.moveTo(-14, -20);
    ctx.lineTo(-11, -2.2);
    ctx.quadraticCurveTo(0, 1.8, 11, -2.2);
    ctx.lineTo(14, -20);
    ctx.closePath();
    ctx.fillStyle = s.col(C.metal.light);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(5.5, -22);
    ctx.lineTo(16, -22);
    ctx.lineTo(16, 3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fillStyle = s.col(C.metal.mid);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10.6, -21);
    ctx.lineTo(-7.6, -21);
    ctx.lineTo(-6.2, 2);
    ctx.lineTo(-8.8, 2);
    ctx.closePath();
    ctx.fillStyle = s.col(C.metal.hi);
    ctx.fill();
    ctx.strokeStyle = s.col(C.metal.dark);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-14, -13.5);
    ctx.quadraticCurveTo(0, -10.5, 14, -13.5);
    ctx.moveTo(-14, -7);
    ctx.quadraticCurveTo(0, -4, 14, -7);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(-14, -20);
    ctx.lineTo(-11, -2.2);
    ctx.quadraticCurveTo(0, 1.8, 11, -2.2);
    ctx.lineTo(14, -20);
    ctx.strokeStyle = out;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // rim, inner wall, water
    ellipse(ctx, 0, -20, 14.6, 4.4, { fill: s.col(C.metal.dark), stroke: out, line: 2.2 });
    ellipse(ctx, 0, -19.3, 12.4, 3.2, { fill: s.col(C.water.mid) });
    ellipse(ctx, -4, -19.9, 4, 1, { fill: s.colA(C.water.ripple, 0.7) });
    // fish tails poking out
    const xs = [-5.5, 1.5, 7.5];
    const as = [-0.4, 0.08, 0.45];
    const g = api();
    const looks = (g ? g.bucketLooks() : tails).filter((l) => !l.boot);
    looks.forEach((k, i) => {
      const R = k.ramp;
      ctx.save();
      ctx.translate(xs[i], -19.4);
      ctx.rotate(as[i] + 0.12 * Math.sin(t * 2.1 + i * 1.7));
      ctx.beginPath();
      ctx.moveTo(-1.8, 0.5);
      ctx.lineTo(-1.4, -3.4);
      ctx.quadraticCurveTo(-5, -6, -5.6, -10);
      ctx.quadraticCurveTo(-2, -8, 0, -6.4);
      ctx.quadraticCurveTo(2, -8, 5.6, -10);
      ctx.quadraticCurveTo(5, -6, 1.4, -3.4);
      ctx.lineTo(1.8, 0.5);
      ctx.closePath();
      ctx.fillStyle = s.col(R[2]);
      ctx.fill();
      ctx.strokeStyle = out;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-3.4, -8.6);
      ctx.moveTo(0, -6);
      ctx.lineTo(3.4, -8.6);
      ctx.strokeStyle = s.col(R[1]);
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    });
    // front lip of the rim
    ctx.beginPath();
    ctx.ellipse(0, -20, 13.4, 3.4, 0, 0.12, Math.PI - 0.12);
    ctx.strokeStyle = s.col(C.metal.hi);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // hinges
    circle(ctx, -14.4, -19.6, 1.6, { fill: s.col(C.metal.mid), stroke: out, line: 1.1 });
    circle(ctx, 14.4, -19.6, 1.6, { fill: s.col(C.metal.mid), stroke: out, line: 1.1 });
    ctx.restore();
  }

  function drawFx(ctx: Ctx): void {
    const P = getPose();
    const u = s.u;
    const out = s.col(C.outline);
    const f = P.fly;
    if (f) {
      ctx.save();
      if (f.clipY !== Infinity) {
        ctx.beginPath();
        ctx.rect(0, 0, s.W, f.clipY);
        ctx.clip();
      }
      if (f.look.sparkle) glow(ctx, f.x, f.y, 18 * u, s.raw(C.light.sparkle), 0.35);
      ctx.translate(f.x, f.y);
      ctx.scale(u, u);
      if (f.flip) ctx.scale(-1, 1);
      ctx.rotate(f.rot);
      ctx.lineJoin = 'round';
      if (f.look.boot) drawBoot(ctx);
      else {
        ctx.scale(f.look.size, f.look.size);
        drawFishShape(ctx, f.look);
      }
      ctx.restore();
    }
    if (P.bubble > 0.01 && P.bubbleA > 0.01) {
      const tipX = P.O.x + 7 * u;
      const tipY = P.O.y - 57 * u;
      const cx = P.O.x + 13 * u;
      const cy = P.O.y - 70.5 * u;
      ctx.save();
      ctx.globalAlpha *= P.bubbleA;
      ctx.translate(tipX, tipY);
      ctx.scale(P.bubble, P.bubble);
      ctx.translate(-tipX, -tipY);
      const white = s.col(C.white);
      const tail: Pt[] = [
        { x: cx - 4 * u, y: cy + 7 * u },
        { x: tipX, y: tipY },
        { x: cx + 1.5 * u, y: cy + 8 * u },
      ];
      ctx.beginPath();
      ctx.moveTo(tail[0].x, tail[0].y);
      ctx.lineTo(tail[1].x, tail[1].y);
      ctx.lineTo(tail[2].x, tail[2].y);
      ctx.closePath();
      ctx.fillStyle = white;
      ctx.fill();
      ctx.strokeStyle = out;
      ctx.lineWidth = 2.2 * u;
      ctx.lineJoin = 'round';
      ctx.stroke();
      roundRect(ctx, cx - 8 * u, cy - 10.5 * u, 16 * u, 20 * u, 7 * u, { fill: white, stroke: out, line: 2.2 * u });
      ctx.beginPath();
      ctx.moveTo(tail[0].x + 0.6 * u, tail[0].y - 1.6 * u);
      ctx.lineTo(tail[1].x, tail[1].y - 2.2 * u);
      ctx.lineTo(tail[2].x - 0.6 * u, tail[2].y - 1.6 * u);
      ctx.closePath();
      ctx.fill();
      const red = s.col(C.red[1]);
      roundRect(ctx, cx - 2 * u, cy - 7.2 * u, 4 * u, 9.6 * u, 2 * u, { fill: red });
      circle(ctx, cx, cy + 5.4 * u, 2.2 * u, { fill: red });
      ctx.restore();
    }
  }

  return [
    { id: 'fisher.bobber', z: 255, update, draw: (_s, ctx) => drawBobber(ctx) },
    { id: 'fisher.cat', z: 336, draw: (_s, ctx) => drawCat(ctx) },
    { id: 'fisher.bucket', z: 341, draw: (_s, ctx) => drawBucket(ctx) },
    { id: 'fisher.fx', z: 346, draw: (_s, ctx) => drawFx(ctx) },
  ];
};

export default fisher;
