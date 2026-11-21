// Triven sync: fetch new activities from connected services and import them.
//  - every minute from pg_cron (header x-sync-secret, body {mode:'tick'}): claim small batches of connections that are due
//    (each carries its own next check time, see 020_sync_queue.sql), check a few at once until the time budget is used,
//    then hand waiting files out one per request so each import gets its own CPU budget
//  - from the app (signed-in user's token, body {mode:'mine'}): check that user's connection now; the app imports the files
// The import code is the same module the app uses, loaded from the GitHub repo at a fixed commit.
import { createClient } from 'npm:@supabase/supabase-js@2.119.1';
import { Decoder, Stream } from 'npm:@garmin/fitsdk@21.222.0';
import { importDecoded } from 'https://cdn.jsdelivr.net/gh/triven-fit/triven@346f01527701319ef4865abd8c1784bf3812a4a1/js/pipeline.js';

const BASE = Deno.env.get('SUPABASE_URL')!;
const secretKey = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return null; } })() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(BASE, secretKey, { auth: { persistSession: false } });
const ICU = 'https://intervals.icu/api/v1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const msg = (e: unknown) => String((e as Error)?.message || e);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const MAX_FILES = 10;       // files fetched per check; the rest come a minute later
const PARALLEL = 4;         // members checked at once (each has its own intervals.icu key)
const BUDGET_MS = 75_000;   // stop claiming new checks after this; the next tick carries on
const IMPORTS = 12;         // waiting files handed out per tick
class AuthError extends Error {}

function decode(bytes: Uint8Array) {
  const dec = new Decoder(Stream.fromByteArray(bytes));
  if (!dec.isFIT()) throw new Error('not a FIT file');
  return dec.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true, applyScaleAndOffset: true, expandSubFields: true, convertTypesToStrings: true });
}
async function gunzipMaybe(buf: Uint8Array) {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const out = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}
const isFit = (b: Uint8Array | null) => !!b && b.length > 12 && String.fromCharCode(b[8], b[9], b[10], b[11]) === '.FIT';

// list the athlete's recent intervals.icu activities and put any new ones (as FIT files) in the inbox
async function fetchNew(conn: any, key: string): Promise<{ added: number; more: boolean }> {
  const auth = { Authorization: 'Basic ' + btoa('API_KEY:' + key) };
  const since = conn.last_sync ? Date.parse(conn.last_sync) - 3 * 864e5 : Date.parse(conn.created_at) - 14 * 864e5;
  const oldest = new Date(since).toISOString().slice(0, 10);
  const r = await fetch(`${ICU}/athlete/${encodeURIComponent(conn.athlete_id || '0')}/activities?oldest=${oldest}`, { headers: auth });
  if (r.status === 401 || r.status === 403) throw new AuthError('intervals.icu refused the athlete ID or API key');
  if (!r.ok) throw new Error(`intervals.icu returned ${r.status}`);
  const list: any[] = await r.json();
  if (!list.length) return { added: 0, more: false };
  const { data: seen } = await admin.from('sync_inbox').select('external_id').eq('owner', conn.owner).eq('provider', 'intervals').in('external_id', list.map(a => String(a.id)));
  const have = new Set((seen || []).map((x: any) => x.external_id));
  const todo = list.filter(a => !have.has(String(a.id)));
  let added = 0;
  for (const a of todo.slice(0, MAX_FILES)) {
    const ext = String(a.id);
    const row = { owner: conn.owner, provider: 'intervals', external_id: ext, name: a.name || null, start_time: a.start_date || a.start_date_local || null };
    // Strava's terms stop intervals.icu passing on activities it got from Strava
    if (String(a.source || '').toUpperCase() === 'STRAVA') { await admin.from('sync_inbox').insert({ ...row, status: 'skip', error: 'came from Strava' }); continue; }
    let bytes: Uint8Array | null = null;
    const f = await fetch(`${ICU}/activity/${ext}/file`, { headers: auth });
    if (f.ok) bytes = await gunzipMaybe(new Uint8Array(await f.arrayBuffer()));
    if (!isFit(bytes)) {   // GPX/TCX originals: intervals.icu can give a FIT version
      const g = await fetch(`${ICU}/activity/${ext}/fit-file`, { headers: auth });
      bytes = g.ok ? await gunzipMaybe(new Uint8Array(await g.arrayBuffer())) : null;
    }
    if (!isFit(bytes)) { await admin.from('sync_inbox').insert({ ...row, status: 'notfit', error: 'no activity file available' }); continue; }
    const path = `${conn.owner}/inbox/intervals-${ext}.fit`;
    const up = await admin.storage.from('activity-files').upload(path, new Blob([bytes!]), { upsert: true, contentType: 'application/octet-stream' });
    if (up.error) throw up.error;
    const ins = await admin.from('sync_inbox').insert({ ...row, file_path: path });
    if (!ins.error) added++;
    await sleep(250);   // gentle on intervals.icu
  }
  return { added, more: todo.length > MAX_FILES };
}

