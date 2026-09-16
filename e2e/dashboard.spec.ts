import { test, expect } from '@playwright/test';

// Live integration layout checks. UI fixture coverage lives in ui.spec.ts.
test.describe('dashboard layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByRole('button', { name: /^(start|pause|resume)$/i }).first(),
    ).toBeVisible();
  });

  test('stopwatch precedes recent sessions on mobile and shares a row on desktop', async ({
    page,
  }, info) => {
    const timer = (await page.locator('.timer-workspace').boundingBox())!;
    const recent = (await page.locator('.recent-blocks').boundingBox())!;
    if (info.project.name === 'mobile')
      expect(timer.y + timer.height).toBeLessThanOrEqual(recent.y);
    else {
      expect(timer.x + timer.width).toBeLessThan(recent.x);
      expect(Math.abs(timer.y - recent.y)).toBeLessThan(16);
    }
  });

  test('guidance can be dismissed without moving the stopwatch', async ({ page }) => {
    const restore = page.getByRole('button', { name: /how tracksesh works/i });
    if (await restore.isVisible()) await restore.click();
    const before = (await page.locator('.timer-workspace').boundingBox())!;
    await page.getByRole('button', { name: /close a ledger/i }).click();
    await expect(page.locator('.info-panel')).toHaveCount(0);
    const after = (await page.locator('.timer-workspace').boundingBox())!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    await expect(restore).toBeVisible();
  });

  test('nothing overflows horizontally', async ({ page }) => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
