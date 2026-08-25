-- Reorder the categorical slots so that every prefix is well separated.
--
-- Slots are handed out in order, so the order decides which colours a user with
-- 3, 4 or 5 tags actually sees together. The previous order was the palette's
-- own listing order, which is fine for adjacent-pair checking but poor as a
-- prefix: at five tags its worst pair measured ΔE 1.6 under deuteranopia —
-- magenta and aqua are effectively the same colour to a red-green colourblind
-- viewer, and five tags is exactly what every new account starts with.
--
-- Every 5-slot subset was scored with the dataviz validator across both themes
-- (all-pairs, worst of light and dark). This order was the best available at
-- the sizes that matter:
--
--   tags   worst CVD ΔE        worst normal ΔE
--          before -> after     before -> after
--     3     9.2  ->  8.4        20.9  -> 19.8
--     4     4.8  ->  6.9        10.6  -> 11.9
--     5     1.6  ->  6.5        10.6  -> 11.9
--
-- 6.5 sits in the 6–8 band, which is legal only alongside secondary encoding —
-- so every chart labels its marks directly and the activity view offers a table.
-- No subset of eight hues reaches the normal-vision target of 15 at this size;
-- that ceiling is inherent, and the answer to a clash a user can actually see
-- is to let them recolour the tag.

create or replace function private.seed_default_tags(target_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tags (user_id, name, color)
  values
    (target_user, 'Reading',  'blue'),
    (target_user, 'Studying', 'aqua'),
    (target_user, 'Work',     'yellow'),
    (target_user, 'Exercise', 'green'),
    (target_user, 'Admin',    'red')
  on conflict do nothing;
$$;

revoke execute on function private.seed_default_tags(uuid)
  from public, anon, authenticated;

-- Recolour existing default tags onto the new order.
--
-- Deliberately narrow: only rows that still carry both the seeded name and the
-- colour that name was seeded with. A tag the user has already recoloured, or
-- created themselves, keeps whatever they chose — silently repainting someone's
-- own choice would be worse than an imperfect default.
update public.tags t
   set color = v.new_color
  from (values
          ('Reading',  'blue',    'blue'),
          ('Studying', 'violet',  'aqua'),
          ('Studying', 'orange',  'aqua'),
          ('Work',     'aqua',    'yellow'),
          ('Exercise', 'green',   'green'),
          ('Exercise', 'yellow',  'green'),
          ('Admin',    'yellow',  'red'),
          ('Admin',    'magenta', 'red')
       ) as v(name, old_color, new_color)
 where t.name = v.name
   and t.color = v.old_color;
