-- Expose the database clock so the browser can correct for skew.
--
-- Session timestamps are written server-side (clock_timestamp()), but the
-- running timer's elapsed value was being computed in the browser as
-- Date.now() - started_at. That subtracts two different clocks: on a machine
-- whose clock sat ~113s ahead of the database, pressing start displayed 1:52
-- instead of 00:00.
--
-- With this, the client measures the offset once (round-trip midpoint) and
-- ticks against a corrected clock, so the display is right no matter how far
-- the local clock has drifted. The stored data was always correct — this only
-- ever affected what was on screen.
--
-- Safe to leave callable by anon: it discloses nothing but the time, which any
-- HTTP Date header would give away anyway.

create or replace function public.server_now()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select clock_timestamp();
$$;

grant execute on function public.server_now() to anon, authenticated;
