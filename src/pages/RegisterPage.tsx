import { useState } from 'react';
import { Link } from 'react-router';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import {
  AlertIcon,
  BrandMark,
  CheckCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  LockIcon,
} from '@/components/icons';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, touchedFields },
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

  const emailInvalid = !!errors.email && !!touchedFields.email;
  const passwordInvalid = !!errors.password && !!touchedFields.password;
  const confirmInvalid = !!errors.confirmPassword && !!touchedFields.confirmPassword;

  return (
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5">
        <div className="text-center mb-4">
          <div className="brand-icon mb-3">
            <BrandMark size={48} />
          </div>
          <h1 className="h3 fw-bold text-brand">Tracksesh</h1>
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

            <div className="mb-3">
              <label htmlFor="password" className="form-label fw-medium">
                Password
              </label>
              <div className="input-group">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-control${passwordInvalid ? ' is-invalid' : ''}`}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  {...register('password', {
                    required: 'Password is required.',
                    minLength: { value: 8, message: 'Password must be at least 8 characters.' },
                  })}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary toggle-pw"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
                {passwordInvalid && (
                  <div className="invalid-feedback">{errors.password?.message}</div>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="confirmPassword" className="form-label fw-medium">
                Confirm password
              </label>
              <div className="input-group">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  className={`form-control${confirmInvalid ? ' is-invalid' : ''}`}
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  {...register('confirmPassword', {
                    required: 'Please confirm your password.',
                    validate: (value) =>
                      value === getValues('password') || 'Passwords do not match.',
                  })}
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary toggle-pw"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
                </button>
                {confirmInvalid && (
                  <div className="invalid-feedback">{errors.confirmPassword?.message}</div>
                )}
              </div>
            </div>

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
      </div>
    </div>
  );
}
