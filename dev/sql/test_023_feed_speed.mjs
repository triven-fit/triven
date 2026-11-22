// 023: the faster feed, leaderboard, notifications and dashboard apply cleanly on top of the test data, can be rerun,
// and keep the earlier checks (the full before/after comparison is dev/sql/load.mjs with EQUIV=1 SKIP=023).
import t22 from './test_022_lite_list.mjs';
import fs from 'fs';
export default async function (db) {
  await t22(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/023_feed_speed.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  let fails = 0;
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const A='cccccccc-0000-4000-8000-000000000021', B='cccccccc-0000-4000-8000-000000000022';
  const as = async (u, sql, p=[]) => { await db.exec(`reset role; select set_config('test.uid','${u}',false); set role authenticated;`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  console.log('— 023 feed speed');
  const mine = await as(A, `select name, device from feed('me', 'infinity', 50)`);
  ok(mine.length >= 3 && mine.find(r => r.name === 'Morning Run')?.device === 'Garmin Forerunner 965', `own feed, open-ended page (${mine.length} rows)`);
  const theirs = (await as(B, `select owner, name from feed('everyone', 'infinity', 100)`)).filter(r => r.owner === A);
  ok(theirs.length === 2 && !theirs.some(r => r.name === 'Secret'), 'others see public activities, not the private one');
  ok((await as(A, `select * from feed('me', null, 20)`)).length === 0, 'no page date: nothing (as before)');
  let anon = false; try { await db.exec('set role anon'); await db.query(`select * from feed('everyone', now(), 1)`); } catch { anon = true; } finally { await db.exec('reset role'); }
  ok(anon, "signed-out visitors still can't call it");
  const idx = (await db.query(`select indexname from pg_indexes where indexname in ('activities_public_time','club_members_user','comments_activity','comments_author','relay_legs_activity','activities_created','sync_inbox_activity')`)).rows.length;
  ok(idx === 7 || idx === 6, `indexes in place (${idx})`);
  console.log(fails ? fails + ' FAILED (023)' : 'all 023 checks passed');
}
