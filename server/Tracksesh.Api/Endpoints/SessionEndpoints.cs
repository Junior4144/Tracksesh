using Dapper;
using Tracksesh.Api.Data;

namespace Tracksesh.Api.Endpoints;

/// <summary>
/// The stopwatch.
///
/// Each transition is one call to a database function rather than a read, a
/// decision, and a write from here — see
/// supabase/migrations/*_session_rpcs.sql for why. The short version:
///
///   * The timestamps are `clock_timestamp()`, so a session is stamped by the
///     database's clock rather than by a browser's or by this process's.
///   * Resuming accumulates `paused_seconds` in a single atomic UPDATE. Doing
///     it as read-modify-write loses time when two tabs race.
///   * "The running session" is identified by the database, so a client can
///     never pause or stop a block that isn't actually the live one.
///
/// Keeping them in Postgres rather than porting them to C# also means the
/// partial unique index `time_blocks_one_running_idx` stays the thing that
/// guarantees one stopwatch per user, instead of a check this API hopes to win.
/// </summary>
public static class SessionEndpoints
{
    /// <summary>
    /// Reads a stopwatch transition as one row or none.
    ///
    /// The functions return the affected row, or NULL when there was nothing to
    /// act on — pausing with no session running, say. A composite-returning
    /// function used in FROM yields a single all-NULL row in that case rather
    /// than no rows at all, so the `id is not null` filter is what turns "did
    /// nothing" into an empty result instead of a block with a null id.
    ///
    /// No tag is joined: a transition only ever touches the timing columns, and
    /// a running block is unlabelled by definition — labelling is what happens
    /// after it stops.
    /// </summary>
    private static string TransitionSql(string function) => $"""
        select b.id, b.user_id, b.tag_id, b.note, b.started_at, b.ended_at, b.paused_at,
               b.paused_seconds, b.source, b.created_at, b.updated_at,
               null::bigint as tag_ref_id, null::text as tag_ref_name, null::text as tag_ref_color
          from public.{function}() b
         where b.id is not null
        """;

    private static Task<BlockRow?> TransitionAsync(Db db, string function) =>
        db.RunAsync((c, t) => c.QuerySingleOrDefaultAsync<BlockRow>(TransitionSql(function), transaction: t));

    public static void MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var session = app.MapGroup("/api/session").RequireAuthorization();

        // The live session, if there is one. At most one exists per user.
        session.MapGet("/", async (Db db) =>
        {
            var row = await db.RunAsync((c, t) => c.QuerySingleOrDefaultAsync<BlockRow>(
                $"{Sql.BlockWithTag} where b.ended_at is null", transaction: t));

            return Results.Ok(row?.ToDto());
        });

        // Unlike the others, starting has nothing to be a no-op about: if no row
        // came back the insert did not happen, and the client must not be told a
        // session is running when none is.
        session.MapPost("/start", async (Db db) =>
        {
            var row = await TransitionAsync(db, "start_session");

            return row is null
                ? Results.Problem("Could not start a session.", statusCode: StatusCodes.Status409Conflict)
                : Results.Ok(row.ToDto());
        });

        // For these three, null is a legitimate answer — it means the request
        // raced something else and there was nothing to act on. The client reads
        // that as "no change", so it is a 200 with a null body, not an error.
        session.MapPost("/pause", async (Db db) =>
            Results.Ok((await TransitionAsync(db, "pause_session"))?.ToDto()));

        session.MapPost("/resume", async (Db db) =>
            Results.Ok((await TransitionAsync(db, "resume_session"))?.ToDto()));

        // Stopping while paused folds the open pause into the total first, so the
        // break never counts as worked time.
        session.MapPost("/stop", async (Db db) =>
            Results.Ok((await TransitionAsync(db, "stop_session"))?.ToDto()));
    }
}
