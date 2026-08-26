using System.Security.Claims;
using System.Text.Json;
using Npgsql;
using Tracksesh.Api.Auth;

namespace Tracksesh.Api.Data;

/// <summary>
/// Every database call in this app goes through here, and the reason is
/// authorization.
///
/// The tables carry row level security policies written against `auth.uid()`
/// (see supabase/migrations/*_time_blocks_and_tags.sql). Those policies are
/// what keep one user's ledger away from another's — not the WHERE clauses in
/// this codebase. To keep them working now that a .NET process sits between the
/// browser and Postgres, each request adopts the caller's identity for the
/// duration of one transaction, exactly as PostgREST does:
///
///   1. `request.jwt.claims` is set, so `auth.uid()` resolves to the `sub` of
///      the token this request arrived with.
///   2. The session role drops to `authenticated`, so `TO authenticated`
///      policies apply *and* the connection loses the BYPASSRLS the
///      connection-string role has. Without this step every policy silently
///      does nothing and everything appears to work.
///
/// Both are set with `SET LOCAL` semantics, which is why all work happens
/// inside a transaction and why <see cref="RunAsync{T}"/> owns that transaction
/// rather than exposing the connection. Npgsql pools connections: a setting
/// that outlived its transaction would be inherited by whichever request
/// grabbed that connection next, handing it the previous user's identity. That
/// failure is silent and it is a cross-account data leak, so the scope is not
/// left to a caller to remember.
/// </summary>
public sealed class Db(NpgsqlDataSource dataSource, IHttpContextAccessor accessor)
{
    /// <summary>
    /// Runs <paramref name="work"/> in one transaction, as the current user.
    ///
    /// Multi-statement operations belong in a single call rather than several —
    /// besides being atomic, each call is a separate connection lease.
    /// </summary>
    public async Task<T> RunAsync<T>(Func<NpgsqlConnection, NpgsqlTransaction, Task<T>> work, CancellationToken cancel = default)
    {
        var user = accessor.HttpContext?.User
                   ?? throw new InvalidOperationException("No HttpContext; Db is request-scoped.");

        await using var connection = await dataSource.OpenConnectionAsync(cancel).ConfigureAwait(false);
        await using var transaction = await connection.BeginTransactionAsync(cancel).ConfigureAwait(false);

        await ImpersonateAsync(connection, transaction, user, cancel).ConfigureAwait(false);

        var result = await work(connection, transaction).ConfigureAwait(false);

        await transaction.CommitAsync(cancel).ConfigureAwait(false);
        return result;
    }

    private static async Task ImpersonateAsync(
        NpgsqlConnection connection, NpgsqlTransaction transaction, ClaimsPrincipal user, CancellationToken cancel)
    {
        // Only `sub` and `role` are forwarded. auth.uid() reads the first; the
        // policies need nothing else, and a claim the database never consults is
        // one more thing that could be trusted by accident later.
        var claims = JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["sub"] = user.UserId().ToString(),
            ["role"] = "authenticated",
        });

        // Parameterised, so a claim value can never be read as SQL. The third
        // argument to set_config is `is_local` — the SET LOCAL that scopes this
        // to the transaction.
        await using (var setClaims = new NpgsqlCommand("select set_config('request.jwt.claims', $1, true)", connection, transaction))
        {
            setClaims.Parameters.AddWithValue(claims);
            await setClaims.ExecuteNonQueryAsync(cancel).ConfigureAwait(false);
        }

        // SET ROLE takes an identifier, not a parameter. The value is a constant
        // here and must stay one.
        await using var setRole = new NpgsqlCommand("set local role authenticated", connection, transaction);
        await setRole.ExecuteNonQueryAsync(cancel).ConfigureAwait(false);
    }
}
