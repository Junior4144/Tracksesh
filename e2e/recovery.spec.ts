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

const user = { id: '00000000-0000-4000-8000-000000000002', email: 'recovery@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `e30.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.c2ln`;
const session = { access_token: token, refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user };

async function fixture(page: Page, verifyStatus = 200, recoverStatus = 200) {
  let verifies = 0;
  let saved = '';
  await page.route('**/auth/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/recover')) return route.fulfill({ status: recoverStatus, json: recoverStatus === 200 ? {} : { message: 'Service unavailable' } });
    if (path.endsWith('/verify')) {
      verifies++;
      return route.fulfill({ status: verifyStatus, json: verifyStatus === 200 ? session : { message: 'Expired', error_code: 'otp_expired' } });
    }
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON().password;
    return route.fulfill({ json: path.endsWith('/token') ? session : user });
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === '/api/admin/access' ? { is_admin: false } : path === '/api/session' ? null : path === '/api/time' ? { now: new Date().toISOString() } : [] });
  });
  return { verifies: () => verifies, saved: () => saved };
}

test('request uses this origin and does not disclose account existence', async ({ page }) => {
  await fixture(page);
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(user.email);
  const request = page.waitForRequest(r => r.url().includes('/recover'));
  await page.getByRole('button', { name: 'Send reset link' }).click();
  const sent = await request;
  expect(new URL(sent.url()).searchParams.get('redirect_to')).toBe(new URL(page.url()).origin);
  await expect(page.getByRole('alert')).toContainText('has an account');
});

for (const status of [429, 503]) test(`email service failure ${status} is visible and retryable`, async ({ page }) => {
  await fixture(page, 200, status);
  await page.goto('/forgot-password');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('alert')).toContainText(status === 429 ? 'Too many requests' : 'Could not send');
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
});

for (const format of ['default', 'custom']) test(`${format} email opens reset form in a fresh browser and saves password`, async ({ page }) => {
  const state = await fixture(page);
  const path = format === 'default'
    ? `/login?returnUrl=%2Fdashboard#access_token=${token}&refresh_token=fixture-refresh&type=recovery`
    : '/auth/confirm?token_hash=fixture-hash&type=recovery&next=https://evil.example';
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/update-password$/);
  expect(page.url()).not.toContain('token');
  await page.getByLabel('New password', { exact: true }).fill('New-password-123!');
  await page.getByLabel('Confirm new password').fill('mismatch');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Passwords do not match.')).toBeVisible();
  expect(state.saved()).toBe('');
  await page.getByLabel('Confirm new password').fill('New-password-123!');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();
  expect(state.saved()).toBe('New-password-123!');
  if (format === 'custom') expect(state.verifies()).toBe(1);
});

for (const path of [
  '/#error=access_denied&error_code=otp_expired&type=recovery',
  '/auth/confirm?token_hash=used&type=recovery',
  '/auth/confirm',
]) test(`invalid recovery link has a clear resend path: ${path}`, async ({ page }) => {
  await fixture(page, 403);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: "This link didn't work" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a new reset link' })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/link-expired$/);
});

