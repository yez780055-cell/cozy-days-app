import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:4191';

export default defineConfig({
  testDir: './tests-android',
  workers: 1,
  use: {
    baseURL: url,
    viewport: { width: 360, height: 740 },
    timezoneId: 'Asia/Shanghai',
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: {
    command: 'npm exec -- vite preview --outDir dist-android --host 127.0.0.1 --port 4191 --strictPort',
    url,
  },
});
