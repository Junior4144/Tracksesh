/**
 * Creates the demo account if it doesn't already exist. Idempotent.
 *
 *   node scripts/ensure-demo-user.mjs
 *
 * The login page advertises demo@tracksesh.com / demo1234, and both
 * `npm run e2e` and `npm run test:csp` sign in as it — so a fresh database
 * fails those checks for a reason that has nothing to do with the change under
 * test. CI runs this straight after `supabase start`; locally it saves clicking
 * through the Studio UI.
 *
 * Reads VITE_SUPABASE_* from the environment, falling back to .env, falling
 * back to the local stack's fixed defaults.
 */
import { readFileSync } from 'node:fs';

const EMAIL = process.env.E2E_EMAIL ?? 'demo@tracksesh.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'demo1234';

function fromEnvFile(name) {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
    )[name];
  } catch {
    return undefined;
  }
}

const url =
  process.env.VITE_SUPABASE_URL ?? fromEnvFile('VITE_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  fromEnvFile('VITE_SUPABASE_PUBLISHABLE_KEY') ??
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const headers = { apikey: key, 'content-type': 'application/json' };
const body = JSON.stringify({ email: EMAIL, password: PASSWORD });

/*
 * Wrapped, and exiting via `process.exitCode` rather than `process.exit()`.
 *
 * Calling process.exit() straight after a fetch tears the process down while
 * undici still holds an open handle, which on Windows aborts with a libuv
 * assertion instead of exiting — a crash that looks like the script failed when
 * it had already done its job. Setting the code and returning lets Node drain
 * and exit on its own.
 */
async function main() {
  // Sign in first: if the account is already usable, signing up again would
  // just burn a rate-limit slot to be told what we already know.
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers,
    body,
  });

  if (signIn.ok) {
    console.log(`${EMAIL} already exists and can sign in.`);
    return 0;
  }

  const signUp = await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers, body });
  const result = await signUp.json().catch(() => ({}));

  if (signUp.ok) {
    // With email confirmation on, sign-up succeeds but yields no session, and
    // the account cannot be used until someone clicks a link. Worth saying out
    // loud rather than letting the e2e run fail later looking like a UI bug.
    console.log(
      result.access_token
        ? `Created ${EMAIL}.`
        : `Created ${EMAIL}, but it needs email confirmation before it can sign in. ` +
            'Set enable_confirmations = false in supabase/config.toml for test environments.'
    );
    return 0;
  }

  if (result.error_code === 'user_already_exists') {
    console.error(
      `${EMAIL} exists but the password is not "${PASSWORD}" — or it is unconfirmed. ` +
        'Reset it in Studio, or delete the user and re-run.'
    );
    return 1;
  }

  console.error(`Could not create ${EMAIL}:`, result.msg ?? result.error_description ?? result);
  return 1;
}

process.exitCode = await main();
