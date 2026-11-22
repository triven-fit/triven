-- 021: the feed returns each activity's recording device, so cards can show "Garmin <model>" as Garmin's API brand
-- guidelines require for Garmin-recorded data (intervals.icu's API terms pass this on). Same function as 012 plus `device`.
drop function if exists public.feed(text, timestamptz, int, uuid, uuid);
create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20, club uuid default null, person uuid default null)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean, is_race boolean, avatar text, relay jsonb, handle text, num int, device text)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner, p.display_name, a.name,
         case when a.owner = auth.uid() or (a.share->>'description')::boolean then a.description end,
         a.sport, a.multisport_profile, a.start_time, a.utc_offset_min,
         a.distance_m, a.elapsed_s, a.moving_s, a.ascent_m,
         case when a.owner = auth.uid() or (a.share->>'hr')::boolean then a.avg_hr end,
         (select coalesce(jsonb_agg(jsonb_build_object('sport',s.sport,'elapsed_s',s.elapsed_s,'distance_m',s.distance_m,'env',s.summary->>'env') order by s.idx),'[]'::jsonb)
            from activity_sections s where s.activity_id = a.id),
         a.share, a.visibility,
         case when a.owner = auth.uid() or (a.share->>'map')::boolean then a.summary->'track' end,
         case when a.owner = auth.uid() then a.summary->'driving' end,
         (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'path',m.path,'kind',m.kind,'width',m.width,'height',m.height) order by m.position, m.created_at),'[]'::jsonb)
            from activity_media m where m.activity_id = a.id),
         (select count(*)::int from kudos k where k.activity_id = a.id),
         (select count(*)::int from comments c where c.activity_id = a.id),
         exists (select 1 from kudos k where k.activity_id = a.id and k.user_id = auth.uid()),
         a.is_race, p.avatar_path,
         (select public.relay_json(l.relay_id, true) from relay_legs l
            where l.activity_id = a.id and l.status = 'accepted'
              and (select count(*) from relay_legs l2 where l2.relay_id = l.relay_id and l2.status = 'accepted') >= 2),
         p.handle, a.num, a.device
  from activities a join profiles p on p.id = a.owner
  where a.start_time < before
    and case scope
          when 'me' then a.owner = auth.uid()
          when 'athlete' then a.owner = person and (a.owner = auth.uid() or public.can_view_activity(a.id))
          when 'following' then public.is_following(auth.uid(), a.owner) and public.can_view_activity(a.id)
          when 'everyone' then a.owner <> auth.uid() and a.visibility = 'public' and public.can_view_activity(a.id)
          else (case when club is null then a.owner = auth.uid() or public.shares_club(a.owner, auth.uid())
                     else public.is_club_member(club) and exists (select 1 from club_members m where m.club_id = club and m.user_id = a.owner and m.status = 'active') end)
               and public.can_view_activity(a.id)
        end
  order by a.start_time desc
  limit least(lim, 50);
$$;
revoke execute on function public.feed(text, timestamptz, int, uuid, uuid) from public, anon;
grant execute on function public.feed(text, timestamptz, int, uuid, uuid) to authenticated;
