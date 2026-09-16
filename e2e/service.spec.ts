import { test, expect } from '@playwright/test';

// Real authentication and API responses only. This suite does not write to the
// hosted ledger; deterministic mutation and outage scenarios live in ui.spec.ts.
test('hosted ledger loads and survives a browser refresh', async ({ page }) => {
  const [recent, session] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/blocks/recent'),
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/session'),
    page.goto('/dashboard'),
  ]);
  expect(recent.status(), 'Recent sessions API must succeed, not just render an error panel').toBe(
    200,
  );
  expect(Array.isArray(await recent.json())).toBe(true);
  expect(session.status(), 'Running session lookup must succeed').toBe(200);
  await expect(page.locator('.timer-workspace .state-label')).not.toContainText(
    /Connecting|Unavailable/,
  );
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);

  const [restored] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/session'),
    page.reload(),
  ]);
  expect(restored.status()).toBe(200);
  await expect(page).toHaveURL(/dashboard/);

  const [tags] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/tags'),
    page.goto('/tags'),
  ]);
  expect(tags.status()).toBe(200);
  expect(Array.isArray(await tags.json())).toBe(true);

  const [activity] = await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === '/api/blocks'),
    page.goto('/activity'),
  ]);
  expect(activity.status()).toBe(200);
  expect(Array.isArray(await activity.json())).toBe(true);
  await expect(page.locator('main [role="alert"]')).toHaveCount(0);
});
