# 02 Automatic sync with intervals.icu
from compose import *
FILE = '03-automatic-sync-with-intervals-icu'
def film(f):
    pg = f.pg; S = {}
    S['feed'] = f.shot('feed')
    S['gear'] = f.shot('settings_btn', '#openSettings')
    pg.click('#openSettings'); pg.wait_for_timeout(1200)
    pg.evaluate('document.activeElement.blur()'); pg.evaluate("document.getElementById('connBox').scrollIntoView({block:'center'})"); pg.wait_for_timeout(600)
    S['conn'] = f.shot('conn', '#connBox')
    idsel, keysel = '#connBox input[placeholder="i123456"]', '#connBox input[type=password]'
    S['typeid'] = f.type_frames(idsel, 'i123456', 'id', hl='#connBox')
    S['typekey'] = f.type_frames(keysel, '3x7kq9w2m5p8r1t4v6y0', 'key', every=3, hl='#connBox')
    S['ready'] = f.shot('ready', '#connBox button.primary')
    # what the server would have done: the connection row plus a few imported files
    pg.evaluate("""(()=>{const r=window.__rpcData;r.connect_intervals=()=>{__db.connections.push({owner:'u1',provider:'intervals',athlete_id:'i123456',status:'ok',last_sync:'2026-11-22T17:30:00Z',created_at:'2026-11-22T17:29:00Z'});
      for(let i=0;i<12;i++)__db.sync_inbox.push({id:'sx'+i,owner:'u1',status:'done'});return{data:null,error:null}}})()""")
    pg.click('#connBox button.primary'); pg.wait_for_timeout(2500)
    S['connected'] = f.shot('connected', '#connBox')
    S['syncnow'] = f.shot('syncnow', '#connBox button.primary')
    pg.click('#closeSettings'); pg.wait_for_timeout(800)
    f.nav('#feed', 1500)
    S['feed2'] = f.shot('feed2', '.fcard')
    return S
def scenes(S):
    g = lambda k: tuple(S[k])
    conn = S['conn'][1]
    seq = lambda k, per: [(p, conn, per) for p, _ in S[k]]
    scenes = [
      Title(3, 'Automatic sync with intervals.icu', 'Every workout from your watch, straight into Triven.'),
      Flow('How it works', [('Your watch', 'Garmin, COROS, Suunto, Wahoo, Polar'), ('intervals.icu', 'free; collects your workouts'), ('Triven', 'checks regularly, and when you open it')],
           note='intervals.icu is a free training site that already connects to most watch brands. Triven picks up your new workouts from there.', dur=8.5),
      Card('In intervals.icu', [('Create a free account', 'Sign up at intervals.icu with email or Google.'),
                                ('Connect your watch', 'Settings → Connections → your watch brand, e.g. Garmin Connect.'),
                                ('Find your athlete ID and API key', 'Settings → Developer Settings, at the bottom of the page.')], eyebrow='Set up once', per=1.4),
      Mock('Copy your athlete ID and API key', 'intervals.icu/settings', 'Developer Settings', [('Athlete ID', 'i123456'), ('API Key', '(view)  →  Generate')], hl=[0, 1],
           caption='Your athlete ID starts with "i". Under API Key, click (view), then Generate, and copy the key.', eyebrow='In intervals.icu', dur=8.5),
      Screen([(S['feed'][0], None, 1.4), (S['gear'][0], tuple(S['gear'][1]), 2.4)], 'Now in Triven: open Settings.', zoom=1.0),
      Screen([g('conn')], 'Scroll down to Connected services.', zoom=1.22, dur=None) if False else Screen([(S['conn'][0], conn, 3.4)], 'Scroll down to Connected services.', zoom=1.22),
      Screen(seq('typeid', .14) + [(S['typeid'][-1][0], conn, 1.2)], 'Paste your athlete ID…', zoom=1.22, z0=1.22),
      Screen(seq('typekey', .14) + [(S['typekey'][-1][0], conn, 1.0)], '…and your API key.', zoom=1.22, z0=1.22),
      Screen([(S['ready'][0], tuple(S['ready'][1]), 2.4)], 'Click Connect.', zoom=1.22, z0=1.22, focus=conn),
      Screen([(S['connected'][0], tuple(S['connected'][1]), 4.6)], "That's it. Triven checks intervals.icu regularly, and straight away when you open the app.", zoom=1.22, z0=1.22, focus=conn),
      Screen([(S['syncnow'][0], tuple(S['syncnow'][1]), 3.6)], 'Just finished a session? Sync now fetches it straight away.', zoom=1.22, z0=1.22, focus=conn),
      Screen([(S['feed2'][0], tuple(S['feed2'][1]), 4.6)], 'New activities land in your feed with maps, charts and training load worked out.', zoom=1.06, dim=False),
      Card('Good to know', ["Workouts that reached intervals.icu from Strava can't be passed on (Strava's rules). Connect your watch to intervals.icu directly.",
                            'Apple Watch: send your workouts to intervals.icu with the HealthFit app.',
                            'Your key is stored where only the sync server can read it. Disconnect deletes it.',
                            'Older history? Upload your Garmin export: see the next video.'], kind='bullets', per=1.0),
      End('Uploading files and your Garmin history'),
    ]
    return scenes
