import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: 'pwa-update.spec.ts', workers: 1, timeout: 60000, expect: { timeout: 12000 }, use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL || undefined } });
