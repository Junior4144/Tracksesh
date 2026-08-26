import { describe, expect, it } from 'vitest';
import {
  blockDuration,
  clockOffset,
  elapsedSeconds,
  formatClock,
  formatDuration,
  formatTotal,
  ringProgress,
} from './time';
import type { TimeBlock } from './types';

const T0 = Date.parse('2026-08-24T09:00:00.000Z');
const at = (offsetSeconds: number) => new Date(T0 + offsetSeconds * 1000).toISOString();

function block(overrides: Partial<TimeBlock> = {}): TimeBlock {
  return {
    id: 1,
    user_id: 'u1',
    tag_id: null,
    note: null,
    started_at: at(0),
    ended_at: null,
    paused_at: null,
    paused_seconds: 0,
    source: 'timer',
    created_at: at(0),
    updated_at: at(0),
    ...overrides,
  };
}

describe('elapsedSeconds', () => {
  it('counts up from started_at while running', () => {
    expect(elapsedSeconds(block(), T0 + 65_000)).toBe(65);
  });

  it('is zero at the moment it starts', () => {
    expect(elapsedSeconds(block(), T0)).toBe(0);
  });

  it('uses ended_at once finished, ignoring the current time', () => {
    const finished = block({ ended_at: at(2160) });
    // A day later, a finished 36-minute block is still 36 minutes.
    expect(elapsedSeconds(finished, T0 + 86_400_000)).toBe(2160);
  });

  it('excludes completed pauses', () => {
    // Ran an hour of wall clock with 10 minutes of break inside it.
    const b = block({ ended_at: at(3600), paused_seconds: 600 });
    expect(elapsedSeconds(b, T0 + 3600_000)).toBe(3000);
  });

  it('freezes while paused, however long the pause runs', () => {
    // Started, worked 10 minutes, paused at that point.
    const paused = block({ paused_at: at(600) });

    expect(elapsedSeconds(paused, T0 + 600_000)).toBe(600);
    expect(elapsedSeconds(paused, T0 + 900_000)).toBe(600);
    expect(elapsedSeconds(paused, T0 + 86_400_000)).toBe(600);
  });

  it('subtracts an open pause on top of earlier ones', () => {
    // 300s of earlier breaks, now paused again at the 20-minute mark.
    const b = block({ paused_seconds: 300, paused_at: at(1200) });
    expect(elapsedSeconds(b, T0 + 1_500_000)).toBe(1200 - 300);
  });

  it('does not drift when the tab was throttled', () => {
    // The whole point of deriving from timestamps: a 90-minute gap between
    // renders still reports 90 minutes, not however many ticks fired.
    expect(elapsedSeconds(block(), T0 + 5_400_000)).toBe(5400);
  });

  it('never returns a negative duration', () => {
    // Clock skew or a stale cached row shouldn't render as "-3s".
    expect(elapsedSeconds(block(), T0 - 3000)).toBe(0);
    expect(elapsedSeconds(block({ paused_seconds: 9999 }), T0 + 60_000)).toBe(0);
  });
});

describe('clockOffset', () => {
  it('is zero when the clocks agree', () => {
    expect(clockOffset(at(0), T0 - 100, T0 + 100)).toBe(0);
  });

  it('measures a local clock running fast as a negative offset', () => {
    // The reported failure: the machine sits 113s ahead of the database.
    const localNow = T0 + 113_000;
    expect(clockOffset(at(0), localNow - 100, localNow + 100)).toBe(-113_000);
  });

  it('corrects the elapsed reading a fast clock would otherwise produce', () => {
    const skewMs = 113_000;
    const localNow = T0 + skewMs;
    const justStarted = block({ started_at: at(0) });

    // Uncorrected, the timer reads 1:53 the instant it starts.
    expect(elapsedSeconds(justStarted, localNow)).toBe(113);

    // Corrected, it reads 00:00 as it should.
    const offset = clockOffset(at(0), localNow - 100, localNow + 100);
    expect(elapsedSeconds(justStarted, localNow + offset)).toBe(0);
  });

  it('still counts up normally once corrected', () => {
    const skewMs = 113_000;
    const startedLocal = T0 + skewMs;
    const offset = clockOffset(at(0), startedLocal - 100, startedLocal + 100);
    const b = block({ started_at: at(0) });

    // 30 real seconds later, by the local clock.
    expect(elapsedSeconds(b, startedLocal + 30_000 + offset)).toBe(30);
  });

  it('handles a local clock running slow', () => {
    const localNow = T0 - 45_000;
    const offset = clockOffset(at(0), localNow - 100, localNow + 100);
    expect(offset).toBe(45_000);
    expect(elapsedSeconds(block({ started_at: at(0) }), localNow + offset)).toBe(0);
  });

  it('splits the round trip, so latency costs at most half of it', () => {
    // 400ms round trip: the server read its clock somewhere inside, and the
    // midpoint is off by at most 200ms.
    const offset = clockOffset(at(0), T0 - 400, T0);
    expect(Math.abs(offset)).toBeLessThanOrEqual(200);
  });
});

describe('blockDuration', () => {
  it('measures a finished block without reading a clock', () => {
    expect(blockDuration(block({ ended_at: at(2160) }))).toBe(2160);
  });

  it('excludes pauses', () => {
    expect(blockDuration(block({ ended_at: at(3600), paused_seconds: 600 }))).toBe(3000);
  });

  it('returns 0 for a still-running block', () => {
    expect(blockDuration(block())).toBe(0);
  });
});

describe('formatDuration', () => {
  it('zero-pads minutes and seconds', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(3)).toBe('00:03');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(2160)).toBe('36:00');
  });

  it('widens past the hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(36_000)).toBe('10:00:00');
  });

  it('clamps negatives to zero', () => {
    expect(formatDuration(-5)).toBe('00:00');
  });
});

describe('formatTotal', () => {
  it('reads as a human summary', () => {
    expect(formatTotal(48)).toBe('48s');
    expect(formatTotal(2160)).toBe('36m');
    expect(formatTotal(3600)).toBe('1h');
    expect(formatTotal(5040)).toBe('1h 24m');
  });

  it('drops the minutes when there are none', () => {
    expect(formatTotal(7200)).toBe('2h');
  });
});

describe('ringProgress', () => {
  it('sweeps once per hour', () => {
    expect(ringProgress(0)).toBe(0);
    expect(ringProgress(1800)).toBe(0.5);
  });

  it('wraps rather than pinning full, so long sessions stay legible', () => {
    expect(ringProgress(3600)).toBe(0);
    expect(ringProgress(5400)).toBe(0.5);
  });
});

describe('formatClock', () => {
  it('renders a 24-hour wall clock', () => {
    expect(formatClock('2026-08-24T14:36:00.000Z')).toMatch(/^\d{2}:\d{2}$/);
  });
});
