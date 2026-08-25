import type { SupabaseClient } from '@supabase/supabase-js';
import type { Tag, TimeBlock, TimeBlockWithTag } from './types';

/**
 * Data access for the ledger. Every call runs as the signed-in user, so RLS —
 * not any filter written here — is what keeps one user's blocks away from
 * another's. The `user_id` filters below exist to help the planner, not to
 * enforce anything.
 */

const BLOCK_COLUMNS = 'id, user_id, tag_id, note, started_at, ended_at, paused_at, paused_seconds, source, created_at, updated_at';
const BLOCK_WITH_TAG = `${BLOCK_COLUMNS}, tag:tags (id, name, color)`;

/**
 * The database's current time, for correcting local clock drift.
 *
 * The HTTP `Date` header would do, but it isn't on the CORS safelist and this
 * project doesn't expose it, so the browser can't read it.
 */
export async function fetchServerNow(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('server_now');
  if (error) throw error;
  return data as string;
}

export async function fetchTags(supabase: SupabaseClient): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('is_archived', false)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/** The live session, if there is one. At most one exists per user. */
export async function fetchRunningBlock(supabase: SupabaseClient): Promise<TimeBlock | null> {
  const { data, error } = await supabase
    .from('time_blocks')
    .select(BLOCK_COLUMNS)
    .is('ended_at', null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Stopwatch transitions. Each is a single server-side statement that timestamps
 * with the database clock — see supabase/migrations/*_session_rpcs.sql.
 * A null return means there was nothing to act on.
 */

export async function startSession(supabase: SupabaseClient): Promise<TimeBlock> {
  const { data, error } = await supabase.rpc('start_session');
  if (error) throw error;
  if (!data) throw new Error('Could not start a session.');
  return data;
}

export async function pauseSession(supabase: SupabaseClient): Promise<TimeBlock | null> {
  const { data, error } = await supabase.rpc('pause_session');
  if (error) throw error;
  return data;
}

export async function resumeSession(supabase: SupabaseClient): Promise<TimeBlock | null> {
  const { data, error } = await supabase.rpc('resume_session');
  if (error) throw error;
  return data;
}

export async function stopSession(supabase: SupabaseClient): Promise<TimeBlock | null> {
  const { data, error } = await supabase.rpc('stop_session');
  if (error) throw error;
  return data;
}

/** Answers "what did you do in this block?" after the stopwatch stops. */
export async function labelBlock(
  supabase: SupabaseClient,
  id: number,
  tagId: number | null,
  note: string
): Promise<void> {
  const { error } = await supabase
    .from('time_blocks')
    .update({ tag_id: tagId, note: note.trim() || null })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteBlock(supabase: SupabaseClient, id: number): Promise<void> {
  const { error } = await supabase.from('time_blocks').delete().eq('id', id);
  if (error) throw error;
}

/** Backfill: a block for time that happened without the stopwatch running. */
export async function createManualBlock(
  supabase: SupabaseClient,
  userId: string,
  input: { startedAt: Date; endedAt: Date; tagId: number | null; note?: string }
): Promise<TimeBlock> {
  const { data, error } = await supabase
    .from('time_blocks')
    .insert({
      user_id: userId,
      started_at: input.startedAt.toISOString(),
      ended_at: input.endedAt.toISOString(),
      tag_id: input.tagId,
      note: input.note?.trim() || null,
      source: 'manual',
    })
    .select(BLOCK_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Finished blocks overlapping [from, to) — what the activity view draws.
 * Overlap, not containment, so a session spanning midnight shows up on both days.
 */
export async function fetchBlocksInRange(
  supabase: SupabaseClient,
  from: Date,
  to: Date
): Promise<TimeBlockWithTag[]> {
  const { data, error } = await supabase
    .from('time_blocks')
    .select(BLOCK_WITH_TAG)
    .not('ended_at', 'is', null)
    .lt('started_at', to.toISOString())
    .gt('ended_at', from.toISOString())
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as TimeBlockWithTag[];
}

export async function fetchRecentBlocks(
  supabase: SupabaseClient,
  limit = 8
): Promise<TimeBlockWithTag[]> {
  const { data, error } = await supabase
    .from('time_blocks')
    .select(BLOCK_WITH_TAG)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as TimeBlockWithTag[];
}

export async function createTag(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  color: string
): Promise<Tag> {
  const { data, error } = await supabase
    .from('tags')
    .insert({ user_id: userId, name: name.trim(), color })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}
