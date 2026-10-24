import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:['period*.spec.ts','todo.spec.ts'],workers:1,timeout:40_000,
  use:{baseURL:'http://127.0.0.1:5193',timezoneId:'Asia/Shanghai',viewport:{width:393,height:852},trace:'retain-on-failure',launchOptions:process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5193 --strictPort',url:'http://127.0.0.1:5193',reuseExistingServer:false},
  projects:[{name:'period-chromium',use:{...devices['Desktop Chrome'],viewport:{width:393,height:852}}}],
});
