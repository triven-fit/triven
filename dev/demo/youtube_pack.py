# Everything needed to upload each video to YouTube: one folder per video with the video (music added), its thumbnail
# and youtube.txt (title, description with chapters, tags, playlist and settings). Run after finish.py and the music mux.
import sys, os, json, importlib, pickle, subprocess, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalog import SERIES
import compose

SRC = '/tmp/vid/withmusic'; TH = '/tmp/vid/thumbs'; PACK = '/tmp/vid/youtube'
shutil.rmtree(PACK, ignore_errors=True); os.makedirs(PACK)
dur = lambda f: float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout)
ts = lambda s: f'{int(s // 60)}:{int(s % 60):02d}'

BASE_TAGS = ['Triven', 'training log', 'triathlon', 'running', 'cycling', 'swimming', 'Strava alternative', 'multisport', 'how to']
EXTRA = {
  'v02_install': ['install web app', 'PWA', 'iPhone', 'Android'], 'v02_sync_video': ['intervals.icu', 'Garmin', 'COROS', 'Apple Watch sync'],
  'v03_upload': ['FIT file', 'Garmin export'], 'v06_multisport': ['triathlon transitions', 'duathlon', 'aquathlon'],
  'v08_gear': ['shoe mileage', 'bike mileage'], 'v11_fitness': ['training load', 'fitness and fatigue', 'CTL ATL TSB'],
  'v12_races': ['taper', 'race calendar'], 'v13_bests': ['personal bests', 'power curve'], 'v14_swim': ['SWOLF', 'CSS', 'pool swimming'],
  'v17_clubs': ['running club', 'triathlon club', 'leaderboards'], 'v18_relays': ['relay'], 'v20_data': ['data export', 'delete account'],
}

def chapters(mod, n_total):
    m = importlib.import_module(mod)
    S = pickle.load(open(f'/tmp/vid/{mod}/shots.pkl', 'rb'))
    sc = m.scenes(S); work = f'/tmp/vid/{mod}/work'
    ds = [dur(f'{work}/scene{i:02d}.mp4') for i in range(len(sc))]
    ch, t, prev = [], 0.0, None
    for s, d in zip(sc, ds):
        label = 'Intro' if isinstance(s, compose.Title) else getattr(s, 'h', None)
        if isinstance(s, compose.End): label = None
        if isinstance(s, compose.Screen) and prev is not None and not isinstance(prev, compose.Screen) and not isinstance(prev, compose.Title):
            import re; label = re.split(r'[:.…]', s.caption or '')[0].strip() or None   # app screens after a title card
        prev = s
        if label and not (ch and ch[-1][1] == label): ch.append([t, label])
        elif not ch: ch.append([t, (getattr(s, 'caption', '') or 'Intro').rstrip('.…')])
        t += d
    # YouTube: first at 0:00, each at least 10 s, at least 3
    out = []
    for i, (st, lb) in enumerate(ch):
        nxt = ch[i + 1][0] if i + 1 < len(ch) else t
        if out and nxt - st < 10: continue           # too short: fold into the one before
        out.append([st, lb])
    out = [c for i, c in enumerate(out) if i + 1 == len(out) or out[i + 1][0] - c[0] >= 10]
    if out: out[0][0] = 0                            # the short intro belongs to the first chapter
    return out if len(out) >= 3 else []

for n, (mod, title, line, group) in enumerate(SERIES, 1):
    m = importlib.import_module(mod)
    vid = f'{SRC}/{m.FILE}.mp4'; length = dur(vid)
    folder = f'{PACK}/{n:02d} - {title.replace(":", " -")}'; os.makedirs(folder)
    shutil.copy(vid, f'{folder}/{m.FILE}.mp4'); shutil.copy(f'{TH}/{n:02d}.jpg', f'{folder}/thumbnail.jpg')
    ch = []
    nxt = f'Next: Triven how-to {n + 1:02d}: {SERIES[n][1]}' if n < len(SERIES) else 'That’s the end of the series: thanks for watching.'
    desc = [line, '']
    desc += ['Triven is a free training log for swimming, cycling, running and multisport, with proper triathlon support.',
             'Try it: https://triven.fit', 'Help guide: https://triven.fit/help', 'All the how-to videos: https://triven.fit/videos', '',
             nxt, '', 'The athlete and activities in this video are made up for the demo.', '',
             '#Triven #triathlon #traininglog']
    tags = BASE_TAGS + EXTRA.get(mod, [])
    txt = f"""TITLE  (max 100 characters)
Triven how-to {n:02d}: {title}

DESCRIPTION
{chr(10).join(desc)}

TAGS  (paste into the Tags box)
{', '.join(tags)}

THUMBNAIL
thumbnail.jpg  (1280 x 720)

SETTINGS
Playlist: Triven how-to  (section: {group})
Audience: No, it's not made for kids
Category: Howto & Style
Visibility: Public  (or Unlisted while you review)
Language: English (United Kingdom)
Video length: {ts(length)}

AFTER UPLOAD
Copy the video ID (the part after watch?v= or youtu.be/) and send it to Claude for the videos page.
End screen (last 5 seconds): add "Video: {('Triven how-to ' + f'{n + 1:02d}') if n < len(SERIES) else 'Best for viewer'}" and "Subscribe".
"""
    open(f'{folder}/youtube.txt', 'w').write(txt)
    print(f'{n:02d} {ts(length)}')
