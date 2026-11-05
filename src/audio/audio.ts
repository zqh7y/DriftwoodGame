// Sound for Driftwood Dock: relaxing generative music, ambience that follows time of day and
// weather, and soft sound effects — all synthesized with the Web Audio API (no audio files).
//
// Graph:  music voices -> musicFilter -> musicMix -> musicLevel ---------\
//         melody ------------------------^   \-> musicVerbGate -> verb ---> master -> comp -> out
//         ambience (water, rain, wind, birds, crickets, thunder) -> ambLevel /
//         sfx voices -> per-call vol/pan -> sfxLevel ----------------------/ (+ sfx reverb send)
// Music is an original, endlessly generative lo-fi loop in F major: warm detuned pads, a sparse
// kalimba pentatonic melody, a soft sub bass, brushed hats and a little vinyl crackle.

import { TEST_SHORTCUTS, type Scene } from '../engine';

export type Sfx =
  | 'tap' // any button
  | 'open' // a sheet/popup opens
  | 'close' // a sheet/popup closes
  | 'cast' // rod whoosh as the line goes out
  | 'plop' // bobber lands on the water
  | 'bite' // a fish bites ("!")
  | 'reel' // reeling in
  | 'splash' // the fish leaves the water
  | 'catch' // fish lands (common)
  | 'rare' // fish lands (class B/A/S)
  | 'legend' // fish lands (SSS)
  | 'discover' // first catch of a species
  | 'sell' // bones gained
  | 'erase' // fish erased from the inventory
  | 'buy' // upgrade bought
  | 'nope' // can't afford
  | 'circle' // tapped a time circle
  | 'circleSpawn' // a time circle appears
  | 'event' // a weather luck event starts
  | 'welcome' // welcome-back popup
  | 'select'; // a tile / fish selected

export interface PlayOpts {
  /** Multiplies the pitch (1 = normal). */
  pitch?: number;
  /** 0..1 volume scale. */
  vol?: number;
  /** -1 (left) … 1 (right). */
  pan?: number;
}

export interface AudioApi {
  /** Call from a user gesture: starts the audio context (browsers block audio until then). */
  unlock(): void;
  play(s: Sfx, opts?: PlayOpts): void;
  /** Hooks the scene: ambience follows s.light / s.weatherPreset; listens to 'lightning'. */
  attach(scene: Scene): void;
  musicOn: boolean;
  sfxOn: boolean;
  setMusic(on: boolean): void;
  setSfx(on: boolean): void;
  /** Bus volumes 0..1 (default 0.8 = the original mix; perceptual curve; 0 = silent). Persisted. */
  musicVolume: number;
  /** Water, rain, wind, thunder, birds, crickets, frogs. */
  ambienceVolume: number;
  sfxVolume: number;
  setMusicVolume(v: number): void;
  setAmbienceVolume(v: number): void;
  setSfxVolume(v: number): void;
  /** Calm (night) mode: quieter, softer sfx, gentler thunder, sparser and darker music. Persisted. */
  calm: boolean;
  setCalm(on: boolean): void;
  /** True between fadeOutForSleep() and wakeFromSleep(); sfx are muted meanwhile. */
  readonly asleep: boolean;
  /** Sleep timer ended: gently fades music + ambience to silence over `seconds` (musicOn is not changed). */
  fadeOutForSleep(seconds?: number): void;
  /** Fades music + ambience back in over ~3 s and unmutes sfx. */
  wakeFromSleep(): void;
}

// ------------------------------------------------------------------ prefs

const STORE = 'driftwood-dock.audio.v1';

const DEFAULT_VOL = 0.8;

interface Prefs {
  music: boolean;
  sfx: boolean;
  musicVol: number;
  ambVol: number;
  sfxVol: number;
  calm: boolean;
}

const volOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp01(v) : d);

function readStored(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const p: unknown = JSON.parse(raw);
      if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
    }
  } catch {
    /* storage blocked / bad JSON */
  }
  return null;
}

function loadPrefs(): Prefs {
  // Older saves only have { music, sfx }: everything else falls back to its default.
  const p = readStored() ?? {};
  return {
    music: p.music !== false,
    sfx: p.sfx !== false,
    musicVol: volOr(p.musicVol, DEFAULT_VOL),
    ambVol: volOr(p.ambVol, DEFAULT_VOL),
    sfxVol: volOr(p.sfxVol, DEFAULT_VOL),
    calm: p.calm === true,
  };
}

function savePrefs(): void {
  try {
    const p: Prefs = {
      music: state.musicOn,
      sfx: state.sfxOn,
      musicVol: state.musicVol,
      ambVol: state.ambVol,
      sfxVol: state.sfxVol,
      calm: state.calm,
    };
    // Merge so any other keys stored under this name survive.
    localStorage.setItem(STORE, JSON.stringify({ ...(readStored() ?? {}), ...p }));
  } catch {
    /* storage blocked */
  }
}

// ------------------------------------------------------------------ helpers

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number): boolean => Math.random() < p;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const MUSIC_LEVEL = 0.55;
const AMB_LEVEL = 1;
const SFX_LEVEL = 1;
const FADE = 0.6; // setTargetAtTime time constant for toggles
const VOL_TC = 0.1; // setTargetAtTime time constant for volume sliders
/** Slider 0..1 -> gain multiplier. Perceptual (v^1.6), normalised so the default 0.8 = the original mix. */
const volCurve = (v: number): number => (v <= 0 ? 0 : Math.pow(clamp01(v) / DEFAULT_VOL, 1.6));

// Calm mode.
const CALM_SFX = 0.6; // every sfx
const CALM_ATTN = 0.45; // frequent / attention-grabbing sfx (total, incl. CALM_SFX)
const CALM_SOFT: ReadonlySet<Sfx> = new Set<Sfx>(['catch', 'rare', 'legend', 'discover', 'circle', 'circleSpawn', 'event', 'bite', 'reel', 'splash', 'sell', 'erase']);
const CALM_LP = 3200; // Hz lowpass on those sounds
const CALM_MUSIC_FILTER = 0.75; // music lowpass multiplier
const CALM_THUNDER_GAP = 14; // s: rumbles closer together than this are skipped
const WAKE_TIME = 3; // s

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  verbIn: GainNode; // sfx reverb send (follows the sfx level)
  bed: GainNode; // music + ambience -> master (sleep fade)
  bedVerb: GainNode; // music + ambience reverb sends -> verb (sleep fade)
  musicFilter: BiquadFilterNode;
  musicMix: GainNode;
  melIn: GainNode;
  musicLevel: GainNode;
  musicVerbGate: GainNode;
  ambLevel: GainNode;
  ambVerb: GainNode;
  sfxLevel: GainNode;
  noise: AudioBuffer;
  wow: GainNode; // lo-fi pitch wobble (connect to osc.detune)
  rainGain: GainNode;
  windGain: GainNode;
  waterGain: GainNode;
}

