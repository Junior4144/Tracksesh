import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { AlertIcon, BrandMark, CheckCircleIcon } from '@/components/icons';

interface ForgotForm {
  email: string;
}

/**
 * "I can't get in."
 *
 * The confirmation deliberately doesn't say whether the address had an account.
 * Supabase's `resetPasswordForEmail` won't tell us, and it shouldn't — a page
 * that answers "no account with that email" is a way to test whether someone
 * uses this service.
 */
export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();

  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, touchedFields },
  } = useForm<ForgotForm>({ mode: 'onTouched', defaultValues: { email: '' } });

  async function submit({ email }: ForgotForm) {
    setLoading(true);
    setError(null);

    const result = await requestPasswordReset(email);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  }

  const emailInvalid = !!errors.email && !!touchedFields.email;

  return (
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5">
        <div className="text-center mb-4">
          <div className="brand-icon mb-3">
            <BrandMark size={48} />
          </div>
          <h1 className="h3 fw-bold text-brand">Reset your password</h1>
          <p className="text-muted mb-0">We&apos;ll email you a link to choose a new one.</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
            <AlertIcon size={16} />
            {error}
          </div>
        )}

        {sent ? (
          <div className="alert alert-success py-3 d-flex align-items-start gap-2" role="alert">
            <CheckCircleIcon size={18} />
            <span>
              If <strong>{getValues('email')}</strong> has an account, a reset link is on its way.
              It expires in an hour.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="form-label fw-medium">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className={`form-control${emailInvalid ? ' is-invalid' : ''}`}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                {...register('email', { required: 'Email is required.' })}
              />
              {emailInvalid && <div className="invalid-feedback">{errors.email?.message}</div>}
            </div>

            <button type="submit" className="btn btn-accent w-100 fw-semibold py-2" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </button>
          </form>
        )}

        <hr className="my-4" />

        <p className="text-center text-muted mb-0 small">
          Remembered it?{' '}
          <Link to="/login" className="link-accent fw-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
