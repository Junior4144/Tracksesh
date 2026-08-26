import { test as setup, expect } from '@playwright/test';

/**
 * Signs in once and saves the session for every other spec to reuse.
 *
 * Logging in per test meant ~15 password grants per run across three viewport
 * projects. Supabase rate-limits the auth endpoint, so runs started failing
 * intermittently — and the failures looked like layout flakiness rather than
 * what they were.
 */
const AUTH_FILE = 'playwright/.auth/user.json';

const EMAIL = process.env.E2E_EMAIL ?? 'demo@tracksesh.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'demo1234';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  // By id, not label: /password/i also matches the "Show password" toggle.
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('button', { name: /^(start|pause|resume)$/i }).first()).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
