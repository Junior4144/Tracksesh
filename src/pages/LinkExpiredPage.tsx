import { AuthLayout } from '@/components/ui/AuthLayout';
import { Link } from 'react-router';
import { AlertIcon } from '@/components/icons';

/**
 * Where /auth/confirm sends someone whose token didn't verify.
 *
 * Almost always one of three ordinary things rather than an error worth
 * apologising for: the link expired (an hour), it was already used, or a newer
 * reset email superseded it. The page says so and offers the way forward,
 * because "authentication failed" tells a user nothing they can act on.
 */
export default function LinkExpiredPage() {
  return (
    <AuthLayout>
      <h1 className="h4 fw-bold mb-2 d-flex align-items-center justify-content-center gap-2">
        <AlertIcon size={18} />
        This link didn&apos;t work
      </h1>

      <p className="text-muted small mb-4">
        Email links last an hour and can only be used once. If you asked for a new one since, only
        the most recent link works.
      </p>

      <Link to="/forgot-password" className="btn btn-accent fw-semibold mb-2">
        Send a new reset link
      </Link>
      <Link to="/login" className="btn btn-ghost btn-sm">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
