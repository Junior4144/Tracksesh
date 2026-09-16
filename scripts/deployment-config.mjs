import { isIP } from 'node:net';

export const trafficKeys = [
  'ADMIN_EMAILS', 'TRAFFIC_SITE_ID', 'TRAFFIC_DOMAIN', 'TRAFFIC_TARGET_IP', 'TRAFFIC_SITES_JSON',
  'POSTHOG_HOST', 'POSTHOG_PROJECT_ID', 'POSTHOG_QUERY_KEY', 'POSTHOG_PROJECT_KEY',
  'TRAFFIC_HASH_SECRET', 'PROXYCHECK_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN',
  'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN', 'TRAFFIC_MONTHLY_EVENT_CAP', 'TRAFFIC_DAILY_LOOKUP_CAP',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(value) { return typeof value === 'string' && uuid.test(value) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value); }
function required(env, key) {
  if (typeof env[key] !== 'string' || !env[key].trim()) throw new Error(`Missing ${key}.`);
  return env[key];
}
function https(value, label, hosts) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${label}.`); }
  if (url.protocol !== 'https:' || url.username || url.password || (hosts && !hosts.includes(url.hostname)))
    throw new Error(`Invalid ${label}.`);
  return url;
}
function hostname(value) {
  return typeof value === 'string' && value.length <= 253 && value.includes('.') &&
    value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function trafficConfig(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Traffic config must be an object.');
  const config = {};
  for (const key of trafficKeys) {
    if (input[key] !== undefined && (input[key] !== '' || key === 'ADMIN_EMAILS')) {
      if (typeof input[key] !== 'string') throw new Error(`${key} must be a string.`);
      config[key] = input[key];
    }
  }
  // The first release supports report queries, DNS and target enrichment.
  // Visitor collection/forwarded-IP trust have not been approved for this ingress.
  config.TRAFFIC_ENABLED = 'false';
  config.TRAFFIC_INGRESS_LOCKED = 'false';
  config.TRAFFIC_TRUSTED_PROXY_HOPS = '0';
  if (!validId(config.TRAFFIC_SITE_ID)) throw new Error('TRAFFIC_SITE_ID must retain the existing site UUID.');
  const sites = config.TRAFFIC_SITES_JSON ? JSON.parse(config.TRAFFIC_SITES_JSON) : [{
    site_id: config.TRAFFIC_SITE_ID, domain: config.TRAFFIC_DOMAIN, target_ip: config.TRAFFIC_TARGET_IP,
    cloudflare_zone_id: config.CLOUDFLARE_ZONE_ID, owner_emails: ['gbjunior014@gmail.com'],
  }];
  if (!Array.isArray(sites) || !sites.length) throw new Error('Configure at least one monitored site.');
  const ids = new Set();
  for (const site of sites) {
    if (!validId(site.site_id) || ids.has(site.site_id.toLowerCase())) throw new Error('Site UUIDs must be unique and nonempty.');
    ids.add(site.site_id.toLowerCase());
    if (site.domain && !hostname(site.domain)) throw new Error('Site domains must be hostnames, not URLs.');
    if (site.target_ip && !isIP(site.target_ip)) throw new Error('Invalid configured target IP.');
    if (!site.domain && !site.target_ip) throw new Error('Each site needs a domain or target IP.');
    if (!Array.isArray(site.owner_user_ids ?? []) || !Array.isArray(site.owner_emails ?? [])) throw new Error('Site owners must be arrays.');
    if (!(site.owner_user_ids?.length || site.owner_emails?.length)) throw new Error('Each site needs an owner.');
    if ((site.owner_user_ids ?? []).some(id => !validId(id)) ||
        (site.owner_emails ?? []).some(email => typeof email !== 'string' || !email.includes('@'))) throw new Error('Invalid site owner.');
    if (site.cloudflare_zone_id && (!/^[a-f0-9]{32}$/i.test(site.cloudflare_zone_id) || !site.domain)) throw new Error('Cloudflare sites need a hostname and zone ID.');
  }
  if (!ids.has(config.TRAFFIC_SITE_ID.toLowerCase())) throw new Error('The deployment site is missing from the registry.');
  https(required(config, 'POSTHOG_HOST'), 'POSTHOG_HOST', ['us.i.posthog.com', 'us.posthog.com', 'app.posthog.com', 'eu.i.posthog.com', 'eu.posthog.com']);
  if (!/^[1-9]\d*$/.test(required(config, 'POSTHOG_PROJECT_ID'))) throw new Error('Invalid POSTHOG_PROJECT_ID.');
  required(config, 'POSTHOG_QUERY_KEY');
  required(config, 'PROXYCHECK_API_KEY');
  if (required(config, 'TRAFFIC_HASH_SECRET').length < 32) throw new Error('TRAFFIC_HASH_SECRET needs at least 32 characters.');
  if (!https(required(config, 'UPSTASH_REDIS_REST_URL'), 'UPSTASH_REDIS_REST_URL').hostname.endsWith('.upstash.io')) throw new Error('Invalid Upstash hostname.');
  required(config, 'UPSTASH_REDIS_REST_TOKEN');
  if (sites.some(site => site.cloudflare_zone_id)) required(config, 'CLOUDFLARE_API_TOKEN');
  for (const [key, max] of [['TRAFFIC_MONTHLY_EVENT_CAP', 50000], ['TRAFFIC_DAILY_LOOKUP_CAP', 900]]) {
    if (config[key] !== undefined && (!/^\d+$/.test(config[key]) || Number(config[key]) > max)) throw new Error(`Invalid ${key}.`);
  }
  return config;
}

export function containerDefinition(env, image) {
  required(env, 'POSTGRES_CONNECTION');
  https(required(env, 'SUPABASE_URL'), 'SUPABASE_URL');
  if (!required(env, 'SUPABASE_PUBLISHABLE_KEY').startsWith('sb_publishable_')) throw new Error('The browser/API key must be publishable.');
  if (!image || !/^:[a-zA-Z0-9._-]+\.app\.\d+$/.test(image)) throw new Error('Use the exact Lightsail image tag.');
  const traffic = trafficConfig(JSON.parse(required(env, 'TRAFFIC_RUNTIME_CONFIG')));
  return { app: {
    image, ports: { '8080': 'HTTP' }, environment: {
      ...traffic,
      ASPNETCORE_ENVIRONMENT: 'Production', ASPNETCORE_URLS: 'http://+:8080',
      ConnectionStrings__Postgres: env.POSTGRES_CONNECTION,
      Supabase__Url: env.SUPABASE_URL, Supabase__PublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      Security__TrustProxyHeaders: 'true', Security__HstsDays: '30',
    },
  } };
}
