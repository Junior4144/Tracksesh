# Admin and traffic panels

`/account` shows **Admin dashboard** after the API verifies admin access. `/admin`
contains a prominent link to `/admin/traffic`, security controls, and a read-only
database catalog snapshot (RLS flags, policy counts, estimated rows). This adapts
the supplied reference to Tracksesh; billing grants, LLM models and account
management from the unrelated reference app are not part of this panel.

## Access

Every admin endpoint requires a signature-verified Supabase bearer token, then
fetches the current user from Supabase Auth `/auth/v1/user`. The returned ID must
match the verified subject and the email must be confirmed. Access is granted by
either the server's `ADMIN_EMAILS` list or current trusted `app_metadata.role=admin`.
User-editable metadata and moderator roles cannot grant access.

The default email bootstrap is `gbjunior014@gmail.com`, as requested. This does
not create an account, verify an email, or write a role to Supabase. The existing
account can sign in normally. Set `ADMIN_EMAILS` to a comma-separated list to
replace this list; set it to an empty string to disable email-based access.
For a metadata-only deployment, assign `app_metadata.role=admin` through trusted
Supabase administration and clear `ADMIN_EMAILS`. Removing a metadata role takes
effect on the next admin request unless the email is still explicitly allowed.

No shared-token admin bypass is implemented. The supplied `TRAFFIC_ADMIN_TOKEN`
is deliberately unused: this app already has verified account authentication.
No database schema or grants change. Catalog reads still use `Db.RunAsync`,
transaction-local claims and `set local role authenticated`. Widgets describe
controls and catalog state, not a complete security audit. Table estimates may
be stale and RLS policy counts do not prove correct ownership predicates.

## Configuration

`npm run api` now loads `.env` with Node's dotenv parser and starts .NET. Existing
process environment values take precedence. Direct `dotnet run` does not load
`.env`. Database and Supabase settings remain in the existing local API settings
or `ConnectionStrings__Postgres`, `Supabase__Url`, `Supabase__PublishableKey`.
Production must inject the server environment values; `.env` is not published.
See `.env.example` for all names. Restart the API after configuration changes.

| Integration | Settings | Purpose |
| --- | --- | --- |
| PostHog | `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_QUERY_KEY` | Report queries; key needs Query Read scoped to this project |
| Capture | `TRAFFIC_ENABLED=true`, `POSTHOG_PROJECT_KEY`, `TRAFFIC_HASH_SECRET` | Anonymous events; use a random secret of at least 32 characters |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared quota reservations, lookup locks and cache |
| proxycheck.io | `PROXYCHECK_API_KEY` | Public-IP location and network signals |
| Cloudflare | `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN` | Domain-wide edge analytics |

PostHog supports the US and EU Cloud hosts. The ingest host is mapped to its
corresponding query host. `POSTHOG_PERSONAL_API_KEY` is not used as an automatic
fallback: give the runtime the narrower `POSTHOG_QUERY_KEY`. Setup credentials
and arbitrary provider URLs are not exposed to the browser.

For Cloudflare, create an API token with **Zone → Analytics → Read**, scoped to
the one domain. Find the Zone ID on that domain's overview page. The dashboard
queries HTTP adaptive aggregates (requests, bytes, visits, daily requests), not
the Web Analytics browser beacon. The domain must send traffic through Cloudflare
to populate these edge datasets. Dataset access and lookback depend on the zone's
plan; unsupported queries display a provider error and suggest the 24-hour range.
No DNS, WAF, billing or paid-plan changes are made by this feature.

Run `node scripts/check-traffic-providers.mjs` from the repository root for
read-only connection checks. It prints connection status, not credentials or
visitor data. It does not test live IP capture or change any provider settings.

## Collection and interpretation

### Site isolation in one shared PostHog project

The existing HTTP capture and HogQL query APIs are retained. Every new event
includes `properties.site_id`, a canonical UUID assigned once per monitored
target. All five report queries require that exact ID as well as the source
marker. Neither IP, domain, PostHog distinct ID nor the visitor's `$ip` identifies
the target. Events missing `site_id` are excluded, with no legacy/unscoped
fallback. Historical events should only be tagged through an explicit migration
when their original site is provable; matching only an IP is insufficient.

