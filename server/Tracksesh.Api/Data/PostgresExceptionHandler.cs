using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

namespace Tracksesh.Api.Data;

/// <summary>
/// Turns the constraints into sentences.
///
/// The schema is where the rules actually live, so it is also where a bad write
/// is caught — including writes the client thought it had validated, because two
/// tabs can always race. What comes back from Npgsql is a constraint name, which
/// is exactly right for a log and useless in a dialog. This maps the ones a user
/// can actually trigger onto the wording they need, and lets everything else
/// fall through to a 500 rather than inventing an explanation for it.
/// </summary>
public sealed class PostgresExceptionHandler(ILogger<PostgresExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken cancel)
    {
        if (exception is not PostgresException pg) return false;

        var (status, message) = Translate(pg);
        if (status is null) return false;

        logger.LogWarning(pg, "Rejected write: {SqlState} {ConstraintName}", pg.SqlState, pg.ConstraintName);

        context.Response.StatusCode = status.Value;
        await context.Response.WriteAsJsonAsync(new { message }, cancel);
        return true;
    }

    private static (int? Status, string Message) Translate(PostgresException pg) => pg.SqlState switch
    {
        // 23505 unique_violation
        PostgresErrorCodes.UniqueViolation when pg.ConstraintName == "tags_user_name_key" =>
            (StatusCodes.Status409Conflict, "You already have a tag with that name."),

        // The partial unique index that guarantees one stopwatch per user. Two
        // tabs pressing start at once is the ordinary way to reach this.
        PostgresErrorCodes.UniqueViolation when pg.ConstraintName == "time_blocks_one_running_idx" =>
            (StatusCodes.Status409Conflict, "A session is already running."),

        PostgresErrorCodes.UniqueViolation =>
            (StatusCodes.Status409Conflict, "That already exists."),

        // 23514 check_violation
        PostgresErrorCodes.CheckViolation => (StatusCodes.Status400BadRequest, pg.ConstraintName switch
        {
            "time_blocks_ends_after_start" => "A block has to end after it starts.",
            "time_blocks_pause_fits" => "That block is shorter than the pauses already recorded inside it.",
            "time_blocks_note_len" => "A note can be at most 500 characters.",
            "tags_name_not_blank" => "A tag needs a name between 1 and 40 characters.",
            "tags_color_is_slot" => "That is not one of the available colours.",
            _ => "That change isn't allowed.",
        }),

        // 23503 foreign_key_violation — a tag that was deleted in another tab.
        PostgresErrorCodes.ForeignKeyViolation =>
            (StatusCodes.Status400BadRequest, "That tag no longer exists."),

        // 42501 insufficient_privilege. Reaching this means the row level
        // security policies rejected the write, which is a bug in this service,
        // not something the user did — so it says nothing about whose row it was.
        PostgresErrorCodes.InsufficientPrivilege =>
            (StatusCodes.Status403Forbidden, "You don't have access to that."),

        _ => (null, ""),
    };
}
