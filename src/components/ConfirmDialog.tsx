import { useEffect, useRef } from 'react';

/**
 * Confirmation for the things that can't be undone.
 *
 * Deleting a block destroys time you actually lived, and deleting a tag
 * unlabels every block that used it — neither has an undo, so neither should
 * happen on a single stray click. Esc and the backdrop both cancel: the safe
 * answer is the easy one.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Focus lands on the destructive button so it can be reached from the
  // keyboard, but the dialog opens with nothing typed — Enter still has to be
  // deliberate.
  useEffect(() => confirmRef.current?.focus(), []);

  return (
    <div
      className="label-prompt-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="label-prompt confirm-dialog card-surface">
        <h3 id="confirmTitle" className="h5 fw-bold mb-2">
          {title}
        </h3>
        <div className="text-muted small mb-4">{body}</div>

        <div className="d-flex gap-2 justify-content-end">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            ref={confirmRef}
            className="btn btn-danger btn-sm fw-semibold"
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
