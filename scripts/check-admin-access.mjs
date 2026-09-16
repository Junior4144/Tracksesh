import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) loadEnvFile('.env');
const base = process.env.ADMIN_CHECK_BASE ?? 'http://localhost:5251';
for (const path of ['/api/admin/', '/api/admin/traffic']) {
  const response = await fetch(base + path);
  assert.equal(response.status, 401);
  console.log(`${path}: anonymous denied (401)`);
}
const auth = process.env.VITE_SUPABASE_URL + '/auth/v1';
const headers = { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
const response = await fetch(auth + '/token?grant_type=password', {
  method: 'POST', headers, body: JSON.stringify({ email: process.env.E2E_EMAIL ?? 'demo@tracksesh.com', password: process.env.E2E_PASSWORD ?? 'demo1234' }),
});
assert.equal(response.status, 200, 'Demo sign-in should succeed');
const session = await response.json();
try {
  const bearer = { Authorization: `Bearer ${session.access_token}` };
  const access = await fetch(base + '/api/admin/access', { headers: bearer });
  assert.equal(access.status, 200);
  assert.deepEqual(await access.json(), { is_admin: false });
  for (const path of ['/api/admin/', '/api/admin/traffic']) {
    const denied = await fetch(base + path, { headers: bearer });
    assert.equal(denied.status, 403);
    assert.match(denied.headers.get('cache-control'), /no-store/);
    console.log(`${path}: ordinary account denied (403), no-store`);
  }
} finally {
  await fetch(auth + '/logout?scope=local', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${session.access_token}` } });
}
