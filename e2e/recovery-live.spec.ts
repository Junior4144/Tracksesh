import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { test, expect } from '@playwright/test';

// Only the disposable local stack. Never create users or change passwords in production.
test('email delivery, cross-browser recovery, replacement password and used-link rejection', async ({ page, browser, request, baseURL }) => {
  test.skip(!process.env.LOCAL_SUPABASE_ADMIN_KEY, 'Requires the disposable Supabase + Mailpit stack used in CI.');
  test.setTimeout(60000);
  const url = process.env.VITE_SUPABASE_URL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const admin = createClient(url, process.env.LOCAL_SUPABASE_ADMIN_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const client = createClient(url, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `recovery-${randomUUID()}@example.com`;
  const oldPassword = `Old-${randomUUID()}!`;
  const newPassword = `New-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ email, password: oldPassword, email_confirm: true });
  expect(created.error).toBeNull();
  const id = created.data.user!.id;
  const otherBrowser = await browser.newContext();
  try {
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('alert')).toContainText('has an account');

    let messageId = '';
    await expect.poll(async () => {
      const response = await request.get(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      messageId = data.messages?.[0]?.ID ?? '';
      return !!messageId;
    }, { timeout: 15000 }).toBe(true);
    const message = await (await request.get(`http://127.0.0.1:54324/api/v1/message/${messageId}`)).json();
    const link = /href="([^"]+)"/.exec(message.HTML)?.[1]?.replaceAll('&amp;', '&');
    expect(link).toBeTruthy();
    expect(['localhost', '127.0.0.1']).toContain(new URL(link!).hostname);

    const recovery = await otherBrowser.newPage();
    await recovery.goto(link!);
    await expect(recovery.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    expect(new URL(recovery.url()).hash).toBe('');
    await recovery.getByLabel('New password', { exact: true }).fill(newPassword);
    await recovery.getByLabel('Confirm new password').fill(newPassword);
    await recovery.getByRole('button', { name: 'Save new password' }).click();
    await expect(recovery.getByRole('heading', { name: 'Password updated' })).toBeVisible();

    const oldLogin = await client.auth.signInWithPassword({ email, password: oldPassword });
    expect(oldLogin.error).not.toBeNull();
    const newLogin = await client.auth.signInWithPassword({ email, password: newPassword });
    expect(newLogin.error).toBeNull();
    await client.auth.signOut();

    await page.goto(link!);
    await expect(page.getByRole('heading', { name: "This link didn't work" })).toBeVisible();

    // Existing custom token-hash templates must still work with real GoTrue too.
    const generated = await admin.auth.admin.generateLink({ type: 'recovery', email });
    expect(generated.error).toBeNull();
    await page.goto(`/auth/confirm?token_hash=${generated.data.properties!.hashed_token}&type=recovery`);
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  } finally {
    await otherBrowser.close();
    const deleted = await admin.auth.admin.deleteUser(id);
    expect(deleted.error).toBeNull();
  }
});
