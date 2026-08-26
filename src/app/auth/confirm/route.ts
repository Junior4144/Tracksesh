import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Where every emailed auth link lands: sign-up confirmation, password
 * recovery, email change.
 *
 * Why this route has to exist at all: `@supabase/ssr` forces the PKCE flow, and
 * PKCE's `?code=` can only be redeemed by the browser that started the flow —
 * open the email on your phone after signing up on a laptop and it fails. So
 * the templates in supabase/templates/ build their own link from
 * `{{ .TokenHash }}` instead of the default `{{ .ConfirmationURL }}`, and this
 * route verifies that hash server-side. Nothing has to be remembered from the
 * originating browser.
 */

/**
 * A redirect with a **relative** Location, resolved by the browser against the
 * origin it actually requested.
 *
 * This is not stylistic. `NextResponse.redirect()` needs an absolute URL, and
 * every absolute origin available on the server is the wrong one: for a request
 * whose Host header is `127.0.0.1:3000`, Next reports *both* `request.url` and
 * `request.nextUrl.href` as `http://localhost:3000/...`. The session cookie
 * below is set host-only for the host that was requested, so redirecting to a
 * different host silently drops it — the token verifies, the redirect fires,
 * and the user still lands on /login as though the link were broken.
 *
 * The same mismatch shows up behind any proxy that fronts the app under another
 * hostname. A relative Location can't get it wrong, so it doesn't try.
 */
function redirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next');

  if (!tokenHash || !type) return redirect('/auth/link-expired');

  // Only same-origin paths, so a crafted `next` can't turn a link we sent into
  // an open redirect to someone else's site.
  const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  // Built before the client, so verifyOtp's session cookies land on the very
  // response that carries the user onward.
  const response = redirect(destination);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  return error ? redirect('/auth/link-expired') : response;
}
