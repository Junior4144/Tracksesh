namespace Tracksesh.Api.Security;

public static class SpaRoutes
{
    // Cold loads of these client routes need the app shell, not a homepage or 404.
    // Keep aligned with src/App.tsx. API routes and missing assets never use this list.
    private static readonly HashSet<string> Paths = new(StringComparer.OrdinalIgnoreCase)
    {
        "/dashboard", "/planner", "/subjects", "/insights", "/activity", "/tags",
        "/account", "/admin", "/admin/traffic", "/account/update-password",
        "/login", "/register", "/forgot-password", "/auth/confirm", "/auth/link-expired"
    };

    public static bool IsWorkspacePath(string path) => Paths.Contains(path.TrimEnd('/'));

    public static void MapWorkspaceFallback(this WebApplication app)
    {
        // A selected fallback endpoint prevents StaticFileMiddleware from serving
        // the default file. Map the homepage explicitly instead of relying on it.
        app.MapMethods("/", ["GET", "HEAD"], context => SendShell(context, "index.html", 200, true));
        app.MapFallback(context => SendShell(context, "app.html",
            IsWorkspacePath(context.Request.Path.Value ?? "") ? 200 : 404, false));

        async Task SendShell(HttpContext context, string file, int status, bool indexable)
        {
            context.Response.StatusCode = status;
            context.Response.ContentType = "text/html; charset=utf-8";
            context.Response.Headers.CacheControl = "no-store, max-age=0";
            context.Response.Headers.Pragma = "no-cache";
            if (!indexable) context.Response.Headers["X-Robots-Tag"] = "noindex, follow";
            var shell = app.Environment.WebRootFileProvider.GetFileInfo(file);
            if (!shell.Exists)
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            context.Response.ContentLength = shell.Length;
            if (!HttpMethods.IsHead(context.Request.Method))
                await context.Response.SendFileAsync(shell, context.RequestAborted);
        }
    }
}