let g: Graph | null = null;

function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Darkens as it decays (one-pole lowpass whose coefficient falls over time).
      const k = 0.55 - 0.45 * t;
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < 80 ? i / 80 : 1);
    }
  }
  return buf;
}

function makeCrackle(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  const n = Math.floor(seconds * 9);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * (len - 40));
    const amp = Math.random() < 0.15 ? rand(0.5, 1) : rand(0.08, 0.3);
    for (let j = 0; j < 30; j++) d[at + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / 6);
  }
  return buf;
}

function gain(ctx: AudioContext, v: number): GainNode {
  const n = ctx.createGain();
  n.gain.value = v;
  return n;
}

function filter(ctx: AudioContext, type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function loopNoise(G: { ctx: AudioContext; noise: AudioBuffer }, dest: AudioNode): AudioBufferSourceNode {
  const src = G.ctx.createBufferSource();
  src.buffer = G.noise;
  src.loop = true;
  src.connect(dest);
  src.start(0, rand(0, G.noise.duration - 0.1));
  return src;
}

function lfo(ctx: AudioContext, rate: number, depth: number, target: AudioParam): OscillatorNode {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const d = gain(ctx, depth);
  o.connect(d);
  d.connect(target);
  o.start();
  return o;
}

function build(ctx: AudioContext): Graph {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.008;
  comp.release.value = 0.3;
  comp.connect(ctx.destination);
  const master = gain(ctx, 0.9);
  master.connect(comp);

  const verb = ctx.createConvolver();
  verb.buffer = makeImpulse(ctx, 3.2, 2.6);
  const verbOut = gain(ctx, 0.55);
  verb.connect(verbOut);
  verbOut.connect(master);
  const verbIn = gain(ctx, 1);
  verbIn.connect(verb);

  const noise = makeNoise(ctx, 3);

  // Music + ambience share a "bed" stage that only the sleep timer automates.
  const bed = gain(ctx, 1);
  bed.connect(master);
  const bedVerb = gain(ctx, 1);
  bedVerb.connect(verb);

  // Music bus.
  const musicLevel = gain(ctx, 0);
  musicLevel.connect(bed);
  const musicVerbGate = gain(ctx, 0);
  musicVerbGate.connect(bedVerb);
  const musicMix = gain(ctx, 1);
  musicMix.connect(musicLevel);
  const mixSend = gain(ctx, 0.3);
  musicMix.connect(mixSend);
  mixSend.connect(musicVerbGate);
  const musicFilter = filter(ctx, 'lowpass', 2400, 0.4);
  musicFilter.connect(musicMix);
  const melIn = gain(ctx, 1);
  melIn.connect(musicFilter);
  const melSend = gain(ctx, 0.55);
  melIn.connect(melSend);
  melSend.connect(musicVerbGate);

  // Lo-fi wow: a slow shared detune wobble (in cents) for pads.
  const wowOsc = ctx.createOscillator();
  wowOsc.frequency.value = 0.23;
  const wow = gain(ctx, 5);
  wowOsc.connect(wow);
  wowOsc.start();

  // Vinyl crackle (very quiet).
  const crk = ctx.createBufferSource();
  crk.buffer = makeCrackle(ctx, 5);
  crk.loop = true;
  const crkF = filter(ctx, 'bandpass', 2600, 0.6);
  const crkG = gain(ctx, 0.05);
  crk.connect(crkF);
  crkF.connect(crkG);
  crkG.connect(musicMix);
  crk.start();

  // Ambience bus.
  const ambLevel = gain(ctx, 0);
  ambLevel.connect(bed);
  const ambVerb = gain(ctx, 0);
  ambVerb.connect(bedVerb);

  const G0 = { ctx, noise };
  // Water lapping: two filtered noise layers breathing on slow LFOs.
  const waterGain = gain(ctx, 1);
  waterGain.connect(ambLevel);
  const w1f = filter(ctx, 'lowpass', 380, 0.8);
  const w1g = gain(ctx, 0.05);
  w1f.connect(w1g);
  w1g.connect(waterGain);
  loopNoise(G0, w1f);
  lfo(ctx, 0.14, 0.035, w1g.gain);
  const w2f = filter(ctx, 'bandpass', 850, 1.4);
  const w2g = gain(ctx, 0.014);
  w2f.connect(w2g);
  w2g.connect(waterGain);
  loopNoise(G0, w2f);
  lfo(ctx, 0.23, 0.012, w2g.gain);
  lfo(ctx, 0.09, 220, w2f.frequency);

  // Rain: a soft, distant patter — mostly low body, the hiss rolled right off so it stays relaxing.
  const rainGain = gain(ctx, 0);
  rainGain.connect(ambLevel);
  const rhp = filter(ctx, 'highpass', 350, 0.5);
  const rlp = filter(ctx, 'lowpass', 2000, 0.5);
  rhp.connect(rlp);
  rlp.connect(rainGain);
  loopNoise(G0, rhp);
  const rbody = filter(ctx, 'lowpass', 700, 0.5);
  const rbodyG = gain(ctx, 0.9);
  rbody.connect(rbodyG);
  rbodyG.connect(rainGain);
  loopNoise(G0, rbody);

  // Wind (storm).
  const windGain = gain(ctx, 0);
  windGain.connect(ambLevel);
  const wf = filter(ctx, 'bandpass', 380, 1.1);
  wf.connect(windGain);
  loopNoise(G0, wf);
  lfo(ctx, 0.07, 180, wf.frequency);

  return {
    ctx,
    master,
    verbIn,
    bed,
    bedVerb,
    musicFilter,
    musicMix,
    melIn,
    musicLevel,
    musicVerbGate,
    ambLevel,
    ambVerb,
    sfxLevel: (() => {
      const n = gain(ctx, 1);
      n.connect(master);
      return n;
    })(),
    noise,
    wow,
    rainGain,
    windGain,
    waterGain,
  };
}

// ------------------------------------------------------------------ voices

/** While an sfx is being built by play(), its reverb sends go here (per-call calm scaling). */
let sendDest: AudioNode | null = null;

interface ToneOpts {
  type?: OscillatorType;
  attack?: number;
  peak: number;
  decay: number; // exponential tail time
  hold?: number;
  glideTo?: number; // frequency at end of glideTime
  glideTime?: number;
  detune?: number;
  send?: number; // reverb send (sfx)
}

/** One enveloped oscillator into `dest`. Returns the end time. */
function tone(dest: AudioNode, f: number, t: number, o: ToneOpts): number {
  const G = g!;
  const ctx = G.ctx;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f, t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideTime ?? 0.1));
  if (o.detune) osc.detune.value = o.detune;
  const env = ctx.createGain();
  const a = o.attack ?? 0.005;
  const hold = o.hold ?? 0;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.peak, t + a);
  if (hold > 0) env.gain.setValueAtTime(o.peak, t + a + hold);
  env.gain.setTargetAtTime(0.0001, t + a + hold, o.decay / 4);
  const end = t + a + hold + o.decay * 1.3 + 0.05;
  osc.connect(env);
  env.connect(dest);
  if (o.send) {
    const s = ctx.createGain();
    s.gain.value = o.send;
    env.connect(s);
    s.connect(sendDest ?? G.verbIn);
  }
  osc.start(t);
  osc.stop(end);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
  };
  return end;
}

