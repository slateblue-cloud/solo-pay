import { defineConfig, devices } from '@playwright/test';

const WORKERS = parseInt(process.env.WORKERS || '3');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: WORKERS,
  reporter: [['list'], ['html', { outputFolder: '../../playwright-report', open: 'never' }]],
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL: process.env.MERCHANT_URL || 'http://localhost:3004',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
