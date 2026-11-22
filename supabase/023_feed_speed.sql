-- 023: the feed and notifications stay fast with thousands of members.
-- Measured with a made-up club of 3,000 members (dev/sql/load.mjs): the club and following feeds walked every activity on
-- the site in time order, running the visibility check on each, and comment counts had no index.
-- The feed now works out whose activities can appear (you and your club-mates, a club's members, or the people you follow),
-- reads only their recent activities through the (owner, start_time) index, and looks further back only if the page isn't
-- full. The visibility rules are the same expressions as before. Same columns as 021.
-- Club leaderboards check visibility once per member instead of once per activity, and the "replied after you" part of
-- notifications starts from the activities you've commented on. The owner dashboard's daily chart groups each table once.

create index if not exists activities_public_time on public.activities (start_time desc) where visibility = 'public';
create index if not exists club_members_user on public.club_members (user_id, status);
create index if not exists comments_activity on public.comments (activity_id, created_at);
create index if not exists comments_author on public.comments (author, created_at);
create index if not exists relay_legs_activity on public.relay_legs (activity_id);
create index if not exists activities_created on public.activities (created_at);
create index if not exists sync_inbox_activity on public.sync_inbox (activity_id);

create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20, club uuid default null, person uuid default null)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean, is_race boolean, avatar text, relay jsonb, handle text, num int, device text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  n int := least(coalesce(lim, 50), 50);
  who uuid[];
  ids uuid[];
  span interval := interval '7 days';
  lo timestamptz;
  anchor timestamptz := least(before, now() + interval '2 days');   -- windows count back from here ('infinity' means "newest")
begin
  if scope = 'everyone' then
    ids := array(select a.id from activities a
                 where a.visibility = 'public' and a.start_time < before and a.owner <> auth.uid() and public.can_view_activity(a.id)
                 order by a.start_time desc limit n);
  else
    who := case scope
      when 'me' then array[auth.uid()]
      when 'athlete' then array[person]
      when 'following' then array(select f.followee from follows f where f.follower = auth.uid() and f.status = 'accepted')
      else case when club is null
             then array(select auth.uid() union select m2.user_id from club_members m1 join club_members m2 on m2.club_id = m1.club_id
                         where m1.user_id = auth.uid() and m1.status = 'active' and m2.status = 'active')
             else array(select m.user_id from club_members m where m.club_id = club and m.status = 'active') end
    end;
    loop   -- a week back, then 4 weeks, 16 weeks... until the page is full or there's nothing older
      lo := anchor - span;
      ids := array(select a.id from activities a
                   where a.owner = any(who) and a.start_time < before and a.start_time >= lo
                     and case scope
               when 'me' then a.owner = auth.uid()
               when 'athlete' then a.owner = person and (a.owner = auth.uid() or public.can_view_activity(a.id))
               when 'following' then public.is_following(auth.uid(), a.owner) and public.can_view_activity(a.id)
               when 'everyone' then false
               else (case when club is null then a.owner = auth.uid() or public.shares_club(a.owner, auth.uid())
                          else public.is_club_member(club) and exists (select 1 from club_members m where m.club_id = club and m.user_id = a.owner and m.status = 'active') end)
                    and public.can_view_activity(a.id)
             end
                   order by a.start_time desc limit n);
      exit when cardinality(ids) >= n
             or not exists (select 1 from activities a where a.owner = any(who) and a.start_time < lo);
      span := span * 4;
    end loop;
  end if;
  return query
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
  where a.id = any(ids)
  order by a.start_time desc;
end
$$;
revoke execute on function public.feed(text, timestamptz, int, uuid, uuid) from public, anon;
grant execute on function public.feed(text, timestamptz, int, uuid, uuid) to authenticated;

