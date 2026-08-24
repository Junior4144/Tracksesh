import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerProvider, useTimer } from './TimerProvider';

function setup() {
  return renderHook(() => useTimer(), { wrapper: TimerProvider });
}

/** Advance fake timers by `seconds`, flushing React updates. */
async function tick(seconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe('TimerProvider', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts idle at the 50-minute default', () => {
    const { result } = setup();

    expect(result.current.state).toBe('idle');
    expect(result.current.durationMinutes).toBe(50);
    expect(result.current.secondsLeft).toBe(3000);
    expect(result.current.displayTime).toBe('50:00');
    expect(result.current.progress).toBe(0);
  });

  it('counts down once started', async () => {
    const { result } = setup();

    act(() => result.current.start());
    expect(result.current.state).toBe('running');

    await tick(65);

    expect(result.current.secondsLeft).toBe(3000 - 65);
    expect(result.current.displayTime).toBe('48:55');
  });

  it('zero-pads the display', async () => {
    const { result } = setup();

    act(() => result.current.setDuration(5));
    act(() => result.current.start());
    await tick(4 * 60 + 57);

    expect(result.current.displayTime).toBe('00:03');
  });

  it('holds the clock while paused and resumes from the same point', async () => {
    const { result } = setup();

    act(() => result.current.start());
    await tick(10);
    act(() => result.current.pause());

    expect(result.current.state).toBe('paused');
    const atPause = result.current.secondsLeft;

    await tick(30);
    expect(result.current.secondsLeft).toBe(atPause);

    act(() => result.current.start());
    await tick(5);
    expect(result.current.secondsLeft).toBe(atPause - 5);
  });

  it('finishes at zero and stops ticking', async () => {
    const { result } = setup();

    act(() => result.current.setDuration(1));
    act(() => result.current.start());
    await tick(60);

    expect(result.current.state).toBe('done');
    expect(result.current.secondsLeft).toBe(0);
    expect(result.current.displayTime).toBe('00:00');
    expect(result.current.progress).toBe(1);

    // No further ticks once done.
    await tick(30);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('ignores start() once the session is done', async () => {
    const { result } = setup();

    act(() => result.current.setDuration(1));
    act(() => result.current.start());
    await tick(60);

    act(() => result.current.start());
    expect(result.current.state).toBe('done');
  });

  it('reset returns to the full configured duration', async () => {
    const { result } = setup();

    act(() => result.current.setDuration(25));
    act(() => result.current.start());
    await tick(90);
    act(() => result.current.reset());

    expect(result.current.state).toBe('idle');
    expect(result.current.secondsLeft).toBe(25 * 60);
    expect(result.current.displayTime).toBe('25:00');
  });

  it('clamps the duration to 1..180 minutes', () => {
    const { result } = setup();

    act(() => result.current.setDuration(0));
    expect(result.current.durationMinutes).toBe(1);

    act(() => result.current.setDuration(500));
    expect(result.current.durationMinutes).toBe(180);
  });

  it('setDuration cancels a running session', async () => {
    const { result } = setup();

    act(() => result.current.start());
    await tick(10);
    act(() => result.current.setDuration(30));

    expect(result.current.state).toBe('idle');
    expect(result.current.secondsLeft).toBe(30 * 60);

    await tick(10);
    expect(result.current.secondsLeft).toBe(30 * 60);
  });

  it('reports progress as the elapsed fraction', async () => {
    const { result } = setup();

    act(() => result.current.setDuration(10));
    act(() => result.current.start());
    await tick(150);

    expect(result.current.progress).toBeCloseTo(0.25, 5);
  });

  it('a second start() does not double the tick rate', async () => {
    const { result } = setup();

    act(() => result.current.start());
    act(() => result.current.start());
    await tick(10);

    expect(result.current.secondsLeft).toBe(3000 - 10);
  });
});
