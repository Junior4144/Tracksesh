'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PasswordInput } from '@/components/PasswordInput';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { fetchAllBlocks, fetchTags } from '@/lib/blocks';
import { buildExport, exportFilename } from '@/lib/export';
import { AlertIcon, CheckCircleIcon, LockIcon } from '@/components/icons';

/**
 * Account settings: change password, take your data with you, delete the lot.
 *
 * Three sections in ascending order of consequence, which is also the order
 * they're most likely to be wanted. Delete is last and visually separated,
 * because it's the only one on this page that can't be undone.
 */
export default function AccountPage() {
  const { user, updatePassword, deleteAccount } = useAuth();

  if (!user) {
    return <div className="account-page container-sm py-5 text-muted">Loading…</div>;
  }

  return (
    <div className="account-page container-sm py-4">
      <header className="mb-4">
        <h1 className="h4 fw-bold mb-0">Account</h1>
        <p className="text-muted small mb-0">
          Signed in as <strong>{user.email}</strong>
        </p>
      </header>

      <ChangePassword updatePassword={updatePassword} />
      <ExportData account={user} />
      <DeleteAccount email={user.email} deleteAccount={deleteAccount} />
    </div>
  );
}

// ── Change password ─────────────────────────────────────────────────────────

interface PasswordForm {
  currentPassword: string;
  password: string;
  confirmPassword: string;
}

function ChangePassword({
  updatePassword,
}: {
  updatePassword: (password: string, currentPassword?: string) => Promise<{ error: string | null }>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<PasswordForm>({
    mode: 'onTouched',
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  async function submit({ currentPassword, password }: PasswordForm) {
    setSaving(true);
    setError(null);
    setDone(false);

    // AuthProvider signs in with the current password before changing anything,
    // so a session someone walked away from can't be used to lock them out.
    const result = await updatePassword(password, currentPassword);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    reset();
    setDone(true);
  }

  // `isSubmitted` as well as touched: on its own, `touchedFields` hides errors
  // raised by pressing the button on a field that was never blurred — the form
  // refuses to submit and says nothing about why.
  const shown = (field: keyof PasswordForm) =>
    isSubmitted || touchedFields[field] ? errors[field]?.message : undefined;

  return (
    <section className="card-surface account-card mb-3">
      <h2 className="h6 fw-semibold mb-1">Change password</h2>
      <p className="text-muted small mb-3">
        You&apos;ll stay signed in on this device. Other devices keep their session until it
        expires.
      </p>

      {error && (
        <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2" role="alert">
          <AlertIcon size={15} />
          {error}
        </div>
      )}

      {done && (
        <div className="alert alert-success py-2 px-3 small d-flex align-items-center gap-2" role="alert">
          <CheckCircleIcon size={15} />
          Password updated.
        </div>
      )}

      <form onSubmit={handleSubmit(submit)} noValidate className="account-form">
        <PasswordInput
          id="currentPassword"
          label="Current password"
          autoComplete="current-password"
          error={shown('currentPassword')}
          {...register('currentPassword', { required: 'Enter your current password.' })}
        />

        <PasswordInput
          id="newPassword"
          label="New password"
          placeholder="Min. 8 characters"
          autoComplete="new-password"
          error={shown('password')}
          {...register('password', {
            required: 'Password is required.',
            minLength: { value: 8, message: 'Password must be at least 8 characters.' },
          })}
        />

        <PasswordInput
          id="confirmNewPassword"
          label="Confirm new password"
          autoComplete="new-password"
          error={shown('confirmPassword')}
          {...register('confirmPassword', {
            required: 'Please confirm your password.',
            validate: (value) => value === getValues('password') || 'Passwords do not match.',
          })}
        />

        <button type="submit" className="btn btn-accent btn-sm fw-semibold" disabled={saving}>
          {saving ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </section>
  );
}

// ── Export ──────────────────────────────────────────────────────────────────

function ExportData({ account }: { account: { id: string; email: string } }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (!isSupabaseConfigured()) return;

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const [tags, blocks] = await Promise.all([
        fetchTags(supabase, { includeArchived: true }),
        fetchAllBlocks(supabase),
      ]);

      const payload = buildExport(account, tags, blocks, Date.now());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      );

      const link = document.createElement('a');
      link.href = url;
      link.download = exportFilename(Date.now());
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build your export.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-surface account-card mb-3">
      <h2 className="h6 fw-semibold mb-1">Export your data</h2>
      <p className="text-muted small mb-3">
        Every tag and every block, as JSON. Each block carries its tag name and worked duration, so
        the file is readable on its own.
      </p>

      {error && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
          {error}
        </div>
      )}

      <button className="btn btn-ghost btn-sm" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download JSON'}
      </button>
    </section>
  );
}

// ── Delete ──────────────────────────────────────────────────────────────────

function DeleteAccount({
  email,
  deleteAccount,
}: {
  email: string;
  deleteAccount: (password: string) => Promise<{ error: string | null }>;
}) {
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);

    const result = await deleteAccount(password);
    if (result.error) {
      setError(result.error);
      setBusy(false);
      setConfirming(false);
      return;
    }
    // On success the provider signs out and routes to /login; nothing to do.
  }

  return (
    <section className="card-surface account-card account-danger">
      <h2 className="h6 fw-semibold mb-1 text-danger">Delete account</h2>
      <p className="text-muted small mb-3">
        Removes your account and every block and tag in it, immediately and permanently. There is no
        recovery and no grace period — <strong>export your data first</strong> if you might want it.
      </p>

      {error && (
        <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2" role="alert">
          <AlertIcon size={15} />
          {error}
        </div>
      )}

      <div className="account-form">
        <PasswordInput
          id="deletePassword"
          label="Confirm your password to continue"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          className="btn btn-danger btn-sm fw-semibold"
          onClick={() => setConfirming(true)}
          disabled={!password || busy}
        >
          <LockIcon size={13} className="me-1" />
          Delete my account
        </button>
      </div>

      {confirming && (
        <ConfirmDialog
          title="Delete your account?"
          body={
            <>
              <p className="mb-2">
                <strong>{email}</strong> and everything tracked under it will be erased. This
                can&apos;t be undone.
              </p>
              <p className="mb-0">Last chance to export first.</p>
            </>
          }
          confirmLabel="Delete everything"
          busy={busy}
          onConfirm={confirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </section>
  );
}
