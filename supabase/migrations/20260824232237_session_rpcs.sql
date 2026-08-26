-- Server-authoritative stopwatch operations, plus tightening anon privileges.

-- ---------------------------------------------------------------------------
-- Take table privileges away from anon.
--
-- The project's Data API settings granted these automatically. RLS already
-- returns zero rows to an unauthenticated caller, but that leaves RLS as the
-- only thing standing between anon and per-user data. With the grant removed,
-- unauthenticated access fails at the privilege layer — loudly, and one step
-- earlier.
-- ---------------------------------------------------------------------------

revoke all on public.tags from anon;
revoke all on public.time_blocks from anon;

-- ---------------------------------------------------------------------------
-- Session RPCs
--
-- Why these exist rather than plain PostgREST writes from the browser:
--
--   1. Time comes from Postgres, not the browser. A skewed client clock would
--      otherwise place blocks at the wrong wall-clock time on the activity view.
--      Note clock_timestamp(), not now(): now() is transaction start time and
--      is frozen for the whole transaction, so a start and a stop occurring in
--      one transaction would produce a zero-length block. clock_timestamp()
--      advances, which is what a stopwatch actually needs.
--   2. Resuming accumulates paused_seconds in a single atomic UPDATE. Doing it
--      client-side means read-modify-write, which loses time if two tabs race.
--   3. "The running session" is identified by the database, so the client can
--      never pause or stop a block that isn't actually the live one.
--
-- All are SECURITY INVOKER (the default): they run as the caller, so RLS still
-- applies and each one is confined to the caller's own rows. That is also why
-- Postgres' default EXECUTE-to-PUBLIC grant is harmless here — an anon caller
-- has a null auth.uid() and matches nothing.
--
-- Each returns the affected row, or null when there was nothing to act on
-- (e.g. pausing with no session running).
-- ---------------------------------------------------------------------------

create or replace function public.start_session()
returns public.time_blocks
language sql
security invoker
set search_path = ''
as $$
  insert into public.time_blocks (user_id, started_at, source)
  values ((select auth.uid()), clock_timestamp(), 'timer')
  returning *;
$$;

create or replace function public.pause_session()
returns public.time_blocks
language sql
security invoker
set search_path = ''
as $$
  update public.time_blocks
     set paused_at = clock_timestamp()
   where user_id = (select auth.uid())
     and ended_at is null
     and paused_at is null
  returning *;
$$;

create or replace function public.resume_session()
returns public.time_blocks
language sql
security invoker
set search_path = ''
as $$
  update public.time_blocks
     set paused_seconds = paused_seconds
                        + floor(extract(epoch from clock_timestamp() - paused_at))::int,
         paused_at      = null
   where user_id = (select auth.uid())
     and ended_at is null
     and paused_at is not null
  returning *;
$$;

-- Stopping while paused folds the open pause into the total first, so the
-- break never counts as worked time.
create or replace function public.stop_session()
returns public.time_blocks
language sql
security invoker
set search_path = ''
as $$
  update public.time_blocks
     set ended_at       = clock_timestamp(),
         paused_seconds = paused_seconds
                        + case
                            when paused_at is null then 0
                            else floor(extract(epoch from clock_timestamp() - paused_at))::int
                          end,
         paused_at      = null
   where user_id = (select auth.uid())
     and ended_at is null
  returning *;
$$;

revoke execute on function public.start_session()  from anon;
revoke execute on function public.pause_session()  from anon;
revoke execute on function public.resume_session() from anon;
revoke execute on function public.stop_session()   from anon;

grant execute on function public.start_session()  to authenticated;
grant execute on function public.pause_session()  to authenticated;
grant execute on function public.resume_session() to authenticated;
grant execute on function public.stop_session()   to authenticated;
