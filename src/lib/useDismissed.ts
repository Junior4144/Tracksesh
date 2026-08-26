'use client';

import { useCallback, useSyncExternalStore } from 'react';

const PREFIX = 'tracksesh.dismissed.';

/**
 * localStorage isn't observable within a tab — the `storage` event only fires
 * in *other* tabs — so dismissals are broadcast here too. Without this, a panel
 * dismissed in one place wouldn't disappear from another mounted copy.
 */
const listeners = new Set<() => void>();

function broadcast() {
  for (const notify of listeners) notify();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Remembers that the user closed something, keyed by a stable id.
 *
 * Read through useSyncExternalStore rather than an effect: localStorage is
 * external mutable state, and this keeps it hydration-safe without a
 * setState-in-effect.
 *
 * The server snapshot reports *dismissed*, so a returning user never sees a
 * flash of a panel they already closed. The cost is that a first-time visitor
 * gets it one frame late, which is the better trade.
 */
export function useDismissed(id: string): {
  dismissed: boolean;
  dismiss: () => void;
  restore: () => void;
} {
  const key = PREFIX + id;

  const dismissed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key) === '1';
      } catch {
        // Private mode or storage disabled: show the panel rather than crash.
        return false;
      }
    },
    () => true
  );

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Nothing to persist to; the panel still closes for this render.
    }
    broadcast();
  }, [key]);

  const restore = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    broadcast();
  }, [key]);

  return { dismissed, dismiss, restore };
}