interface NoiseOpts {
  type: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
  attack?: number;
  peak: number;
  dur: number;
  send?: number;
}

function noiseHit(dest: AudioNode, t: number, o: NoiseOpts): number {
  const G = g!;
  const ctx = G.ctx;
  const src = ctx.createBufferSource();
  src.buffer = G.noise;
  const fl = ctx.createBiquadFilter();
  fl.type = o.type;
  fl.Q.value = o.q ?? 1;
  fl.frequency.setValueAtTime(o.f, t);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const env = ctx.createGain();
  const a = o.attack ?? 0.003;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.peak, t + a);
  env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + 0.01, o.dur));
  src.connect(fl);
  fl.connect(env);
  env.connect(dest);
  if (o.send) {
    const s = ctx.createGain();
    s.gain.value = o.send;
    env.connect(s);
    s.connect(sendDest ?? G.verbIn);
  }
  const end = t + o.dur + 0.05;
  // Hits longer than the noise buffer (thunder) loop it; a negative start offset would throw.
  const maxOff = G.noise.duration - o.dur - 0.1;
  if (maxOff <= 0) src.loop = true;
  src.start(t, rand(0, maxOff > 0 ? maxOff : G.noise.duration - 0.1));
  src.stop(end);
  src.onended = () => {
    src.disconnect();
    fl.disconnect();
    env.disconnect();
  };
  return end;
}

/** A soft bell / chime: sine + quiet inharmonic partials. */
function bell(dest: AudioNode, f: number, t: number, peak: number, decay: number, send = 0.4): number {
  tone(dest, f, t, { peak, decay, attack: 0.004, send });
  tone(dest, f * 2.01, t, { peak: peak * 0.25, decay: decay * 0.5, attack: 0.003 });
  return tone(dest, f * 3.98, t, { peak: peak * 0.08, decay: decay * 0.25, attack: 0.002 });
}

/** A water bloop: sine that sweeps up quickly. */
function bloop(dest: AudioNode, f: number, t: number, peak: number): number {
  return tone(dest, f, t, { peak, decay: 0.09, attack: 0.004, glideTo: f * 2.6, glideTime: 0.07 });
}

// ------------------------------------------------------------------ sfx

const F = (n: number): number => mtof(n);
// F-major pentatonic-ish sparkle notes (MIDI)
const SPARK = [77, 79, 81, 84, 86, 89, 91, 93, 96];

type SfxFn = (out: AudioNode, t: number, p: number) => number;

