// Load test: a few thousand made-up members with years of activities, then time the busy queries
// (feed, club leaderboard, notifications, admin dashboard) as a typical member.
// node load.mjs [members=3000] [activitiesPerMember=100] [extra migration files to apply after the rest...]
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const N = +(process.argv[2] || 3000), PER = +(process.argv[3] || 100), extra = process.argv.slice(4);
const db = new PGlite({ extensions: { pgcrypto } });
const R = new URL('../../supabase/', import.meta.url).pathname;
await db.exec(fs.readFileSync(new URL('stub.sql', import.meta.url), 'utf8'));
const SKIP = (process.env.SKIP || '').split(',').filter(Boolean);
for (const f of fs.readdirSync(R).filter(f => /^\d{3}_.*\.sql$/.test(f) && !SKIP.some(k => f.startsWith(k))).sort().concat(extra)) {
  let sql = fs.readFileSync(f.includes('/') ? f : R + f, 'utf8');
  if (f === '008_sync.sql') sql = sql.split('create extension if not exists pg_cron')[0];   // tables only: no pg_cron, pg_net or Vault here
  try { await db.exec(sql); } catch (e) { console.log('skip', f, '-', e.message.slice(0, 90)); }
}
const t0 = Date.now(), log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
// members: every other one in the big club (1,500 at N=3000), everyone in one of 40 smaller clubs
await db.exec(`
  insert into auth.users(id, email, raw_user_meta_data)
    select ('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'm' || i || '@load.test', jsonb_build_object('display_name', 'Member ' || i)
    from generate_series(1, ${N}) i;
  update profiles set searchable = (random() < 0.7), privacy_set = true,
    feed_audience = (array['everyone','followers_clubs','followers'])[1 + (abs(hashtext(id::text)) % 3)] where id::text like 'dddddddd%';
  insert into clubs(id, name, created_by, listed)
    select ('eeeeeeee-0000-4000-8000-' || lpad(c::text, 12, '0'))::uuid, 'Club ' || c, ('dddddddd-0000-4000-8000-' || lpad((c + 1)::text, 12, '0'))::uuid, true
    from generate_series(0, 40) c;
  insert into club_members(club_id, user_id, role, status)
    select ('eeeeeeee-0000-4000-8000-' || lpad('0', 12, '0'))::uuid, ('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, case when i = 2 then 'owner' else 'member' end, case when i % 50 = 0 then 'pending' else 'active' end
      from generate_series(2, ${N}, 2) i
    union all
    select ('eeeeeeee-0000-4000-8000-' || lpad((1 + i % 40)::text, 12, '0'))::uuid, ('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'member', 'active'
      from generate_series(1, ${N}) i;
  alter table follows disable trigger follows_guard;
  insert into follows(follower, followee, status)
    select distinct ('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, ('dddddddd-0000-4000-8000-' || lpad((1 + (i * 7919 + k * 104729) % ${N})::text, 12, '0'))::uuid, case when k = 0 then 'pending' else 'accepted' end
    from generate_series(1, ${N}) i, generate_series(0, 14) k where 1 + (i * 7919 + k * 104729) % ${N} <> i
    on conflict do nothing;
  alter table follows enable trigger follows_guard;
`);
log(`${N} members, clubs, follows`);
// activities over the last 3 years, in batches
for (let from = 1; from <= N; from += 500) {
  const to = Math.min(N, from + 499);
  await db.exec(`
    insert into activities(owner, name, sport, multisport_profile, start_time, distance_m, elapsed_s, moving_s, ascent_m, visibility, device, summary, source, created_at)
    select ('dddddddd-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'Session ' || j,
           (array['run','run','run','bike','bike','swim','multi','other'])[1 + (i + j) % 8], case when (i + j) % 8 = 6 then 'triathlon' end,
           now() - make_interval(secs => ((j * 1095.0 / ${PER}) + random()) * 86400), 5000 + random() * 40000, 1800 + random() * 7200, 1700 + random() * 7000, random() * 400,
           (array['club','club','club','public','public','followers','private'])[1 + (i * 3 + j) % 7], 'Forerunner 965', '{"weather":false}', case when j % 9 = 0 then 'manual' else 'upload' end, now() - make_interval(secs => ((j * 1095.0 / ${PER}) * 0.4) * 86400)
    from generate_series(${from}, ${to}) i, generate_series(1, ${PER}) j;`);
  log(`activities for members ${from}-${to}`);
}
await db.exec(`
  insert into activity_sections(activity_id, idx, sport, start_offset_s, distance_m, elapsed_s, ascent_m, summary)
    select a.id, s.idx, (array['swim','transition','bike','transition','run'])[s.idx + 1], 600 * s.idx, 1000 * (s.idx + 1), 600 * (s.idx + 1), 10, '{}'
    from activities a, generate_series(0, 4) s(idx) where a.sport = 'multi';
  insert into kudos(activity_id, user_id, created_at)
    select a.id, ('dddddddd-0000-4000-8000-' || lpad((1 + (abs(hashtext(a.id::text)) + k * 31) % ${N})::text, 12, '0'))::uuid, a.start_time + interval '2 hours'
    from activities a, generate_series(1, 3) k where a.visibility <> 'private' and abs(hashtext(a.id::text || k)) % 2 = 0 on conflict do nothing;
  insert into comments(activity_id, author, body, created_at)
    select a.id, ('dddddddd-0000-4000-8000-' || lpad((1 + abs(hashtext(a.id::text)) % ${N})::text, 12, '0'))::uuid, 'Nice one', a.start_time + interval '3 hours'
    from activities a where a.visibility <> 'private' and abs(hashtext(a.id::text)) % 6 = 0;
  insert into comments(activity_id, author, body, created_at)   -- replies, for the notifications' "after you" part
    select a.id, ('dddddddd-0000-4000-8000-' || lpad((1 + (abs(hashtext(a.id::text)) + 17) % ${N})::text, 12, '0'))::uuid, 'Thanks', least(now() - interval '1 minute', a.start_time + interval '5 hours')
    from activities a where a.visibility <> 'private' and abs(hashtext(a.id::text)) % 12 = 0 and a.start_time > now() - interval '120 days';
  update profiles set created_at = now() - make_interval(days => abs(hashtext(id::text)) % 400) where id::text like 'dddddddd%';
  insert into admins(user_id) values ('dddddddd-0000-4000-8000-000000000002');
  analyze;
`);
const counts = (await db.query(`select (select count(*) from activities) acts, (select count(*) from kudos) kudos, (select count(*) from comments) comments, (select count(*) from follows) follows, (select count(*) from club_members) members`)).rows[0];
log('seeded ' + JSON.stringify(counts));

