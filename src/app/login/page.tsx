'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { AlertIcon, BrandMark, EyeIcon, EyeSlashIcon, LockIcon } from '@/components/icons';

const DEMO_EMAIL = 'demo@tracksesh.com';
const DEMO_PASSWORD = 'demo1234';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, touchedFields },
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
    router.push('/dashboard');
  }

  function useDemo() {
    void submit({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  }

  const emailInvalid = !!errors.email && !!touchedFields.email;
  const passwordInvalid = !!errors.password && !!touchedFields.password;

  return (
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5">
        <div className="text-center mb-4">
          <div className="brand-icon mb-3">
            <BrandMark size={48} />
          </div>
          <h1 className="h3 fw-bold text-brand">Tracksesh</h1>
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

          <div className="mb-4">
            <label htmlFor="password" className="form-label fw-medium">
              Password
            </label>
            <div className="input-group">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className={`form-control${passwordInvalid ? ' is-invalid' : ''}`}
                placeholder="••••••••"
                autoComplete="current-password"
                {...register('password', { required: 'Password is required.' })}
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

          <button
            type="submit"
            className="btn btn-accent w-100 fw-semibold py-2"
            disabled={loading}
          >
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
          <Link href="/register" className="link-accent fw-medium">
            Create one free
          </Link>
        </p>
      </div>
    </div>
  );
}
