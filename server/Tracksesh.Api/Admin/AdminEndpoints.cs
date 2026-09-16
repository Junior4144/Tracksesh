using Dapper;
using Tracksesh.Api.Data;

namespace Tracksesh.Api.Admin;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        // Capability discovery is a normal account-page request, not a refusal
        // for ordinary users. Sensitive routes below still require the full gate.
        app.MapGet("/api/admin/access", async (HttpContext context, AdminAccess access) =>
        {
            context.Response.Headers.CacheControl = "no-store, private";
            var status = await access.CheckAsync(context);
            return status is 200 or 403 ? Results.Ok(new { is_admin = status == 200 }) :
                Results.Json(new { message = "Admin identity verification is unavailable." }, statusCode: status);
        }).RequireAuthorization();
        var group = app.MapGroup("/api/admin").RequireAuthorization().AddEndpointFilter<AdminFilter>();
        group.MapGet("/sites", (HttpContext context, MonitoredSites sites) => Results.Ok(
            sites.Accessible(context).Select(s => new { s.SiteId, s.Name, s.Domain })));
        group.MapGet("/", async (Db db, CancellationToken cancel) =>
        {
            ProviderReport database;
            try
            {
                var tables = await db.RunAsync((c, t) => c.QueryAsync<TableSecurity>(new CommandDefinition("""
                    select c.relname as name, c.relrowsecurity as rls_enabled,
                      c.relforcerowsecurity as rls_forced, greatest(c.reltuples, 0)::bigint as estimated_rows,
                      (select count(*)::int from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies
                    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind in ('r', 'p')
                    order by c.relname limit 100
                    """, transaction: t, cancellationToken: cancel)), cancel);
                database = new("connected", "Read-only catalog snapshot. Row estimates may be stale. RLS enabled and policy counts do not prove policy correctness.", tables);
            }
            catch (Exception e) when (e is Npgsql.NpgsqlException or TimeoutException)
            { database = new("error", "Database security metadata is unavailable. No table data was returned."); }
            return Results.Ok(new { database, security = new[]
            {
                new { name = "Admin identity", detail = "Verified with Supabase Auth on every admin request; confirmed email required." },
                new { name = "Database isolation", detail = "Queries run in a transaction as authenticated, with the verified user's claims." },
                new { name = "Private responses", detail = "Admin API responses use Cache-Control: no-store. Provider credentials stay on the server." },
                new { name = "Abuse limits", detail = "API requests are rate limited. Traffic events and enrichment use shared quota reservations." }
            }});
        });
        group.MapGet("/traffic", async (Guid? site_id, int? days, string? network, string? bot, TrafficReports reports,
            HttpContext context, MonitoredSites sites, TargetReports targets,
            TrafficOptions options, TrafficQueue queue, CancellationToken cancel) =>
        {
            if (site_id == null) return Results.BadRequest(new { message = "Select a monitored site." });
            var site = sites.Authorize(context, site_id.Value);
            if (site == null) return Results.NotFound(new { message = "Monitored site not found or access is unavailable." });
            var filter = new TrafficFilter(days ?? 1, network ?? "all", bot ?? "all");
            if (!filter.Valid) return Results.BadRequest(new { message = "Choose 1, 7 or 30 days and a supported network/bot filter." });
            var end = DateTimeOffset.UtcNow;
            var posthog = reports.PostHogAsync(site, filter, end, cancel);
            var cloudflare = reports.CloudflareAsync(site, filter.Days, end, cancel);
            var target = targets.ReadAsync(site, cancel);
            var quotas = reports.QuotasAsync(cancel);
            await Task.WhenAll(posthog, cloudflare, quotas, target);
            return Results.Ok(new
            {
                site = new { site.Target.SiteId, site.Target.Name, site.Target.Domain }, target = await target,
                generated_at = end, posthog = await posthog, cloudflare = await cloudflare, quotas = await quotas,
                capture = new
                {
                    enabled = options.Enabled, ready = options.CaptureReady && sites.CaptureTarget(site.Target.Domain ?? "")?.SiteId == site.Target.SiteId,
                    ip_trust_configured = options.IngressLocked && options.Hops > 0,
                    enrichment_configured = options.Has("PROXYCHECK_API_KEY"),
                    dropped_this_process = Interlocked.Read(ref queue.Dropped), failed_this_process = Interlocked.Read(ref queue.Failed)
                }
            });
        });
    }
    public record TableSecurity(string Name, bool RlsEnabled, bool RlsForced, long EstimatedRows, int Policies);
}
