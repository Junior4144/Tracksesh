using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Tracksesh.Api.Auth;

/// <summary>
/// Supabase Auth issues the tokens; this API only verifies them.
///
/// Nothing here talks to GoTrue on the request path — a JWT is verified against
/// Supabase's public signing keys, offline. The user id is the `sub` claim, and
/// that is the only thing the rest of the app needs from a token.
/// </summary>
public static class SupabaseAuth
{
    /// <summary>Every Supabase access token carries this audience.</summary>
    private const string Audience = "authenticated";

    public static IServiceCollection AddSupabaseJwt(this IServiceCollection services, IConfiguration config)
    {
        var url = (config["Supabase:Url"] ?? "").TrimEnd('/');
        if (string.IsNullOrWhiteSpace(url))
            throw new InvalidOperationException("Supabase:Url is not configured.");

        var issuer = $"{url}/auth/v1";

        // The hosted stack signs with rotating asymmetric keys (ES256/RS256) published
        // as a JWKS; the local `supabase start` stack still signs with one shared HS256
        // secret. Both are supported because local development needs the second one.
        var sharedSecret = config["Supabase:JwtSecret"];

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = Audience,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    // `sub` is a uuid, not a name, but it is the identity this app keys on.
                    NameClaimType = ClaimTypes.NameIdentifier,
                    RoleClaimType = "role",
                    ClockSkew = TimeSpan.FromSeconds(30),
                };

                if (!string.IsNullOrWhiteSpace(sharedSecret))
                {
                    options.TokenValidationParameters.IssuerSigningKey =
                        new SymmetricSecurityKey(Encoding.UTF8.GetBytes(sharedSecret));
                }
                else
                {
                    // ConfigurationManager handles the parts that are easy to get wrong:
                    // caching the key set, refreshing it on a schedule, and re-fetching
                    // when a token arrives signed by a key it hasn't seen (a rotation).
                    var jwksUrl = $"{issuer}/.well-known/jwks.json";
                    options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
                        jwksUrl,
                        new JwksConfigurationRetriever(),
                        new HttpDocumentRetriever
                        {
                            RequireHttps = jwksUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase),
                        });
                }
            });

        services.AddAuthorization();
        return services;
    }

    /// <summary>
    /// The signed-in user's id, as Postgres knows it.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// If there is no `sub`. Endpoints requiring auth can only be reached with a
    /// validated token, so this means a token shape we don't understand, not an
    /// anonymous caller — and failing loudly beats running a query as nobody.
    /// </exception>
    public static Guid UserId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
                  ?? principal.FindFirstValue("sub");

        return Guid.TryParse(sub, out var id)
            ? id
            : throw new InvalidOperationException("Token has no usable `sub` claim.");
    }
}

/// <summary>
/// Feeds a bare JWKS document to <see cref="ConfigurationManager{T}"/>.
///
/// The built-in retriever expects an OpenID discovery document and follows its
/// `jwks_uri`. GoTrue publishes the key set directly, so this skips a hop that
/// may not exist and wraps the keys in the shape the manager wants.
/// </summary>
internal sealed class JwksConfigurationRetriever : IConfigurationRetriever<OpenIdConnectConfiguration>
{
    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
        string address, IDocumentRetriever retriever, CancellationToken cancel)
    {
        var document = await retriever.GetDocumentAsync(address, cancel).ConfigureAwait(false);
        var configuration = new OpenIdConnectConfiguration();

        foreach (var key in new JsonWebKeySet(document).GetSigningKeys())
            configuration.SigningKeys.Add(key);

        return configuration;
    }
}
