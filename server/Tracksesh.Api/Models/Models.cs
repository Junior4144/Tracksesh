namespace Tracksesh.Api.Models;

/// <summary>
/// The wire shapes.
///
/// Property names are PascalCase here and snake_case on the wire — the whole
/// API serializes with <c>JsonNamingPolicy.SnakeCaseLower</c>, so these line up
/// with the column names and, more usefully, with the TypeScript interfaces in
/// src/lib/types.ts that were written against Supabase. That is deliberate: it
/// is what let the entire front end keep reading `started_at` and
/// `paused_seconds` through this migration without a single component changing.
/// </summary>

/// <summary>
/// Mirrors public.tags.
///
/// Timestamps come back as <see cref="DateTime"/> with <c>Kind.Utc</c>, which
/// Npgsql guarantees for `timestamptz` and which serializes with a trailing Z.
/// Requests take <see cref="DateTimeOffset"/> instead, so a client that sends an
/// offset is understood rather than silently reinterpreted.
/// </summary>
public sealed record TagDto(
    long Id,
    Guid UserId,
    string Name,
    string Color,
    bool IsArchived,
    DateTime CreatedAt);

/// <summary>A tag as it hangs off a block — just enough to draw it.</summary>
public sealed record TagRefDto(long Id, string Name, string Color);

/// <summary>One row of tag_usage(): how much history a tag carries.</summary>
public sealed record TagUsageDto(long TagId, long BlockCount, long TotalSeconds);

/// <summary>
/// Mirrors public.time_blocks.
///
/// <paramref name="EndedAt"/> null means this is the running session;
/// <paramref name="PausedAt"/> non-null means it is currently paused and that
/// pause has not yet been folded into <paramref name="PausedSeconds"/>.
/// </summary>
public sealed record TimeBlockDto(
    long Id,
    Guid UserId,
    long? TagId,
    string? Note,
    DateTime StartedAt,
    DateTime? EndedAt,
    DateTime? PausedAt,
    int PausedSeconds,
    string Source,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    TagRefDto? Tag);

// ── Requests ────────────────────────────────────────────────────────────────

public sealed record CreateTagRequest(string Name, string Color);

/// <summary>Rename, recolour, or archive/restore. Null means "leave alone".</summary>
public sealed record UpdateTagRequest(string? Name, string? Color, bool? IsArchived);

/// <summary>Backfill: a block for time that happened without the stopwatch running.</summary>
public sealed record CreateBlockRequest(
    DateTimeOffset StartedAt,
    DateTimeOffset EndedAt,
    long? TagId,
    string? Note);

/// <summary>
/// Edit a finished block.
///
/// <paramref name="TagId"/> and <paramref name="Note"/> are always applied, so
/// null genuinely clears them — that is what labelling a block "unlabelled" is.
/// The timestamps are the optional pair: send neither to retag without moving
/// the block, send both to correct when it happened.
/// </summary>
public sealed record PatchBlockRequest(
    long? TagId,
    string? Note,
    DateTimeOffset? StartedAt,
    DateTimeOffset? EndedAt);

/// <summary>Deleting an account is irreversible, so it costs a re-typed password.</summary>
public sealed record DeleteAccountRequest(string Password);
