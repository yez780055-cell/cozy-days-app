import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolate from other worktrees' dev servers and their in-progress code.
export default defineConfig({
  ...base,
  testMatch: ['anniversary*.spec.ts', 'todo.spec.ts', 'categories-time.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5173', timezoneId: 'Asia/Shanghai' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
