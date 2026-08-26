import { createBrowserClient } from '@supabase/ssr';

/**
 * NEXT_PUBLIC_* vars are inlined at build time, so this works in the browser.
 * The app is usable without Supabase (the dashboard is public) — auth just
 * reports that it isn't wired up rather than crashing the render.
 */
export function isSupabaseConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export const NOT_CONFIGURED_MESSAGE =
  'Auth is not configured. Copy .env.local.example to .env.local and add your Supabase URL and publishable key.';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
