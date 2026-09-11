#!/usr/bin/env python3
"""Génère les habillages des thèmes du master (carré / portrait / story).

Dessinés en HTML/CSS avec les VRAIES fonts du site (Canela + Elms, extraites des
@font-face base64 de index.html) puis rasterisés en PNG via Chrome headless.
Aucune valeur de charte en dur ailleurs que dans DA ci-dessous.

  python3 _data/themes/gen-habillages.py            # tous les thèmes
  python3 _data/themes/gen-habillages.py annonce    # un seul
"""
import re, subprocess, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent      # _data/themes/
ROOT = HERE.parents[1]                              # racine du site (index.html)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# ── Charte Sassy (= :root de index.html) ──
DA = dict(blue='#2050E7', cream='#FAF1E2', yellow='#FFF08B')

# ── Fonts : on réutilise les @font-face base64 déjà embarqués dans le site ──
faces = re.findall(r'@font-face\s*\{[^}]*\}', (ROOT / 'index.html').read_text(encoding='utf-8'))
FONTS = '\n'.join(f for f in faces if "'Canela'" in f or "'Elms'" in f)
assert "'Canela'" in FONTS and "'Elms'" in FONTS, 'fonts introuvables dans index.html'

BASE = """<!doctype html><meta charset="utf-8">
<style>
{fonts}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{w}px;height:{h}px;overflow:hidden}}
body{{position:relative;font-kerning:normal;-webkit-font-smoothing:antialiased;background:{bg}}}
{css}
</style>
{body}
"""

# ════════════════════════════════════════════════════════════════════
# DU JOUR — fond crème, badge jaune, titre Canela cuit dans le PNG.
# zoneListe reprise du thème "sassy-carte" (valeurs éprouvées par le renderer) :
# l'habillage est composé AUTOUR d'elle (titre au-dessus, signature en dessous).
# ════════════════════════════════════════════════════════════════════
DUJOUR_CSS = """
/* filet de cadrage — respiration, pas de décor bavard */
.frame{position:absolute;inset:40px;border:2px solid %(blue)s;opacity:.18}

/* badge : jaune bordé bleu (repris du .event-date-badge du site) */
.badge{position:absolute;left:50%%;top:%(badge_pct)s%%;transform:translate(-50%%,-50%%);
  background:%(yellow)s;border:2px solid %(blue)s;padding:11px 26px 9px;
  font-family:'Elms',sans-serif;font-size:23px;font-weight:500;letter-spacing:.22em;
  text-transform:uppercase;color:%(blue)s;white-space:nowrap}

/* titre "cuit" dans le PNG — le studio ne pose QUE la liste produits/prix */
.title{position:absolute;left:0;right:0;top:%(title_pct)s%%;text-align:center;
  font-family:'Canela',Georgia,serif;font-weight:900;font-size:%(title)spx;line-height:1;
  color:%(blue)s;text-transform:lowercase}
.rule{position:absolute;left:50%%;top:%(rule_pct)s%%;transform:translateX(-50%%);
  width:96px;height:2px;background:%(blue)s;opacity:.28}

/* signature bas de page */
.sig{position:absolute;left:0;right:0;top:%(sig_pct)s%%;text-align:center;
  font-family:'Elms',sans-serif;font-size:20px;font-weight:500;letter-spacing:.28em;
  text-transform:uppercase;color:%(blue)s;opacity:.5}
"""
DUJOUR_BODY = """<div class="frame"></div>
<div class="badge">aujourd'hui</div>
<div class="title">le plat du jour</div>
<div class="rule"></div>
<div class="sig">bistrot sassy</div>"""

DUJOUR = {
    'carre':    dict(w=1080, h=1080, zone_y=.40, zone_h=.34, badge=.145, title=96,  sig=.90),
    'portrait': dict(w=1080, h=1350, zone_y=.36, zone_h=.33, badge=.125, title=104, sig=.915),
    'story':    dict(w=1080, h=1920, zone_y=.32, zone_h=.34, badge=.150, title=104, sig=.885),
}