const SFX: Record<Sfx | 'rustle' | 'croak', SfxFn> = {
  tap: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 2600 * p, q: 2, peak: 0.05, dur: 0.02 });
    return tone(o, 820 * p, t, { peak: 0.2, decay: 0.05, glideTo: 560 * p, glideTime: 0.04 });
  },
  select: (o, t, p) => {
    tone(o, 1320 * p, t, { peak: 0.08, decay: 0.05 });
    return tone(o, 2640 * p, t, { peak: 0.02, decay: 0.03, type: 'triangle' });
  },
  open: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 380 * p, f2: 2000 * p, q: 1.6, attack: 0.08, peak: 0.07, dur: 0.26 });
    return tone(o, 520 * p, t, { peak: 0.04, attack: 0.04, decay: 0.16, glideTo: 820 * p, glideTime: 0.18, send: 0.2 });
  },
  close: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 1800 * p, f2: 380 * p, q: 1.6, attack: 0.05, peak: 0.06, dur: 0.24 });
    return tone(o, 760 * p, t, { peak: 0.035, attack: 0.03, decay: 0.15, glideTo: 470 * p, glideTime: 0.16 });
  },
  cast: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 500 * p, f2: 2600 * p, q: 1.8, attack: 0.09, peak: 0.1, dur: 0.18 });
    return noiseHit(o, t + 0.16, { type: 'bandpass', f: 2600 * p, f2: 700 * p, q: 1.8, attack: 0.01, peak: 0.08, dur: 0.22 });
  },
  plop: (o, t, p) => {
    bloop(o, 300 * p, t, 0.22);
    noiseHit(o, t + 0.01, { type: 'lowpass', f: 1800, f2: 500, peak: 0.05, dur: 0.15 });
    return bloop(o, 520 * p, t + 0.07, 0.06);
  },
  bite: (o, t, p) => {
    bloop(o, 360 * p, t, 0.12);
    tone(o, F(81) * p, t + 0.02, { type: 'triangle', peak: 0.1, decay: 0.12, send: 0.2 });
    return tone(o, F(86) * p, t + 0.13, { type: 'triangle', peak: 0.1, decay: 0.2, send: 0.25 });
  },
  reel: (o, t, p) => {
    let end = t;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.05;
      const k = 1 - i / n;
      noiseHit(o, at, { type: 'bandpass', f: 3200 * p, q: 5, peak: 0.07 * (0.5 + 0.5 * k), dur: 0.014 });
      end = tone(o, 1700 * p, at, { type: 'triangle', peak: 0.025 * (0.5 + 0.5 * k), decay: 0.012 });
    }
    return end;
  },
  splash: (o, t, p) => {
    noiseHit(o, t, { type: 'lowpass', f: 1800 * p, f2: 400, q: 0.8, attack: 0.012, peak: 0.08, dur: 0.38, send: 0.15 });
    noiseHit(o, t, { type: 'bandpass', f: 900, f2: 1800, q: 1, peak: 0.02, dur: 0.18 });
    let end = t;
    for (let i = 0; i < 3; i++) end = bloop(o, rand(260, 520) * p, t + 0.04 + i * rand(0.05, 0.1), rand(0.025, 0.045));
    return end;
  },
  // A quiet, low water sound: the fish slipping into the bucket. No chime.
  catch: (o, t, p) => {
    noiseHit(o, t, { type: 'lowpass', f: 900 * p, f2: 240, q: 0.7, attack: 0.012, peak: 0.055, dur: 0.32, send: 0.12 });
    bloop(o, 150 * p, t + 0.01, 0.06);
    bloop(o, 230 * p, t + 0.12, 0.025);
    return bloop(o, 310 * p, t + 0.22, 0.012);
  },
  rare: (o, t, p) => {
    let end = t;
    const notes = [77, 81, 84, 88, 89, 93];
    notes.forEach((m, i) => {
      tone(o, F(m) * p, t + i * 0.06, { type: 'triangle', peak: 0.018, decay: 0.5 });
      end = bell(o, F(m) * p, t + i * 0.06, 0.035, 0.9, 0.5);
    });
    noiseHit(o, t + 0.2, { type: 'highpass', f: 7000, attack: 0.15, peak: 0.02, dur: 0.6, send: 0.6 });
    return end;
  },
  legend: (o, t, p) => {
    // Warm low chord swell.
    for (const m of [53, 60, 64, 69]) tone(o, F(m) * p, t, { type: 'triangle', attack: 0.4, hold: 0.6, peak: 0.035, decay: 1.6, send: 0.6 });
    // Shimmering cascade up then down.
    let end = t;
    const casc = [77, 81, 84, 86, 89, 93, 96, 98, 101, 98, 96, 93, 89];
    casc.forEach((m, i) => {
      end = bell(o, F(m) * p, t + 0.1 + i * 0.075, 0.055, 1.2, 0.8);
    });
    // Tremolo shimmer pad.
    const sh = g!.ctx.createGain();
    sh.gain.value = 0.5;
    const lf = g!.ctx.createOscillator();
    lf.frequency.value = 7;
    const lfd = g!.ctx.createGain();
    lfd.gain.value = 0.5;
    lf.connect(lfd);
    lfd.connect(sh.gain);
    sh.connect(o);
    lf.start(t);
    const e2 = tone(sh, F(101) * p, t + 0.3, { attack: 0.5, hold: 0.6, peak: 0.03, decay: 1.4, send: 0.9 });
    lf.stop(e2);
    lf.onended = () => {
      lf.disconnect();
      lfd.disconnect();
      sh.disconnect();
    };
    noiseHit(o, t, { type: 'highpass', f: 6000, attack: 0.6, peak: 0.025, dur: 1.6, send: 0.8 });
    return Math.max(end, e2);
  },
  discover: (o, t, p) => {
    bell(o, F(84) * p, t, 0.08, 0.5);
    bell(o, F(89) * p, t + 0.12, 0.08, 0.5);
    const end = bell(o, F(93) * p, t + 0.24, 0.1, 1.3, 0.6);
    tone(o, F(81) * p, t + 0.24, { type: 'triangle', peak: 0.04, attack: 0.02, decay: 0.9 });
    for (let i = 0; i < 5; i++) tone(o, F(pick(SPARK) + 12) * p, t + 0.3 + i * 0.07, { peak: 0.018, decay: 0.25, send: 0.7 });
    return end;
  },
  sell: (o, t, p) => {
    let end = t;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.075;
      const f = rand(1900, 2300) * p * (1 + i * 0.06);
      tone(o, f, at, { peak: 0.06, decay: 0.22, send: 0.25 });
      tone(o, f * 2.76, at, { peak: 0.018, decay: 0.08 });
      end = tone(o, f * 0.5, at, { type: 'triangle', peak: 0.04, decay: 0.05 });
    }
    return end;
  },
  erase: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 2200 * p, f2: 5000 * p, q: 1.2, attack: 0.02, peak: 0.06, dur: 0.12 });
    noiseHit(o, t + 0.12, { type: 'bandpass', f: 4500 * p, f2: 2000 * p, q: 1.2, attack: 0.02, peak: 0.05, dur: 0.12 });
    let end = t;
    [96, 93, 89, 84].forEach((m, i) => (end = tone(o, F(m) * p, t + 0.18 + i * 0.05, { peak: 0.022, decay: 0.2, send: 0.6 })));
    return end;
  },
  buy: (o, t, p) => {
    let end = t;
    [77, 81, 84, 89].forEach((m, i) => (end = bell(o, F(m) * p, t + i * 0.07, 0.075, 0.6 + i * 0.15, 0.45)));
    tone(o, F(65) * p, t, { type: 'triangle', peak: 0.04, attack: 0.02, decay: 0.6 });
    noiseHit(o, t + 0.2, { type: 'highpass', f: 7500, attack: 0.1, peak: 0.018, dur: 0.5, send: 0.7 });
    return end;
  },
  nope: (o, t, p) => {
    noiseHit(o, t, { type: 'lowpass', f: 500, q: 0.7, peak: 0.07, dur: 0.08 });
    tone(o, 150 * p, t, { peak: 0.2, decay: 0.14, glideTo: 95 * p, glideTime: 0.12 });
    return tone(o, 220 * p, t + 0.09, { type: 'triangle', peak: 0.05, decay: 0.12, glideTo: 170 * p, glideTime: 0.1 });
  },
  circle: (o, t, p) => {
    tone(o, 520 * p, t, { peak: 0.24, decay: 0.07, glideTo: 1300 * p, glideTime: 0.05 });
    noiseHit(o, t, { type: 'bandpass', f: 3500 * p, q: 3, peak: 0.04, dur: 0.02 });
    return tone(o, 1560 * p, t + 0.035, { peak: 0.05, decay: 0.18, send: 0.4 });
  },
  circleSpawn: (o, t, p) => {
    tone(o, F(96) * p, t, { peak: 0.028, decay: 0.45, send: 0.7 });
    return tone(o, F(96) * 2.0 * p, t, { peak: 0.008, decay: 0.2 });
  },
  event: (o, t, p) => {
    noiseHit(o, t, { type: 'bandpass', f: 400, f2: 4500, q: 1.5, attack: 1.0, peak: 0.05, dur: 1.4, send: 0.7 });
    let end = t;
    for (const [i, m] of [65, 72, 76, 81, 84].entries())
      end = tone(o, F(m) * p, t + i * 0.12, { type: 'triangle', attack: 0.6, hold: 0.4, peak: 0.03, decay: 1.4, send: 0.7 });
    [89, 93, 96, 101].forEach((m, i) => bell(o, F(m) * p, t + 0.9 + i * 0.09, 0.035, 1, 0.8));
    return end;
  },
  welcome: (o, t, p) => {
    let end = t;
    [53, 60, 64, 67, 69, 76].forEach((m, i) => {
      end = tone(o, F(m) * p, t + i * 0.045, { type: 'triangle', attack: 0.03, hold: 0.2, peak: 0.045, decay: 1.8, send: 0.5 });
      tone(o, F(m) * p, t + i * 0.045, { peak: 0.03, attack: 0.01, decay: 1.2 });
    });
    return end;
  },
  rustle: (o, t, p) => {
    let end = t;
    for (let i = 0; i < 4; i++)
      end = noiseHit(o, t + i * rand(0.05, 0.09), { type: 'bandpass', f: rand(2500, 4500) * p, q: 0.9, attack: 0.02, peak: rand(0.025, 0.045), dur: rand(0.08, 0.16) });
    return end;
  },
  croak: (o, t, p) => {
    let end = t;
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.16;
      end = tone(o, 130 * p, at, { type: 'sawtooth', peak: 0.05, attack: 0.02, hold: 0.06, decay: 0.06, glideTo: 95 * p, glideTime: 0.12 });
    }
    return end;
  },
};

