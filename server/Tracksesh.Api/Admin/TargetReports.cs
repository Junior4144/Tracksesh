using System.Net;
using System.Net.Sockets;

namespace Tracksesh.Api.Admin;

public record TargetAddress(string TargetIp, string DnsRecordType, string Source);
public record TargetLookup(string LookupIp, string LookupPurpose, Enrichment Result);

public sealed class TargetReports(TrafficProviders providers, TrafficOptions options)
{
    // Takes the same access capability as PostHog and Cloudflare. No client-supplied
    // hostname or lookup IP is accepted. DNS resolution never fetches a target URL.
    public async Task<ProviderReport> ReadAsync(AuthorizedSite site, CancellationToken cancel)
    {
        var target = site.Target;
        var addresses = new List<TargetAddress>();
        var dnsStatus = "not_configured";
        if (target.Domain != null)
        {
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
                timeout.CancelAfter(TimeSpan.FromSeconds(4));
                var resolved = await Dns.GetHostAddressesAsync(target.Domain, timeout.Token);
                addresses.AddRange(resolved.Select(ip => new TargetAddress(ip.ToString(),
                    ip.AddressFamily == AddressFamily.InterNetwork ? "A" : "AAAA", "system-dns")).Distinct().Take(16));
                dnsStatus = "resolved";
            }
            catch (Exception e) when (e is SocketException or OperationCanceledException)
            { dnsStatus = "unavailable"; }
        }
        if (target.TargetIp != null && addresses.All(a => a.TargetIp != target.TargetIp))
            addresses.Add(new(target.TargetIp, target.TargetIp.Contains(':') ? "AAAA" : "A", "configured"));
        var lookups = new List<TargetLookup>();
        var lookupStatus = "not_configured";
        if (options.RedisReady && options.Has("PROXYCHECK_API_KEY") && options.Value("TRAFFIC_HASH_SECRET").Length >= 32)
        {
            lookupStatus = "ready";
            foreach (var address in addresses.Where(a => TrafficPrivacy.PublicIp(a.TargetIp) != null).Take(4))
            {
                try
                {
                    var result = await providers.EnrichAsync(address.TargetIp, cancel);
                    lookups.Add(new(address.TargetIp, "monitored-target", result));
                    if (!result.Enriched) lookupStatus = "partial_or_quota_limited";
                }
                catch (Exception e) when (e is HttpRequestException or TaskCanceledException or System.Text.Json.JsonException or InvalidOperationException)
                { lookupStatus = "unavailable"; }
            }
        }
        return new("connected", "Current A/AAAA resolution uses the server DNS resolver; TTL and other record types are not available here. Up to four public target IPs are enriched. These are target addresses, not visitor IPs.",
            new { site_id = target.SiteId, domain = target.Domain, configured_target_ip = target.TargetIp,
                resolved_at = DateTimeOffset.UtcNow, dns_status = dnsStatus, addresses,
                proxycheck_status = lookupStatus, lookups });
    }
}
