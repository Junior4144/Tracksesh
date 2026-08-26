-- How much history each tag carries, for the tag management view.
--
-- This exists to make "archive or delete?" an informed choice. Deleting a tag
-- doesn't delete history (tag_id is ON DELETE SET NULL), but it does silently
-- unlabel every block that used it, and that is not recoverable — so the
-- confirmation has to be able to say how many blocks are about to lose their
-- label.
--
-- An RPC rather than a client-side count: counting in the browser means
-- fetching every block the user has ever recorded just to group them, which
-- grows without bound. This aggregates in the database and returns one row
-- per tag.
--
-- SECURITY INVOKER (the default), so RLS still applies and the caller can only
-- ever aggregate their own blocks. The user_id predicate below is there to help
-- the planner use time_blocks_user_started_idx, not to enforce anything.

create or replace function public.tag_usage()
returns table (tag_id bigint, block_count bigint, total_seconds bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.tag_id,
         count(*)::bigint,
         -- Same derivation the UI uses: span minus pauses, never stored.
         -- greatest(..., 0) because a hand-edited block could in principle be
         -- shortened to less than its accumulated pause.
         coalesce(
           sum(
             greatest(
               floor(extract(epoch from (b.ended_at - b.started_at)))::bigint - b.paused_seconds,
               0
             )
           ),
           0
         )::bigint
    from public.time_blocks b
   where b.user_id = (select auth.uid())
     and b.tag_id is not null
     and b.ended_at is not null   -- the running session has no duration yet
   group by b.tag_id;
$$;

revoke execute on function public.tag_usage() from anon;
grant execute on function public.tag_usage() to authenticated;