// ------------------------------------------------------------------ music

interface Chord {
  pad: number[];
  bass: number;
  tones: number[]; // pitch classes the melody likes to land on
}

const PROGS: Chord[][] = [
  [
    { pad: [53, 57, 60, 64], bass: 41, tones: [5, 9, 0, 4] }, // Fmaj7
    { pad: [50, 57, 60, 64], bass: 38, tones: [2, 5, 9, 4] }, // Dm9
    { pad: [46, 53, 57, 62], bass: 34, tones: [10, 2, 5, 9] }, // Bbmaj7
    { pad: [48, 55, 57, 62], bass: 36, tones: [0, 7, 9, 2] }, // C6/9 sus
  ],
  [
    { pad: [53, 57, 64, 67], bass: 41, tones: [5, 9, 4, 7] }, // Fmaj9
    { pad: [52, 55, 57, 60], bass: 45, tones: [9, 0, 4, 7] }, // Am7
    { pad: [53, 57, 58, 62], bass: 43, tones: [7, 2, 5, 9] }, // Gm9
    { pad: [46, 50, 53, 57], bass: 36, tones: [0, 5, 9, 2] }, // Bbmaj7/C
  ],
  [
    { pad: [50, 57, 60, 64], bass: 38, tones: [2, 5, 9, 0] }, // Dm9
    { pad: [46, 53, 57, 62], bass: 34, tones: [10, 2, 5, 9] }, // Bbmaj7
    { pad: [53, 57, 60, 64], bass: 41, tones: [5, 9, 0, 4] }, // Fmaj7
    { pad: [48, 52, 55, 62], bass: 36, tones: [0, 4, 7, 2] }, // Cadd9
  ],
];

const PENTA = [5, 7, 9, 0, 2]; // F G A C D
const MEL_NOTES: number[] = [];
for (let m = 64; m <= 88; m++) if (PENTA.includes(m % 12)) MEL_NOTES.push(m);

const BEAT = 60 / 66;
const CHORD_BEATS = 8;
const CHORD_LEN = BEAT * CHORD_BEATS;
const EIGHTH = BEAT / 2;

// Live ambience/music parameters (smoothed by attach()).
const env = { night: 0, rain: 0, storm: 0, fog: 0 };

let progIdx = 0;
let chordIdx = 0;
let nextChord = 0;
let melPos = 9; // index into MEL_NOTES (random walk)
let schedTimer: ReturnType<typeof setInterval> | null = null;
let ambTimer: ReturnType<typeof setInterval> | null = null;
let nextBird = 0;
let nextCricket = 0;
let nextCroak = 0;

function padVoice(G: Graph, m: number, t: number, len: number, peak: number): void {
  const ctx = G.ctx;
  const lp = filter(ctx, 'lowpass', 650 + rand(-60, 80), 0.6);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(peak, t + 2.4);
  env.gain.setValueAtTime(peak, t + len);
  env.gain.setTargetAtTime(0.0001, t + len, 0.9);
  lp.connect(env);
  env.connect(G.musicFilter);
  const end = t + len + 4.5;
  const oscs: OscillatorNode[] = [];
  for (const d of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(m);
    o.detune.value = d + rand(-2, 2);
    G.wow.connect(o.detune);
    o.connect(lp);
    o.start(t);
    o.stop(end);
    oscs.push(o);
  }
  oscs[0].onended = () => {
    for (const o of oscs) {
      try {
        G.wow.disconnect(o.detune);
      } catch {
        /* already */
      }
      o.disconnect();
    }
    lp.disconnect();
    env.disconnect();
  };
}

function kalimba(G: Graph, m: number, t: number, vel: number, dark: boolean): void {
  const f = mtof(m);
  const dest = G.melIn;
  if (dark) {
    // Felt-piano-ish: softer triangle, quick lowpass.
    tone(dest, f, t, { type: 'triangle', peak: 0.05 * vel, attack: 0.01, decay: 1.4 });
    tone(dest, f * 2, t, { peak: 0.008 * vel, attack: 0.006, decay: 0.3 });
  } else {
    tone(dest, f, t, { peak: 0.06 * vel, attack: 0.004, decay: 1.6 });
    tone(dest, f * 5.4, t, { peak: 0.009 * vel, attack: 0.002, decay: 0.12 });
    tone(dest, f * 2.02, t, { peak: 0.01 * vel, attack: 0.003, decay: 0.35 });
  }
}

