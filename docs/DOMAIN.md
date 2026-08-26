# Tracksesh — domain model

Agreed before any schema was created. This is the contract the database and UI
are built to. Nothing here is applied yet.

## What the product is

A **time ledger**. At the end of any day you can see where your hours actually
went, and summarize them by category.

It is explicitly *not* a Pomodoro/focus app. Focus timers optimise a single
session; Tracksesh optimises the record. The timer is only one way of authoring
a record.

## The one core object: a time block

Everything in the app is a **labelled time block** — a start, an end, and a tag:

> Reading · 14:00–14:36 · "Chapter 3, distributed systems"

There are two ways a block gets created, and they produce the identical object:

| Path | How | When you use it |
|---|---|---|
| **Live capture** | Stopwatch: start → (pause/resume) → stop → label it | You're at the machine and remember to press start |
| **Backfill** | Activity view: drag out a range (or a form) → label it | You forgot, or it happened away from the computer |

The stopwatch authors blocks; the **activity view** is where they're seen,
measured, and edited.

### The activity view is a metrics view, not a scheduling app

Not a Google Calendar rival — it's the readout on your stopwatch. It answers
"where did my week go", so charts are the point and the time grid is the
substrate:

- **Time per tag** over the selected range — sorted horizontal bars. The
  headline answer.
- **Daily trend** — one stacked bar per day, segments coloured by tag. Shows
  consistency and drift.
- **Day strip** — blocks drawn at their real wall-clock position, so you can see
  *when* in the day you actually work. This is also where you drag out a missed
  block to backfill it.
- Headline stats: total tracked, longest session, streak.

Range picker (day / week / month) drives all of them together.

### Consequence: the timer is not the model, the block is

A running stopwatch **is an unfinished block** — a row with no `ended_at`. It is
written to the database the moment you press start, not held in React state.
Closing the laptop, refreshing, or switching devices must not lose a session.

This also fixes the bug in README.md: the current timer decrements once per
`setInterval` tick and runs slow in a backgrounded tab. Deriving elapsed time
from a stored `started_at` makes that impossible by construction.

## Decisions (locked)

1. **Retrospective only.** Every block is a fact that happened. No planned or
   scheduled blocks, no "todo" state. Planning may be added later as a distinct
   kind; it is out of scope for v1 and the schema should not pre-contort for it.
2. **The stopwatch counts up, open-ended.** No target duration. You don't know
   in advance that you'll read for 36 minutes. The existing 50-minute countdown
   is retired.
3. **Exactly one tag per block.** A block *is* reading or *is* studying. This
   keeps per-tag totals summing to the hours actually lived — no double
   counting. Nuance goes in the free-text note, not in a second tag.
4. **Pause excludes time.** 09:00–10:00 with a 10-minute break is one block of
   50 minutes. One calendar entry, honest total.

## Tags

The vocabulary that turns "36 minutes at 2pm" into "you read 4h12m this week".

- User-owned. A handful of defaults (Reading, Studying, Work, Exercise, Admin)
  are seeded on sign-up, then fully editable — rename, recolour, delete.
- Users create their own freely.
- Each has a colour; that colour is what the calendar block is painted with.
- Deleting a tag must not delete history. Blocks fall back to unlabelled.
- Archive rather than delete for tags you've stopped using but have history for.

## Lifecycle of a live session

```
press start   → INSERT block (started_at = now, ended_at = null, tag = null)
press pause   → set paused_at = now
press resume  → paused_seconds += now - paused_at;  paused_at = null
press stop    → set ended_at = now; prompt "what was this?"
label it      → set tag_id, note
```

Elapsed at any moment = `now - started_at - paused_seconds - (currently paused ? now - paused_at : 0)`.

At most **one** running block per user, enforced in the database, not in the UI.

## Proposed schema

Following `.agents/skills/supabase-postgres-best-practices`: `bigint identity`
PKs, `text` over `varchar`, `timestamptz` throughout, RLS with the `auth.uid()`
call wrapped in a `select`, and every FK indexed.

