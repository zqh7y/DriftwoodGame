// Aquarium balance: fish you keep in the tank earn bones over time instead of being sold.
//
// A fish in the tank earns TANK_RATE of its sale price every minute (it pays back its price in
// about 100 minutes and keeps earning after), boosted by decorations. The tank starts with 3 slots
// and grows to 12; slots and decorations are bought with bones. While you're away it keeps earning
// at the same relaxed quarter pace as AFK fishing, for as long as your AFK time.
// Tuned with a simulation (10 min a day, 8 h away): everything maxes in ~7 months with the tank
// (vs over a year without), so the tank clearly helps without breaking the long-term goal.

import type { DecorId } from '../aquarium/tank';

/** Share of a fish's sale price it earns per minute in the tank. */
export const TANK_RATE = 0.01;
/** Feeding: fed fish are happy and earn this much more for FEED_TIME seconds; you can feed again
 *  after FEED_COOLDOWN seconds (the food still falls before that, just without the bonus). */
export const FEED_BONUS = 0.1;
export const FEED_TIME = 60;
export const FEED_COOLDOWN = 90;
export const START_SLOTS = 3;
export const MAX_SLOTS = 12;
/** Price of the next slot when you have `slots`. */
export const slotCost = (slots: number): number => Math.ceil(150 * Math.pow(4, slots - START_SLOTS));

export interface DecorDef {
  id: DecorId;
  name: string;
  cost: number;
  /** Extra tank income, e.g. 0.05 = +5%. */
  bonus: number;
}

/** Cheapest first. Bonuses add up (all nine: +93%). */
export const DECOR: readonly DecorDef[] = [
  { id: 'kelp', name: 'Kelp garden', cost: 50, bonus: 0.05 },
  { id: 'shell', name: 'Pink shell', cost: 150, bonus: 0.05 },
  { id: 'coral', name: 'Coral reef', cost: 500, bonus: 0.08 },
  { id: 'lantern', name: 'Sea lantern', cost: 1500, bonus: 0.08 },
  { id: 'bubbler', name: 'Bubble stone', cost: 5000, bonus: 0.1 },
  { id: 'house', name: 'Fish house', cost: 15_000, bonus: 0.1 },
  { id: 'mushrooms', name: 'Glow mushrooms', cost: 50_000, bonus: 0.12 },
  { id: 'chest', name: 'Treasure chest', cost: 150_000, bonus: 0.15 },
  { id: 'castle', name: 'Sand castle', cost: 500_000, bonus: 0.2 },
];

export const decorById = (id: string): DecorDef | undefined => DECOR.find((d) => d.id === id);
