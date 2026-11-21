# 02 Installing Triven on your phone or computer
from compose import *
from common import *
FILE = '02-installing-triven-on-your-phone-or-computer'
def SETUP(): return {'viewport': (390, 844), 'scale': 2.5}
def film(f):
    S = {}; pg = f.pg
    pg.evaluate('document.fonts.ready'); f.nav('#log', 1500); f.nav('#feed', 2500); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(800)
    S['m_feed'] = f.shot('mfeed')
    f.nav('#a/' + tri()['id'], 3500); S['m_tri'] = f.shot('mtri')
    f.nav('#log', 2500); S['m_log'] = f.shot('mlog')
    # desktop: the Install app button (browsers only offer it on a real site, so it's shown here as it appears)
    pg.set_viewport_size({'width': 1280, 'height': 720}); f.nav('#feed', 2500)
    pg.evaluate("document.getElementById('installBtn').hidden = false"); pg.wait_for_timeout(400)
    S['d_feed'] = f.shot('dfeed')
    return S
DESK = '/tmp/vid/v01_welcome/shots/001_feed.jpg'
def scenes(S):
    return [
      Title(2, 'Installing Triven on your phone or computer', 'No app store needed: it installs straight from your browser.'),
      Card('Why install it', ['Its own icon on your home screen, dock or taskbar', 'Opens full screen, like any other app', 'Always the latest version: nothing to update', 'Same account and data on every device'], kind='bullets', per=.9),
      Device('iPhone and iPad', 'phone', S['m_feed'][0], [('Open triven.fit in Chrome or Safari', 'Sign in as usual.'), ('Tap the Share button', 'In Chrome it\u2019s in the address bar; in Safari, in the toolbar.'),
                                                          ('Tap Add to Home Screen', 'Scroll down the list if you don\u2019t see it, then tap Add.')]),
      Device('Android', 'phone', S['m_tri'][0], [('Open triven.fit in Chrome', 'Sign in as usual.'), ('Tap Install app', 'If it doesn’t pop up, tap the three-dot menu, then Add to home screen.'),
                                                ('Tap Install', 'Triven appears with your other apps.')]),
      Device('Mac or Windows', 'laptop', S['d_feed'][0], [('Open triven.fit in Chrome or Edge', 'Sign in as usual.'), ('Click Install app', 'At the top of the page, next to your name.'),
                                                                     ('Click Install', 'It opens in its own window, and goes in your Applications or Start menu.')]),
      Device('Mac: Safari', 'laptop', DESK, [('Open triven.fit in Safari', 'Needs macOS Sonoma or later.'), ('File → Add to Dock', 'Or the Share button → Add to Dock.'), ('Click Add', 'Triven sits in your Dock.')]),
      Device('One account, every device', 'phone', S['m_log'][0], [('Sign in once on each device', 'Everything you upload or sync shows up everywhere.'), ('Remove it like any other app', 'Your data stays in your account.')], kind='bullets'),
      End('Automatic sync with intervals.icu'),
    ]
