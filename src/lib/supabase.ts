import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth, and nothing else.
 *
 * Since the migration to the .NET API this client issues no data requests: it
 * signs people in, refreshes their token, and hands that token to
 * src/lib/api.ts, which is what actually talks to the ledger. The tables are no
 * longer reachable from the browser at all.
 *
 * Plain `@supabase/supabase-js`, not `@supabase/ssr` — there is no server half
 * left to share cookies with. The session lives in localStorage, which the API
 * reads via an Authorization header rather than an ambient cookie. The tradeoff
 * that comes with that: a localStorage token is readable by any script that
 * gets to run on the page, where an HttpOnly cookie was not. Nothing here
 * renders untrusted HTML, and that has to stay true.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * VITE_* vars are inlined at build time, so this answers the same in the
 * browser as it did at build. The app reports that auth isn't wired up rather
 * than crashing the render.
 */
export function isSupabaseConfigured() {
  return !!(url && publishableKey);
}

export const NOT_CONFIGURED_MESSAGE =
  'Auth is not configured. Copy .env.example to .env and add your Supabase URL and publishable key.';

/**
 * One client for the whole app.
 *
 * The memoisation matters more than it looks. `@supabase/ssr`'s browser client
 * deduplicated itself internally, so the old code could call `createClient()`
 * in every component and get one instance. Plain supabase-js does not: a second
 * client is a second GoTrue instance on the same storage key, and two of those
 * racing to refresh the same token is how a session gets torn down mid-request.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error(NOT_CONFIGURED_MESSAGE);
  client ??= createClient(url!, publishableKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Emailed links carry a `token_hash` that src/pages/AuthConfirm.tsx
      // redeems explicitly. There is no fragment for this to pick up.
      detectSessionInUrl: false,
    },
  });
  return client;
}
