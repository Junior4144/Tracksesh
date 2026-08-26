alter table public.tags drop constraint if exists tags_color_is_hex;

update public.tags
   set color = case color
                 when '#5b8def' then 'blue'
                 when '#8b5cf6' then 'violet'
                 when '#0ea5e9' then 'aqua'
                 when '#22c55e' then 'green'
                 when '#f59e0b' then 'yellow'
                 when '#ef4444' then 'red'
                 when '#ec4899' then 'magenta'
                 when '#14b8a6' then 'aqua'
                 else 'blue'
               end
 where color like '#%';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tags_color_is_slot'
  ) then
    alter table public.tags
      add constraint tags_color_is_slot
      check (color in ('blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'));
  end if;
end $$;

create or replace function private.seed_default_tags(target_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tags (user_id, name, color)
  values
    (target_user, 'Reading',  'blue'),
    (target_user, 'Studying', 'orange'),
    (target_user, 'Work',     'aqua'),
    (target_user, 'Exercise', 'yellow'),
    (target_user, 'Admin',    'magenta')
  on conflict do nothing;
$$;

revoke execute on function private.seed_default_tags(uuid)
  from public, anon, authenticated;