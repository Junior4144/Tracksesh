import { describe, expect, it } from 'vitest';
import { EXPORT_VERSION, buildExport, exportFilename } from './export';
import type { Tag, TimeBlockWithTag } from './types';

const T0 = Date.parse('2026-08-24T09:00:00.000Z');
const at = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

const ACCOUNT = { id: 'u1', email: 'demo@tracksesh.com' };

function tag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    user_id: 'u1',
    name: 'Reading',
    color: 'blue',
    is_archived: false,
    created_at: at(0),
    ...overrides,
  };
}

function block(overrides: Partial<TimeBlockWithTag> = {}): TimeBlockWithTag {
  return {
    id: 10,
    user_id: 'u1',
    tag_id: 1,
    tag: { id: 1, name: 'Reading', color: 'blue' },
    note: 'Chapter 3',
    started_at: at(0),
    ended_at: at(3600),
    paused_at: null,
    paused_seconds: 0,
    source: 'timer',
    created_at: at(0),
    updated_at: at(0),
    ...overrides,
  };
}

describe('buildExport', () => {
  it('stamps a version and the export time', () => {
    const out = buildExport(ACCOUNT, [], [], T0);
    expect(out.version).toBe(EXPORT_VERSION);
    expect(out.exported_at).toBe(at(0));
    expect(out.account).toEqual(ACCOUNT);
  });

  it('flattens the tag name onto each block', () => {
    const out = buildExport(ACCOUNT, [tag()], [block()], T0);
    expect(out.blocks[0].tag).toBe('Reading');
  });

  it('keeps unlabelled blocks, with a null tag', () => {
    const out = buildExport(ACCOUNT, [], [block({ tag_id: null, tag: null })], T0);
    expect(out.blocks).toHaveLength(1);
    expect(out.blocks[0].tag).toBeNull();
  });

  it('writes the worked duration, excluding pauses', () => {
    // An hour of wall clock with 10 minutes of break inside it.
    const out = buildExport(ACCOUNT, [], [block({ paused_seconds: 600 })], T0);
    expect(out.blocks[0].duration_seconds).toBe(3000);
  });

  it('leaves a running block without a duration rather than measuring to now', () => {
    const out = buildExport(ACCOUNT, [], [block({ ended_at: null })], T0 + 86_400_000);
    expect(out.blocks[0].duration_seconds).toBeNull();
    expect(out.blocks[0].ended_at).toBeNull();
  });

  it('includes archived tags — they still label history', () => {
    const out = buildExport(ACCOUNT, [tag({ is_archived: true })], [], T0);
    expect(out.tags[0].is_archived).toBe(true);
  });

  it('does not leak the internal user_id onto every row', () => {
    const out = buildExport(ACCOUNT, [tag()], [block()], T0);
    expect(out.tags[0]).not.toHaveProperty('user_id');
    expect(out.blocks[0]).not.toHaveProperty('user_id');
  });
});

describe('exportFilename', () => {
  it('dates the file in local time', () => {
    const local = new Date(2026, 7, 5, 14, 0).getTime();
    expect(exportFilename(local)).toBe('tracksesh-export-2026-08-05.json');
  });

  it('zero-pads, so files sort chronologically by name', () => {
    const local = new Date(2026, 0, 9, 9, 0).getTime();
    expect(exportFilename(local)).toBe('tracksesh-export-2026-01-09.json');
  });

  it('does not roll to the next day for a late-evening export', () => {
    // toISOString would; the point of doing this by hand is that it doesn't.
    const local = new Date(2026, 7, 5, 23, 45).getTime();
    expect(exportFilename(local)).toBe('tracksesh-export-2026-08-05.json');
  });
});
