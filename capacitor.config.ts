import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.littledays.app',
  appName: '小日子',
  webDir: 'dist',
  backgroundColor: '#fcf8f1',
  android: { adjustMarginsForEdgeToEdge: 'auto' },
  plugins: { Keyboard: { resize: 'body', resizeOnFullScreen: true } },
};
export default config;
