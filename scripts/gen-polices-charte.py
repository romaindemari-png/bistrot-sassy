#!/usr/bin/env python3
"""
POLICES DE L'APP LELAB — Instrument Serif (400 + italique) et Instrument Sans (400/500/600), en woff2.
Source : le dépôt google/fonts, FIGÉ à un commit (reproductible). Licence OFL 1.1, copiée à côté.
Spec : ~/lestud-os/LELAB-DESIGN.md §3.

⚠️ CE NE SONT PAS LES POLICES DU CLIENT. Canela et Elms (assets/fonts/canela.woff2, elms.woff2) sont
   celles de Sassy, lues par le moteur v2 via client-tokens.js. Celles-ci sont celles de l'APP, communes
   à tous les forks. Les deux familles ne doivent jamais se croiser.
⚠️ Les OFL des deux familles ne déclarent AUCUN « Reserved Font Name » : instancier la variable d'Instrument
   Sans en trois graisses statiques et garder son nom est autorisé.
⚠️ PAS DE U+202F (espace fine insécable) dans les deux familles — vérifié sur la cmap. Une espace fine
   tapée dans l'app sera dessinée par une police de repli : utiliser U+00A0, présente.

USAGE :  python3 scripts/gen-polices-charte.py      (depuis la racine du dépôt, réseau requis)
PRÉREQUIS : fontTools + brotli (pip install fonttools brotli)
"""
import io, os, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

COMMIT = 'e7db6ca603fd4862010383ff17ffd6cc4ffac1c0'   # google/fonts main du 23/10/2026
BASE = f'https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl'
SORTIE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'fonts')


def telecharger(chemin):
    with urllib.request.urlopen(f'{BASE}/{chemin}') as r:
        return r.read()


def woff2(police, nom):
    police.flavor = 'woff2'
    police.save(os.path.join(SORTIE, nom))
    print(f'  {nom:34s} {os.path.getsize(os.path.join(SORTIE, nom)):>7} octets')


os.makedirs(SORTIE, exist_ok=True)

for src, nom in [('instrumentserif/InstrumentSerif-Regular.ttf', 'instrument-serif-400.woff2'),
                 ('instrumentserif/InstrumentSerif-Italic.ttf', 'instrument-serif-400-italic.woff2')]:
    woff2(TTFont(io.BytesIO(telecharger(src))), nom)

# ⚠️ L'axe wdth est figé à 100 (largeur normale) : la spec ne demande aucune version étroite.
variable = telecharger('instrumentsans/InstrumentSans%5Bwdth,wght%5D.ttf')
for graisse in (400, 500, 600):
    woff2(instantiateVariableFont(TTFont(io.BytesIO(variable)), {'wght': graisse, 'wdth': 100},
                                  updateFontNames=True), f'instrument-sans-{graisse}.woff2')

# Les deux OFL ont un corps identique ; seules leurs lignes de copyright diffèrent → les deux en tête.
serif = telecharger('instrumentserif/OFL.txt').decode('utf-8')
sans = telecharger('instrumentsans/OFL.txt').decode('utf-8')
entete_sans = sans.split('\n', 1)[0]
with open(os.path.join(SORTIE, 'OFL.txt'), 'w', encoding='utf-8') as f:
    f.write('Instrument Serif et Instrument Sans — fichiers servis par l\'app LeLab (instrument-*.woff2).\n'
            'Canela et Elms, dans ce même dossier, ne relèvent PAS de cette licence.\n\n')
    f.write(entete_sans + '\n' + serif)
print('  OFL.txt')
