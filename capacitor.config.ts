import type { CapacitorConfig } from '@capacitor/cli';

// The blank sheet the app opens on: the launch screen's and the page's tone (index.html), which the title's paper takes
// its grain over (src/screens/title.ts BLANK), so the app opens on the sheet and nothing flashes.
const sheet = '#dfc8a2';

const config: CapacitorConfig = {
  appId: 'com.portolan.game',
  appName: 'Portolan',
  // the production build; `npm run ios:ipad:dev` alone names a shell whose page loads the code from this Mac (tools/ios.ts)
  webDir: process.env.PORTOLAN_DEV_SHELL || 'dist',
  backgroundColor: sheet,
  ios: {
    backgroundColor: sheet,
    contentInset: 'never', // the web view runs edge to edge; the game keeps clear of env(safe-area-inset-*)
    scrollEnabled: false, // no rubber-band bounce
  },
  plugins: {
    SystemBars: { hidden: true }, // no status bar; the home indicator fades out while the game is played
  },
};

export default config;
