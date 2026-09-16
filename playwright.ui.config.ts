import { defineConfig, devices } from '@playwright/test';

// Presentation contract tests use deterministic network fixtures, never a live database.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['ui.spec.ts', 'admin.spec.ts'],
  fullyParallel: true,
  use: {
    baseURL: process.env.UI_BASE_URL ?? 'http://localhost:5173',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1120, height: 800 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 } } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/login',
    reuseExistingServer: true,
  },
});