function scheduleChord(G: Graph, t: number): void {
  const prog = PROGS[progIdx];
  const ch = prog[chordIdx];
  const night = env.night;
  const wet = Math.max(env.rain, env.storm);
  const calm = state.calm ? 1 : 0;
  const padPeak = 0.011 * (1 - 0.15 * night);

  for (const m of ch.pad) padVoice(G, m, t, CHORD_LEN - 0.4, padPeak);
  // Soft sub bass (+ a quiet octave so small speakers hear it).
  tone(G.musicMix, mtof(ch.bass), t, { attack: 0.35, hold: CHORD_LEN - 1.5, peak: 0.07, decay: 1.6 });
  tone(G.musicFilter, mtof(ch.bass + 12), t, { type: 'triangle', attack: 0.05, hold: 0.2, peak: 0.022, decay: 1.4 });
  if (chance(0.5)) tone(G.musicFilter, mtof(ch.bass + 12), t + BEAT * 4.5, { type: 'triangle', attack: 0.05, hold: 0.1, peak: 0.016, decay: 1 });

  // Brushed hats on off-beats (day, not in heavy rain).
  const hatP = 0.55 * (1 - night) * (1 - 0.6 * wet) * (1 - 0.6 * calm);
  for (let i = 0; i < CHORD_BEATS * 2; i++) {
    if (i % 2 === 1 && chance(hatP)) {
      noiseHit(G.musicMix, t + i * EIGHTH + rand(-0.01, 0.015), { type: 'highpass', f: 6500, q: 0.5, attack: 0.012, peak: rand(0.01, 0.018), dur: rand(0.05, 0.1) });
    }
  }
  // Soft shaker on beats 2 and 4 occasionally.
  if (chance(0.35 * (1 - night) * (1 - 0.6 * calm))) {
    for (const b of [2, 6]) noiseHit(G.musicMix, t + b * BEAT, { type: 'bandpass', f: 4200, q: 1.2, attack: 0.03, peak: 0.012, dur: 0.12 });
  }

  // Melody: sparse pentatonic phrases with rests.
  // Calm mode: fewer phrases and fewer notes per phrase, and the felt-piano voice comes in sooner.
  const dark = night > (calm ? 0.45 : 0.6);
  const phraseP = (0.8 - 0.35 * night) * (1 - 0.3 * calm);
  if (chance(phraseP)) {
    let step = Math.floor(rand(0, 4));
    const notes = 2 + Math.floor(rand(0, Math.max(1, 5 - 2 * night - 1.5 * calm)));
    for (let k = 0; k < notes && step < CHORD_BEATS * 2 - 1; k++) {
      melPos += pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
      if (melPos < 2) melPos = 4;
      if (melPos > MEL_NOTES.length - 2) melPos = MEL_NOTES.length - 4;
      let m = MEL_NOTES[melPos];
      // Last note of the phrase lands on a chord tone.
      if (k === notes - 1 && !ch.tones.includes(m % 12)) {
        const up = MEL_NOTES[melPos + 1];
        if (up !== undefined && ch.tones.includes(up % 12)) m = up;
      }
      if (dark) m -= 12;
      const swing = step % 2 === 1 ? EIGHTH * 0.12 : 0;
      kalimba(G, m, t + step * EIGHTH + swing + rand(0, 0.012), rand(0.65, 1), dark);
      // An echo, an octave up and quiet, sometimes.
      if (chance(calm ? 0.08 : 0.18)) kalimba(G, m + 12, t + step * EIGHTH + EIGHTH * 3, 0.3, dark);
      step += pick([1, 2, 2, 2, 3, 4]);
    }
  }

  chordIdx++;
  if (chordIdx >= prog.length) {
    chordIdx = 0;
    if (chance(0.4)) progIdx = Math.floor(Math.random() * PROGS.length);
  }
}

/** Fully faded out for sleep (nothing audible to schedule). */
const sleptOut = (G: Graph): boolean => sleep.asleep && G.ctx.currentTime >= sleep.until;

function schedTick(): void {
  const G = g;
  if (!G || !state.musicOn || state.musicVol <= 0 || G.ctx.state !== 'running' || sleptOut(G)) return;
  const now = G.ctx.currentTime;
  if (nextChord < now) nextChord = now + 0.1;
  while (nextChord < now + 0.6) {
    scheduleChord(G, nextChord);
    nextChord += CHORD_LEN;
  }
}

// ------------------------------------------------------------------ ambience

function bird(G: Graph, t: number): void {
  const ctx = G.ctx;
  const pan = ctx.createStereoPanner();
  pan.pan.value = rand(-0.8, 0.8);
  const vol = gain(ctx, 0.5 + 0.5 * Math.random());
  vol.connect(pan);
  pan.connect(G.ambLevel);
  const s = ctx.createGain();
  s.gain.value = 0.5;
  vol.connect(s);
  s.connect(G.ambVerb);
  const kind = Math.floor(rand(0, 3));
  const base = rand(2400, 3600);
  const n = 2 + Math.floor(rand(0, 4));
  let end = t;
  for (let i = 0; i < n; i++) {
    const at = t + i * (kind === 0 ? 0.11 : kind === 1 ? 0.16 : 0.09);
    const f0 = base * (kind === 1 && i === n - 1 ? 0.8 : 1) * rand(0.97, 1.03);
    const f1 = kind === 0 ? f0 * 1.35 : kind === 1 ? f0 * 0.75 : f0 * 1.15;
    end = tone(vol, f0, at, { peak: 0.012, attack: 0.01, decay: 0.06, glideTo: f1, glideTime: 0.06 });
  }
  setTimeout(() => {
    vol.disconnect();
    pan.disconnect();
    s.disconnect();
  }, (end - ctx.currentTime + 0.5) * 1000);
}

function crickets(G: Graph, t: number, level: number): void {
  const f = rand(4300, 4700);
  const pulses = 3 + Math.floor(rand(0, 2));
  for (let i = 0; i < pulses; i++) tone(G.ambLevel, f, t + i * 0.035, { peak: 0.006 * level, attack: 0.006, decay: 0.018 });
}

function ambTick(): void {
  const G = g;
  if (!G || !state.musicOn || state.ambVol <= 0 || G.ctx.state !== 'running' || sleptOut(G)) return;
  const now = G.ctx.currentTime;
  const day = 1 - env.night;
  const wet = Math.max(env.rain, env.storm);
  if (now >= nextBird) {
    if (day > 0.4 && wet < 0.5 && chance(day)) bird(G, now + 0.05);
    nextBird = now + rand(4, 11);
  }
  if (now >= nextCricket) {
    if (env.night > 0.4) {
      const lvl = env.night * (1 - 0.7 * wet);
      crickets(G, now + 0.05, lvl);
      if (chance(0.5)) crickets(G, now + 0.05 + rand(0.18, 0.3), lvl * 0.6);
    }
    nextCricket = now + rand(0.5, 1.4);
  }
  if (now >= nextCroak) {
    if (env.night > 0.3 && wet < 0.5 && chance(0.4)) SFX.croak(G.ambLevel, now + 0.05, rand(0.9, 1.1));
    nextCroak = now + rand(14, 30);
  }
}

let lastThunder = -1e9;

function thunder(strength: number): void {
  const G = g;
  if (!G || !state.musicOn || state.ambVol <= 0 || sleep.asleep || G.ctx.state !== 'running') return;
  const now = G.ctx.currentTime;
  const calm = state.calm;
  // Calm: skip rumbles that follow closely on another, so storms feel sparser.
  if (calm && now - lastThunder < CALM_THUNDER_GAP) return;
  lastThunder = now;
  const s = Math.max(0.3, Math.min(1, strength)) * (calm ? 0.35 : 1);
  const t = now + rand(0.25, 1.4);
  // Distant, soft rumbles only — no sharp crack. Calm: lower, darker, slower to swell.
  noiseHit(G.ambLevel, t, { type: 'lowpass', f: calm ? 130 : 180, f2: calm ? 50 : 60, q: 0.6, attack: calm ? 1.6 : 0.5, peak: 0.13 * s, dur: calm ? rand(4.5, 6) : rand(3, 4.5) });
  noiseHit(G.ambVerb, t, { type: 'lowpass', f: calm ? 240 : 320, f2: 80, q: 0.6, attack: calm ? 1.2 : 0.3, peak: 0.05 * s, dur: calm ? 3.5 : 2.5 });
}

