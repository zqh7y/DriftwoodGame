// The lake's 12 fish, from the everyday Carp to the Abyss Leviathan.
// Base chances (before luck): 50%, 23%, 12.5% … 0.1%, 0.04%, 0.01%, then 0.0001% (shown as "???")
// and 0.00001% (shown as shifting symbols). Classes, weakest to rarest: E, D, C, B, A, S, SSS.
//
// Luck lifts every fish above the first: rank i gets luck^(i * LUCK_EXP), so the rarer the fish,
// the more luck helps. Depth ("Deep") adds a second lift to the deep-water half (ranks 6+).
// Bad weather multiplies luck for as long as it lasts (see game.ts).

import { C } from '../engine';
import type { Rng } from '../engine';

export type Rarity = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'SSS';
export type FishShape = 'carp' | 'slim' | 'round' | 'long' | 'eel' | 'cat' | 'koi' | 'sturgeon' | 'shark' | 'ray' | 'angler' | 'whale';
export type FishPattern = 'plain' | 'stripes' | 'spots' | 'scales';
/** One-off finishes for the rare fish (see fishart.ts). */
export type FishSpecial = 'gold' | 'crystal' | 'ancient' | 'cosmic';

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** 0 = most common … 11 = rarest. */
  rank: number;
  /** Base chance (0..1) before luck. */
  base: number;
  /** How the chance is shown: a number, "???", or shifting symbols. */
  reveal: 'number' | 'hidden' | 'glitch';
  /** Base value in bones before upgrades. */
  bones: number;
  /** Color ramp (dark → light) used to draw it. */
  ramp: readonly string[];
  /** Size of the in-game sprite relative to a standard fish. */
  size: number;
  shape: FishShape;
  pattern: FishPattern;
  sparkle: boolean;
  glow: boolean;
  special?: FishSpecial;
  boot?: boolean;
}

export const RARITY_ORDER: readonly Rarity[] = ['E', 'D', 'C', 'B', 'A', 'S', 'SSS'];

type Row = Omit<Species, 'id' | 'rank' | 'reveal' | 'size' | 'sparkle' | 'glow'> & { fx?: 'sparkle' | 'glow' | 'both'; size?: number };

/** Most common first. Chances add up to 100%. */
const ROWS: Row[] = [
  { name: 'Carp', rarity: 'E', base: 0.5, bones: 1, ramp: C.yellow, shape: 'carp', pattern: 'scales', size: 0.92 },
  { name: 'Perch', rarity: 'E', base: 0.23, bones: 2, ramp: C.green, shape: 'carp', pattern: 'stripes', size: 0.95 },
  { name: 'Bass', rarity: 'D', base: 0.125, bones: 4, ramp: C.teal, shape: 'carp', pattern: 'spots', size: 1 },
  { name: 'Rainbow Trout', rarity: 'D', base: 0.073, bones: 8, ramp: C.pink, shape: 'slim', pattern: 'spots', size: 1.02 },
  { name: 'Catfish', rarity: 'C', base: 0.042, bones: 15, ramp: C.brown, shape: 'cat', pattern: 'plain', size: 1.08 },
  { name: 'Pike', rarity: 'C', base: 0.021, bones: 30, ramp: C.green, shape: 'long', pattern: 'spots', size: 1.1 },
  { name: 'Salmon', rarity: 'B', base: 0.0074989, bones: 70, ramp: C.red, shape: 'carp', pattern: 'scales', size: 1.14 },
  { name: 'Sturgeon', rarity: 'A', base: 0.001, bones: 250, ramp: C.blue, shape: 'sturgeon', pattern: 'scales', size: 1.2 },
  { name: 'Golden Koi', rarity: 'A', base: 0.0004, bones: 1200, ramp: C.yellow, shape: 'koi', pattern: 'spots', fx: 'sparkle', special: 'gold', size: 1.22 },
  { name: 'Crystal Moonfish', rarity: 'S', base: 0.0001, bones: 5000, ramp: C.teal, shape: 'round', pattern: 'spots', fx: 'both', special: 'crystal', size: 1.28 },
  { name: 'Ancient Megalodon', rarity: 'SSS', base: 0.000001, bones: 250_000, ramp: C.gray, shape: 'shark', pattern: 'scales', fx: 'glow', special: 'ancient', size: 1.38 },
  { name: 'Abyss Leviathan', rarity: 'SSS', base: 0.0000001, bones: 5_000_000, ramp: C.purple, shape: 'whale', pattern: 'spots', fx: 'both', special: 'cosmic', size: 1.45 },
];

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export const SPECIES: readonly Species[] = ROWS.map(({ fx, size = 1, ...r }, i) => ({
  ...r,
  id: slug(r.name),
  rank: i,
  reveal: i === 10 ? 'hidden' : i === 11 ? 'glitch' : 'number',
  size,
  sparkle: fx === 'sparkle' || fx === 'both' || r.rarity === 'SSS',
  glow: fx === 'glow' || fx === 'both',
}));

