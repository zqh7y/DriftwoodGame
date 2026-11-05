// The game: bones, upgrade levels, the inventory, the catch timer and AFK progress.
//
// Flow: the catch timer fills over catchTime() seconds → a fish bites (rolled from luck, Deep and the weather) →
// the fisher animation reels it in → it goes into the inventory, where fish of the same kind stack.
// Selling fish from the inventory turns them into bones at today's prices (Fish value and the hook
// bonus apply at sale time, so upgrading value also raises what you already hold).
// Away from the game the cat keeps fishing for up to afk() seconds.

import { makeRng, type Rng, type Scene } from '../engine';
import { migrateId, rollSpecies, speciesById, type Species } from './fish';
import { DECOR, decorById, FEED_BONUS, FEED_COOLDOWN, FEED_TIME, MAX_SLOTS, slotCost, START_SLOTS, TANK_RATE } from './aquarium';
import type { DecorId } from '../aquarium/tank';
import type { WeatherPreset } from '../engine';
import {
  AFK_RATE,
  afkSeconds,
  catchTime,
  costAt,
  defById,
  deepMult,
  depthM,
  hookBonus,
  hookDouble,
  luckMult,
  valueMult,
  DEFS,
  type UpgradeId,
} from './upgrades';

export interface SaveData {
  v: 2;
  bones: number;
  levels: Record<UpgradeId, number>;
  /** Fish held, by species id → how many. */
  inv: Record<string, number>;
  /** Wall-clock ms of the last save (for AFK progress). */
  lastSeen: number;
  totalCaught: number;
  totalBones: number;
  /** Species ids caught at least once. */
  seen: string[];
  /** Aquarium: species ids of the fish in the tank, slot by slot. */
  tank: string[];
  tankSlots: number;
  /** Decorations bought for the tank. */
  decor: DecorId[];
}

export interface FishLook {
  ramp: readonly string[];
  size: number;
  sparkle: boolean;
  boot: boolean;
}

export interface Hooked {
  species: Species;
  count: number;
  /** What one of these sells for right now. */
  bones: number;
  look: FishLook;
}

/** What the fisher animation reads from the game, via s.shared.fishing. */
export interface FishingApi {
  /** Speed-up for the cast/reel animations so a whole cycle fits in the catch time. */
  animScale(): number;
  /** Polled while the bobber waits: returns the fish once the catch timer completes. */
  takeBite(): Hooked | null;
  /** The catch landed (the fish goes into the inventory). */
  landed(h: Hooked): void;
  /** Looks of the last few catches (tails poking out of the bucket prop), oldest first. */
  bucketLooks(): FishLook[];
}

export interface OfflineReport {
  /** Real time away, and how much of it the cat fished (capped by AFK time). */
  away: number;
  seconds: number;
  fish: number;
  /** What the fish caught while away sell for now. */
  bones: number;
  /** Caught while away, by species id → how many. */
  caught: Record<string, number>;
  /** Species caught for the first time while away. */
  discovered: string[];
  /** Bones the aquarium earned while you were away (already added). */
  tankBones: number;
}

export interface SaleReport {
  fish: number;
  bones: number;
}

type GameEvent = 'change' | 'catch' | 'sell' | 'offline' | 'discover' | 'weather' | 'tank';

/** Bad weather is a luck event: luck is multiplied while it lasts. */
export const WEATHER_LUCK: Record<WeatherPreset, number> = { clear: 1, rain: 1.5, fog: 2, storm: 3 };
type Listener = (data?: unknown) => void;

const KEY = 'driftwood-dock.save.v1';

const freshLevels = (): Record<UpgradeId, number> => Object.fromEntries(DEFS.map((d) => [d.id, 0])) as Record<UpgradeId, number>;

const fresh = (): SaveData => ({
  v: 2,
  bones: 0,
  levels: freshLevels(),
  inv: {},
  lastSeen: 0,
  totalCaught: 0,
  totalBones: 0,
  seen: [],
  tank: [],
  tankSlots: START_SLOTS,
  decor: [],
});

export const lookOf = (sp: Species): FishLook => ({ ramp: sp.ramp, size: sp.size, sparkle: sp.sparkle, boot: !!sp.boot });

