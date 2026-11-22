// 022: the slim summary for the activity list, and server-side summary merges.
import t21 from './test_021_feed_device.mjs';
import fs from 'fs';
export default async function (db) {
  await t21(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/022_lite_list.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  let fails = 0;
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const A='cccccccc-0000-4000-8000-000000000021', B='cccccccc-0000-4000-8000-000000000022';
  const as = async (u, sql, p=[]) => { await db.exec(`reset role; select set_config('test.uid','${u}',false); set role authenticated;`); try { return (await db.query(sql, p)).rows; } finally { await db.exec('reset role'); } };
  console.log('— 022 lite list');
  const ins = async (summary) => (await db.query(`insert into activities(owner, name, sport, start_time, visibility, summary) values ($1,'x','run',now(),'private',$2) returning id`, [A, summary])).rows[0].id;
  const withTrack = await ins({ track: [[51.5, -0.1], [51.6, -0.2]], loadData: { x: 1 }, weather: { t: 20 } });
  const noTrack = await ins({ loadData: { y: 2 } });
  const nullSum = await ins({});
  const lite = async id => (await as(A, `select public.summary_lite(a) s from activities a where id = $1`, [id]))[0].s;
  const l1 = await lite(withTrack);
  ok(!('track' in l1) && l1.hasTrack === true && JSON.stringify(l1.start) === '[51.5,-0.1]' && l1.loadData.x === 1 && l1.weather.t === 20, 'track replaced by start point, rest kept');
  const l2 = await lite(noTrack);
  ok(!('hasTrack' in l2) && l2.loadData.y === 2, 'summary without a track unchanged');
  ok(JSON.stringify(await lite(nullSum)) === '{}', 'empty summary stays empty');
  await as(A, `select public.merge_summary($1, '{"weather":{"t":25}}')`, [withTrack]);
  const full = (await db.query(`select summary from activities where id = $1`, [withTrack])).rows[0].summary;
  ok(full.track.length === 2 && full.weather.t === 25 && full.loadData.x === 1, 'merge adds a key and keeps the track');
  await as(A, `select public.merge_summary($1, '{"weather":false}')`, [nullSum]);
  ok((await db.query(`select summary from activities where id = $1`, [nullSum])).rows[0].summary.weather === false, 'merge into an empty summary');
  await as(B, `select public.merge_summary($1, '{"weather":{"t":99}}')`, [withTrack]);
  ok((await db.query(`select summary->'weather'->>'t' t from activities where id = $1`, [withTrack])).rows[0].t === '25', "can't merge into someone else's activity");
  let anon = false; try { await db.exec('set role anon'); await db.query(`select public.merge_summary($1, '{}')`, [withTrack]); } catch { anon = true; } finally { await db.exec('reset role'); }
  ok(anon, 'signed-out visitors cannot merge');
  console.log(fails ? fails + ' FAILED (022)' : 'all 022 checks passed');
}
