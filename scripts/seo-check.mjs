// Verify the production build through the API, not Vite's development fallback.
// Usage: npm run test:seo -- http://localhost:5251
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5251';
const home = await fetch(`${base}/`);
assert.equal(home.status, 200);
const html = await home.text();
assert.match(html, /<h1[^>]*>Track your study time/);
assert.match(html, /Paused time is excluded/);
assert.match(html, /rel="canonical" href="https:\/\/tracksesh.com\/"/);
assert.doesNotMatch(html, /name="robots" content="noindex/);
for (const path of ['/tracksesh-icon.svg', '/tracksesh-icon-48.png', '/tracksesh-icon-180.png', '/tracksesh-icon-192.png', '/tracksesh-icon-512.png', '/favicon.ico', '/site.webmanifest']) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assert.ok(!response.headers.get('content-type')?.includes('text/html'), path);
}
for (const path of ['/login', '/register', '/planner', '/account/update-password', '/auth/confirm']) {
  const response = await fetch(`${base}${path}`);
  assert.equal(response.status, 200, path);
  assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/, path);
  const body = await response.text();
  assert.doesNotMatch(body, /rel="canonical"|<h1/, path);
}
for (const path of ['/seo-check-missing', '/api/seo-check-missing', '/assets/seo-check-missing.js']) {
  assert.equal((await fetch(`${base}${path}`)).status, 404, path);
}
const sitemap = await fetch(`${base}/sitemap.xml`);
assert.equal(sitemap.status, 200);
assert.deepEqual([...((await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g))].map(m => m[1]), ['https://tracksesh.com/']);
assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/tracksesh.com\/sitemap.xml/);

const browser = await chromium.launch();
try {
  const staticPage = await browser.newPage({ javaScriptEnabled: false });
  await staticPage.goto(base);
  assert.equal(await staticPage.locator('h1').count(), 1);
  assert.equal(await staticPage.getByRole('link', { name: 'Try the demo' }).getAttribute('href'), '/register#demo');
  await staticPage.close();

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (/content security policy|refused to (load|execute|connect|apply)/i.test(message.text())) errors.push(message.text());
  });
  await page.goto(base);
  await page.getByRole('link', { name: 'Try the demo' }).click();
  await page.locator('#demo').waitFor();
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'noindex, follow');
  assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('meta[name="robots"]')?.content === 'index, follow');
  assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
  await page.goto(`${base}/seo-check-missing`);
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
console.log('SEO checks passed: public HTML without JavaScript, metadata navigation, sitemap, deep links, 404s and public-page CSP.');
