import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDeployment } from './deployment-smoke.mjs';

function response(path, apiStatus = 401) {
  if (path === '/api/health') return Response.json({ status: 'ok' });
  if (path.startsWith('/api/')) return new Response(null, { status: apiStatus });
  return new Response('<html></html>', { headers: {
    'Content-Type': 'text/html', 'Content-Security-Policy': "script-src 'self'", 'Cache-Control': 'no-store, max-age=0',
  } });
}
const options = { attempts: 3, delayMs: 0, wait: async () => {}, log: () => {} };

test('rechecks every route when an old release answers during rollout', async () => {
  let passes = 0;
  const paths = [];
  await waitForDeployment('https://example.com', { ...options, request: async url => {
    paths.push(url.pathname);
    if (url.pathname === '/api/health') passes++;
    return response(url.pathname, passes < 3 ? 404 : 401);
  } });
  assert.equal(passes, 3);
  assert.equal(paths.filter(path => path === '/admin/traffic').length, 3);
  assert.equal(paths.at(-1), '/api/admin/traffic');
});

for (const status of [404, 200, 500]) {
  test(`persistent admin HTTP ${status} fails after bounded retries`, async () => {
    let passes = 0;
    await assert.rejects(waitForDeployment('https://example.com', {
      ...options, request: async url => {
        if (url.pathname === '/api/health') passes++;
        return response(url.pathname, status);
      },
    }), /should deny anonymous access/);
    assert.equal(passes, 3);
  });
}

test('missing CSP remains a deployment failure', async () => {
  await assert.rejects(waitForDeployment('https://example.com', {
    ...options, request: async url => url.pathname === '/admin'
      ? new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } })
      : response(url.pathname),
  }), /script-src/);
});

test('cacheable recovery HTML remains a deployment failure', async () => {
  await assert.rejects(waitForDeployment('https://example.com', {
    ...options, request: async url => {
      const result = response(url.pathname);
      if (url.pathname === '/auth/confirm') result.headers.delete('cache-control');
      return result;
    },
  }), /must not cache an old app shell/);
});
