import { defineConfig, devices } from '@playwright/test';

/**
 * Visual checks against a real browser.
 *
 * Deliberately separate from `npm test` (Vitest/jsdom): jsdom has no layout
 * engine and never evaluates a media query, so a unit test cannot tell you that
 * a grid column collapsed or a panel landed at the bottom of the page. Those
 * bugs are only visible to something that actually performs layout.
 *
 *   npm run e2e         run the checks
 *   npm run e2e:shots   write screenshots to test-results/screens/
 */
const STORAGE_STATE = 'playwright/.auth/user.json';

const viewports = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1120, height: 800 },
} as const;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    // Keeps runs comparable regardless of the machine's locale/zone.
    locale: 'en-GB',
    timezoneId: 'Europe/London',
  },
  projects: [
    // Signs in once; everything else reuses the saved session. Without this,
    // every test logged in separately and Supabase rate-limited the runs.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: viewports.desktop, storageState: STORAGE_STATE },
    },
    {
      name: 'laptop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: viewports.laptop, storageState: STORAGE_STATE },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: STORAGE_STATE },
    },
  ],
  /*
   * Both halves, because the app is now two processes.
   *
   * The API first: the dev server proxies /api to it, so a run that started
   * only Vite would render every page with its data requests failing and report
   * the result as a layout problem. Playwright waits for each `url` to answer
   * before starting the next, and /api/health is the one route that needs no
   * token.
   */
  webServer: [
    {
      command: 'npm run api',
      url: 'http://localhost:5251/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
