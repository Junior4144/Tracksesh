'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TagTotals } from '@/components/activity/TagTotals';
import { DailyTrend } from '@/components/activity/DailyTrend';
import { DayStrip } from '@/components/activity/DayStrip';
import { AddBlockForm } from '@/components/activity/AddBlockForm';
import { EditBlockDialog } from '@/components/activity/EditBlockDialog';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { deleteBlock, fetchBlocksInRange, fetchTags } from '@/lib/blocks';
import { addDays, rangeFor, summarise } from '@/lib/summary';
import { useClock } from '@/lib/useClock';
import { blockDuration, formatClock, formatTotal } from '@/lib/time';
import { slotColor, type Tag, type TimeBlockWithTag } from '@/lib/types';
import { BarChartIcon, PencilIcon, TrashIcon } from '@/components/icons';

type RangeMode = 'day' | 'week' | 'month';

const MODES: { key: RangeMode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

const STEP_DAYS: Record<RangeMode, number> = { day: 1, week: 7, month: 30 };

export default function ActivityPage() {
  const { user } = useAuth();

  const [mode, setMode] = useState<RangeMode>('week');
  /** Days away from today; the "Today" button resets it to 0. */
  const [offsetDays, setOffsetDays] = useState(0);
  const [blocks, setBlocks] = useState<TimeBlockWithTag[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [adding, setAdding] = useState(false);
  const [showTable, setShowTable] = useState(false);
  /** The block open in the edit dialog, and the one queued for deletion. */
  const [editing, setEditing] = useState<TimeBlockWithTag | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TimeBlockWithTag | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Bumped to force a refetch after adding or deleting a block. */
  const [nonce, setNonce] = useState(0);

  // The clock as an external store rather than a render-time Date.now(): this
  // is hydration-safe (the server snapshot is 0, and React re-reads after
  // hydrating) and pure. Not subscribed — the page doesn't need to tick.
  const nowMs = useClock(false);

  const anchor = useMemo(
    () => (nowMs === 0 ? null : addDays(new Date(nowMs), offsetDays)),
    [nowMs, offsetDays]
  );
  const range = useMemo(() => (anchor ? rangeFor(mode, anchor) : null), [mode, anchor]);

  // Identifies the data currently on screen. Deriving `loading` from it avoids
  // a synchronous setState in the effect, and it can't get out of step with
  // what was actually fetched.
  const rangeKey = range ? `${mode}:${range.from.getTime()}:${nonce}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = rangeKey !== null && loadedKey !== rangeKey;

  useEffect(() => {
    if (!range || !rangeKey || !isSupabaseConfigured()) return;

    const supabase = createClient();
    let cancelled = false;

    Promise.all([fetchBlocksInRange(supabase, range.from, range.to), fetchTags(supabase)])
      .then(([rows, tagRows]) => {
        if (cancelled) return;
        setBlocks(rows);
        setTags(tagRows);
      })
      .catch(() => {
        if (!cancelled) setBlocks([]);
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(rangeKey);
      });

    return () => {
      cancelled = true;
    };
    // range is derived from rangeKey, so the key alone is the correct dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const summary = useMemo(
    () => (range ? summarise(blocks, range.from, range.to) : null),
    [blocks, range]
  );

  async function confirmRemove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBlock(createClient(), pendingDelete.id);
      setPendingDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  }

  const shift = (direction: -1 | 1) => setOffsetDays((o) => o + direction * STEP_DAYS[mode]);

  const rangeLabel = () => {
    if (!range || !anchor) return '';
    if (mode === 'day') {
      return range.from.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    }
    if (mode === 'month') {
      return range.from.toLocaleDateString([], { month: 'long', year: 'numeric' });
    }
    const last = addDays(range.to, -1);
    return `${range.from.toLocaleDateString([], { day: 'numeric', month: 'short' })} – ${last.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  };

  if (!anchor || !range || !summary) {
    return <div className="activity container-sm py-5 text-muted">Loading…</div>;
  }

  const isEmpty = summary.totalSeconds === 0;

  return (
    <div className="activity container-sm py-4">
      <header className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <div className="flex-grow-1">
          <h1 className="h4 fw-bold mb-0">Activity</h1>
          <p className="text-muted small mb-0">{rangeLabel()}</p>
        </div>

        {/* Filters in one row above the charts. */}
        <div className="btn-group btn-group-sm range-picker" role="group" aria-label="Range">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`btn${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="btn-group btn-group-sm range-picker" role="group" aria-label="Move range">
          <button type="button" className="btn" onClick={() => shift(-1)} aria-label="Previous">
            ‹
          </button>
          <button type="button" className="btn" onClick={() => setOffsetDays(0)}>
            Today
          </button>
          <button type="button" className="btn" onClick={() => shift(1)} aria-label="Next">
            ›
          </button>
        </div>

        <button className="btn btn-accent btn-sm fw-semibold" onClick={() => setAdding((a) => !a)}>
          + Add time
        </button>
      </header>

      {adding && user && (
        <div className="mb-4">
          <AddBlockForm
            userId={user.id}
            tags={tags}
            day={range.from}
            onAdded={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : isEmpty ? (
        <div className="empty-state text-center py-5">
          <BarChartIcon size={28} className="text-muted mb-2" />
          <p className="fw-semibold mb-1">Nothing tracked in this range</p>
          <p className="text-muted small mb-0">
            Run the stopwatch, or use <strong>Add time</strong> for something you already did.
          </p>
        </div>
      ) : (
        <>
          {/* Hero numbers: a single value each, so no chart. */}
          <div className="stat-row mb-4">
            <Stat label="Tracked" value={formatTotal(summary.totalSeconds)} primary />
            <Stat label="Sessions" value={String(summary.sessionCount)} />
            <Stat label="Longest" value={formatTotal(summary.longestSeconds)} />
            <Stat label="Average" value={formatTotal(summary.averageSeconds)} />
          </div>

          <div className="chart-grid">
            <div className="card-surface chart-card">
              <TagTotals totals={summary.byTag} />
            </div>

            {mode === 'day' ? (
              <div className="card-surface chart-card">
                <DayStrip day={range.from} blocks={blocks} onSelect={setEditing} />
              </div>
            ) : (
              <div className="card-surface chart-card">
                <DailyTrend days={summary.byDay} legend={summary.byTag} />
              </div>
            )}
          </div>

          <div className="d-flex align-items-center gap-2 mt-4 mb-2">
            <h2 className="h6 fw-semibold mb-0 flex-grow-1">Sessions</h2>
            {/* A table view of the same data — required relief for the
                light-mode contrast warning, and the honest way to read exact
                numbers off a chart. */}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)}>
              {showTable ? 'Hide' : 'Show'} table
            </button>
          </div>

          {showTable && (
            <div className="card-surface session-card">
              <div className="table-responsive">
                <table className="table table-sm table-hover session-table">
                  <thead>
                    <tr>
                      <th scope="col">Tag</th>
                      <th scope="col">Day</th>
                      <th scope="col">Start</th>
                      <th scope="col">End</th>
                      <th scope="col" className="text-end">
                        Duration
                      </th>
                      <th scope="col">Note</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <span className="session-tag">
                            <span
                              className="legend-dot me-2"
                              style={{ background: slotColor(b.tag?.color) }}
                            />
                            {b.tag?.name ?? (
                              <span className="text-muted fst-italic">Unlabelled</span>
                            )}
                          </span>
                        </td>
                        <td className="text-muted">
                          {new Date(b.started_at).toLocaleDateString([], {
                            weekday: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td>{formatClock(b.started_at)}</td>
                        <td>{b.ended_at ? formatClock(b.ended_at) : '—'}</td>
                        <td className="text-end fw-semibold">{formatTotal(blockDuration(b))}</td>
                        <td className="text-muted small session-note" title={b.note ?? undefined}>
                          {b.note ?? ''}
                        </td>
                        <td className="text-end text-nowrap">
                          <button
                            className="btn btn-ghost btn-sm p-1 session-action"
                            onClick={() => setEditing(b)}
                            aria-label={`Edit ${b.tag?.name ?? 'unlabelled'} session`}
                            title="Edit"
                          >
                            <PencilIcon size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-danger p-1 session-action"
                            onClick={() => setPendingDelete(b)}
                            aria-label={`Delete ${b.tag?.name ?? 'unlabelled'} session`}
                            title="Delete"
                          >
                            <TrashIcon size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditBlockDialog
          block={editing}
          tags={tags}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this block?"
          body={
            <>
              {pendingDelete.tag?.name ?? 'Unlabelled'} ·{' '}
              {formatClock(pendingDelete.started_at)}–{formatClock(pendingDelete.ended_at!)} ·{' '}
              {formatTotal(blockDuration(pendingDelete))}. This removes the time from your
              totals for good.
            </>
          }
          confirmLabel="Delete block"
          busy={deleting}
          onConfirm={confirmRemove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, primary }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`stat-tile${primary ? ' primary' : ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
