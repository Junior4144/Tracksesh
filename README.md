# Tracksesh

A focus-session timer. Next.js (App Router) + Supabase Auth, styled with Bootstrap 5.

Previously an Angular 21 SPA talking to a .NET API — see [Migration notes](#migration-notes-angular--nextjs).

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the two values
npm run dev                        # http://localhost:3000
```

The app runs without Supabase configured — the dashboard and timer are public.
Only sign-in/sign-up need the env vars, and they report clearly if they're missing.

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
| `npm test` | Vitest suite |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Layout

```
src/
  app/                   App Router
    layout.tsx           shell: reads the session server-side, mounts providers
    page.tsx             -> /dashboard
    not-found.tsx        -> /dashboard  (was the '**' route)
    dashboard/ login/ register/
  components/
    AuthProvider.tsx     Supabase auth: user, login, register, logout
    ThemeProvider.tsx    dark/light via <html data-theme>, no FOUC
    TimerProvider.tsx    the session timer; above the router so it survives navigation
    Navbar.tsx  icons.tsx
  lib/supabase/          browser / server / proxy clients
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
  public. That's preserved. `proxy.ts` only bounces signed-in users away from
  `/login` and `/register`.
- **`roles` is gone from the user object.** The .NET API returned it; nothing in
  the UI ever read it.
- **Login validation is unchanged** (both fields required). The old template had
  branches for email-format and min-length errors, but those validators were
  never attached, so the branches were dead. Register does validate properly.

Known issue carried over from the Angular version: the timer counts down with
`setInterval` and one decrement per tick, so it runs slow in a backgrounded tab
where browsers throttle timers. Fix is to store a target timestamp and derive
the remaining seconds from `Date.now()`.
