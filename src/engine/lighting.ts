// Time-of-day + weather → one LightState that every layer reads.
//
// tod is the fraction of a day: 0 = midnight, 0.25 = 06:00, 0.5 = noon, 0.75 = 18:00.
// The "day" preset (0.615, about 14:45) reproduces the reference picture: a bright blue sky
// and the sun high on the right. Layers never hard-code sky colors; they read them from here.

import { gradient, mix, lum, type RGB } from './color';
import { bump, clamp, smoothstep } from './math';

export interface WeatherState {
  /** Cloud cover 0..1 (0.35 = a few fair-weather clouds, 1 = full overcast). */
  cloud: number;
  /** Rain intensity 0..1. */
  rain: number;
  /** Storm intensity 0..1 (lightning, gusts, darker sky). */
  storm: number;
  /** Fog density 0..1. */
  fog: number;
  /** Wind strength 0..1, always blowing toward +x (right). */
  wind: number;
}

export type WeatherPreset = 'clear' | 'rain' | 'storm' | 'fog';

export const WEATHER_PRESETS: Record<WeatherPreset, WeatherState> = {
  clear: { cloud: 0.35, rain: 0, storm: 0, fog: 0, wind: 0.25 },
  rain: { cloud: 0.9, rain: 0.75, storm: 0, fog: 0.15, wind: 0.45 },
  storm: { cloud: 1, rain: 1, storm: 1, fog: 0.1, wind: 0.9 },
  fog: { cloud: 0.55, rain: 0, storm: 0, fog: 1, wind: 0.08 },
};

export type TodPreset = 'dawn' | 'day' | 'sunset' | 'night';

export const TOD_PRESETS: Record<TodPreset, number> = {
  dawn: 0.262,
  day: 0.615,
  sunset: 0.738,
  night: 0.94,
};

/** Sun rises / sets at these tod values. */
export const SUNRISE = 0.235;
export const SUNSET = 0.765;

export interface CelestialPos {
  x: number;
  y: number;
  /** -1..1, > 0 means above the horizon. */
  alt: number;
  visible: boolean;
}

export interface LightState {
  tod: number;
  /** Sky gradient stops: zenith, middle, horizon. */
  skyTop: RGB;
  skyMid: RGB;
  skyBot: RGB;
  /** Per-channel multiplier applied to daytime colors (1,1,1 during the day). */
  amb: RGB;
  /** Additive lift (0–255) so night shadows stay blue instead of black. */
  lift: RGB;
  /** Atmospheric haze color that distant things fade toward. */
  haze: RGB;
  /** Haze strength multiplier for depth (rises with fog). */
  hazeK: number;
  /** 0..1 desaturation from overcast skies. */
  desat: number;
  /** Sun disc color right now. */
  sunCol: RGB;
  /** Cloud colors right now: sunlit side and shadow side. */
  cloudLit: RGB;
  cloudShade: RGB;
  /** Star visibility 0..1 (already reduced by clouds and fog). */
  stars: number;
  /** 0 = deep night, 1 = full day. */
  daylight: number;
  /** 1 - daylight, convenient for emissive lights. */
  night: number;
  /** 0..1 strength of sunrise/sunset warmth. */
  golden: number;
  /** Lightning flash 0..1. */
  flash: number;
  sun: CelestialPos;
  moon: CelestialPos;
  /** Changes whenever the grade changes; caches key off this. */
  key: number;
}

interface Key {
  t: number;
  top: string;
  mid: string;
  bot: string;
  amb: RGB;
  lift: RGB;
  sun: string;
  cloudLit: string;
  cloudShade: string;
  stars: number;
  daylight: number;
}

const NIGHT: Omit<Key, 't'> = {
  top: '#101840',
  mid: '#1d2a62',
  bot: '#34467f',
  amb: [0.42, 0.48, 0.76],
  lift: [4, 8, 22],
  sun: '#ffd27a',
  cloudLit: '#4a5a92',
  cloudShade: '#2a3568',
  stars: 1,
  daylight: 0,
};

