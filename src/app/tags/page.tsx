'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { createTag, deleteTag, fetchTagUsage, fetchTags, updateTag } from '@/lib/blocks';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { nextSlot, tagNameError } from '@/lib/edits';
import { formatTotal } from '@/lib/time';
import { TAG_SLOTS, slotColor, type Tag, type TagUsage } from '@/lib/types';
import { CheckSmallIcon, PencilIcon, TagIcon, TrashIcon } from '@/components/icons';

/**
 * Tag management: rename, recolour, archive, delete.
 *
 * Tags are the vocabulary that turns "36 minutes at 2pm" into "you read 4h12m
 * this week", so they're the one thing in the app that has to stay editable —
 * until now they could only be created, from the label prompt.
 *
 * Archive is the default retirement path and delete is the exception, because
 * only one of them is reversible: archiving hides a tag from every picker while
 * its history keeps its name and colour, whereas deleting unlabels every block
 * that used it, permanently.
 */
export default function TagsPage() {
  const { user } = useAuth();

  const [tags, setTags] = useState<Tag[]>([]);
  const [usage, setUsage] = useState<Map<number, TagUsage>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Starts already loaded when there is nothing to load — flipping it inside
  // the effect would be a synchronous setState, and a cascading render.
  // `isSupabaseConfigured` reads build-time inlined env vars, so it returns the
  // same answer on the server and on the client.
  const [loaded, setLoaded] = useState(!isSupabaseConfigured());

  /** The tag whose row is currently in edit mode, and the tag queued for deletion. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClient();
    let cancelled = false;

    Promise.all([fetchTags(supabase, { includeArchived: true }), fetchTagUsage(supabase)])
      .then(([rows, counts]) => {
        if (cancelled) return;
        setTags(rows);
        setUsage(counts);
      })
      .catch(() => !cancelled && setError('Could not load your tags.'))
      .finally(() => !cancelled && setLoaded(true));

    return () => {
      cancelled = true;
    };
  }, []);

  const [active, archived] = useMemo(
    () => [tags.filter((t) => !t.is_archived), tags.filter((t) => t.is_archived)],
    [tags]
  );

  const replace = useCallback(
    (tag: Tag) => setTags((prev) => prev.map((t) => (t.id === tag.id ? tag : t))),
    []
  );

  async function save(tag: Tag, patch: { name: string; color: string }) {
    setBusyId(tag.id);
    setError(null);
    try {
      replace(await updateTag(createClient(), tag.id, patch));
      setEditingId(null);
    } catch (e) {
      setError(describe(e, 'Could not save that tag.'));
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(tag: Tag, is_archived: boolean) {
    setBusyId(tag.id);
    setError(null);
    try {
      replace(await updateTag(createClient(), tag.id, { is_archived }));
    } catch (e) {
      setError(describe(e, 'Could not archive that tag.'));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { id } = pendingDelete;

    setBusyId(id);
    setError(null);
    try {
      await deleteTag(createClient(), id);
      setTags((prev) => prev.filter((t) => t.id !== id));
      // Its blocks are now unlabelled, so the count goes with it.
      setUsage((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setPendingDelete(null);
    } catch (e) {
      setError(describe(e, 'Could not delete that tag.'));
    } finally {
      setBusyId(null);
    }
  }

  async function add(name: string, color: string) {
    if (!user) return;
    setError(null);
    try {
      const tag = await createTag(createClient(), user.id, name, color);
      setTags((prev) => [...prev, tag].sort(byName));
      setCreating(false);
    } catch (e) {
      setError(describe(e, 'Could not create that tag.'));
    }
  }

  if (!loaded) {
    return <div className="tags-page container-sm py-5 text-muted">Loading…</div>;
  }

  return (
    <div className="tags-page container-sm py-4">
      <header className="d-flex flex-wrap align-items-center gap-2 mb-4">
        <div className="flex-grow-1">
          <h1 className="h4 fw-bold mb-0">Tags</h1>
          <p className="text-muted small mb-0">
            The categories your time is counted under.
          </p>
        </div>
        <button
          className="btn btn-accent btn-sm fw-semibold"
          onClick={() => setCreating((c) => !c)}
        >
          + New tag
        </button>
      </header>

      {error && (
        <div className="alert alert-danger py-2 px-3 small" role="alert">
          {error}
        </div>
      )}

      {creating && (
        <div className="card-surface tag-editor mb-3">
          <TagFields
            title="New tag"
            initialName=""
            initialColor={nextSlot(tags.length)}
            existing={tags}
            onSave={add}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      {active.length === 0 && archived.length === 0 ? (
        <div className="empty-state text-center py-5">
          <TagIcon size={26} className="text-muted mb-2" />
          <p className="fw-semibold mb-1">No tags yet</p>
          <p className="text-muted small mb-0">
            Create one here, or add it while labelling a session.
          </p>
        </div>
      ) : (
        <ul className="tag-list card-surface list-unstyled mb-0">
          {active.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              usage={usage.get(tag.id)}
              tags={tags}
              editing={editingId === tag.id}
              busy={busyId === tag.id}
              onEdit={() => setEditingId(tag.id)}
              onCancelEdit={() => setEditingId(null)}
              onSave={(patch) => save(tag, patch)}
              onArchive={() => setArchived(tag, true)}
              onDelete={() => setPendingDelete(tag)}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <h2 className="h6 fw-semibold text-muted mt-4 mb-2">Archived</h2>
          <p className="text-muted small mb-2">
            Hidden from the tag pickers. The blocks they label keep their name and colour.
          </p>
          <ul className="tag-list card-surface list-unstyled mb-0">
            {archived.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                usage={usage.get(tag.id)}
                tags={tags}
                editing={editingId === tag.id}
                busy={busyId === tag.id}
                onEdit={() => setEditingId(tag.id)}
                onCancelEdit={() => setEditingId(null)}
                onSave={(patch) => save(tag, patch)}
                onArchive={() => setArchived(tag, false)}
                onDelete={() => setPendingDelete(tag)}
              />
            ))}
          </ul>
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${pendingDelete.name}"?`}
          body={<DeleteWarning tag={pendingDelete} usage={usage.get(pendingDelete.id)} />}
          confirmLabel="Delete tag"
          busy={busyId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/**
 * What deleting actually costs, in the numbers the user cares about. An unused
 * tag is a free delete and shouldn't be dressed up as a dangerous one.
 */
function DeleteWarning({ tag, usage }: { tag: Tag; usage?: TagUsage }) {
  if (!usage || usage.block_count === 0) {
    return <>Nothing is labelled with it, so nothing else changes.</>;
  }

  return (
    <>
      <p className="mb-2">
        <strong>{usage.block_count}</strong> {usage.block_count === 1 ? 'block' : 'blocks'} (
        {formatTotal(usage.total_seconds)}) are labelled with it. They&apos;ll be kept, but they
        become <strong>unlabelled</strong> and drop out of your per-tag totals. That can&apos;t be
        undone.
      </p>
      <p className="mb-0">
        To stop using &quot;{tag.name}&quot; without losing the labels, archive it instead.
      </p>
    </>
  );
}

function TagRow({
  tag,
  usage,
  tags,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onSave,
  onArchive,
  onDelete,
}: {
  tag: Tag;
  usage?: TagUsage;
  tags: Tag[];
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: { name: string; color: string }) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  if (editing) {
    return (
      <li className="tag-row tag-row-editing">
        <TagFields
          title={`Edit "${tag.name}"`}
          initialName={tag.name}
          initialColor={tag.color}
          existing={tags}
          selfId={tag.id}
          busy={busy}
          onSave={(name, color) => onSave({ name, color })}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }

  return (
    <li className="tag-row">
      <span className="tag-swatch" style={{ background: slotColor(tag.color) }} />

      <span className="tag-row-name">{tag.name}</span>

      <span className="tag-row-usage text-muted small">
        {usage
          ? `${usage.block_count} ${usage.block_count === 1 ? 'block' : 'blocks'} · ${formatTotal(usage.total_seconds)}`
          : 'Unused'}
      </span>

      <span className="tag-row-actions">
        <button className="btn btn-ghost btn-sm" onClick={onEdit} disabled={busy}>
          <PencilIcon size={13} className="me-1" />
          Edit
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onArchive} disabled={busy}>
          {tag.is_archived ? 'Restore' : 'Archive'}
        </button>
        <button
          className="btn btn-ghost btn-sm text-danger p-1"
          onClick={onDelete}
          disabled={busy}
          aria-label={`Delete ${tag.name}`}
          title={`Delete ${tag.name}`}
        >
          <TrashIcon size={13} />
        </button>
      </span>
    </li>
  );
}

/** The name + colour form, shared by "new tag" and the inline row editor. */
function TagFields({
  title,
  initialName,
  initialColor,
  existing,
  selfId,
  busy,
  onSave,
  onCancel,
}: {
  title: string;
  initialName: string;
  initialColor: string;
  existing: Tag[];
  selfId?: number;
  busy?: boolean;
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = tagNameError(name, existing, selfId);
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    onSave(name.trim(), color);
  }

  return (
    <form onSubmit={submit}>
      <p className="small text-muted mb-2">{title}</p>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <input
          className="form-control form-control-sm tag-name-input"
          value={name}
          maxLength={40}
          placeholder="Tag name"
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-label="Tag name"
        />

        {/* Eight fixed slots, not a colour picker: each theme resolves its own
            step per slot, and a free-form hue lands wherever it likes relative
            to the ones checked for colour-blind separation. */}
        <div className="tag-slots d-flex gap-1" role="radiogroup" aria-label="Colour">
          {TAG_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              role="radio"
              aria-checked={color === slot}
              aria-label={slot}
              title={slot}
              className={`tag-slot${color === slot ? ' selected' : ''}`}
              style={{ background: slotColor(slot) }}
              onClick={() => setColor(slot)}
            >
              {color === slot && <CheckSmallIcon size={11} />}
            </button>
          ))}
        </div>

        <span className="flex-grow-1" />

        <button className="btn btn-accent btn-sm fw-semibold" type="submit" disabled={busy}>
          Save
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>

      {problem && <p className="text-danger small mb-0">{problem}</p>}
    </form>
  );
}

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name);

/**
 * PostgREST reports a name clash as a duplicate-key error naming the unique
 * index. `tagNameError` catches that case first, but two tabs can still race,
 * so translate it here rather than showing the index name.
 */
function describe(e: unknown, fallback: string): string {
  const message = e instanceof Error ? e.message : '';
  return message.includes('duplicate') ? 'You already have a tag with that name.' : fallback;
}
