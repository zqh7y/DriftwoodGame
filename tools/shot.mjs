#!/usr/bin/env node
// Headless renderer for checking art. Bundles the TypeScript with esbuild, opens it in
// Playwright's Chromium, and saves PNGs of the scene canvas.
//
// Examples
//   node tools/shot.mjs --out shots/day.png
//   node tools/shot.mjs --out shots/cycle.png --tod dawn,day,sunset,night
//   node tools/shot.mjs --out shots/rain.png --weather clear,rain,storm,fog --tod 0.45
//   node tools/shot.mjs --out shots/cast.png --strip 8 --step 0.25 --crop 60,380,200,160 --zoom 1
//   node tools/shot.mjs --out shots/sky.png --modules sky --only sky
//   node tools/shot.mjs --perf --size desktop
//   node tools/shot.mjs --out shots/page.png --page --ui --open-hud
//
// Options
//   --out <file.png>        output image (required unless --perf / --list)
//   --size <name|WxH@dpr>   phone (390x844@2, default) | desktop (1280x720@1) | tablet (820x1180@2)
//                           | wide (1600x700@1) | small (360x640@2) | android (412x915@2.625) | e.g. 430x932@3
//   --tod <list>            comma list of 0..1 values or dawn|day|sunset|night (default day)
//   --weather <list>        comma list of clear|rain|storm|fog (default clear)
//   --t <sec>               simulate this long before each capture (default 4)
//   --strip <n> --step <s>  capture n frames per state, advancing s seconds between (animation check)
//   --zoom <n>              scale of each saved frame (default 1, or 0.5 when several frames)
//   --crop x,y,w,h          crop in CSS px before zooming (inspect one object up close)
//   --modules a,b           build only these layer modules (isolates you from broken files)
//   --only prefixes         draw only layers whose id starts with one of these prefixes
//   --seed <n>              world seed (default 1)
//   --cols <n>              grid columns for multi-frame output
//   --page                  real browser screenshot of the viewport instead of the art buffer
//   --ui / --open-hud       show the HUD (page mode) / click it open
//   --fonts                 keep the Google Fonts link (needs network)
//   --perf                  print average ms per layer over 240 frames (honours --tod, --weather and --t,
//                           first value of each; default day, clear, 2 s), e.g. --perf --tod night --t 26
//   --list                  print layer ids in draw order

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = {
  phone: [390, 844, 2],
  desktop: [1280, 720, 1],
  tablet: [820, 1180, 2],
  wide: [1600, 700, 1],
  small: [360, 640, 2],
  android: [412, 915, 2.625],
};
const TODS = { dawn: 0.262, morning: 0.34, day: 0.615, noon: 0.5, sunset: 0.738, dusk: 0.775, night: 0.94, midnight: 0.0 };
/** A --tod value: a preset name or a 0..1 number. */
const parseTod = (v) => (v.trim() in TODS ? TODS[v.trim()] : Number(v));

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else {
      a[key] = next;
      i++;
    }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
if (!args.out && !args.perf && !args.list) {
  console.error('usage: node tools/shot.mjs --out shots/x.png [options]   (see header of tools/shot.mjs)');
  process.exit(2);
}

function sizeOf(spec = 'phone') {
  if (SIZES[spec]) return SIZES[spec];
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?$/.exec(spec);
  if (!m) throw new Error(`bad --size ${spec}`);
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
}

const cacheRoot = join(ROOT, 'node_modules', '.cache', 'shots');
mkdirSync(cacheRoot, { recursive: true });
const dir = mkdtempSync(join(cacheRoot, 'run-'));

async function bundle() {
  let entry = join(ROOT, 'src', 'main.ts');
  if (args.modules && args.modules !== true) {
    const mods = String(args.modules).split(',').map((m) => m.trim()).filter(Boolean);
    const lines = [`import { boot } from ${JSON.stringify(join(ROOT, 'src', 'boot.ts'))};`];
    mods.forEach((m, i) => lines.push(`import m${i} from ${JSON.stringify(join(ROOT, 'src', 'layers', `${m}.ts`))};`));
    lines.push(`boot([${mods.map((_, i) => `m${i}`).join(', ')}]);`);
    entry = join(dir, 'entry.ts');
    writeFileSync(entry, lines.join('\n'));
  }
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: 'iife',
      outfile: join(dir, 'app.js'),
      target: 'es2020',
      sourcemap: 'inline',
      logLevel: 'silent',
    });
  } catch (err) {
    console.error('BUILD FAILED');
    for (const e of err.errors ?? [err]) {
      const loc = e.location ? `${e.location.file}:${e.location.line}:${e.location.column} ` : '';
      console.error(`  ${loc}${e.text ?? e.message}`);
    }
    process.exit(3);
  }
  let html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<script type="module" src="\/src\/main\.ts"><\/script>/, '<script src="app.js"></script>');
  if (!args.fonts) html = html.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, '');
  writeFileSync(join(dir, 'index.html'), html);
}

