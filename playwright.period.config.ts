import { defineConfig, devices } from '@playwright/test';
import { localWebServer } from './playwright.config';
export default defineConfig({
  testDir:'./tests',testMatch:['period*.spec.ts','todo.spec.ts'],workers:1,timeout:40_000,
  use:{baseURL:'http://127.0.0.1:5193',timezoneId:'Asia/Shanghai',viewport:{width:393,height:852},trace:'retain-on-failure',launchOptions:process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}},
  webServer:localWebServer(5193),
  projects:[{name:'period-chromium',use:{...devices['Desktop Chrome'],viewport:{width:393,height:852}}}],
});
