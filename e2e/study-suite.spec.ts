import { test, expect, type Page } from '@playwright/test';
import { studyWorkspace } from './study-fixture';

async function addTime(page: Page) {
  await page.goto('/insights?add=1');
  await expect(page.getByRole('button', { name: 'Biology', exact: true })).toBeVisible();
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.locator('#abDate').fill(today);
  await page.locator('#abStart').fill('00:00');
  await page.locator('#abEnd').fill('00:30');
  await page.getByRole('button', { name: 'Biology', exact: true }).click();
  await page.locator('#abNote').fill('First study session');
  await page.getByRole('button', { name: 'Add to my day' }).click();
  await expect(page.locator('.session-table')).toContainText('First study session');
}

test('manual session create, edit, cancel deletion, delete and refresh', async ({ page }) => {
  const state = await studyWorkspace(page);
  await addTime(page);
  expect(state.getBlocks()).toHaveLength(1);
  await page.getByRole('button', { name: 'Edit Biology session' }).click();
  await page.locator('#ebNote').fill('Revised study notes');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.session-table')).toContainText('Revised study notes');
  await page.reload();
  await expect(page.locator('.session-table')).toContainText('Revised study notes');
  await page.getByRole('button', { name: 'Delete Biology session' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.getBlocks()).toHaveLength(1);
  await page.getByRole('button', { name: 'Delete Biology session' }).click();
  await page.getByRole('button', { name: 'Delete block', exact: true }).click();
  await expect(page.getByText('Nothing tracked in this range')).toBeVisible();
  expect(state.getBlocks()).toHaveLength(0);
});

test('failed session deletion stays visible and can be retried', async ({ page }) => {
  await studyWorkspace(page);
  await addTime(page);
  await page.route('**/api/blocks/*', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, json: { message: 'Try again shortly.' } })
      : route.fallback(),
  );
  await page.getByRole('button', { name: 'Delete Biology session' }).click();
  await page.getByRole('button', { name: 'Delete block', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.unroute('**/api/blocks/*');
  await page.getByRole('button', { name: 'Delete block', exact: true }).click();
  await expect(page.getByText('Nothing tracked in this range')).toBeVisible();
});

test('timer finished on Insights immediately appears with saved label', async ({ page }) => {
  await studyWorkspace(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  const dock = page.getByRole('complementary', { name: 'Active study session' });
  await dock.getByRole('button', { name: 'Pause', exact: true }).click();
  await dock.getByRole('button', { name: 'Resume', exact: true }).click();
  await dock.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Biology', exact: true }).click();
  await page.locator('#sessionNote').fill('Dock completion');
  await page.getByRole('button', { name: 'Save to my day' }).click();
  await expect(page.locator('.session-table')).toContainText('Dock completion');
  await expect(page.locator('.session-table')).toContainText('Biology');
});

test('month navigation never skips February at month end', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-31T12:00:00Z'));
  await studyWorkspace(page);
  await page.goto('/insights');
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.locator('.range-label')).toHaveText('January 2026');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.range-label')).toHaveText('February 2026');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.range-label')).toHaveText('March 2026');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.range-label')).toHaveText('February 2026');
});

test('subjects create, rename, archive, restore and delete', async ({ page }) => {
  const state = await studyWorkspace(page);
  await page.goto('/subjects');
  await page.getByRole('button', { name: '+ New subject', exact: true }).click();
  await page.getByRole('textbox', { name: 'Subject name' }).fill('Chemistry');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  let row = page.locator('.tag-row').filter({ hasText: 'Chemistry' });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Subject name' }).fill('Organic chemistry');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  row = page.locator('.tag-row').filter({ hasText: 'Organic chemistry' });
  await row.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Restore' })).toBeVisible();
  await page.reload();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(row.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Delete Organic chemistry' }).click();
  await page.getByRole('button', { name: 'Delete subject', exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(state.getTags().map((t) => t.name)).toEqual(['Biology', 'Mathematics']);
});

test('homepage projection responds to keyboard and fits a narrow screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('slider').focus();
  await page.getByRole('slider').press('Home');
  await expect(page.locator('.potential-results')).toContainText('2h 30m');
  await page.getByRole('slider').press('End');
  await expect(page.locator('.potential-results')).toContainText('730h');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await page.getByRole('link', { name: 'Get started', exact: true }).first().click();
  await expect(page).toHaveURL(/register/);
});

test('corrupt saved plan falls back safely and no weekdays cannot be saved', async ({ page }) => {
  const { user } = await studyWorkspace(page);
  await page.evaluate(
    (id) => localStorage.setItem(`tracksesh:study-plan:v1:${id}`, '{invalid'),
    user.id,
  );
  await page.goto('/planner');
  await expect(page.getByLabel('Study minutes per day')).toHaveValue('20');
  for (const name of [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Save plan', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Monday', exact: true }).click();
  await page.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plan saved');
});

test('a failed manual save preserves input and a retry creates only one session', async ({
  page,
}) => {
  const state = await studyWorkspace(page);
  await page.route('**/api/blocks', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 503, json: { message: 'Temporary outage' } })
      : route.fallback(),
  );
  await page.goto('/insights?add=1');
  await page.locator('#abStart').fill('00:00');
  await page.locator('#abEnd').fill('00:30');
  await page.locator('#abNote').fill('Keep these notes');
  await page.getByRole('button', { name: 'Add to my day' }).click();
  await expect(page.locator('#abNote')).toHaveValue('Keep these notes');
  await expect(page.getByText('Temporary outage', { exact: true })).toBeVisible();
  expect(state.getBlocks()).toHaveLength(0);
  await page.unroute('**/api/blocks');
  await page.getByRole('button', { name: 'Add to my day' }).click();
  await expect(page.locator('.session-table')).toContainText('Keep these notes');
  expect(state.getBlocks()).toHaveLength(1);
});
