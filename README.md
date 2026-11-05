# Driftwood Dock

A cozy, mostly-AFK fishing game for phones (TypeScript + Canvas 2D, no game engine).
A tabby cat fishes off a wooden dock: every catch takes a set time, fish go into your
**inventory** (duplicates stack), you sell them for **bones**, and spend bones on upgrades. The lake runs its own day–night
cycle with weather and a night sky full of meteors.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (hot reload)
npm run build      # typecheck + release build into dist/
npm run artifact   # one self-contained page in artifact/index.html (the shareable preview)
```

Test shortcuts (dev and the preview page only, switched off in `npm run build`):
`#dawn`, `#day`, `#sunset`, `#night` at the end of the URL start the clock at that time.

## Where things live

| Path | What |
|---|---|
| `src/game/upgrades.ts` | Upgrades and **all balance numbers** (costs, growth, effects) |
| `src/game/fish.ts` | The 12 fish: base chances, how luck and Deep shift them, bone values |
| `src/game/game.ts` | Bones, inventory and selling, catch timer, AFK progress, save/load (`localStorage`) |
| `src/ui/` | Game UI (`game-ui.ts`), top bar and clock (`hud.ts`), icons (`icons.ts`, `fishart.ts`) |
| `index.html` | Page shell and all UI styles (tokens at the top of the `<style>`) |
| `src/engine/` | Scene loop, lighting (time of day, weather), palette, drawing helpers |
| `src/layers/` | The world: sky, space, land, water, dock and reeds, fisher (the cat), weather |
| `docs/ART_GUIDE.md` | Art rules and the layer contract for adding to the world |
| `tools/shot.mjs` | Headless screenshots and perf: `node tools/shot.mjs --out shots/x.png --tod night` |

## Game loop

1. The catch timer fills over the catch time (8 s at the start).
2. A fish bites, rolled from the 12 fish's chances (50%, 23%, 12.5% … down to 0.00001%).
   Luck lifts every rarer fish, Deep lifts the six rarest, and bad weather is a luck event
   (rain x1.5, fog x2, storm x3 luck while it lasts). The board under the clock shows the live
   chances; the two rarest show "???" and shifting symbols.
3. The cat reels it in and the fish goes into the inventory; fish of the same kind stack (x12).
4. In the inventory, tap a fish to sell one or all of it, or sell duplicates / everything at once.
   Prices follow your current Fish value and hook, so upgrading also lifts what you already hold.
5. While you're away the cat keeps fishing for up to your AFK time.
6. **Aquarium** (the second screen, Fishing | Aquarium switch above the bar): move fish from the
   inventory into the tank instead of selling them. Each one earns 1% of its sale price per minute
   (x decorations); slots grow from 3 to 12. It keeps earning at a quarter pace while you're away.
   Balance lives in `src/game/aquarium.ts`; the tank is drawn by `src/aquarium/`.

## Toward Google Play

- The web build can be wrapped as an Android app with Capacitor (`@capacitor/android`).
- Saves use `localStorage`, which persists inside the Capacitor WebView. Swap in
  `@capacitor/preferences` later for extra safety.
- Drawing resolution is capped at 2× for smooth frames on mid-range phones.
