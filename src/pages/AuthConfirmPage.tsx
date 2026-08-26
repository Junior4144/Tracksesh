import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { BrandMark } from '@/components/icons';

/**
 * Where every emailed auth link lands: sign-up confirmation, password recovery,
 * email change.
 *
 * This used to be a server route, and it existed because `@supabase/ssr` forces
 * the PKCE flow — PKCE's `?code=` can only be redeemed by the browser that
 * started the flow, so opening the email on a phone after signing up on a
 * laptop failed. The templates in supabase/templates/ work around that by
 * building their own link from `{{ .TokenHash }}` rather than the default
 * `{{ .ConfirmationURL }}`, and something has to verify that hash.
 *
 * Doing it here, in the browser, is what dropping the server made possible.
 * `verifyOtp` with a token hash is not bound to the browser that started
 * anything, so cross-device links keep working — and the whole class of bug the
 * old route carried a long comment about simply stops existing: there are no
 * session cookies to land on the wrong host, and no redirect for a proxy to
 * rewrite. The templates do not change.
 */
export default function AuthConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // React 19 StrictMode mounts effects twice in development. A token hash is
  // single-use, so the second call would fail on a link that had just worked
  // and send the user to /auth/link-expired.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Every failure lands in the same place, and that page explains the three
    // ordinary reasons a link stops working rather than reporting an error.
    const expired = () => navigate('/auth/link-expired', { replace: true });

    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as EmailOtpType | null;
    const next = searchParams.get('next');

    if (!tokenHash || !type || !isSupabaseConfigured()) {
      expired();
      return;
    }

    // Only same-origin paths, so a crafted `next` can't turn a link we sent
    // into an open redirect to someone else's site.
    const destination = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

    getSupabase()
      .auth.verifyOtp({ type, token_hash: tokenHash })
      .then(({ error }) => {
        // `replace`, so Back doesn't return to a link that is now spent.
        if (error) expired();
        else navigate(destination, { replace: true });
      })
      .catch(expired);
  }, [searchParams, navigate]);

  return (
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5 text-center">
        <div className="brand-icon mb-3">
          <BrandMark size={48} />
        </div>
        <p className="text-muted mb-0">
          <span className="spinner-border spinner-border-sm me-2" role="status" />
          Checking your link…
        </p>
      </div>
    </div>
  );
}
