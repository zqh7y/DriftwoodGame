// The bubbly transition between Fishing and the Aquarium: a curtain of water with a soft wavy
// edge sweeps across the screen in a rush of rising bubbles. Diving into the aquarium the water
// rises past you; coming back up to fishing it falls away. The screen swaps while it's covered.

import { audio } from '../audio/audio';

const CSS = `
.dive { position: fixed; inset: 0; z-index: 8; pointer-events: none; overflow: hidden; }
.dive-water { position: absolute; left: -5%; right: -5%; height: 130%; top: 0;
  background: linear-gradient(180deg, rgba(150, 225, 245, 0.96) 0%, rgba(70, 170, 220, 0.97) 35%, rgba(24, 92, 160, 0.98) 100%); }
.dive-water::before, .dive-water::after { content: ""; position: absolute; left: 0; right: 0; height: 60px;
  background: radial-gradient(40px 26px at 50% 100%, rgba(150, 225, 245, 0.96) 98%, transparent 100%) 0 0 / 80px 60px repeat-x; }
.dive-water::before { top: -59px; }
.dive-water::after { bottom: -59px; transform: scaleY(-1); background-image: radial-gradient(40px 26px at 50% 100%, rgba(24, 92, 160, 0.98) 98%, transparent 100%); }
.dive-shine { position: absolute; inset: 0; background: repeating-linear-gradient(100deg, transparent 0 60px, rgba(255, 255, 255, 0.07) 60px 90px, transparent 90px 170px); }
.dive.is-down .dive-water { animation: diveDown 1.15s cubic-bezier(0.55, 0, 0.35, 1) forwards; }
.dive.is-up .dive-water { animation: diveUp 1.15s cubic-bezier(0.55, 0, 0.35, 1) forwards; }
@keyframes diveDown { 0% { transform: translateY(105%); } 42%, 52% { transform: translateY(-12%); } 100% { transform: translateY(-140%); } }
@keyframes diveUp { 0% { transform: translateY(-140%); } 42%, 52% { transform: translateY(-12%); } 100% { transform: translateY(105%); } }
.dive-bubble { position: absolute; bottom: -60px; width: var(--s); height: var(--s); border-radius: 50%;
  background: radial-gradient(circle at 32% 30%, rgba(255, 255, 255, 0.95) 0 14%, rgba(255, 255, 255, 0.25) 15% 55%, rgba(255, 255, 255, 0.7) 70%, rgba(255, 255, 255, 0.95) 76%, transparent 78%);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.35); opacity: 0;
  animation: diveRise var(--d) cubic-bezier(0.3, 0.1, 0.4, 1) var(--w) forwards; }
@keyframes diveRise {
  0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
  10% { opacity: 1; }
  35% { transform: translate(var(--x1), -38vh) scale(1); }
  70% { transform: translate(var(--x2), -80vh) scale(1.05); opacity: 1; }
  100% { transform: translate(var(--x1), -125vh) scale(0.9); opacity: 0; }
}
.dive.is-up .dive-bubble { animation-name: diveSink; top: -60px; bottom: auto; }
@keyframes diveSink {
  0% { transform: translate(0, 0) scale(0.9); opacity: 0; }
  12% { opacity: 1; }
  50% { transform: translate(var(--x1), 50vh) scale(1); }
  100% { transform: translate(var(--x2), 115vh) scale(0.7); opacity: 0; }
}
.dive-fade { position: fixed; inset: 0; z-index: 8; pointer-events: none; background: rgba(40, 120, 190, 0.9); animation: diveFade 0.7s ease forwards; }
@keyframes diveFade { 0% { opacity: 0; } 45%, 55% { opacity: 1; } 100% { opacity: 0; } }
`;

let styled = false;
let busy = false;

/** Play the transition and call `swap` while the screen is covered. Returns false if one is already running. */
export function diveTransition(dir: 'down' | 'up', swap: () => void): boolean {
  if (busy) return false;
  busy = true;
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    const f = document.createElement('div');
    f.className = 'dive-fade';
    document.body.appendChild(f);
    setTimeout(swap, 330);
    setTimeout(() => {
      f.remove();
      busy = false;
    }, 720);
    return true;
  }
  const host = document.createElement('div');
  host.className = `dive is-${dir}`;
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = '<div class="dive-water"><div class="dive-shine"></div></div>';
  // A rush of bubbles: big slow ones and small quick ones, spread across the screen.
  const n = Math.round(Math.min(56, Math.max(30, innerWidth / 9)));
  for (let i = 0; i < n; i++) {
    const b = document.createElement('span');
    b.className = 'dive-bubble';
    const s = 6 + Math.pow(Math.random(), 1.8) * 34;
    b.style.left = `${Math.random() * 100}%`;
    b.style.setProperty('--s', `${s.toFixed(1)}px`);
    b.style.setProperty('--d', `${(0.75 + (s / 40) * 0.6 + Math.random() * 0.35).toFixed(2)}s`);
    b.style.setProperty('--w', `${(Math.random() * 0.35).toFixed(2)}s`);
    b.style.setProperty('--x1', `${((Math.random() - 0.5) * 50).toFixed(0)}px`);
    b.style.setProperty('--x2', `${((Math.random() - 0.5) * 70).toFixed(0)}px`);
    host.appendChild(b);
  }
  document.body.appendChild(host);
  // Sound: a soft splash, then a few bubbly bloops.
  audio.play('splash', { vol: 0.5, pitch: dir === 'down' ? 0.9 : 1.1 });
  for (let i = 0; i < 4; i++) setTimeout(() => audio.play('plop', { vol: 0.28, pitch: 1.2 + Math.random() * 0.7 }), 120 + i * 110);
  setTimeout(swap, 520);
  setTimeout(() => {
    host.remove();
    busy = false;
  }, 1500);
  return true;
}
