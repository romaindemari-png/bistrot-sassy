# LeLab — Spécification produit

> Mémoire produit du projet. À lire en priorité avant toute évolution.
> Statut : fondation réparée et vérifiée en prod + **système de blocs complet et fonctionnel** (config + site + admin) + **consolidation CMS entamée** (telephone & whatsapp pilotés par la donnée). Reste à faire : **interface LeLab visuelle (redesign, charte violette)**.

---

## VISION

Agence de **sites vitrines clés en main pour les commerces de bouche** (restaurants, cafés, glaciers, bars, boulangeries…), développés via **Claude + GitHub + Netlify**.

Deux produits :

- **LeLab** — l'éditeur de site (offre d'entrée). Le client édite le contenu de son site et publie sur Instagram de façon restreinte. Couleur d'accent : **violet `#CAB4FF`**.
- **LeLab+** — le studio Instagram premium. Création de contenu Insta avancée (thèmes, formats, IA, preview). Couleur d'accent : **jaune `#FFF28C`**.

---

## OFFRES & TARIFS

**Setup**
- 590€ — site vitrine sur-mesure livré (basé sur une maquette en demi-journée, système de blocs)

**Abonnements**
- LeLab : 49€/mois — admin autonome + publication Insta basique (carte/events) + hébergement + domaine inclus
- LeLab+ : 89€/mois — tout LeLab + studio Instagram complet (thèmes adaptatifs, 3 formats, IA, preview live)

**Évolutions**
- Blocs existants désactivés/réactivés : inclus dans l'abonnement (c'est un interrupteur, pas du dev)
- Évolution custom (nouvelle section, refonte) : à partir de 150€, devis avant intervention

**Workflow commercial**
1. Démo complète présentée avec TOUS les blocs activés
2. À la signature, désactivation des blocs inutiles pour ce client (10 secondes)
3. Upsell LeLab+ naturel quand le client ressent la limite sur Instagram

