import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { createTag, fetchTags } from '@/lib/blocks';
import { nextSlot } from '@/lib/edits';
import { blockDuration, formatClock, formatTotal } from '@/lib/time';
import { slotColor, type Tag, type TimeBlock } from '@/lib/types';
import { CheckSmallIcon, TagIcon, TrashIcon } from '@/components/icons';

/**
 * "What did you do in this time?" — shown once the stopwatch stops.
 *
 * Dismissing is allowed and keeps the block unlabelled: losing the time you
 * actually spent is worse than an untidy ledger. Only Discard deletes it.
 */
export function SessionLabelPrompt({
  block,
  busy,
  onSave,
  onDiscard,
  onDismiss,
}: {
  block: TimeBlock;
  busy: boolean;
  onSave: (tagId: number | null, note: string) => void;
  onDiscard: () => void;
  onDismiss: () => void;
}) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchTags()
      .then((rows) => active && setTags(rows))
      .catch(() => active && setTagError('Could not load your tags.'));
    return () => {
      active = false;
    };
  }, []);

  // Esc keeps the block rather than discarding it — the safe default.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // The block is already stopped, so its duration is fixed — no clock needed.
  const worked = blockDuration(block);

  async function addTag() {
    const name = newTagName.trim();
    if (!name) return;

    setTagError(null);
    try {
      // Next slot in fixed order, wrapping once all eight are used — hues are
      // never generated, so a new tag can't land on top of an existing one.
      const tag = await createTag(name, nextSlot(tags.length));
      setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(tag.id);
      setNewTagName('');
      setCreating(false);
      noteRef.current?.focus();
    } catch (e) {
      // The API already words a name clash for a human; anything else is a
      // failure to reach it at all.
      setTagError(e instanceof ApiError ? e.message : 'Could not create that tag.');
    }
  }

  return (
    <div className="label-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="labelPromptTitle">
      <div className="label-prompt card-surface">
        <div className="text-center mb-3">
          <p className="text-muted small text-uppercase letter-spacing mb-1">Session complete</p>
          <h3 id="labelPromptTitle" className="fw-bold mb-1">
            What did you do?
          </h3>
          <p className="text-muted small mb-0">
            {formatTotal(worked)} · {formatClock(block.started_at)}
            {block.ended_at ? `–${formatClock(block.ended_at)}` : ''}
          </p>
        </div>

        <div className="mb-3">
          <label className="form-label small text-muted d-flex align-items-center gap-1">
            <TagIcon size={12} />
            Tag
          </label>

          <div className="tag-picker d-flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`tag-chip${selected === tag.id ? ' selected' : ''}`}
                style={{ '--tag-color': slotColor(tag.color) } as React.CSSProperties}
                onClick={() => setSelected(selected === tag.id ? null : tag.id)}
              >
                <span className="tag-dot" />
                {tag.name}
                {selected === tag.id && <CheckSmallIcon className="ms-1" size={11} />}
              </button>
            ))}

            {creating ? (
              <span className="tag-create d-inline-flex align-items-center gap-1">
                <input
                  className="form-control form-control-sm tag-create-input"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name"
                  maxLength={40}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setCreating(false);
                    }
                  }}
                />
                <button type="button" className="btn btn-accent btn-sm" onClick={addTag}>
                  Add
                </button>
              </span>
            ) : (
              <button type="button" className="tag-chip tag-chip-new" onClick={() => setCreating(true)}>
                + New tag
              </button>
            )}
          </div>

          {tagError && <p className="text-danger small mt-2 mb-0">{tagError}</p>}
        </div>

        <div className="mb-4">
          <label htmlFor="sessionNote" className="form-label small text-muted">
            Note <span className="text-muted">(optional)</span>
          </label>
          <input
            id="sessionNote"
            ref={noteRef}
            className="form-control"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Chapter 3, distributed systems"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave(selected, note);
            }}
          />
        </div>

        <div className="d-flex gap-2 align-items-center">
          <button
            className="btn btn-accent fw-semibold flex-grow-1"
            onClick={() => onSave(selected, note)}
            disabled={busy}
          >
            Save to my day
          </button>
          <button className="btn btn-ghost" onClick={onDismiss} disabled={busy} title="Keep it, label it later">
            Skip
          </button>
          <button
            className="btn btn-ghost text-danger"
            onClick={onDiscard}
            disabled={busy}
            title="Delete this session"
          >
            <TrashIcon size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
