import type { CapacitorConfig } from '@capacitor/cli';

// The night of the page behind the game (index.html) and of the launch screen, so launch never flashes white.
const night = '#0d1520';

const config: CapacitorConfig = {
  appId: 'com.portolan.game',
  appName: 'Portolan',
  // the production build; `npm run ios:ipad:dev` alone names a shell whose page loads the code from this Mac (tools/ios.ts)
  webDir: process.env.PORTOLAN_DEV_SHELL || 'dist',
  backgroundColor: night,
  ios: {
    backgroundColor: night,
    contentInset: 'never', // the web view runs edge to edge; the game keeps clear of env(safe-area-inset-*)
    scrollEnabled: false, // no rubber-band bounce
  },
  plugins: {
    SystemBars: { hidden: true }, // no status bar; the home indicator fades out while the game is played
  },
};

export default config;
