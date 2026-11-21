-- 020: sync that scales. Instead of one run every 10 minutes checking every connection in turn, a run every minute
-- claims a batch of connections that are due, and each connection carries its own next check time:
--   * new files found just now ......................... again in 15 minutes
--   * member opened the app in the last 3 days ......... every 30 minutes
--   * opened it in the last 30 days .................... every 2 hours
--   * longer ago ....................................... every 12 hours
--   * errors back off (30 min, 1 h, 2 h ... up to 12 h); a refused key waits a day
-- The app also checks straight away when you open it (if it's been 10 minutes), so active members never wait on this.
-- A short lease stops two overlapping runs claiming the same connection or the same inbox file.

alter table public.connections add column if not exists next_check_at timestamptz not null default now();
alter table public.connections add column if not exists lease_until timestamptz;
alter table public.connections add column if not exists fail_count int not null default 0;
create index if not exists connections_due on public.connections (next_check_at) where provider = 'intervals';
alter table public.sync_inbox add column if not exists lease_until timestamptz;
create index if not exists sync_inbox_waiting on public.sync_inbox (created_at) where status = 'new';

-- server only: claim up to n connections that are due
create or replace function public.sync_claim_connections(n int default 60, lease_s int default 300)
returns table (owner uuid, athlete_id text, last_sync timestamptz, created_at timestamptz)
language sql volatile security definer set search_path = public as $$
  update connections c set lease_until = now() + make_interval(secs => lease_s)
  where (c.owner, c.provider) in (
    select x.owner, x.provider from connections x
    where x.provider = 'intervals' and x.next_check_at <= now() and coalesce(x.lease_until, '-infinity') < now()
      and exists (select 1 from connection_secrets s where s.owner = x.owner and s.provider = x.provider)
    order by x.next_check_at limit greatest(1, least(n, 500))
    for update skip locked)
  returning c.owner, c.athlete_id, c.last_sync, c.created_at;
$$;

-- server only: record how a check went and when to look again
create or replace function public.sync_reschedule(p_owner uuid, p_ok boolean, p_added int default 0, p_more boolean default false, p_error text default null, p_auth_failed boolean default false)
returns timestamptz language plpgsql volatile security definer set search_path = public as $$
declare seen date; fails int; nxt timestamptz;
begin
  select max(day) into seen from user_days where user_id = p_owner;
  if p_ok then
    nxt := now() + case
      when p_more then interval '1 minute'                                   -- more files waiting from this check
      when p_added > 0 then interval '15 minutes'
      when seen >= (now() at time zone 'utc')::date - 3 then interval '30 minutes'
      when seen >= (now() at time zone 'utc')::date - 30 then interval '2 hours'
      else interval '12 hours' end;
    -- with more files still waiting, keep the old "since" date so the next check still lists them
    update connections set next_check_at = nxt, lease_until = null, fail_count = 0, status = 'ok', last_error = null,
           last_sync = case when p_more then last_sync else now() end
      where owner = p_owner and provider = 'intervals';
  else
    select fail_count + 1 into fails from connections where owner = p_owner and provider = 'intervals';
    nxt := now() + case when p_auth_failed then interval '1 day'
                        else least(interval '12 hours', interval '30 minutes' * power(2, greatest(0, coalesce(fails, 1) - 1))) end;
    update connections set next_check_at = nxt, lease_until = null, fail_count = coalesce(fails, 1), status = 'error', last_error = p_error, last_sync = now()
      where owner = p_owner and provider = 'intervals';
  end if;
  return nxt;
end $$;

-- server only: claim up to n waiting files to import
create or replace function public.sync_claim_inbox(n int default 30, lease_s int default 240)
returns table (id uuid) language sql volatile security definer set search_path = public as $$
  update sync_inbox i set lease_until = now() + make_interval(secs => lease_s)
  where i.id in (select x.id from sync_inbox x where x.status = 'new' and x.attempts < 3 and coalesce(x.lease_until, '-infinity') < now()
                 order by x.created_at limit greatest(1, least(n, 200)) for update skip locked)
  returning i.id;
$$;

revoke execute on function public.sync_claim_connections(int, int) from public, anon, authenticated;
revoke execute on function public.sync_reschedule(uuid, boolean, int, boolean, text, boolean) from public, anon, authenticated;
revoke execute on function public.sync_claim_inbox(int, int) from public, anon, authenticated;
grant execute on function public.sync_claim_connections(int, int) to service_role;
grant execute on function public.sync_reschedule(uuid, boolean, int, boolean, text, boolean) to service_role;
grant execute on function public.sync_claim_inbox(int, int) to service_role;

-- connecting (or reconnecting with a new key) makes the connection due straight away and clears old errors
create or replace function public.connect_intervals(p_athlete text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into connections(owner, provider, athlete_id, status, last_error) values (auth.uid(), 'intervals', trim(p_athlete), 'ok', null)
    on conflict (owner, provider) do update set athlete_id = excluded.athlete_id, status = 'ok', last_error = null, next_check_at = now(), fail_count = 0, lease_until = null;
  insert into connection_secrets(owner, provider, secret) values (auth.uid(), 'intervals', trim(p_key))
    on conflict (owner, provider) do update set secret = excluded.secret;
end $$;
revoke execute on function public.connect_intervals(text, text) from anon, public;
grant execute on function public.connect_intervals(text, text) to authenticated;

-- the schedule: every minute, a "tick" that claims what's due (replaces the 10-minute run of everything)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('triven-sync') where exists (select 1 from cron.job where jobname = 'triven-sync');
    perform cron.schedule('triven-sync', '* * * * *', $cron$
      select net.http_post(
        url := 'https://ksubeokekwflqnmzsune.supabase.co/functions/v1/sync',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')),
        body := '{"mode":"tick"}'::jsonb,
        timeout_milliseconds := 150000);
    $cron$);
  end if;
end $$;
