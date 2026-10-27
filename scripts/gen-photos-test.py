#!/usr/bin/env python3
"""
PHOTOS DE TEST DU COMPOSANT PHOTO (bout 7c-1) — générées ici, jamais prises dans un dossier client.

Écrit dans scripts/fixtures/photos/ :
  photo-24mpx.jpg ..... 6000×4000 (24 Mpx), ~6 Mo, EXIF « appareil » + GPS factices : la taille d'un JPEG
                        d'iPhone récent. Dégradés + bruit gaussien (un aplat se compresserait à 300 Ko).
  photo-tournee.jpg ... stockée en PAYSAGE avec EXIF Orientation = 6 (« tourner de 90° à droite pour
                        afficher ») : affichée correctement, c'est un PORTRAIT, ROUGE EN HAUT, BLEU EN BAS.
                        Si l'orientation est ignorée, le rouge se retrouve À GAUCHE.
  photo.png ........... 1200×900, PNG.
  faux.jpg ............ du texte nommé .jpg : pas une image.
  photo.heic .......... HEIC (sips, macOS) — l'iPhone par défaut.

USAGE : python3 scripts/gen-photos-test.py   (numpy + Pillow ; sips pour le HEIC)
"""
import os, subprocess
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'photos')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def photo_like(w, h, bruit):
    """Une « photo » : trois dégradés croisés et un bruit gaussien — de quoi peser comme une vraie."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    r = 120 + 90 * np.sin(x / w * 3.1) * np.cos(y / h * 2.3)
    g = 110 + 80 * np.cos(x / w * 1.7 + y / h * 2.9)
    b = 100 + 70 * np.sin((x + y) / (w + h) * 5.0)
    img = np.stack([r, g, b], -1) + rng.normal(0, bruit, (h, w, 3)).astype(np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

def exif_appareil(orientation=None):
    ex = Image.Exif()
    ex[0x010F] = 'LeStud Test'          # Make
    ex[0x0110] = 'Appareil factice'     # Model
    if orientation: ex[0x0112] = orientation
    gps = ex.get_ifd(0x8825)            # GPS factice (Marseille) : il doit DISPARAÎTRE à l'envoi
    gps[1] = 'N'; gps[2] = (43.0, 17.0, 46.0); gps[3] = 'E'; gps[4] = (5.0, 23.0, 25.0)
    return ex

# 1. 24 Mpx, ~6 Mo
p24 = photo_like(6000, 4000, 10)
p24.save(os.path.join(OUT, 'photo-24mpx.jpg'), quality=88, exif=exif_appareil())

# 2. Tournée par EXIF : l'image AFFICHÉE est un portrait 1200×1600, rouge en haut, bleu en bas.
affiche = Image.new('RGB', (1200, 1600), (32, 80, 231))
affiche.paste((200, 60, 40), (0, 0, 1200, 800))
# Orientation 6 = « tourner de 90° dans le sens horaire pour afficher » → on stocke l'inverse (90° anti-horaire).
stocke = affiche.rotate(90, expand=True)
stocke.save(os.path.join(OUT, 'photo-tournee.jpg'), quality=90, exif=exif_appareil(6))

# 3. PNG
photo_like(1200, 900, 4).save(os.path.join(OUT, 'photo.png'))

# 4. Faux .jpg
with open(os.path.join(OUT, 'faux.jpg'), 'w') as f:
    f.write('Ceci n’est pas une photo : un fichier texte renommé en .jpg.\n')

# 5. HEIC (macOS : sips)
src = os.path.join(OUT, '_source-heic.jpg')
photo_like(3024, 4032, 6).save(src, quality=92)
try:
    subprocess.run(['sips', '-s', 'format', 'heic', src, '--out', os.path.join(OUT, 'photo.heic')], check=True, capture_output=True)
finally:
    os.remove(src)

for n in sorted(os.listdir(OUT)):
    print(f'{n:20s} {os.path.getsize(os.path.join(OUT, n)) / 1024 / 1024:6.2f} Mo')
