'use client';

import { useState } from 'react';
import { createManualBlock } from '@/lib/blocks';
import { createClient } from '@/lib/supabase/client';
import { combine, dateValue, validateBlockRange } from '@/lib/edits';
import { formatTotal } from '@/lib/time';
import { slotColor, type Tag } from '@/lib/types';
import { CheckSmallIcon } from '@/components/icons';

/**
 * Backfill — "I read for 36 minutes at 2pm and forgot to hit start".
 *
 * Produces exactly the same object as the stopwatch, only with source='manual'.
 */
export function AddBlockForm({
  userId,
  tags,
  day,
  onAdded,
  onCancel,
}: {
  userId: string;
  tags: Tag[];
  day: Date;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(dateValue(day));
  const [start, setStart] = useState('14:00');
  const [end, setEnd] = useState('14:36');
  const [tagId, setTagId] = useState<number | null>(tags[0]?.id ?? null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startedAt = combine(date, start);
  const endedAt = combine(date, end);
  const durationSeconds = Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())
    ? 0
    : (endedAt.getTime() - startedAt.getTime()) / 1000;

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // A backfilled block was never paused, so there is no pause total to fit.
    const problem = validateBlockRange({ startedAt, endedAt, nowMs: Date.now() });
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await createManualBlock(createClient(), userId, { startedAt, endedAt, tagId, note });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that block.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-block card-surface" onSubmit={submit}>
      <h3 className="fw-bold mb-1">Add time</h3>
      <p className="text-muted small mb-3">For time that happened without the stopwatch running.</p>

      <div className="row g-2 mb-3">
        <div className="col-12 col-sm-5">
          <label htmlFor="abDate" className="form-label small text-muted mb-1">
            Date
          </label>
          <input
            id="abDate"
            type="date"
            className="form-control form-control-sm"
            value={date}
            max={dateValue(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="col-6 col-sm-3">
          <label htmlFor="abStart" className="form-label small text-muted mb-1">
            From
          </label>
          <input
            id="abStart"
            type="time"
            className="form-control form-control-sm"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="col-6 col-sm-3">
          <label htmlFor="abEnd" className="form-label small text-muted mb-1">
            To
          </label>
          <input
            id="abEnd"
            type="time"
            className="form-control form-control-sm"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="col-12 col-sm-1 d-flex align-items-end">
          <span className="text-muted small text-nowrap pb-1">
            {durationSeconds > 0 ? formatTotal(durationSeconds) : '—'}
          </span>
        </div>
      </div>

      <div className="mb-3">
        <label className="form-label small text-muted mb-1">Tag</label>
        <div className="tag-picker d-flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={`tag-chip${tagId === tag.id ? ' selected' : ''}`}
              style={{ '--tag-color': slotColor(tag.color) } as React.CSSProperties}
              onClick={() => setTagId(tagId === tag.id ? null : tag.id)}
            >
              <span className="tag-dot" />
              {tag.name}
              {tagId === tag.id && <CheckSmallIcon className="ms-1" size={11} />}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <label htmlFor="abNote" className="form-label small text-muted mb-1">
          Note <span className="text-muted">(optional)</span>
        </label>
        <input
          id="abNote"
          className="form-control form-control-sm"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was it?"
        />
      </div>

      {error && <p className="text-danger small mb-3">{error}</p>}

      <div className="d-flex gap-2">
        <button className="btn btn-accent btn-sm fw-semibold" type="submit" disabled={saving}>
          Add to my day
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
