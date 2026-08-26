# Tracksesh — what's left

The v1 build order in [DOMAIN.md](DOMAIN.md) is finished: schema, data layer,
DB-backed stopwatch, activity view, charts, tag management, block editing. This
is the list of everything found after that, ordered by what actually blocks a
real user or a real deployment.

Each item says what's wrong, the evidence it's wrong, and what "done" looks
like, so none of them needs re-diagnosing before it's picked up.

Status legend: **P0** blocks a deployment or locks a user out · **P1** a bug a
user will hit · **P2** missing surface · **P3** promised but unbuilt.

---

## ~~P0 · Account recovery, and confirmation links that don't land~~ ✓

Built. `/forgot-password` → emailed link → `/auth/confirm` (verifies the token
hash server-side) → `/account/update-password`. Sign-up confirmation goes
through the same route with `type=email`.

Not `?code=` and `exchangeCodeForSession`, which is the OAuth-callback shape:
the templates in `supabase/templates/` build their own link from
`{{ .TokenHash }}` and the route calls `verifyOtp`. That also disposed of the
cross-device caveat this item used to carry — no code verifier is involved, so
opening the email on a different device works.

Verified against the local stack end to end, with confirmations both off and on,
reading real mail out of Mailpit.

**Left over from it — do before deploying:** `site_url` and
`additional_redirect_urls` in [`config.toml`](../supabase/config.toml) still
point at localhost. They need the deployed origin, and the hosted project needs
`supabase config push` (templates and URLs) plus `supabase db push` (the
`account_deletion` migration). Every emailed link is built from `site_url`, so
until that's right the flow works locally and nowhere else.

---

## P0 · No container image, no CI

**Evidence.** [`next.config.ts`](../next.config.ts) sets `output: 'standalone'`
with a comment saying "this is what the Dockerfile will copy", and
[README.md](../README.md) repeats it — but there is no `Dockerfile`, no
`.github/`, and no platform config of any kind. The commit named "adds
deployment settings" predates the Next.js migration and only touched Angular
files. Nothing runs `lint` / `typecheck` / `test` / `e2e` except a human, on
one machine.

**The work.** A multi-stage Dockerfile copying `.next/standalone`, and a
workflow running the four checks on push. Both `NEXT_PUBLIC_*` vars are inlined
at **build** time, so the image build and CI both need them — not just runtime.
That is the part most likely to be got wrong.

**Done when:** `docker build` produces a running image, and a pushed branch
shows four green checks.

---

## P0 · The hosted project is a migration behind

`20260826011518_tag_usage.sql` is applied locally and verified, but not pushed.
`/tags` will fail to load its usage counts against the hosted database until
`supabase db push` runs.

**Done when:** `supabase migration list --linked` shows local and remote level.

---

## P1 · Starting the timer in a second tab shows a Postgres constraint name

**Evidence.** Calling the RPC twice as a signed-in user:

```
POST /rest/v1/rpc/start_session
{"code":"23505","message":"duplicate key value violates unique constraint \"time_blocks_one_running_idx\""}
```

[`TimerProvider.tsx`](../src/components/TimerProvider.tsx) puts `e.message`
straight on screen (`run()`, in the catch), so that string is what the user
reads.

The constraint is doing exactly its job — "at most one running session per
user" is enforced in the database on purpose, and should stay that way. Only
the response to it is wrong.

**The work.** Make `start_session` idempotent: return the already-running block
instead of raising, so a second tab silently adopts the live session rather
than erroring. That is a better outcome than a friendlier error message,
because the user's intent ("track this") is already satisfied.

**Done when:** pressing Start in a second tab shows the session already
running, with its correct elapsed time.

---

## P1 · The running timer doesn't sync across tabs or devices

**The problem.** The live block is fetched once on mount and never again, so a
session started on a phone leaves a laptop showing `idle` until reload — and
pressing Stop on the stale tab acts on a session it isn't displaying.

