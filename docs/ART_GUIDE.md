# Driftwood Dock — art & engine guide

A cozy, mostly-AFK fishing game. This first milestone is **the world**: one living lakeside scene
with time of day, weather, and an auto-fishing character. There's no economy or game UI yet.

## The look: bright, cozy mobile-game cartoon

The scene follows the reference picture the user chose: a sunny afternoon lake.

- **Smooth vector shapes**: rounded, chunky, friendly. Flat fills with one or two tones of shading
  (lighter top, darker bottom or side) and small white highlights. No textures, no noise, no pixel art.
- **Warm dark-brown outlines** (`C.outline`, ≈2–3·u wide, round joins) on foreground objects: the pier,
  cattails, lily pads, bobber, bucket, character, fish. **No outlines** on background shapes: sky,
  clouds, sun, hills, trees, water.
- **Saturated, sunny colors** from the palette `C` (`src/engine/palette.ts`), sampled from the picture.
- **Lots of gentle, looping motion**: clouds drift, ripple marks shimmer, lily pads bob, cattails sway,
  fish swim. Calm and smooth. Nothing jitters.
- **Original drawings.** Match the picture's style, colors and layout. Don't copy its character
  (a cardboard box), its UI (currency pills, item grid, "TAP" circle, event bar, bottom nav), its
  dice or cube items, or any of its text.

Composition (from the picture, as fractions of the stage width `w` and screen height `H`): sky over
the top 40%; hills and trees on the horizon at 0.40·H; lake below; a wooden pier from the bottom-left
corner up to the fisher at (0.27w, 0.57H); the rod tip at (0.49w, 0.42H); the bobber at (0.58w, 0.50H);
lily pads around the bobber; cattails in the bottom-right; the sun high on the right at (0.82w, 0.18H).
All of these are in `s.layout`.

## Canvas facts

- Coordinates are **CSS pixels**, y down. The engine draws at full device resolution (dpr up to 3).
- `s.u` is the **size unit**: 1 on a 390×844 phone. Multiply every size and line width by it.
- **`s.layout.stage`** `{x0, w}` is the picture's frame. It's the full width on phones (the main target)
  and a centered column on wide screens. Put the picture's elements inside it. Sky, hills and water
  extend across the whole width `s.W`, so decorate the sides on wide screens too.
- `s.persp(y)` is a water perspective factor (≈0.35 at the horizon, 1 at the bottom edge). Scale
  things on the water by it.

## Who owns what (z bands)

| Module file | z band | Owns |
|---|---|---|
| `src/layers/sky.ts` | 0–99 | sky gradient, sun and glow, clouds, birds and dusk bats, stars, moon |
| `src/layers/space.ts` | 2–25, 404 | night show: Milky Way, ringed planet, fish constellation, aurora, satellite, meteors and showers, the wishing star that falls into the lake |
| `src/layers/land.ts` | 100–199 | far and near hills, round trees and bushes, the pale haze strip at the shoreline |
| `src/layers/water.ts` | 200–231, 233–259 | lake surface, shore reflections, ripple marks, sun shaft and glints, fish shadows, lily pads, frog, jumping fish |
| engine | 232 | ripples (anyone spawns with `s.ripple`) |
| `src/layers/fisher.ts` | 255 | bobber on the water |
| engine | 262 | particles on the water plane (`front: false`) |
| `src/layers/dock.ts` | 265–329 | pier shadow on the water, posts, the pier deck |
| `src/layers/fisher.ts` | 330–349 | bucket, the cat (main character), rod, line, catch arc, "!" bubble |
| `src/layers/dock.ts` | 350–369 | cattails and leaves, dragonflies, butterflies, fireflies |
| engine | 372 | particles in front (`front: true`, the default) |
| `src/layers/weather.ts` | 380–499 | rain and splashes, lightning bolts, fog and mist, wind leaves, sun motes, vignette |

**Rules:**

- Edit only your own module, `src/layers/<module>.ts`. You may split it into a folder
  `src/layers/<module>/…` as long as `src/layers/<module>.ts` stays the entry with
  `export default` a `LayerModule`.
- Never edit `src/engine/*`, `src/main.ts`, `src/boot.ts`, `src/ui/*`, `index.html`, `tools/*` or
  another module. If you need an engine feature, write it locally in your module and mention it in
  your report.
- Prefix layer ids with the module name: `water.surface`, `sky.clouds`, and so on.
- Sky and land draw only above `s.layout.horizon`. Water draws only at or below it.

## Layer modules

```ts
import { C, ellipse, type LayerModule } from '../engine';

const water: LayerModule = (s) => {
  // closure state lives here
  return [
    {
      id: 'water.surface',
      z: 200,
      resize(s) { /* rebuild size-dependent data */ },
      update(s, dt) { /* simulation */ },
      draw(s, ctx) { /* ctx is saved and restored around each layer */ },
    },
  ];
};
export default water;
```

## Engine API (`import { … } from '../engine'`)

### Scene `s`
- `s.W`, `s.H`, `s.u`, `s.dpr`, `s.t` (sim seconds), `s.dt`, `s.frame`, `s.reducedMotion`
- `s.layout`: `stage {x0, w}`, `horizon`, `hillTop`, `dock {farL, farR, nearL, nearR, side}`, `fisher`,
  `bucket`, `rodBase`, `rodTip`, `bobber`, `reeds {x0, x1, headY, baseY}`, `lilies [{x, y, r, flower}]`,
  `sunDay {x, y, r}`, `sunArc`
