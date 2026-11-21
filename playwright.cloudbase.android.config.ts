import { defineConfig } from '@playwright/test';
import base from './playwright.cloudbase.config';
export default defineConfig({
  ...base,
  outputDir: 'artifacts/cloudbase-android-test-results',
  projects: [{ name: 'unified-android', metadata: { androidShell: true } }],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4193', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
  webServer: {
    command: 'npm exec -- vite preview --outDir dist-android --host 127.0.0.1 --port 4193 --strictPort',
    url: 'http://127.0.0.1:4193',
  },
});