**Why it matters.** [DOMAIN.md](DOMAIN.md) sells "closing the laptop,
refreshing, or switching devices must not lose a session". That is true of the
*data* — it's a database row — but not yet of the UI.

**The work.** A Supabase Realtime subscription on the user's `time_blocks` rows
feeding `TimerProvider`, or at minimum a refetch on tab focus (`useClock`
already re-reads on focus, so the hook for it exists).

**Done when:** starting a session in one tab updates a second tab without a
reload.

---

## P2 · No error boundary

There is no `app/error.tsx` or `global-error.tsx`, so an unhandled render error
anywhere gives the stock Next.js error page. There *is* a
[`not-found.tsx`](../src/app/not-found.tsx), so the 404 path is covered and this
is the remaining hole.

**Done when:** a thrown error in a page renders an in-app screen with a way back
to `/dashboard`.

---

## ~~P2 · No account settings~~ ✓

Built, at `/account`: change password, export everything as JSON, delete the
account. Deletion runs through a `SECURITY DEFINER` RPC because removing an
`auth.users` row needs privileges the browser will never hold and this project
has no secret key; `tags` and `time_blocks` cascade from there.

Two things worth remembering about it, both learned the hard way:

- **Supabase does not reliably enforce `current_password`.** With
  `secure_password_change` on, GoTrue's gate is session *recency* — a session
  minted minutes ago passes, and a deliberately wrong `current_password` still
  went through against this stack. `AuthProvider` therefore signs in with the
  supplied password before changing anything. Same for delete.
- **Deleting a user does not invalidate tokens already issued**, so the client
  signs out immediately afterwards.

---

## P3 · Drag-to-backfill on the day strip

[DOMAIN.md](DOMAIN.md) describes the day strip as where you "drag out a missed
block to backfill it". [`DayStrip.tsx`](../src/components/activity/DayStrip.tsx)
is read-only apart from opening a block for editing; backfill only exists as the
separate [`AddBlockForm`](../src/components/activity/AddBlockForm.tsx).

---

## P3 · Overnight backfill

`AddBlockForm` takes a single date plus two times, so a block crossing midnight
can only be *authored* by the stopwatch — even though the schema allows it, the
seed data contains one, and the day strip draws it on both days.
[`EditBlockDialog`](../src/components/activity/EditBlockDialog.tsx) gives start
and end their own dates and can move a block across a boundary after the fact;
the add form should do the same.

---

## Smaller things

- **`.env.local` parser disagreement.** [`scripts/seed-demo.mjs`](../scripts/seed-demo.mjs)
  builds its env with `Object.fromEntries`, so a duplicated key takes the
  **last** value; Next's dotenv keeps the **first**. Today only one
  `NEXT_PUBLIC_SUPABASE_URL` is uncommented so they agree, but uncommenting both
  would silently point the seed script and the app at different databases.
- **`20260826002820_noop_placeholder.sql`** is an intentionally empty migration
  — an unnamed `supabase migration new` scaffold that reached both databases
  before anyone noticed. Kept because deleting it would leave both with a
  history entry that has no file. Nothing to do; documented so it isn't
  "fixed" later.
- **e2e covers layout only.** [`dashboard.spec.ts`](../e2e/dashboard.spec.ts)
  measures real boxes; nothing exercises the data layer in a browser on an
  ongoing basis. The tag, block-editing, recovery and account flows were each
  verified that way once, with throwaway specs that weren't kept. This is now
  the largest untested surface in the project — the auth flows in particular are
  the kind that break silently and are only noticed by a locked-out user. Worth
  deciding whether functional e2e becomes a permanent layer.
- **`allowedDevOrigins`** is set in [`next.config.ts`](../next.config.ts) so the
  dev server serves assets to `127.0.0.1` as well as `localhost`. Without it a
  page opened on the "wrong" localhost alias returns 403 for every script and
  silently never hydrates — which turns any form into a native GET submit. That
  is how a password once ended up in a URL bar during testing.
