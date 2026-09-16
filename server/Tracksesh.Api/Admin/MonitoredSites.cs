using System.Collections.Immutable;
using System.Text.Json;
using Tracksesh.Api.Auth;

namespace Tracksesh.Api.Admin;

// Operator-managed registry, not client input. IDs are assigned once and retained
// across DNS/domain changes. Shared provider credentials live outside these rows.
public sealed record MonitoredSite(Guid SiteId, string Name, string? Domain, string? TargetIp,
    string? CloudflareZoneId, ImmutableArray<Guid> OwnerUserIds, ImmutableArray<string> OwnerEmails);

public sealed class AuthorizedSite
{
    public MonitoredSite Target { get; }
    internal AuthorizedSite(MonitoredSite target) => Target = target;
}

public sealed class MonitoredSites
{
    private readonly ImmutableArray<MonitoredSite> sites;
    public Guid? CaptureSiteId { get; }

    public MonitoredSites(IConfiguration config)
    {
        CaptureSiteId = Guid.TryParse(config["TRAFFIC_SITE_ID"], out var id) && id != Guid.Empty ? id : null;
        var rows = string.IsNullOrWhiteSpace(config["TRAFFIC_SITES_JSON"])
            ? CaptureSiteId is { } single ? new[] { new SiteConfig
            {
                SiteId = single, Name = "Tracksesh", Domain = config["TRAFFIC_DOMAIN"],
                TargetIp = config["TRAFFIC_TARGET_IP"], CloudflareZoneId = config["CLOUDFLARE_ZONE_ID"],
                OwnerEmails = ["gbjunior014@gmail.com"]
            } } : []
            : JsonSerializer.Deserialize<SiteConfig[]>(config["TRAFFIC_SITES_JSON"]!, new JsonSerializerOptions
            { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower }) ?? [];
        if (rows.Any(s => s.SiteId == Guid.Empty) || rows.Select(s => s.SiteId).Distinct().Count() != rows.Length)
            throw new InvalidOperationException("Monitored sites require unique, nonempty immutable UUIDs.");
        sites = rows.Select(s => new MonitoredSite(s.SiteId, s.Name ?? "Monitored site", NormalizeDomain(s.Domain),
            string.IsNullOrWhiteSpace(s.TargetIp) ? null : TrafficPrivacy.PublicIp(s.TargetIp) ?? throw new InvalidOperationException("Target IP must be a public address."),
            s.CloudflareZoneId, (s.OwnerUserIds ?? []).ToImmutableArray(), (s.OwnerEmails ?? []).ToImmutableArray())).ToImmutableArray();
    }

    private static string? NormalizeDomain(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var domain = value.Trim().TrimEnd('.').ToLowerInvariant();
        if (Uri.CheckHostName(domain) != UriHostNameType.Dns || !domain.Contains('.') || domain.Length > 253)
            throw new InvalidOperationException("Monitored domain must be a DNS hostname without a URL, port or path.");
        return domain;
    }

    public static bool CanAccess(MonitoredSite site, Guid userId, string? verifiedEmail) =>
        site.OwnerUserIds.Contains(userId) || (verifiedEmail != null && site.OwnerEmails.Contains(verifiedEmail, StringComparer.OrdinalIgnoreCase));

    public IEnumerable<MonitoredSite> Accessible(HttpContext context) => sites.Where(s =>
        CanAccess(s, context.User.UserId(), context.Items[AdminAccess.VerifiedEmailKey] as string));

    // Only the access resolver constructs the capability handed to reporting code.
    // Unknown IDs and known-but-unowned IDs are indistinguishable to callers.
    public AuthorizedSite? Authorize(HttpContext context, Guid id) =>
        Accessible(context).FirstOrDefault(s => s.SiteId == id) is { } site ? new(site) : null;

    public MonitoredSite? CaptureTarget(string host) => sites.FirstOrDefault(s => s.SiteId == CaptureSiteId &&
        s.Domain != null && string.Equals(s.Domain, host.TrimEnd('.'), StringComparison.OrdinalIgnoreCase));

    private sealed class SiteConfig
    {
        public Guid SiteId { get; init; }
        public string? Name { get; init; }
        public string? Domain { get; init; }
        public string? TargetIp { get; init; }
        public string? CloudflareZoneId { get; init; }
        public Guid[]? OwnerUserIds { get; init; }
        public string[]? OwnerEmails { get; init; }
    }
}
