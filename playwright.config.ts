import { defineConfig, devices } from '@playwright/test';

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent };

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    { name: 'mobile', testIgnore: /budgets/, use: phone },
    { name: 'small', testMatch: /layout/, use: { ...phone, viewport: { width: 360, height: 640 } } },
    { name: 'budgets', testMatch: /budgets/, use: phone },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
