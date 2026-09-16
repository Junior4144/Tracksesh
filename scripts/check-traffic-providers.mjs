// Read-only provider diagnostics. Never prints credentials or visitor records.
import { loadEnvFile } from 'node:process';
loadEnvFile('.env');
const env = process.env;
// Operator CLI: resolve an ID from the trusted registry, never interpolate an
// arbitrary argument into HogQL and never fall back to project-wide analytics.
const siteId = process.argv[2] ?? env.TRAFFIC_SITE_ID;
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId ?? '')) {
  throw new Error('Configure TRAFFIC_SITE_ID or pass a configured site UUID.');
}
const sites = env.TRAFFIC_SITES_JSON ? JSON.parse(env.TRAFFIC_SITES_JSON) : [{ site_id: env.TRAFFIC_SITE_ID, domain: env.TRAFFIC_DOMAIN, cloudflare_zone_id: env.CLOUDFLARE_ZONE_ID }];
const site = sites.find(s => s.site_id.toLowerCase() === siteId.toLowerCase());
if (!site) throw new Error('Site is not registered in this server configuration.');
const end = new Date();
const start = new Date(end.getTime() - 86400000);
async function check(name, url, token, body) {
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: 'error' });
    const data = await response.json();
    const errors = data.errors?.map(e => String(e.message).replaceAll(token, '[redacted]'));
    console.log(JSON.stringify({ provider: name, status: response.status, errors, has_results: Array.isArray(data.results), zones: data.data?.viewer?.zones?.length, redis_ok: data.result === 'PONG' }));
  } catch { console.log(`${name}: network or response failure`); }
}
if (env.CLOUDFLARE_API_TOKEN && site.cloudflare_zone_id && site.domain) await check('Cloudflare', 'https://api.cloudflare.com/client/v4/graphql', env.CLOUDFLARE_API_TOKEN, {
  query: 'query Traffic($zone: string!, $host: string!, $start: Time!, $end: Time!) { viewer { zones(filter: {zoneTag: $zone}) { totals: httpRequestsAdaptiveGroups(limit: 1, filter: {clientRequestHTTPHost: $host, datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball"}) { count sum { edgeResponseBytes visits } } daily: httpRequestsAdaptiveGroups(limit: 31, orderBy: [date_ASC], filter: {clientRequestHTTPHost: $host, datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball"}) { count dimensions { date } } } } }',
  variables: { zone: site.cloudflare_zone_id, host: site.domain, start: start.toISOString(), end: end.toISOString() },
});
const hosts = { 'us.i.posthog.com': 'us.posthog.com', 'us.posthog.com': 'us.posthog.com', 'app.posthog.com': 'us.posthog.com', 'eu.i.posthog.com': 'eu.posthog.com', 'eu.posthog.com': 'eu.posthog.com' };
const host = hosts[new URL(env.POSTHOG_HOST).hostname];
if (host && /^\d+$/.test(env.POSTHOG_PROJECT_ID) && env.POSTHOG_QUERY_KEY) {
  const where = `event = '$http_log' and properties.source = 'tracksesh-public-v1' and properties.site_id = '${siteId.toLowerCase()}' and timestamp >= now() - interval 1 day`;
  const queries = [
    `select count(), uniqExactIf(properties.public_ip, notEmpty(toString(properties.public_ip))), countIf(properties.bot = 'suspected'), countIf(properties.enriched = true) from events where ${where} limit 1`,
    `select toDate(timestamp), count() from events where ${where} group by toDate(timestamp) order by toDate(timestamp) limit 31`,
    `select coalesce(properties.country, 'Unknown'), count() from events where ${where} group by properties.country order by count() desc limit 10`,
    `select properties.path, count() from events where ${where} group by properties.path order by count() desc limit 10`,
    `select timestamp, properties.path, properties.public_ip, properties.country, properties.city, properties.provider, properties.network, properties.bot, properties.evidence, properties.vpn, properties.proxy, properties.tor from events where ${where} order by timestamp desc limit 100`,
  ];
  for (const [i, sql] of queries.entries()) await check(`PostHog query ${i + 1}`, `https://${host}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`, env.POSTHOG_QUERY_KEY, { query: { kind: 'HogQLQuery', query: sql } });
}
if (env.UPSTASH_REDIS_REST_URL?.startsWith('https://') && new URL(env.UPSTASH_REDIS_REST_URL).hostname.endsWith('.upstash.io')) await check('Upstash', env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN, ['PING']);