**Positionnement face à la concurrence**
- Ne pas entrer dans une comparaison de prix avec les outils généralistes (Orylis & co)
- Argument clé : sur-mesure quali + Instagram intégré (eux n'y touchent pas) + accompagné + démo réelle
- La démo Sassy est l'argument de vente principal — pas le discours

---

## CHARTE GRAPHIQUE

**Neutres**
- Noir : `#0A0A0A`
- Blanc : `#FFFFFF`
- Gris fond (bg) : `#FAFAF8`
- Gris carte (card) : `#F4F4F2`
- Bordures : `#E8E8E6`
- Texte gris : `#6B6B6B`

**Accents**
- Violet (LeLab) : `#CAB4FF`
- Jaune (LeLab+) : `#FFF28C`

**Typographie**
- Titres : **Bricolage Grotesque**
- Texte : **Inter**

**Principes visuels** (inspiration Qonto)
- Pavés noirs massifs + aplats de couleur pleine
- Gros titres
- Pictos dans des carrés arrondis
- Beaucoup de blanc / d'espace

**Règle technique impérative**
- Toujours forcer `color-scheme: light` pour éviter le dark mode automatique des webviews.

---

## ARCHITECTURE TECHNIQUE

*(état tel que réparé et vérifié en production)*

- **Site statique** : un seul `index.html`, **sans build**. Netlify sert la racine telle quelle.
- **Données** : `_data/*.json` — `general`, `horaires`, `carte`, `photos`, `events`.
- **Injection** : `sassy-cms-loader.js` charge les JSON et les injecte dans le DOM par **ID** (ex. `cms-entrees`, `cms-desserts`, slider, galerie). Les événements sont rendus par un petit script inline qui lit `_data/events.json`.
- **Admin** : `admin/index.html` (panneau **custom**, pas Decap) qui **POST** vers `netlify/functions/save-data.js`.
- **Sauvegarde** : `save-data.js` écrit dans GitHub via le **proxy Git Gateway**.
  - URL = `${process.env.URL}/.netlify/git/github` — **PAS** `api.netlify.com`.
  - Authentification : le **token Netlify Identity** de l'utilisateur (Bearer), relayé à Git Gateway.
  - Chaque sauvegarde = **commit GitHub = redéploiement Netlify**.
- **Prérequis Netlify** : **Netlify Identity** et **Git Gateway** activés ; variable d'env **`NETLIFY_SITE_ID`** présente.
- **Autre fonction** : `netlify/functions/publish-instagram.js` (publication post simple / carrousel via l'API Graph Instagram ; env `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_ACCOUNT_ID`).

---

## SYSTÈME DE BLOCS

*(✅ FAIT et déployé — validé de bout en bout en prod)*

Chaque site = un **SOCLE commun** + des **BLOCS optionnels** activables par client.

**Socle** (toujours présent pour tout commerce de bouche)
- **LA CARTE** — menu / parfums / boissons selon le type de commerce
- **PHOTOS** — slider + galerie
- **INFOS** — adresse, horaires, contact

**Blocs optionnels** (on/off selon le client)
- **ÉVÉNEMENTS**
- À venir : **menu du jour**, **avis**, etc.

**Sur-mesure**
- La **charte** (couleurs / typo / ton) propre à chaque commerce.

**Réalisé (déployé, validé de bout en bout en prod)**
- ✅ `_data/config.json` créé — **socle** : carte / photos / infos ; **optionnels** : events, reservation.
- ✅ Le **site** (`sassy-cms-loader.js`) lit `config.json` et **masque les blocs optionnels désactivés** — règle **fallback = tout afficher** (config absent / illisible) testée.
- ✅ L'**admin LeLab** expose des **interrupteurs** pour activer / désactiver les blocs optionnels (**socle verrouillé**, non désactivable) et écrit `config.json` via **save-data**.

---

## CONSOLIDATION CMS

*(brancher les champs « en dur » de `index.html` pour qu'ils soient pilotés par `_data/*.json` et éditables via l'admin)*

- **Injection par classe** : `sassy-cms-loader.js` dispose, en plus des helpers par **id** (`setText` / `setAttr`), de helpers par **classe** (`setTextAll` / `setAttrAll`). Ils pilotent **tous** les éléments `.cms-x` d'un coup → un champ affiché à plusieurs endroits se met à jour partout en une fois.
- **✅ Fait (validé en prod)** :
  - **`telephone`** — pilote les **3 emplacements** (CTA réservation, bloc adresse, bloc contact) via `.cms-telephone` / `.cms-tel-link`.
  - **`whatsapp`** — numéro du FAB piloté par la donnée via `.cms-whatsapp` ; **message pré-rempli `?text=…` conservé en dur** dans le loader (rendu et comportement identiques). `id="wa"` conservé (utilisé par le CSS).
- **🗓️ Reportés au redesign** (touchent à l'affichage) :
  - **`adresse`** — affichée sur 2 lignes (`<br/>`), JSON sur 1 ligne.
  - **`horaires`** — JSON **par jour** vs affichage **condensé** (`lun–ven…`), structures incompatibles.
  - **`nom`** — tissé dans des titres / phrases, pas de cible d'affichage autonome.
  - **`description` / `email` / `horaires.note`** — présents en JSON mais **affichés nulle part** → décision design (créer un emplacement).
- **⚠️ Chaînon à compléter un jour** : `instagram` / `facebook` — l'admin les enregistre, mais ils ne sont ni dans `general.json` ni affichés sur le site.

---

## FRONTIÈRE LELAB vs LELAB+

**LeLab** (offre d'entrée)
- Éditer le contenu du site.
- Publier sur Instagram de façon **restreinte** : post simple uniquement, depuis la **carte** ou les **events**, avec légende générée par IA.
- La publication restreinte passe par une **popup simple** : aperçu Insta + légende IA + bouton publier + **renvoi upsell vers LeLab+**. **Pas** de choix de thème ni de format.

**LeLab+** (studio Insta complet)
- Thèmes (dont certains **typo-only**, ex. « menu du jour »).
- **3 formats** : post / story / carrousel.
- IA + **preview live**.

**Accès**
- Un client **LeLab+** a accès aux deux via une **bascule**.
- Un client **LeLab** voit LeLab+ **verrouillé** (upsell).

### Studio LeLab+ — flux designé

- **Étapes guidées** : **Thème → Contenu → Légende / IA → Publier**, avec une **preview Instagram live** (cadre téléphone réaliste) qui se met à jour en direct.
- **Règle clé — thèmes adaptatifs** : le contenu de l'**étape 2 (Contenu)** change selon le **thème** choisi.
  - Thèmes **« photo »** (ex. plat du jour, photo d'ambiance, événement) → **upload de photo** + texte + **3 formats** (post / story / carrousel).
  - Thèmes **« typo-only »** (ex. menu du jour) → **PAS d'upload photo** : le client saisit seulement **titre + plats / prix**, et le visuel est **généré automatiquement dans la charte graphique du commerce** (couleurs / typo du client). **Formats limités** (post / portrait).
- **Vocabulaire produit** : on dit **« thème »** — jamais « template » (jugé trop industriel).

---

## MAQUETTES DE RÉFÉRENCE

*(prototypes HTML validés — ils décrivent le rendu cible à reproduire lors du dev ; les fichiers vivent **hors repo** pour l'instant, à intégrer progressivement)*

1. **Dashboard d'accueil LeLab+** — jaune.
2. **Éditeur de site LeLab** — violet, avec **popup de publication Insta restreinte**.
3. **Studio Instagram LeLab+**.

---

## PROCHAINE ÉTAPE

- **Éditeur photos LeLab** : ✅ **TERMINÉ** (étapes 1-5, mergé dans `main`). (1) Infra Blobs (`upload-image.mjs`, `serve-image.mjs`, `package.json` ; Blobs en mode manuel `SITE_ID` + `NETLIFY_API_TOKEN`). (2) Affichage des photos actuelles. (3) Upload slider (canvas JPEG + Blobs + auto-save) + fix `object-fit:cover` slider. (4) Galerie : ajout (max 6) / suppression + delete Blob. (5) Garde-fous : verrou anti-upload concurrent (`isUploading`), validation `createImageBitmap` (rejet non-image), cohérence Blob/JSON (rollback du blob orphelin si save échoue ; suppression de l'ancienne image côté client après save), magic bytes serveur (JPEG/PNG/WebP). **Bonus site** : carousel galerie (`index.html`/`sassy-cms-loader.js`) — grille si ≤4, carousel horizontal si >4 (flèches desktop + scroll tactile mobile, scroll-snap).
- **Redesign visuel LeLab** (charte violette) : reporté après photos.
- **LeLab+** : tester le déverrouillage avec un vrai client (changer `config.plan` à `lelab_plus`).
- **Éditeur events** : ✅ **FAIT** — éditeur dans l'admin (titre, date, heure, description ; ajout/suppression, max 5 ; save via `saveSection` section `events` → `_data/events.json`). Sans photo. Le site rend la liste via le script inline (`#events-grid`, filtre dates passées).
- **Studio LeLab+** : ✅ **intégré** dans l'admin (`screen-studio`, déverrouillé si `config.plan = lelab_plus`). Thèmes adaptatifs (plat / menu / ambiance / événement → photo vs typo), formats (Story désactivé pour les thèmes typo), éditeur de plats avec « Ajouter un plat », preview Instagram live. CSS additif, IDs camelCase, JS `selectTheme`/`selectFmt`/`setFmtAvailability`/`addDish`/`renderStudio`. ⚠️ **Encore une maquette** : le bouton « Publier » n'est pas branché. **Wiring à faire** : générer le visuel (photo, ou typo → image rendue dans la charte) puis POST vers `publish-instagram` (connexion **OAuth Instagram déjà en place**). C'est l'étape qui rend le studio réellement fonctionnel.

---

## TODO

- ~~Correctif éditeur horaires admin~~ ✅ Résolu (format HHhMM, garde-fou ouvert sans heures)

---

## CONNEXION INSTAGRAM (OAuth)

*(✅ connexion validée en dev)*

- **Flow** : **Instagram API with Instagram Login** — connexion **directe au compte Instagram pro**, **sans Page Facebook ni Business** (l'ancien flux « Facebook Login for Business » est abandonné : `/me/accounts` restait vide pour une Page possédée par un Business Portfolio).
- **App Meta** : **LeLab Social** — Instagram App ID `1300156898763730` (app distincte de l'ancienne, type Business avec produit *Instagram → API setup with Instagram login*).
- **Endpoints** : auth `instagram.com/oauth/authorize` → échange `api.instagram.com/oauth/access_token` (token court + `user_id`) → token long `graph.instagram.com/access_token?grant_type=ig_exchange_token` (~60 j) → publication sur `graph.instagram.com/v21.0/{igUserId}/media(_publish)`.
- **Fonctions** : `instagram-auth.js` (redirection), `auth-callback.mjs` (échange + stockage), `publish-instagram.js` (lit la connexion, fallback env conservé).
- **Stockage** : Netlify **Blobs** (store `instagram`, clé `connection`) → `{ igUserId, accessToken, username, connectedAt }`. Privé, par site (= par client).
- **Variables Netlify** : `IG_APP_ID`, `IG_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` (= `…/.netlify/functions/auth-callback`). Les anciennes `INSTAGRAM_APP_ID/SECRET` (Facebook) sont obsolètes.
- **Bouton admin** : « Connecter Instagram » (écran Publier) → `/.netlify/functions/instagram-auth`.
- **Statut** : ✅ **connexion validée en dev avec `@lestud13`**.
- **Reste à faire** : (1) **refresh** du token long-lived avant ~60 j (`ig_refresh_token`, à planifier) ; (2) **App Review** des permissions `instagram_business_basic` + `instagram_business_content_publish` (+ vérif Business) pour publier en prod sur des comptes non-testeurs.

---

## DÉPLOIEMENT

- Repo GitHub → **Netlify auto-publish depuis `main`**.
- Le vrai site Sassy : **gorgeous-heliotrope-e2e59d.netlify.app**.

---

## MÉTHODE NOUVEAU CLIENT

*(intention, à affiner)*

- Partir de **ce repo** comme base.
- Remplacer `_data/*.json` + la charte + `config.json`.
- Brancher **GitHub + Netlify + Git Gateway**.
- Le **template réutilisable** sera extrait plus tard, une fois LeLab fini.
