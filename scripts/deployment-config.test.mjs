import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trafficConfig, containerDefinition } from './deployment-config.mjs';

const siteId = '7cd7d061-3386-46ee-9f88-a87a6915c013';
function settings() {
  return {
    TRAFFIC_SITE_ID: siteId, TRAFFIC_DOMAIN: 'tracksesh.com',
    POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_ID: '1', POSTHOG_QUERY_KEY: 'query-key',
    TRAFFIC_HASH_SECRET: 'x'.repeat(32), PROXYCHECK_API_KEY: 'lookup-key',
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'redis-key',
    CLOUDFLARE_ZONE_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'cloudflare-key',
  };
}
test('production preserves identity and shared credentials without enabling visitor capture', () => {
  const result = trafficConfig({ ...settings(), TRAFFIC_ENABLED: 'true', TRAFFIC_INGRESS_LOCKED: 'true',
    TRAFFIC_TRUSTED_PROXY_HOPS: '2', VITE_SECRET_KEY: 'do-not-copy', POSTHOG_PERSONAL_API_KEY: 'do-not-copy' });
  assert.equal(result.TRAFFIC_SITE_ID, siteId);
  assert.equal(result.TRAFFIC_ENABLED, 'false');
  assert.equal(result.TRAFFIC_INGRESS_LOCKED, 'false');
  assert.equal(result.TRAFFIC_TRUSTED_PROXY_HOPS, '0');
  assert.equal(result.POSTHOG_QUERY_KEY, 'query-key');
  assert.equal(result.VITE_SECRET_KEY, undefined);
  assert.equal(result.POSTHOG_PERSONAL_API_KEY, undefined);
  assert.equal(trafficConfig({ ...settings(), ADMIN_EMAILS: '' }).ADMIN_EMAILS, '');
});
test('deployment fails closed for missing identity or required provider settings', () => {
  for (const key of ['TRAFFIC_SITE_ID', 'POSTHOG_QUERY_KEY', 'TRAFFIC_HASH_SECRET', 'UPSTASH_REDIS_REST_TOKEN']) {
    const input = settings(); delete input[key];
    assert.throws(() => trafficConfig(input), new RegExp(key));
  }
  assert.throws(() => trafficConfig({ ...settings(), TRAFFIC_DOMAIN: 'https://tracksesh.com' }), /hostname/);
});
test('multi-site deployment keeps shared providers and requires unique IDs and owners', () => {
  const site = { site_id: siteId, domain: 'tracksesh.com', owner_emails: ['gbjunior014@gmail.com'] };
  const config = { ...settings(), TRAFFIC_SITES_JSON: JSON.stringify([site, { ...site, site_id: '718fd258-2c74-4898-9bb4-86dbf4b95a19', domain: 'other.example.com' }]) };
  assert.equal(trafficConfig(config).POSTHOG_PROJECT_ID, '1');
  assert.throws(() => trafficConfig({ ...config, TRAFFIC_SITES_JSON: JSON.stringify([site, site]) }), /unique/);
  assert.throws(() => trafficConfig({ ...config, TRAFFIC_SITES_JSON: JSON.stringify([{ ...site, owner_emails: [] }]) }), /owner/);
});
test('container JSON safely preserves credentials with quotes and shell metacharacters', () => {
  const pg = 'Host=db;Password="$()\'`test"';
  const env = { POSTGRES_CONNECTION: pg, SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', TRAFFIC_RUNTIME_CONFIG: JSON.stringify(settings()) };
  const result = JSON.parse(JSON.stringify(containerDefinition(env, ':tracksesh.app.42')));
  assert.equal(result.app.environment.ConnectionStrings__Postgres, pg);
  assert.equal(result.app.environment.TRAFFIC_SITE_ID, siteId);
  assert.equal(result.app.image, ':tracksesh.app.42');
  assert.equal(result.app.environment.Supabase__JwtSecret, undefined);
  assert.throws(() => containerDefinition({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_bad' }, ':tracksesh.app.42'), /publishable/);
});
test('local settings and env files are excluded from Docker build context', () => {
  const ignore = readFileSync('.dockerignore', 'utf8');
  assert.match(ignore, /^\*\*\/appsettings\.Local\*\.json$/m);
  assert.match(ignore, /^\.env\*$/m);
});
