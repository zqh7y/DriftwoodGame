// Game UI: bones (top-left), the catch board under the clock (all 12 fish and their live chances),
// a frosted bottom bar (catch ring, Inventory, Upgrades), the Inventory sheet (stacked fish you can
// sell, with an "erase" effect), the Upgrades sheet, the Welcome-back popup, cards for new fish and
// weather luck events, and floating labels. Minimal white-on-glass style; CSS lives in index.html.
//
// The sheets are meant to feel alive: behind the glass drift huge, heavily blurred copies of the
// art (you see only soft color), cards ease in one after another, a tapped card zooms forward and
// shows more, and buying or selling answers with a sheen and a little burst.

import type { Scene } from '../engine';
import { formatNum } from '../game/format';
import { odds, SPECIES, speciesById, type Rarity, type Species } from '../game/fish';
import { DEFS, formatDuration, type UpgradeId } from '../game/upgrades';
import { WEATHER_LUCK, type Game, type Hooked, type SaleReport } from '../game/game';
import type { WeatherPreset } from '../engine';
import type { FishArt } from './fishart';
import { topbar, weatherPicker } from './hud';
import { settings, type BatteryMode, type CircleMode, type TimeMode } from '../game/settings';
import { TEST_SHORTCUTS, TOD_PRESETS, realTod } from '../engine';
import { audio } from '../audio/audio';
import { mountTank, type DecorId } from '../aquarium/tank';
import { diveTransition } from './dive';
import { DECOR, MAX_SLOTS } from '../game/aquarium';
import { fishIcon, icon, iconArt, type IconName } from './icons';

const TIER: Record<Rarity, number> = { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5, SSS: 6 };
const reduceMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** A chance as a short percent: 50%, 12.5%, 0.75%, 0.04%, 0.00064%. */
const pct = (p: number): string => {
  const v = p * 100;
  if (!(v > 0)) return '0%';
  return `${parseFloat(v.toPrecision(v >= 10 ? 3 : 2))}%`;
};
/** How a fish's chance is shown: a number, "???", or symbols that keep changing. */
const GLYPHS = '?!#%&$*¿§';
const scramble = (n = 4): string => Array.from({ length: n }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('');
const WEATHER_NAME: Record<WeatherPreset, string> = { clear: 'Clear', rain: 'Rain', fog: 'Fog', storm: 'Storm' };
const clockText = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const boneMini = (): string => `<span class="mini">${icon('bone')}</span>`;
const artOf = (sp: Species): FishArt => ({ ramp: sp.ramp, shape: sp.shape, pattern: sp.pattern, sparkle: sp.sparkle, glow: sp.glow, seed: sp.rank * 7 + sp.name.length, special: sp.special, rank: sp.rank, name: sp.name });
/** Best first: the rarest fish lead. */
const byBest = (a: Species, b: Species): number => b.rank - a.rank;
/** The two mystery fish keep their name hidden until you've caught one. */
const known = (game: Game, sp: Species): boolean => sp.reveal === 'number' || game.data.seen.includes(sp.id);

/** Calm mode (night play): softer, smaller effects everywhere. */
let calmFx = false;

/** A little burst of white specks at a screen point. */
function burst(x: number, y: number, count = 10): void {
  if (reduceMotion()) return;
  if (calmFx) count = Math.max(3, Math.round(count * 0.4));
  const host = el('div', 'burst');
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const d = 22 + Math.random() * 26;
    const p = el('i');
    p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    p.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    p.style.setProperty('--s', `${0.6 + Math.random() * 0.7}`);
    host.appendChild(p);
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 900);
}

/**
 * Heavily blurred art as a tiny bitmap: the SVG is drawn small and soft once, then shown scaled up
 * and moved with transforms only, which is cheap. (A live CSS blur on big layers costs every frame.)
 */
const blurCache = new Map<string, Promise<string>>();
function blurredArt(svgMarkup: string): Promise<string> {
  let p = blurCache.get(svgMarkup);
  if (p) return p;
  p = new Promise<string>((resolve) => {
    const img = new Image();
    const src = svgMarkup.includes('xmlns=') ? svgMarkup : svgMarkup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.onload = () => {
      const N = 40;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const ctx = c.getContext('2d');
      if (!ctx) return resolve('');
      const canFilter = 'filter' in ctx;
      if (canFilter) ctx.filter = 'blur(3.5px) saturate(1.5)';
      ctx.drawImage(img, 6, 6, N - 12, N - 12);
      resolve(c.toDataURL());
    };
    img.onerror = () => resolve('');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  });
  blurCache.set(svgMarkup, p);
  return p;
}
/** Paint blurred art into an element's background once it's ready. */
const paintBlur = (target: HTMLElement, svgMarkup: string): void => {
  void blurredArt(svgMarkup).then((url) => {
    if (url) target.style.backgroundImage = `url("${url}")`;
  });
};

/** Restart a one-shot CSS animation class. */
function replay(e: Element, cls: string): void {
  e.classList.remove(cls);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(cls);
}

