-- Tracksesh core schema: tags + time_blocks.
-- Domain model this implements: docs/DOMAIN.md
--
-- One core object: a labelled time block (start, end, exactly one tag).
-- A running stopwatch IS a block with ended_at = null.

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------

create table public.tags (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  color       text not null,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),

  constraint tags_name_not_blank check (length(btrim(name)) between 1 and 40),
  constraint tags_color_is_hex   check (color ~ '^#[0-9a-fA-F]{6}$')
);

-- Case-insensitive uniqueness per user: no "Reading" alongside "reading".
-- Also serves as the index backing the RLS predicate on user_id.
create unique index tags_user_name_key on public.tags (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- time_blocks
-- ---------------------------------------------------------------------------

create table public.time_blocks (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Deleting a tag must never delete history; the block falls back to unlabelled.
  tag_id         bigint references public.tags (id) on delete set null,
  note           text,
  started_at     timestamptz not null,
  ended_at       timestamptz,             -- null => this is the running session
  paused_at      timestamptz,             -- non-null => currently paused
  paused_seconds integer not null default 0,
  source         text not null check (source in ('timer', 'manual')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint time_blocks_ends_after_start check (ended_at is null or ended_at > started_at),
  constraint time_blocks_paused_nonneg    check (paused_seconds >= 0),

  -- Can't be mid-pause on a block that has already finished.
  constraint time_blocks_not_paused_when_done check (ended_at is null or paused_at is null),

  -- Paused time can't exceed the wall-clock span it sits inside.
  constraint time_blocks_pause_fits check (
    ended_at is null
    or paused_seconds <= extract(epoch from ended_at - started_at)
  ),

  -- A backfilled block is complete by definition, and was never paused.
  constraint time_blocks_manual_is_closed check (
    source <> 'manual'
    or (ended_at is not null and paused_at is null and paused_seconds = 0)
  ),

  constraint time_blocks_note_len check (note is null or length(note) <= 500)
);

-- The activity view's range query, and the "recent blocks" list.
-- Leading user_id also backs the RLS predicate.
create index time_blocks_user_started_idx on public.time_blocks (user_id, started_at desc);

-- FK index (Postgres does not create these automatically) + per-tag rollups.
create index time_blocks_tag_idx on public.time_blocks (tag_id);

-- At most one running stopwatch per user, enforced by the database rather
-- than hoped for by the UI.
create unique index time_blocks_one_running_idx on public.time_blocks (user_id)
  where ended_at is null;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

-- SECURITY INVOKER (the default): this only touches the row already being
-- written, so it needs no elevated privilege.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger time_blocks_set_updated_at
  before update on public.time_blocks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- `to authenticated` alone is authentication without authorization — it checks
-- the role, not the row. Every policy pairs it with an ownership predicate.
-- auth.uid() is wrapped in a select so it is evaluated once per query rather
-- than once per row.
-- ---------------------------------------------------------------------------

alter table public.tags enable row level security;
alter table public.time_blocks enable row level security;

create policy tags_select_own on public.tags
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy tags_insert_own on public.tags
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- UPDATE needs both USING and WITH CHECK: without WITH CHECK a user could
-- reassign the row's user_id and hand their data to someone else.
create policy tags_update_own on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy tags_delete_own on public.tags
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy time_blocks_select_own on public.time_blocks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy time_blocks_insert_own on public.time_blocks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy time_blocks_update_own on public.time_blocks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy time_blocks_delete_own on public.time_blocks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Data API exposure
--
-- Separate concern from RLS: RLS decides which rows are visible once the table
-- is reachable at all. Depending on the project's Data API settings, tables
-- created via SQL are not always granted to the API roles. Explicit and
-- idempotent. anon gets nothing — everything here is per-user data.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.tags to authenticated;
grant select, insert, update, delete on public.time_blocks to authenticated;
grant usage, select on sequence public.tags_id_seq to authenticated;
grant usage, select on sequence public.time_blocks_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Default tags for new users
--
-- Lives in a private schema, not public: Postgres grants EXECUTE to PUBLIC on
-- every new function, so a SECURITY DEFINER function in public would be a
-- public endpoint callable by anon and authenticated. SECURITY DEFINER is
-- genuinely required here — the trigger runs as the auth admin during sign-up
-- and must write rows into an RLS-protected table.
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.seed_default_tags(target_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tags (user_id, name, color)
  values
    (target_user, 'Reading',  '#5b8def'),
    (target_user, 'Studying', '#8b5cf6'),
    (target_user, 'Work',     '#0ea5e9'),
    (target_user, 'Exercise', '#22c55e'),
    (target_user, 'Admin',    '#f59e0b')
  on conflict do nothing;
$$;

revoke execute on function private.seed_default_tags(uuid)
  from public, anon, authenticated;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_default_tags(new.id);
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill: existing accounts (e.g. the demo user) never fired the trigger.
select private.seed_default_tags(id) from auth.users;
