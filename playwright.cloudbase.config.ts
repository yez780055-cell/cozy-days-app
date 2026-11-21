import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'cloudbase.spec.ts',
  outputDir: 'artifacts/cloudbase-test-results',
  timeout: 90000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4192' },
  webServer: {
    command: 'npm run build -- --outDir artifacts/cloudbase-test-web && npm run preview -- --host 127.0.0.1 --port 4192 --strictPort --outDir artifacts/cloudbase-test-web',
    url: 'http://127.0.0.1:4192',
    env: { VITE_CLOUDBASE_ENABLED: 'true' },
    timeout: 120000,
  },
});
