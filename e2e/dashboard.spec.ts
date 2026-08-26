import { test, expect, type Page } from '@playwright/test';

/**
 * Layout assertions for the dashboard.
 *
 * These measure real boxes from a real layout engine. That is the whole point:
 * the explainer landing at the bottom of the page instead of beside the timer
 * was a media-query problem, and no jsdom test can see it.
 */

/**
 * Wait until the ring stops moving.
 *
 * Recent and the running-session lookup both land after first paint and can
 * nudge the layout a few pixels, so a test about the panel would otherwise be
 * measuring an unrelated fetch. Not `networkidle`: Next's dev server holds an
 * HMR websocket open, so the network never actually goes idle and the wait just
 * burns its timeout.
 */
async function waitForStableLayout(page: Page) {
  let previous = Number.NaN;
  await expect
    .poll(
      async () => {
        const box = await page.locator('.timer-ring-wrapper').boundingBox();
        const y = box ? Math.round(box.y) : -1;
        const stable = y === previous;
        previous = y;
        return stable;
      },
      { timeout: 5_000, intervals: [100, 100, 150, 200, 300] }
    )
    .toBe(true);
}

/** Reopen the explainer if a previous run left it dismissed. */
async function ensurePanelOpen(page: Page) {
  const restore = page.getByRole('button', { name: /how tracksesh works/i });
  if (await restore.isVisible().catch(() => false)) await restore.click();
  await expect(page.getByRole('heading', { name: /a ledger, not a focus timer/i })).toBeVisible();
}

test.describe('dashboard layout', () => {
  test.beforeEach(async ({ page }) => {
    // Session comes from the `setup` project's saved storage state.
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /^(start|pause|resume)$/i }).first()).toBeVisible();
    await waitForStableLayout(page);
    await ensurePanelOpen(page);
  });

  test('explainer sits beside the timer, not below it', async ({ page }, testInfo) => {
    const panel = page.locator('.info-panel');
    const ring = page.locator('.timer-ring-wrapper');

    const panelBox = (await panel.boundingBox())!;
    const ringBox = (await ring.boundingBox())!;

    await testInfo.attach('viewport', { body: JSON.stringify(page.viewportSize()) });

    if (testInfo.project.name === 'mobile') {
      // Narrow: stacked is correct, but the timer must still come first.
      expect(ringBox.y).toBeLessThan(panelBox.y);
      return;
    }

    // Wide: side by side. The panel's left edge is left of the ring's, and the
    // two overlap vertically rather than sitting one under the other.
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(ringBox.x + 1);

    const overlap =
      Math.min(panelBox.y + panelBox.height, ringBox.y + ringBox.height) -
      Math.max(panelBox.y, ringBox.y);
    expect(overlap, 'panel and ring should share vertical space').toBeGreaterThan(0);
  });

  test('the timer stays horizontally centred', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'single column');

    const ringBox = (await page.locator('.timer-ring-wrapper').boundingBox())!;
    const viewport = page.viewportSize()!;

    const ringCentre = ringBox.x + ringBox.width / 2;
    // The reserved empty third column exists precisely to keep this true.
    expect(Math.abs(ringCentre - viewport.width / 2)).toBeLessThan(24);
  });

  test('closing the explainer leaves the timer where it was', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'single column');

    const before = (await page.locator('.timer-ring-wrapper').boundingBox())!;
    await page.getByRole('button', { name: /close a ledger/i }).click();
    await expect(page.locator('.info-panel')).toHaveCount(0);

    const after = (await page.locator('.timer-ring-wrapper').boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);
    expect(Math.abs(after.y - before.y)).toBeLessThan(2);

    // And it must be reopenable — closing is never a dead end.
    await expect(page.getByRole('button', { name: /how tracksesh works/i })).toBeVisible();
  });

  test('the panel does not push Recent down', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'single column');

    // Recent is fetched in an effect, so it isn't in the DOM at first paint.
    // Counting immediately reports zero and silently skips the assertion.
    const recent = page.locator('.recent-blocks');
    const appeared = await recent
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (!appeared) test.skip(true, 'no finished sessions on this account');

    const recentBox = (await recent.boundingBox())!;
    const panelBox = (await page.locator('.info-panel').boundingBox())!;

    // Recent lives in the centre column, so it starts above wherever the left
    // panel happens to end.
    expect(recentBox.x).toBeGreaterThan(panelBox.x + panelBox.width - 1);
  });

  test('nothing overflows horizontally', async ({ page }) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, 'page should not scroll sideways').toBeLessThanOrEqual(1);
  });
});