export class Game {
  data: SaveData;
  /** Seconds into the current catch. */
  timer = 0;
  private pending: { h: Hooked; age: number } | null = null;
  private rng: Rng;
  /** The last few catches, for the tails in the bucket prop. */
  private recent: FishLook[] = [];
  /** Seconds until the weather changes. */
  private wxLeft = 0;
  private scheduling = false;
  private listeners = new Map<GameEvent, Set<Listener>>();
  private saveT = 0;
  /** Bones refunded for the removed Bucket upgrade when an old save loaded (shown once). */
  refund = 0;
  /** The last AFK report, until the player dismisses it. */
  offline: OfflineReport | null = null;

  readonly api: FishingApi;

  constructor(private s: Scene) {
    const loaded = Game.load();
    this.data = loaded.data;
    this.refund = loaded.refund;
    this.rng = makeRng((Date.now() ^ 0x5f3759df) >>> 0);
    // First luck event comes after a short calm spell.
    this.wxLeft = this.rng.range(40, 110);
    this.api = {
      // bite + reel + catch arc + recast + cast take ≈7 s at normal speed; squeeze them into the catch time.
      animScale: () => Math.max(0.15, Math.min(1, this.catchTime() / 7)),
      takeBite: () => {
        if (!this.pending) return null;
        const h = this.pending.h;
        this.pending = null;
        return h;
      },
      landed: (h) => this.land(h),
      bucketLooks: () => this.recent,
    };
    s.shared.fishing = this.api;
    // Any weather change (ours, or the test picker's) is announced; a picked event gets a normal length.
    s.on('weather', (w) => {
      if (!this.scheduling) this.wxLeft = w === 'clear' ? this.rng.range(200, 420) : this.rng.range(80, 170);
      this.emit('weather', w);
    });
    // AFK first (it reads lastSeen), then persist a migration refund.
    this.applyAway();
    if (this.refund > 0) this.save();

    const persist = (): void => this.save();
    addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else this.applyAway();
    });
  }

  // ------------------------------------------------------------ derived stats

  level(id: UpgradeId): number {
    return this.data.levels[id] ?? 0;
  }
  catchTime(): number {
    return catchTime(this.level('speed'));
  }
  valueMult(): number {
    return valueMult(this.level('value'));
  }
  /** Luck from the upgrade alone. */
  baseLuck(): number {
    return luckMult(this.level('luck'));
  }
  /** Luck right now: the upgrade times the weather's luck event. */
  luck(): number {
    return this.baseLuck() * this.weatherLuck();
  }
  /** Luck bonus of the current weather (bad weather is a luck event). */
  weatherLuck(): number {
    return WEATHER_LUCK[this.s.weatherPreset] ?? 1;
  }
  /** Seconds left in the current weather event (0 in clear weather). */
  eventLeft(): number {
    return this.s.weatherPreset === 'clear' ? 0 : Math.max(0, this.wxLeft);
  }
  deep(): number {
    return deepMult(this.level('depth'));
  }
  depth(): number {
    return depthM(this.level('depth'));
  }
  afk(): number {
    return afkSeconds(this.level('afk'));
  }
  isNight(): boolean {
    return this.s.light.night > 0.5;
  }
  /** What one fish of this species sells for right now. */
  price(sp: Species): number {
    return Math.max(1, Math.ceil(sp.bones * this.valueMult() * hookBonus(this.level('hook'))));
  }

  // ------------------------------------------------------------ aquarium

  /** Tank income multiplier from decorations (1 = none). */
  decorMult(): number {
    return 1 + this.data.decor.reduce((a, id) => a + (decorById(id)?.bonus ?? 0), 0);
  }
  /** Bones per minute one fish of this species earns in the tank. */
  tankRate(sp: Species): number {
    return this.price(sp) * TANK_RATE * this.decorMult() * (this.happyLeft() > 0 ? 1 + FEED_BONUS : 1);
  }
  private happyUntil = 0;
  private lastFeed = -Infinity;
  /** Seconds the fish stay happy from the last feeding (0 when not). */
  happyLeft(): number {
    return Math.max(0, (this.happyUntil - Date.now()) / 1000);
  }
  /** Seconds until feeding gives the bonus again. */
  feedCooldown(): number {
    return Math.max(0, FEED_COOLDOWN - (Date.now() - this.lastFeed) / 1000);
  }
  /** Feed the tank: true when it made the fish happy (bonus), false while on cooldown or empty. */
  feed(): boolean {
    if (!this.data.tank.length || this.feedCooldown() > 0) return false;
    this.lastFeed = Date.now();
    this.happyUntil = this.lastFeed + FEED_TIME * 1000;
    this.emit('tank');
    return true;
  }
  /** Bones per minute the whole tank earns. */
  tankIncome(): number {
    let r = 0;
    for (const id of this.data.tank) {
      const sp = speciesById(id);
      if (sp) r += this.tankRate(sp);
    }
    return r;
  }
  tankFull(): boolean {
    return this.data.tank.length >= this.data.tankSlots;
  }
  /** Move one fish of a species from the inventory into the tank. */
  addToTank(id: string): boolean {
    if (this.tankFull() || this.held(id) <= 0 || !speciesById(id)) return false;
    const n = this.held(id) - 1;
    if (n > 0) this.data.inv[id] = n;
    else delete this.data.inv[id];
    this.data.tank.push(id);
    this.emit('tank');
    this.emit('change');
    this.save();
    return true;
  }
  /** Take the fish in slot i back to the inventory. */
  takeFromTank(i: number): boolean {
    const id = this.data.tank[i];
    if (!id) return false;
    this.data.tank.splice(i, 1);
    this.data.inv[id] = this.held(id) + 1;
    this.emit('tank');
    this.emit('change');
    this.save();
    return true;
  }
  slotPrice(): number {
    return slotCost(this.data.tankSlots);
  }
  canBuySlot(): boolean {
    return this.data.tankSlots < MAX_SLOTS && this.data.bones >= this.slotPrice();
  }
  buySlot(): boolean {
    if (!this.canBuySlot()) return false;
    this.data.bones -= this.slotPrice();
    this.data.tankSlots++;
    this.emit('tank');
    this.emit('change');
    this.save();
    return true;
  }
  hasDecor(id: DecorId): boolean {
    return this.data.decor.includes(id);
  }
  buyDecor(id: DecorId): boolean {
    const d = decorById(id);
    if (!d || this.hasDecor(id) || this.data.bones < d.cost) return false;
    this.data.bones -= d.cost;
    this.data.decor.push(id);
    this.emit('tank');
    this.emit('change');
    this.save();
    return true;
  }
  /** Fractional bones the tank has earned but not yet paid out. */
  private tankAcc = 0;
  /** Bones the tank paid out since the UI last asked (for the floating "+N"). */
  tankPaid = 0;
  private tankTick(dt: number): void {
    if (!this.data.tank.length) return;
    this.tankAcc += (this.tankIncome() / 60) * dt;
    if (this.tankAcc < 1) return;
    const whole = Math.floor(this.tankAcc);
    this.tankAcc -= whole;
    this.data.bones += whole;
    this.data.totalBones += whole;
    this.tankPaid += whole;
  }
  /** How many of a species you hold. */
  held(id: string): number {
    return this.data.inv[id] ?? 0;
  }
  /** Total fish held. */
  invCount(): number {
    let n = 0;
    for (const id in this.data.inv) n += this.data.inv[id];
    return n;
  }
  /** What the whole inventory sells for. */
  invValue(): number {
    let b = 0;
    for (const id in this.data.inv) {
      const sp = speciesById(id);
      if (sp) b += this.data.inv[id] * this.price(sp);
    }
    return b;
  }
  /** Seconds until the next bite (0 while a bite is being reeled in). */
  timeLeft(): number {
    return this.pending ? 0 : Math.max(0, this.catchTime() - this.timer);
  }
  biting(): boolean {
    return !!this.pending;
  }

  cost(id: UpgradeId): number {
    return costAt(defById(id), this.level(id));
  }
  maxed(id: UpgradeId): boolean {
    return this.level(id) >= defById(id).max;
  }
  canBuy(id: UpgradeId): boolean {
    return !this.maxed(id) && this.data.bones >= this.cost(id);
  }
  anyAffordable(): boolean {
    return DEFS.some((d) => this.canBuy(d.id));
  }

  // ------------------------------------------------------------ events

  on(ev: GameEvent, fn: Listener): () => void {
    let set = this.listeners.get(ev);
    if (!set) this.listeners.set(ev, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  private emit(ev: GameEvent, data?: unknown): void {
    this.listeners.get(ev)?.forEach((fn) => fn(data));
  }

  // ------------------------------------------------------------ actions

  /** Roll what bites now. */
  roll(luck = this.luck()): Hooked {
    const sp = rollSpecies(this.rng, luck, this.deep());
    const count = !sp.boot && this.rng.chance(hookDouble(this.level('hook'))) ? 2 : 1;
    return { species: sp, count, bones: this.price(sp), look: lookOf(sp) };
  }

  /** Put fish into the inventory; returns true if it's the first of its kind. */
  private stash(sp: Species, n: number): boolean {
    this.data.inv[sp.id] = this.held(sp.id) + n;
    this.data.totalCaught += n;
    if (this.data.seen.includes(sp.id)) return false;
    this.data.seen.push(sp.id);
    return true;
  }

  private land(h: Hooked): void {
    const first = this.stash(h.species, h.count);
    if (!h.species.boot) this.recent = [...this.recent, h.look].slice(-3);
    this.emit('catch', h);
    if (first) this.emit('discover', h.species);
    this.emit('change');
  }

  /** Sell up to `n` of a species (all of them when n is omitted). */
  sell(id: string, n = Infinity): SaleReport {
    const sp = speciesById(id);
    const have = this.held(id);
    const k = Math.min(have, Math.floor(n));
    if (!sp || !(k > 0)) return { fish: 0, bones: 0 };
    const bones = k * this.price(sp);
    if (have - k > 0) this.data.inv[id] = have - k;
    else delete this.data.inv[id];
    return this.credit({ fish: k, bones });
  }

  /** Sell everything, or with keepOne, every duplicate (one of each kind stays). */
  sellAll(keepOne = false): SaleReport {
    let fish = 0;
    let bones = 0;
    for (const id of Object.keys(this.data.inv)) {
      const sp = speciesById(id);
      const have = this.held(id);
      const k = keepOne ? have - 1 : have;
      if (!sp || k <= 0) continue;
      fish += k;
      bones += k * this.price(sp);
      if (have - k > 0) this.data.inv[id] = have - k;
      else delete this.data.inv[id];
    }
    return this.credit({ fish, bones });
  }

  private credit(r: SaleReport): SaleReport {
    if (r.fish <= 0) return r;
    this.data.bones += r.bones;
    this.data.totalBones += r.bones;
    this.emit('sell', r);
    this.emit('change');
    this.save();
    return r;
  }

  buy(id: UpgradeId): boolean {
    if (!this.canBuy(id)) return false;
    this.data.bones -= this.cost(id);
    this.data.levels[id] = this.level(id) + 1;
    this.emit('change');
    this.save();
    return true;
  }

  /** A tapped time circle: take seconds off the current catch (never below zero). */
  skip(sec: number): number {
    if (this.pending || !(sec > 0)) return 0;
    const before = this.timer;
    this.timer = Math.min(this.catchTime(), this.timer + sec);
    return this.timer - before;
  }

  dismissOffline(): void {
    this.offline = null;
  }

  /** Weather runs on its own: calm spells, then a rain, fog or storm luck event. */
  private weatherTick(dt: number): void {
    this.wxLeft -= dt;
    if (this.wxLeft > 0) return;
    if (this.s.weatherPreset === 'clear') {
      const r = this.rng.next();
      const ev: WeatherPreset = r < 0.55 ? 'rain' : r < 0.82 ? 'fog' : 'storm';
      this.wxLeft = this.rng.range(80, 170);
      this.scheduling = true;
      this.s.setWeather(ev);
    } else {
      this.wxLeft = this.rng.range(200, 420);
      this.scheduling = true;
      this.s.setWeather('clear');
    }
    this.scheduling = false;
  }

  update(dt: number): void {
    this.weatherTick(dt);
    this.tankTick(dt);
    if (this.pending) {
      // If nothing reels the bite in (no fisher on screen), land it directly.
      this.pending.age += dt;
      if (this.pending.age > 6) {
        const h = this.pending.h;
        this.pending = null;
        this.land(h);
      }
    } else {
      this.timer += dt;
      if (this.timer >= this.catchTime()) {
        this.timer = 0;
        this.pending = { h: this.roll(), age: 0 };
      }
    }
    this.saveT += dt;
    if (this.saveT > 5) {
      this.saveT = 0;
      this.save();
    }
  }

  // ------------------------------------------------------------ AFK

  /** Credit the time since the last save (app closed or in the background). */
  private applyAway(): void {
    const last = this.data.lastSeen;
    const now = Date.now();
    this.data.lastSeen = now;
    if (!last) return;
    const away = (now - last) / 1000;
    if (away < 45) return;
    const seconds = Math.min(away, this.afk());
    // The cat fishes at a relaxed pace while you're away.
    const bites = Math.floor((seconds * AFK_RATE) / this.catchTime());
    let fish = 0;
    let bones = 0;
    const caught: Record<string, number> = {};
    const discovered: string[] = [];
    for (let i = 0; i < bites; i++) {
      // No weather events while you're away: base luck only.
      const h = this.roll(this.baseLuck());
      if (this.stash(h.species, h.count)) discovered.push(h.species.id);
      caught[h.species.id] = (caught[h.species.id] ?? 0) + h.count;
      fish += h.count;
      bones += h.count * h.bones;
    }
    // The aquarium keeps earning while you're away, at the same relaxed pace as AFK fishing.
    let tankBones = Math.floor((this.tankIncome() / 60) * seconds * AFK_RATE);
    if (tankBones > 0) {
      this.data.bones += tankBones;
      this.data.totalBones += tankBones;
    }
    if (fish > 0 || tankBones > 0) {
      // Merge with a report the player hasn't dismissed yet (app backgrounded twice).
      const prev = this.offline;
      if (prev) {
        for (const id in prev.caught) caught[id] = (caught[id] ?? 0) + prev.caught[id];
        discovered.unshift(...prev.discovered);
        fish += prev.fish;
        bones += prev.bones;
        tankBones += prev.tankBones;
      }
      this.offline = { away: away + (prev?.away ?? 0), seconds: seconds + (prev?.seconds ?? 0), fish, bones, caught, discovered, tankBones };
      this.emit('offline', this.offline);
      this.emit('change');
    }
    this.save();
  }

  // ------------------------------------------------------------ save

  static load(): { data: SaveData; refund: number } {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { data: fresh(), refund: 0 };
      const d = JSON.parse(raw) as Partial<SaveData> & { bucket?: Array<{ id?: unknown }> };
      const f = fresh();
      // Only known upgrades, as whole non-negative levels (the old Bucket upgrade is dropped).
      const levels = f.levels;
      for (const def of DEFS) {
        const lv = Number((d.levels as Record<string, unknown> | undefined)?.[def.id]);
        if (Number.isFinite(lv)) levels[def.id] = Math.max(0, Math.min(def.max, Math.floor(lv)));
      }
      const inv: Record<string, number> = {};
      // Ids from the old 70-fish lake fold into the new fish of the same class.
      const add = (raw: unknown, n: number): void => {
        const id = typeof raw === 'string' ? migrateId(raw) : undefined;
        if (!id || !Number.isFinite(n) || n <= 0) return;
        inv[id] = (inv[id] ?? 0) + Math.floor(n);
      };
      if (d.inv && typeof d.inv === 'object') for (const id of Object.keys(d.inv)) add(id, Number(d.inv[id]));
      // v1 saves kept fish in a bucket: move them into the inventory.
      if (Array.isArray(d.bucket)) for (const x of d.bucket) add(x?.id, 1);
      const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
      // The Bucket upgrade is gone: give back what was spent on it (cost was ceil(60 * 1.6^k) per level).
      const oldBucket = Math.max(0, Math.min(40, Math.floor(Number((d.levels as Record<string, unknown> | undefined)?.bucket) || 0)));
      let refund = 0;
      for (let k = 0; k < oldBucket; k++) refund += Math.ceil(60 * Math.pow(1.6, k));
      // Seen: known ids, once each, plus everything you hold.
      const seen = new Set<string>();
      if (Array.isArray(d.seen))
        for (const raw of d.seen) {
          const id = typeof raw === 'string' ? migrateId(raw) : undefined;
          if (id) seen.add(id);
        }
      for (const id of Object.keys(inv)) seen.add(id);
      const data: SaveData = {
        v: 2,
        bones: num(d.bones) + refund,
        levels,
        inv,
        lastSeen: num(d.lastSeen),
        totalCaught: num(d.totalCaught),
        totalBones: num(d.totalBones),
        seen: [...seen],
        tankSlots: Math.max(START_SLOTS, Math.min(MAX_SLOTS, Math.floor(num(d.tankSlots)) || START_SLOTS)),
        tank: [],
        decor: Array.isArray(d.decor) ? [...new Set(d.decor.filter((x): x is DecorId => typeof x === 'string' && DECOR.some((dd) => dd.id === x)))] : [],
      };
      if (Array.isArray(d.tank))
        for (const raw of d.tank) {
          const id = typeof raw === 'string' ? migrateId(raw) : undefined;
          if (id && data.tank.length < data.tankSlots) data.tank.push(id);
        }
      return { data, refund };
    } catch {
      return { data: fresh(), refund: 0 };
    }
  }

  save(): void {
    this.data.lastSeen = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage blocked (private mode, sandbox): progress lives for this session only.
    }
  }
}
