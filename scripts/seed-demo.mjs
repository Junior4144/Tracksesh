/**
 * Seeds a week of sample blocks onto an account, so the activity view has
 * something to draw. Development aid only — nothing imports it.
 *
 *   node scripts/seed-demo.mjs <email> <password>
 *   node scripts/seed-demo.mjs <email> <password> --clear   # remove them again
 *
 * Reads NEXT_PUBLIC_SUPABASE_* from the environment, and writes through the
 * normal API as the signed-in user, so RLS and every check constraint apply
 * exactly as they would from the app.
 */
import { readFileSync } from 'node:fs';

const [email, password] = process.argv.slice(2);
const clear = process.argv.includes('--clear');

if (!email || !password) {
  console.error('usage: node scripts/seed-demo.mjs <email> <password> [--clear]');
  process.exit(1);
}

// Minimal .env.local reader — avoids a dependency for a dev script.
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());

if (!auth.access_token) {
  console.error('sign-in failed:', auth.error_description ?? auth.msg ?? auth);
  process.exit(1);
}

const headers = {
  apikey: KEY,
  authorization: `Bearer ${auth.access_token}`,
  'content-type': 'application/json',
};
const userId = JSON.parse(Buffer.from(auth.access_token.split('.')[1], 'base64').toString()).sub;

if (clear) {
  const removed = await fetch(`${URL_}/rest/v1/time_blocks?user_id=eq.${userId}`, {
    method: 'DELETE',
    headers: { ...headers, prefer: 'return=representation' },
  }).then((r) => r.json());
  console.log(`removed ${removed.length} blocks`);
  process.exit(0);
}

const tags = await fetch(`${URL_}/rest/v1/tags?select=id,name`, { headers }).then((r) => r.json());
const byName = Object.fromEntries(tags.map((t) => [t.name, t.id]));

const now = new Date();
const at = (daysBack, h, m) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysBack);
  d.setHours(h, m, 0, 0);
  return d;
};

// [daysBack, hour, minute, minutes, tag, pausedSeconds, note]
const PLAN = [
  [6, 9, 0, 95, 'Work', 600, 'Sprint planning'],
  [6, 14, 30, 36, 'Reading', 0, 'Chapter 3, distributed systems'],
  [5, 8, 15, 45, 'Exercise', 0, 'Morning run'],
  [5, 10, 0, 120, 'Work', 900, null],
  [5, 20, 10, 55, 'Studying', 0, 'Postgres indexing'],
  [4, 11, 30, 40, 'Admin', 0, 'Invoices'],
  [4, 15, 0, 75, 'Studying', 300, null],
  [3, 7, 45, 50, 'Exercise', 0, null],
  [3, 13, 0, 140, 'Work', 1200, 'Refactor auth layer'],
  [2, 9, 30, 65, 'Reading', 0, 'Designing Data-Intensive Applications'],
  [2, 16, 20, 30, 'Admin', 0, null],
  [2, 18, 0, 45, null, 0, null], // unlabelled, on purpose
  [1, 10, 0, 110, 'Work', 600, null],
  [1, 19, 0, 42, 'Reading', 0, 'Before bed'],
  [1, 23, 30, 60, 'Studying', 0, 'Crosses midnight — checks the day split'],
  [0, 8, 30, 35, 'Exercise', 0, null],
  [0, 10, 15, 85, 'Work', 420, 'Ledger schema'],
];

const rows = PLAN.map(([back, h, m, mins, tag, paused, note]) => {
  const started = at(back, h, m);
  return {
    user_id: userId,
    tag_id: tag ? byName[tag] : null,
    note,
    started_at: started.toISOString(),
    ended_at: new Date(started.getTime() + mins * 60_000).toISOString(),
    paused_seconds: paused,
    // 'timer', not 'manual': the schema requires manual blocks to have no
    // paused time, and several of these have breaks in them.
    source: 'timer',
  };
});

const inserted = await fetch(`${URL_}/rest/v1/time_blocks`, {
  method: 'POST',
  headers: { ...headers, prefer: 'return=representation' },
  body: JSON.stringify(rows),
}).then((r) => r.json());

if (!Array.isArray(inserted)) {
  console.error('insert failed:', inserted);
  process.exit(1);
}
console.log(`inserted ${inserted.length} blocks across 7 days`);
