import { forwardRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@/components/icons';

/**
 * A password field with a show/hide toggle.
 *
 * Exists because the account pages need five of these between them. Forwards
 * its ref and spreads the rest of its props, so `{...register('password')}`
 * works exactly as it does on a plain input.
 *
 * `/login` and `/register` still have this inlined — they predate it and
 * rewriting working auth screens wasn't part of the job.
 */
interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  id: string;
  label: string;
  error?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { id, label, error, ...props },
  ref
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-medium">
        {label}
      </label>
      <div className="input-group">
        <input
          id={id}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`form-control${error ? ' is-invalid' : ''}`}
          {...props}
        />
        <button
          type="button"
          className="btn btn-outline-secondary toggle-pw"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeSlashIcon size={16} /> : <EyeIcon size={16} />}
        </button>
        {error && <div className="invalid-feedback">{error}</div>}
      </div>
    </div>
  );
});