create or replace function public.club_leaderboard(p_club uuid, p_from timestamptz, p_to timestamptz, p_sport text default 'all')
returns table (user_id uuid, name text, handle text, avatar text, n int, dist numeric, secs numeric, elev numeric)
language sql stable security definer set search_path = public as $$
  with mem as (select m.user_id from club_members m where m.club_id = p_club and m.status = 'active'),
  -- 023: can_view_activity() worked out once per member rather than once per activity (same rules: see 010_social.sql)
  rel as (
    select mem.user_id, mem.user_id = auth.uid() me, public.audience_ok(mem.user_id, auth.uid()) aud,
           public.shares_club(mem.user_id, auth.uid()) sc, public.is_following(auth.uid(), mem.user_id) fo
    from mem
  ),
  acts as (
    select a.* from activities a join rel on rel.user_id = a.owner
    where a.start_time >= p_from and a.start_time < p_to and a.visibility <> 'private'   -- private activities never count
      and (rel.me or (rel.aud and (a.visibility = 'public' or (a.visibility = 'club' and rel.sc)
                                   or (a.visibility = 'followers' and (rel.fo or rel.sc)))))
  ),
  legs as (
    select a.owner, a.id, a.sport sp, a.distance_m d, coalesce(a.moving_s, a.elapsed_s) t, coalesce(a.ascent_m, 0) e from acts a where a.sport in ('swim', 'bike', 'run')
    union all
    select a.owner, a.id, s.sport, s.distance_m, s.elapsed_s, coalesce(s.ascent_m, 0) from acts a join activity_sections s on s.activity_id = a.id
    where a.sport = 'multi' and s.sport in ('swim', 'bike', 'run')
  )
  select p.id, p.display_name, p.handle, p.avatar_path, count(distinct l.id)::int, coalesce(sum(l.d), 0), coalesce(sum(l.t), 0), coalesce(sum(l.e), 0)
  from mem join profiles p on p.id = mem.user_id
  left join legs l on l.owner = mem.user_id and (p_sport = 'all' or l.sp = p_sport)
  where public.is_club_member(p_club)
  group by p.id, p.display_name, p.handle, p.avatar_path;
