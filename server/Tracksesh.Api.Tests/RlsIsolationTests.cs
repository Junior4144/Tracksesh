using Dapper;
using Tracksesh.Api.Data;

namespace Tracksesh.Api.Tests;

/// <summary>
/// That one user cannot reach another's data.
///
/// This is the only property in the codebase where being wrong is a breach
/// rather than a bug, and it is enforced somewhere no C# reviewer looks — in
/// the policies in supabase/migrations/, activated by two SET LOCAL statements
/// in <see cref="Db"/>. Delete `set local role authenticated` and every test
/// that merely exercises a feature still passes, because the app works
/// perfectly with authorization switched off; you only notice when someone
/// reads a stranger's ledger.
///
/// So these assert the guarantee directly, from the outside, with two real
/// users and real rows.
/// </summary>
public sealed class RlsIsolationTests
{
    static RlsIsolationTests() => DefaultTypeMap.MatchNamesWithUnderscores = true;

    [Fact]
    public async Task A_user_sees_only_their_own_tags()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        var seen = await db.As(alice).RunAsync((c, t) =>
            c.QueryAsync<Guid>("select user_id from public.tags", transaction: t));

        var owners = seen.Distinct().ToList();

        // Both users exist and both have seeded tags, so an empty result would
        // pass a naive "can't see Bob's" assertion for the wrong reason.
        Assert.NotEmpty(owners);
        Assert.Equal([alice], owners);
        Assert.DoesNotContain(bob, owners);
    }

    [Fact]
    public async Task A_user_cannot_update_another_users_tag()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        var bobsTag = await db.PrivilegedAsync<long>(
            "select id from public.tags where user_id = $1 order by id limit 1", bob);

        var affected = await db.As(alice).RunAsync((c, t) => c.ExecuteAsync(
            "update public.tags set name = 'pwned' where id = @id", new { id = bobsTag }, t));

        Assert.Equal(0, affected);

        var name = await db.PrivilegedAsync<string>(
            "select name from public.tags where id = $1", bobsTag);
        Assert.NotEqual("pwned", name);
    }

    [Fact]
    public async Task A_user_cannot_delete_another_users_tag()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        var bobsTag = await db.PrivilegedAsync<long>(
            "select id from public.tags where user_id = $1 order by id limit 1", bob);

        var affected = await db.As(alice).RunAsync((c, t) => c.ExecuteAsync(
            "delete from public.tags where id = @id", new { id = bobsTag }, t));

        Assert.Equal(0, affected);
        Assert.Equal(1, await db.PrivilegedAsync<long>(
            "select count(*) from public.tags where id = $1", bobsTag));
    }

    /// <summary>
    /// The WITH CHECK half of the policies. Without it a user could hand their
    /// row to someone else, or plant one in their account.
    /// </summary>
    [Fact]
    public async Task A_user_cannot_create_a_row_owned_by_someone_else()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        await Assert.ThrowsAsync<Npgsql.PostgresException>(() =>
            db.As(alice).RunAsync((c, t) => c.ExecuteAsync(
                "insert into public.tags (user_id, name, color) values (@bob, 'planted', 'blue')",
                new { bob }, t)));

        Assert.Equal(0, await db.PrivilegedAsync<long>(
            "select count(*) from public.tags where user_id = $1 and name = 'planted'", bob));
    }

    /// <summary>
    /// That the role switch actually happened.
    ///
    /// If `set local role authenticated` were dropped, the connection would stay
    /// on the connection-string role — which has BYPASSRLS — and every policy
    /// above would silently stop applying while the app carried on working.
    /// </summary>
    [Fact]
    public async Task The_session_role_is_dropped_to_authenticated()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();

        var (role, bypassesRls, claimedSub) = await db.As(alice).RunAsync((c, t) =>
            c.QuerySingleAsync<(string, bool, string)>(
                """
                select current_user::text,
                       (select rolbypassrls from pg_roles where rolname = current_user),
                       (select auth.uid()::text)
                """, transaction: t));

        Assert.Equal("authenticated", role);
        Assert.False(bypassesRls);
        Assert.Equal(alice.ToString(), claimedSub);
    }

    /// <summary>
    /// The one that would be a cross-account leak.
    ///
    /// The impersonation is SET LOCAL, so it dies with its transaction. If it
    /// were ever changed to a plain SET, it would ride the pooled connection
    /// into whichever request picked it up next — and that request would run as
    /// the previous user. Reusing one small pool and alternating identities is
    /// what makes that visible.
    /// </summary>
    [Fact]
    public async Task Identity_never_leaks_between_users_on_a_pooled_connection()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        for (var i = 0; i < 25; i++)
        {
            var expected = i % 2 == 0 ? alice : bob;

            var owners = await db.As(expected).RunAsync((c, t) =>
                c.QueryAsync<Guid>("select distinct user_id from public.tags", transaction: t));

            Assert.Equal([expected], owners.ToList());
        }
    }

    /// <summary>
    /// The same leak, from the other side: once the transaction has committed,
    /// the connection it used must carry no trace of who used it.
    /// </summary>
    [Fact]
    public async Task Impersonation_does_not_outlive_its_transaction()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();

        await db.As(alice).RunAsync((c, t) =>
            c.QueryAsync<Guid>("select user_id from public.tags", transaction: t));

        // A fresh, unimpersonated connection from the same pool.
        var leftBehind = await db.PrivilegedAsync<string>(
            "select current_setting('request.jwt.claims', true)");
        var role = await db.PrivilegedAsync<string>("select current_user::text");

        Assert.True(string.IsNullOrEmpty(leftBehind), $"claims survived the transaction: {leftBehind}");
        Assert.NotEqual("authenticated", role);
    }

    /// <summary>
    /// Concurrency, because the pool is shared and the failure mode is a race.
    /// </summary>
    [Fact]
    public async Task Identity_holds_under_concurrent_requests()
    {
        await using var db = new TestDatabase();
        var alice = await db.CreateUserAsync();
        var bob = await db.CreateUserAsync();

        var work = Enumerable.Range(0, 40).Select(async i =>
        {
            var expected = i % 2 == 0 ? alice : bob;
            var owners = await db.As(expected).RunAsync((c, t) =>
                c.QueryAsync<Guid>("select distinct user_id from public.tags", transaction: t));
            return (expected, actual: owners.ToList());
        });

        foreach (var (expected, actual) in await Task.WhenAll(work))
            Assert.Equal([expected], actual);
    }
}
