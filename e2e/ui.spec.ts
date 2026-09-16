import { test, expect, type Page } from '@playwright/test';
import type { TimeBlock } from '../src/lib/types';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      document.documentElement.setAttribute('data-csp-violation', event.violatedDirective);
    });
  });
});

test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).not.toHaveAttribute('data-csp-violation');
});

async function fixture(page: Page) {
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'alex@example.com',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
  const tags = ['Reading', 'Studying', 'Writing', 'Exercise'].map((name, i) => ({
    id: i + 1,
    user_id: user.id,
    name,
    color: ['blue', 'aqua', 'yellow', 'violet'][i],
    is_archived: false,
    created_at: user.created_at,
  }));
  const now = Date.now();
  const blocks = tags.map((tag, i) => ({
    id: i + 1,
    user_id: user.id,
    tag_id: tag.id,
    tag,
    note: [
      'A few chapters before work',
      'Distributed systems',
      'Notes for the next project',
      'An afternoon outside',
    ][i],
    started_at: new Date(now - (i + 1) * 7200000).toISOString(),
    ended_at: new Date(now - (i + 1) * 7200000 + (i + 1) * 900000).toISOString(),
    paused_at: null,
    paused_seconds: 0,
    source: 'timer',
    created_at: user.created_at,
    updated_at: user.created_at,
  }));
  let session: TimeBlock | null = null;
  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    await route.fulfill({
      json: url.includes('/token')
        ? {
            access_token: 'fixture-token',
            refresh_token: 'fixture-refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user,
          }
        : user,
    });
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/time') return route.fulfill({ json: { now: new Date().toISOString() } });
    if (path === '/api/session/start')
      session = {
        ...blocks[0],
        id: 100,
        started_at: new Date().toISOString(),
        ended_at: null,
        tag_id: null,
        note: null,
        source: 'timer',
      };
    if (path === '/api/session/pause' && session) session.paused_at = new Date().toISOString();
    if (path === '/api/session/resume' && session) session.paused_at = null;
    if (path === '/api/session/stop' && session) {
      const stopped = { ...session, ended_at: new Date().toISOString() };
      session = null;
      return route.fulfill({ json: stopped });
    }
    if (path.startsWith('/api/session')) return route.fulfill({ json: session });
    if (path === '/api/tags/usage')
      return route.fulfill({
        json: tags.map((tag) => ({ tag_id: tag.id, block_count: 1, total_seconds: 1800 })),
      });
    if (path.startsWith('/api/tags')) return route.fulfill({ json: tags });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204 });
    return route.fulfill({ json: blocks });
  });
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

test('all workspaces share responsive neutral presentation', async ({ page }, info) => {
  await fixture(page);
  await page.getByRole('link', { name: 'Tracksesh', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Open timer' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
  for (const mode of ['neutral']) {
    for (const path of [
      '',
      'dashboard',
      'activity',
      'tags',
      'account',
      'account/update-password',
    ]) {
      await page.goto(`/${path}`);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('h1')).toBeVisible();
      if (path === 'activity') await expect(page.locator('.session-table')).toBeVisible();
      if (path === 'tags') await expect(page.locator('.tag-row')).toHaveCount(4);
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/ui/${info.project.name}/${path.replace('/', '-')}-${mode}.png`,
        fullPage: true,
      });
    }
  }
});

test('timer flow survives navigation and dialogs contain keyboard focus', async ({
  page,
}, info) => {
  await fixture(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await page.goto('/activity');
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Reading', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Reading', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await dialog.locator('#sessionNote').fill('A useful session');
  await page.screenshot({
    path: `test-results/ui/${info.project.name}/label-dialog.png`,
    fullPage: true,
  });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate(
        (el) => el.contains(document.activeElement) || document.activeElement === document.body,
      ),
    ).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Save to my day' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
  await page.goto('/activity');
  await page.getByRole('button', { name: 'Edit Reading session' }).click();
  await expect(dialog).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Reading session' })).toBeFocused();
});

test('empty and error states remain distinct', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/blocks/recent*', (route) => route.fulfill({ json: [] }));
  await page.reload();
  await expect(page.getByText('Your ledger starts here')).toBeVisible();
  await page.route('**/api/blocks/recent*', (route) =>
    route.fulfill({ status: 500, json: { message: 'Unavailable' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Recent sessions couldn’t load');
  await page.route('**/api/blocks?*', (route) =>
    route.fulfill({ status: 500, json: { message: 'Unavailable' } }),
  );
  await page.goto('/activity');
  await expect(page.getByRole('alert')).toContainText('Activity couldn’t load');
  await noOverflow(page);
});

test('authentication screens use the same compact layout', async ({ page }, info) => {
  for (const mode of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: mode });
    await page.addInitScript((saved) => localStorage.setItem('tracksesh_theme', saved), mode);
    for (const path of ['', 'login', 'register', 'forgot-password', 'auth/link-expired']) {
      await page.goto(`/${path}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByRole('button', { name: /switch to .* mode/i })).toHaveCount(0);
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(214, 215, 206)');
      if (path === '') {
        await expect(
          page.locator('main').getByRole('link', { name: 'Get started' }),
        ).toHaveAttribute('href', '/register');
        await expect(page.locator('main').getByRole('link', { name: 'Sign in' })).toHaveAttribute(
          'href',
          '/login',
        );
      }
      await noOverflow(page);
      await page.screenshot({
        path: `test-results/ui/${info.project.name}/${path.replace('/', '-')}-${mode}.png`,
        fullPage: true,
      });
    }
  }
});

test('manual entry, tag editor, and confirmation fit on small screens', async ({ page }, info) => {
  await fixture(page);
  await page.getByRole('link', { name: 'Add time manually' }).click();
  await expect(page.getByRole('button', { name: 'Add to my day' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/ui/${info.project.name}/manual-entry.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('.day-strip-track')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/ui/${info.project.name}/activity-day.png`,
    fullPage: true,
  });
  await page.goto('/tags');
  await page.getByRole('button', { name: '+ New tag' }).click();
  await expect(page.getByRole('textbox', { name: 'Tag name' })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/ui/${info.project.name}/tag-editor.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Reading', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
