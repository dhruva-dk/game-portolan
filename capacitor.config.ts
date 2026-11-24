import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dhruvakumar.portolan',
  appName: 'Portolan',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: '#f1e4c8',
  },
};

export default config;