```sql
create table public.tags (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now()
);

create unique index tags_user_name_key on public.tags (user_id, lower(name));

create table public.time_blocks (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  tag_id         bigint references public.tags (id) on delete set null,
  note           text,
  started_at     timestamptz not null,
  ended_at       timestamptz,            -- null => this is the running session
  paused_at      timestamptz,            -- non-null => currently paused
  paused_seconds integer not null default 0,
  source         text not null check (source in ('timer', 'manual')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint time_blocks_ends_after_start check (ended_at is null or ended_at > started_at),
  constraint time_blocks_paused_nonneg     check (paused_seconds >= 0),
  constraint time_blocks_pause_fits        check (
    ended_at is null
    or paused_seconds <= extract(epoch from ended_at - started_at)
  ),
  -- a backfilled block is complete by definition
  constraint time_blocks_manual_is_closed  check (source <> 'manual' or ended_at is not null)
);

-- the calendar's range query, and the "recent blocks" list
create index time_blocks_user_started_idx on public.time_blocks (user_id, started_at desc);
-- FK index, plus per-tag rollups
create index time_blocks_tag_idx on public.time_blocks (tag_id);
-- at most one running stopwatch per user
create unique index time_blocks_one_running_idx on public.time_blocks (user_id)
  where ended_at is null;
```

Both tables get `enable row level security` plus per-command policies of the
shape `(select auth.uid()) = user_id`. `user_id` is indexed as the leading
column of `time_blocks_user_started_idx` and of the tags unique index, so the
policy predicate is index-backed.

Duration is **derived, never stored** — `ended_at - started_at - paused_seconds`.
Storing it invites the two values disagreeing after an edit.

## Assumptions I'm making unless told otherwise

- **Overlapping blocks are allowed.** A hard database-level exclusion constraint
  would reject legitimate cases (you were on a call while commuting) and makes
  dragging a block in the calendar fail confusingly. The calendar will render
  overlaps side by side and can warn, but won't forbid.
- **Unlabelled blocks are legal.** If you stop the timer and dismiss the prompt,
  the block is kept with `tag_id = null` and surfaced for cleanup. Losing the
  time is worse than an untidy ledger.
- **Blocks may cross midnight.** Stored as one row, drawn on both days.
- **All times stored UTC (`timestamptz`), rendered in the browser's zone.** No
  per-user timezone setting in v1.

## Out of scope for v1

Recurring blocks, goals/targets per tag, sharing, external calendar import,
sub-tags or projects, team features.

## What this changes in the existing code

- `TimerProvider.tsx` — rewritten: count-up derived from a timestamp, backed by
  a database row, restores a running session on load.
- `dashboard/page.tsx` — the ring becomes elapsed-time; Start/Pause/Stop, and a
  labelling prompt on stop.
- New `/activity` route (grid + charts) and `/tags`, plus nav entries.
- The dashboard is currently public (`auth.guard.ts` was never wired up). Once
  blocks are persisted, the timer and activity view need a signed-in user.

## Tag colours are slots, not hexes

A tag stores a palette *slot* (`blue`, `orange`, …), and each theme resolves its
own step for that slot via `--series-*`. A single stored hex can't work: a
colour legible on the dark card is not legible on white, and a categorical
palette has to be selected per surface rather than flipped.

Eight hues, assigned in fixed order, never generated — a ninth tag reuses a
slot. Both step sets were checked with the dataviz palette validator against
this app's own surfaces (lightness band, chroma floor, colour-blind separation
of adjacent pairs, normal-vision separation, contrast). On light, three slots
fall under 3:1, so every mark using them carries a visible text label and the
activity view offers a table view — identity is never colour alone.

## Build order

1. ~~Migration: `tags` + `time_blocks`, RLS, default-tag seeding on sign-up.~~ ✓
2. ~~Data layer + require auth on the tracked routes.~~ ✓
3. ~~Stopwatch rewritten onto the DB row, with the label-on-stop prompt.~~ ✓
4. ~~Activity view: day strip + backfill.~~ ✓
5. ~~Charts: per-tag totals, daily trend, headline stats.~~ ✓
6. ~~Tag management (rename, recolour, archive).~~ ✓ `/tags`
7. ~~Editing an existing block (retag, adjust times).~~ ✓ From the session table
   or by clicking a block on the day strip.

That is v1. What is deliberately still missing: dragging a range out of the day
strip to backfill (the form does it, the drag doesn't), and an overnight
backfill — `AddBlockForm` takes one date, so a block crossing midnight can only
be *authored* by the stopwatch, though the editor can move one across a day
boundary after the fact.
