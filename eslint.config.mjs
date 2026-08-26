import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Replaces eslint-config-next, which went with Next. The rules that mattered
// day to day here were the react-hooks ones; those are the same plugin Next
// bundled, configured directly.
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright/**',
      // The .NET project, and the SPA bundle Vite writes into its wwwroot.
      'server/**',
      // Scratch the Supabase CLI regenerates on every `supabase start`.
      'supabase/.temp/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `.configs.flat.*`, not `.configs.*` — the top-level ones are still the
  // eslintrc shape, whose `plugins` is an array of strings, and flat config
  // rejects that outright rather than adapting.
  reactHooks.configs.flat['recommended-latest'],
  reactRefresh.configs.vite,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Each provider exports its component and the hook that reads its
      // context. Splitting them to satisfy a dev-only fast-refresh rule would
      // put a one-line file next to every provider and buy nothing; naming the
      // hooks is narrower than switching the rule off.
      'react-refresh/only-export-components': [
        'error',
        { allowExportNames: ['useAuth', 'useTheme', 'useTimer'] },
      ],
    },
  },

  {
    // Ships to the browser but isn't part of the bundle — Vite copies public/
    // through untouched, so nothing here is transpiled or type-checked either.
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },

  {
    files: ['vite.config.ts', 'vitest.config.mts', 'e2e/**', 'playwright.config.ts', 'scripts/**'],
    languageOptions: {
      // Both, and not out of laziness: these files run in Node, but the bodies
      // of `page.evaluate()` callbacks are serialised and executed inside the
      // browser, where `document` and `getComputedStyle` are exactly right.
      globals: { ...globals.node, ...globals.browser },
    },
  }
);
