namespace Tracksesh.Api.Admin;

public sealed class TrafficOptions(IConfiguration config)
{
    public string Value(string key) => config[key]?.Trim() ?? "";
    public bool Has(params string[] keys) => keys.All(k => Value(k).Length > 0);
    public bool Enabled => Value("TRAFFIC_ENABLED").Equals("true", StringComparison.OrdinalIgnoreCase);
    public bool IngressLocked => Value("TRAFFIC_INGRESS_LOCKED").Equals("true", StringComparison.OrdinalIgnoreCase);
    public int Hops => int.TryParse(Value("TRAFFIC_TRUSTED_PROXY_HOPS"), out var n) && n is >= 1 and <= 10 ? n : 0;
    public int EventCap => Cap("TRAFFIC_MONTHLY_EVENT_CAP", 50_000);
    public int LookupCap => Cap("TRAFFIC_DAILY_LOOKUP_CAP", 900);
    private int Cap(string key, int max) => int.TryParse(Value(key), out var n) ? Math.Clamp(n, 0, max) : max;
    public string? PostHogHost(bool ingest = false)
    {
        if (!Uri.TryCreate(Value("POSTHOG_HOST"), UriKind.Absolute, out var uri) || uri.Scheme != "https") return null;
        return uri.Host switch
        {
            "us.i.posthog.com" or "us.posthog.com" or "app.posthog.com" => ingest ? "https://us.i.posthog.com" : "https://us.posthog.com",
            "eu.i.posthog.com" or "eu.posthog.com" => ingest ? "https://eu.i.posthog.com" : "https://eu.posthog.com",
            _ => null
        };
    }
    public bool RedisReady => Has("UPSTASH_REDIS_REST_TOKEN") &&
        Uri.TryCreate(Value("UPSTASH_REDIS_REST_URL"), UriKind.Absolute, out var uri) &&
        uri.Scheme == "https" && uri.Host.EndsWith(".upstash.io", StringComparison.OrdinalIgnoreCase) && uri.UserInfo == "";
    public bool QueryReady => PostHogHost() != null && Has("POSTHOG_QUERY_KEY") &&
        long.TryParse(Value("POSTHOG_PROJECT_ID"), out var id) && id > 0;
    public bool CaptureReady => Enabled && RedisReady && PostHogHost() != null &&
        Has("POSTHOG_PROJECT_KEY") && Value("TRAFFIC_HASH_SECRET").Length >= 32;
}
