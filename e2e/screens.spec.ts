import { test, expect, type Page } from '@playwright/test';

/**
 * Writes screenshots to test-results/screens/ so the rendered result can be
 * looked at rather than inferred. Not assertions — `dashboard.spec.ts` does the
 * checking; this exists to make the output visible.
 */

/**
 * Drive the real toggle rather than poking localStorage: <html data-theme> is
 * the source of truth and React re-asserts it, so a guessed storage key looks
 * like it worked and silently gives you the old theme back.
 */
async function setTheme(page: Page, theme: 'dark' | 'light') {
  const current = await page.evaluate(() => document.documentElement.dataset.theme);
  if (current === theme) return;

  // On narrow viewports the toggle is inside the collapsed menu.
  const toggle = page.getByRole('button', { name: /switch to (light|dark) mode/i });
  if (!(await toggle.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /toggle navigation/i }).click();
    await expect(toggle).toBeVisible();
  }

  await toggle.click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .toBe(theme);
}

test('capture screens', async ({ page }, testInfo) => {
  const dir = `test-results/screens/${testInfo.project.name}`;
  // Session comes from the `setup` project's saved storage state.
  await page.goto('/dashboard');

  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);

    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/dashboard-${theme}.png`, fullPage: true });

    await page.goto('/activity');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/activity-week-${theme}.png`, fullPage: true });

    // Table view is the piece that had unthemed Bootstrap defaults.
    const toggle = page.getByRole('button', { name: /show table/i });
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.screenshot({ path: `${dir}/activity-table-${theme}.png`, fullPage: true });
    }

    const day = page.getByRole('button', { name: /^day$/i });
    if (await day.isVisible().catch(() => false)) {
      await day.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${dir}/activity-day-${theme}.png`, fullPage: true });
    }

    await page.goto('/tags');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/tags-${theme}.png`, fullPage: true });

    await page.goto('/account');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/account-${theme}.png`, fullPage: true });
  }
});

/**
 * The signed-out screens, captured separately because the session in this
 * project's storage state would redirect straight past them.
 */
test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('capture auth screens', async ({ page }, testInfo) => {
    const dir = `test-results/screens/${testInfo.project.name}`;

    for (const path of ['/login', '/forgot-password', '/auth/link-expired']) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      await page.screenshot({
        path: `${dir}/${path.replace(/\//g, '-').replace(/^-/, '')}.png`,
        fullPage: true,
      });
    }
  });
});
