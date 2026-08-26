using System.Net.Http.Json;
using System.Security.Claims;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Tracksesh.Api.Data;
using Tracksesh.Api.Models;
using Tracksesh.Api.Security;

namespace Tracksesh.Api.Endpoints;

public static class AccountEndpoints
{
    public static void MapAccountEndpoints(this IEndpointRouteBuilder app)
    {
        var account = app.MapGroup("/api/account").RequireAuthorization();

        /*
         * Delete the account and everything in it.
         *
         * The password is re-checked before anything is destroyed. A borrowed or
         * stolen session is enough to read someone's ledger; it should not be
         * enough to erase it. The check happens here rather than in the browser
         * because a check the client performs is a check the client can skip —
         * this endpoint is reachable with nothing but a valid token.
         *
         * Verification is a password grant against GoTrue: the one way to
         * confirm a password without this service ever storing or seeing a hash.
         * It mints a throwaway session as a side effect, which is harmless — the
         * account is about to stop existing.
         */
        // [FromBody] is required, not decorative: minimal APIs refuse to infer a
        // body on DELETE, and without it the route fails to build at startup.
        account.MapDelete("/", async (
            Db db,
            ClaimsPrincipal principal,
            [FromBody] DeleteAccountRequest body,
            SupabaseAuthClient auth,
            CancellationToken cancel) =>
        {
            var email = principal.FindFirstValue(ClaimTypes.Email) ?? principal.FindFirstValue("email");
            if (string.IsNullOrWhiteSpace(email))
                return Results.Problem("This account has no email to verify against.", statusCode: 400);

            var verdict = await auth.VerifyPasswordAsync(email, body.Password, cancel);

            if (verdict is PasswordVerdict.Unavailable)
            {
                // The auth server didn't answer. Refusing is the only safe
                // reading: treating "don't know" as "correct" would delete an
                // account on an unverified password, and reporting it as
                // "wrong" would tell a user their own password is bad because
                // something else is down.
                return Results.Problem(
                    "Couldn't verify your password just now. Try again in a moment.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            if (verdict is PasswordVerdict.Wrong)
                return Results.Problem("That password is not correct.", statusCode: StatusCodes.Status403Forbidden);

            // Removing a row from auth.users needs privileges `authenticated`
            // does not have, so the deletion is a SECURITY DEFINER function that
            // takes no arguments and deletes auth.uid() and nothing else. See
            // the account_deletion migration for why that is safe.
            await db.RunAsync((c, t) => c.ExecuteAsync("select public.delete_account()", transaction: t), cancel);

            // Caveat the client has to handle: deleting a user does not
            // invalidate access tokens already issued. The browser signs out
            // immediately after this returns so the dead session doesn't linger.
            return Results.NoContent();
        })
        .RequireRateLimiting(RateLimitPolicies.PasswordCheck);

        // The database's clock, for correcting local drift.
        //
        // Session timestamps are written by Postgres, so elapsed time has to be
        // measured against Postgres's clock too — subtracting a server
        // `started_at` from a local `Date.now()` displays the skew as elapsed
        // time. clock_timestamp() rather than now(), which is frozen at
        // transaction start and would drift by the length of the transaction.
        app.MapGet("/api/time", async (Db db) =>
        {
            var now = await db.RunAsync((c, t) =>
                c.QuerySingleAsync<DateTime>("select clock_timestamp()", transaction: t));

            return Results.Ok(new { now });
        }).RequireAuthorization();
    }
}

/// <summary>The three answers a password check can give.</summary>
public enum PasswordVerdict
{
    Correct,
    Wrong,

    /// <summary>
    /// The auth server could not be asked — it is down, or it rate-limited us.
    /// Distinct from <see cref="Wrong"/> on purpose: an outage must never be
    /// reported to a user as a bad password, and must never be waved through
    /// as a good one.
    /// </summary>
    Unavailable,
}

/// <summary>
/// The only thing this API asks GoTrue at request time: "is this the right
/// password?".
///
/// Delegated rather than answered here because this service has no access to
/// password hashes and should not want any — Supabase Auth owns credentials,
/// and the one operation that needs to check them borrows it for a moment.
/// </summary>
public sealed class SupabaseAuthClient(HttpClient http, IConfiguration config, ILogger<SupabaseAuthClient> logger)
{
    private readonly string _url = (config["Supabase:Url"] ?? "").TrimEnd('/');
    private readonly string _key = config["Supabase:PublishableKey"] ?? "";

    public async Task<PasswordVerdict> VerifyPasswordAsync(string email, string password, CancellationToken cancel)
    {
        try
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Post, $"{_url}/auth/v1/token?grant_type=password")
            {
                Content = JsonContent.Create(new { email, password }),
            };
            request.Headers.Add("apikey", _key);

            using var response = await http.SendAsync(request, cancel).ConfigureAwait(false);

            if (response.IsSuccessStatusCode) return PasswordVerdict.Correct;

            if (response.StatusCode is System.Net.HttpStatusCode.BadRequest
                or System.Net.HttpStatusCode.Unauthorized)
            {
                return PasswordVerdict.Wrong;
            }

            // Nothing from the body is logged: a failed password grant echoes
            // the request, and that request contains the password.
            logger.LogWarning("Password check unavailable: auth server returned {Status}.", (int)response.StatusCode);
            return PasswordVerdict.Unavailable;
        }
        catch (HttpRequestException e)
        {
            logger.LogWarning(e, "Password check unavailable: could not reach the auth server.");
            return PasswordVerdict.Unavailable;
        }
        catch (TaskCanceledException e) when (!cancel.IsCancellationRequested)
        {
            logger.LogWarning(e, "Password check unavailable: the auth server timed out.");
            return PasswordVerdict.Unavailable;
        }
    }
}
