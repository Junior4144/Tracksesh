/**
 * Seeds a week of sample blocks onto an account, so the activity view has
 * something to draw. Development aid only — nothing imports it.
 *
 *   node scripts/seed-demo.mjs <email>
 *   node scripts/seed-demo.mjs <email> --clear   # remove them again
 *
 * Connects to Postgres directly.
 *
 * It used to sign in and write through Supabase's Data API. That route is gone:
 * `public` is no longer an exposed schema (see supabase/config.toml), because
 * the .NET API is meant to be the only way into the ledger. Going through the
 * API instead was not an option either — several blocks below are
 * `source: 'timer'` rows carrying `paused_seconds`, a shape only the stopwatch
 * produces and the API deliberately has no endpoint for.
 *
 * What has *not* changed is the guarantee that made the old version worth
 * trusting: these rows are written as the target user, under RLS. The
 * connection drops to the `authenticated` role and sets `request.jwt.claims`
 * inside one transaction, exactly as server/Tracksesh.Api/Data/Db.cs does — so
 * a policy that would reject a row here would reject it from the app too, and
 * every CHECK constraint applies unchanged.
 *
 * Connection string: DATABASE_URL, or the local `supabase start` default.
 */
import pg from 'pg';

const args = process.argv.slice(2);
const clear = args.includes('--clear');
const email = args.find((a) => !a.startsWith('--'));

if (!email) {
  console.error('usage: node scripts/seed-demo.mjs <email> [--clear]');
  process.exit(1);
}

const CONNECTION =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const client = new pg.Client({ connectionString: CONNECTION });
await client.connect();

try {
  const { rows: users } = await client.query('select id from auth.users where email = $1', [email]);
  if (users.length === 0) {
    console.error(`no account for ${email}`);
    process.exit(1);
  }
  const userId = users[0].id;

  await client.query('begin');

  // The impersonation. `true` is set_config's is_local flag, so both settings
  // are scoped to this transaction and cannot outlive it.
  await client.query('select set_config($1, $2, true)', [
    'request.jwt.claims',
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  await client.query('set local role authenticated');

  if (clear) {
    const { rowCount } = await client.query('delete from public.time_blocks');
    await client.query('commit');
    console.log(`removed ${rowCount} blocks`);
    process.exit(0);
  }

  const { rows: tags } = await client.query('select id, name from public.tags');
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

  let inserted = 0;
  for (const [back, h, m, mins, tag, paused, note] of PLAN) {
    const started = at(back, h, m);
    const ended = new Date(started.getTime() + mins * 60_000);

    const { rowCount } = await client.query(
      `insert into public.time_blocks
         (user_id, tag_id, note, started_at, ended_at, paused_seconds, source)
       values ($1, $2, $3, $4, $5, $6, 'timer')`,
      // 'timer', not 'manual': the schema requires manual blocks to have no
      // paused time, and several of these have breaks in them.
      [userId, tag ? byName[tag] : null, note, started, ended, paused]
    );
    inserted += rowCount;
  }

  await client.query('commit');
  console.log(`inserted ${inserted} blocks across 7 days`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('seed failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
