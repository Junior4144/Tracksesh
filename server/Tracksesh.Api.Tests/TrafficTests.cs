using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Tracksesh.Api.Data;
using Microsoft.Extensions.Configuration;
using Tracksesh.Api.Admin;

namespace Tracksesh.Api.Tests;

public sealed class TrafficTests
{
    private static readonly Guid Subject = Guid.Parse("00000000-0000-4000-8000-000000000001");
    private static readonly Guid SiteId = Guid.Parse("7cd7d061-3386-46ee-9f88-a87a6915c013");
    private static readonly Guid OtherSiteId = Guid.Parse("718fd258-2c74-4898-9bb4-86dbf4b95a19");
    private static MonitoredSites Registry() => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["TRAFFIC_SITE_ID"] = SiteId.ToString(),
        ["TRAFFIC_SITES_JSON"] = JsonSerializer.Serialize(new[] {
            new { site_id = SiteId, name = "Tracksesh", domain = "tracksesh.com", target_ip = "1.1.1.1", cloudflare_zone_id = "zone-a", owner_user_ids = new[] { Subject } },
            new { site_id = OtherSiteId, name = "Other", domain = "other.example.com", target_ip = "1.1.1.1", cloudflare_zone_id = "zone-b", owner_user_ids = new[] { Guid.Parse("00000000-0000-4000-8000-000000000002") } }
        })
    }).Build());
    private static HttpContext Context(Guid userId) => new DefaultHttpContext
    { User = new(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "test")) };
    private static AuthorizedSite Site() => Registry().Authorize(Context(Subject), SiteId)!;
    private static JsonElement User(string email, string? role = null, bool confirmed = true, object? userMetadata = null) =>
        JsonSerializer.SerializeToElement(new { id = Subject, email, email_confirmed_at = confirmed ? "2026-09-16T00:00:00Z" : null,
            app_metadata = new { role }, user_metadata = userMetadata });

    [Fact]
    public void Only_confirmed_configured_email_or_trusted_admin_can_enter()
    {
        string[] emails = ["gbjunior014@gmail.com"];
        Assert.True(AdminAccess.IsAdmin(User("GBJUNIOR014@gmail.com"), Subject, emails));
        Assert.True(AdminAccess.IsAdmin(User("admin@example.com", "admin"), Subject, emails));
        Assert.False(AdminAccess.IsAdmin(User("gbjunior014@gmail.com", confirmed: false), Subject, emails));
        Assert.False(AdminAccess.IsAdmin(User("other@example.com", "moderator"), Subject, emails));
        Assert.False(AdminAccess.IsAdmin(User("other@example.com", userMetadata: new { role = "admin" }), Subject, emails));
        Assert.False(AdminAccess.IsAdmin(User("gbjunior014@gmail.com"), Guid.NewGuid(), emails));
        Assert.False(AdminAccess.IsAdmin(User("gbjunior014@gmail.com"), Subject, []));
    }

    [Theory]
    [InlineData("127.0.0.1")][InlineData("10.1.2.3")][InlineData("100.64.0.1")]
    [InlineData("169.254.1.1")][InlineData("172.16.1.1")][InlineData("192.168.1.1")]
    [InlineData("192.0.2.1")][InlineData("198.51.100.2")][InlineData("203.0.113.4")]
    [InlineData("224.0.0.1")][InlineData("::1")][InlineData("fc00::1")]
    [InlineData("fe80::1")][InlineData("2001:db8::1")][InlineData("::ffff:127.0.0.1")]
    [InlineData("8.8.8.8:80")][InlineData("127.1")][InlineData("garbage")]
    public void Private_reserved_and_malformed_addresses_are_unknown(string ip) => Assert.Null(TrafficPrivacy.PublicIp(ip));

    [Fact]
    public void Forwarding_uses_explicit_right_to_left_contract()
    {
        Assert.Null(TrafficPrivacy.ClientIp("1.1.1.1", false, 1));
        Assert.Null(TrafficPrivacy.ClientIp("1.1.1.1", true, 0));
        Assert.Null(TrafficPrivacy.ClientIp("1.1.1.1", true, 2));
        Assert.Equal("8.8.8.8", TrafficPrivacy.ClientIp("6.6.6.6, 8.8.8.8, 10.0.0.1", true, 2));
        Assert.Equal("2606:4700:4700::1111", TrafficPrivacy.PublicIp("2606:4700:4700:0:0:0:0:1111"));
        Assert.Equal("8.8.8.8", TrafficPrivacy.PublicIp("::ffff:8.8.8.8"));
    }

    [Theory]
    [InlineData("/admin")][InlineData("/admin/traffic")][InlineData("/login")]
    [InlineData("/account")][InlineData("/auth/confirm")][InlineData("/dashboard")]
    [InlineData("/api/health")][InlineData("/assets/app.js")][InlineData("/sensitive-path")]
    public void Private_and_unknown_paths_are_never_collected(string path)
    {
        var context = new DefaultHttpContext(); context.Request.Method = "GET"; context.Request.Path = path;
        Assert.Null(TrafficPrivacy.PublicPath(context.Request));
    }

    [Fact]
    public void Collector_drops_parameters_prefetches_and_writes()
    {
        var context = new DefaultHttpContext(); context.Request.Method = "GET"; context.Request.Path = "/";
        context.Request.QueryString = new QueryString("?token=secret");
        Assert.Equal("/", TrafficPrivacy.PublicPath(context.Request));
        context.Request.Headers["Sec-Purpose"] = "prefetch";
        Assert.Null(TrafficPrivacy.PublicPath(context.Request));
        context.Request.Headers.Clear(); context.Request.Method = "POST";
        Assert.Null(TrafficPrivacy.PublicPath(context.Request));
    }

    [Fact]
    public void Anonymous_payload_minimizes_data_and_vpn_is_not_bot_evidence()
    {
        var request = new TrafficRequest(Site().Target, DateTimeOffset.UtcNow, "/", "8.8.8.8", "");
        var properties = TrafficProviders.CaptureProperties(request, new Enrichment(Vpn: true));
        Assert.Equal(false, properties["$process_person_profile"]);
        Assert.Equal(true, properties["$geoip_disable"]);
        Assert.Equal("unknown", properties["bot"]);
        Assert.DoesNotContain("user_agent", properties.Keys);
        Assert.DoesNotContain("email", properties.Keys);
        Assert.Equal("suspected", TrafficProviders.CaptureProperties(request, new Enrichment(Scraper: true))["bot"]);
        Assert.Equal("Declared automation user-agent", TrafficPrivacy.Evidence("ExampleBot/1.0"));
        Assert.Equal("Missing user-agent", TrafficPrivacy.Evidence(""));
    }

    [Fact]
    public void Enrichment_reads_v3_contract_and_keeps_network_types_distinct()
    {
        foreach (var type in new[] { "Residential", "Business", "Wireless", "Hosting", "Unknown" })
        {
            var response = JsonSerializer.SerializeToElement(new Dictionary<string, object> { ["status"] = "ok", ["8.8.8.8"] = new
            { network = new { type, provider = "Example" }, location = new { country = "United States", city = "Example city" }, detections = new { vpn = true, proxy = false, tor = false, scraper = false } } });
            var result = TrafficProviders.ParseEnrichment(response, "8.8.8.8");
            Assert.Equal(type.ToLowerInvariant(), result.Network);
            Assert.Equal("United States", result.Country); Assert.Equal("Example city", result.City);
            Assert.True(result.Vpn); Assert.True(result.Enriched); Assert.False(result.Scraper);
        }
    }

    [Fact]
    public void Query_filters_are_closed_and_apply_one_bounded_window()
    {
        var end = DateTimeOffset.Parse("2026-09-16T12:00:00Z");
        var sql = new TrafficFilter(7, "hosting", "suspected").Where(SiteId, end);
        Assert.Contains("2026-09-09 12:00:00", sql); Assert.Contains("2026-09-16 12:00:00", sql);
        Assert.Contains("properties.network = 'hosting'", sql); Assert.Contains("properties.bot = 'suspected'", sql);
        Assert.False(new TrafficFilter(31).Valid);
        Assert.Throws<ArgumentException>(() => new TrafficFilter(1, "' or 1=1").Where(SiteId, end));
    }

    [Fact]
    public void Daily_pseudonyms_are_keyed_and_rotate()
    {
        Assert.NotEqual(TrafficHash.Of("secret-a", "2026-09-16:8.8.8.8"), TrafficHash.Of("secret-a", "2026-09-17:8.8.8.8"));
        Assert.NotEqual(TrafficHash.Of("secret-a", "2026-09-16:8.8.8.8"), TrafficHash.Of("secret-b", "2026-09-16:8.8.8.8"));
    }

    private static TrafficOptions Options() => new(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["TRAFFIC_ENABLED"] = "true", ["POSTHOG_HOST"] = "https://us.i.posthog.com", ["POSTHOG_PROJECT_KEY"] = "project-key",
        ["POSTHOG_PROJECT_ID"] = "1", ["POSTHOG_QUERY_KEY"] = "query-key", ["TRAFFIC_HASH_SECRET"] = new string('x', 32),
        ["UPSTASH_REDIS_REST_URL"] = "https://example.upstash.io", ["UPSTASH_REDIS_REST_TOKEN"] = "redis-key",
        ["PROXYCHECK_API_KEY"] = "lookup-key"
    }).Build());

    [Fact]
    public async Task Redis_failure_or_exhausted_quota_never_calls_capture_or_enrichment()
    {
        foreach (var failure in new[] { true, false })
        {
            var handler = new FakeHttp(_ => failure ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) : Reply(new { result = 0 }));
            var provider = new TrafficProviders(new HttpClient(handler), Options());
            try { await provider.CaptureAsync(new(Site().Target, DateTimeOffset.UtcNow, "/", "8.8.8.8", ""), CancellationToken.None); }
            catch (HttpRequestException) { Assert.True(failure); }
            Assert.Single(handler.Requests);
            Assert.Contains("EVAL", handler.Bodies[0]);
            Assert.DoesNotContain("posthog", handler.Requests[0]);
        }
    }

    [Fact]
    public async Task Enrichment_cache_hit_does_not_spend_lookup_quota()
    {
        var handler = new FakeHttp(_ => Reply(new { result = JsonSerializer.Serialize(new Enrichment("wireless", Enriched: true), new JsonSerializerOptions(JsonSerializerDefaults.Web)) }));
        var provider = new TrafficProviders(new HttpClient(handler), Options());
        var result = await provider.EnrichAsync("8.8.8.8", CancellationToken.None);
        Assert.Equal("wireless", result.Network); Assert.Single(handler.Requests);
        Assert.DoesNotContain("8.8.8.8", handler.Bodies[0]);
    }

    [Fact]
    public async Task Provider_failures_are_not_reported_as_zero_traffic()
    {
        var handler = new FakeHttp(_ => new(HttpStatusCode.Forbidden));
        var options = Options();
        var report = await new TrafficReports(new(new HttpClient(handler), options), options)
            .PostHogAsync(Site(), new(), DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.Equal("error", report.Status); Assert.Null(report.Data);
    }

    [Fact]
    public async Task Every_aggregate_and_recent_query_applies_the_same_filters()
    {
        var handler = new FakeHttp(_ => Reply(new { results = Array.Empty<object>() }));
        var options = Options();
        var report = await new TrafficReports(new(new HttpClient(handler), options), options)
            .PostHogAsync(Site(), new(30, "wireless", "unknown"), DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.Equal("connected", report.Status); Assert.Equal(5, handler.Bodies.Count);
        foreach (var body in handler.Bodies)
        {
            using var document = JsonDocument.Parse(body);
            var sql = document.RootElement.GetProperty("query").GetProperty("query").GetString()!;
            Assert.Contains("properties.network = 'wireless'", sql); Assert.Contains("properties.bot = 'unknown'", sql);
            Assert.Contains($"properties.site_id = '{SiteId:D}'", sql);
            Assert.DoesNotContain("or properties.site_id", sql, StringComparison.OrdinalIgnoreCase);
        }
        Assert.Contains("limit 100", handler.Bodies.Last());
    }

    [Fact]
    public async Task Live_auth_is_rechecked_and_revoked_admin_is_denied()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Supabase:Url"] = "https://example.supabase.co", ["Supabase:PublishableKey"] = "publishable", ["ADMIN_EMAILS"] = "" }).Build();
        var handler = new FakeHttp(i => Reply(User("other@example.com", i == 1 ? "admin" : "moderator")));
        var access = new AdminAccess(new HttpClient(handler), config);
        var context = new DefaultHttpContext { User = new(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, Subject.ToString())], "test")) };
        context.Request.Headers.Authorization = "Bearer test-token";
        Assert.Equal(200, await access.CheckAsync(context));
        Assert.Equal(403, await access.CheckAsync(context));
        Assert.Equal(2, handler.Requests.Count);
        Assert.Equal(401, await access.CheckAsync(new DefaultHttpContext()));
    }

    private static HttpResponseMessage Reply(object body) => new(HttpStatusCode.OK) { Content = JsonContent.Create(body) };

    [Fact]
    public void Arbitrary_site_ids_require_ownership_even_for_authenticated_users()
    {
        var sites = Registry();
        var context = Context(Subject);
        Assert.NotNull(sites.Authorize(context, SiteId));
        Assert.Null(sites.Authorize(context, OtherSiteId));
        Assert.Null(sites.Authorize(context, Guid.NewGuid()));
        Assert.Single(sites.Accessible(context));
        Assert.Null(sites.CaptureTarget("other.example.com"));
        Assert.Null(sites.CaptureTarget("attacker.example.com"));
        Assert.Equal(SiteId, sites.CaptureTarget("TRACKSESH.COM")!.SiteId);
    }

    [Fact]
    public void Shared_target_ip_does_not_merge_sites_or_mix_visitor_and_lookup_ips()
    {
        var first = Site().Target;
        var second = Registry().Authorize(Context(Guid.Parse("00000000-0000-4000-8000-000000000002")), OtherSiteId)!.Target;
        Assert.Equal(first.TargetIp, second.TargetIp);
        var a = TrafficProviders.CaptureProperties(new(first, DateTimeOffset.UtcNow, "/", "8.8.8.8", ""), new Enrichment(Enriched: true));
        var b = TrafficProviders.CaptureProperties(new(second, DateTimeOffset.UtcNow, "/", "8.8.8.8", ""), new Enrichment(Enriched: true));
        Assert.NotEqual(a["site_id"], b["site_id"]);
        Assert.Equal("1.1.1.1", a["target_ip"]);
        Assert.Equal("8.8.8.8", a["visitor_ip"]);
        Assert.Equal("8.8.8.8", a["proxycheck_lookup_ip"]);
        var changedAddress = first with { TargetIp = "9.9.9.9" };
        var c = TrafficProviders.CaptureProperties(new(changedAddress, DateTimeOffset.UtcNow, "/", null, ""), new());
        Assert.Equal(a["site_id"], c["site_id"]);
        Assert.Equal("9.9.9.9", c["target_ip"]);
    }

    [Fact]
    public async Task Queries_for_two_sites_never_fall_back_to_project_wide_data()
    {
        var handler = new FakeHttp(_ => Reply(new { results = Array.Empty<object>() }));
        var options = Options();
        var reports = new TrafficReports(new(new HttpClient(handler), options), options);
        var other = Registry().Authorize(Context(Guid.Parse("00000000-0000-4000-8000-000000000002")), OtherSiteId)!;
        foreach (var site in new[] { Site(), other })
        {
            await reports.PostHogAsync(site, new(), DateTimeOffset.UtcNow, CancellationToken.None);
            foreach (var body in handler.Bodies.TakeLast(5))
            {
                var sql = JsonDocument.Parse(body).RootElement.GetProperty("query").GetProperty("query").GetString()!;
                Assert.Contains($"properties.site_id = '{site.Target.SiteId:D}'", sql);
                Assert.DoesNotContain("site_id is null", sql, StringComparison.OrdinalIgnoreCase);
            }
        }
        Assert.Throws<ArgumentException>(() => new TrafficFilter().Where(Guid.Empty, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Missing_or_duplicate_site_configuration_cannot_capture()
    {
        var empty = new MonitoredSites(new ConfigurationBuilder().Build());
        Assert.Empty(empty.Accessible(Context(Subject)));
        Assert.Null(empty.CaptureTarget("tracksesh.com"));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["TRAFFIC_SITES_JSON"] = $"[{{\"site_id\":\"{SiteId}\"}},{{\"site_id\":\"{SiteId}\"}}]" }).Build();
        Assert.Throws<InvalidOperationException>(() => new MonitoredSites(config));
    }

    [Fact]
    public async Task Http_reports_reject_missing_unknown_and_unowned_ids_before_provider_calls()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Logging.ClearProviders();
        builder.Services.AddAuthorization();
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddNpgsqlDataSource(TestDatabase.DefaultConnection);
        builder.Services.AddScoped<Db>();
        var handler = new FakeHttp(_ => Reply(User("admin@example.com", "admin")));
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Supabase:Url"] = "https://example.supabase.co", ["Supabase:PublishableKey"] = "publishable" }).Build();
        builder.Services.AddSingleton(new AdminAccess(new HttpClient(handler), config));
        builder.Services.AddSingleton(Registry());
        builder.Services.AddSingleton(Options());
        builder.Services.AddSingleton(new TrafficProviders(new HttpClient(handler), Options()));
        builder.Services.AddSingleton<TrafficReports>();
        builder.Services.AddSingleton<TargetReports>();
        builder.Services.AddSingleton<TrafficQueue>();
        await using var app = builder.Build();
        app.Use(async (context, next) => { context.User = Context(Subject).User; await next(); });
        app.UseAuthorization();
        app.MapAdminEndpoints();
        app.Urls.Add("http://127.0.0.1:0");
        await app.StartAsync();
        try
        {
            using var client = new HttpClient { BaseAddress = new Uri(app.Urls.Single()) };
            client.DefaultRequestHeaders.Authorization = new("Bearer", "test-token");
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/admin/traffic")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/admin/traffic?site_id={OtherSiteId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/admin/traffic?site_id={Guid.NewGuid()}")).StatusCode);
            var list = await client.GetStringAsync("/api/admin/sites");
            Assert.Contains(SiteId.ToString(), list);
            Assert.DoesNotContain(OtherSiteId.ToString(), list);
            Assert.All(handler.Requests, url => Assert.Equal("https://example.supabase.co/auth/v1/user", url));
        }
        finally { await app.StopAsync(); }
    }
    private sealed class FakeHttp(Func<int, HttpResponseMessage> reply) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];
        public List<string> Bodies { get; } = [];
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!.ToString());
            Bodies.Add(request.Content == null ? "" : await request.Content.ReadAsStringAsync(cancellationToken));
            return reply(Requests.Count);
        }
    }
}
