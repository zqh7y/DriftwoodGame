// Upgrades bought with bones. Each has a level, a cost that grows per level, and an effect.
// Balance lives here: tweak the numbers in DEFS.

export type UpgradeId = 'speed' | 'value' | 'luck' | 'hook' | 'depth' | 'afk';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** One short line: what it does. */
  blurb: string;
  max: number;
  baseCost: number;
  growth: number;
  /** The upgrade's effect at a level, formatted for the card ("8.0s", "x1.18", "Bronze"). */
  show: (level: number) => string;
}

export const HOOKS = ['Rusty', 'Bronze', 'Silver', 'Gold', 'Crystal', 'Ruby', 'Moon', 'Star'] as const;

/** Catch time in seconds. */
export const catchTime = (lv: number): number => Math.max(1.2, 8 * Math.pow(0.92, lv));
/** Bones multiplier from Fish value. */
export const valueMult = (lv: number): number => 1 + 0.2 * lv;
/** Luck multiplier (rank i of the 12 fish weighs luck^(i * LUCK_EXP), see fish.ts). */
export const luckMult = (lv: number): number => 1 + 0.08 * lv;
/** Hook: chance a bite brings two fish, and a value bonus. */
export const hookDouble = (lv: number): number => Math.min(0.5, 0.05 * lv);
export const hookBonus = (lv: number): number => 1 + 0.1 * lv;
/** Depth in meters, level by level, down to the 8000 m abyss. */
export const DEPTHS = [1, 2, 3, 5, 8, 12, 18, 25, 35, 50, 70, 100, 140, 200, 280, 400, 550, 750, 1000, 1400, 2000, 2800, 4000, 5600, 8000] as const;
export const depthM = (lv: number): number => DEPTHS[Math.min(DEPTHS.length - 1, Math.max(0, lv))];
/** "Deep": deeper water lifts the six rarest fish (x1 at 1 m … x2.56 at 8000 m). */
export const deepMult = (lv: number): number => 1 + 0.4 * Math.log10(depthM(lv));
/** While you're away the cat fishes at a relaxed pace: this share of the normal catch rate. */
export const AFK_RATE = 0.25;
/** How long the cat keeps fishing while you're away, in seconds. */
export const afkSeconds = (lv: number): number => (30 + 20 * lv) * 60;

export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export const DEFS: readonly UpgradeDef[] = [
  { id: 'speed', name: 'Fishing speed', blurb: 'Every catch takes less time', max: 30, baseCost: 8, growth: 1.7, show: (l) => `${catchTime(l).toFixed(1)}s` },
  { id: 'value', name: 'Fish value', blurb: 'Every fish sells for more bones, including the ones already in your inventory', max: 50, baseCost: 12, growth: 1.55, show: (l) => `x${valueMult(l).toFixed(1)}` },
  { id: 'luck', name: 'Luck', blurb: 'Every rarer fish bites more often; the rarest gain the most', max: 40, baseCost: 20, growth: 1.75, show: (l) => `x${luckMult(l).toFixed(2)}` },
  { id: 'hook', name: 'Better hook', blurb: 'A chance to land two fish at once, and a bonus on every sale', max: HOOKS.length - 1, baseCost: 60, growth: 3.6, show: (l) => `${HOOKS[l]} ${Math.round(hookDouble(l) * 100)}%` },
  { id: 'depth', name: 'Depth', blurb: 'Cast deeper: lifts the chances of the six rarest fish', max: DEPTHS.length - 1, baseCost: 50, growth: 2.6, show: (l) => `${depthM(l)} m · x${deepMult(l).toFixed(2)}` },
  { id: 'afk', name: 'AFK time', blurb: 'How long your cat keeps fishing while you are away (at a relaxed quarter pace)', max: 34, baseCost: 30, growth: 1.9, show: (l) => formatDuration(afkSeconds(l)) },
];

export const defById = (id: UpgradeId): UpgradeDef => DEFS.find((d) => d.id === id)!;

export const costAt = (d: UpgradeDef, level: number): number => Math.ceil(d.baseCost * Math.pow(d.growth, level));
