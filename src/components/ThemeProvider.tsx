import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'tracksesh_theme';

/*
 * The script that writes <html data-theme> before first paint lives in
 * index.html, inline and blocking. It used to be this string, injected into the
 * server-rendered document; with no server render, a module import is already
 * too late — it runs after the first frame, which is the frame that would be
 * wrong. Keep the storage key below in sync with the copy there.
 */

// ── External store ───────────────────────────────────────────────────────────
// <html data-theme> is the source of truth: the boot script above has already
// written it before React hydrates. Reading it through useSyncExternalStore
// (rather than syncing it into state from an effect) means no cascading
// render and no hydration mismatch.

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next: Theme = e.newValue === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function getServerSnapshot(): Theme {
  return 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private mode / storage disabled — the theme still applies for this page.
  }
  emit();
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    applyTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(
    () => ({ theme, isDark: theme === 'dark', toggle }),
    [theme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