const DAY: Omit<Key, 't'> = {
  top: '#85c9f1',
  mid: '#a5daf9',
  bot: '#bfe4fb',
  amb: [1, 1, 1],
  lift: [0, 0, 0],
  sun: '#fef7c0',
  cloudLit: '#ffffff',
  cloudShade: '#dcf0fb',
  stars: 0,
  daylight: 1,
};

const KEYS: Key[] = [
  { t: 0.0, ...NIGHT },
  { t: 0.19, ...NIGHT },
  { t: 0.225, top: '#27306b', mid: '#5e4f8f', bot: '#c087a3', amb: [0.6, 0.55, 0.78], lift: [8, 6, 18], sun: '#ffab73', cloudLit: '#b88aaf', cloudShade: '#5b4d86', stars: 0.5, daylight: 0.15 },
  { t: 0.262, top: '#6d8fd6', mid: '#f4a7b5', bot: '#ffd9a0', amb: [1.0, 0.86, 0.78], lift: [8, 3, 8], sun: '#ffd08a', cloudLit: '#ffe2c4', cloudShade: '#e6a8bd', stars: 0.05, daylight: 0.6 },
  { t: 0.32, top: '#7cc3ef', mid: '#a9dcf8', bot: '#d2eefb', amb: [1.0, 0.98, 0.95], lift: [2, 2, 3], sun: '#fff3c4', cloudLit: '#ffffff', cloudShade: '#dbeefa', stars: 0, daylight: 0.95 },
  { t: 0.38, ...DAY },
  { t: 0.67, ...DAY },
  { t: 0.738, top: '#5a6fc4', mid: '#f08fa3', bot: '#ffc685', amb: [1.0, 0.8, 0.7], lift: [10, 2, 8], sun: '#ffb070', cloudLit: '#ffd0b0', cloudShade: '#d98aa6', stars: 0.05, daylight: 0.55 },
  { t: 0.778, top: '#2c3577', mid: '#7a5a9e', bot: '#e08a8f', amb: [0.66, 0.56, 0.78], lift: [10, 5, 18], sun: '#ff8a5a', cloudLit: '#c78aa6', cloudShade: '#5a4a86', stars: 0.4, daylight: 0.18 },
  { t: 0.82, ...NIGHT },
  { t: 1.0, ...NIGHT },
];

function sampleKeys(tod: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= tod) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const f = smoothstep(0, 1, (tod - a.t) / (b.t - a.t || 1));
  const m3 = (x: RGB, y: RGB): RGB => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
  return {
    top: mix(a.top, b.top, f),
    mid: mix(a.mid, b.mid, f),
    bot: mix(a.bot, b.bot, f),
    amb: m3(a.amb, b.amb),
    lift: m3(a.lift, b.lift),
    sun: mix(a.sun, b.sun, f),
    cloudLit: mix(a.cloudLit, b.cloudLit, f),
    cloudShade: mix(a.cloudShade, b.cloudShade, f),
    stars: a.stars + (b.stars - a.stars) * f,
    daylight: a.daylight + (b.daylight - a.daylight) * f,
  };
}

function gray(c: RGB, k: number): RGB {
  const l = lum(c) * k;
  return [l * 0.97, l * 0.99, l * 1.04];
}

