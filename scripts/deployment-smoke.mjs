import assert from 'node:assert/strict';

const base = new URL(process.argv[2]);
async function get(path) {
  return fetch(new URL(path, base), { signal: AbortSignal.timeout(15000), redirect: 'error' });
}
assert.equal((await (await get('/api/health')).json()).status, 'ok');
for (const path of ['/admin', '/admin/traffic']) {
  const page = await get(path);
  assert.equal(page.status, 200, `${path} should serve the SPA`);
  assert.match(page.headers.get('content-type') ?? '', /text\/html/);
  assert.match(page.headers.get('content-security-policy') ?? '', /script-src 'self'/);
}
for (const path of ['/api/admin/', '/api/admin/sites', '/api/admin/traffic']) {
  assert.equal((await get(path)).status, 401, `${path} should deny anonymous access`);
}
console.log(`Health, admin SPA routes, CSP and anonymous API denials passed for ${base.host}.`);
