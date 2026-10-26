#!/usr/bin/env python3
"""
GRAIN DE L'APP LELAB — une tuile 256×256 de bruit monochrome, répétée en background-image.
Spec : ~/lestud-os/LELAB-DESIGN.md §1 (« une tuile PNG 256 px, jamais un filtre SVG par élément »).

⚠️ UN BIT PAR PIXEL, ET C'EST LE POIDS QUI L'IMPOSE. Du bruit est incompressible par nature : une tuile
   en 256 niveaux de gris pèse ~65 Ko quoi qu'on fasse. En noir OU blanc, elle tient en ~8 Ko — sous les
   12 Ko visés. Le rendu ne s'en ressent pas : la tuile est posée à 10–14 % d'opacité, et les deux modes
   de fusion n'utilisent chacun qu'un côté du bruit (screen n'éclaire que par les blancs, multiply
   n'assombrit que par les noirs). Les niveaux intermédiaires seraient du poids sans effet.
⚠️ GRAINE FIXE : même script, même fichier, à l'octet. Changer GRAINE ou DENSITE change le rendu de toute
   l'app — à revérifier sur iPhone.

USAGE :  python3 scripts/gen-grain.py      (depuis la racine du dépôt)
PRÉREQUIS : Pillow
"""
import os, random
from PIL import Image

COTE = 256
GRAINE = 26102026
DENSITE = 0.5          # part de pixels blancs

alea = random.Random(GRAINE)
tuile = Image.new('1', (COTE, COTE))
tuile.putdata([255 if alea.random() < DENSITE else 0 for _ in range(COTE * COTE)])

sortie = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'grain.png')
tuile.save(sortie, optimize=True)
print(f'assets/grain.png  {COTE}×{COTE}, 1 bit, {os.path.getsize(sortie)} octets')
