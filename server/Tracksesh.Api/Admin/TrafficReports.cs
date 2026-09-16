using System.Text.Json;

namespace Tracksesh.Api.Admin;

public record ProviderReport(string Status, string Message, object? Data = null);
public record TrafficFilter(int Days = 1, string Network = "all", string Bot = "all")
{
    public bool Valid => Days is 1 or 7 or 30 &&
        Network is "all" or "residential" or "business" or "wireless" or "hosting" or "unknown" &&
        Bot is "all" or "suspected" or "unknown";
    public string Where(Guid siteId, DateTimeOffset end)
    {
        if (siteId == Guid.Empty) throw new ArgumentException("A site ID is required.");
        if (!Valid) throw new ArgumentException("Invalid traffic filters.");
        var start = end.AddDays(-Days);
        return $"event = '$http_log' and properties.source = '{TrafficProviders.Source}' and properties.site_id = '{siteId:D}' " +
            $"and timestamp >= toDateTime('{start.UtcDateTime:yyyy-MM-dd HH:mm:ss}') and timestamp < toDateTime('{end.UtcDateTime:yyyy-MM-dd HH:mm:ss}')" +
            (Network == "all" ? "" : $" and properties.network = '{Network}'") +
            (Bot == "all" ? "" : $" and properties.bot = '{Bot}'");
    }
}

public sealed class TrafficReports(TrafficProviders providers, TrafficOptions options)
{
    public async Task<ProviderReport> PostHogAsync(AuthorizedSite site, TrafficFilter filter, DateTimeOffset end, CancellationToken cancel)
    {
        if (!options.QueryReady) return new("setup", "Configure POSTHOG_HOST, POSTHOG_PROJECT_ID and a project-scoped POSTHOG_QUERY_KEY with Query Read permission.");
        try
        {
            var where = filter.Where(site.Target.SiteId, end);
            async Task<JsonElement> Query(string sql)
            {
                var body = await providers.SendAsync($"{options.PostHogHost()}/api/projects/{options.Value("POSTHOG_PROJECT_ID")}/query/",
                    new { query = new { kind = "HogQLQuery", query = sql } }, options.Value("POSTHOG_QUERY_KEY"), cancel);
                if (body.TryGetProperty("error", out _) ||
                    !body.TryGetProperty("results", out var results) || results.ValueKind != JsonValueKind.Array)
                    throw new JsonException();
                return results;
            }
            var summary = await Query($"select count(), uniqExactIf(properties.public_ip, notEmpty(toString(properties.public_ip))), countIf(properties.bot = 'suspected'), countIf(properties.enriched = true) from events where {where} limit 1");
            var daily = await Query($"select toDate(timestamp), count() from events where {where} group by toDate(timestamp) order by toDate(timestamp) limit 31");
            var countries = await Query($"select coalesce(properties.country, 'Unknown'), count() from events where {where} group by properties.country order by count() desc limit 10");
            var paths = await Query($"select properties.path, count() from events where {where} group by properties.path order by count() desc limit 10");
            var recent = await Query($"select timestamp, properties.path, properties.public_ip, properties.country, properties.city, properties.provider, properties.network, properties.bot, properties.evidence, properties.vpn, properties.proxy, properties.tor from events where {where} order by timestamp desc limit 100");
            return new("connected", "Recorded origin requests, not people or sessions. Ingestion can be delayed; enrichment can be partial.", new { summary, daily, countries, paths, recent });
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException)
        { return new("error", "PostHog could not return a report. Check the project, Query Read permission, region and provider availability."); }
    }

    public async Task<ProviderReport> CloudflareAsync(AuthorizedSite site, int days, DateTimeOffset end, CancellationToken cancel)
    {
        if (string.IsNullOrWhiteSpace(site.Target.CloudflareZoneId) || site.Target.Domain == null || !options.Has("CLOUDFLARE_API_TOKEN"))
            return new("setup", "Configure this site's hostname and Cloudflare zone, plus the shared CLOUDFLARE_API_TOKEN.");
        try
        {
            // Variables bind all operator configuration and dates. These are edge
            // aggregates, independent of the origin report's network/bot filters.
            const string query = """
                query Traffic($zone: string!, $host: string!, $start: Time!, $end: Time!) {
                  viewer { zones(filter: {zoneTag: $zone}) {
                    totals: httpRequestsAdaptiveGroups(limit: 1, filter: {clientRequestHTTPHost: $host, datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball"}) {
                      count sum { edgeResponseBytes visits }
                    }
                    daily: httpRequestsAdaptiveGroups(limit: 31, orderBy: [date_ASC], filter: {clientRequestHTTPHost: $host, datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball"}) {
                      count dimensions { date }
                    }
                  } }
                }
                """;
            var data = await providers.SendAsync("https://api.cloudflare.com/client/v4/graphql",
                new { query, variables = new { zone = site.Target.CloudflareZoneId, host = site.Target.Domain, start = end.AddDays(-days).UtcDateTime.ToString("O"), end = end.UtcDateTime.ToString("O") } },
                options.Value("CLOUDFLARE_API_TOKEN"), cancel);
            if (data.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Array && errors.GetArrayLength() > 0)
                return new("error", "Cloudflare rejected this query. Check zone permissions and your plan's dataset/time-range availability; try 24 hours.");
            var zones = data.GetProperty("data").GetProperty("viewer").GetProperty("zones");
            if (zones.GetArrayLength() != 1) return new("error", "Cloudflare returned no accessible zone. Verify the zone ID and token scope.");
            return new("connected", "Cloudflare edge estimates include cached requests and assets. They differ from recorded public origin requests; network and bot filters do not apply.", zones[0]);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException or InvalidOperationException)
        { return new("error", "Cloudflare analytics are unavailable. Check the token, zone and provider availability."); }
    }

    public async Task<ProviderReport> QuotasAsync(CancellationToken cancel)
    {
        if (!options.RedisReady) return new("setup", "Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN. Capture stops when shared quota storage is unavailable.");
        try
        {
            var result = await providers.RedisAsync(["MGET", providers.EventKey, providers.LookupKey], cancel);
            static long Number(JsonElement n) => n.ValueKind == JsonValueKind.Null ? 0 : long.Parse(n.GetString()!);
            return new("connected", "UTC reservations include failed provider attempts. These are application caps, not billing guarantees.",
                new { events = Number(result[0]), event_cap = options.EventCap, lookups = Number(result[1]), lookup_cap = options.LookupCap });
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or InvalidOperationException or FormatException)
        { return new("error", "Shared quota usage is unavailable. Capture fails closed until Redis recovers."); }
    }
}
