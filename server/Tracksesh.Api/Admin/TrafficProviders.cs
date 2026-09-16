using System.Net.Http.Headers;
using System.Text.Json;

namespace Tracksesh.Api.Admin;

public sealed class TrafficProviders(HttpClient http, TrafficOptions options)
{
    public const string Source = "tracksesh-public-v1";
    public const string ReserveScript = "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return 0 end; redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],ARGV[2]); return 1";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public string EventKey => $"tracksesh:traffic:events:{DateTime.UtcNow:yyyy-MM}";
    public string LookupKey => $"tracksesh:traffic:lookups:{DateTime.UtcNow:yyyy-MM-dd}";

    public async Task<JsonElement> SendAsync(string url, object? body, string? token, CancellationToken cancel)
    {
        using var request = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, url);
        if (body != null) request.Content = JsonContent.Create(body);
        if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(request, cancel);
        response.EnsureSuccessStatusCode();
        using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancel), cancellationToken: cancel);
        return document.RootElement.Clone();
    }

    public async Task<JsonElement> RedisAsync(object[] command, CancellationToken cancel)
    {
        if (!options.RedisReady) throw new InvalidOperationException("Quota storage is not configured.");
        var result = await SendAsync(options.Value("UPSTASH_REDIS_REST_URL"), command, options.Value("UPSTASH_REDIS_REST_TOKEN"), cancel);
        if (result.TryGetProperty("error", out _)) throw new InvalidOperationException("Quota storage is unavailable.");
        return result.GetProperty("result");
    }

    public async Task<bool> ReserveAsync(string key, int cap, int ttl, CancellationToken cancel) =>
        (await RedisAsync(["EVAL", ReserveScript, 1, key, cap, ttl], cancel)).GetInt32() == 1;

    public static Enrichment ParseEnrichment(JsonElement root, string ip)
    {
        if (Text(root, "status") != "ok" || !root.TryGetProperty(ip, out var row)) return new();
        var network = row.GetProperty("network");
        var location = row.GetProperty("location");
        var detections = row.GetProperty("detections");
        var type = Text(network, "type")?.ToLowerInvariant();
        if (type is not ("residential" or "business" or "wireless" or "hosting")) type = "unknown";
        return new(type, Text(location, "country"), Text(location, "city"), Text(network, "provider"),
            Flag(detections, "vpn"), Flag(detections, "proxy"), Flag(detections, "tor"), Flag(detections, "scraper"), true);
    }

    private static string? Text(JsonElement value, string key) =>
        value.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString()?[..Math.Min(p.GetString()!.Length, 120)] : null;
    private static bool Flag(JsonElement value, string key) => value.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.True;

    public async Task<Enrichment> EnrichAsync(string? ip, CancellationToken cancel)
    {
        if (ip == null || TrafficPrivacy.PublicIp(ip) == null || !options.Has("PROXYCHECK_API_KEY")) return new();
        var key = "tracksesh:traffic:ip:" + TrafficHash.Of(options.Value("TRAFFIC_HASH_SECRET"), ip);
        var cached = await RedisAsync(["GET", key], cancel);
        if (cached.ValueKind == JsonValueKind.String) return JsonSerializer.Deserialize<Enrichment>(cached.GetString()!, Json) ?? new();
        // Expiring lock; losers record partial enrichment instead of repeating a lookup.
        var locked = await RedisAsync(["SET", key + ":lock", "1", "NX", "EX", 30], cancel);
        if (locked.ValueKind == JsonValueKind.Null) return new();
        if (!await ReserveAsync(LookupKey, options.LookupCap, 172800, cancel)) return new();
        Enrichment result;
        try
        {
            var response = await SendAsync($"https://proxycheck.io/v3/{Uri.EscapeDataString(ip)}?key={Uri.EscapeDataString(options.Value("PROXYCHECK_API_KEY"))}&tag=0", null, null, cancel);
            result = ParseEnrichment(response, ip);
        }
        catch (Exception e) when (e is HttpRequestException or JsonException or KeyNotFoundException or TaskCanceledException)
        { result = new(); }
        await RedisAsync(["SET", key, JsonSerializer.Serialize(result, Json), "EX", result.Enriched ? 86400 : 300], cancel);
        return result;
    }

    public async Task CaptureAsync(TrafficRequest request, CancellationToken cancel)
    {
        if (!options.CaptureReady || !await ReserveAsync(EventKey, options.EventCap, 5356800, cancel)) return;
        if (request.Site.SiteId == Guid.Empty) throw new ArgumentException("Capture requires a site ID.");
        var enriched = await EnrichAsync(request.VisitorIp, cancel);
        var properties = CaptureProperties(request, enriched);
        await SendAsync(options.PostHogHost(true) + "/i/v0/e/", new
        {
            api_key = options.Value("POSTHOG_PROJECT_KEY"), @event = "$http_log", timestamp = request.Timestamp,
            distinct_id = request.VisitorIp == null ? Guid.NewGuid().ToString() :
                TrafficHash.Of(options.Value("TRAFFIC_HASH_SECRET"), $"{request.Site.SiteId:D}:{request.Timestamp:yyyy-MM-dd}:{request.VisitorIp}"),
            properties
        }, null, cancel);
    }

    public static Dictionary<string, object?> CaptureProperties(TrafficRequest request, Enrichment enrichment) => new()
    {
        ["$process_person_profile"] = false, ["$geoip_disable"] = true, ["$ip"] = null,
        ["source"] = Source, ["check_source"] = "origin-http", ["site_id"] = request.Site.SiteId.ToString("D"),
        ["domain"] = request.Site.Domain, ["target_ip"] = request.Site.TargetIp,
        ["dns_record_type"] = request.Site.TargetIp == null ? null : request.Site.TargetIp.Contains(':') ? "AAAA" : "A",
        ["path"] = request.Path, ["public_ip"] = request.VisitorIp, ["visitor_ip"] = request.VisitorIp,
        ["proxycheck_lookup_ip"] = enrichment.Enriched ? request.VisitorIp : null,
        ["proxycheck_source"] = enrichment.Enriched ? "visitor" : null,
        ["network"] = enrichment.Network, ["country"] = enrichment.Country, ["city"] = enrichment.City,
        ["provider"] = enrichment.Provider, ["vpn"] = enrichment.Vpn, ["proxy"] = enrichment.Proxy,
        ["tor"] = enrichment.Tor, ["enriched"] = enrichment.Enriched,
        ["bot"] = request.Evidence.Length > 0 || enrichment.Scraper ? "suspected" : "unknown",
        ["evidence"] = string.Join("; ", new[] { request.Evidence, enrichment.Scraper ? "Provider scraper signal" : "" }.Where(x => x.Length > 0))
    };
}