For the current installation, the ignored `.env` contains a generated
`TRAFFIC_SITE_ID` and `TRAFFIC_DOMAIN=tracksesh.com`. Preserve this UUID in
deployment configuration. Do not generate a new UUID on each start, reuse it
for another site, or change it when the domain/IP changes. Missing configuration
fails closed: there are no selectable sites and no capture. Capture also requires
the request Host to match the configured hostname for the deployment's site.

For multiple targets, `TRAFFIC_SITES_JSON` is a server-managed JSON array:

```json
[
  {
    "site_id": "7cd7d061-3386-46ee-9f88-a87a6915c013",
    "name": "Tracksesh",
    "domain": "tracksesh.com",
    "target_ip": null,
    "cloudflare_zone_id": "your-zone-id",
    "owner_user_ids": ["your-supabase-user-uuid"],
    "owner_emails": []
  }
]
```

The example UUID is illustrative; use your installation's existing UUID for
Tracksesh. Add entries with different UUIDs for other targets. The registry is
immutable during a process lifetime and has no browser mutation endpoint. It is
kept in trusted configuration because this app previously had no site inventory;
no new database or migration system is needed. Domain-only or IP-only targets
are supported. `TRAFFIC_SITE_ID` selects the local origin collector's entry;
other sites emit the same event contract with their own IDs using the same
PostHog project and capture key.

The admin gate still revalidates the user with Supabase. `/api/admin/sites`
lists only sites assigned to that user; `/api/admin/traffic?site_id=<uuid>` checks
ownership before making any provider call. Explicit user UUID assignments are
preferred. Email assignments use only the freshly verified Auth email. The
single-site shortcut assigns Tracksesh to `gbjunior014@gmail.com`. Additional
admins do not automatically gain access to all sites. Missing IDs are rejected;
unowned and nonexistent IDs both return 404. Ordinary users still cannot enter
this admin-only panel.

PostHog, Cloudflare and target DNS/enrichment reports require an `AuthorizedSite`
capability from the ownership resolver. No public reporting overload omits site
authorization. All provider credentials remain shared outside the registry;
Cloudflare's zone ID is site-specific and its query also filters the exact
hostname, preventing sibling domains/subdomains in a zone from mixing.

The target section shows current A/AAAA resolution with record type, resolver
source and timestamp. The OS DNS resolver does not expose TTL or arbitrary DNS
records, so those are not invented. Up to four public resolved/configured target
IPs use the shared proxycheck cache and quota. Private/reserved target addresses
are never enriched; configured target IPs must be public. DNS failures and partial
enrichment are explicit. An IP-only target can show proxycheck data without DNS
or Cloudflare configuration.

Event fields keep address roles separate: `visitor_ip` (also retained as the
existing `public_ip` field), `target_ip` (configured target address, otherwise
unknown), `proxycheck_lookup_ip` and `proxycheck_source=visitor`. Target report
lookups instead carry `lookup_purpose=monitored-target`. `domain`,
`dns_record_type` and `check_source` provide context; none replace `site_id`.
Visitor pseudonyms include the site UUID to avoid cross-site linkage. Target
DNS reports are not emitted as visitor events.

The .NET middleware records only actual public GET/HEAD requests to `/`, the
app's only public content route. Authentication, account, admin, ledger, API,
unknown paths, assets and prefetches are excluded. Query strings are never stored.
React client navigation does not make a document request; Vite serves development
documents itself. Only requests reaching the API hosting the SPA are counted.
Cloudflare cache hits can appear at the edge without appearing at the origin.

`TRAFFIC_INGRESS_LOCKED=true` asserts that the origin is inaccessible except
through your trusted proxies. Only make that assertion after restricting ingress.
`TRAFFIC_TRUSTED_PROXY_HOPS` selects an IP from the right of X-Forwarded-For:
one proxy means the rightmost value; two proxies means the second from the right.
Each trusted proxy must append the actual upstream client to the chain. These
settings are separate from ASP.NET transport forwarding. Do not guess the count
or trust arbitrary CF-Connecting-IP values. Without this contract, IP is unknown.
Private, reserved, malformed and scoped addresses are never sent for enrichment.

Events have source `tracksesh-public-v1`, event name `$http_log`, a keyed daily
IP pseudonym (random per request for unknown IP), and a separate public IP field.
Person processing and PostHog GeoIP are disabled. No raw user-agent, email,
account ID, authorization header, request body or full URL is sent. A user-agent
is reduced to evidence text before enqueueing. VPN/proxy/Tor and network class
are separate from suspected-bot evidence; absence of evidence means unknown.