/** Count a number up or down to its new value. */
function rollNumber(target: HTMLElement, to: number): void {
  const from = Number(target.dataset.n ?? to);
  target.dataset.n = String(to);
  if (from === to || reduceMotion()) {
    target.textContent = formatNum(to);
    return;
  }
  const t0 = performance.now();
  const step = (now: number): void => {
    if (target.dataset.n !== String(to)) return; // a newer value took over
    const k = Math.min(1, (now - t0) / 420);
    const e = 1 - Math.pow(1 - k, 3);
    target.textContent = formatNum(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- sheets

interface Sheet {
  backdrop: HTMLDivElement;
  panel: HTMLElement;
  body: HTMLDivElement;
  aura: HTMLDivElement;
  bones: HTMLSpanElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

const sheets: Sheet[] = [];
let dimWorld = (): void => {};

function makeSheet(id: string, title: string, opener: HTMLButtonElement, onOpen: () => void): Sheet {
  const backdrop = el('div', 'sheet-backdrop');
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <section class="panel sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="sheet-aura" aria-hidden="true"></div>
      <h2 class="panel-title" id="${id}-title">${title}</h2>
      <button type="button" class="btn close-btn" aria-label="Close ${title.toLowerCase()}">${icon('close')}</button>
      <div class="sheet-head"><div class="chip sheet-bones"><span class="chip-ico">${icon('bone')}</span><span class="sheet-bones-count">0</span><span class="sr-only"> bones</span></div></div>
      <div class="sheet-body"></div>
    </section>`;
  document.body.appendChild(backdrop);
  const panel = backdrop.querySelector<HTMLElement>('.sheet')!;
  const closeBtn = backdrop.querySelector<HTMLButtonElement>('.close-btn')!;
  let lastFocus: HTMLElement | null = null;
  const sheet: Sheet = {
    backdrop,
    panel,
    body: backdrop.querySelector('.sheet-body')!,
    aura: backdrop.querySelector('.sheet-aura')!,
    bones: backdrop.querySelector('.sheet-bones-count')!,
    open() {
      for (const o of sheets) if (o !== sheet && o.isOpen()) o.close();
      lastFocus = document.activeElement as HTMLElement | null;
      onOpen();
      backdrop.hidden = false;
      replay(panel, 'is-entering');
      dimWorld();
      audio.play('open');
      opener.setAttribute('aria-expanded', 'true');
      closeBtn.focus({ preventScroll: true });
    },
    close() {
      if (backdrop.hidden) return;
      backdrop.hidden = true;
      audio.play('close');
      opener.setAttribute('aria-expanded', 'false');
      const back = lastFocus && document.contains(lastFocus) && lastFocus.offsetParent !== null ? lastFocus : opener;
      back.focus({ preventScroll: true });
      dimWorld();
    },
    isOpen: () => !backdrop.hidden,
  };
  opener.addEventListener('click', () => (sheet.isOpen() ? sheet.close() : sheet.open()));
  closeBtn.addEventListener('click', () => sheet.close());
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) sheet.close();
  });
  sheets.push(sheet);
  return sheet;
}

/** Fill a sheet's background with huge, heavily blurred, slowly drifting copies of some art. */
function setAura(sheet: Sheet, arts: string[]): void {
  fillAura(sheet.aura, arts.slice(0, 4));
}
function fillAura(host: HTMLElement, arts: string[]): void {
  const key = arts.join('|');
  if (host.dataset.key === key) return;
  host.dataset.key = key;
  host.replaceChildren();
  arts.forEach((a, i) => {
    const blob = el('span', 'aura-blob');
    blob.style.setProperty('--i', String(i));
    paintBlur(blob, a);
    host.appendChild(blob);
  });
}

// ---------------------------------------------------------------- the UI

export function mountGameUi(scene: Scene, game: Game): void {
  dimWorld = () => {
    scene.dimmed = sheets.some((s) => s.isOpen());
  };
  // ------------------------------------------------------------ bones counter
  const bonesPill = el('div', 'chip bones-pill');
  bonesPill.setAttribute('role', 'status');
  bonesPill.innerHTML = `<span class="chip-ico">${icon('bone')}</span><span class="bones-count">0</span><span class="sr-only"> bones</span>`;
  const bonesCount = bonesPill.querySelector<HTMLSpanElement>('.bones-count')!;
  topbar().left.appendChild(bonesPill);

  // ------------------------------------------------------------ bottom bar
  const bar = el('div', 'game-bar');
  bar.innerHTML = `
    <div class="ring" role="progressbar" aria-label="Next catch" aria-valuemin="0" aria-valuemax="100">
      <svg class="ring-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="ring-track" cx="26" cy="26" r="22"/><circle class="ring-fill" cx="26" cy="26" r="22" pathLength="100"/></svg>
      <span class="ring-time">8.0</span>
    </div>
    <button type="button" class="btn big-btn inv-btn" id="inv-btn" aria-haspopup="dialog" aria-expanded="false">
      <span class="big-ico">${icon('bag')}</span>
      <span class="big-text"><span class="big-main ol">Inventory</span><span class="big-sub ol"><span class="mini">${icon('value')}</span><span class="inv-count">0</span><span class="sub-gap"></span>${boneMini()}<span class="inv-value">0</span></span></span>
    </button>
    <button type="button" class="btn btn-solid big-btn upgrades-btn" id="upgrades-btn" aria-haspopup="dialog" aria-expanded="false">
      <span class="big-text"><span class="big-main ol">Upgrades</span></span>
      <span class="badge" hidden></span>
    </button>
    <button type="button" class="btn big-btn aq-only" id="decor-btn" aria-haspopup="dialog" aria-expanded="false">
      <span class="big-ico">${icon('star')}</span><span class="big-text"><span class="big-main ol">Decorate</span></span>
    </button>
    <button type="button" class="btn btn-solid big-btn aq-only" id="tank-btn" aria-haspopup="dialog" aria-expanded="false">
      <span class="big-text"><span class="big-main ol">Add fish</span></span>
    </button>`;
  document.body.appendChild(bar);
  const timer = bar.querySelector<HTMLDivElement>('.ring')!;
  const timeText = bar.querySelector<HTMLSpanElement>('.ring-time')!;
  const timerFill = bar.querySelector<SVGCircleElement>('.ring-fill')!;
  const invBtn = bar.querySelector<HTMLButtonElement>('#inv-btn')!;
  const invBtnIco = invBtn.querySelector<HTMLSpanElement>('.big-ico')!;
  const invCountEl = bar.querySelector<HTMLSpanElement>('.inv-count')!;
  const invValueEl = bar.querySelector<HTMLSpanElement>('.inv-value')!;
  const upgradesBtn = bar.querySelector<HTMLButtonElement>('#upgrades-btn')!;
  const badge = bar.querySelector<HTMLSpanElement>('.badge')!;

  // ------------------------------------------------------------ floating labels
  const floaters = el('div', 'floaters');
  floaters.setAttribute('aria-hidden', 'true');
  document.body.appendChild(floaters);
  const float = (html: string, x: number, y: number, cls = ''): void => {
    if (!settings.floaters) return;
    const f = el('div', `floater ol ${cls}`, html);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    floaters.appendChild(f);
    setTimeout(() => f.remove(), 1800);
  };
  const popBones = (): void => replay(bonesPill, 'pop');
  const centerOf = (e: Element): { x: number; y: number } => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const afterSale = (r: SaleReport, from: Element): void => {
    if (r.fish <= 0) return;
    audio.play('sell', { pitch: r.bones > 1e4 ? 1.12 : 1 });
    const c = centerOf(from);
    float(`+${formatNum(r.bones)} ${boneMini()}`, c.x, c.y - 34);
    burst(c.x, c.y, 12);
    popBones();
  };

  // ============================================================ Upgrades sheet
  const upg = makeSheet('upg', 'Upgrades', upgradesBtn, () => {
    renderCards();
    stagger(upgList);
  });
  setAura(upg, DEFS.map((d) => iconArt(d.id as IconName)));
  const upgList = el('div', 'upg-grid');
  upg.body.appendChild(upgList);

  interface Card {
    tile: HTMLElement;
    lv: HTMLElement;
    eff: HTMLElement;
    bar: HTMLElement;
    buy: HTMLButtonElement;
    cost: HTMLElement;
    shownLv: number;
  }
  const cards = new Map<UpgradeId, Card>();
  const focusCard = (tile: HTMLElement | null): void => {
    for (const c of cards.values()) {
      const on = c.tile === tile && !c.tile.classList.contains('is-focus');
      c.tile.classList.toggle('is-focus', on);
      c.tile.setAttribute('aria-expanded', String(on));
    }
  };
  DEFS.forEach((d, i) => {
    const tile = el('article', 'card upg');
    tile.dataset.upgrade = d.id;
    tile.style.setProperty('--i', String(i));
    tile.tabIndex = 0;
    tile.setAttribute('aria-expanded', 'false');
    tile.setAttribute('aria-label', `${d.name}: ${d.blurb}`);
    tile.innerHTML = `
      <span class="card-art" aria-hidden="true"></span>
      <span class="card-sheen" aria-hidden="true"></span>
      <span class="upg-ico">${icon(d.id as IconName)}</span>
      <h3 class="upg-name ol">${d.name}</h3>
      <span class="upg-lv">Lv 0</span>
      <p class="upg-effect ol"></p>
      <span class="upg-bar" aria-hidden="true"><i></i></span>
      <p class="upg-blurb">${d.blurb}</p>
      <button type="button" class="btn btn-solid upg-buy">${boneMini()}<span class="ol upg-cost">0</span></button>`;
    paintBlur(tile.querySelector<HTMLElement>('.card-art')!, iconArt(d.id as IconName));
    const buy = tile.querySelector<HTMLButtonElement>('.upg-buy')!;
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!game.buy(d.id)) {
        replay(buy, 'is-nope');
        audio.play('nope');
        return;
      }
      audio.play('buy', { pitch: 1 + Math.min(game.level(d.id), 30) * 0.008 });
      replay(tile, 'is-bought');
      const c = centerOf(buy);
      burst(c.x, c.y, 14);
      float('Level up', c.x, c.y - 36, 'floater-small');
    });
    tile.addEventListener('click', () => {
      audio.play('select');
      focusCard(tile);
    });
    tile.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === tile) {
        e.preventDefault();
        focusCard(tile);
      }
    });
    upgList.appendChild(tile);
    cards.set(d.id, {
      tile,
      lv: tile.querySelector('.upg-lv')!,
      eff: tile.querySelector('.upg-effect')!,
      bar: tile.querySelector('.upg-bar i')!,
      buy,
      cost: tile.querySelector('.upg-cost')!,
      shownLv: -1,
    });
  });

  const renderCards = (): void => {
    rollNumber(upg.bones, game.data.bones);
    for (const d of DEFS) {
      const c = cards.get(d.id)!;
      const lv = game.level(d.id);
      const max = game.maxed(d.id);
      if (c.shownLv !== lv) {
        if (c.shownLv >= 0) replay(c.lv, 'is-bump');
        c.lv.textContent = max ? 'Max' : `Lv ${lv}`;
        c.eff.textContent = max ? d.show(lv) : `${d.show(lv)} ➜ ${d.show(lv + 1)}`;
        c.bar.style.transform = `scaleX(${(lv / d.max).toFixed(4)})`;
        c.shownLv = lv;
      }
      const cost = game.cost(d.id);
      c.cost.textContent = max ? 'MAX' : formatNum(cost);
      const can = game.canBuy(d.id);
      c.buy.classList.toggle('is-max', max);
      c.buy.classList.toggle('is-ready', can);
      c.buy.disabled = max || !can;
      c.buy.setAttribute('aria-label', max ? `${d.name} is maxed` : `Buy ${d.name} level ${lv + 1} for ${formatNum(cost)} bones`);
    }
  };

  /** Cards ease in one after another each time a sheet opens. */
  const stagger = (list: HTMLElement): void => {
    replay(list, 'is-in');
  };

  // ============================================================ Inventory sheet
  const inv = makeSheet('inv', 'Inventory', invBtn, () => {
    renderInventory(true, true);
    stagger(invGrid);
  });
  inv.body.innerHTML = `
    <div class="inv-summary">
      <p class="inv-total"><span class="inv-total-n">0 fish</span><span class="inv-total-v">worth ${boneMini()}<b>0</b></span></p>
      <div class="inv-actions">
        <button type="button" class="btn small-btn" id="sell-dupes">Sell duplicates</button>
        <button type="button" class="btn btn-solid small-btn" id="sell-all"><span class="ol">Sell all</span></button>
      </div>
    </div>
    <div class="inv-grid"></div>
    <p class="inv-empty" hidden>No fish yet. Your cat is on it.</p>`;
  const detail = el('div', 'inv-detail');
  detail.hidden = true;
  detail.setAttribute('aria-live', 'polite');
  inv.panel.appendChild(detail);
  const invGrid = inv.body.querySelector<HTMLDivElement>('.inv-grid')!;
  const invEmpty = inv.body.querySelector<HTMLParagraphElement>('.inv-empty')!;
  const invTotalN = inv.body.querySelector<HTMLSpanElement>('.inv-total-n')!;
  const invTotalV = inv.body.querySelector<HTMLElement>('.inv-total-v b')!;
  const sellDupes = inv.body.querySelector<HTMLButtonElement>('#sell-dupes')!;
  const sellAll = inv.body.querySelector<HTMLButtonElement>('#sell-all')!;
  const sellAllLabel = sellAll.querySelector<HTMLSpanElement>('.ol')!;
  // Inventory tiles are kept per species so counts can bump in place while the sheet is open.
  const tiles = new Map<string, { tile: HTMLButtonElement; count: HTMLElement; n: number }>();
  let selected: string | null = null;

  const selectFish = (id: string | null): void => {
    selected = id && game.held(id) > 0 ? id : null;
    for (const [k, t] of tiles) {
      const on = k === selected;
      t.tile.classList.toggle('is-focus', on);
      t.tile.setAttribute('aria-pressed', String(on));
    }
    renderDetail();
  };

  const renderDetail = (): void => {
    const sp = selected ? speciesById(selected) : undefined;
    const n = selected ? game.held(selected) : 0;
    inv.panel.classList.toggle('has-detail', !!sp && n > 0);
    if (!sp || n <= 0) {
      detail.hidden = true;
      return;
    }
    const price = game.price(sp);
    const fresh = detail.dataset.id !== sp.id;
    detail.hidden = false;
    // Built once per species; later updates only touch the numbers so the buttons stay put
    // (a rebuilt button mid-press would swallow the tap, and would drop keyboard focus).
    if (fresh) {
      detail.dataset.id = sp.id;
      detail.innerHTML = `
        <span class="card-art" aria-hidden="true"></span>
        <span class="detail-ico">${fishIcon(artOf(sp))}</span>
        <span class="detail-text">
          <span class="detail-name">${sp.name} <span class="fish-class c-${sp.rarity}">${sp.rarity}</span></span>
          <span class="detail-sub">x<span class="d-n"></span> · ${boneMini()}<span class="d-each"></span> each · <span class="d-odds"></span></span>
        </span>
        <span class="detail-actions">
          <button type="button" class="btn small-btn" data-sell="1">Sell 1</button>
          <button type="button" class="btn btn-solid small-btn" data-sell="all"><span class="ol">Sell all</span>&nbsp;${boneMini()}<span class="ol d-all"></span></button>
        </span>`;
      paintBlur(detail.querySelector<HTMLElement>('.card-art')!, fishIcon(artOf(sp)));
      replay(detail, 'is-in');
    }
    detail.querySelector('.d-n')!.textContent = formatNum(n);
    detail.querySelector('.d-odds')!.textContent = sp.reveal === 'number' ? `${pct(odds(game.luck(), game.deep()).get(sp.id) ?? 0)} chance` : 'chance unknown';
    detail.querySelector('.d-each')!.textContent = formatNum(price);
    detail.querySelector('.d-all')!.textContent = formatNum(price * n);
    detail.querySelector('[data-sell="all"]')!.setAttribute('aria-label', `Sell all ${n} ${sp.name} for ${formatNum(price * n)} bones`);
  };
  // Keep the grid's bottom padding equal to the detail bar so the last row can scroll clear of it.
  new ResizeObserver(() => {
    inv.panel.style.setProperty('--detail-h', `${detail.offsetHeight}px`);
  }).observe(detail);
  detail.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-sell]');
    if (!b || !selected) return;
    const id = selected;
    const after = nextTileAfter(id); // looked up first: selling the last one removes the tile
    const one = b.dataset.sell !== 'all';
    if (one && game.held(id) > 1) ghostErase(tiles.get(id)?.tile);
    const r = game.sell(id, one ? 1 : Infinity);
    afterSale(r, b);
    if (game.held(id) <= 0) {
      // Sold out: the tile and the bar go away, so put focus somewhere sensible.
      selectFish(null);
      (after ?? (sellAll.disabled ? invBtnFallback() : sellAll)).focus({ preventScroll: true });
    }
  });
  const nextTileAfter = (id: string): HTMLButtonElement | null => {
    const t = tiles.get(id)?.tile;
    const live = [...invGrid.querySelectorAll<HTMLButtonElement>('.inv-tile:not(.is-erasing)')];
    const i = t ? live.indexOf(t) : -1;
    return (i >= 0 ? (live[i + 1] ?? live[i - 1]) : null) ?? null;
  };

  // ---- the "erase" effect when fish are sold
  /** A sold-out tile wipes away, shedding white specks, then leaves the grid. */
  const eraseTile = (tile: HTMLElement, delay: number): void => {
    tile.classList.remove('is-focus', 'is-new');
    tile.classList.add('is-erasing');
    tile.setAttribute('aria-hidden', 'true');
    (tile as HTMLButtonElement).disabled = true;
    tile.style.setProperty('--d', `${delay}ms`);
    setTimeout(() => audio.play('erase', { pitch: 0.92 + Math.random() * 0.16, vol: 0.8 }), delay);
    if (reduceMotion()) {
      tile.remove();
      return;
    }
    setTimeout(() => {
      const c = centerOf(tile);
      burst(c.x, c.y, 8);
    }, delay + 180);
    setTimeout(() => tile.remove(), delay + 650);
  };
  /** One fish of a stack erases: a copy of the icon lifts off the tile and wipes away. */
  const ghostErase = (tile: HTMLElement | undefined, delay = 0): void => {
    const ico = tile?.querySelector<HTMLElement>('.inv-ico');
    if (!ico || reduceMotion()) return;
    const r = ico.getBoundingClientRect();
    const g = el('div', 'erase-ghost', ico.innerHTML);
    g.style.left = `${r.left}px`;
    g.style.top = `${r.top}px`;
    g.style.width = `${r.width}px`;
    g.style.height = `${r.height}px`;
    g.style.setProperty('--d', `${delay}ms`);
    document.body.appendChild(g);
    setTimeout(() => audio.play('erase', { pitch: 1.05 + Math.random() * 0.15, vol: 0.6 }), delay);
    setTimeout(() => burst(r.left + r.width / 2, r.top + r.height / 2 - 14, 6), delay + 200);
    setTimeout(() => g.remove(), delay + 800);
  };
  const invBtnFallback = (): HTMLElement => inv.panel.querySelector<HTMLElement>('.close-btn')!;

  let invKey = '';
  /** Display order. Re-sorted (best first) when the sheet opens; while it's open, new kinds join
   *  at the end so tiles never jump under a finger. */
  let order: string[] = [];
  const renderInventory = (force = false, resort = false): void => {
    const heldNow = SPECIES.filter((sp) => game.held(sp.id) > 0);
    if (resort) order = [...heldNow].sort(byBest).map((sp) => sp.id);
    else {
      order = order.filter((id) => game.held(id) > 0);
      for (const sp of [...heldNow].sort(byBest)) if (!order.includes(sp.id)) order.push(sp.id);
    }
    const owned = order.map((id) => speciesById(id)!);
    const key = owned.map((sp) => sp.id + ':' + game.held(sp.id)).join(',') + '|' + game.valueMult() + '|' + game.level('hook');
    if (!force && key === invKey) return;
    invKey = key;
    const total = game.invCount();
    invTotalN.textContent = `${formatNum(total)} fish · ${owned.length} kinds`;
    rollNumber(invTotalV, game.invValue());
    rollNumber(inv.bones, game.data.bones);
    invEmpty.hidden = owned.length > 0;
    sellAll.disabled = total === 0;
    sellDupes.disabled = !owned.some((sp) => game.held(sp.id) > 1);
    // Fish no longer held erase themselves, one after another.
    let k = 0;
    for (const [id, t] of tiles) {
      if (game.held(id) <= 0) {
        eraseTile(t.tile, Math.min(k++, 12) * 45);
        tiles.delete(id);
      }
    }
    owned.forEach((sp, i) => {
      const n = game.held(sp.id);
      let t = tiles.get(sp.id);
      if (!t) {
        const tile = el('button', `card inv-tile r-${sp.rarity}`) as HTMLButtonElement;
        tile.type = 'button';
        tile.setAttribute('aria-pressed', 'false');
        tile.innerHTML = `
          <span class="card-art" aria-hidden="true"></span>
          <span class="inv-ico">${fishIcon(artOf(sp))}</span>
          <span class="inv-count-badge">x0</span>
          <span class="fish-class c-${sp.rarity}">${sp.rarity}</span>
          <span class="inv-name">${sp.name}</span>
          <span class="erase-edge" aria-hidden="true"></span>`;
        tile.addEventListener('click', (e) => {
          audio.play('select');
          selectFish(selected === sp.id ? null : sp.id);
          // From the keyboard (no pointer), jump straight to the sell buttons.
          if (e.detail === 0 && selected === sp.id) detail.querySelector<HTMLButtonElement>('[data-sell="1"]')?.focus({ preventScroll: true });
        });
        paintBlur(tile.querySelector<HTMLElement>('.card-art')!, fishIcon(artOf(sp)));
        t = { tile, count: tile.querySelector('.inv-count-badge')!, n: 0 };
        tiles.set(sp.id, t);
        if (t.n === 0 && !force) replay(tile, 'is-new');
      }
      if (t.n !== n) {
        if (t.n > 0) replay(t.count, 'is-bump');
        t.count.textContent = `x${formatNum(n)}`;
        t.tile.setAttribute('aria-label', `${sp.name}, class ${sp.rarity}, ${n} held`);
        t.n = n;
      }
      t.tile.style.setProperty('--i', String(Math.min(i, 16)));
      // Keep the DOM order equal to the display order (tiles that are erasing don't count).
      const live = invGrid.querySelectorAll('.inv-tile:not(.is-erasing)');
      if (live[i] !== t.tile) invGrid.insertBefore(t.tile, live[i] ?? null);
    });
    if (selected && game.held(selected) <= 0) selectFish(null);
    else renderDetail();
    // A pending "Sell all?" always names what the second tap will really sell.
    if (sellAll.classList.contains('is-confirm')) sellAllLabel.textContent = `Sell ${formatNum(total)} fish?`;
    setAura(inv, owned.length ? owned.slice(0, 4).map((sp) => fishIcon(artOf(sp))) : [fishIcon(artOf(SPECIES[0]))]);
  };

  // "Sell all" asks for a second tap so a stray tap can't empty the inventory.
  let confirmT = 0;
  const resetSellAll = (): void => {
    clearTimeout(confirmT);
    sellAll.classList.remove('is-confirm');
    sellAllLabel.textContent = 'Sell all';
  };
  sellAll.addEventListener('click', () => {
    if (!sellAll.classList.contains('is-confirm')) {
      sellAll.classList.add('is-confirm');
      sellAllLabel.textContent = `Sell ${formatNum(game.invCount())} fish?`;
      confirmT = window.setTimeout(resetSellAll, 3000);
      return;
    }
    resetSellAll();
    selectFish(null);
    afterSale(game.sellAll(false), sellAll);
    invBtnFallback().focus({ preventScroll: true });
  });
  sellDupes.addEventListener('click', () => {
    let k = 0;
    for (const [id, t] of tiles) if (game.held(id) > 1) ghostErase(t.tile, Math.min(k++, 12) * 45);
    afterSale(game.sellAll(true), sellDupes);
    if (sellDupes.disabled) (sellAll.disabled ? invBtnFallback() : sellAll).focus({ preventScroll: true });
  });

  // ------------------------------------------------------------ welcome back
  const modalBg = el('div', 'modal-backdrop');
  modalBg.hidden = true;
  modalBg.innerHTML = `
    <div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="away-title">
      <div class="sheet-aura" aria-hidden="true"></div>
      <h2 class="panel-title" id="away-title">Welcome back</h2>
      <p class="away-text"></p>
      <div class="away-fishes"></div>
      <p class="away-sum"></p>
      <p class="away-tip" hidden></p>
      <div class="away-actions">
        <button type="button" class="btn btn-solid away-btn" id="away-open"><span class="ol">Open inventory</span></button>
        <button type="button" class="btn away-btn away-later" id="away-close">Later</button>
      </div>
    </div>`;
  document.body.appendChild(modalBg);
  const modalAura = modalBg.querySelector<HTMLDivElement>('.sheet-aura')!;
  const showAway = (): void => {
    const r = game.offline;
    if (!r) return;
    const capped = r.away > r.seconds + 60;
    modalBg.querySelector('.away-text')!.textContent = capped
      ? `You were away ${formatDuration(r.away)}. Your cat fished for ${formatDuration(r.seconds)} and caught ${formatNum(r.fish)} fish.`
      : `While you were away (${formatDuration(r.away)}), your cat caught ${formatNum(r.fish)} fish.`;
    const best = Object.keys(r.caught)
      .map((id) => speciesById(id))
      .filter((sp): sp is Species => !!sp)
      .sort(byBest)
      .slice(0, 5);
    modalBg.querySelector('.away-fishes')!.innerHTML = best
      .map(
        (sp, i) =>
          `<span class="away-fish${r.discovered.includes(sp.id) ? ' is-new' : ''}" style="--i:${i}" title="${sp.name}"><span class="away-fish-ico">${fishIcon(artOf(sp))}</span><span class="away-fish-n">x${formatNum(r.caught[sp.id])}</span></span>`,
      )
      .join('');
    fillAura(modalAura, best.slice(0, 3).map((sp) => fishIcon(artOf(sp))));
    modalBg.querySelector('.away-sum')!.innerHTML =
      (r.fish > 0 ? `Worth ${boneMini()}<b>${formatNum(r.bones)}</b>${r.discovered.length ? ` · ${r.discovered.length} new kind${r.discovered.length > 1 ? 's' : ''}` : ''}` : '') +
      (r.tankBones > 0 ? `<span class="away-tank">Your aquarium earned ${boneMini()}<b>${formatNum(r.tankBones)}</b></span>` : '');
    const tip = modalBg.querySelector<HTMLParagraphElement>('.away-tip')!;
    tip.hidden = !capped;
    tip.textContent = 'Upgrade AFK time to keep fishing longer while you are away.';
    modalBg.hidden = false;
    audio.play('welcome');
    modalBg.querySelector<HTMLButtonElement>('#away-open')!.focus({ preventScroll: true });
  };
  const closeAway = (): void => {
    const r = game.offline;
    modalBg.hidden = true;
    game.dismissOffline();
    // Fish discovered while away get their "New fish" cards now.
    r?.discovered.forEach((id) => {
      const sp = speciesById(id);
      if (sp) queueToast(sp);
    });
  };
  modalBg.querySelector('#away-open')!.addEventListener('click', () => {
    closeAway();
    inv.open();
  });
  modalBg.querySelector('#away-close')!.addEventListener('click', () => {
    closeAway();
    invBtn.focus({ preventScroll: true });
  });
  game.on('offline', showAway);

  // ------------------------------------------------------------ catches
  // A tapped bucket prop opens the inventory.
  scene.view.addEventListener('pointerdown', (e) => {
    const r = scene.view.getBoundingClientRect();
    const b = scene.layout.bucket;
    const dx = e.clientX - r.left - b.x;
    const dy = e.clientY - r.top - (b.y - 12 * scene.u);
    if (dx * dx + dy * dy < (26 * scene.u) ** 2) inv.open();
  });

  /** A small copy of the caught fish flies from the bucket into the Inventory button. */
  const flyToInventory = (sp: Species): void => {
    if (reduceMotion()) {
      replay(invBtnIco, 'is-gulp');
      return;
    }
    const v = scene.view.getBoundingClientRect();
    const b = scene.layout.bucket;
    const to = centerOf(invBtnIco);
    const f = el('div', 'fly-fish', fishIcon(artOf(sp)));
    const x0 = v.left + b.x;
    const y0 = v.top + b.y - 30 * scene.u;
    f.style.left = `${x0}px`;
    f.style.top = `${y0}px`;
    f.style.setProperty('--dx', `${to.x - x0}px`);
    f.style.setProperty('--dy', `${to.y - y0}px`);
    document.body.appendChild(f);
    setTimeout(() => {
      f.remove();
      replay(invBtnIco, 'is-gulp');
    }, 760);
  };

  game.on('catch', (d) => {
    const h = d as Hooked;
    if (!h.count) return;
    const tier = TIER[h.species.rarity];
    // Every catch is a soft, low water sound; rarer fish add a gentle chime on top.
    audio.play('catch');
    if (tier >= 3) audio.play(tier >= 6 ? 'legend' : 'rare', { vol: 0.7 });
    const b = scene.layout.bucket;
    const v = scene.view.getBoundingClientRect();
    const label = h.count > 1 ? `${h.species.name} x${h.count}` : h.species.name;
    const rare = TIER[h.species.rarity] >= 3 ? `${h.species.rarity} · ` : '';
    // The cat keeps fishing while you're in the aquarium: no lake labels floating over the tank.
    if (document.body.classList.contains('is-aquarium')) return;
    float(`${rare}${label}`, v.left + b.x + 8 * scene.u, v.top + b.y - 46 * scene.u, 'floater-small');
    flyToInventory(h.species);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalBg.hidden) {
      closeAway();
      invBtn.focus({ preventScroll: true });
    }
    else if (inv.isOpen() && selected) selectFish(null);
    else for (const s of sheets) s.close();
  });

  // ------------------------------------------------------------ "New fish" cards
  const toasts = el('div', 'toasts');
  toasts.setAttribute('role', 'status');
  toasts.setAttribute('aria-live', 'polite');
  document.body.appendChild(toasts);
  interface Toast {
    html: string;
    rare?: boolean;
    ms?: number;
  }
  const queue: Toast[] = [];
  let showing = false;
  const next = (): void => {
    const item = queue.shift();
    if (!item) {
      showing = false;
      return;
    }
    showing = true;
    const t = el('div', `toast${item.rare ? ' is-rare' : ''}`, item.html);
    toasts.appendChild(t);
    if (item.rare) {
      const r = t.getBoundingClientRect();
      scene.sparkle(r.left + r.width / 2, r.top + r.height / 2, { count: 12, spread: 30 });
    }
    const ms = item.ms ?? 3200;
    setTimeout(() => t.classList.add('is-leaving'), ms);
    setTimeout(() => {
      t.remove();
      next();
    }, ms + 500);
  };
  const pushToast = (item: Toast, first = false): void => {
    if (first) queue.unshift(item);
    else queue.push(item);
    if (!showing) next();
  };
  const queueToast = (sp: Species): void =>
    pushToast({
      html: `<span class="toast-ico">${fishIcon(artOf(sp))}</span><span class="toast-text"><span class="toast-label">New fish</span><span class="toast-name">${sp.name}</span></span><span class="fish-class c-${sp.rarity}">${sp.rarity}</span>`,
      rare: TIER[sp.rarity] >= 4,
    });
  game.on('discover', (d) => {
    audio.play('discover');
    queueToast(d as Species);
  });
  if (game.refund > 0)
    pushToast({ html: `<span class="toast-ico">${icon('bag')}</span><span class="toast-text"><span class="toast-label">Bucket is now Inventory</span><span class="toast-name">Refunded ${boneMini()}${formatNum(game.refund)}</span></span>`, ms: 5200 }, true);
  // Bad weather is a luck event.
  game.on('weather', (w) => {
    const wx = w as WeatherPreset;
    if (wx === 'clear') return;
    audio.play('event');
    pushToast({
      html: `<span class="toast-ico">${icon(wx as IconName)}</span><span class="toast-text"><span class="toast-label">Luck event</span><span class="toast-name">${WEATHER_NAME[wx]} · Luck x${WEATHER_LUCK[wx]}</span></span>`,
      rare: wx === 'storm',
    });
  });

  // ============================================================ catch board
  // Under the clock: every fish that can bite, with its chance right now.
  const board = el('section', 'catch-board');
  board.setAttribute('aria-label', 'What can bite');
  board.innerHTML = `
    <div class="cb-head"><span class="cb-stats"></span><span class="cb-event" hidden></span></div>
    <div class="cb-grid"></div>
    <div class="cb-tip" role="status" hidden></div>`;
  document.body.appendChild(board);
  const cbStats = board.querySelector<HTMLSpanElement>('.cb-stats')!;
  const cbEvent = board.querySelector<HTMLSpanElement>('.cb-event')!;
  const cbGrid = board.querySelector<HTMLDivElement>('.cb-grid')!;
  const cbTip = board.querySelector<HTMLDivElement>('.cb-tip')!;
  const cells = new Map<string, { cell: HTMLButtonElement; odds: HTMLElement }>();
  for (const sp of SPECIES) {
    const cell = el('button', `cb-cell r-${sp.rarity} reveal-${sp.reveal}`) as HTMLButtonElement;
    cell.type = 'button';
    cell.style.setProperty('--i', String(sp.rank));
    cell.innerHTML = `<span class="cb-ico">${fishIcon(artOf(sp))}</span><span class="cb-odds ${sp.reveal === 'glitch' ? 'glitch' : ''}">${sp.reveal === 'hidden' ? '???' : ''}</span>`;
    cbGrid.appendChild(cell);
    cells.set(sp.id, { cell, odds: cell.querySelector('.cb-odds')! });
  }
  let tipFor = '';
  let tipT = 0;
  const hideTip = (): void => {
    cbTip.hidden = true;
    tipFor = '';
    for (const c of cells.values()) c.cell.classList.remove('is-picked');
  };
  const showTip = (sp: Species): void => {
    if (tipFor === sp.id) return hideTip();
    hideTip();
    tipFor = sp.id;
    cells.get(sp.id)!.cell.classList.add('is-picked');
    const k = known(game, sp);
    cbTip.innerHTML = `<b>${k ? sp.name : '???'}</b> <span class="fish-class c-${sp.rarity}">${sp.reveal === 'glitch' && !k ? scramble(3) : sp.rarity}</span><span class="cb-tip-sub">${boneMini()}${k ? formatNum(game.price(sp)) : '???'} · held x${formatNum(game.held(sp.id))}</span>`;
    cbTip.hidden = false;
    replay(cbTip, 'is-in');
    clearTimeout(tipT);
    tipT = window.setTimeout(hideTip, 3000);
  };
  cbGrid.addEventListener('click', (e) => {
    const cell = (e.target as Element).closest<HTMLButtonElement>('.cb-cell');
    const sp = cell && SPECIES[Array.prototype.indexOf.call(cbGrid.children, cell)];
    if (sp) showTip(sp);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!cbTip.hidden && !board.contains(e.target as Node)) hideTip();
  });
  let boardKey = '';
  const renderBoard = (): void => {
    const luck = game.luck();
    const deep = game.deep();
    const key = `${luck}|${deep}|${game.data.seen.length}`;
    if (key === boardKey) return;
    const luckChanged = boardKey.split('|')[0] !== String(luck);
    boardKey = key;
    cbStats.textContent = `Luck x${luck.toFixed(2)} · Deep x${deep.toFixed(2)}`;
    const o = odds(luck, deep);
    for (const sp of SPECIES) {
      const c = cells.get(sp.id)!;
      const k = known(game, sp);
      c.cell.classList.toggle('is-mystery', !k);
      c.cell.setAttribute('aria-label', `${k ? sp.name : 'Unknown fish'}, class ${sp.rarity}, chance ${sp.reveal === 'number' ? pct(o.get(sp.id) ?? 0) : 'unknown'}`);
      if (sp.reveal === 'number') {
        const txt = pct(o.get(sp.id) ?? 0);
        if (c.odds.textContent !== txt) {
          c.odds.textContent = txt;
          c.odds.classList.toggle('is-long', txt.length > 5);
          if (luckChanged && sp.rank > 0) replay(c.odds, 'is-shift');
        }
      }
    }
  };
  // Catches celebrate on the board, and the rarer the fish, the bigger the show:
  // E/D a pop and a ripple · C/B a glow wave and specks · A/S rays, a board shimmer and sparkles ·
  // SSS a flash across the whole board, a banner, a long burst and a little shake.
  const celebrate = (sp: Species): void => {
    const c = cells.get(sp.id);
    if (!c) return;
    const tier = TIER[sp.rarity];
    c.cell.style.setProperty('--tier', String(tier));
    for (let t = 0; t <= 6; t++) c.cell.classList.remove(`t-${t}`);
    c.cell.classList.add(`t-${tier}`);
    replay(c.cell, 'is-caught');
    if (reduceMotion()) return;
    const ico = c.cell.querySelector('.cb-ico')!;
    const r = ico.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    // A ring that spreads from the fish (bigger and brighter for rarer fish).
    const ring = el('span', 'cb-ring');
    ring.style.setProperty('--tier', String(tier));
    c.cell.appendChild(ring);
    setTimeout(() => ring.remove(), 1200);
    burst(x, y, [4, 6, 9, 12, 16, 20, 30][tier]);
    if (tier >= 2) {
      const p = el('span', 'cb-plus', `+${formatNum(1)}`);
      c.cell.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }
    if (tier >= 4 && !calmFx) {
      const rays = el('span', 'cb-rays');
      c.cell.appendChild(rays);
      setTimeout(() => rays.remove(), tier >= 6 ? 3200 : 1800);
      replay(board, 'is-shimmer');
      setTimeout(() => burst(x, y, 14), 260);
      scene.sparkle(x, y, { count: tier >= 5 ? 22 : 14, spread: 40 });
    }
    if (tier >= 6) {
      replay(board, 'is-legend');
      if (!calmFx) scene.shake = Math.max(scene.shake, 4);
      setTimeout(() => burst(x, y, 24), 520);
      setTimeout(() => scene.sparkle(innerWidth / 2, r.top, { count: 30, spread: 120 }), 300);
      const banner = el('div', 'cb-banner', `<span class="cb-banner-label">Legendary catch</span><span class="cb-banner-name">${sp.name}</span>`);
      board.appendChild(banner);
      setTimeout(() => banner.remove(), 3400);
    }
  };
  game.on('catch', (d) => celebrate((d as Hooked).species));
  // The rarest fish's chance is a jumble of symbols that changes every half second.
  const glitch = cells.get(SPECIES[SPECIES.length - 1].id)!.odds;
  glitch.textContent = scramble();
  let glitchN = 0;
  setInterval(() => {
    // Calm mode: the symbols change three times slower and without the jitter.
    if (calmFx && ++glitchN % 3 !== 0) return;
    glitch.textContent = scramble();
    if (!reduceMotion() && !calmFx) replay(glitch, 'is-glitching');
  }, 500);

  // ------------------------------------------------------------ sound for every button
  document.addEventListener(
    'pointerdown',
    (e) => {
      audio.unlock();
      const b = (e.target as Element).closest('button');
      if (b && !b.disabled && !b.matches('.inv-tile, .upg, .time-circle')) audio.play('tap', { vol: 0.7 });
    },
    { capture: true },
  );

  // ============================================================ time circles
  // Circles pop up on the water now and then; tapping one takes a second off the current catch.
  const circles = el('div', 'circles');
  document.body.appendChild(circles);
  let nextCircle = 4;
  let streak = 0;
  let alive = 0;
  const CIRCLE_LIFE = 2.8;
  const spawnCircle = (): void => {
    const v = scene.view.getBoundingClientRect();
    const L = scene.layout;
    const x = v.left + v.width * (0.32 + Math.random() * 0.56);
    const y = v.top + L.horizon + 70 * scene.u + Math.random() * Math.max(40, v.height - L.horizon - 280 * scene.u);
    const c = el('button', 'time-circle', `<span class="tc-ring"></span><span class="tc-core">1s</span>`) as HTMLButtonElement;
    c.type = 'button';
    c.setAttribute('aria-label', 'Tap to save one second');
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.style.setProperty('--life', `${CIRCLE_LIFE}s`);
    circles.appendChild(c);
    alive++;
    audio.play('circleSpawn', { pan: (x / innerWidth) * 2 - 1, vol: 0.6 });
    let done = false;
    const finish = (hit: boolean): void => {
      if (done) return;
      done = true;
      alive--;
      if (!hit) streak = 0;
      c.classList.add(hit ? 'is-hit' : 'is-miss');
      c.disabled = true;
      setTimeout(() => c.remove(), 450);
    };
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (done) return;
      const saved = game.skip(1);
      streak++;
      if (saved > 0) boostTimer(x, y, saved);
      audio.play('circle', { pitch: 1 + Math.min(streak - 1, 8) * 0.06, pan: (x / innerWidth) * 2 - 1 });
      float(saved > 0 ? `-${saved >= 0.95 ? 1 : saved.toFixed(1)}s` : 'Fish on!', x, y - 46, 'floater-small');
      if (streak >= 3) float(`x${streak}`, x + 34, y - 20, 'floater-small floater-streak');
      burst(x, y, 12);
      finish(true);
    });
    setTimeout(() => finish(false), CIRCLE_LIFE * 1000);
  };
  /** Make the saved second unmissable: a "-1s" flies into the timer ring, the ring sweeps forward
   *  with a flash, pulses and sends out a shockwave, and its label shows "-1s" for a moment. */
  let boostUntil = 0;
  const boostTimer = (x: number, y: number, saved: number): void => {
    const label = `-${saved >= 0.95 ? 1 : saved.toFixed(1)}s`;
    timer.classList.add('is-sweeping');
    setTimeout(() => timer.classList.remove('is-sweeping'), 450);
    if (reduceMotion()) {
      boostUntil = performance.now() + 700;
      replay(timer, 'is-boost');
      return;
    }
    const to = centerOf(timer);
    const f = el('div', 'skip-fly', label);
    f.style.left = `${x}px`;
    f.style.top = `${y}px`;
    f.style.setProperty('--dx', `${to.x - x}px`);
    f.style.setProperty('--dy', `${to.y - y}px`);
    document.body.appendChild(f);
    setTimeout(() => {
      f.remove();
      boostUntil = performance.now() + 800;
      shown.timeTxt = '';
      replay(timer, 'is-boost');
      const wave = el('span', 'ring-wave');
      timer.appendChild(wave);
      setTimeout(() => wave.remove(), 700);
      burst(to.x, to.y, 12);
    }, 430);
  };
  const circleTick = (dt: number): void => {
    const busy = sheets.some((sh) => sh.isOpen()) || !modalBg.hidden || document.hidden || screen === 'aquarium';
    if (busy) return;
    const mode: CircleMode = settings.circles === 'on' && settings.calm ? 'rare' : settings.circles;
    if (mode === 'off') return;
    nextCircle -= dt;
    if (nextCircle > 0) return;
    nextCircle = mode === 'rare' ? 20 + Math.random() * 15 : 3.2 + Math.random() * 2.6;
    if (alive < (mode === 'rare' ? 1 : 2)) spawnCircle();
  };
  let lastT = performance.now();

  // ============================================================ aquarium (the second screen)
  let screen: 'fishing' | 'aquarium' = 'fishing';
  const tank = mountTank(document.body);
  const decorBtn = bar.querySelector<HTMLButtonElement>('#decor-btn')!;
  const tankBtn = bar.querySelector<HTMLButtonElement>('#tank-btn')!;
  // Fishing | Aquarium switch, floating just above the bar.
  const toggle = el('div', 'screen-toggle');
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Screen');
  toggle.innerHTML = `
    <button type="button" class="st-btn" data-screen="fishing" aria-pressed="true"><span class="st-ico">${icon('hook')}</span>Fishing</button>
    <button type="button" class="st-btn" data-screen="aquarium" aria-pressed="false"><span class="st-ico">${icon('value')}</span>Aquarium</button>
    <span class="st-glider" aria-hidden="true"></span>`;
  document.body.appendChild(toggle);
  // Under the clock on the aquarium screen: income and how full the tank is.
  const aqHead = el('div', 'aq-head');
  aqHead.innerHTML = `
    <span class="chip aq-income"><span class="chip-ico">${icon('bone')}</span><span class="aq-rate">+0</span><span class="aq-per">/ min</span></span>
    <span class="aq-cap"><span class="aq-cap-bar"><i></i></span><span class="aq-cap-n">0 / 3 fish</span></span>
    <span class="aq-happy" hidden></span>`;
  document.body.appendChild(aqHead);
  const aqRate = aqHead.querySelector<HTMLSpanElement>('.aq-rate')!;
  const aqCapN = aqHead.querySelector<HTMLSpanElement>('.aq-cap-n')!;
  const aqCapBar = aqHead.querySelector<HTMLElement>('.aq-cap-bar i')!;
  const aqHappy = aqHead.querySelector<HTMLSpanElement>('.aq-happy')!;
  const aqEmpty = el('p', 'aq-empty', 'Your tank is empty. Tap <b>Add fish</b> to move fish from your inventory in here. They earn bones while they swim.');
  // A one-time hint: tap the water to feed.
  const aqHint = el('p', 'aq-hint', 'Tap the water to feed your fish');
  aqHint.hidden = true;
  document.body.appendChild(aqHint);
  let hintShown = false;
  document.body.appendChild(aqEmpty);

  const rateText = (n: number): string => (n <= 0 ? '0' : n >= 10 ? formatNum(Math.round(n)) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
  const syncTank = (): void => {
    tank.setFish(
      game.data.tank
        .map((id) => speciesById(id))
        .filter((sp): sp is Species => !!sp)
        .map((sp) => ({ id: sp.id, art: fishIcon(artOf(sp)), size: sp.size, rank: sp.rank })),
    );
    tank.setDecor(game.data.decor);
    const n = game.data.tank.length;
    const cap = game.data.tankSlots;
    aqRate.textContent = `+${rateText(game.tankIncome())}`;
    aqCapN.textContent = `${n} / ${cap} fish`;
    aqCapBar.style.transform = `scaleX(${(n / cap).toFixed(3)})`;
    aqEmpty.hidden = n > 0 || screen !== 'aquarium';
    if (n > 0 && screen === 'aquarium' && !hintShown) {
      hintShown = true;
      aqHint.hidden = false;
      setTimeout(() => (aqHint.hidden = true), 6000);
    }
  };

  // Switching screens plays the bubbly dive (or surfacing) and swaps while the water covers it.
  const setScreen = (next: 'fishing' | 'aquarium'): void => {
    if (next === screen) return;
    toggle.style.setProperty('--tab', next === 'aquarium' ? '1' : '0');
    toggle.querySelectorAll<HTMLButtonElement>('.st-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screen === next)));
    if (!diveTransition(next === 'aquarium' ? 'down' : 'up', () => swapScreen(next))) {
      // A dive is already running: put the switch back to what is on screen.
      toggle.style.setProperty('--tab', screen === 'aquarium' ? '1' : '0');
      toggle.querySelectorAll<HTMLButtonElement>('.st-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screen === screen)));
    }
  };
  const swapScreen = (next: 'fishing' | 'aquarium'): void => {
    if (next === screen) return;
    screen = next;
    for (const sh of sheets) sh.close();
    hideAqTip();
    document.body.classList.toggle('is-aquarium', next === 'aquarium');
    toggle.style.setProperty('--tab', next === 'aquarium' ? '1' : '0');
    toggle.querySelectorAll<HTMLButtonElement>('.st-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.screen === next)));
    scene.offstage = next === 'aquarium';
    if (next === 'aquarium') {
      syncTank();
      tank.setNight(scene.light.night);
      tank.show();
      for (const c of [...circles.children]) c.remove();
      alive = 0;
    } else tank.hide();
    aqEmpty.hidden = next !== 'aquarium' || game.data.tank.length > 0;
  };
  toggle.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.st-btn');
    if (b) setScreen(b.dataset.screen as 'fishing' | 'aquarium');
  });

  // Tap a fish in the tank: its name, what it earns, and a way to take it out.
  const aqTip = el('div', 'aq-tip');
  aqTip.hidden = true;
  document.body.appendChild(aqTip);
  let aqTipFor = -1;
  let aqTipT = 0;
  function hideAqTip(): void {
    aqTip.hidden = true;
    aqTipFor = -1;
  }
  tank.onTap((i, x, y) => {
    const sp = speciesById(game.data.tank[i] ?? '');
    if (!sp) return;
    audio.play('select');
    aqTipFor = i;
    aqTip.innerHTML = `<b>${sp.name}</b> <span class="fish-class c-${sp.rarity}">${sp.rarity}</span><span class="aq-tip-sub">${boneMini()}+${rateText(game.tankRate(sp))} / min</span><button type="button" class="btn small-btn" data-take>Take out</button>`;
    aqTip.style.left = `${Math.max(90, Math.min(innerWidth - 90, x))}px`;
    aqTip.style.top = `${Math.max(150, y - 20)}px`;
    aqTip.hidden = false;
    replay(aqTip, 'is-in');
    clearTimeout(aqTipT);
    aqTipT = window.setTimeout(hideAqTip, 4000);
  });
  aqTip.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-take]') || aqTipFor < 0) return;
    const c = centerOf(aqTip);
    if (game.takeFromTank(aqTipFor)) {
      audio.play('splash', { vol: 0.6 });
      float('Back in your inventory', c.x, c.y - 30, 'floater-small');
    }
    hideAqTip();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!aqTip.hidden && !aqTip.contains(e.target as Node) && e.target !== document.querySelector('.tank-view')) hideAqTip();
  });
  // Tap the water: food falls and the fish come to eat. Fed fish are happy for a minute (+10%).
  tank.onWaterTap((x, y) => {
    hideAqTip();
    tank.feed(x, y);
    audio.play('plop', { pitch: 1.5, vol: 0.45 });
    aqHint.hidden = true;
    if (game.feed()) {
      float('Happy fish · +10%', x, y - 30, 'floater-small');
      audio.play('select', { pitch: 1.2 });
    }
  });

  // ---- "Your tank" sheet: the slots, a new slot, and fish to add from the inventory
  const tankSheet = makeSheet('tank', 'Your tank', tankBtn, () => renderTankSheet(true));
  tankSheet.body.innerHTML = `
    <p class="tk-sum"></p>
    <div class="tk-slots"></div>
    <h3 class="section-title">Add from your inventory</h3>
    <div class="tk-inv"></div>
    <p class="inv-empty tk-inv-empty" hidden>No fish in your inventory yet.</p>`;
  const tkSum = tankSheet.body.querySelector<HTMLParagraphElement>('.tk-sum')!;
  const tkSlots = tankSheet.body.querySelector<HTMLDivElement>('.tk-slots')!;
  const tkInv = tankSheet.body.querySelector<HTMLDivElement>('.tk-inv')!;
  const tkInvEmpty = tankSheet.body.querySelector<HTMLParagraphElement>('.tk-inv-empty')!;
  // Don't rebuild under a finger: a catch landing mid-tap would swallow the tap.
  let pressing = false;
  let pendingRender = false;
  tankSheet.panel.addEventListener('pointerdown', () => (pressing = true));
  addEventListener('pointerup', () => {
    pressing = false;
    if (pendingRender) {
      pendingRender = false;
      renderTankSheet();
    }
  });
  let tankKey = '';
  const renderTankSheet = (force = false): void => {
    if (!tankSheet.isOpen() && !force) return;
    if (pressing && !force) {
      pendingRender = true;
      return;
    }
    const heldNow = SPECIES.filter((sp) => game.held(sp.id) > 0).sort(byBest);
    const key = [game.data.tank.join(','), game.data.tankSlots, heldNow.map((sp) => sp.id + game.held(sp.id)).join(','), game.canBuySlot(), game.decorMult(), game.valueMult()].join('|');
    if (!force && key === tankKey) return;
    tankKey = key;
    rollNumber(tankSheet.bones, game.data.bones);
    const n = game.data.tank.length;
    tkSum.innerHTML = `${n} / ${game.data.tankSlots} fish · ${boneMini()}<b>+${rateText(game.tankIncome())}</b> / min${game.decorMult() > 1 ? ` · decor x${game.decorMult().toFixed(2)}` : ''}`;
    let html = '';
    game.data.tank.forEach((id, i) => {
      const sp = speciesById(id);
      if (!sp) return;
      html += `<div class="card tk-slot r-${sp.rarity}" style="--i:${i}"><span class="tk-ico">${fishIcon(artOf(sp))}</span><span class="tk-name">${sp.name}</span><span class="tk-rate">${boneMini()}+${rateText(game.tankRate(sp))}/min</span><button type="button" class="btn small-btn tk-take" data-take="${i}" aria-label="Take ${sp.name} out">Take out</button></div>`;
    });
    for (let i = n; i < game.data.tankSlots; i++) html += `<div class="card tk-slot is-empty" style="--i:${i}"><span class="tk-name">Empty slot</span></div>`;
    if (game.data.tankSlots < MAX_SLOTS)
      html += `<div class="card tk-slot is-new" style="--i:${game.data.tankSlots}"><span class="tk-name">New slot</span><button type="button" class="btn btn-solid small-btn" data-slot ${game.canBuySlot() ? '' : 'disabled'}>${boneMini()}<span class="ol">${formatNum(game.slotPrice())}</span></button></div>`;
    tkSlots.innerHTML = html;
    tkInv.innerHTML = heldNow
      .map(
        (sp, i) =>
          `<button type="button" class="card inv-tile tk-add r-${sp.rarity}" data-add="${sp.id}" style="--i:${Math.min(i, 12)}" ${game.tankFull() ? 'aria-disabled="true"' : ''} aria-label="Add ${sp.name} to the tank, earns ${rateText(game.tankRate(sp))} bones per minute"><span class="inv-ico">${fishIcon(artOf(sp))}</span><span class="inv-count-badge">x${formatNum(game.held(sp.id))}</span><span class="fish-class c-${sp.rarity}">${sp.rarity}</span><span class="inv-name">+${rateText(game.tankRate(sp))}/min</span></button>`,
      )
      .join('');
    tkInvEmpty.hidden = heldNow.length > 0;
    tankSheet.panel.classList.toggle('is-full', game.tankFull());
  };
  tankSheet.body.addEventListener('click', (e) => {
    const t = e.target as Element;
    const add = t.closest<HTMLElement>('[data-add]');
    const take = t.closest<HTMLElement>('[data-take]');
    const slot = t.closest<HTMLElement>('[data-slot]');
    if (add) {
      const c = centerOf(add);
      if (game.addToTank(add.dataset.add!)) {
        audio.play('plop');
        float('Into the tank', c.x, c.y - 30, 'floater-small');
        burst(c.x, c.y, 8);
      } else {
        audio.play('nope');
        replay(tkSlots, 'is-nope');
        float(game.tankFull() ? 'Tank is full' : 'None left', c.x, c.y - 30, 'floater-small');
      }
    } else if (take) {
      if (game.takeFromTank(Number(take.dataset.take))) audio.play('splash', { vol: 0.6 });
    } else if (slot) {
      const c = centerOf(slot);
      if (game.buySlot()) {
        audio.play('buy');
        burst(c.x, c.y, 14);
        float('New slot', c.x, c.y - 34, 'floater-small');
      } else audio.play('nope');
    }
  });

  // ---- Decorate sheet: each decoration shows in the tank and raises its income
  const decorSheet = makeSheet('decor', 'Decorate', decorBtn, () => renderDecor(true));
  decorSheet.body.innerHTML = `<p class="tk-sum dc-sum"></p><div class="dc-list"></div>`;
  const dcSum = decorSheet.body.querySelector<HTMLParagraphElement>('.dc-sum')!;
  const dcList = decorSheet.body.querySelector<HTMLDivElement>('.dc-list')!;
  let decorKey = '';
  const renderDecor = (force = false): void => {
    if (!decorSheet.isOpen() && !force) return;
    const key = game.data.decor.join(',') + '|' + DECOR.map((d) => game.data.bones >= d.cost).join('');
    if (!force && key === decorKey) return;
    decorKey = key;
    rollNumber(decorSheet.bones, game.data.bones);
    dcSum.innerHTML = `Decorations make your fish happier: tank income <b>x${game.decorMult().toFixed(2)}</b>`;
    dcList.innerHTML = DECOR.map((d, i) => {
      const own = game.hasDecor(d.id);
      return `<div class="card dc-row${own ? ' is-own' : ''}" style="--i:${i}"><span class="dc-text"><span class="dc-name">${d.name}</span><span class="dc-bonus">+${Math.round(d.bonus * 100)}% tank income</span></span>${
        own ? `<span class="dc-own">Placed</span>` : `<button type="button" class="btn btn-solid small-btn" data-decor="${d.id}" ${game.data.bones >= d.cost ? '' : 'disabled'}>${boneMini()}<span class="ol">${formatNum(d.cost)}</span></button>`
      }</div>`;
    }).join('');
  };
  dcList.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-decor]');
    if (!b) return;
    const c = centerOf(b);
    if (game.buyDecor(b.dataset.decor as DecorId)) {
      audio.play('buy');
      burst(c.x, c.y, 14);
      float('Placed in the tank', c.x, c.y - 34, 'floater-small');
    } else audio.play('nope');
  });

  game.on('tank', () => {
    syncTank();
    renderTankSheet();
    renderDecor();
  });
  // "+N" bubbles rise from a fish now and then as the tank pays out.
  setInterval(() => {
    if (screen !== 'aquarium' || document.hidden) {
      game.tankPaid = 0;
      return;
    }
    tank.setNight(scene.light.night);
    if (game.tankPaid <= 0 || !game.data.tank.length) return;
    const i = Math.floor(Math.random() * game.data.tank.length);
    const pos = tank.fishPos(i);
    if (pos) float(`+${formatNum(game.tankPaid)} ${boneMini()}`, pos.x, pos.y - 30, 'floater-small');
    game.tankPaid = 0;
  }, 3500);
  syncTank();

  // ============================================================ settings
  const gear = document.getElementById('hud-toggle') as HTMLButtonElement | null;
  const setSheet = makeSheet('settings', 'Settings', gear ?? el('button'), () => paintSettings());
  setSheet.panel.classList.add('settings-sheet');
  const seg = <T extends string>(name: string, label: string, opts: Array<[T, string]>, get: () => T, set: (v: T) => void, desc = ''): HTMLElement => {
    const row = el('div', 'set-row set-col');
    row.innerHTML = `<span class="set-text"><span class="set-name">${label}</span>${desc ? `<span class="set-desc">${desc}</span>` : ''}</span><span class="seg" role="group" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" class="seg-btn" data-v="${v}">${t}</button>`).join('')}</span>`;
    row.dataset.seg = name;
    row.querySelector('.seg')!.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>('.seg-btn');
      if (b) set(b.dataset.v as T);
      paintSettings();
    });
    paints.push(() => row.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get()))));
    return row;
  };
  const sw = (label: string, desc: string, get: () => boolean, set: (v: boolean) => void): HTMLElement => {
    const row = el('div', 'set-row');
    row.innerHTML = `<span class="set-text"><span class="set-name">${label}</span><span class="set-desc">${desc}</span></span><button type="button" class="switch" role="switch" aria-label="${label}"><i></i></button>`;
    const b = row.querySelector<HTMLButtonElement>('.switch')!;
    b.addEventListener('click', () => {
      set(!get());
      paintSettings();
    });
    paints.push(() => b.setAttribute('aria-checked', String(get())));
    return row;
  };
  const slider = (label: string, get: () => number, set: (v: number) => void): HTMLElement => {
    const row = el('div', 'set-row set-slider');
    row.innerHTML = `<span class="set-name">${label}</span><input type="range" min="0" max="100" step="1" aria-label="${label} volume"><span class="set-val"></span>`;
    const input = row.querySelector<HTMLInputElement>('input')!;
    const val = row.querySelector<HTMLSpanElement>('.set-val')!;
    const show = (): void => {
      const v = Math.round(get() * 100);
      input.value = String(v);
      input.style.setProperty('--v', `${v}%`);
      val.textContent = v === 0 ? 'Off' : `${v}`;
    };
    input.addEventListener('input', () => {
      set(Number(input.value) / 100);
      show();
    });
    paints.push(show);
    return row;
  };
  const section = (title: string, ...rows: HTMLElement[]): HTMLElement => {
    const sec = el('section', 'set-sec');
    sec.innerHTML = `<h3 class="section-title">${title}</h3>`;
    sec.append(...rows);
    return sec;
  };
  const paints: Array<() => void> = [];
  const a = audio;
  // Sleep timer: music fades out and the screen dims when it runs out.
  let sleepAt = 0;
  let sleepMin = 0;
  const sleepStatus = el('p', 'set-desc set-sleep-left');
  const sleepRow = seg<string>('sleep', 'Sleep timer', [['0', 'Off'], ['15', '15 min'], ['30', '30 min'], ['60', '60 min']], () => String(sleepMin), (v) => {
    sleepMin = Number(v);
    sleepAt = sleepMin ? Date.now() + sleepMin * 60_000 : 0;
  }, 'Music fades out and the screen dims');
  sleepRow.appendChild(sleepStatus);
  setSheet.body.append(
    section(
      'Time',
      seg<TimeMode>('time', 'Time of day', [['clock', 'My clock'], ['random', 'Random']], () => settings.time, (v) => settings.set('time', v), 'My clock: it is night in the game when it is night for you'),
      sw('Night mode', 'Always night: dark, soft and easy on the eyes', () => settings.night, (v) => settings.set('night', v)),
    ),
    section(
      'Calm & sleep',
      sw('Calm mode', 'Rare boost circles, softer effects, quieter sounds', () => settings.calm, (v) => settings.set('calm', v)),
      seg<CircleMode>('circles', 'Boost circles', [['on', 'On'], ['rare', 'Rare'], ['off', 'Off']], () => settings.circles, (v) => settings.set('circles', v)),
      sleepRow,
    ),
    section(
      'Sound',
      slider('Music', () => (audio.musicOn ? a.musicVolume ?? 0.8 : 0), (v) => {
        a.setMusicVolume?.(v);
        if ((v > 0) !== audio.musicOn) audio.setMusic(v > 0);
      }),
      slider('Ambience', () => a.ambienceVolume ?? 0.8, (v) => a.setAmbienceVolume?.(v)),
      slider('Sounds', () => (audio.sfxOn ? a.sfxVolume ?? 0.8 : 0), (v) => {
        a.setSfxVolume?.(v);
        if ((v > 0) !== audio.sfxOn) audio.setSfx(v > 0);
      }),
    ),
    section(
      'Screen',
      sw('Fish board', 'The chances board under the clock', () => settings.board, (v) => settings.set('board', v)),
      sw('Floating numbers', 'Fish names and +bones that float up', () => settings.floaters, (v) => settings.set('floaters', v)),
      seg<BatteryMode>('battery', 'Battery saver', [['off', 'Off'], ['auto', 'Auto'], ['on', 'On']], () => settings.battery, (v) => settings.set('battery', v), 'Auto: lower frame rate after 20 s without touching'),
    ),
  );
  if (TEST_SHORTCUTS) setSheet.body.append(section('Weather · test only', weatherPicker(scene)));
  function paintSettings(): void {
    paints.forEach((fn) => fn());
    sleepStatus.textContent = sleepAt ? `Fades out in ${clockText((sleepAt - Date.now()) / 1000)}` : '';
  }

  // Apply settings to the world.
  const applyTime = (instant: boolean): void => {
    const mode = settings.night ? 'night' : settings.time === 'clock' ? 'clock' : 'auto';
    if (instant) {
      if (mode === 'night') scene.tod = TOD_PRESETS.night;
      else if (mode === 'clock') scene.tod = realTod();
      scene.todMode = mode;
    } else scene.setTodMode(mode);
  };
  const applyLook = (): void => {
    calmFx = settings.calm;
    document.body.classList.toggle('is-calm', settings.calm);
    document.body.classList.toggle('no-board', !settings.board);
    a.setCalm?.(settings.calm);
  };
  // Test links (#day, #night …) keep the time they ask for.
  const testTime = TEST_SHORTCUTS && location.hash.slice(1) in TOD_PRESETS;
  if (!testTime) applyTime(true);
  applyLook();
  settings.on(() => {
    applyTime(false);
    applyLook();
  });

  // Battery saver: fewer frames when you're just watching.
  let lastInput = performance.now();
  for (const ev of ['pointerdown', 'keydown', 'wheel'] as const) addEventListener(ev, () => (lastInput = performance.now()), { passive: true, capture: true });
  let asleep = false;
  const fpsFor = (): number => {
    if (asleep) return 12;
    const idle = (performance.now() - lastInput) / 1000;
    if (settings.battery === 'on') return idle > 120 ? 20 : 30;
    if (settings.battery === 'auto') return idle > 120 ? 24 : idle > 20 ? 30 : 0;
    return 0;
  };
  // Sleep: dim the screen; a tap wakes it.
  const dim = el('div', 'sleep-dim', `<p class="sleep-text">Sweet dreams<span>Tap to wake</span></p>`);
  dim.hidden = true;
  document.body.appendChild(dim);
  const goSleep = (): void => {
    asleep = true;
    sleepAt = 0;
    sleepMin = 0;
    for (const sh of sheets) sh.close();
    a.fadeOutForSleep?.(20);
    dim.hidden = false;
    replay(dim, 'is-in');
  };
  dim.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    asleep = false;
    dim.hidden = true;
    a.wakeFromSleep?.();
  });
  setInterval(() => {
    if (sleepAt && Date.now() >= sleepAt) goSleep();
    if (setSheet.isOpen()) paintSettings();
    const cap = fpsFor();
    scene.fpsCap = cap;
    tank.setFpsCap(cap);
  }, 1000);

  // ------------------------------------------------------------ ticker  // ------------------------------------------------------------ ticker
  const shown = { bones: -1, invKey: '', afford: false, timeTxt: '', evTxt: '', happy: '' };
  const tick = (): void => {
    const now = performance.now();
    circleTick(Math.min(0.1, (now - lastT) / 1000));
    lastT = now;
    const left = game.timeLeft();
    const p = game.biting() ? 1 : 1 - left / game.catchTime();
    timerFill.style.strokeDashoffset = (100 * (1 - Math.max(0, Math.min(1, p)))).toFixed(2);
    timer.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    const boosting = now < boostUntil;
    const timeTxt = boosting ? '-1s' : game.biting() ? '!' : left.toFixed(1);
    timer.classList.toggle('is-boosted', boosting);
    if (timeTxt !== shown.timeTxt) {
      timeText.textContent = timeTxt;
      timer.setAttribute('aria-valuetext', game.biting() ? 'Fish on' : `Next catch in ${left.toFixed(0)} seconds`);
      shown.timeTxt = timeTxt;
    }
    const d = game.data;
    if (d.bones !== shown.bones) {
      rollNumber(bonesCount, d.bones);
      bonesPill.setAttribute('aria-label', `${formatNum(d.bones)} bones`);
      if (upg.isOpen()) renderCards();
      else rollNumber(upg.bones, d.bones);
      shown.bones = d.bones;
    }
    const count = game.invCount();
    const value = game.invValue();
    const ik = `${count}|${value}`;
    if (ik !== shown.invKey) {
      invCountEl.textContent = formatNum(count);
      rollNumber(invValueEl, value);
      invBtn.setAttribute('aria-label', `Inventory: ${formatNum(count)} fish, worth ${formatNum(value)} bones`);
      shown.invKey = ik;
    }
    if (screen === 'aquarium') {
      const h = game.happyLeft();
      const ht = h > 0 ? `Happy fish · +10% · ${clockText(h)}` : '';
      if (ht !== shown.happy) {
        aqHappy.hidden = !ht;
        aqHappy.textContent = ht;
        aqRate.textContent = `+${rateText(game.tankIncome())}`;
        shown.happy = ht;
      }
    }
    renderBoard();
    const left2 = game.eventLeft();
    const evTxt = left2 > 0 ? `${WEATHER_NAME[scene.weatherPreset]} · Luck x${game.weatherLuck()} · ${clockText(left2)}` : '';
    if (evTxt !== shown.evTxt) {
      cbEvent.hidden = !evTxt;
      cbEvent.textContent = evTxt;
      board.classList.toggle('is-event', !!evTxt);
      shown.evTxt = evTxt;
    }
    const afford = game.anyAffordable();
    if (afford !== shown.afford) {
      badge.hidden = !afford;
      shown.afford = afford;
    }
    requestAnimationFrame(tick);
  };
  game.on('change', () => {
    renderTankSheet();
    renderDecor();
    if (upg.isOpen()) renderCards();
    if (inv.isOpen()) renderInventory();
  });
  requestAnimationFrame(tick);
  if (game.offline) showAway();
}
