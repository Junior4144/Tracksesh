import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export async function checkDeployment(base, request = fetch) {
  async function get(path) {
    return request(new URL(path, base), { signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
  }
  const health = await get('/api/health');
  assert.equal(health.status, 200, '/api/health should be healthy');
  assert.equal((await health.json()).status, 'ok');
  for (const path of ['/admin', '/admin/traffic']) {
    const page = await get(path);
    assert.equal(page.status, 200, `${path} should serve the SPA`);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
    assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  }
  for (const path of ['/api/admin/', '/api/admin/sites', '/api/admin/traffic']) {
    assert.equal((await get(path)).status, 401, `${path} should deny anonymous access`);
  }
}

export async function waitForDeployment(base, {
  request = fetch, attempts = 12, delayMs = 5000, wait = setTimeout, log = console.log,
} = {}) {
  // Lightsail can report ACTIVE before every request reaches the new release.
  // Retry the entire suite; never accept a missing or anonymously accessible API.
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await checkDeployment(base, request);
      log(`Health, admin SPA routes, CSP and anonymous API denials passed for ${new URL(base).host}.`);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      log(`Smoke check ${attempt}/${attempts} failed for ${new URL(base).host}: ${error.message}. Retrying.`);
      await wait(delayMs);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await waitForDeployment(new URL(process.argv[2]));
}