- `s.tod`: a 0..1 day fraction. It starts at a random time on every launch and then runs on its own
  (players can't change it). Reference points: dawn 0.262, **day 0.615 (the picture's look)**,
  sunset 0.738, night 0.94.
- `s.light`: this frame's lighting. `skyTop/skyMid/skyBot` (RGB), `amb`, `haze`, `sunCol`, `cloudLit`,
  `cloudShade`, `stars`, `daylight`, `night`, `golden`, `flash`, `sun {x, y, alt, visible}`,
  `moon {…}`, `key` (changes whenever the grade changes)
- `s.weather`: smoothed `{cloud, rain, storm, fog, wind}`, each 0..1. `s.windAt(x)` gives the current
  wind (≈0..1.5, always blowing toward +x).
- Color: `s.col(c, depth?)` → graded CSS; `s.colA(c, alpha, depth?)` → graded rgba();
  `s.grade(c, depth?)` → graded RGB; `s.raw(c, alpha?)` → ungraded (only for emitted light)
- `s.rng(name)` → seeded `Rng` (`next`, `range`, `int`, `pick`, `chance`, `sign`)
- Effects: `s.ripple(x, y, {maxR, life, strength})`, `s.splash(x, y, {count, power, color, ripple})`,
  `s.sparkle(x, y, {count, color, spread, front, life})`, `s.particle({x, y, color, vx, vy, g, drag,
  life, color2, size, emissive, front, shape: 'dot'|'streak'|'star'|'leaf', floorY, onFloor, windK, spin})`
- `s.lightning(strength)` is for the weather module only.
- `s.on(name, fn)` / `s.emit(name, data)`, and `s.shared` (a blackboard for cross-module state)

### Drawing helpers
`paint, rect, roundRect, ellipse, circle, poly, curveThrough, blob, smoothLine, quadLine, vGrad,
linGrad, glow, sparkle, withAlpha, Baked, makeCanvas, ctx2d`. Shapes take a `Paint` object:
`{fill?, stroke?, line?}`.

### Math and color
`clamp lerp invLerp smoothstep fract wrap bump easeOutQuad easeInOut easeOutBack TAU hash1 hash2
makeRng noise1 noise2 fbm1 fbm2` · `rgb css mix gradient scaleRGB lum shade` · `skyAt(light, v)`

## Color and lighting rules (the theme)

1. **Every world color comes from `C`**, the single theme. If you need an in-between tone, use
   `mix(C.a, C.b, t)` or `shade(C.x, k)`, never an invented hex.
2. **Every world color is graded**, for example `fill: s.col(C.wood.top)`. Never write a hex literal into
   a fill or stroke. Grading is what makes the whole scene shift together at dawn, sunset, night, and
   in storms and fog.
3. **Distance haze**: pass `depth` for far things. Far hills 0.4–0.5, near hills and trees 0.2–0.3,
   everything on the water and the pier 0.
4. **Emitted light is not graded**: sun glints, stars, the moon, fireflies, sparkles. Use
   `s.raw(C.light.*)` and `glow()`, and scale night lights by `s.light.night`.
5. **Sky colors come from `s.light`** (`skyAt`, `cloudLit`, `cloudShade`, `sunCol`).
6. At `tod = 0.615` in clear weather the scene should look like the picture.

## Drawing rules

- Smooth curves (`blob`, `curveThrough`, `quadLine`, `ellipse`). Keep shapes simple and readable at
  phone size.
- Size everything by `s.u`. Outline widths are 2–3·u for big objects and 1.5·u for small ones.
- Animate with smooth functions of `s.t`, giving each object its own phase so loops never sync up.
- Avoid `shadowBlur` and `ctx.filter`, which are slow on phones. For soft light, use `glow()` or
  gradients.

## Performance

- Budget: at most about 1.5 ms per module per frame at 1280×720 (`node tools/shot.mjs --perf --size desktop`).
- Cache static drawings with `Baked` (keyed by `s.light.key` when they use graded colors). The key
  changes about three times a second as the clock runs, so caches re-paint at that rate, not every frame.
- Don't create hundreds of gradients per frame, and don't call `getImageData` per frame.

## Checking your work

```bash
npx tsc --noEmit                                     # typecheck (look at errors in your files)
node tools/shot.mjs --out shots/<module>/day.png                       # phone 390x844@2, day preset
node tools/shot.mjs --out shots/<module>/cycle.png --tod dawn,day,sunset,night
node tools/shot.mjs --out shots/<module>/desk.png --size desktop --tod day,night
node tools/shot.mjs --out shots/<module>/wx.png --weather clear,rain,storm,fog
node tools/shot.mjs --out shots/<module>/anim.png --strip 6 --step 0.3 --crop X,Y,W,H --zoom 1
node tools/shot.mjs --out shots/<module>/solo.png --modules sky,<module> --only <module>
node tools/shot.mjs --perf --size desktop
```

- Open the PNGs with the Read tool and look hard. Compare against the reference picture.
- Other modules are being written at the same time. If the full build fails because of someone
  else's file, use `--modules <yours>,…` to build only the modules you choose.
- Write screenshots under `shots/<module>/` only.
