using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;

namespace Tracksesh.Api.Admin;

public record TrafficRequest(MonitoredSite Site, DateTimeOffset Timestamp, string Path, string? VisitorIp, string Evidence);
public record Enrichment(string Network = "unknown", string? Country = null, string? City = null,
    string? Provider = null, bool Vpn = false, bool Proxy = false, bool Tor = false,
    bool Scraper = false, bool Enriched = false);

public static class TrafficPrivacy
{
    public static string? PublicPath(HttpRequest request)
    {
        if (request.Method is not ("GET" or "HEAD") ||
            request.Headers["Purpose"].ToString().Contains("prefetch", StringComparison.OrdinalIgnoreCase) ||
            request.Headers["Sec-Purpose"].ToString().Contains("prefetch", StringComparison.OrdinalIgnoreCase)) return null;
        // Tracksesh has one public content route. Everything else is account,
        // authentication, ledger data or static assets. Never save arbitrary paths.
        return request.Path == "/" ? "/" : null;
    }

    public static string Evidence(string agent) => string.IsNullOrWhiteSpace(agent) ? "Missing user-agent" :
        new[] { "bot", "spider", "crawler", "headless", "curl/", "wget/", "python-requests" }
            .Any(s => agent.Contains(s, StringComparison.OrdinalIgnoreCase)) ? "Declared automation user-agent" : "";

    public static string? ClientIp(string forwarded, bool locked, int hops)
    {
        if (!locked || hops is < 1 or > 10 || forwarded.Length > 4096) return null;
        var chain = forwarded.Split(',');
        if (chain.Length < hops) return null;
        return PublicIp(chain[^hops].Trim());
    }

    public static string? PublicIp(string raw)
    {
        if (raw.Contains('%') || !IPAddress.TryParse(raw, out var ip)) return null;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        var b = ip.GetAddressBytes();
        if (ip.AddressFamily == AddressFamily.InterNetwork)
        {
            // Reject legacy short/octal IPv4 spellings and all special-purpose ranges.
            if (!raw.Contains(':') && raw != ip.ToString()) return null;
            if (b[0] is 0 or 10 or 127 || b[0] >= 224 ||
                (b[0] == 100 && b[1] is >= 64 and <= 127) ||
                (b[0] == 169 && b[1] == 254) || (b[0] == 172 && b[1] is >= 16 and <= 31) ||
                (b[0] == 192 && (b[1] is 0 or 168 || (b[1] == 88 && b[2] == 99))) ||
                (b[0] == 198 && (b[1] is 18 or 19 || (b[1] == 51 && b[2] == 100))) ||
                (b[0] == 203 && b[1] == 0 && b[2] == 113)) return null;
        }
        else
        {
            // Only global unicast; conservatively exclude IETF assignments,
            // documentation, 6to4, and documentation's newer 3fff::/20 range.
            if ((b[0] & 0xe0) != 0x20 ||
                (b[0] == 0x20 && b[1] == 0x01 && (b[2] < 2 || (b[2] == 0x0d && b[3] == 0xb8))) ||
                (b[0] == 0x20 && b[1] == 0x02) || (b[0] == 0x3f && b[1] == 0xff)) return null;
        }
        return ip.ToString();
    }
}

public sealed class TrafficQueue
{
    public Channel<TrafficRequest> Requests { get; } = Channel.CreateBounded<TrafficRequest>(new BoundedChannelOptions(256)
        { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });
    public long Dropped;
    public long Failed;
}

public sealed class TrafficCaptureMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, TrafficOptions options, TrafficQueue queue, MonitoredSites sites)
    {
        var site = sites.CaptureTarget(context.Request.Host.Host);
        var path = options.CaptureReady && site != null ? TrafficPrivacy.PublicPath(context.Request) : null;
        // Read before forwarded-header middleware rewrites the chain. The explicit
        // hop contract is separate from ASP.NET's transport/protocol configuration.
        var item = path == null ? null : new TrafficRequest(site!, DateTimeOffset.UtcNow, path,
            TrafficPrivacy.ClientIp(context.Request.Headers["X-Forwarded-For"].ToString(), options.IngressLocked, options.Hops),
            TrafficPrivacy.Evidence(context.Request.Headers.UserAgent.ToString()));
        await next(context);
        if (item != null && !queue.Requests.Writer.TryWrite(item)) Interlocked.Increment(ref queue.Dropped);
    }
}

public sealed class TrafficWorker(TrafficQueue queue, TrafficProviders providers, ILogger<TrafficWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var request in queue.Requests.Reader.ReadAllAsync(stoppingToken))
        {
            try { await providers.CaptureAsync(request, stoppingToken); }
            catch (Exception e) when (e is not OutOfMemoryException)
            {
                Interlocked.Increment(ref queue.Failed);
                // Exception URLs can contain API keys or visitor IPs. Never log them.
                logger.LogWarning("Traffic capture was not delivered; browsing is unaffected.");
            }
        }
    }
}

public static class TrafficHash
{
    public static string Of(string secret, string value) =>
        Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
