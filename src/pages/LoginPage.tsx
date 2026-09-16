import { PasswordInput } from '@/components/PasswordInput';
import { AuthLayout } from '@/components/ui/AuthLayout';
import { useState } from 'react';
import { Link } from 'react-router';
import { useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { AlertIcon, LockIcon } from '@/components/icons';

const DEMO_EMAIL = 'demo@tracksesh.com';
const DEMO_PASSWORD = 'demo1234';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /**
   * Where to land after signing in.
   *
   * AuthOnly sets `returnUrl` when it turns someone away, so following a link
   * to /activity while signed out resumes there instead of dropping the user on
   * the dashboard. Only same-origin paths are honoured — a crafted `returnUrl`
   * must not be able to turn this form into a redirect to someone else's site,
   * and `//evil.example` is a protocol-relative URL, not a path.
   */
  const requested = searchParams.get('returnUrl');
  const destination =
    requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<LoginForm>({
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  async function submit({ email, password }: LoginForm) {
    setLoading(true);
    setError(null);

    const result = await login(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    navigate(destination, { replace: true });
  }

  function useDemo() {
    void submit({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  }

  const emailInvalid = !!errors.email && (!!touchedFields.email || isSubmitted);
  const passwordInvalid = !!errors.password && (!!touchedFields.password || isSubmitted);

  return (
    <AuthLayout>
      <div className="auth-heading">
        <h1 className="auth-title">Welcome back</h1>
        <p className="text-muted mb-0">Sign in to your account</p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
          <AlertIcon size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} noValidate>
        <div className="mb-3">
          <label htmlFor="email" className="form-label fw-medium">
            Email address
          </label>
          <input
            id="email"
            type="email"
            className={`form-control${emailInvalid ? ' is-invalid' : ''}`}
            placeholder="you@example.com"
            autoComplete="email"
            {...register('email', { required: 'Email is required.' })}
          />
          {emailInvalid && <div className="invalid-feedback">{errors.email?.message}</div>}
        </div>

        <PasswordInput
          id="password"
          label="Password"
          autoComplete="current-password"
          error={passwordInvalid ? errors.password?.message : undefined}
          {...register('password', { required: 'Password is required.' })}
        />
        <div className="text-end mb-4">
          <Link to="/forgot-password" className="link-accent small">
            Forgot password?
          </Link>
        </div>

        <button type="submit" className="btn btn-accent w-100 fw-semibold py-2" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>
      </form>

      <div className="demo-box mt-3">
        <div className="demo-box__header">
          <LockIcon size={13} />
          Try the demo
        </div>
        <div className="demo-box__creds">
          <span className="demo-cred">
            <span className="demo-label">Email</span>
            {DEMO_EMAIL}
          </span>
          <span className="demo-cred">
            <span className="demo-label">Password</span>
            {DEMO_PASSWORD}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-demo w-100 mt-2 fw-semibold"
          onClick={useDemo}
          disabled={loading}
        >
          {loading && <span className="spinner-border spinner-border-sm me-2" role="status" />}
          Sign in as Demo User
        </button>
      </div>

      <hr className="my-4" />

      <p className="text-center text-muted mb-0 small">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="link-accent fw-medium">
          Create one free
        </Link>
      </p>
    </AuthLayout>
  );
}
