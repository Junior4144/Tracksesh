# Tracksesh

React (Vite) SPA + ASP.NET Core API + Supabase (Auth and Postgres), Bootstrap 5.
See README.md for setup, the architecture sketch, and the migration notes.

Two processes in development: `npm run api` (:5251) and `npm run dev` (:5173,
proxying `/api` to the first). One process in production — the API serves the
built SPA out of its `wwwroot`.

> A previous version of this file opened with a block written and re-added by
> `next dev`. Next.js is gone, so that block is gone with it; nothing
> regenerates this file any more.

## Authorization

The rule this codebase is built on: **row level security is what isolates users,
not the WHERE clauses in the C#.**

Every database call goes through `Db.RunAsync` in
`server/Tracksesh.Api/Data/Db.cs`, which opens one transaction, sets
`request.jwt.claims` from the verified token, and drops the session role to
`authenticated`. Then the policies in `supabase/migrations/` apply exactly as
they did when the browser talked to PostgREST.

Consequences, in order of how badly they bite:

- **Never take a connection outside `Db.RunAsync`.** The impersonation uses
  `SET LOCAL`, scoped to the transaction. A setting that outlived its
  transaction would be inherited by whichever request picked that pooled
  connection up next, handing it the previous user's identity. It fails
  silently, and it is a cross-account data leak.
- **Never drop `set local role authenticated`.** The connection-string role has
  BYPASSRLS. Without the role switch every policy quietly does nothing and the
  app looks fine.
- **Don't add `where user_id = @me` to "help".** It isn't what enforces
  anything, and a redundant filter reads as though it were — which is how the
  real check goes missing unnoticed later.
- New tables need RLS enabled plus a policy with an ownership predicate, not
  just `TO authenticated`.

`server/Tracksesh.Api.Tests` asserts all of the above against a real database —
`npm run test:api`. It is not a formality: removing `set local role
authenticated` turns 7 of its 8 tests red, which is the only reason the rule
above is enforceable rather than merely written down. If a change makes those
tests inconvenient, the change is what needs rethinking.

## Supabase

Before any Supabase or Postgres work, read the vendored skills:

- `.agents/skills/supabase/SKILL.md` — auth, SSR clients, RLS traps, CLI
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` — schema, indexes, RLS

Pinned to the commits in `skills-lock.json` (source: `supabase/agent-skills`).

Project rules that follow from them:

- Auth is **publishable key only** in the browser
  (`VITE_SUPABASE_PUBLISHABLE_KEY`). Never introduce a `sb_secret_…` key under a
  `VITE_` name — anything `VITE_*` is inlined into the bundle.
- `getUser()` on a server, never `getSession()`. The one deliberate exception is
  `accessToken()` in `src/lib/api.ts`, which is a *client* fetching the token it
  is about to send; the check that matters happens when the API verifies the
  signature. The comment there explains it.
- The API verifies tokens against the JWKS at
  `/auth/v1/.well-known/jwks.json`. Setting `Supabase:JwtSecret` switches it to
  the legacy shared HS256 secret and breaks every current token.
- The schema has one owner: `supabase/migrations/`, applied with the Supabase
  CLI. Do not add EF Core or a second migration system.
- **`public` is not an exposed Data API schema.** Do not add it back to
  `[api] schemas` in `supabase/config.toml`. PostgREST would then be a second
  route into the tables, and the API stops being the place validation and rate
  limiting can live. Anything that needs raw table access is a script, and
  connects to Postgres directly — see `scripts/seed-demo.mjs`.

## Conventions

- The API serializes **snake_case** (`JsonNamingPolicy.SnakeCaseLower`), so JSON
  matches the column names and `src/lib/types.ts`. Keep it that way; it is why
  the front end reads a block the same way it always has.
- `src/lib/blocks.ts` is the only module that knows the API's shape. Components
  call it, never `fetch`.
- Constraint violations are translated to sentences in
  `Data/PostgresExceptionHandler.cs`. Add a case there rather than letting a
  constraint name reach a dialog.
- The Content-Security-Policy forbids inline script. Anything that has to run
  before React does belongs in `public/` as a real file, like
  `public/theme-boot.js` — never an inline `<script>` in `index.html`. Adding a
  third-party origin means updating `connect-src` in
  `server/Tracksesh.Api/Security/SecurityHeaders.cs`.
- `vite dev` does not apply the CSP, so development will never tell you that you
  broke it. Run `npm run test:csp` against a production build instead.
- Before finishing: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run test:api`, and `dotnet build server`.
