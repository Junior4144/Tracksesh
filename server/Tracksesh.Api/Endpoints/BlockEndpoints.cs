using Dapper;
using Tracksesh.Api.Data;
using Tracksesh.Api.Models;

namespace Tracksesh.Api.Endpoints;

/// <summary>
/// The ledger itself. Isolation is row level security, as described on
/// <see cref="TagEndpoints"/>.
/// </summary>
public static class BlockEndpoints
{
    public static void MapBlockEndpoints(this IEndpointRouteBuilder app)
    {
        var blocks = app.MapGroup("/api/blocks").RequireAuthorization();

        // Finished blocks overlapping [from, to) — what the activity view draws.
        // Overlap, not containment, so a session spanning midnight shows up on
        // both days.
        blocks.MapGet("/", async (Db db, DateTimeOffset from, DateTimeOffset to) =>
        {
            var rows = await db.RunAsync((c, t) => c.QueryAsync<BlockRow>(
                $"""
                 {Sql.BlockWithTag}
                 where b.ended_at is not null
                   and b.started_at < @to
                   and b.ended_at   > @from
                 order by b.started_at desc
                 """,
                new { from = from.UtcDateTime, to = to.UtcDateTime }, t));

            return Results.Ok(rows.Select(r => r.ToDto()));
        });

        // Every block the user has, oldest first — the account export.
        //
        // Unbounded on purpose: an export that silently stopped at N rows would
        // be worse than no export at all. A personal ledger is a few thousand
        // rows at most, and this runs once, by hand.
        blocks.MapGet("/all", async (Db db) =>
        {
            var rows = await db.RunAsync((c, t) => c.QueryAsync<BlockRow>(
                $"{Sql.BlockWithTag} order by b.started_at asc", transaction: t));

            return Results.Ok(rows.Select(r => r.ToDto()));
        });

        blocks.MapGet("/recent", async (Db db, int limit = 8) =>
        {
            // Clamped rather than trusted: the parameter reaches a LIMIT, and an
            // unbounded one is a cheap way to ask for the whole table.
            var take = Math.Clamp(limit, 1, 100);

            var rows = await db.RunAsync((c, t) => c.QueryAsync<BlockRow>(
                $"""
                 {Sql.BlockWithTag}
                 where b.ended_at is not null
                 order by b.started_at desc
                 limit @take
                 """,
                new { take }, t));

            return Results.Ok(rows.Select(r => r.ToDto()));
        });

        // Backfill: a block for time that happened without the stopwatch running.
        // The insert and the read-back share one statement so the row can't be
        // edited by another tab in between.
        blocks.MapPost("/", async (Db db, CreateBlockRequest body) =>
        {
            var row = await db.RunAsync((c, t) => c.QuerySingleAsync<BlockRow>(
                """
                with inserted as (
                  insert into public.time_blocks (user_id, started_at, ended_at, tag_id, note, source)
                  values ((select auth.uid()), @StartedAt, @EndedAt, @TagId,
                          nullif(btrim(coalesce(@Note, '')), ''), 'manual')
                  returning *
                )
                select b.id, b.user_id, b.tag_id, b.note, b.started_at, b.ended_at, b.paused_at,
                       b.paused_seconds, b.source, b.created_at, b.updated_at,
                       t.id as tag_ref_id, t.name as tag_ref_name, t.color as tag_ref_color
                  from inserted b
                  left join public.tags t on t.id = b.tag_id
                """,
                new
                {
                    StartedAt = body.StartedAt.UtcDateTime,
                    EndedAt = body.EndedAt.UtcDateTime,
                    body.TagId,
                    body.Note,
                }, t));

            return Results.Created($"/api/blocks/{row.Id}", row.ToDto());
        });

        // Retag it, fix the note, correct the times.
        //
        // The database still has the last word — time_blocks_ends_after_start and
        // time_blocks_pause_fits reject a range that ends before it starts or
        // that is shorter than the pauses already recorded inside it. The client
        // checks the same things first so the user gets a sentence instead of a
        // constraint name.
        blocks.MapPatch("/{id:long}", async (Db db, long id, PatchBlockRequest body) =>
        {
            var updated = await db.RunAsync((c, t) => c.ExecuteAsync(
                """
                update public.time_blocks
                   set tag_id     = @TagId,
                       note       = nullif(btrim(coalesce(@Note, '')), ''),
                       started_at = coalesce(@StartedAt, started_at),
                       ended_at   = coalesce(@EndedAt, ended_at)
                 where id = @id
                """,
                new
                {
                    id,
                    body.TagId,
                    body.Note,
                    StartedAt = body.StartedAt?.UtcDateTime,
                    EndedAt = body.EndedAt?.UtcDateTime,
                }, t));

            return updated == 0 ? Results.NotFound() : Results.NoContent();
        });

        blocks.MapDelete("/{id:long}", async (Db db, long id) =>
        {
            var deleted = await db.RunAsync((c, t) => c.ExecuteAsync(
                "delete from public.time_blocks where id = @id", new { id }, t));

            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }
}
