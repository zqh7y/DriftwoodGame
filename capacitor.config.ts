import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor wraps the Vite build (dist/) in a native Android app.
// Dusk-sky blue (the 'top' colour of the dusk keyframe in src/engine/lighting.ts)
// shows behind the WebView while the game boots, so the start feels calm, not white.
const DUSK_SKY = '#2c3577';

const config: CapacitorConfig = {
  appId: 'com.zqh7y.driftwooddock',
  appName: 'Driftwood Dock',
  webDir: 'dist',
  backgroundColor: DUSK_SKY,
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: DUSK_SKY,
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
