import { defineConfig } from 'vite';

// Relative base so the production build works from any folder (or file://).
export default defineConfig(({ command }) => ({
  base: './',
  // URL test shortcuts (#night, ?tod=…) exist only in dev, not in the release build.
  define: { __TEST_SHORTCUTS__: JSON.stringify(command === 'serve') },
  build: { target: 'es2020', assetsInlineLimit: 0 },
}));