def dujour_page(f):
    zone_top = f['zone_y'] * 100
    vals = dict(DA, badge_pct=f['badge'] * 100, title_pct=f['badge'] * 100 + 4.4,
                rule_pct=zone_top - 4.5, sig_pct=f['sig'] * 100, title=f['title'])
    return BASE.format(fonts=FONTS, w=f['w'], h=f['h'], bg=DA['cream'],
                       css=DUJOUR_CSS % vals, body=DUJOUR_BODY)

# ════════════════════════════════════════════════════════════════════
# ANNONCE — post libre : le MESSAGE domine, l'habillage se tait.
# Aplat bleu + AFFICHE crème posée dessus (le message est peint DANS l'affiche).
# ⚠️ Le fond de la zone de texte doit rester CLAIR : paintInfos peint le texte en
# encre (#211f1e) et n'accepte pas de couleur par thème. Un aplat bleu plein
# rendrait le message illisible → d'où l'affiche.
# Aucun gros titre cuit (contrairement au "du jour") : la place est au message.
# ════════════════════════════════════════════════════════════════════
ANNONCE_CSS = """
/* l'affiche : c'est elle qui porte le message */
.sheet{position:absolute;left:%(px)spx;right:%(px)spx;top:%(py)spx;bottom:%(py)spx;
  background:%(cream)s}
/* barre jaune : seul accent, ancre le haut de l'affiche */
.tab{position:absolute;left:50%%;top:%(tab_pct)s%%;transform:translate(-50%%,-50%%);
  width:132px;height:16px;background:%(yellow)s;border:2px solid %(blue)s}
.eyebrow{position:absolute;left:0;right:0;top:%(eyebrow_pct)s%%;text-align:center;
  font-family:'Elms',sans-serif;font-size:22px;font-weight:500;letter-spacing:.32em;
  text-transform:uppercase;color:%(blue)s;opacity:.8}
.sig{position:absolute;left:0;right:0;top:%(sig_pct)s%%;text-align:center;
  font-family:'Elms',sans-serif;font-size:19px;font-weight:500;letter-spacing:.28em;
  text-transform:uppercase;color:%(blue)s;opacity:.42}
"""
ANNONCE_BODY = """<div class="sheet"></div>
<div class="tab"></div>
<div class="eyebrow">annonce</div>
<div class="sig">bistrot sassy</div>"""

# px/py = marge de l'affiche (aplat bleu visible autour). zone_* = zoneTexte du thème.
ANNONCE = {
    'carre':    dict(w=1080, h=1080, px=58, py=58,  zone_y=.38, zone_h=.28, tab=.155, eyebrow=.195, sig=.885),
    'portrait': dict(w=1080, h=1350, px=58, py=72,  zone_y=.36, zone_h=.28, tab=.135, eyebrow=.170, sig=.905),
    'story':    dict(w=1080, h=1920, px=58, py=150, zone_y=.38, zone_h=.24, tab=.150, eyebrow=.180, sig=.875),
}

def annonce_page(f):
    vals = dict(DA, px=f['px'], py=f['py'], tab_pct=f['tab'] * 100,
                eyebrow_pct=f['eyebrow'] * 100, sig_pct=f['sig'] * 100)
    return BASE.format(fonts=FONTS, w=f['w'], h=f['h'], bg=DA['blue'],
                       css=ANNONCE_CSS % vals, body=ANNONCE_BODY)

THEMES = {
    'dujour':  (DUJOUR,  dujour_page,  'zoneListe'),
    'annonce': (ANNONCE, annonce_page, 'zoneTexte'),
}

wanted = sys.argv[1:] or list(THEMES)
for name in wanted:
    formats, render, zone_key = THEMES[name]
    for fmt, f in formats.items():
        src = HERE / f'_src-{name}-{fmt}.html'
        src.write_text(render(f), encoding='utf-8')
        png = HERE / f'sassy-{name}-{fmt}.png'
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=1',
                        f'--window-size={f["w"]},{f["h"]}',
                        f'--screenshot={png}', src.as_uri()],
                       check=True, capture_output=True)
        src.unlink()
        print(f'✓ {png.name}  {f["w"]}×{f["h"]}  {zone_key} y={f["zone_y"]} h={f["zone_h"]}')
