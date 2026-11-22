-- 024: reserve more usernames that are (or will be) site addresses: /videos, /media, and /connect/... for
-- signing in with intervals.icu. triven.fit/<username> is a profile, so these could never be reached as profiles.
create or replace function public.handle_ok(h text) returns boolean
language sql immutable set search_path = public as $$
  select h ~ '^[a-z0-9][a-z0-9_-]{2,29}$' and h !~ '^[0-9]+$'
     and h not in ('about','admin','api','app','activities','activity','assets','auth','blog','club','clubs','connect','dev','everyone','feed','gear',
                   'hello','help','home','img','index','join','js','log','login','logout','me','media','noreply','null','offline','official','people',
                   'privacy','relay','relays','reset','root','search','settings','signin','signup','staff','static','support','system','team',
                   'terms','triven','undefined','upload','user','users','video','videos','www');
$$;
