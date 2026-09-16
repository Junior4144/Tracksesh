import { Dialog } from '@/components/ui/Dialog';

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
  return (
    <Dialog labelledBy="confirmTitle" onDismiss={onCancel} busy={busy} className="confirm-dialog">
      <h3 id="confirmTitle" className="h5 fw-bold mb-2">
        {title}
      </h3>
      <div className="text-muted small mb-4">{body}</div>

      <div className="d-flex gap-2 justify-content-end">
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-danger btn-sm fw-semibold" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
