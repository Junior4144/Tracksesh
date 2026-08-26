using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Dapper;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;
using Tracksesh.Api.Auth;
using Tracksesh.Api.Data;
using Tracksesh.Api.Endpoints;
using Tracksesh.Api.Security;

var builder = WebApplication.CreateBuilder(args);

// ── Serialization ───────────────────────────────────────────────────────────
//
// snake_case on the wire, in both directions. The tables, the SQL, the JSON and
// the TypeScript interfaces in src/lib/types.ts then all spell a column the same
// way, which is what let the front end move off Supabase without a single
// component changing how it reads a block.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});

// The reader's other half: `paused_seconds` -> PausedSeconds without an
// attribute on every property.
DefaultTypeMap.MatchNamesWithUnderscores = true;

// ── Database ────────────────────────────────────────────────────────────────
var connectionString = builder.Configuration.GetConnectionString("Postgres")
    ?? throw new InvalidOperationException("ConnectionStrings:Postgres is not configured.");

builder.Services.AddNpgsqlDataSource(connectionString);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<Db>();

// ── Auth ────────────────────────────────────────────────────────────────────
var supabaseUrl = (builder.Configuration["Supabase:Url"] ?? "").TrimEnd('/');

builder.Services.AddSupabaseJwt(builder.Configuration);
builder.Services.AddHttpClient<SupabaseAuthClient>();

builder.Services.AddExceptionHandler<PostgresExceptionHandler>();
builder.Services.AddProblemDetails();

/*
 * HSTS lifetime. ASP.NET defaults to 30 days; this makes it a decision rather
 * than a default, because the number is not free to change later.
 *
 * A browser that has seen this header refuses plain HTTP for the whole
 * duration, and there is no way to call that back — a domain that loses its
 * certificate is unreachable until the max-age expires. Thirty days is the
 * right place to start. Raise it to a year (31536000) once TLS has been boring
 * for a while, which is also the threshold the preload list requires.
 */
builder.Services.AddHsts(options =>
    options.MaxAge = TimeSpan.FromDays(builder.Configuration.GetValue("Security:HstsDays", 30)));

// ── Rate limiting ───────────────────────────────────────────────────────────
//
// Partitioned by user rather than by connection: this app is one account per
// person, so the account is the thing worth protecting, and an IP is both too
// coarse (a shared NAT) and too easy to change.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            PartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                // Generous: a cold page load is a handful of requests and the
                // activity view refetches on every range change. This is a
                // ceiling on abuse, not a budget the UI should ever feel.
                PermitLimit = 240,
                Window = TimeSpan.FromMinutes(1),
            }));

    /*
     * Account deletion is the one endpoint that checks a password, so it is the
     * one endpoint that can be used to guess one. Reaching it already needs a
     * valid token for the account being deleted, which makes it a poor oracle —
     * but "poor" is not "none", and five attempts per quarter hour costs a real
     * user nothing.
     */
    options.AddPolicy(RateLimitPolicies.PasswordCheck, context =>
        RateLimitPartition.GetFixedWindowLimiter(
            PartitionKey(context),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(15),
            }));

    // The authenticated user if there is one — UseRateLimiter runs after
    // UseAuthentication below, so by here the token has been verified and `sub`
    // cannot be forged.
    static string PartitionKey(HttpContext context) =>
        context.User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? context.Connection.RemoteIpAddress?.ToString()
        ?? "anonymous";
});

/*
 * CORS exists for the case where the SPA is served from somewhere other than
 * this process — a `vite dev` on another port, say.
 *
 * The default dev setup does not need it: vite.config.ts proxies /api here, so
 * the browser only ever sees one origin. It is configured rather than assumed
 * because the alternative — a wildcard origin left switched on — is how an API
 * ends up callable from any page on the internet.
 */
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Length > 0)
{
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        // The tokens travel in an Authorization header, not a cookie, so
        // credentialed requests are not needed and are not permitted.
        .WithExposedHeaders("Date")));
}

var app = builder.Build();

app.UseExceptionHandler();

/*
 * Transport security, in production only — a dev machine has no certificate and
 * `vite dev` talks plain HTTP to this process.
 *
 * `Security:TrustProxyHeaders` exists because the two lines below disagree
 * about reality behind a TLS-terminating proxy: the proxy speaks HTTPS to the
 * browser and HTTP to us, so UseHttpsRedirection sees an insecure request and
 * redirects a request that was already secure — forever. Turning this on makes
 * X-Forwarded-Proto authoritative and fixes that. It is off by default because
 * trusting the header when there is *no* proxy in front lets any client claim
 * its plain-HTTP request was secure.
 */
if (!app.Environment.IsDevelopment())
{
    var behindProxy = app.Configuration.GetValue("Security:TrustProxyHeaders", false);

    // See TransportSecurity.ForAnyProxy — the "trust any proxy" part is easy to
    // write in a way that compiles, reads correctly, and does nothing.
    if (behindProxy) app.UseForwardedHeaders(TransportSecurity.ForAnyProxy());

    // Only emitted on responses the framework considers secure, which is why
    // the switch above is not cosmetic: behind a TLS-terminating proxy without
    // it, every request looks like plain HTTP and this header is never sent at
    // all. Excluded hosts (localhost and friends) still never receive it.
    app.UseHsts();

    /*
     * Redirection belongs to whichever layer terminates TLS.
     *
     * Behind a proxy that is the proxy, and doing it here as well is at best
     * redundant and at worst a loop. Exposed directly, this works — it finds the
     * port from the https URL the server is listening on, and does nothing at
     * all if there isn't one, which it reports as a warning that reads like a
     * misconfiguration. Making the condition explicit is the difference between
     * "off because the proxy has it" and "silently doing nothing".
     */
    if (!behindProxy) app.UseHttpsRedirection();
}

app.UseSecurityHeaders(supabaseUrl);

if (allowedOrigins.Length > 0) app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

// After authentication, so requests are counted against the user who made them
// rather than whichever address they arrived from.
app.UseRateLimiter();

app.MapTagEndpoints();
app.MapBlockEndpoints();
app.MapSessionEndpoints();
app.MapAccountEndpoints();

// Liveness, and the one route that deliberately needs no token. It reports
// nothing about the process — no version, no dependencies — because an
// unauthenticated endpoint should not be an inventory.
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

/*
 * Anything under /api that matched no endpoint above is a missing endpoint, and
 * has to say so.
 *
 * This route exists because of the fallback below it. MapFallbackToFile answers
 * *every* unmatched path with index.html, which is right for /activity and
 * badly wrong for /api/tgas: the caller gets 200 and a page of HTML, and the
 * first thing it sees is a JSON parse error somewhere far from the typo. A
 * catch-all here is more specific than the fallback and less specific than the
 * real routes, so it slots in exactly between them.
 */
app.Map("/api/{**rest}", () => Results.NotFound());

/*
 * The built SPA, served from wwwroot by this same process.
 *
 * MapFallbackToFile is what makes client-side routing work on a cold load:
 * without it, opening /activity directly asks this server for a file that
 * doesn't exist.
 */
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");

app.Run();