function applyEnv(G: Graph, tc = 0.8): void {
  const now = G.ctx.currentTime;
  const wet = Math.max(env.rain, env.storm);
  G.musicFilter.frequency.setTargetAtTime((2600 - 1500 * env.night - 500 * wet) * (state.calm ? CALM_MUSIC_FILTER : 1), now, tc);
  // Rain should feel cosy, not loud: keep the music up and the rain low under it.
  G.musicMix.gain.setTargetAtTime(1 - 0.06 * wet - 0.08 * env.night, now, tc);
  G.rainGain.gain.setTargetAtTime(0.018 * env.rain + 0.026 * env.storm, now, tc);
  G.windGain.gain.setTargetAtTime(0.02 * env.storm, now, tc);
  G.waterGain.gain.setTargetAtTime(1 + 0.15 * env.storm - 0.2 * env.rain, now, tc);
}

// ------------------------------------------------------------------ state & lifecycle

const prefs = loadPrefs();
const state = {
  musicOn: prefs.music,
  sfxOn: prefs.sfx,
  musicVol: prefs.musicVol,
  ambVol: prefs.ambVol,
  sfxVol: prefs.sfxVol,
  calm: prefs.calm,
};
/** Sleep timer state. `until` = context time the fade-out ends; `suspended` = we paused the context. */
const sleep = { asleep: false, until: 0, suspended: false, token: 0 };
const lastPlay = new Map<string, number>();
let voices = 0;
const MAX_VOICES = 16;

/** Pushes on/off, volume, calm and asleep into the bus gains. `tc`: music/ambience smoothing. */
function setLevels(G: Graph, tc = FADE, sfxTc = 0.05): void {
  const now = G.ctx.currentTime;
  const mv = state.musicOn ? volCurve(state.musicVol) : 0;
  const av = state.musicOn ? volCurve(state.ambVol) : 0;
  const sv = state.sfxOn && !sleep.asleep ? volCurve(state.sfxVol) * (state.calm ? CALM_SFX : 1) : 0;
  G.musicLevel.gain.setTargetAtTime(MUSIC_LEVEL * mv, now, tc);
  G.musicVerbGate.gain.setTargetAtTime(mv, now, tc);
  G.ambLevel.gain.setTargetAtTime(AMB_LEVEL * av, now, tc);
  G.ambVerb.gain.setTargetAtTime(av, now, tc);
  G.sfxLevel.gain.setTargetAtTime(SFX_LEVEL * sv, now, sfxTc);
  G.verbIn.gain.setTargetAtTime(sv, now, sfxTc);
}

/** Gentle multi-segment ramp of `p` to `to` over `secs`. `ease` shapes 0..1 -> 0..1. */
function rampParam(p: AudioParam, ctx: BaseAudioContext, to: number, secs: number, ease: (x: number) => number): void {
  const now = ctx.currentTime;
  const from = p.value;
  p.cancelScheduledValues(now);
  p.setValueAtTime(from, now);
  const n = Math.max(2, Math.min(48, Math.ceil(secs * 2)));
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    p.linearRampToValueAtTime(from + (to - from) * ease(x), now + secs * x);
  }
}

const easeInOut = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * x); // = sin^2(x*pi/2)

function fadeBed(G: Graph, to: number, secs: number): void {
  rampParam(G.bed.gain, G.ctx, to, secs, easeInOut);
  rampParam(G.bedVerb.gain, G.ctx, to, secs, easeInOut);
}

/** Builds the per-call chain (vol -> [calm lowpass] -> [pan] -> sfxLevel) and starts the sfx. */
function startSfx(G: Graph, s: Sfx, t: number, opts?: PlayOpts): { end: number; nodes: AudioNode[] } {
  const ctx = G.ctx;
  const soft = state.calm && CALM_SOFT.has(s);
  const k = soft ? CALM_ATTN / CALM_SFX : 1; // on top of the bus-wide CALM_SFX
  const vol = gain(ctx, clamp01(opts?.vol ?? 1) * k);
  const nodes: AudioNode[] = [vol];
  let tail: AudioNode = vol;
  if (soft) {
    const lp = filter(ctx, 'lowpass', CALM_LP, 0.5);
    tail.connect(lp);
    tail = lp;
    nodes.push(lp);
  }
  if (opts?.pan) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
    tail.connect(pan);
    tail = pan;
    nodes.push(pan);
  }
  tail.connect(G.sfxLevel);
  let send: GainNode | null = null;
  if (soft) {
    send = gain(ctx, k);
    send.connect(G.verbIn);
    nodes.push(send);
  }
  let end = t + 1;
  sendDest = send;
  try {
    end = SFX[s](vol, t, Math.max(0.25, Math.min(4, opts?.pitch ?? 1)));
  } catch {
    /* ignore */
  } finally {
    sendDest = null;
  }
  return { end, nodes };
}

function ensureTimers(): void {
  if (!schedTimer) schedTimer = setInterval(schedTick, 100);
  if (!ambTimer) ambTimer = setInterval(ambTick, 250);
}

function unlockImpl(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!g) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor({ latencyHint: 'playback' });
      g = build(ctx);
      if (sleep.asleep) {
        g.bed.gain.value = 0;
        g.bedVerb.gain.value = 0;
      }
      applyEnv(g, 0.01);
      setLevels(g);
      ensureTimers();
    }
    if (g.ctx.state === 'suspended' && !document.hidden && !sleep.suspended) void g.ctx.resume().then(() => schedTick());
  } catch {
    /* audio unavailable */
  }
}

if (typeof window !== 'undefined') {
  const onGesture = (): void => unlockImpl();
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  window.addEventListener('touchend', onGesture, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!g) return;
    if (document.hidden) void g.ctx.suspend();
    else if (!sleep.suspended) void g.ctx.resume();
  });
}

let attached: Scene | null = null;

