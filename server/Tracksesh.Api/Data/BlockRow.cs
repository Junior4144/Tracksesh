using Tracksesh.Api.Models;

namespace Tracksesh.Api.Data;

/// <summary>
/// A block joined to its tag, flat, as it comes back from the reader.
///
/// Flat rather than a Dapper multi-mapping because both sides of the join have
/// a column called `id`: `splitOn` would cut at the first one and hand the tag
/// the block's columns. Aliasing the three tag columns and projecting in
/// <see cref="ToDto"/> costs one method and removes the trap entirely — it also
/// makes "no tag" unambiguous, which multi-mapping is not (it materialises a
/// blank instance for a LEFT JOIN miss rather than a null).
/// </summary>
public sealed class BlockRow
{
    public long Id { get; set; }
    public Guid UserId { get; set; }
    public long? TagId { get; set; }
    public string? Note { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public DateTime? PausedAt { get; set; }
    public int PausedSeconds { get; set; }
    public string Source { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public long? TagRefId { get; set; }
    public string? TagRefName { get; set; }
    public string? TagRefColor { get; set; }

    public TimeBlockDto ToDto() => new(
        Id, UserId, TagId, Note, StartedAt, EndedAt, PausedAt, PausedSeconds, Source, CreatedAt, UpdatedAt,
        TagRefId is { } tagId && TagRefName is { } name && TagRefColor is { } color
            ? new TagRefDto(tagId, name, color)
            : null);
}

/// <summary>Column lists, so the shape of a block is written down once.</summary>
public static class Sql
{
    public const string BlockColumns = """
        b.id, b.user_id, b.tag_id, b.note, b.started_at, b.ended_at, b.paused_at,
        b.paused_seconds, b.source, b.created_at, b.updated_at
        """;

    /// <summary>
    /// A block plus its tag. The LEFT JOIN is required, not an optimisation:
    /// `tag_id` is ON DELETE SET NULL, so an unlabelled block is normal history
    /// rather than an anomaly, and an inner join would hide it.
    /// </summary>
    public const string BlockWithTag = $"""
        select {BlockColumns},
               t.id as tag_ref_id, t.name as tag_ref_name, t.color as tag_ref_color
          from public.time_blocks b
          left join public.tags t on t.id = b.tag_id
        """;
}
