import { describe, expect, it } from 'vitest';
import { combine, dateValue, nextSlot, tagNameError, timeValue, validateBlockRange } from './edits';
import { TAG_SLOTS } from './types';

// Local time throughout: these values feed <input type="date"> and
// <input type="time">, which have no timezone of their own.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

const NOW = local(2026, 8, 25, 18, 0).getTime();

describe('dateValue / timeValue', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(dateValue(local(2026, 8, 5))).toBe('2026-08-05');
  });

  it('formats a time as zero-padded HH:MM', () => {
    expect(timeValue(local(2026, 8, 5, 9, 7))).toBe('09:07');
  });

  it('round-trips through combine', () => {
    const d = local(2026, 8, 5, 14, 36);
    expect(combine(dateValue(d), timeValue(d)).getTime()).toBe(d.getTime());
  });

  it('does not shift the day near midnight, as toISOString would', () => {
    // The bug this guards: 23:30 local can be the next day in UTC.
    const late = local(2026, 8, 5, 23, 30);
    expect(dateValue(late)).toBe('2026-08-05');
  });
});

describe('validateBlockRange', () => {
  const ok = {
    startedAt: local(2026, 8, 25, 14, 0),
    endedAt: local(2026, 8, 25, 14, 36),
    nowMs: NOW,
  };

  it('accepts a past block that ends after it starts', () => {
    expect(validateBlockRange(ok)).toBeNull();
  });

  it('rejects an unparseable date', () => {
    expect(validateBlockRange({ ...ok, startedAt: combine('', '14:00') })).toMatch(/not valid/);
  });

  it('rejects an end before the start', () => {
    expect(
      validateBlockRange({ ...ok, endedAt: local(2026, 8, 25, 13, 0) })
    ).toMatch(/must be after/);
  });

  it('rejects a zero-length block', () => {
    expect(validateBlockRange({ ...ok, endedAt: ok.startedAt })).toMatch(/must be after/);
  });

  it('rejects an end in the future', () => {
    expect(validateBlockRange({ ...ok, endedAt: local(2026, 8, 25, 19, 0) })).toMatch(/future/);
  });

  it('allows a span exactly equal to the recorded pauses', () => {
    // The constraint is paused_seconds <= span, so equality is legal.
    expect(validateBlockRange({ ...ok, pausedSeconds: 36 * 60 })).toBeNull();
  });

  it('rejects a span shorter than the recorded pauses, naming the total', () => {
    // 36 minutes of span can't contain 40 minutes of pause — the database's
    // time_blocks_pause_fits would reject it.
    expect(validateBlockRange({ ...ok, pausedSeconds: 40 * 60 })).toMatch(/40m of pauses/);
  });

  it('ignores pauses for a block with none, the backfill case', () => {
    expect(validateBlockRange({ ...ok, pausedSeconds: 0 })).toBeNull();
  });
});

describe('tagNameError', () => {
  const existing = [
    { id: 1, name: 'Reading' },
    { id: 2, name: 'Work' },
  ];

  it('accepts a fresh name', () => {
    expect(tagNameError('Exercise', existing)).toBeNull();
  });

  it('rejects blank and whitespace-only names', () => {
    expect(tagNameError('', existing)).toMatch(/Give the tag a name/);
    expect(tagNameError('   ', existing)).toMatch(/Give the tag a name/);
  });

  it('rejects names past the 40-character column constraint', () => {
    expect(tagNameError('x'.repeat(41), existing)).toMatch(/40 characters/);
    expect(tagNameError('x'.repeat(40), existing)).toBeNull();
  });

  it('rejects a clash regardless of case, matching the unique index', () => {
    expect(tagNameError('reading', existing)).toMatch(/already have a tag called "Reading"/);
  });

  it('ignores surrounding whitespace when comparing', () => {
    expect(tagNameError('  Work  ', existing)).toMatch(/already have a tag/);
  });

  it('does not treat a tag as a clash with itself when renaming', () => {
    // Recolouring "Reading" without touching its name must not fail.
    expect(tagNameError('Reading', existing, 1)).toBeNull();
    // But taking a name another tag already holds still does.
    expect(tagNameError('Work', existing, 1)).toMatch(/already have a tag/);
  });
});

describe('nextSlot', () => {
  it('hands out slots in the fixed order', () => {
    expect(nextSlot(0)).toBe(TAG_SLOTS[0]);
    expect(nextSlot(3)).toBe(TAG_SLOTS[3]);
  });

  it('wraps rather than generating a ninth hue', () => {
    expect(nextSlot(TAG_SLOTS.length)).toBe(TAG_SLOTS[0]);
    expect(nextSlot(TAG_SLOTS.length + 2)).toBe(TAG_SLOTS[2]);
  });
});
