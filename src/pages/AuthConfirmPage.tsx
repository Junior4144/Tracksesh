import { AuthLayout } from '@/components/ui/AuthLayout';
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { authDestination } from '@/lib/auth-links';

/** Accept both custom token-hash links and default Supabase email redirects. */
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

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const code = searchParams.get('code');
    const recovery = type === 'recovery' || fragment.get('type') === 'recovery';
    // Remove credentials from the address bar/history before making requests.
    window.history.replaceState(null, '', '/auth/confirm');
    if (!isSupabaseConfigured() || fragment.has('error') || fragment.has('error_code') || searchParams.has('error')) {
      expired();
      return;
    }

    const auth = getSupabase().auth;
    const allowedTypes = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];
    const verify = async () => {
      if (tokenHash && type && allowedTypes.includes(type)) {
        return auth.verifyOtp({ type, token_hash: tokenHash });
      }
      if (fragment.get('access_token') && fragment.get('refresh_token')) {
        return auth.setSession({
          access_token: fragment.get('access_token')!, refresh_token: fragment.get('refresh_token')!,
        });
      }
      if (code) return auth.exchangeCodeForSession(code);
      throw new Error('Missing email credentials');
    };
    verify().then(({ data, error }) => {
      if (error || !data.session) expired();
      else navigate(authDestination(next, recovery || ('redirectType' in data && data.redirectType === 'recovery')), { replace: true });
    }).catch(expired);
  }, [searchParams, navigate]);

  return (
    <AuthLayout>
      <p className="text-muted mb-0">
        <span className="spinner-border spinner-border-sm me-2" role="status" />
        Checking your link…
      </p>
    </AuthLayout>
  );
}
