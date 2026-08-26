import { TAG_SLOTS, type TagSlot } from './types';
import { formatTotal } from './time';

/**
 * Validation for the two places a block is authored by hand — backfill and
 * edit — plus the tag rules the management view enforces.
 *
 * Kept out of the components because these are the rules the database will
 * apply anyway: every check here mirrors a constraint in
 * supabase/migrations/*_time_blocks_and_tags.sql. The point is to fail with a
 * sentence before Postgres fails with a constraint name, so they have to stay
 * in step — which is easier to trust when they're testable on their own.
 */

/** `YYYY-MM-DD` for a date input, in local time (toISOString would shift it). */
export function dateValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:MM` for a time input, in local time. */
export function timeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The `Date` a date input and a time input describe together, in local time. */
export function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

/**
 * Why a start/end pair can't be saved, or null if it can.
 *
 * `pausedSeconds` is the pause total already recorded on the block being
 * edited — a timer session that was paused for 10 minutes cannot be edited down
 * to a 5-minute span without the pause exceeding the block, which is what
 * `time_blocks_pause_fits` rejects. It is 0 for a new backfilled block.
 */
export function validateBlockRange({
  startedAt,
  endedAt,
  nowMs,
  pausedSeconds = 0,
}: {
  startedAt: Date;
  endedAt: Date;
  nowMs: number;
  pausedSeconds?: number;
}): string | null {
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return 'That date or time is not valid.';
  }

  const spanSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;

  if (spanSeconds <= 0) {
    // Overnight blocks are legitimate, but silently rolling the end forward a
    // day would be a guess. Ask instead.
    return 'The end time must be after the start time.';
  }

  if (endedAt.getTime() > nowMs) {
    return "That's in the future — this is a record of what you did.";
  }

  if (spanSeconds < pausedSeconds) {
    return `This session has ${formatTotal(pausedSeconds)} of pauses recorded, so it can't be shorter than that.`;
  }

  return null;
}

/**
 * Why a tag name can't be used, or null if it can.
 *
 * The case-insensitive clash mirrors the `tags_user_name_key` unique index —
 * PostgREST would report it as a duplicate-key error naming the index, which is
 * not something to put in front of a user. `selfId` exempts the tag being
 * renamed, so saving "Reading" over "Reading" isn't a clash with itself.
 */
export function tagNameError(
  name: string,
  existing: { id: number; name: string }[],
  selfId?: number
): string | null {
  const trimmed = name.trim();

  if (!trimmed) return 'Give the tag a name.';
  if (trimmed.length > 40) return 'Keep tag names to 40 characters or fewer.';

  const clash = existing.find(
    (t) => t.id !== selfId && t.name.toLowerCase() === trimmed.toLowerCase()
  );

  return clash ? `You already have a tag called "${clash.name}".` : null;
}

/**
 * The slot a new tag should get: the next one in fixed order, wrapping once all
 * eight are used. Hues are never generated — see TAG_SLOTS.
 */
export function nextSlot(tagCount: number): TagSlot {
  return TAG_SLOTS[tagCount % TAG_SLOTS.length];
}
