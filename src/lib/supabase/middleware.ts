import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Routes a signed-in user should never see.
 *
 * `/forgot-password` belongs here but `/account/update-password` emphatically
 * does not: by the time someone reaches that page, /auth/confirm has already
 * turned their emailed token into a session, so they *are* signed in. Matching
 * is `startsWith`, which is why the recovery page lives under /account rather
 * than somewhere like /login/reset — the latter would bounce every user who
 * followed a reset link straight to the dashboard, without resetting anything.
 */
const GUEST_ONLY = ['/login', '/register', '/forgot-password'];

/**
 * Routes that read or write the ledger, so they need a user.
 *
 * The dashboard used to be public — the Angular auth.guard was never wired to a
 * route, and the migration preserved that. Now that the timer persists blocks
 * under a user id, anonymous access has nothing to show and nowhere to write.
 */
const AUTH_ONLY = ['/dashboard', '/activity', '/tags', '/account'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    // Not configured yet — let the request through instead of 500-ing every
    // route. Copy .env.local.example to .env.local to enable auth.
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Must run before any redirect: this is what refreshes an expired access
  // token and writes the new cookies onto `response`.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // These have to be absolute. src/app/auth/confirm/route.ts uses a relative
  // Location to stay on whichever host the request arrived at — Next reports
  // `request.url` and `request.nextUrl` as the origin it serves rather than the
  // one that was asked for — but that trick is unavailable here: Next's
  // middleware adapter parses the Location header into a NextURL, and a
  // relative one throws `TypeError: Invalid URL` before the response is sent.
  //
  // So these redirects land on nextUrl's origin. Harmless where the app has one
  // canonical hostname, which is the deployed case; locally it means a redirect
  // from 127.0.0.1 arrives at localhost.
  if (user && GUEST_ONLY.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (!user && AUTH_ONLY.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?returnUrl=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return response;
}
