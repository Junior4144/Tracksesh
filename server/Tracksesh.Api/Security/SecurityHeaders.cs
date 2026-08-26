namespace Tracksesh.Api.Security;

/// <summary>
/// The response headers that make the browser enforce what this app assumes.
///
/// The Content-Security-Policy is the important one, and it is here because of
/// a specific decision made elsewhere: the Supabase session lives in
/// localStorage, not an HttpOnly cookie, because the API authenticates on an
/// Authorization header. That is the right shape for a token API, but it means
/// any script an attacker manages to run can read the session and take the
/// account over outright. A cookie-based app degrades; this one does not. CSP
/// is what keeps "no script runs that we didn't ship" from being a promise in a
/// comment.
/// </summary>
public static class SecurityHeaders
{
    public static IApplicationBuilder UseSecurityHeaders(this IApplicationBuilder app, string supabaseUrl)
    {
        /*
         * connect-src has to name Supabase explicitly: sign-in, token refresh
         * and password reset go from the browser straight to GoTrue, not
         * through this API. 'self' covers /api.
         *
         * style-src allows inline where script-src does not, and the asymmetry
         * is deliberate. React writes `style` attributes for every tag colour
         * (slotColor() -> style={{ background: … }}), which CSP counts as
         * inline style. Injected CSS is a real but bounded problem; injected
         * script is the whole account. Refusing one and allowing the other is
         * the trade that leaves the app working.
         */
        var csp = string.Join("; ",
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            $"connect-src 'self' {supabaseUrl}",
            // Nothing here embeds anything, and nothing should embed this.
            "frame-ancestors 'none'",
            "frame-src 'none'",
            "object-src 'none'",
            // Stops an injected <base> from re-pointing every relative URL.
            "base-uri 'self'",
            "form-action 'self'");

        return app.Use(async (context, next) =>
        {
            var headers = context.Response.Headers;

            headers["Content-Security-Policy"] = csp;

            // The emailed-link route carries `?token_hash=…`, which is a
            // single-use credential sitting in the URL. Without this, that whole
            // URL travels in the Referer header of any cross-origin request the
            // page makes — handing the token to a third party. `no-referrer`
            // rather than a laxer policy because nothing here needs a Referer.
            headers["Referrer-Policy"] = "no-referrer";

            // Don't let a response typed application/json be re-interpreted as
            // HTML because it happens to start with a '<'.
            headers["X-Content-Type-Options"] = "nosniff";

            // frame-ancestors already covers this for modern browsers; kept for
            // the ones that only understand the old header.
            headers["X-Frame-Options"] = "DENY";

            // This app asks for none of these. Saying so means a compromised
            // page can't ask either.
            headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";

            await next();
        });
    }
}
