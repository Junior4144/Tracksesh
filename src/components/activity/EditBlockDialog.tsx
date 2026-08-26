'use client';

import { useEffect, useState } from 'react';
import { updateBlock } from '@/lib/blocks';
import { createClient } from '@/lib/supabase/client';
import { combine, dateValue, timeValue, validateBlockRange } from '@/lib/edits';
import { formatTotal } from '@/lib/time';
import { slotColor, type Tag, type TimeBlockWithTag } from '@/lib/types';
import { CheckSmallIcon } from '@/components/icons';

/**
 * Correct a block after the fact — retag it, fix the note, adjust the times.
 *
 * Start and end each get their own date, rather than one date with two times:
 * blocks are allowed to cross midnight, and inferring "the end must mean
 * tomorrow" would be a guess about the user's day. The pause total is shown but
 * not editable; it is a record of what the stopwatch measured, and there is no
 * honest way to hand-edit it.
 */
export function EditBlockDialog({
  block,
  tags,
  onSaved,
  onCancel,
}: {
  block: TimeBlockWithTag;
  tags: Tag[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const started = new Date(block.started_at);
  const ended = new Date(block.ended_at!);

  const [startDate, setStartDate] = useState(dateValue(started));
  const [startTime, setStartTime] = useState(timeValue(started));
  const [endDate, setEndDate] = useState(dateValue(ended));
  const [endTime, setEndTime] = useState(timeValue(ended));
  const [tagId, setTagId] = useState<number | null>(block.tag_id);
  const [note, setNote] = useState(block.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const startedAt = combine(startDate, startTime);
  const endedAt = combine(endDate, endTime);

  // Preview the worked total the same way the rest of the app derives it:
  // span minus pauses, never stored.
  const spanSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;
  const workedSeconds = Number.isFinite(spanSeconds)
    ? Math.max(0, spanSeconds - block.paused_seconds)
    : 0;

  /**
   * The tag this block already carries may be archived, and archived tags are
   * kept out of pickers. Showing it anyway is the difference between "retag
   * this" and "silently drop the label you can no longer choose".
   */
  const options =
    block.tag && !tags.some((t) => t.id === block.tag!.id)
      ? [...tags, { ...block.tag, user_id: block.user_id, is_archived: true, created_at: '' } as Tag]
      : tags;

  async function save() {
    const problem = validateBlockRange({
      startedAt,
      endedAt,
      nowMs: Date.now(),
      pausedSeconds: block.paused_seconds,
    });

    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await updateBlock(createClient(), block.id, { tagId, note, startedAt, endedAt });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that change.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="label-prompt-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editBlockTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="label-prompt edit-block card-surface">
        <div className="d-flex align-items-baseline gap-2 mb-3">
          <h3 id="editBlockTitle" className="h5 fw-bold mb-0 flex-grow-1">
            Edit this block
          </h3>
          <span className="text-muted small">
            {workedSeconds > 0 ? formatTotal(workedSeconds) : '—'}
          </span>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-7">
            <label htmlFor="ebStartDate" className="form-label small text-muted mb-1">
              Started
            </label>
            <input
              id="ebStartDate"
              type="date"
              className="form-control form-control-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="col-5">
            <label htmlFor="ebStartTime" className="form-label small text-muted mb-1">
              At
            </label>
            <input
              id="ebStartTime"
              type="time"
              className="form-control form-control-sm"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="col-7">
            <label htmlFor="ebEndDate" className="form-label small text-muted mb-1">
              Ended
            </label>
            <input
              id="ebEndDate"
              type="date"
              className="form-control form-control-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="col-5">
            <label htmlFor="ebEndTime" className="form-label small text-muted mb-1">
              At
            </label>
            <input
              id="ebEndTime"
              type="time"
              className="form-control form-control-sm"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        {block.paused_seconds > 0 && (
          <p className="text-muted small mb-3">
            {formatTotal(block.paused_seconds)} of this was paused and doesn&apos;t count towards
            the total.
          </p>
        )}

        <div className="mb-3">
          <label className="form-label small text-muted mb-1">Tag</label>
          <div className="tag-picker d-flex flex-wrap gap-2">
            {options.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`tag-chip${tagId === tag.id ? ' selected' : ''}`}
                style={{ '--tag-color': slotColor(tag.color) } as React.CSSProperties}
                onClick={() => setTagId(tagId === tag.id ? null : tag.id)}
              >
                <span className="tag-dot" />
                {tag.name}
                {tag.is_archived && <span className="text-muted ms-1 small">(archived)</span>}
                {tagId === tag.id && <CheckSmallIcon className="ms-1" size={11} />}
              </button>
            ))}
          </div>
          <p className="text-muted small mt-2 mb-0">
            {tagId === null ? 'Unlabelled — pick a tag, or leave it.' : 'Click again to unlabel.'}
          </p>
        </div>

        <div className="mb-4">
          <label htmlFor="ebNote" className="form-label small text-muted mb-1">
            Note <span className="text-muted">(optional)</span>
          </label>
          <input
            id="ebNote"
            className="form-control form-control-sm"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was it?"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </div>

        {error && <p className="text-danger small mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-accent btn-sm fw-semibold" onClick={save} disabled={saving}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
