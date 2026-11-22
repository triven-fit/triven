// 021: the feed returns the recording device (for Garmin attribution), and nothing else changes.
import t20 from './test_020_sync_queue.mjs';
import fs from 'fs';
export default async function (db) {
  await t20(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/021_feed_device.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  let fails = 0;
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const A='cccccccc-0000-4000-8000-000000000021', B='cccccccc-0000-4000-8000-000000000022';
  const as = async (u, sql, p=[]) => { await db.exec(`reset role; select set_config('test.uid','${u}',false); set role authenticated;`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  console.log('— 021 feed device');
  await db.query(`insert into auth.users(id, email, raw_user_meta_data) values ($1,'dev1@x','{"display_name":"Dev One"}'), ($2,'dev2@x','{"display_name":"Dev Two"}')`, [A, B]);
  await db.query(`update profiles set searchable = true, privacy_set = true, feed_audience = 'everyone' where id = $1`, [A]).catch(() => {});
  for (const [n, dev, vis] of [['Morning Run', 'Garmin Forerunner 965', 'public'], ['Ride', 'Wahoo ELEMNT BOLT', 'public'], ['Secret', 'Garmin Edge 1040', 'private']])
    await db.query(`insert into activities(owner, name, sport, start_time, visibility, device) values ($1, $2, 'run', now() - interval '1 day', $3, $4)`, [A, n, vis, dev]);
  const mine = await as(A, `select id, device, name from feed('me', 'infinity', 50)`);
  ok(mine.length === 3 && mine.find(r => r.name === 'Morning Run').device === 'Garmin Forerunner 965' && mine.find(r => r.name === 'Ride').device === 'Wahoo ELEMNT BOLT', `own feed carries each device (${mine.length} rows)`);
  const theirs = await as(B, `select owner, device from feed('everyone', 'infinity', 100)`);
  const fromA = theirs.filter(r => r.owner === A);
  ok(fromA.length === 2 && fromA.every(r => r.device), `others see the device on the 2 public activities, not the private one (${fromA.length})`);
  const cols = (await as(B, `select * from feed('everyone', 'infinity', 1)`))[0];
  ok(!cols || ('handle' in cols && 'num' in cols && 'relay' in cols && 'device' in cols), 'earlier columns kept');
  let anonBlocked = false; try { await db.exec(`set role anon`); await db.query(`select * from feed('everyone', now(), 1)`); } catch { anonBlocked = true; } finally { await db.exec('reset role'); }
  ok(anonBlocked, 'signed-out visitors still can\'t call it');
  console.log(fails ? fails + ' FAILED (021)' : 'all 021 checks passed');
}
