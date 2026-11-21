// Sync queue (020): claim only what's due, never twice at once; next check time follows activity; errors back off.
import t19 from './test_019_admin.mjs';
import fs from 'fs';
export default async function (db) {
  await t19(db);
  // 008 (sync) isn't in the test schema: enough of its tables for this
  await db.exec(`create table if not exists public.connections (owner uuid not null, provider text not null, athlete_id text, status text not null default 'ok', last_sync timestamptz, last_error text, imported int not null default 0, created_at timestamptz not null default now(), primary key (owner, provider));
    create table if not exists public.connection_secrets (owner uuid not null, provider text not null, secret text not null, primary key (owner, provider));
    alter table public.sync_inbox add column if not exists attempts int not null default 0;
    do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;`);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/020_sync_queue.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  let fails = 0;
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const q = async (sql, p=[]) => (await db.query(sql, p)).rows;
  const refused = async (sql) => { await db.exec(`select set_config('test.uid','aaaaaaaa-0000-4000-8000-000000000003',false); set role authenticated;`); try { await db.query(sql); return false; } catch { return true; } finally { await db.exec('reset role'); } };
  console.log('— 020 sync queue');
  const U = i => `bbbbbbbb-0000-4000-8000-${String(i).padStart(12,'0')}`;
  await db.exec(`insert into auth.users(id, email) select ('bbbbbbbb-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid, 'sync'||g||'@example.com' from generate_series(1,25) g on conflict do nothing`);
  for (let i = 1; i <= 25; i++) {
    await q(`insert into connections(owner, provider, athlete_id, next_check_at) values ($1,'intervals','i'||$2, now() - ($2||' minutes')::interval) on conflict do nothing`, [U(i), i]);
    if (i !== 25) await q(`insert into connection_secrets values ($1,'intervals','key') on conflict do nothing`, [U(i)]);
  }
  await q(`update connections set next_check_at = now() + interval '1 hour' where owner = $1`, [U(1)]);   // not due
  const a = await q(`select owner from sync_claim_connections(10)`);
  ok(a.length === 10 && !a.some(r => r.owner === U(1)), 'claims 10 that are due, oldest first, skips one that isn\'t due');
  ok([15,16,17,18,19,20,21,22,23,24].every(i => a.some(r => r.owner === U(i))), 'the 10 most overdue are the ones claimed');
  const b = await q(`select owner from sync_claim_connections(100)`);
  ok(b.length === 13 && !b.some(r => a.find(x => x.owner === r.owner)), 'a second run gets only the rest: nothing claimed twice (' + b.length + ')');
  ok(!b.some(r => r.owner === U(25)), 'a connection without a key is never claimed');
  ok((await q(`select owner from sync_claim_connections(100)`)).length === 0, 'everything leased: nothing left to claim');
  // reschedule by activity
  await q(`insert into user_days values ($1, current_date) on conflict do nothing`, [U(2)]);
  await q(`insert into user_days values ($1, current_date - 10) on conflict do nothing`, [U(3)]);
  const mins = async (o) => Math.round((await q(`select extract(epoch from next_check_at - now())/60 m from connections where owner=$1`, [o]))[0].m);
  await q(`select sync_reschedule($1, true, 0)`, [U(2)]); await q(`select sync_reschedule($1, true, 0)`, [U(3)]); await q(`select sync_reschedule($1, true, 0)`, [U(4)]);
  await q(`select sync_reschedule($1, true, 2)`, [U(5)]); await q(`select sync_reschedule($1, true, 20, true)`, [U(6)]);
  ok(await mins(U(2)) === 30 && await mins(U(3)) === 120 && await mins(U(4)) === 720, 'next check: 30 min if active this week, 2 h this month, 12 h otherwise');
  ok(await mins(U(5)) === 15 && await mins(U(6)) === 1, 'new files: again in 15 min; more waiting: next minute');
  ok((await q(`select last_sync from connections where owner=$1`, [U(6)]))[0].last_sync === null, 'more waiting: the "since" date isn\'t moved on, so nothing is skipped');
  await q(`update connections set fail_count = 4, status = 'error', next_check_at = now() + interval '9 hours' where owner = $1`, [U(10)]);
  await db.exec(`select set_config('test.uid','${U(10)}',false); set role authenticated;`);
  await db.query(`select connect_intervals('i10', 'a-new-key-123')`); await db.exec('reset role');
  const rc = (await q(`select status, fail_count, next_check_at <= now() due from connections where owner=$1`, [U(10)]))[0];
  ok(rc.status === 'ok' && rc.fail_count === 0 && rc.due, 'reconnecting with a new key: errors cleared, checked straight away');
  const lease = (await q(`select lease_until, status, last_sync from connections where owner=$1`, [U(2)]))[0];
  ok(lease.lease_until === null && lease.status === 'ok' && lease.last_sync, 'lease released, status ok, last checked recorded');
  for (const e of [30, 60, 120]) { await q(`select sync_reschedule($1, false, 0, false, 'intervals.icu returned 500')`, [U(7)]); ok(await mins(U(7)) === e, `error backs off: ${e} min`); }
  await q(`select sync_reschedule($1, false, 0, false, 'refused', true)`, [U(8)]);
  ok(await mins(U(8)) === 1440 && (await q(`select status, last_error from connections where owner=$1`, [U(8)]))[0].status === 'error', 'a refused key waits a day and shows the error');
  // inbox
  for (let i = 1; i <= 5; i++) await q(`insert into sync_inbox(owner, provider, external_id, status) values ($1,'intervals',$2,'new')`, [U(i), 'x' + i]);
  await q(`insert into sync_inbox(owner, provider, external_id, status, attempts) values ($1,'intervals','tired','new',3)`, [U(9)]);
  const i1 = await q(`select id from sync_claim_inbox(3)`), i2 = await q(`select id from sync_claim_inbox(10)`);
  ok(i1.length === 3 && i2.length === 2 && !i2.some(x => i1.find(y => y.id === x.id)), 'inbox files claimed once each; ones that failed 3 times are left alone');
  ok(await refused(`select * from sync_claim_connections(5)`) && await refused(`select sync_reschedule('${U(2)}', true)`) && await refused(`select * from sync_claim_inbox(5)`), 'members can\'t call the server functions');
  console.log(fails ? fails + ' FAILED (020)' : 'all 020 checks passed');
}
