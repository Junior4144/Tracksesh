-- Tags store a palette SLOT, not a hex.
--
-- The original column held a literal hex, which cannot survive a theme toggle:
-- a colour legible on the dark card (#1a1d27) is not the same colour that is
-- legible on white, and a categorical palette has to be *selected* per surface
-- rather than flipped automatically. Storing the slot lets each theme resolve
-- its own step from the same hue (see --series-* in src/styles/globals.scss),
-- so a tag keeps its identity across themes while both stay readable.
--
-- The eight hues are fixed and assigned in order, never cycled or generated —
-- a 9th tag reuses a slot rather than inventing a hue. Both the light and dark
-- step sets were checked with the dataviz palette validator against this app's
-- own surfaces: lightness band, chroma floor, colour-blind separation of every
-- adjacent pair, normal-vision separation, and contrast.

alter table public.tags drop constraint tags_color_is_hex;

-- Remap the hexes seeded by the first migration onto their nearest slot.
-- Anything unrecognised falls back to slot 1 rather than failing the migration.
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

alter table public.tags
  add constraint tags_color_is_slot
  check (color in ('blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red'));

-- Reseed with slots, taken in canonical order.
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