const BY_ID = new Map(SPECIES.map((sp) => [sp.id, sp]));
export const speciesById = (id: string): Species | undefined => BY_ID.get(id);

/** How strongly luck lifts each rank (rank i gets luck^(i * LUCK_EXP)). */
export const LUCK_EXP = 0.2;
/** How strongly "Deep" lifts the deep-water fish (rank i ≥ 6 gets deep^((i - 5) * DEEP_EXP)). */
export const DEEP_EXP = 0.25;

/** Bite odds for every species at this luck and deep multiplier (sums to 1). */
export function odds(luck: number, deep = 1): Map<string, number> {
  const weights = new Map<string, number>();
  let total = 0;
  for (const sp of SPECIES) {
    let w = sp.base * Math.pow(Math.max(1, luck), sp.rank * LUCK_EXP);
    if (sp.rank >= 6) w *= Math.pow(Math.max(1, deep), (sp.rank - 5) * DEEP_EXP);
    weights.set(sp.id, w);
    total += w;
  }
  for (const [id, w] of weights) weights.set(id, w / total);
  return weights;
}

/** Roll one bite. */
let cache: { key: string; o: Map<string, number> } | null = null;
export function rollSpecies(rng: Rng, luck: number, deep = 1): Species {
  // Odds only change with luck or deep, so reuse them between rolls (AFK can roll thousands).
  const key = `${luck}|${deep}`;
  if (cache?.key !== key) cache = { key, o: odds(luck, deep) };
  let r = rng.next();
  for (const sp of SPECIES) {
    const p = cache.o.get(sp.id) ?? 0;
    if (r < p) return sp;
    r -= p;
  }
  return SPECIES[0];
}

/** Old 70-fish saves: map a retired species id onto the new fish of the same class. */
const OLD_CLASS: Record<string, Rarity> = {};
for (const [r, names] of [
  ['E', 'minnow bluegill roach crappie rudd dace bream sunfish'],
  ['D', 'trout tench chub walleye shad whitefish grayling zander burbot smelt'],
  ['C', 'eel koi gar bowfin muskie char barbel ide rainbow-trout'],
  ['B', 'paddlefish snakehead tiger-fish arowana golden-perch lungfish electric-eel arapaima mahseer taimen piranha-king'],
  ['A', 'alligator-gar mekong-catfish golden-carp coelacanth ghost-koi anglerfish oarfish gulper-eel viperfish frilled-shark'],
  ['S', 'goblin-shark sixgill-shark black-dragonfish crystal-pike moonfish thunder-barracuda frost-sturgeon lava-eel starlight-ray'],
  ['SSS', 'celestial-koi ancient-megalodon kraken-eel void-whale elder-sea-dragon abyss-leviathan'],
] as Array<[Rarity, string]>)
  for (const n of names.split(' ')) OLD_CLASS[n] = r;
export function migrateId(id: string): string | undefined {
  if (BY_ID.has(id)) return id;
  const r = OLD_CLASS[id];
  if (!r) return undefined;
  return SPECIES.find((sp) => sp.rarity === r)?.id;
}
