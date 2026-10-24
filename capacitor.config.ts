import type { CapacitorConfig } from '@capacitor/cli';

// The parchment of the page behind the game (index.html) and of the launch screen, so launch never flashes white.
const parchment = '#c9ae80';

const config: CapacitorConfig = {
  appId: 'com.portolan.game',
  appName: 'Portolan',
  webDir: 'dist',
  backgroundColor: parchment,
  ios: {
    backgroundColor: parchment,
    contentInset: 'never', // the web view runs edge to edge; the game keeps clear of env(safe-area-inset-*)
    scrollEnabled: false, // no rubber-band bounce
  },
  plugins: {
    SystemBars: { hidden: true }, // no status bar; the home indicator fades out while the game is played
  },
};

export default config;
