<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tracksesh

Next.js App Router + Supabase Auth + Bootstrap 5. See README.md for setup and
the Angular → Next.js migration notes.

## Supabase

Before any Supabase or Postgres work, read the vendored skills:

- `.agents/skills/supabase/SKILL.md` — auth, SSR clients, RLS traps, CLI
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` — schema, indexes, RLS

Pinned to the commits in `skills-lock.json` (source: `supabase/agent-skills`).

Project rules that follow from them:

- Auth is **publishable key only** (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
  Never introduce a `sb_secret_…` key under a `NEXT_PUBLIC_` name.
- Always `getUser()` on the server, never `getSession()` — `getSession()` reads
  the cookie without revalidating it against the auth server.
- There are no tables yet. The first one that lands in `public` needs RLS
  enabled plus a policy with an ownership predicate, not just `TO authenticated`.
- Keep `@supabase/*` versions pinned exactly and commit the lockfile.
