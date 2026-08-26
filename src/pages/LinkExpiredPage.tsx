import { Link } from 'react-router';
import { AlertIcon, BrandMark } from '@/components/icons';

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
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5 text-center">
        <div className="brand-icon mb-3">
          <BrandMark size={48} />
        </div>

        <h1 className="h4 fw-bold mb-2 d-flex align-items-center justify-content-center gap-2">
          <AlertIcon size={18} />
          This link didn&apos;t work
        </h1>

        <p className="text-muted small mb-4">
          Email links last an hour and can only be used once. If you asked for a new one since,
          only the most recent link works.
        </p>

        <Link to="/forgot-password" className="btn btn-accent fw-semibold mb-2">
          Send a new reset link
        </Link>
        <Link to="/login" className="btn btn-ghost btn-sm">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