// EQUIV=1 SKIP=023: compare the feed before and after 023 for many members, scopes and pages
if (process.env.EQUIV) {
  const mem = i => 'dddddddd-0000-4000-8000-' + String(i).padStart(12, '0');
  const viewers = Array.from({ length: 25 }, (_, k) => mem(1 + (k * 37) % N));
  const pages = ['now()', "now() - interval '40 days'", "now() - interval '400 days'", "'infinity'", "now() - interval '1090 days'"];
  const calls = [];
  for (const v of viewers) for (const b of pages) {
    calls.push([v, `feed('club', ${b}, 20)`], [v, `feed('following', ${b}, 20)`], [v, `feed('everyone', ${b}, 20)`], [v, `feed('me', ${b}, 7)`],
      [v, `feed('athlete', ${b}, 20, null, '${mem(1 + (v.charCodeAt(30) * 13) % N)}')`],
      [v, `feed('club', ${b}, 20, 'eeeeeeee-0000-4000-8000-000000000000')`], [v, `feed('club', ${b}, 50, 'eeeeeeee-0000-4000-8000-${String(1 + v.charCodeAt(33) % 40).padStart(12, '0')}')`]);
  }
  // leaderboards and notifications: same rows in any order
  const myClub = v => `'eeeeeeee-0000-4000-8000-${String(1 + (parseInt(v.slice(-12)) % 40)).padStart(12, '0')}'`;
  for (const v of viewers) {
    for (const [f, t] of [["date_trunc('month', now())", "now() + interval '1 day'"], ["date_trunc('year', now())", "now() + interval '1 day'"], ["now() - interval '3 years'", "now()"]])
      for (const sp of ['all', 'run', 'bike', 'swim'])
        calls.push([v, `club_leaderboard('eeeeeeee-0000-4000-8000-000000000000', ${f}, ${t}, '${sp}')`, 1], [v, `club_leaderboard(${myClub(v)}, ${f}, ${t}, '${sp}')`, 1]);
    calls.push([v, `my_notifications(100)`, 1]);
  }
  for (const d of [7, 90, 730]) calls.push(['dddddddd-0000-4000-8000-000000000002', `admin_stats(${d})`]);
  const run = async () => { const out = []; for (const [v, c] of calls) { await db.exec(`select set_config('test.uid','${v}',false); set role authenticated;`); try { const rows = (await db.query(`select * from ${c}`)).rows.map(r => r.admin_stats ? { ...r.admin_stats, recent: null } : r).map(r => JSON.stringify(r)); out.push(JSON.stringify(calls.find(x => x[1] === c)?.[2] ? rows.sort() : rows)); } finally { await db.exec('reset role'); } } return out; };
  const before = await run();
  await db.exec(fs.readFileSync(R + '023_feed_speed.sql', 'utf8')); await db.exec(fs.readFileSync(R + '023_feed_speed.sql', 'utf8'));
  const after = await run();
  let diff = 0, nonEmpty = 0;
  calls.forEach(([v, c], k) => { if (before[k] !== '[]') nonEmpty++; if (before[k] !== after[k]) { diff++; if (diff <= 5) console.log('DIFF', v, c, JSON.parse(before[k]).length, JSON.parse(after[k]).length); } });
  console.log(`${calls.length} calls compared (${nonEmpty} with rows): ${diff ? diff + ' DIFFERENT' : 'all identical'}`);
  process.exit(diff ? 1 : 0);
}
const ME = 'dddddddd-0000-4000-8000-000000000002', BIG = 'eeeeeeee-0000-4000-8000-000000000000', SMALL = 'eeeeeeee-0000-4000-8000-000000000003';
const as = async (sql) => { await db.exec(`select set_config('test.uid','${ME}',false); set role authenticated;`); try { const s = performance.now(); const r = await db.query(sql); return [performance.now() - s, r.rows.length]; } finally { await db.exec('reset role'); } };
const cases = [
  ['feed: clubs (default)', `select * from feed('club', now(), 20)`],
  ['feed: clubs, page 5', `select * from feed('club', now() - interval '30 days', 20)`],
  ['feed: one big club', `select * from feed('club', now(), 20, '${BIG}')`],
  ['feed: following', `select * from feed('following', now(), 20)`],
  ['feed: everyone', `select * from feed('everyone', now(), 20)`],
  ['feed: me', `select * from feed('me', now(), 20)`],
  ['feed: an athlete', `select * from feed('athlete', now(), 20, null, 'dddddddd-0000-4000-8000-000000000004')`],
  ['leaderboard: big club, this month', `select * from club_leaderboard('${BIG}', date_trunc('month', now()), now() + interval '1 day')`],
  ['leaderboard: big club, this year', `select * from club_leaderboard('${BIG}', date_trunc('year', now()), now() + interval '1 day')`],
  ['leaderboard: small club, this year', `select * from club_leaderboard('${SMALL}', date_trunc('year', now()), now() + interval '1 day')`],
  ['notifications', `select * from my_notifications(40)`],
  ['admin dashboard, 90 days', `select admin_stats(90)`],
];
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
for (const [name, sql] of cases) {
  if (only && !only.test(name)) continue;
  const runs = []; let n = 0;
  for (let k = 0; k < 3; k++) { const [ms, rows] = await as(sql); runs.push(ms); n = rows; }
  console.log(`${name.padEnd(38)} ${runs.map(x => x.toFixed(0).padStart(6)).join(' ')} ms   (${n} rows)`);
}
if (process.env.EXPLAIN) {
  await db.exec(`select set_config('test.uid','${ME}',false); set role authenticated; load 'auto_explain';`).catch(() => {});
  const r = await db.query(`explain (analyze, costs off) ${cases.find(c => c[0] === process.env.EXPLAIN)[1]}`);
  console.log(r.rows.map(x => x['QUERY PLAN']).join('\n'));
}
