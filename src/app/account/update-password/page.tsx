'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { PasswordInput } from '@/components/PasswordInput';
import { AlertIcon, BrandMark } from '@/components/icons';

interface UpdateForm {
  password: string;
  confirmPassword: string;
}

/**
 * Where a recovery link lands, once /auth/confirm has turned the emailed token
 * into a real session.
 *
 * No current-password field: the emailed token is what proved ownership, and
 * anyone arriving here by definition doesn't know the old one. That's also why
 * the route is behind the normal auth check in proxy.ts — reaching it without
 * a session means the link wasn't verified, and there is nothing to change.
 */
export default function UpdatePasswordPage() {
  const { updatePassword } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<UpdateForm>({
    mode: 'onTouched',
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function submit({ password }: UpdateForm) {
    setLoading(true);
    setError(null);

    const result = await updatePassword(password);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
  }

  // `isSubmitted` as well as touched: on its own, `touchedFields` hides errors
  // raised by pressing the button on a field that was never blurred — the form
  // refuses to submit and says nothing about why.
  const shown = (field: keyof UpdateForm) =>
    isSubmitted || touchedFields[field] ? errors[field]?.message : undefined;

  return (
    <div className="auth-page d-flex align-items-center justify-content-center min-vh-100">
      <div className="auth-card card shadow-lg p-4 p-md-5">
        <div className="text-center mb-4">
          <div className="brand-icon mb-3">
            <BrandMark size={48} />
          </div>
          <h1 className="h3 fw-bold text-brand">Choose a new password</h1>
          <p className="text-muted mb-0">You&apos;ll be signed in once it&apos;s saved.</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
            <AlertIcon size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(submit)} noValidate>
          <PasswordInput
            id="password"
            label="New password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            autoFocus
            error={shown('password')}
            {...register('password', {
              required: 'Password is required.',
              minLength: { value: 8, message: 'Password must be at least 8 characters.' },
            })}
          />

          <PasswordInput
            id="confirmPassword"
            label="Confirm new password"
            placeholder="Repeat password"
            autoComplete="new-password"
            error={shown('confirmPassword')}
            {...register('confirmPassword', {
              required: 'Please confirm your password.',
              validate: (value) => value === getValues('password') || 'Passwords do not match.',
            })}
          />

          <button
            type="submit"
            className="btn btn-accent w-100 fw-semibold py-2 mt-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Saving…
              </>
            ) : (
              'Save new password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