$$;
revoke execute on function public.club_leaderboard(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.club_leaderboard(uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.my_notifications(lim int default 40)
returns table (kind text, at timestamptz, actor uuid, actor_name text, actor_handle text, actor_avatar text,
               activity_id uuid, activity_name text, club_id uuid, club_name text, relay_id uuid, body text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() id), since as (select now() - interval '60 days' t),
  n as (
    select 'kudos' kind, k.created_at at, k.user_id actor, a.id activity_id, a.name activity_name, null::uuid club_id, null::text club_name, null::uuid relay_id, null::text body
      from kudos k join activities a on a.id = k.activity_id where a.owner = (select id from me) and k.user_id <> a.owner and k.created_at > (select t from since)
    union all
    select 'comment', c.created_at, c.author, a.id, a.name, null, null, null, left(c.body, 140)
      from comments c join activities a on a.id = c.activity_id where a.owner = (select id from me) and c.author <> a.owner and c.created_at > (select t from since)
    union all
    select 'reply', c.created_at, c.author, a.id, a.name, null, null, null, left(c.body, 140)   -- 023: from the activities you've commented on
      from (select distinct mc.activity_id from comments mc where mc.author = (select id from me)) mine_acts
      join activities a on a.id = mine_acts.activity_id
      join comments c on c.activity_id = a.id
      where a.owner <> (select id from me) and c.author <> (select id from me) and c.created_at > (select t from since) and public.can_view_activity(a.id)
        and exists (select 1 from comments mine where mine.activity_id = a.id and mine.author = (select id from me) and mine.created_at < c.created_at)
    union all
    select case when f.status = 'pending' then 'follow_request' else 'follow' end, f.created_at, f.follower, null, null, null, null, null, null
      from follows f where f.followee = (select id from me) and f.created_at > (select t from since)
    union all
    select 'relay_invite', l.created_at, l.invited_by, null, null, null, r.name, l.relay_id, null
      from relay_legs l join relays r on r.id = l.relay_id where l.owner = (select id from me) and l.status = 'pending' and l.invited_by is not null
    union all
    select 'club_request', m.joined_at, m.user_id, null, null, c.id, c.name, null, null
      from club_members m join clubs c on c.id = m.club_id
      where m.status = 'pending' and exists (select 1 from club_members x where x.club_id = c.id and x.user_id = (select id from me) and x.status = 'active' and x.role in ('owner','admin'))
    union all
    select 'club_post', p.created_at, p.author, null, null, c.id, c.name, null, left(p.body, 140)
      from club_posts p join clubs c on c.id = p.club_id
      where p.author <> (select id from me) and p.created_at > (select t from since) and public.is_club_member(c.id)
    union all   -- admins: new feedback
    select 'feedback_' || fb.kind, fb.created_at, fb.user_id, null, null, null, null, null, left(fb.body, 140)
      from feedback fb where public.is_admin() and fb.user_id <> (select id from me) and fb.status = 'new' and fb.created_at > (select t from since)
    union all   -- the sender: their feedback's status changed
    select 'feedback_status', fb.status_at, null, null, null, null, fb.status, null, left(fb.body, 140)
      from feedback fb where fb.user_id = (select id from me) and fb.status_at is not null and fb.status <> 'new' and fb.status_at > (select t from since)
  )
  select n.kind, n.at, n.actor, pr.display_name, pr.handle, pr.avatar_path, n.activity_id, n.activity_name, n.club_id, n.club_name, n.relay_id, n.body
  from n left join profiles pr on pr.id = n.actor
  order by n.at desc limit least(lim, 100);
$$;
revoke execute on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;

create or replace function public.admin_stats(days int default 90) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date := (now() at time zone 'utc')::date - greatest(7, least(days, 730)) + 1; today date := (now() at time zone 'utc')::date; r jsonb;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  with dd as (select generate_series(d0, today, '1 day')::date as day)
  select jsonb_build_object(
    'from', d0, 'to', today,
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles),
      'users_new', (select count(*) from profiles where created_at::date >= d0),
      'active_1', (select count(*) from user_days where day = today),
      'active_7', (select count(distinct user_id) from user_days where day > today - 7),
      'active_30', (select count(distinct user_id) from user_days where day > today - 30),
      'activities', (select count(*) from activities),
      'activities_new', (select count(*) from activities where created_at::date >= d0),
      'multisport', (select count(*) from activities where sport = 'multi'),
      'synced_users', (select count(distinct owner) from sync_inbox),
      'clubs', (select count(*) from clubs),
      'follows', (select count(*) from follows where status = 'accepted'),
      'relays', (select count(*) from relays),
      'kudos', (select count(*) from kudos), 'comments', (select count(*) from comments),
      'feedback_open', (select count(*) from feedback where status in ('new','seen','planned')),
      'feedback_new', (select count(*) from feedback where status = 'new'),
      'visitors', (select coalesce(sum(n), 0) from page_views where day >= d0)),
    'daily', (select jsonb_agg(jsonb_build_object('day', dd.day,   -- 023: each table grouped by day once, not counted per day
        'signups', coalesce(su.n, 0), 'active', coalesce(ac.n, 0), 'uploads', coalesce(ua.uploads, 0), 'synced', coalesce(sy.n, 0),
        'manual', coalesce(ua.manual, 0), 'views', coalesce(vw.v, '{}'::jsonb)) order by dd.day)
      from dd
      left join (select p.created_at::date d, count(*) n from profiles p where p.created_at >= (d0 - 1)::timestamptz group by 1) su on su.d = dd.day
      left join (select u.day d, count(*) n from user_days u where u.day >= d0 group by 1) ac on ac.d = dd.day
      left join (select a.created_at::date d,
                        count(*) filter (where a.source <> 'manual' and not exists (select 1 from sync_inbox s where s.activity_id = a.id)) uploads,
                        count(*) filter (where a.source = 'manual') manual
                   from activities a where a.created_at >= (d0 - 1)::timestamptz group by 1) ua on ua.d = dd.day
      left join (select s.created_at::date d, count(*) n from sync_inbox s where s.status = 'done' and s.created_at >= (d0 - 1)::timestamptz group by 1) sy on sy.d = dd.day
      left join (select v.day d, jsonb_object_agg(v.page, v.n) v from page_views v where v.day >= d0 group by 1) vw on vw.d = dd.day),
    'sports', (select coalesce(jsonb_object_agg(sport, n), '{}'::jsonb) from (select sport, count(*) n from activities group by sport) s),
    'profiles', (select coalesce(jsonb_object_agg(multisport_profile, n), '{}'::jsonb) from (select multisport_profile, count(*) n from activities where sport = 'multi' group by 1) s),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(device, ''), 'Unknown') device, count(*) n from activities group by 1 order by 2 desc limit 10) s),
    'per_user', (select jsonb_build_object('median', percentile_cont(.5) within group (order by n), 'max', max(n)) from (select count(*) n from activities group by owner) s),
    'recent', (select coalesce(jsonb_agg(x order by x->>'joined' desc), '[]'::jsonb) from (select jsonb_build_object('id', p.id, 'name', p.display_name, 'handle', p.handle, 'email', u.email, 'joined', p.created_at,
        'activities', (select count(*) from activities a where a.owner = p.id), 'last_seen', (select max(day) from user_days ud where ud.user_id = p.id),
        'synced', exists (select 1 from sync_inbox s where s.owner = p.id)) x from profiles p join auth.users u on u.id = p.id order by p.created_at desc limit 50) s),
    'feedback', (select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (select jsonb_build_object('id', f.id, 'kind', f.kind, 'body', f.body, 'page', f.page, 'app_build', f.app_build, 'user_agent', f.user_agent, 'screen', f.screen,
        'status', f.status, 'admin_note', f.admin_note, 'created_at', f.created_at, 'name', p.display_name, 'handle', p.handle) x from feedback f left join profiles p on p.id = f.user_id order by f.created_at desc limit 300) s)
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;
