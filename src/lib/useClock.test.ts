import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClock } from './useClock';
import { elapsedSeconds } from './time';
import type { TimeBlock } from './types';

/**
 * A session that started 800ms into a second — the ordinary case, since nothing
 * aligns a click to a clock boundary.
 */
const STARTED_MS = Date.parse('2026-08-24T09:00:00.800Z');

function block(): TimeBlock {
  return {
    id: 1,
    user_id: 'u1',
    tag_id: null,
    note: null,
    started_at: new Date(STARTED_MS).toISOString(),
    ended_at: null,
    paused_at: null,
    paused_seconds: 0,
    source: 'timer',
    created_at: new Date(STARTED_MS).toISOString(),
    updated_at: new Date(STARTED_MS).toISOString(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useClock', () => {
  it('advances one second per tick, without stalling on the first', async () => {
    vi.useFakeTimers();
    // Subscribed a moment after the block started, as the start round trip does.
    vi.setSystemTime(STARTED_MS + 50);

    const { result } = renderHook(() => useClock(true));
    const reading = () => elapsedSeconds(block(), result.current);

    // The reported bug: a snapshot truncated to the second read 00:00 here on
    // both of the first two ticks, then jumped to 00:01.
    expect(reading()).toBe(0);

    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      seen.push(reading());
    }

    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('reads the clock rather than counting ticks', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_MS + 50);

    const { result } = renderHook(() => useClock(true));
    const reading = () => elapsedSeconds(block(), result.current);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    // A minute of wall clock reads as a minute. Anything that accumulated a
    // second per tick would land wherever the ticks happened to fall.
    expect(reading()).toBe(60);
  });

  it('catches up on tab focus, when the ticks never fired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_MS + 50);

    const { result } = renderHook(() => useClock(true));

    // A hidden tab gets its timers throttled or coalesced away entirely — move
    // the clock without letting any of them run.
    vi.setSystemTime(STARTED_MS + 30_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(elapsedSeconds(block(), result.current)).toBe(30);
  });

  it('stops ticking once inactive', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_MS + 50);

    const { result, rerender } = renderHook(({ active }) => useClock(active), {
      initialProps: { active: true },
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const frozen = result.current;

    rerender({ active: false });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // No subscription means no re-render — the value only moves when something
    // else renders and re-reads the snapshot.
    expect(result.current).toBe(frozen);
  });

  it('reads a fresh time for an unsubscribed caller', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_MS);

    const first = renderHook(() => useClock(false));
    expect(first.result.current).toBe(STARTED_MS);

    // A later mount (e.g. navigating to the activity page) must not be handed a
    // stale cached reading from whenever the clock last ticked.
    vi.setSystemTime(STARTED_MS + 3_600_000);
    const second = renderHook(() => useClock(false));
    expect(second.result.current).toBe(STARTED_MS + 3_600_000);
  });
});
