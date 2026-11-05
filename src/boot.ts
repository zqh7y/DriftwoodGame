// Creates the scene, registers layer modules, mounts the HUD and starts the loop.

import { Scene, TEST_SHORTCUTS, TOD_PRESETS, type LayerModule, type SceneState } from './engine';
import { audio } from './audio/audio';
import { Game } from './game/game';
import { mountGameUi } from './ui/game-ui';
import { mountHud } from './ui/hud';

interface HotHook {
  ready?: (start: (data: unknown) => void) => void;
  data?: unknown;
  snapshot?: (fn: () => unknown) => void;
}

export function boot(modules: LayerModule[]): void {
  const hot = (window as unknown as { claude?: { hot?: HotHook } }).claude?.hot;
  const start = (data: unknown): void => {
    const view = document.getElementById('view') as HTMLCanvasElement;
    const scene = new Scene(view, new URLSearchParams(location.search));
    const saved = data as Partial<SceneState> | undefined;
    if (saved && typeof saved === 'object' && 'tod' in saved) scene.setState(saved);
    // Test shortcut: open the page with #dawn, #day, #sunset or #night to start at that time.
    // The clock keeps running on its own either way.
    else if (TEST_SHORTCUTS) {
      const jump = location.hash.slice(1) as keyof typeof TOD_PRESETS;
      if (jump in TOD_PRESETS) scene.setState({ tod: TOD_PRESETS[jump] });
    }
    // The game (bones, upgrades, inventory, catch timer) runs before the art layers each frame.
    const game = new Game(scene);
    audio.attach(scene);
    scene.add([{ id: 'game.clock', z: -100, update: (_s, dt) => game.update(dt) }]);
    for (const m of modules) scene.add(m(scene));
    if (scene.query.get('ui') !== '0') {
      mountHud(scene);
      mountGameUi(scene, game);
    }
    scene.start();
    (window as unknown as { __scene?: Scene; __game?: Game }).__scene = scene;
    (window as unknown as { __game?: Game }).__game = game;
    hot?.snapshot?.(() => scene.getState());
  };
  if (hot?.ready) hot.ready(start);
  else start(hot?.data ?? {});
}
