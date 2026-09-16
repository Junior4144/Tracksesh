import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', event => {
      document.documentElement.setAttribute('data-csp-violation', event.violatedDirective);
    });
  });
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).not.toHaveAttribute('data-csp-violation');
});

const setup = { status: 'setup', message: 'Configure the provider in the API environment.', data: null };
const site = { site_id: '7cd7d061-3386-46ee-9f88-a87a6915c013', name: 'Tracksesh', domain: 'tracksesh.com' };
const base = {
  site, target: { status: 'connected', message: 'Current target DNS.', data: { dns_status: 'resolved', addresses: [], lookups: [], proxycheck_status: 'not_configured' } },
  generated_at: '2026-09-16T12:00:00Z', posthog: setup, cloudflare: setup, quotas: setup,
  capture: { enabled: false, ready: false, ip_trust_configured: false, enrichment_configured: false, dropped_this_process: 0, failed_this_process: 0 },
};
const live = {
  ...base,
  posthog: { status: 'connected', message: 'Origin requests, not people.', data: {
    summary: [[124, 38, 19, 101]], daily: [['2026-09-16', 124]], countries: [['United States', 124]], paths: [['/', 124]],
    recent: [['2026-09-16T12:00:00Z', '/', '2001:db8::1', 'United States', 'Example city', 'Example provider', 'hosting', 'suspected', 'Declared automation user-agent', true, false, false]],
  } },
  cloudflare: { status: 'connected', message: 'Edge estimates include cached requests and assets.', data: {
    totals: [{ count: 2048, sum: { edgeResponseBytes: 5242880, visits: 32 } }], daily: [{ count: 2048, dimensions: { date: '2026-09-16' } }],
  } },
};

async function signIn(page: Page, report: unknown = base, denied = false) {
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/token') ? { access_token: 'fixture-token', refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user } : user }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/admin') && denied) return route.fulfill({ status: 403, json: { message: 'Administrator access is required.' } });
    if (path === '/api/admin/access') return route.fulfill({ json: { is_admin: true } });
    if (path === '/api/admin/sites') return route.fulfill({ json: [site] });
    if (path === '/api/admin/traffic') return route.fulfill({ json: report });
    if (path === '/api/admin/') return route.fulfill({ json: { security: [{ name: 'Admin identity', detail: 'Verified on every request.' }], database: { status: 'connected', message: 'Catalog estimates only.', data: [{ name: 'time_blocks', rls_enabled: true, policies: 4, estimated_rows: 123 }] } } });
    if (path === '/api/time') return route.fulfill({ json: { now: new Date().toISOString() } });
    return route.fulfill({ json: path === '/api/session' ? null : [] });
  });
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test('signed-out visitors are sent to sign-in', async ({ page }) => {
  await page.goto('/admin/traffic');
  await expect(page).toHaveURL(/login/);
  await expect(page.getByText('Recent requests', { exact: true })).toHaveCount(0);
});

test('ordinary accounts cannot view data or sample preview', async ({ page }) => {
  await signIn(page, live, true);
  await page.goto('/admin/traffic');
  await expect(page.getByRole('alert')).toContainText('Administrator access is required');
  await expect(page.getByText('2001:db8::1', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View sample preview' })).toHaveCount(0);
});

test('account links through admin to traffic and disconnected preview is explicit', async ({ page }) => {
  await signIn(page);
  await page.goto('/account');
  await page.getByRole('link', { name: 'Admin dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Database safeguards' })).toBeVisible();
  await page.getByRole('link', { name: /Open traffic panel/ }).click();
  await expect(page.getByRole('heading', { name: 'Cloudflare · domain traffic' })).toBeVisible();
  await expect(page.getByText('Setup needed', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'View sample preview' }).click();
  await expect(page.getByText('Sample preview — not live traffic', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Time range')).toBeDisabled();
  await page.getByRole('button', { name: 'Return to live data' }).click();
  await expect(page.getByText('Sample preview — not live traffic', { exact: true })).toHaveCount(0);
});

test('live widgets and filters fit the viewport', async ({ page }, info) => {
  await signIn(page, live);
  await page.goto('/admin/traffic');
  await expect(page.getByText('2001:db8::1', { exact: true })).toBeVisible();
  const request = page.waitForRequest(r => r.url().includes('/api/admin/traffic?') && new URL(r.url()).searchParams.get('days') === '7');
  await page.getByLabel('Time range').selectOption('7');
  await request;
  const filtered = page.waitForRequest(r => r.url().includes('network=hosting'));
  await page.getByLabel('Network').selectOption('hosting');
  await filtered;
  await expect(page.getByText('2,048', { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath('traffic.png'), fullPage: true });
});

test('provider failure remains distinct from empty traffic', async ({ page }) => {
  await signIn(page, { ...base, posthog: { status: 'error', message: 'PostHog is unavailable.', data: null } });
  await page.goto('/admin/traffic');
  await expect(page.getByRole('alert')).toContainText('PostHog is unavailable');
  await expect(page.getByText('No requests recorded in this window', { exact: true })).toHaveCount(0);
});

test('empty report and failed refresh do not leave old IP data visible', async ({ page }) => {
  await signIn(page, live);
  await page.goto('/admin/traffic');
  await expect(page.getByText('2001:db8::1', { exact: true })).toBeVisible();
  await page.route('**/api/admin/traffic?*', route => route.fulfill({ status: 403, json: { message: 'Administrator access is required.' } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('2001:db8::1', { exact: true })).toHaveCount(0);
  await page.unroute('**/api/admin/traffic?*');
  await page.route('**/api/admin/traffic?*', route => route.fulfill({ json: { ...base, posthog: { status: 'connected', message: 'No records.', data: { summary: [[0, 0, 0, 0]], daily: [], paths: [], countries: [], recent: [] } } } }));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('No requests recorded in this window', { exact: true })).toBeVisible();
});

test('site selection sends the canonical ID and clears the previous site data', async ({ page }) => {
  await signIn(page, live);
  const other = { site_id: '718fd258-2c74-4898-9bb4-86dbf4b95a19', name: 'Other site', domain: 'other.example.com' };
  await page.route('**/api/admin/sites', route => route.fulfill({ json: [site, other] }));
  await page.goto('/admin/traffic');
  await expect(page.getByText('2001:db8::1', { exact: true })).toBeVisible();
  await page.route('**/api/admin/traffic?*', async route => {
    const id = new URL(route.request().url()).searchParams.get('site_id');
    expect(id).toBe(other.site_id);
    await route.fulfill({ status: 404, json: { message: 'Monitored site not found or access is unavailable.' } });
  });
  await page.getByLabel('Monitored site').selectOption(other.site_id);
  await expect(page.getByRole('alert')).toContainText('Monitored site not found');
  await expect(page.getByText('2001:db8::1', { exact: true })).toHaveCount(0);
});
