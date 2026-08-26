import { blockDuration } from './time';
import type { Tag, TimeBlockWithTag } from './types';

/**
 * The account export.
 *
 * Shaped for a human opening the file, not for re-importing into this app: each
 * block carries its tag's name and its worked duration inline, so the JSON
 * answers "where did my time go" without needing to join anything or know that
 * duration is derived. Raw ids and timestamps are kept alongside, so nothing is
 * actually lost.
 */

export const EXPORT_VERSION = 1;

export interface ExportPayload {
  version: number;
  exported_at: string;
  account: { id: string; email: string };
  tags: { id: number; name: string; color: string; is_archived: boolean }[];
  blocks: {
    id: number;
    tag: string | null;
    note: string | null;
    started_at: string;
    ended_at: string | null;
    paused_seconds: number;
    /** Worked seconds — span minus pauses. Null while a session is running. */
    duration_seconds: number | null;
    source: 'timer' | 'manual';
  }[];
}

export function buildExport(
  account: { id: string; email: string },
  tags: Tag[],
  blocks: TimeBlockWithTag[],
  nowMs: number
): ExportPayload {
  return {
    version: EXPORT_VERSION,
    exported_at: new Date(nowMs).toISOString(),
    account,
    tags: tags.map(({ id, name, color, is_archived }) => ({ id, name, color, is_archived })),
    blocks: blocks.map((b) => ({
      id: b.id,
      tag: b.tag?.name ?? null,
      note: b.note,
      started_at: b.started_at,
      ended_at: b.ended_at,
      paused_seconds: b.paused_seconds,
      // A running block has no duration yet, and inventing one by measuring to
      // "now" would bake the moment of export into the data.
      duration_seconds: b.ended_at ? blockDuration(b) : null,
      source: b.source,
    })),
  };
}

/** `tracksesh-export-2026-08-26.json`, dated in the user's own timezone. */
export function exportFilename(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tracksesh-export-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
