import { defineConfig, devices } from '@playwright/test';

const remoteURL = process.env.PAGES_URL;
export default defineConfig({
  testDir: './tests',
  testMatch: 'pages.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: remoteURL || 'http://127.0.0.1:4180/cozy-days-app/',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {},
  },
  webServer: remoteURL ? undefined : {
    command: 'npm run preview:pages',
    url: 'http://127.0.0.1:4180/cozy-days-app/',
    reuseExistingServer: false,
  },
  projects: [{ name: 'pages-chromium', use: { ...devices['Desktop Chrome'] } }],
});
