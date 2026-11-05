// Player settings (saved on the device): time of day, calm/night options, sleep timer, battery
// saver and what's shown on screen. Sound volumes live with the sound engine (src/audio/audio.ts).

export type TimeMode = 'clock' | 'random';
export type CircleMode = 'on' | 'rare' | 'off';
export type BatteryMode = 'off' | 'auto' | 'on';

export interface Settings {
  /** 'clock': the lake follows your real local time. 'random': it runs its own day cycle. */
  time: TimeMode;
  /** Always night, whatever the time. */
  night: boolean;
  /** Calm mode: rare boost circles, softer effects, quieter attention sounds. */
  calm: boolean;
  /** Boost circles on the water. */
  circles: CircleMode;
  /** Battery saver: 'auto' lowers the frame rate after a while without touching. */
  battery: BatteryMode;
  /** The fish board under the clock. */
  board: boolean;
  /** Floating "+bones" and fish names. */
  floaters: boolean;
}

const KEY = 'driftwood-dock.settings.v1';
const DEFAULTS: Settings = { time: 'clock', night: false, calm: false, circles: 'on', battery: 'auto', board: true, floaters: true };

const load = (): Settings => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const s = { ...DEFAULTS };
    if (d.time === 'clock' || d.time === 'random') s.time = d.time;
    if (d.circles === 'on' || d.circles === 'rare' || d.circles === 'off') s.circles = d.circles;
    if (d.battery === 'off' || d.battery === 'auto' || d.battery === 'on') s.battery = d.battery;
    for (const k of ['night', 'calm', 'board', 'floaters'] as const) if (typeof d[k] === 'boolean') s[k] = d[k];
    return s;
  } catch {
    return { ...DEFAULTS };
  }
};

type Listener = (s: Settings) => void;
const listeners = new Set<Listener>();

export const settings: Readonly<Settings> & {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  on(fn: Listener): () => void;
} = Object.assign(load(), {
  set<K extends keyof Settings>(this: Settings, key: K, value: Settings[K]): void {
    if (this[key] === value) return;
    this[key] = value;
    try {
      const { time, night, calm, circles, battery, board, floaters } = this;
      localStorage.setItem(KEY, JSON.stringify({ time, night, calm, circles, battery, board, floaters }));
    } catch {
      // Storage blocked: the setting lasts for this session.
    }
    listeners.forEach((fn) => fn(this));
  },
  on(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
});
