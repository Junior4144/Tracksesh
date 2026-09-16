using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Tracksesh.Api.Auth;

namespace Tracksesh.Api.Admin;

// Admin access is revalidated with Auth on every request. No user-editable
// metadata, browser role, shared traffic token, or stale JWT role grants access.
public sealed class AdminAccess(HttpClient http, IConfiguration config)
{
    public const string VerifiedEmailKey = "admin.verified_email";
    public static bool IsAdmin(JsonElement user, Guid subject, IEnumerable<string> emails)
    {
        if (!user.TryGetProperty("id", out var id) || !Guid.TryParse(id.GetString(), out var actual) || actual != subject)
            return false;
        if (!user.TryGetProperty("email_confirmed_at", out var confirmed) ||
            !DateTimeOffset.TryParse(confirmed.GetString(), out _)) return false;
        if (user.TryGetProperty("is_anonymous", out var anonymous) && anonymous.ValueKind == JsonValueKind.True)
            return false;
        var email = user.TryGetProperty("email", out var address) ? address.GetString() : null;
        var trustedRole = user.TryGetProperty("app_metadata", out var meta) &&
            meta.TryGetProperty("role", out var role) && role.GetString() == "admin";
        return trustedRole || (email != null && emails.Contains(email, StringComparer.OrdinalIgnoreCase));
    }

    public async Task<int> CheckAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated != true) return 401;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get,
                $"{config["Supabase:Url"]?.TrimEnd('/')}/auth/v1/user");
            request.Headers.Authorization = AuthenticationHeaderValue.Parse(context.Request.Headers.Authorization.ToString());
            request.Headers.Add("apikey", config["Supabase:PublishableKey"]);
            using var response = await http.SendAsync(request, context.RequestAborted);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) return 401;
            if (!response.IsSuccessStatusCode) return 503;
            using var document = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(context.RequestAborted), cancellationToken: context.RequestAborted);
            var emails = (config["ADMIN_EMAILS"] ?? "gbjunior014@gmail.com")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (!IsAdmin(document.RootElement, context.User.UserId(), emails)) return 403;
            context.Items[VerifiedEmailKey] = document.RootElement.GetProperty("email").GetString();
            return 200;
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException or JsonException or FormatException)
        {
            return 503;
        }
    }
}

public sealed class AdminFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store, private";
        var status = await context.HttpContext.RequestServices.GetRequiredService<AdminAccess>().CheckAsync(context.HttpContext);
        return status == 200 ? await next(context) : Results.Json(new
        {
            message = status == 403 ? "Administrator access is required." : status == 401
                ? "Sign in to continue." : "Admin identity verification is unavailable. Try again later."
        }, statusCode: status);
    }
}
