# Tracksesh

A time ledger: a stopwatch that records **what** you spent time on, so you can
see where your hours went. React (Vite) + ASP.NET Core + Supabase, Bootstrap 5.

Stop the clock and it asks "what did you do?"; you tag the block and it lands in
your day. Time you forgot to track can be backfilled by hand. See
[docs/DOMAIN.md](docs/DOMAIN.md) for the model everything is built to, and
[docs/TODO.md](docs/TODO.md) for what is still missing.

Previously an Angular SPA on a .NET API, then Next.js on Supabase, now back to a
.NET API — see [Migration notes](#migration-notes-nextjs--react--net).

## Architecture

```
React SPA (Vite)  ──auth──▶  Supabase Auth        sign in, refresh, reset
      │                                            
      └──data, Bearer JWT──▶  ASP.NET Core  ──▶  Supabase Postgres
```

Three things are worth knowing before reading any code:

**The browser never touches the tables.** It holds a Supabase session and sends
that access token to the API. The API verifies the signature against Supabase's
published signing keys — offline, no round trip — and takes the `sub` claim as
the user id.

**The row level security policies are still what enforce isolation.** They did
not move into C#. Every query runs inside a transaction that adopts the caller's
identity, the same way PostgREST does it: `request.jwt.claims` is set so
`auth.uid()` resolves, and the session role drops to `authenticated` so the
policies apply and the connection loses its BYPASSRLS. See
[server/Tracksesh.Api/Data/Db.cs](server/Tracksesh.Api/Data/Db.cs) — that file
is the security model, and the comment at the top explains why the transaction
scope is not optional.

**The stopwatch stayed in Postgres.** `start_session` / `pause_session` /
`resume_session` / `stop_session` are still database functions, so timestamps
come from `clock_timestamp()` rather than a browser clock or an app server's,
and the partial unique index is still what guarantees one running session per
user.

## Getting started

You need Node, the [.NET 10 SDK](https://dotnet.microsoft.com/download), and the
Supabase CLI (or a hosted project).

```bash
npm install
cp .env.example .env            # then fill in the two values
supabase start                  # prints the API URL and keys

npm run api                     # terminal 1 — http://localhost:5251
npm run dev                     # terminal 2 — http://localhost:5173
```

Open http://localhost:5173. The dev server proxies `/api` to the API process, so
the browser sees a single origin and CORS never comes into it — the same shape
as production, where one process serves both.

### Configuring the browser half

`.env`, read at build time and inlined into the bundle:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the **publishable** key (`sb_publishable_…`), not a secret key — legacy
`anon` keys are compatibility-only. Anything `VITE_*` ends up in the browser
bundle, so never put a `sb_secret_…` key behind that prefix.

### Configuring the API half

[server/Tracksesh.Api/appsettings.Development.json](server/Tracksesh.Api/appsettings.Development.json)
already points at the local `supabase start` stack, using that stack's published
defaults. For anything else, use user-secrets or environment variables:

```bash
cd server/Tracksesh.Api
dotnet user-secrets set "ConnectionStrings:Postgres" "Host=...;Database=postgres;Username=...;Password=..."
dotnet user-secrets set "Supabase:Url" "https://<project-ref>.supabase.co"
dotnet user-secrets set "Supabase:PublishableKey" "sb_publishable_..."
```

**Do not set `Supabase:JwtSecret`** unless you know your project still signs
with the legacy shared HS256 secret. Current stacks — local included — sign with
rotating ES256 keys published at `/auth/v1/.well-known/jwks.json`, and setting
the secret switches verification to HS256, at which point every real token fails
as a bad signature.

The connection-string role needs to be able to `SET ROLE authenticated`. The
`postgres` superuser can; so can `authenticator`, which is the better choice
because it never had BYPASSRLS to lose in the first place.

### Supabase

**Email confirmation** is on by default on a hosted project and off in
`supabase/config.toml`, so the local stack and `npm run e2e` don't need an inbox.
With it on, sign-up doesn't create a session and the register page says to check
the inbox.

**Emailed links go through `/auth/confirm`**, now a client-side route. Both
templates in `supabase/templates/` build their own link from `{{ .TokenHash }}`
rather than the default `{{ .ConfirmationURL }}`, and the page redeems that hash
with `verifyOtp`. A token hash isn't bound to the browser that started the flow,
so opening the email on a different device works. The templates did not change
in the migration off Next.js — only what redeems them did.

Every link is built from `site_url`, so **set it to your deployed origin before
shipping**, and mirror it in the hosted project's Auth → URL Configuration (or
`supabase config push`).

**Testing auth locally:** nothing leaves the machine. Mail lands in Mailpit at
http://127.0.0.1:54324. Flipping `enable_confirmations` needs
`supabase stop && supabase start`.

**Demo user:** the login page advertises `demo@tracksesh.com` / `demo1234`.
Create that user (Authentication → Users → Add user, "Auto Confirm" checked) or
the demo button will fail.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, proxying `/api` to the API |
| `npm run api` | The ASP.NET API on :5251 |
| `npm run build` | Typechecks, then builds the SPA into the API's `wwwroot` |
| `npm run preview` | Serve the production build with Vite |
| `npm test` | Vitest suite (pure logic, jsdom) |
| `npm run e2e` | Playwright layout checks in a real browser |
| `npm run e2e:shots` | Screenshots → `test-results/screens/` |
| `npm run test:api` | RLS isolation tests against a real Postgres |
| `npm run test:csp` | Drives a production build, fails on any CSP violation |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `dotnet build server` | Build the API |

Both test layers exist because they catch different things. Vitest runs on
jsdom, which has **no layout engine and never evaluates a media query** — it
cannot tell you that a grid column collapsed or a panel landed at the bottom of
the page. `npm run e2e` measures real boxes at three viewport widths. Playwright
starts *both* servers itself, in order, because a run with only the SPA up would
render every page with its data requests failing and report that as a layout
problem.

`e2e:shots` captures every page in both themes at all three widths — the fastest
way to see the effect of a style change.

`test:api` needs the database up (`supabase start`) and creates two throwaway
users, cleaning up after itself. It builds into `obj/test-bin/` rather than the
usual output so it runs while `npm run api` holds the normal one — a security
test you have to stop your dev server to run is a security test nobody runs.

`test:csp` needs a production build and the API serving it (`npm run build`,
then `npm run api`), because the Content-Security-Policy is set by the API and
`vite dev` never applies it.

## Deploying

One process. `npm run build` writes the SPA into the API's `wwwroot`, and
`dotnet publish` picks it up from there:

```bash
npm run build
dotnet publish server/Tracksesh.Api -c Release
```

The API serves the static files and falls back to `index.html` so client-side
routes survive a cold load, while an unmatched `/api/*` path still returns a 404
rather than a page of HTML.

## Layout

```
index.html               the SPA shell — also the only HTML a crawler sees
src/
  main.tsx               mounts <App>, imports Bootstrap + the SCSS
  App.tsx                providers and the route table
  routes/guards.tsx      AuthOnly / GuestOnly — what proxy.ts used to do
  pages/                 one file per route
    DashboardPage        the stopwatch
    ActivityPage         charts, day strip, backfill, block editing
    TagsPage             rename, recolour, archive, delete
    AccountPage          change password, export, delete account
    UpdatePasswordPage   where a recovery link lands
    AuthConfirmPage      redeems emailed token hashes
    LinkExpiredPage      where a dead link lands
    LoginPage RegisterPage ForgotPasswordPage
  components/
    AuthProvider.tsx     Supabase auth: session, password reset, deletion
    ThemeProvider.tsx    dark/light via <html data-theme>
    TimerProvider.tsx    the session timer; above the routes so it survives navigation
    ConfirmDialog.tsx    the gate in front of anything with no undo
    PasswordInput.tsx    password field with a show/hide toggle
    Navbar.tsx  icons.tsx
  lib/supabase.ts        the auth client, and only the auth client
  lib/api.ts             fetch + bearer token + error translation
  lib/blocks.ts          the ledger, one function per endpoint
  lib/edits.ts           block + tag validation, mirroring the check constraints
  lib/export.ts          the account export payload
  styles/                global SCSS (carried over from Angular unchanged)

server/Tracksesh.Api/
  Program.cs             wiring: snake_case JSON, auth, endpoints, SPA hosting
  Auth/SupabaseAuth.cs   JWT verification against Supabase's JWKS
  Data/Db.cs             the RLS impersonation layer — read this one first
  Data/BlockRow.cs       the block/tag join, flat, plus the shared column lists
  Data/PostgresExceptionHandler.cs   constraint names -> sentences
  Endpoints/             tags, blocks, session, account
```

## Migration notes (Next.js → React + .NET)

What moved where:

| Next.js | Now |
|---|---|
| File-based routes under `src/app/` | `react-router` route table in `App.tsx` |
| `proxy.ts` middleware guards | `routes/guards.tsx`, client-side |
| `app/auth/confirm/route.ts` | `pages/AuthConfirmPage.tsx`, client-side |
| `layout.tsx` server session read | nothing — `ready` gates the first paint |
| `@supabase/ssr` cookie clients | one `@supabase/supabase-js` client, localStorage |
| PostgREST calls from `lib/blocks.ts` | `fetch` to the .NET API, same signatures |
| `NEXT_PUBLIC_*` | `VITE_*` |
| `next dev` / `next build` | `vite` / `tsc && vite build` |
| `eslint-config-next` | flat config with `typescript-eslint` + `react-hooks` |

Things worth knowing:

- **The API serializes snake_case on purpose.** `JsonNamingPolicy.SnakeCaseLower`
  means `src/lib/types.ts` and every component that reads `started_at` or
  `paused_seconds` are byte-identical to what they were on Supabase. The
  front-end data diff is essentially two files.
- **`fetchServerNow` no longer needs a workaround.** Its old comment explained
  that the HTTP `Date` header isn't CORS-safelisted and the project couldn't
  expose it. That's no longer true — but `/api/time` returns Postgres's
  `clock_timestamp()`, which is the clock that stamped every block, and the web
  server's clock isn't.
- **Account deletion now verifies the password server-side.** It used to
  re-sign-in from the browser, because a publishable-key-only client had no
  other way to check a password. A check the client performs is a check the
  client can skip, and the endpoint is reachable with any valid token.
- **The session moved from an HttpOnly cookie to localStorage.** That is what a
  bearer-token API requires, and it does mean the token is readable by any
  script that runs on the page. Nothing here renders untrusted HTML; keep it
  that way.
- **SEO is unchanged in practice, and hydration was never going to help it.**
  Crawlers that don't execute JavaScript — every link-preview scraper — see only
  `index.html`, which carries the title and Open Graph tags. Every real route is
  behind a sign-in and must not be indexed anyway.

## Security

The properties this app depends on, and where each is actually enforced.

**Isolation is row level security.** Not the WHERE clauses in the C# — there
mostly aren't any. `Db.RunAsync` opens a transaction, sets `request.jwt.claims`
and drops the session role to `authenticated`, and the policies do the rest.
Both settings are `SET LOCAL`, so they die with the transaction; Npgsql pools
connections, and a setting that outlived its transaction would hand the next
request the previous user's identity.

That guarantee is a test, not a comment. `npm run test:api` creates two real
users and asserts that neither can read, update, delete or plant a row on the
other, that the role really was dropped, that nothing survives the transaction,
and that none of it breaks under concurrency. Deleting the single line
`set local role authenticated` turns 7 of those 8 red — verified, because a
guard that passes either way is not a guard.

**The API is the only door.** `public` is not an exposed schema (see
`supabase/config.toml`), so PostgREST answers 404 for the tables even with a
valid user token. Before that it was a second, equal route into the data — the
same RLS applied, so nothing leaked, but the API could not be the place request
validation or rate limiting lives while it could be skipped entirely.

**The session lives in localStorage**, which a bearer-token API requires and
which means any script that runs on the page can read it. The compensating
control is the Content-Security-Policy: `script-src 'self'`, no `unsafe-inline`
— which is why the theme boot script is `public/theme-boot.js` and not an inline
`<script>`. `style-src` does allow inline, because React writes a `style`
attribute for every tag colour; injected CSS is bounded, injected script is the
whole account.

The CSP is set by the API, and `vite dev` serves the SPA itself — so **the
policy is invisible during development**. `npm run test:csp` drives a real
production build through a browser and fails on any violation. Run it after
touching `index.html`, adding a third-party origin, or changing how anything is
styled.

**`Referrer-Policy: no-referrer`** is load-bearing, not boilerplate. Emailed
links land on `/auth/confirm?token_hash=…`, and that token is a single-use
credential sitting in a URL — without the header it travels in the `Referer` of
any cross-origin request the page makes.

### Transport security

Behind a proxy that terminates TLS, every request reaches this process over
plain HTTP. ASP.NET decides on that basis whether a response is secure, and the
consequence is the one that matters: **HSTS is never sent at all.** It is not a
subtle degradation — the header is simply absent, and nothing warns you.

`Security:TrustProxyHeaders=true` makes `X-Forwarded-Proto` authoritative and
fixes it. Measured, on this build:

| Config | `X-Forwarded-Proto: https` | `Strict-Transport-Security` |
|---|---|---|
| default | sent | *absent* |
| `TrustProxyHeaders=true` | sent | `max-age=…` |

It is off by default because trusting that header with no proxy in front lets
any client assert its plain-HTTP request was secure.

Set it as an environment variable — `__` is how .NET spells `:` in one:

```bash
Security__TrustProxyHeaders=true
```

Turning it on also disables `UseHttpsRedirection`, deliberately: redirection
belongs to whichever layer terminates TLS, and doing it here too is redundant at
best and a loop at worst. Exposed directly instead — the app holding its own
certificate — leave the flag off and redirection works, finding the port from
the `https://` URL it listens on.

`Security:HstsDays` defaults to 30. A browser that sees the header refuses plain
HTTP for that long and there is no way to call it back, so a domain that loses
its certificate is unreachable until it expires. Raise it to 365 once TLS has
been boring for a while; that is also what the preload list requires.

**Rate limits** are partitioned by user id, not IP: 240 requests/minute
generally, and 5 per 15 minutes on account deletion, which is the one endpoint
that checks a password and could therefore be used to guess one.

**Passwords are Supabase Auth's business.** This service never sees a hash. The
one operation that must check a password — deleting an account — asks GoTrue and
distinguishes *wrong* from *couldn't ask*, so an outage neither deletes an
account nor tells someone their own password is bad.

### Still open

- **No error boundary.** An unhandled render error unmounts the app and leaves a
  blank page. Availability, not security, but it is the most visible remaining
  rough edge.
- **`Security:TrustProxyHeaders` must be turned on** if you deploy behind a
  TLS-terminating proxy — see [Transport security](#transport-security).
- **No Dockerfile or CI**, so none of the above runs anywhere but a laptop.

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

Apply migrations in `supabase/migrations/` in filename order — via the Supabase
SQL Editor, or `supabase db push` against a linked project. The API has no
migration system of its own, deliberately: the schema has one owner.
