/**
 * Loads the production build through the API and fails on any CSP violation.
 *
 * Worth having as a script rather than a spec: the Content-Security-Policy is
 * set by the .NET API, and `vite dev` serves the SPA itself — so the entire
 * policy is invisible during development, and the first time anything notices a
 * blocked script is in production. This drives the real thing.
 *
 *   node scripts/csp-check.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5251';
const EMAIL = process.env.E2E_EMAIL ?? 'demo@tracksesh.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'demo1234';

const browser = await chromium.launch();
const page = await browser.newPage();

const problems = [];

// The dedicated event, which fires whether or not anything logs.
page.on('console', (msg) => {
  const text = msg.text();
  if (/content security policy|refused to (load|execute|connect|apply)/i.test(text)) {
    problems.push(`CSP: ${text}`);
  } else if (msg.type() === 'error') {
    problems.push(`console.error: ${text}`);
  }
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  const failure = r.failure()?.errorText ?? '';
  // blockedbycsp / blockedbyclient are what a CSP refusal looks like here.
  if (/blocked/i.test(failure)) problems.push(`blocked request: ${r.url()} (${failure})`);
});

async function visit(path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  console.log(`  visited ${label}`);
}

try {
  await visit('/login', '/login');

  // The theme boot script is external now; if the CSP blocked it, <html> would
  // have no data-theme at all.
  const theme = await page.getAttribute('html', 'data-theme');
  if (!theme) problems.push('theme-boot.js did not run — data-theme is unset');
  else console.log(`  theme boot ran (data-theme=${theme})`);

  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
  console.log('  signed in (connect-src allows Supabase Auth)');

  // Each of these fetches from /api, so they exercise connect-src 'self' too.
  // /tags is last on purpose — the inline-style check below runs on it.
  for (const path of ['/dashboard', '/activity', '/account', '/tags']) {
    await visit(path, path);
  }

  /*
   * Tag colours are inline `style` attributes, which is the whole reason
   * style-src allows 'unsafe-inline'. Counting the elements is not enough —
   * they would still be in the DOM with the style silently dropped. Read the
   * computed background instead, which is what a user would actually see.
   */
  const swatch = page.locator('.tag-swatch').first();
  await swatch.waitFor({ timeout: 10_000 });
  const background = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);

  const painted = background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent';
  if (!painted) problems.push(`inline styles were dropped — swatch background is "${background}"`);
  else console.log(`  inline styles applied (swatch background ${background})`);
} catch (e) {
  problems.push(`navigation failed: ${e.message}`);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nno CSP violations, no console errors.');
