import { blockDuration } from './time';
import type { TimeBlockWithTag } from './types';

/** Totals per tag, largest first — the "where did my week go" answer. */
export interface TagTotal {
  tagId: number | null;
  name: string;
  slot: string | null;
  seconds: number;
  /** Share of the range's tracked time, 0–1. */
  share: number;
}

/** One day's total, split by tag, for the stacked trend. */
export interface DayTotal {
  /** Local midnight for the day. */
  date: Date;
  seconds: number;
  segments: { tagId: number | null; name: string; slot: string | null; seconds: number }[];
}

export interface RangeSummary {
  totalSeconds: number;
  sessionCount: number;
  longestSeconds: number;
  /** Mean length of a session, not mean per day. */
  averageSeconds: number;
  byTag: TagTotal[];
  byDay: DayTotal[];
}

const UNLABELLED = 'Unlabelled';

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday-first, matching how most people read a week. */
export function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const dow = (out.getDay() + 6) % 7;
  return addDays(out, -dow);
}

export function rangeFor(mode: 'day' | 'week' | 'month', anchor: Date): { from: Date; to: Date } {
  if (mode === 'day') {
    const from = startOfDay(anchor);
    return { from, to: addDays(from, 1) };
  }
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 7) };
  }
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return { from, to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) };
}

/**
 * Seconds of a block that fall inside [from, to).
 *
 * Blocks may cross midnight, and the range query returns anything overlapping
 * the window, so a block is clipped rather than counted whole. Without this a
 * session running 23:40–00:20 would add 40 minutes to both days.
 *
 * Pauses are distributed across the block proportionally — there is no record
 * of *when* within a block a pause happened, so splitting it by the clipped
 * fraction is the only defensible answer.
 */
export function secondsWithin(block: TimeBlockWithTag, from: Date, to: Date): number {
  if (!block.ended_at) return 0;

  const startMs = Date.parse(block.started_at);
  const endMs = Date.parse(block.ended_at);
  const spanMs = endMs - startMs;
  if (spanMs <= 0) return 0;

  const clippedStart = Math.max(startMs, from.getTime());
  const clippedEnd = Math.min(endMs, to.getTime());
  if (clippedEnd <= clippedStart) return 0;

  const fraction = (clippedEnd - clippedStart) / spanMs;
  return Math.round(blockDuration(block) * fraction);
}

export function summarise(
  blocks: TimeBlockWithTag[],
  from: Date,
  to: Date
): RangeSummary {
  const tagMap = new Map<string, TagTotal>();
  const dayMap = new Map<number, DayTotal>();

  let totalSeconds = 0;
  let longestSeconds = 0;
  let sessionCount = 0;

  for (const block of blocks) {
    const seconds = secondsWithin(block, from, to);
    if (seconds <= 0) continue;

    sessionCount += 1;
    totalSeconds += seconds;
    longestSeconds = Math.max(longestSeconds, blockDuration(block));

    const key = String(block.tag_id ?? 'none');
    const existing = tagMap.get(key);
    if (existing) {
      existing.seconds += seconds;
    } else {
      tagMap.set(key, {
        tagId: block.tag_id,
        name: block.tag?.name ?? UNLABELLED,
        slot: block.tag?.color ?? null,
        seconds,
        share: 0,
      });
    }

    // Attribute to the day the block started, clipped to the range. A block
    // spanning midnight contributes to each day it touches.
    let cursor = startOfDay(new Date(Math.max(Date.parse(block.started_at), from.getTime())));
    const blockEnd = Math.min(Date.parse(block.ended_at!), to.getTime());

    while (cursor.getTime() < blockEnd) {
      const dayEnd = addDays(cursor, 1);
      const inDay = secondsWithin(
        block,
        new Date(Math.max(cursor.getTime(), from.getTime())),
        new Date(Math.min(dayEnd.getTime(), to.getTime()))
      );

      if (inDay > 0) {
        const dayKey = cursor.getTime();
        let day = dayMap.get(dayKey);
        if (!day) {
          day = { date: new Date(cursor), seconds: 0, segments: [] };
          dayMap.set(dayKey, day);
        }
        day.seconds += inDay;

        const segment = day.segments.find((s) => s.tagId === block.tag_id);
        if (segment) {
          segment.seconds += inDay;
        } else {
          day.segments.push({
            tagId: block.tag_id,
            name: block.tag?.name ?? UNLABELLED,
            slot: block.tag?.color ?? null,
            seconds: inDay,
          });
        }
      }

      cursor = dayEnd;
    }
  }

  const byTag = [...tagMap.values()].sort((a, b) => b.seconds - a.seconds);
  for (const t of byTag) {
    t.share = totalSeconds === 0 ? 0 : t.seconds / totalSeconds;
  }

  // Every day in the range, including empty ones — gaps are the signal in a
  // consistency chart, so they must be drawn rather than skipped.
  const byDay: DayTotal[] = [];
  for (let d = startOfDay(from); d.getTime() < to.getTime(); d = addDays(d, 1)) {
    byDay.push(
      dayMap.get(d.getTime()) ?? { date: new Date(d), seconds: 0, segments: [] }
    );
  }
  for (const day of byDay) {
    day.segments.sort((a, b) => b.seconds - a.seconds);
  }

  return {
    totalSeconds,
    sessionCount,
    longestSeconds,
    averageSeconds: sessionCount === 0 ? 0 : Math.round(totalSeconds / sessionCount),
    byTag,
    byDay,
  };
}