export interface SunArc {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function celestial(frac: number, arc: SunArc): CelestialPos {
  const a = frac * Math.PI;
  const alt = Math.sin(a);
  return {
    x: arc.cx - Math.cos(a) * arc.rx,
    y: arc.cy - alt * arc.ry,
    alt,
    visible: alt > -0.12,
  };
}

/** Compute the lighting for this frame. Pure function of its inputs. */
export function computeLight(tod: number, w: WeatherState, flash: number, arc: SunArc): LightState {
  const k = sampleKeys(((tod % 1) + 1) % 1);
  const overcast = smoothstep(0.5, 1.0, w.cloud);
  const storm = w.storm;
  const fog = w.fog;

  // Overcast skies fold toward a gray of their own brightness; storms darken further.
  const ovK = overcast * 0.78;
  const gk = 0.95 - 0.38 * storm;
  const skyTop = mix(k.top, gray(k.top, gk * 1.05), ovK);
  const skyMid = mix(k.mid, gray(k.mid, gk), ovK);
  let skyBot = mix(k.bot, gray(k.bot, gk * 0.98), ovK);

  const dim = 1 - 0.14 * overcast - 0.22 * storm;
  const amb: RGB = [k.amb[0] * dim, k.amb[1] * dim, k.amb[2] * (dim + 0.04 * overcast)];
  const desat = clamp(0.3 * overcast + 0.16 * storm, 0, 0.6);

  // Fog color: a pale version of the horizon by day, deep blue at night.
  const fogCol = mix(skyBot, [amb[0] * 214, amb[1] * 222, amb[2] * 230], 0.55);
  skyBot = mix(skyBot, fogCol, fog * 0.6);
  const haze = mix(skyBot, fogCol, fog * 0.7);
  const hazeK = 0.5 + 0.42 * fog;

  const cloudLit = mix(k.cloudLit, gray(k.cloudLit, 0.86 - 0.3 * storm), overcast * 0.85);
  const cloudShade = mix(k.cloudShade, gray(k.cloudShade, 0.8 - 0.3 * storm), overcast * 0.85);

  const dayFrac = (tod - SUNRISE) / (SUNSET - SUNRISE);
  let moonT = tod + 0.5;
  if (moonT >= 1) moonT -= 1;
  const moonFrac = (moonT - SUNRISE) / (SUNSET - SUNRISE);

  const golden = Math.max(bump(tod, 0.262, 0.05), bump(tod, 0.738, 0.05)) * (1 - overcast * 0.85);
  const stars = clamp(k.stars * (1 - overcast * 0.95) * (1 - fog * 0.7), 0, 1);

  const light: LightState = {
    tod,
    skyTop,
    skyMid,
    skyBot,
    amb,
    lift: k.lift,
    haze,
    hazeK,
    desat,
    sunCol: k.sun,
    cloudLit,
    cloudShade,
    stars,
    daylight: k.daylight,
    night: 1 - k.daylight,
    golden,
    flash,
    sun: celestial(dayFrac, arc),
    moon: celestial(moonFrac, arc),
    key: 0,
  };
  light.key =
    Math.round(tod * 1440) * 1e7 +
    Math.round(w.cloud * 20) * 4e5 +
    Math.round(w.storm * 20) * 2e4 +
    Math.round(fog * 20) * 1e3 +
    Math.round(w.rain * 10) * 40 +
    Math.round(flash * 12);
  return light;
}

/** Grade a daytime color for the current light. depth 0 = foreground, 1 = far horizon haze. */
export function gradeRGB(L: LightState, c: RGB, depth: number): RGB {
  let r = c[0] * L.amb[0] + L.lift[0];
  let g = c[1] * L.amb[1] + L.lift[1];
  let b = c[2] * L.amb[2] + L.lift[2];
  if (L.desat > 0) {
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r += (l - r) * L.desat;
    g += (l - g) * L.desat;
    b += (l - b) * L.desat;
  }
  if (depth > 0) {
    const h = Math.min(0.97, depth * L.hazeK);
    r += (L.haze[0] - r) * h;
    g += (L.haze[1] - g) * h;
    b += (L.haze[2] - b) * h;
  }
  if (L.flash > 0) {
    const f = L.flash * 0.5;
    r += (235 - r) * f;
    g += (240 - g) * f;
    b += (255 - b) * f;
  }
  return [r < 0 ? 0 : r > 255 ? 255 : Math.round(r), g < 0 ? 0 : g > 255 ? 255 : Math.round(g), b < 0 ? 0 : b > 255 ? 255 : Math.round(b)];
}

/** Sample the current sky gradient at a normalized height (0 = zenith, 1 = horizon). */
export function skyAt(L: LightState, v: number): RGB {
  if (v < 0.55) return gradient([L.skyTop, L.skyMid], v / 0.55);
  return gradient([L.skyMid, L.skyBot], (v - 0.55) / 0.45);
}

/** HH:MM for a tod value. */
export function clockText(tod: number): string {
  const mins = Math.floor((((tod % 1) + 1) % 1) * 1440);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
