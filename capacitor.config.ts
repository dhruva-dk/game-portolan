import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dhruvakumar.portolan',
  appName: 'Portolan',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    // the parchment (src/ui/ink.ts PAPER), as the launch screen: what shows until the first frame is drawn
    backgroundColor: '#f1e4c8',
  },
};

export default config;
