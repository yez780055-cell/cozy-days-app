import { defineConfig } from '@playwright/test';
import base, { localWebServer } from './playwright.config';

// Keep the local-data fixture explicit on this dedicated server.
export default defineConfig({
  ...base,
  testMatch: ['anniversary*.spec.ts', 'todo.spec.ts', 'categories-time.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5186', timezoneId: 'Asia/Shanghai' },
  webServer: localWebServer(5186),
});