// check one member and set their next check time
async function checkOne(conn: any) {
  const { data: sec } = await admin.from('connection_secrets').select('secret').eq('owner', conn.owner).eq('provider', 'intervals').maybeSingle();
  if (!sec) return { error: 'no key' };
  try {
    const { added, more } = await fetchNew(conn, sec.secret);
    await admin.rpc('sync_reschedule', { p_owner: conn.owner, p_ok: true, p_added: added, p_more: more });
    return { added, more };
  } catch (e) {
    await admin.rpc('sync_reschedule', { p_owner: conn.owner, p_ok: false, p_error: msg(e), p_auth_failed: e instanceof AuthError });
    return { error: msg(e) };
  }
}

async function tick(secret: string) {
  const t0 = Date.now(); let checked = 0, added = 0, errors = 0;
  while (Date.now() - t0 < BUDGET_MS) {
    const { data: batch, error } = await admin.rpc('sync_claim_connections', { n: PARALLEL, lease_s: 300 });
    if (error) throw error;
    if (!batch?.length) break;
    const res = await Promise.all(batch.map(checkOne));
    checked += res.length; res.forEach((r: any) => { added += r.added || 0; if (r.error) errors++; });
  }
  // imports: one request each, a few at a time, so a slow file can't hold up the rest
  const { data: items } = await admin.rpc('sync_claim_inbox', { n: IMPORTS, lease_s: 240 });
  const queue = [...(items || [])];
  const worker = async () => { for (let it; (it = queue.shift());) await fetch(`${BASE}/functions/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret }, body: JSON.stringify({ mode: 'one', id: it.id }) }).catch(() => {}); };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { checked, added, errors, imports: items?.length || 0, ms: Date.now() - t0 };
}

async function processOne(id: string) {
  const { data: it } = await admin.from('sync_inbox').select('*').eq('id', id).single();
  if (!it || it.status !== 'new') return it?.status || 'missing';
  await admin.from('sync_inbox').update({ attempts: it.attempts + 1 }).eq('id', id);   // counts even if this run is cut off
  const dl = await admin.storage.from('activity-files').download(it.file_path);
  if (dl.error) throw dl.error;
  const raw = new Uint8Array(await dl.data.arrayBuffer());
  const { messages, errors } = decode(raw);
  const [{ data: profile }, { data: gear }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', it.owner).single(),
    admin.from('gear').select('*').eq('owner', it.owner),
  ]);
  const r = await importDecoded(admin, { uid: it.owner, messages, errors, raw, source: 'intervals', profile, gear: gear || [], extra: { external: { intervals: it.external_id } } });
  await admin.from('sync_inbox').update({ status: r.status === 'ok' ? 'done' : r.status === 'skip' ? 'skip' : 'failed', activity_id: r.id || null, error: r.status === 'notact' ? 'not an activity' : null }).eq('id', id);
  if (r.status === 'ok' || r.status === 'skip') await admin.storage.from('activity-files').remove([it.file_path]);
  if (r.status === 'ok') {
    const { data: c } = await admin.from('connections').select('imported').eq('owner', it.owner).eq('provider', 'intervals').single();
    if (c) await admin.from('connections').update({ imported: (c.imported || 0) + 1 }).eq('owner', it.owner).eq('provider', 'intervals');
  }
  return r.status;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const secret = req.headers.get('x-sync-secret');
  let cron = false;
  if (secret) {
    const { data } = await admin.rpc('sync_secret_ok', { s: secret });
    if (!data) return json({ error: 'bad secret' }, 401);
    cron = true;
  }
  if (cron && body.mode === 'one') {
    try { return json({ result: await processOne(body.id) }); }
    catch (e) { await admin.from('sync_inbox').update({ error: msg(e) }).eq('id', body.id); return json({ error: msg(e) }, 500); }
  }
  if (cron) {
    try { return json({ ok: true, ...(await tick(secret!)) }); } catch (e) { return json({ error: msg(e) }, 500); }
  }
  // the app: check this member now (at most once a minute)
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'sign in first' }, 401);
  const { data: conn } = await admin.from('connections').select('*').eq('owner', user.id).eq('provider', 'intervals').maybeSingle();
  if (!conn) return json({ ok: true, checked: 0 });
  if (conn.last_sync && Date.now() - Date.parse(conn.last_sync) < 60e3 && conn.status === 'ok' && !body.force) return json({ ok: true, checked: 0, recent: true });
  const r: any = await checkOne(conn);
  return json({ ok: !r.error, checked: 1, ...r });   // a problem shows on the connection itself
});
