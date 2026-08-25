'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Truncated to the second so repeated reads within one render return an
 * identical value — useSyncExternalStore requires a stable snapshot, and a raw
 * Date.now() would differ between calls and spin.
 */
function getSnapshot() {
  return Math.floor(Date.now() / 1000) * 1000;
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
 * interval is created at all.
 */
export function useClock(active: boolean): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};

      const id = setInterval(onChange, 1000);

      // Browsers throttle timers in hidden tabs, so the display can be stale by
      // the time the user looks back. Re-read the clock immediately on return.
      const onVisible = () => {
        if (document.visibilityState === 'visible') onChange();
      };
      document.addEventListener('visibilitychange', onVisible);

      return () => {
        clearInterval(id);
        document.removeEventListener('visibilitychange', onVisible);
      };
    },
    [active]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