export const audio: AudioApi = {
  unlock() {
    unlockImpl();
  },
  play(s, opts) {
    const G = g;
    if (!G || !state.sfxOn || state.sfxVol <= 0 || sleep.asleep || G.ctx.state !== 'running') return;
    const fn = SFX[s];
    if (!fn) return;
    const nowMs = performance.now();
    const last = lastPlay.get(s) ?? -1e9;
    if (nowMs - last < 40) return;
    if (voices >= MAX_VOICES) return;
    lastPlay.set(s, nowMs);
    const ctx = G.ctx;
    const { end, nodes } = startSfx(G, s, ctx.currentTime + 0.01, opts);
    voices++;
    setTimeout(
      () => {
        voices--;
        for (const n of nodes) n.disconnect();
      },
      Math.max(100, (end - ctx.currentTime + 0.3) * 1000),
    );
  },
  attach(scene) {
    if (attached === scene) return;
    attached = scene;
    const read = (): void => {
      const sc = attached;
      if (!sc) return;
      const k = 0.35; // smoothing per 0.5 s step
      const night = clamp01(sc.light?.night ?? 0);
      const w = sc.weatherPreset;
      env.night += (night - env.night) * k;
      env.rain += ((w === 'rain' ? 1 : 0) - env.rain) * k;
      env.storm += ((w === 'storm' ? 1 : 0) - env.storm) * k;
      env.fog += ((w === 'fog' ? 1 : 0) - env.fog) * k;
      if (g) applyEnv(g);
    };
    // Snap to the current state, then follow it.
    const sc0 = scene;
    env.night = clamp01(sc0.light?.night ?? 0);
    env.rain = sc0.weatherPreset === 'rain' ? 1 : 0;
    env.storm = sc0.weatherPreset === 'storm' ? 1 : 0;
    setInterval(read, 500);
    scene.on('lightning', (d) => thunder(typeof d === 'number' ? d : 1));
    scene.on('reeds:tap', () => {
      const G = g;
      if (!G || !state.sfxOn || state.sfxVol <= 0 || sleep.asleep || G.ctx.state !== 'running') return;
      const nowMs = performance.now();
      if (nowMs - (lastPlay.get('rustle') ?? -1e9) < 120) return;
      lastPlay.set('rustle', nowMs);
      SFX.rustle(G.sfxLevel, G.ctx.currentTime + 0.01, rand(0.9, 1.1));
    });
  },
  get musicOn() {
    return state.musicOn;
  },
  set musicOn(v: boolean) {
    this.setMusic(v);
  },
  get sfxOn() {
    return state.sfxOn;
  },
  set sfxOn(v: boolean) {
    this.setSfx(v);
  },
  setMusic(on) {
    state.musicOn = on;
    savePrefs();
    if (g) {
      setLevels(g);
      if (on) {
        nextChord = 0;
        schedTick();
      }
    }
  },
  setSfx(on) {
    state.sfxOn = on;
    savePrefs();
    if (g) setLevels(g);
  },
  get musicVolume() {
    return state.musicVol;
  },
  set musicVolume(v: number) {
    this.setMusicVolume(v);
  },
  get ambienceVolume() {
    return state.ambVol;
  },
  set ambienceVolume(v: number) {
    this.setAmbienceVolume(v);
  },
  get sfxVolume() {
    return state.sfxVol;
  },
  set sfxVolume(v: number) {
    this.setSfxVolume(v);
  },
  setMusicVolume(v) {
    setVolume('musicVol', v);
  },
  setAmbienceVolume(v) {
    setVolume('ambVol', v);
  },
  setSfxVolume(v) {
    setVolume('sfxVol', v);
  },
  get calm() {
    return state.calm;
  },
  set calm(v: boolean) {
    this.setCalm(v);
  },
  setCalm(on) {
    state.calm = !!on;
    savePrefs();
    if (g) {
      setLevels(g, VOL_TC * 4, VOL_TC * 4);
      applyEnv(g);
    }
  },
  get asleep() {
    return sleep.asleep;
  },
  fadeOutForSleep(seconds = 20) {
    const secs = Number.isFinite(seconds) ? Math.max(0.05, seconds) : 20;
    sleep.asleep = true;
    const tok = ++sleep.token;
    const G = g;
    if (!G) {
      sleep.until = 0;
      return;
    }
    sleep.until = G.ctx.currentTime + secs;
    setLevels(G); // mutes sfx
    fadeBed(G, 0, secs);
    // Once fully silent, pause the audio context to save battery (wakeFromSleep resumes it).
    setTimeout(
      () => {
        if (!sleep.asleep || sleep.token !== tok || g !== G) return;
        sleep.suspended = true;
        void G.ctx.suspend().catch(() => undefined);
      },
      (secs + 0.5) * 1000,
    );
  },
  wakeFromSleep() {
    if (!sleep.asleep) return;
    sleep.asleep = false;
    sleep.suspended = false;
    sleep.token++;
    const G = g;
    if (!G) return;
    fadeBed(G, 1, WAKE_TIME);
    setLevels(G);
    // A stale nextChord (scheduling paused while silent) is reset by schedTick itself.
    if (G.ctx.state === 'suspended' && !document.hidden) {
      void G.ctx
        .resume()
        .then(() => schedTick())
        .catch(() => undefined);
    } else schedTick();
  },
};

function setVolume(key: 'musicVol' | 'ambVol' | 'sfxVol', v: number): void {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  const was = state[key];
  state[key] = clamp01(n);
  savePrefs();
  if (!g) return;
  setLevels(g, VOL_TC, VOL_TC);
  // Coming back up from 0: scheduling was skipped while silent, so restart it now.
  if (was <= 0 && state[key] > 0 && key === 'musicVol') schedTick();
}

// Dev hook for testing in the console / Playwright.
/** Dev: renders `sec` seconds of music+ambience (and optionally one sfx) offline; returns the peak. */
async function probe(sec: number, sfx?: Sfx, night = 0, weather = 'clear'): Promise<number> {
  const off = new OfflineAudioContext(2, Math.floor(44100 * sec), 44100);
  // Uses the current volumes, calm and asleep state, so it reflects what the player would hear.
  const saved = { g, musicOn: state.musicOn, sfxOn: state.sfxOn, env: { ...env }, nextChord, chordIdx };
  try {
    g = build(off as unknown as AudioContext);
    if (sleep.asleep) {
      g.bed.gain.value = 0;
      g.bedVerb.gain.value = 0;
    }
    state.musicOn = !sfx;
    state.sfxOn = !!sfx;
    env.night = night;
    env.rain = weather === 'rain' ? 1 : 0;
    env.storm = weather === 'storm' ? 1 : 0;
    applyEnv(g, 0.01);
    setLevels(g, FADE, 0.002);
    if (sfx) startSfx(g, sfx, 0.01);
    else for (let t = 0; t < sec; t += CHORD_LEN) scheduleChord(g, t);
  } finally {
    g = saved.g;
    state.musicOn = saved.musicOn;
    state.sfxOn = saved.sfxOn;
    Object.assign(env, saved.env);
    nextChord = saved.nextChord;
    chordIdx = saved.chordIdx;
  }
  const buf = await off.startRendering();
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  return peak;
}

if (TEST_SHORTCUTS && typeof window !== 'undefined') (window as unknown as { __audio?: unknown }).__audio = { audio, ctx: () => g?.ctx, probe };
