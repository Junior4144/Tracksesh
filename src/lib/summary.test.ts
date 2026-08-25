import { describe, expect, it } from 'vitest';
import { addDays, rangeFor, secondsWithin, startOfDay, startOfWeek, summarise } from './summary';
import type { TimeBlockWithTag } from './types';

/** Local-time helper — the ranges are all local-midnight based. */
function local(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

let nextId = 1;
function block(
  start: Date,
  end: Date,
  tag: { id: number; name: string; color: string } | null = null,
  pausedSeconds = 0
): TimeBlockWithTag {
  return {
    id: nextId++,
    user_id: 'u1',
    tag_id: tag?.id ?? null,
    note: null,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    paused_at: null,
    paused_seconds: pausedSeconds,
    source: 'timer',
    created_at: start.toISOString(),
    updated_at: start.toISOString(),
    tag,
  };
}

const READING = { id: 1, name: 'Reading', color: 'blue' };
const STUDY = { id: 2, name: 'Studying', color: 'orange' };

describe('range helpers', () => {
  it('startOfWeek is Monday-first', () => {
    // 2026-08-24 is a Monday; 2026-08-23 is the Sunday before it.
    expect(startOfWeek(local(2026, 8, 24, 15)).getDate()).toBe(24);
    expect(startOfWeek(local(2026, 8, 23, 15)).getDate()).toBe(17);
    expect(startOfWeek(local(2026, 8, 30, 9)).getDate()).toBe(24);
  });

  it('day range covers exactly one day', () => {
    const { from, to } = rangeFor('day', local(2026, 8, 24, 14));
    expect(from).toEqual(local(2026, 8, 24));
    expect(to).toEqual(local(2026, 8, 25));
  });

  it('month range covers the calendar month', () => {
    const { from, to } = rangeFor('month', local(2026, 8, 24));
    expect(from).toEqual(local(2026, 8, 1));
    expect(to).toEqual(local(2026, 9, 1));
  });
});

describe('secondsWithin', () => {
  const from = local(2026, 8, 24);
  const to = local(2026, 8, 25);

  it('counts a fully contained block whole', () => {
    const b = block(local(2026, 8, 24, 14), local(2026, 8, 24, 14, 36), READING);
    expect(secondsWithin(b, from, to)).toBe(36 * 60);
  });

  it('excludes pauses', () => {
    const b = block(local(2026, 8, 24, 9), local(2026, 8, 24, 10), READING, 600);
    expect(secondsWithin(b, from, to)).toBe(3000);
  });

  it('clips a block that crosses midnight instead of double counting', () => {
    // 23:40 -> 00:20 is 40 minutes: 20 in each day.
    const b = block(local(2026, 8, 24, 23, 40), local(2026, 8, 25, 0, 20), READING);

    expect(secondsWithin(b, from, to)).toBe(20 * 60);
    expect(secondsWithin(b, local(2026, 8, 25), local(2026, 8, 26))).toBe(20 * 60);
  });

  it('ignores a block entirely outside the range', () => {
    const b = block(local(2026, 8, 20, 9), local(2026, 8, 20, 10), READING);
    expect(secondsWithin(b, from, to)).toBe(0);
  });

  it('ignores a running block, which has no duration yet', () => {
    const b = { ...block(local(2026, 8, 24, 9), local(2026, 8, 24, 10)), ended_at: null };
    expect(secondsWithin(b, from, to)).toBe(0);
  });
});

describe('summarise', () => {
  const from = local(2026, 8, 24);
  const to = local(2026, 8, 31);

  it('totals per tag, largest first', () => {
    const blocks = [
      block(local(2026, 8, 24, 9), local(2026, 8, 24, 9, 30), READING),
      block(local(2026, 8, 25, 9), local(2026, 8, 25, 11), STUDY),
      block(local(2026, 8, 26, 9), local(2026, 8, 26, 9, 20), READING),
    ];

    const s = summarise(blocks, from, to);

    expect(s.byTag.map((t) => t.name)).toEqual(['Studying', 'Reading']);
    expect(s.byTag[0].seconds).toBe(7200);
    expect(s.byTag[1].seconds).toBe(50 * 60);
    expect(s.totalSeconds).toBe(7200 + 50 * 60);
  });

  it('shares sum to 1', () => {
    const blocks = [
      block(local(2026, 8, 24, 9), local(2026, 8, 24, 10), READING),
      block(local(2026, 8, 25, 9), local(2026, 8, 25, 10), STUDY),
    ];

    const s = summarise(blocks, from, to);
    expect(s.byTag.reduce((sum, t) => sum + t.share, 0)).toBeCloseTo(1, 10);
    expect(s.byTag[0].share).toBeCloseTo(0.5, 10);
  });

  it('groups untagged blocks as Unlabelled rather than dropping them', () => {
    const s = summarise([block(local(2026, 8, 24, 9), local(2026, 8, 24, 10))], from, to);

    expect(s.byTag).toHaveLength(1);
    expect(s.byTag[0].name).toBe('Unlabelled');
    expect(s.byTag[0].tagId).toBeNull();
    expect(s.byTag[0].seconds).toBe(3600);
  });

  it('emits every day in the range, including empty ones', () => {
    const s = summarise([block(local(2026, 8, 26, 9), local(2026, 8, 26, 10), READING)], from, to);

    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[0].seconds).toBe(0);
    expect(s.byDay[2].seconds).toBe(3600);
    expect(s.byDay[2].date).toEqual(local(2026, 8, 26));
  });

  it('splits a midnight-crossing block across both days without inflating the total', () => {
    const b = block(local(2026, 8, 24, 23, 30), local(2026, 8, 25, 0, 30), READING);
    const s = summarise([b], from, to);

    expect(s.byDay[0].seconds).toBe(30 * 60);
    expect(s.byDay[1].seconds).toBe(30 * 60);
    // The day totals split it, but the range total counts it once.
    expect(s.totalSeconds).toBe(3600);
  });

  it('reports session count, longest and average', () => {
    const blocks = [
      block(local(2026, 8, 24, 9), local(2026, 8, 24, 9, 30), READING),
      block(local(2026, 8, 25, 9), local(2026, 8, 25, 10, 30), STUDY),
    ];

    const s = summarise(blocks, from, to);
    expect(s.sessionCount).toBe(2);
    expect(s.longestSeconds).toBe(90 * 60);
    expect(s.averageSeconds).toBe(60 * 60);
  });

  it('is empty-safe', () => {
    const s = summarise([], from, to);
    expect(s.totalSeconds).toBe(0);
    expect(s.averageSeconds).toBe(0);
    expect(s.byTag).toEqual([]);
    expect(s.byDay).toHaveLength(7);
  });

  it('stacks a day by tag, largest segment first', () => {
    const blocks = [
      block(local(2026, 8, 24, 9), local(2026, 8, 24, 9, 20), READING),
      block(local(2026, 8, 24, 10), local(2026, 8, 24, 11), STUDY),
      block(local(2026, 8, 24, 12), local(2026, 8, 24, 12, 10), READING),
    ];

    const day = summarise(blocks, from, to).byDay[0];

    expect(day.seconds).toBe(30 * 60 + 60 * 60);
    expect(day.segments.map((s) => s.name)).toEqual(['Studying', 'Reading']);
    expect(day.segments[1].seconds).toBe(30 * 60);
  });
});

describe('addDays / startOfDay', () => {
  it('crosses a month boundary', () => {
    expect(addDays(local(2026, 8, 31), 1)).toEqual(local(2026, 9, 1));
  });

  it('zeroes the time', () => {
    expect(startOfDay(local(2026, 8, 24, 23, 59))).toEqual(local(2026, 8, 24));
  });
});
