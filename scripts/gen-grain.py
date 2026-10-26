#!/usr/bin/env python3
"""
GRAIN DE L'APP LELAB — deux tuiles 128×128 de bruit gaussien en niveaux de gris, répétées en background-image.
Spec : ~/lestud-os/LELAB-DESIGN.md §1 (« une tuile PNG, jamais un filtre SVG par élément »).

⚠️ 8 BITS, GAUSSIEN, CENTRÉ SUR 128 — ET C'EST CE QUI REND LE SOFT-LIGHT NEUTRE. En soft-light, un gris
   à 128 ne change rien ; au-dessus il éclaire, en dessous il assombrit. Un bruit centré sur 128 laisse
   donc la luminance MOYENNE d'une surface presque intacte : il texture sans salir (mesuré par
   scripts/mesure-charte.js). La v1 était un bruit 1 bit (noir ou blanc) en multiply : chaque point noir
   assombrissait, le papier paraissait sablé et le contraste du texte en pâtissait.
⚠️ DEUX TUILES, LE MÊME BRUIT. Le soft-light n'est pas symétrique sur un fond très sombre : il éclaire plus
   qu'il n'assombrit (sa branche « claire » vaut ~4×Cb quand Cb ≤ 0,25). Centré sur 128, le grain
   éclaircissait le fond nuit de +11 % et l'encre de +7 % en luminance moyenne. Aucune moyenne unique ne
   tient les cinq surfaces sous ±1,5 % (mesuré : les sombres veulent ~116, les claires ≥ 121). D'où :
     grain.png ........ moyenne 128 — papier, violet, fond jour
     grain-sombre.png . moyenne 116 — fond nuit, encre (« à voir » en jour)
   Même graine, même écart-type : seule la moyenne glisse, la texture est identique.
⚠️ PAS DE PIXEL EXTRÊME (clip 40–215) : un pixel à 0 ou 255 en soft-light fait les pires cas de contraste.
⚠️ 128 PX ET NON 256, À CAUSE DU POIDS : un bruit 8 bits se compresse mal (~6,8 bits utiles par pixel).
   256² pèserait ~55 Ko ; 128² tient sous 20 Ko. La tuile est rendue à 128 px CSS (background-size), donc
   sans étirement.
⚠️ GRAINE FIXE : même script, même fichier, à l'octet. Changer un réglage change le rendu de toute l'app —
   à revérifier sur iPhone.

USAGE :  python3 scripts/gen-grain.py      (depuis la racine du dépôt)
PRÉREQUIS : Pillow
"""
import os, random
from PIL import Image

COTE = 128
GRAINE = 26102026
ECART = 28
BAS, HAUT = 40, 215
TUILES = {'grain.png': 128, 'grain-sombre.png': 116}

for nom, moyenne in TUILES.items():
    alea = random.Random(GRAINE)
    tuile = Image.new('L', (COTE, COTE))
    tuile.putdata([min(HAUT, max(BAS, round(alea.gauss(moyenne, ECART)))) for _ in range(COTE * COTE)])
    sortie = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', nom)
    tuile.save(sortie, optimize=True)
    print(f'assets/{nom:17s} {COTE}×{COTE}, 8 bits, moyenne {moyenne}, {os.path.getsize(sortie)} octets')
