/** Mirrors public.tags. */
export interface Tag {
  id: number;
  user_id: string;
  name: string;
  color: string;
  is_archived: boolean;
  created_at: string;
}

/** One row of the `tag_usage()` RPC: how much history a tag carries. */
export interface TagUsage {
  tag_id: number;
  block_count: number;
  total_seconds: number;
}

/**
 * Mirrors public.time_blocks — the one core object.
 *
 * `ended_at === null` means this is the running session. `paused_at !== null`
 * means it is currently paused, and the pause has not yet been folded into
 * `paused_seconds` (that happens on resume or stop).
 */
export interface TimeBlock {
  id: number;
  user_id: string;
  tag_id: number | null;
  note: string | null;
  started_at: string;
  ended_at: string | null;
  paused_at: string | null;
  paused_seconds: number;
  source: 'timer' | 'manual';
  created_at: string;
  updated_at: string;
}

/** A block joined to its tag, as the activity view and history list need it. */
export interface TimeBlockWithTag extends TimeBlock {
  tag: Pick<Tag, 'id' | 'name' | 'color'> | null;
}

/**
 * The categorical palette, as slot names. Tags store one of these rather than a
 * hex so each theme can resolve its own step (see --series-* in globals.scss) —
 * a colour readable on the dark card is not readable on white.
 *
 * Fixed order, assigned in sequence. A ninth tag reuses a slot; hues are never
 * generated, because a generated hue lands wherever it likes relative to the
 * eight that were checked for colour-blind separation.
 *
 * The order is chosen so every *prefix* separates well, since slots are handed
 * out in sequence and most users only ever see the first few together. Keep it
 * in sync with private.seed_default_tags — see the migration that sets it for
 * the measured separation at each size.
 */
export const TAG_SLOTS = [
  'blue',
  'aqua',
  'yellow',
  'green',
  'red',
  'magenta',
  'orange',
  'violet',
] as const;

export type TagSlot = (typeof TAG_SLOTS)[number];

/** Resolve a stored slot to the current theme's step. */
export function slotColor(slot: string | null | undefined): string {
  return slot && (TAG_SLOTS as readonly string[]).includes(slot)
    ? `var(--series-${slot})`
    : 'var(--series-none)';
}
