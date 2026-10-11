import { test, expect } from '@playwright/test';

// Read-only live integration checks; mutations are covered by stateful fixtures.
test.describe('study suite with live data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByRole('button', { name: /^(start|pause|resume)$/i }).first(),
    ).toBeVisible();
  });

  test('timer precedes history and sits alongside the plan on wide screens', async ({
    page,
  }, info) => {
    const timer = (await page.locator('.timer-workspace').boundingBox())!;
    const recent = (await page.locator('.recent-blocks').boundingBox())!;
    if (info.project.name === 'laptop') {
      expect(timer.x + timer.width).toBeLessThanOrEqual(recent.x);
    } else expect(timer.y + timer.height).toBeLessThanOrEqual(recent.y);
    if (info.project.name === 'desktop') {
      const plan = (await page.locator('.today-plan').boundingBox())!;
      expect(Math.abs(timer.y - plan.y)).toBeLessThan(16);
    }
  });

  test('suite navigation loads planner, subjects and recorded insights', async ({ page }) => {
    for (const name of ['Planner', 'Subjects', 'Insights']) {
      const response = page.waitForResponse((r) =>
        new URL(r.url()).pathname.startsWith(name === 'Insights' ? '/api/blocks' : '/api/tags'),
      );
      await page.getByRole('link', { name, exact: true }).click();
      expect((await response).ok()).toBe(true);
      await expect(
        page.getByRole('heading', {
          name: name === 'Planner' ? 'Make room for learning.' : name,
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.getByText(/couldn.t load|could not load/i)).toHaveCount(0);
    }
  });

  test('nothing overflows horizontally', async ({ page }) => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
