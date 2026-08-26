import { useCallback, useSyncExternalStore } from 'react';

const TICK_MS = 1000;

/**
 * The last reading, shared by every caller. useSyncExternalStore requires a
 * stable snapshot — a raw Date.now() differs between two calls in the same
 * render and spins — so the value is only advanced when something says it moved.
 *
 * Truncating to the second would also be stable, but it moves the reading
 * *backwards* by up to 999ms, and elapsed time is measured against a
 * `started_at` that sits at an arbitrary point inside a second. That lost
 * fraction swallowed the first tick: the timer showed 00:00 twice, then 00:01.
 */
let cachedMs = 0;

function getSnapshot() {
  // Stale means nothing is ticking this cache — an unsubscribed caller, or a
  // subscriber whose timer ran late. Take a reading; it then holds still for a
  // second, which is all the stability the store needs. Compared as a distance
  // so a clock stepped backwards is refreshed too, rather than frozen in the
  // future until real time catches up.
  const now = Date.now();
  if (Math.abs(now - cachedMs) >= TICK_MS) cachedMs = now;
  return cachedMs;
}

/**
 * 0 on the server. Safe because a block is only ever fetched client-side, so
 * both server and first client render show an idle timer and hydration matches.
 */
function getServerSnapshot() {
  return 0;
}

/**
 * The wall clock, as an external store.
 *
 * Reading `Date.now()` during render is impure — the same render would produce
 * different output on a re-render. This is the sanctioned way to read a moving
 * external source: React subscribes, and re-renders only when the second ticks.
 *
 * Pass `active: false` when there is nothing to count (idle or paused) and no
 * timer is created at all — the snapshot is then read on demand.
 */
export function useClock(active: boolean): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};

      const tick = () => {
        cachedMs = Date.now();
        onChange();
      };

      // Subscribing means something just started counting; publish a reading
      // now so the first render of it isn't working from a stale cache.
      tick();

      // A drift-corrected timeout rather than setInterval: a late fire is
      // measured from a fixed epoch, so lateness can't accumulate into a
      // skipped second over a long session.
      const epoch = Date.now();
      let ticks = 0;
      let id = 0;

      const schedule = () => {
        ticks += 1;
        id = window.setTimeout(() => {
          tick();
          schedule();
        }, Math.max(0, epoch + ticks * TICK_MS - Date.now()));
      };
      schedule();

      // Browsers throttle timers in hidden tabs, so the display can be stale by
      // the time the user looks back. Re-read the clock immediately on return.
      const onVisible = () => {
        if (document.visibilityState === 'visible') tick();
      };
      document.addEventListener('visibilitychange', onVisible);

      return () => {
        clearTimeout(id);
        document.removeEventListener('visibilitychange', onVisible);
      };
    },
    [active]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