async function main() {
  await bundle();
  const [vw, vh, dpr] = sizeOf(args.size);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text()}`);
  });

  const q = new URLSearchParams({ paused: '1', seed: String(args.seed ?? 1), ui: args.ui ? '1' : '0' });
  if (args.only && args.only !== true) q.set('only', String(args.only));
  await page.goto(`${pathToFileURL(join(dir, 'index.html')).href}?${q}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  const info = await page.evaluate(() => ({ W: window.__scene.W, H: window.__scene.H, dpr: window.__scene.dpr }));

  if (args.list) {
    const ids = await page.evaluate(() => window.__scene.layerIds());
    console.log(ids.join('\n'));
  }

  if (args.perf) {
    // Honours --tod (first value, name or number), --weather (first value) and --t; defaults: day, clear, 2 s.
    const ptod = args.tod && args.tod !== true ? parseTod(String(args.tod).split(',')[0]) : TODS.day;
    const pweather = args.weather && args.weather !== true ? String(args.weather).split(',')[0] : 'clear';
    const pt = args.t !== undefined && args.t !== true ? Number(args.t) : 2;
    if (!Number.isFinite(ptod) || !Number.isFinite(pt)) throw new Error(`bad --tod ${args.tod} or --t ${args.t}`);
    await page.evaluate(([tod, weather, t]) => window.__scene.configure({ tod, weather, t, todMode: 'day' }), [ptod, pweather, pt]);
    const r = await page.evaluate(() => window.__scene.benchmark(240));
    console.log(`screen ${info.W}x${info.H}@${info.dpr} — tod ${ptod}, ${pweather}, t ${pt}s — avg frame (step+draw): ${r.total.toFixed(2)} ms`);
    for (const l of r.layers) console.log(`  ${l.ms.toFixed(3).padStart(7)} ms  ${l.id}`);
  }

  if (args.out) {
    const out = resolve(process.cwd(), String(args.out));
    mkdirSync(dirname(out), { recursive: true });
    const tods = String(args.tod ?? 'day').split(',').map(parseTod);
    const weathers = String(args.weather ?? 'clear').split(',');
    const pre = Number(args.t ?? 4);
    const strip = Math.max(1, Number(args.strip ?? 1));
    const step = Number(args.step ?? 0.25);

    if (args.page) {
      await page.evaluate(([tod, weather, t]) => window.__scene.configure({ tod, weather, t, todMode: 'day' }), [tods[0], weathers[0], pre]);
      if (args['open-hud']) await page.click('#hud-toggle');
      await page.waitForTimeout(150);
      await page.screenshot({ path: out });
      console.log(`saved ${out} (page ${vw}x${vh}@${dpr})`);
    } else {
      const many = weathers.length * tods.length * strip > 1;
      const zoom = Number(args.zoom ?? (many ? 0.5 : 1));
      const crop = args.crop && args.crop !== true ? String(args.crop).split(',').map(Number) : undefined;
      const shots = [];
      const labels = [];
      for (const weather of weathers) {
        for (const tod of tods) {
          await page.evaluate(([tod, weather, t]) => window.__scene.configure({ tod, weather, t, todMode: 'day' }), [tod, weather, pre]);
          for (let f = 0; f < strip; f++) {
            if (f > 0) await page.evaluate((s) => window.__scene.advance(s), step);
            shots.push(await page.evaluate(([z, c]) => window.__scene.snapshot(z, c), [zoom, crop]));
            labels.push(`${weather} tod=${tod}${strip > 1 ? ` +${(f * step).toFixed(2)}s` : ''}`);
          }
        }
      }
      const fw = (crop ? crop[2] : info.W) * info.dpr * zoom;
      const cols = Number(args.cols ?? Math.max(1, Math.min(shots.length, Math.floor(2600 / (fw + 4)))));
      const data = await page.evaluate(
        async ({ shots, labels, cols }) => {
          const imgs = await Promise.all(
            shots.map((src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; })),
          );
          if (imgs.length === 1) return shots[0];
          const w = imgs[0].width;
          const h = imgs[0].height;
          const pad = 4;
          const lab = 14;
          const rows = Math.ceil(imgs.length / cols);
          const c = document.createElement('canvas');
          c.width = cols * w + (cols + 1) * pad;
          c.height = rows * (h + lab) + (rows + 1) * pad;
          const x = c.getContext('2d');
          x.imageSmoothingEnabled = false;
          x.fillStyle = '#202020';
          x.fillRect(0, 0, c.width, c.height);
          imgs.forEach((im, i) => {
            const cx = pad + (i % cols) * (w + pad);
            const cy = pad + Math.floor(i / cols) * (h + lab + pad);
            x.fillStyle = '#e0e0e0';
            x.font = '11px monospace';
            x.fillText(labels[i], cx + 2, cy + 11);
            x.drawImage(im, cx, cy + lab);
          });
          return c.toDataURL('image/png');
        },
        { shots, labels, cols },
      );
      writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
      console.log(`saved ${out} — ${shots.length} frame(s), screen ${info.W}x${info.H}@${info.dpr}, zoom ${zoom}${crop ? `, crop ${crop.join(',')}` : ''}`);
    }
  }

  await browser.close();
  rmSync(dir, { recursive: true, force: true });
  if (problems.length) {
    console.log(`\n${problems.length} browser problem(s):`);
    for (const p of [...new Set(problems)].slice(0, 30)) console.log('  ' + p);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
