import { boot } from './boot';
import sky from './layers/sky';
import space from './layers/space';
import land from './layers/land';
import water from './layers/water';
import dock from './layers/dock';
import fisher from './layers/fisher';
import weather from './layers/weather';
import lantern from './layers/lantern';

// Loading screen (#loader in index.html): fade it out once the game sets window.__ready, but keep
// it up at least ~900 ms so it never flashes, and drop it after 8 s whatever happens.
function hideLoaderWhenReady(): void {
  const loader = document.getElementById('loader');
  if (!loader) return;
  const MIN_MS = 900;
  const MAX_MS = 8000;
  let gone = false;
  const remove = (): void => {
    if (gone) return;
    gone = true;
    loader.classList.add('ld-out');
    window.setTimeout(() => loader.remove(), 700);
  };
  const check = (): void => {
    if (gone) return;
    const t = performance.now();
    const ready = (window as unknown as { __ready?: boolean }).__ready === true;
    if ((ready && t >= MIN_MS) || t >= MAX_MS) remove();
    else window.setTimeout(check, 100);
  };
  window.setTimeout(remove, MAX_MS);
  check();
}

// Offline support: only over https, and not when embedded in an iframe (previews).
function registerServiceWorker(): void {
  try {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:' || window.top !== window) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  } catch {
    /* ignore */
  }
}

hideLoaderWhenReady();
registerServiceWorker();

boot([sky, space, land, water, dock, fisher, lantern, weather]);
