using Dapper;
using Tracksesh.Api.Data;
using Tracksesh.Api.Models;

namespace Tracksesh.Api.Endpoints;

/// <summary>
/// Tags: the vocabulary that turns "36 minutes at 2pm" into "you read 4h12m
/// this week".
///
/// No query here filters by user. That is not an oversight — every statement
/// runs inside <see cref="Db.RunAsync{T}"/> as the `authenticated` role with
/// `auth.uid()` bound to the caller, so the row level security policies scope
/// each one. A redundant `user_id = @me` would read as though it were the thing
/// doing the work, and the day someone removed it from a query that had lost
/// its policy, nothing would look wrong.
/// </summary>
public static class TagEndpoints
{
    public static void MapTagEndpoints(this IEndpointRouteBuilder app)
    {
        var tags = app.MapGroup("/api/tags").RequireAuthorization();

        // Archived tags are excluded by default: archiving means "I've stopped
        // using this but keep the history", so it must disappear from every
        // picker while the blocks that already reference it keep their name and
        // colour. Only the tag management view asks for the whole set.
        tags.MapGet("/", async (Db db, bool includeArchived = false) =>
        {
            var rows = await db.RunAsync((c, t) => c.QueryAsync<TagDto>(
                """
                select id, user_id, name, color, is_archived, created_at
                  from public.tags
                 where (@includeArchived or is_archived = false)
                 order by name
                """,
                new { includeArchived }, t));

            return Results.Ok(rows);
        });

        // Blocks and worked seconds per tag, aggregated in the database rather
        // than by fetching every block the user has ever recorded.
        tags.MapGet("/usage", async (Db db) =>
        {
            var rows = await db.RunAsync((c, t) =>
                c.QueryAsync<TagUsageDto>("select * from public.tag_usage()", transaction: t));

            return Results.Ok(rows);
        });

        tags.MapPost("/", async (Db db, CreateTagRequest body) =>
        {
            var tag = await db.RunAsync((c, t) => c.QuerySingleAsync<TagDto>(
                """
                insert into public.tags (user_id, name, color)
                values ((select auth.uid()), btrim(@Name), @Color)
                returning id, user_id, name, color, is_archived, created_at
                """,
                new { body.Name, body.Color }, t));

            return Results.Created($"/api/tags/{tag.Id}", tag);
        });

        // Rename, recolour, or archive/restore. Only the given fields are
        // touched — coalesce is safe here because none of the three is
        // meaningfully nullable in the table.
        tags.MapPatch("/{id:long}", async (Db db, long id, UpdateTagRequest body) =>
        {
            var tag = await db.RunAsync((c, t) => c.QuerySingleOrDefaultAsync<TagDto>(
                """
                update public.tags
                   set name        = coalesce(btrim(@Name), name),
                       color       = coalesce(@Color, color),
                       is_archived = coalesce(@IsArchived, is_archived)
                 where id = @id
                returning id, user_id, name, color, is_archived, created_at
                """,
                new { id, body.Name, body.Color, body.IsArchived }, t));

            return tag is null ? Results.NotFound() : Results.Ok(tag);
        });

        // History survives: time_blocks.tag_id is ON DELETE SET NULL, so this
        // tag's blocks fall back to unlabelled rather than vanishing. That
        // unlabelling is not reversible, which is why the UI counts the affected
        // blocks (via /usage) and offers archiving first.
        tags.MapDelete("/{id:long}", async (Db db, long id) =>
        {
            var deleted = await db.RunAsync((c, t) => c.ExecuteAsync(
                "delete from public.tags where id = @id", new { id }, t));

            return deleted == 0 ? Results.NotFound() : Results.NoContent();
        });
    }
}
