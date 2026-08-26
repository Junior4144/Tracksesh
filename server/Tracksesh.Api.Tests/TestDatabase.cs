using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Npgsql;
using Tracksesh.Api.Data;

namespace Tracksesh.Api.Tests;

/// <summary>
/// Integration fixtures, against a real Postgres.
///
/// These tests cannot be unit tests, and substituting the database would defeat
/// their entire purpose: what is under test is the row level security policies
/// and the role switch, neither of which exists anywhere but in Postgres. A
/// mock would assert that the mock works.
///
/// Needs the local stack (`supabase start`), or DATABASE_URL pointing somewhere
/// disposable. Every test cleans up the users it creates, and deleting a user
/// cascades to their tags and blocks.
/// </summary>
public sealed class TestDatabase : IAsyncDisposable
{
    public const string DefaultConnection =
        "Host=127.0.0.1;Port=54322;Database=postgres;Username=postgres;Password=postgres";

    private readonly List<Guid> _created = [];

    public NpgsqlDataSource DataSource { get; }

    public TestDatabase()
    {
        var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL_ADO") ?? DefaultConnection;
        DataSource = NpgsqlDataSource.Create(connectionString);
    }

    /// <summary>
    /// A real row in auth.users, because `tags.user_id` has a foreign key to it
    /// and `auth.uid()` has to match something. The sign-up trigger fires, so
    /// each new user arrives with the five seeded tags.
    /// </summary>
    public async Task<Guid> CreateUserAsync()
    {
        var id = Guid.NewGuid();

        await using var connection = await DataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(
            "insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')",
            connection);
        command.Parameters.AddWithValue(id);
        command.Parameters.AddWithValue($"test-{id:N}@tracksesh.invalid");
        await command.ExecuteNonQueryAsync();

        _created.Add(id);
        return id;
    }

    /// <summary>A <see cref="Db"/> that believes it is serving <paramref name="userId"/>.</summary>
    public Db As(Guid userId) => new(DataSource, new StubAccessor(userId));

    /// <summary>Runs SQL with no impersonation at all, to set up and to check up on.</summary>
    public async Task<T?> PrivilegedAsync<T>(string sql, params object[] parameters)
    {
        await using var connection = await DataSource.OpenConnectionAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        foreach (var parameter in parameters) command.Parameters.AddWithValue(parameter);

        var result = await command.ExecuteScalarAsync();
        return result is null or DBNull ? default : (T)result;
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var id in _created)
        {
            await using var connection = await DataSource.OpenConnectionAsync();
            await using var command = new NpgsqlCommand("delete from auth.users where id = $1", connection);
            command.Parameters.AddWithValue(id);
            await command.ExecuteNonQueryAsync();
        }

        await DataSource.DisposeAsync();
    }

    private sealed class StubAccessor(Guid userId) : IHttpContextAccessor
    {
        public HttpContext? HttpContext { get; set; } = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                authenticationType: "Test")),
        };
    }
}