Reports apply the selected 24-hour, 7-day or 30-day window and network/bot filters
to full-window aggregates and the most recent 100 events. Cloudflare uses the
same time window, but not the origin network/bot filters, and is labeled as edge
estimates. Refresh is manual. Setup, error and empty states remain distinct.
Sample preview is available only after a successful admin-authorized request,
uses documentation IPs, is explicitly labeled, and has fixed unfiltered data.

## Limits and operations

The background queue holds 256 requests, with one reader. Full queues drop
telemetry without blocking browsing. Capture is best effort, not an audit log;
shutdowns/restarts can lose queued events. Cloud Run needs CPU outside requests
or a durable delivery pipeline for reliable background processing. This feature
does not enable always-allocated CPU or increase hosting costs automatically.

Atomic Redis Lua reserves quota *before* provider calls. App caps default to
50,000 events/month and 900 lookups/day, UTC. They may be lowered to zero but not
increased past those limits by configuration. Failures consume reservations.
Quota storage failures stop capture; there is no process-local quota fallback.
Successful IP cache entries expire after 24 hours, failed enrichments after five
minutes; 30-second lookup locks prevent concurrent misses from duplicating work.
Redis keys have the `tracksesh:traffic:` prefix; use separate Redis databases
for environments that should have independent quotas. A single PostHog project
and shared API keys support all monitored sites; site UUIDs isolate report data.

Provider billing limits and retention must be configured separately. A 30-day
dashboard lookback is not data deletion. Shared Redis/cloud usage and other
integrations can incur charges independently of these application caps.
The capture-health delivery/drop counters are per-process and reset on restart.

## Verification

`TrafficTests` covers live Auth revalidation with mocked responses, allowlist,
metadata trust, IP parsing, route exclusions, minimization, enrichment contracts,
quota failures, cache behavior and query filters. Browser fixtures cover admin
navigation, signed-out/ordinary-user UI, provider errors, empty/sample states,
refresh revocation and mobile overflow. Mocked successful admin responses do not
prove that the owner's real authenticated session has accessed the dashboard.

Run required checks: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run test:api`, `dotnet build server`, `npm run build`, `npm run test:csp`.
The database-isolation tests need a disposable Supabase test database on port
54322 or `DATABASE_URL_ADO`; do not point fixture tests at production.

Local verification on September 16, 2026: TypeScript, ESLint, 86 frontend tests,
39 traffic/backend tests, 18 admin browser tests (also against the production SPA
and CSP headers), .NET build, SPA build and CSP checks passed. Real anonymous
requests were denied with 401; the ordinary demo account was denied with 403.
Cloudflare's configured zone, all five PostHog query shapes and Upstash PING
passed read-only live checks. Server credentials were absent from the built
JavaScript. Desktop and mobile screenshots were inspected.

The eight existing database-isolation tests could not connect to their local
test database. Supabase MCP SQL verification was also unavailable (insufficient
connector scope), so the new database catalog widget's live query and the
designated owner's authenticated admin session remain unverified. No schema or
account mutation was performed. Capture/enrichment delivery was tested with
mocks; no live visitor IP was sent for validation. The local API is running with
capture disabled by a process environment override pending operator approval.

After the site-isolation refactor: 44 backend tests passed, including HTTP
rejections for missing/unowned/unknown site IDs before provider calls, two sites
sharing one target IP, immutable identity across IP changes, and mandatory site
predicates in all reports. All 21 admin browser checks passed. The required full
API suite reports 44 passed and the same eight local-database connection failures.
Typecheck, lint, 86 frontend tests, .NET/SPA builds and CSP checks passed. Live
read-only checks accepted all five site-scoped PostHog queries and Cloudflare's
exact `tracksesh.com` hostname filter. Capture remains disabled.

References: [Supabase users](https://supabase.com/docs/guides/auth/users),
[PostHog queries](https://posthog.com/docs/api/queries),
[anonymous capture](https://posthog.com/docs/api/capture),
[proxycheck v3](https://proxycheck.io/api/),
[Upstash REST](https://upstash.com/docs/redis/features/restapi),
[Cloudflare HTTP analytics](https://developers.cloudflare.com/analytics/graphql-api/migration-guides/graphql-api-analytics/).
