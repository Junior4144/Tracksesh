/*
 * Writes <html data-theme> before the first frame, so a light-mode user never
 * sees a flash of dark.
 *
 * A separate file rather than an inline <script>, which is what it used to be.
 * Inline scripts require `script-src 'unsafe-inline'`, and that single
 * concession would undo most of what the Content-Security-Policy is for — this
 * app keeps its session token in localStorage, so any script an attacker gets
 * to run is an account takeover. One tiny same-origin request is the cheaper
 * side of that trade.
 *
 * Loaded as a classic, non-deferred script in <head>, so it still blocks
 * parsing and runs before anything paints. Keep the storage key in sync with
 * STORAGE_KEY in src/components/ThemeProvider.tsx.
 */
(function () {
  try {
    document.documentElement.setAttribute(
      'data-theme',
      localStorage.getItem('tracksesh_theme') || 'dark'
    );
  } catch {
    // Private mode, or storage disabled entirely.
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
