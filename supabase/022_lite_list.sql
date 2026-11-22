-- 022: a lighter activity list at sign-in.
-- The app loads every activity you own when you sign in. Each one carried its map track (about 3 KB of JSON),
-- which is 80% of the download. summary_lite is the same summary without the track, plus its first point
-- (`start`, used for race history and weather) and `hasTrack`. The activity page still reads the full row.
-- PostgREST exposes it as a computed column: select=...,summary:summary_lite

create or replace function public.summary_lite(a public.activities)
returns jsonb language sql stable set search_path = public as $$
  select case when a.summary is null then null
              when not (a.summary ? 'track') then a.summary
              else (a.summary - 'track') || jsonb_build_object('start', a.summary->'track'->0, 'hasTrack', true) end
$$;
grant execute on function public.summary_lite(public.activities) to authenticated;

-- Add keys to an activity's summary on the server, so a list row (which has no track) never writes a summary back whole.
create or replace function public.merge_summary(aid uuid, patch jsonb)
returns void language sql security invoker set search_path = public as $$
  update activities set summary = coalesce(summary, '{}'::jsonb) || patch
   where id = aid and owner = auth.uid();
$$;
revoke execute on function public.merge_summary(uuid, jsonb) from public, anon;
grant execute on function public.merge_summary(uuid, jsonb) to authenticated;
