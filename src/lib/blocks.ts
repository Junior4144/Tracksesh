import { api, query } from './api';
import type { Tag, TagUsage, TimeBlock, TimeBlockWithTag } from './types';

/**
 * Data access for the ledger.
 *
 * Every call goes to the .NET API, which runs it as the signed-in user — so row
 * level security, not any filter written here or there, is still what keeps one
 * user's blocks away from another's. The functions kept their names and return
 * types through the move off Supabase; they only lost the client they used to
 * take as a first argument, and the user ids the server now knows without being
 * told.
 */

/**
 * The database's current time, for correcting local clock drift.
 *
 * Still a request rather than a response header: the API could expose `Date`
 * now that it sets its own CORS headers, but the value that matters is
 * Postgres's clock — the one that stamped every block — not the web server's.
 */
export async function fetchServerNow(): Promise<string> {
  const { now } = await api.get<{ now: string }>('/time');
  return now;
}

/**
 * The tags a block can be labelled with.
 *
 * Archived tags are excluded by default: archiving means "I've stopped using
 * this but keep the history", so it must disappear from every picker while the
 * blocks that already reference it keep their name and colour. Only the tag
 * management view asks for the whole set.
 */
export function fetchTags({ includeArchived = false } = {}): Promise<Tag[]> {
  return api.get<Tag[]>(`/tags${query({ includeArchived })}`);
}

/** The live session, if there is one. At most one exists per user. */
export function fetchRunningBlock(): Promise<TimeBlock | null> {
  return api.get<TimeBlock | null>('/session');
}

/**
 * Stopwatch transitions. Each is a single server-side statement that timestamps
 * with the database clock — see supabase/migrations/*_session_rpcs.sql.
 * A null return means there was nothing to act on.
 */

export function startSession(): Promise<TimeBlock> {
  return api.post<TimeBlock>('/session/start');
}

export function pauseSession(): Promise<TimeBlock | null> {
  return api.post<TimeBlock | null>('/session/pause');
}

export function resumeSession(): Promise<TimeBlock | null> {
  return api.post<TimeBlock | null>('/session/resume');
}

export function stopSession(): Promise<TimeBlock | null> {
  return api.post<TimeBlock | null>('/session/stop');
}

/** Answers "what did you do in this block?" after the stopwatch stops. */
export async function labelBlock(id: number, tagId: number | null, note: string): Promise<void> {
  await api.patch<void>(`/blocks/${id}`, { tag_id: tagId, note: note.trim() || null });
}

export async function deleteBlock(id: number): Promise<void> {
  await api.delete<void>(`/blocks/${id}`);
}

/** Backfill: a block for time that happened without the stopwatch running. */
export function createManualBlock(input: {
  startedAt: Date;
  endedAt: Date;
  tagId: number | null;
  note?: string;
}): Promise<TimeBlock> {
  return api.post<TimeBlock>('/blocks', {
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt.toISOString(),
    tag_id: input.tagId,
    note: input.note?.trim() || null,
  });
}

/**
 * Finished blocks overlapping [from, to) — what the activity view draws.
 * Overlap, not containment, so a session spanning midnight shows up on both days.
 */
export function fetchBlocksInRange(from: Date, to: Date): Promise<TimeBlockWithTag[]> {
  return api.get<TimeBlockWithTag[]>(
    `/blocks${query({ from: from.toISOString(), to: to.toISOString() })}`
  );
}

/**
 * Every block the user has, oldest first — the account export.
 *
 * Unbounded on purpose: an export that silently stopped at N rows would be
 * worse than no export at all. A personal ledger is a few thousand rows at
 * most, and this runs once, by hand.
 */
export function fetchAllBlocks(): Promise<TimeBlockWithTag[]> {
  return api.get<TimeBlockWithTag[]>('/blocks/all');
}

export function fetchRecentBlocks(limit = 8): Promise<TimeBlockWithTag[]> {
  return api.get<TimeBlockWithTag[]>(`/blocks/recent${query({ limit })}`);
}

/**
 * Edit a finished block: retag it, fix the note, correct the times.
 *
 * The database still has the last word — `time_blocks_ends_after_start` and
 * `time_blocks_pause_fits` reject a range that ends before it starts or that is
 * shorter than the pauses already recorded inside it. `validateBlockRange`
 * checks the same things first so the user gets a sentence instead of a
 * constraint name, and the API translates the constraint into one anyway for
 * the cases only the database can catch.
 */
export async function updateBlock(
  id: number,
  patch: { tagId: number | null; note: string; startedAt: Date; endedAt: Date }
): Promise<void> {
  await api.patch<void>(`/blocks/${id}`, {
    tag_id: patch.tagId,
    note: patch.note.trim() || null,
    started_at: patch.startedAt.toISOString(),
    ended_at: patch.endedAt.toISOString(),
  });
}

export function createTag(name: string, color: string): Promise<Tag> {
  return api.post<Tag>('/tags', { name: name.trim(), color });
}

/** Rename, recolour, or archive/restore. Only the given fields are touched. */
export function updateTag(
  id: number,
  patch: { name?: string; color?: string; is_archived?: boolean }
): Promise<Tag> {
  return api.patch<Tag>(`/tags/${id}`, {
    name: patch.name?.trim(),
    color: patch.color,
    is_archived: patch.is_archived,
  });
}

/**
 * Delete a tag. History survives — `time_blocks.tag_id` is ON DELETE SET NULL,
 * so its blocks fall back to unlabelled rather than vanishing. That unlabelling
 * is not reversible, which is why the UI counts the affected blocks first and
 * offers archiving instead.
 */
export async function deleteTag(id: number): Promise<void> {
  await api.delete<void>(`/tags/${id}`);
}

/** Blocks and worked seconds per tag, aggregated in the database. */
export async function fetchTagUsage(): Promise<Map<number, TagUsage>> {
  const rows = await api.get<TagUsage[]>('/tags/usage');
  return new Map(rows.map((row) => [row.tag_id, row]));
}

/**
 * Erase the account and everything in it.
 *
 * The password goes to the server rather than being checked here: a check the
 * browser performs is a check the browser can skip, and this endpoint is
 * reachable with nothing but a valid token. The API verifies it against
 * Supabase Auth before deleting anything.
 */
export async function deleteAccount(password: string): Promise<void> {
  await api.delete<void>('/account', { password });
}
