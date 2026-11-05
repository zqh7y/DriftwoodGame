// Top of the screen: the in-game clock in the centre (plain white digits with a soft glow and quiet
// effects), and a gear on the right that opens the weather panel. The clock runs on its own;
// players can't change it. Minimal white-on-glass styles live in index.html.

import { clockText, TEST_SHORTCUTS, type Scene, type WeatherPreset } from '../engine';
import { icon, type IconName } from './icons';

const WEATHER_OPTIONS: Array<{ preset: WeatherPreset; label: string; icon: IconName }> = [
  { preset: 'clear', label: 'Clear', icon: 'sun' },
  { preset: 'rain', label: 'Rain', icon: 'rain' },
  { preset: 'storm', label: 'Storm', icon: 'storm' },
  { preset: 'fog', label: 'Fog', icon: 'fog' },
];

type Phase = 'dawn' | 'day' | 'dusk' | 'night';

const phaseOf = (tod: number): Phase => {
  if (tod >= 0.2 && tod < 0.3) return 'dawn';
  if (tod >= 0.3 && tod < 0.71) return 'day';
  if (tod >= 0.71 && tod < 0.81) return 'dusk';
  return 'night';
};

/** The top bar with three slots; created once, shared with the game UI (bones go on the left). */
export function topbar(): { left: HTMLElement; center: HTMLElement; right: HTMLElement } {
  let bar = document.querySelector<HTMLElement>('.topbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'topbar';
    bar.innerHTML = '<div class="top-left"></div><div class="top-center"></div><div class="top-right"></div>';
    document.body.appendChild(bar);
  }
  return {
    left: bar.querySelector<HTMLElement>('.top-left')!,
    center: bar.querySelector<HTMLElement>('.top-center')!,
    right: bar.querySelector<HTMLElement>('.top-right')!,
  };
}

/** Test tool: pick the weather by hand (weather normally runs on its own as luck events). */
export function weatherPicker(scene: Scene): HTMLElement {
  const row = document.createElement('div');
  row.className = 'wx-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', 'Weather');
  const buttons = WEATHER_OPTIONS.map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn wx-btn';
    b.setAttribute('aria-pressed', String(scene.weatherPreset === o.preset));
    b.innerHTML = `<span class="wx-ico">${icon(o.icon)}</span><span class="ol">${o.label}</span>`;
    b.addEventListener('click', () => scene.setWeather(o.preset));
    row.appendChild(b);
    return b;
  });
  scene.on('weather', (w) => buttons.forEach((x, i) => x.setAttribute('aria-pressed', String(WEATHER_OPTIONS[i].preset === w))));
  return row;
}

export function mountHud(scene: Scene): void {
  const slots = topbar();
  // ------------------------------------------------------------ the clock
  const clock = document.createElement('div');
  clock.className = 'clock is-day';
  clock.setAttribute('role', 'timer');
  clock.setAttribute('aria-live', 'off');
  clock.innerHTML = `
    <span class="clock-digits">
      <span class="clock-base ol ol-lg">--:--</span>
      <span class="clock-face" aria-hidden="true">--:--</span>
    </span>`;
  slots.center.appendChild(clock);
  const base = clock.querySelector<HTMLSpanElement>('.clock-base')!;
  const face = clock.querySelector<HTMLSpanElement>('.clock-face')!;

  // ------------------------------------------------------------ settings gear
  const root = slots.right;
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.id = 'hud-toggle';
  gear.className = 'btn gear-btn';
  gear.setAttribute('aria-expanded', 'false');
  gear.setAttribute('aria-controls', 'hud-panel');
  gear.setAttribute('aria-label', 'Settings');
  gear.innerHTML = icon('gear');

  gear.setAttribute('aria-haspopup', 'dialog');
  gear.removeAttribute('aria-controls');
  root.append(gear);
  // The gear opens the Settings sheet (built in game-ui.ts).

  // ------------------------------------------------------------ clock updates and effects
  let lastText = '';
  let lastHour = -1;
  let lastPhase: Phase | null = null;
  let nextShine = 6;
  let last = performance.now();

  const replay = (cls: string): void => {
    clock.classList.remove(cls);
    void clock.offsetWidth;
    clock.classList.add(cls);
  };

  const burst = (count: number): void => {
    const r = face.getBoundingClientRect();
    scene.sparkle(r.left + r.width / 2, r.top + r.height / 2, { count, spread: Math.max(14, r.width / (2 * scene.u)), life: 0.9 });
  };

  const tick = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t = clockText(scene.tod);
    if (t !== lastText) {
      base.textContent = t;
      face.textContent = t;
      clock.setAttribute('aria-label', `Time ${t}`);
      lastText = t;
      const hour = Number(t.slice(0, 2));
      // A new hour: the digits pop and throw sparkles.
      if (lastHour >= 0 && hour !== lastHour) {
        replay('is-pop');
        burst(hour === 0 || hour === 12 ? 14 : 7);
      }
      lastHour = hour;
    }
    const ph = phaseOf(scene.tod);
    if (ph !== lastPhase) {
      clock.classList.remove('is-dawn', 'is-day', 'is-dusk', 'is-night');
      clock.classList.add(`is-${ph}`);
      if (lastPhase) {
        replay('is-pop');
        burst(16);
      }
      lastPhase = ph;
    }
    // Every so often a shine sweeps across the digits.
    nextShine -= dt;
    if (nextShine <= 0) {
      replay('is-shine');
      nextShine = 7 + Math.random() * 7;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
