import { PasswordInput } from '@/components/PasswordInput';
import { AuthLayout } from '@/components/ui/AuthLayout';
import { useState } from 'react';
import { Link } from 'react-router';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { AlertIcon, CheckCircleIcon, LockIcon } from '@/components/icons';

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<RegisterForm>({
    mode: 'onTouched',
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  async function submit({ email, password }: RegisterForm) {
    setLoading(true);
    setError(null);

    const result = await registerUser(email, password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    if (result.needsConfirmation) {
      setConfirmationSent(true);
      setLoading(false);
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  const emailInvalid = !!errors.email && (!!touchedFields.email || isSubmitted);
  const passwordInvalid = !!errors.password && (!!touchedFields.password || isSubmitted);
  const confirmInvalid =
    !!errors.confirmPassword && (!!touchedFields.confirmPassword || isSubmitted);

  return (
    <AuthLayout>
      <div className="auth-heading">
        <h1 className="auth-title">Create your account</h1>
        <p className="text-muted mb-0">Create your free account</p>
      </div>

      {error && (
        <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
          <AlertIcon size={16} />
          {error}
        </div>
      )}

      {confirmationSent ? (
        <div className="alert alert-success py-3 d-flex align-items-start gap-2" role="alert">
          <CheckCircleIcon size={18} />
          <span>
            Account created. Check your inbox for a confirmation link, then{' '}
            <Link to="/login" className="link-accent fw-medium">
              sign in
            </Link>
            .
          </span>
        </div>
      ) : (
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
              {...register('email', {
                required: 'Email is required.',
                pattern: {
                  // Mirrors Angular's Validators.email pattern.
                  value: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/,
                  message: 'Enter a valid email address.',
                },
              })}
            />
            {emailInvalid && <div className="invalid-feedback">{errors.email?.message}</div>}
          </div>

          <PasswordInput
            id="password"
            label="Password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            error={passwordInvalid ? errors.password?.message : undefined}
            {...register('password', {
              required: 'Password is required.',
              minLength: { value: 8, message: 'Password must be at least 8 characters.' },
            })}
          />
          <PasswordInput
            id="confirmPassword"
            label="Confirm password"
            autoComplete="new-password"
            error={confirmInvalid ? errors.confirmPassword?.message : undefined}
            {...register('confirmPassword', {
              required: 'Please confirm your password.',
              validate: (value) => value === getValues('password') || 'Passwords do not match.',
            })}
          />

          <button
            type="submit"
            className="btn btn-accent w-100 fw-semibold py-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>
      )}

      <div className="demo-box mt-3">
        <div className="demo-box__header">
          <LockIcon size={13} />
          Try the demo
        </div>
        <div className="demo-box__creds">
          <span className="demo-cred">
            <span className="demo-label">Email</span>
            demo@tracksesh.com
          </span>
          <span className="demo-cred">
            <span className="demo-label">Password</span>
            demo1234
          </span>
        </div>
        <Link to="/login" className="btn btn-demo w-100 mt-2 fw-semibold d-block text-center">
          Sign in as Demo User
        </Link>
      </div>

      <hr className="my-4" />

      <p className="text-center text-muted mb-0 small">
        Already have an account?{' '}
        <Link to="/login" className="link-accent fw-medium">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
