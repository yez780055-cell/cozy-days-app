import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.littledays.capacitorexperiment',
  appName: '小饱日常 · 原生测试',
  webDir: 'dist-android',
  backgroundColor: '#fbf6ec',
  android: { adjustMarginsForEdgeToEdge: 'disable', resolveServiceWorkerRequests: false },
  server: { hostname: 'localhost', androidScheme: 'https' },
};
export default config;
