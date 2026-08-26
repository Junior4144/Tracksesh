-- Let a user delete their own account.
--
-- Deleting a row from auth.users needs privileges the `authenticated` role
-- does not have, and this project is publishable-key only by design — there is
-- no server-side secret key to call the admin API with. So the deletion has to
-- happen inside the database, as a definer function.
--
-- SECURITY DEFINER is the part to be careful about, so, explicitly:
--
--   * The function takes no arguments. There is nothing for a caller to point
--     it at — the row it deletes is `auth.uid()` and nothing else, so the
--     ownership check isn't a predicate someone could tamper with, it's the
--     entire body.
--   * An unauthenticated caller has a null auth.uid(), so `where id = null`
--     matches no rows. It cannot be used to enumerate or delete anything.
--   * It has to live in `public` to be reachable as a PostgREST RPC, which
--     means Postgres grants EXECUTE to PUBLIC on creation. That is revoked
--     below, so only `authenticated` can call it.
--   * search_path is pinned empty and every name is schema-qualified, so a
--     caller-controlled search_path can't redirect the delete somewhere else.
--
-- public.tags and public.time_blocks both reference auth.users ON DELETE
-- CASCADE, so the ledger goes with the account. That is the intent: this is the
-- "forget me" button, not an archive.
--
-- Caveat the UI has to handle: deleting a user does NOT invalidate access
-- tokens that were already issued. The client signs out immediately after
-- calling this so the dead session doesn't linger in the browser.

create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
