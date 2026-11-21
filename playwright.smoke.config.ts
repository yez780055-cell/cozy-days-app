import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const pages = process.env.SMOKE_PAGES === 'true';
const url = pages ? 'http://127.0.0.1:4180/cozy-days-app/' : 'http://127.0.0.1:4194';
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: 'ci-smoke.spec.ts',
  outputDir: 'artifacts/ci-smoke-results',
  use: { ...base.use, baseURL: url },
  webServer: {
    command: pages ? 'npm run preview:pages' : 'npm exec -- vite preview --outDir dist --host 127.0.0.1 --port 4194 --strictPort',
    url,
    reuseExistingServer: false,
  },
});
