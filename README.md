# Tracksesh

A time ledger: a stopwatch that records **what** you spent time on, so you can
see where your hours went. Next.js (App Router) + Supabase, Bootstrap 5.

Stop the clock and it asks "what did you do?"; you tag the block and it lands in
your day. Time you forgot to track can be backfilled by hand. See
[docs/DOMAIN.md](docs/DOMAIN.md) for the model everything is built to.

Previously an Angular 21 SPA talking to a .NET API — see [Migration notes](#migration-notes-angular--nextjs).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the two values
npm run dev                        # http://localhost:3000
```

Supabase is required now that sessions are persisted: `/dashboard` reads and
writes your blocks, so it redirects to sign-in when there's no user.

### Supabase

Either a hosted project (Project Settings → API Keys) or the local stack:

```bash
supabase start   # prints the API URL and keys
```

Then set in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the **publishable** key (`sb_publishable_…`), not a secret key — legacy
`anon` keys are compatibility-only. Both vars are `NEXT_PUBLIC_*`, so they're
inlined into the browser bundle at **build** time; the Docker build and CI will
need them too, not just runtime. Never put a `sb_secret_…` key behind a
`NEXT_PUBLIC_` name.

**Email confirmation:** on by default. With it on, sign-up doesn't create a
session and the register page tells the user to check their inbox. Turn it off
under Authentication → Providers → Email to get the old
register-then-straight-in flow.

**Demo user:** the login page advertises `demo@tracksesh.com` / `demo1234`.
Create that user in your Supabase project (Authentication → Users → Add user,
with "Auto Confirm" checked) or the demo button will fail.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (emits `.next/standalone` for Docker) |
| `npm start` | Serve the production build |
| `npm test` | Vitest suite (pure logic, jsdom) |
| `npm run e2e` | Playwright layout checks in a real browser |
| `npm run e2e:shots` | Screenshots → `test-results/screens/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

Both test layers exist because they catch different things. Vitest runs on
jsdom, which has **no layout engine and never evaluates a media query** — it
cannot tell you that a grid column collapsed or a panel landed at the bottom of
the page. `npm run e2e` measures real boxes at three viewport widths and asserts
the dashboard's columns actually sit side by side. Both need the dev server;
Playwright starts one itself.

`e2e:shots` captures every page in both themes at all three widths — the fastest
way to see the effect of a style change.

## Layout

```
src/
  app/                   App Router
    layout.tsx           shell: reads the session server-side, mounts providers
    page.tsx             -> /dashboard
    not-found.tsx        -> /dashboard  (was the '**' route)
    dashboard/           the stopwatch
    activity/            charts, day strip, backfill, block editing
    tags/                rename, recolour, archive, delete
    login/ register/
  components/
    AuthProvider.tsx     Supabase auth: user, login, register, logout
    ThemeProvider.tsx    dark/light via <html data-theme>, no FOUC
    TimerProvider.tsx    the session timer; above the router so it survives navigation
    ConfirmDialog.tsx    the gate in front of anything with no undo
    Navbar.tsx  icons.tsx
  lib/supabase/          browser / server / proxy clients
  lib/edits.ts           block + tag validation, mirroring the check constraints
  proxy.ts               refreshes the session, keeps signed-in users off /login
  styles/                global SCSS (carried over from Angular unchanged)
```

## Migration notes (Angular → Next.js)

What moved where:

| Angular | Next.js |
|---|---|
| `app.routes.ts` | file-based routes under `src/app/` |
| `AuthService` (.NET API, cookie session) | `AuthProvider` (Supabase Auth) |
| `ThemeService` | `ThemeProvider` + a pre-paint boot script |
| `TimerService` (root singleton) | `TimerProvider` mounted in the layout |
| Reactive Forms | `react-hook-form`, same validation rules |
| `environment.ts` / `environment.prod.ts` | `NEXT_PUBLIC_*` env vars |
| `bootstrap.bundle.min.js` | dropped — the mobile menu is React state now |
| Component-scoped SCSS | global SCSS in `src/styles/` |

Behaviour changes worth knowing:

- **The 15-minute session cookie and auto-logout timer are gone.** Supabase
  issues a JWT and refreshes it in `proxy.ts` on every request, which is what
  that hand-rolled `tracksesh_session` cookie was approximating.
- **`auth.guard.ts` was never wired into any route** — the dashboard was always
  public, and the migration preserved that. It is no longer true: now that the
  timer writes blocks under a user id, `proxy.ts` requires a user on
  `/dashboard` and redirects to `/login?returnUrl=…` without one.
- **`roles` is gone from the user object.** The .NET API returned it; nothing in
  the UI ever read it.
- **Login validation is unchanged** (both fields required). The old template had
  branches for email-format and min-length errors, but those validators were
  never attached, so the branches were dead. Register does validate properly.

- **The countdown is gone.** The timer counts *up*, open-ended — you don't know
  in advance that you'll read for 36 minutes.

The Angular drift bug (one decrement per `setInterval` tick, so the timer ran
slow in a throttled background tab) is fixed by construction: elapsed time is
derived from the stored `started_at` on every render rather than accumulated,
so a missed tick costs nothing. `src/lib/useClock.ts` subscribes to the clock
via `useSyncExternalStore` and re-reads it on tab focus.

## Data model

Two tables, both RLS-protected per user — see [docs/DOMAIN.md](docs/DOMAIN.md).

| Table | Holds |
|---|---|
| `tags` | Your categories (Reading, Studying, …). Five are seeded on sign-up; managed at `/tags`. |
| `time_blocks` | The ledger. One row per labelled block; `ended_at is null` is the running session. |

Tags are **archived** rather than deleted by default. Archiving hides a tag from
every picker while the blocks that reference it keep its name and colour;
deleting sets `tag_id` to null on all of them, which is not reversible — so the
delete confirmation counts the blocks first (`tag_usage()`).

`tags.color` holds a palette **slot** (`blue`, `orange`, …), not a hex — each
theme resolves its own step via `--series-*` in `globals.scss`, because a colour
readable on the dark card isn't readable on white.

The running stopwatch is a database row, not client state, so a refresh or a
closed laptop can't lose it. A partial unique index enforces at most one running
session per user.

Stopwatch transitions go through `start_session` / `pause_session` /
`resume_session` / `stop_session` RPCs rather than direct writes, so timestamps
come from Postgres (not a skewed browser clock) and pause time accumulates in a
single atomic statement.

Apply migrations in `supabase/migrations/` in filename order — via the Supabase
SQL Editor, or `supabase db push` against a linked project.
