# LeLab — Spécification produit

> Mémoire produit du projet. À lire en priorité avant toute évolution.
> Statut : **admin LeLab/LeLab+ en prod** (charte violette/jaune, **login custom GoTrue** compatible Safari iOS) — éditeurs carte / horaires / contact / photos / events + interrupteurs de blocs + **studio LeLab+** (stepper, upload photo, pass UX complète : nav simplifiée, footer sticky, preview sheet, persistance, étape 4 + bandeau redesignés) ; **connexion Instagram OAuth validée en dev**. Reste à faire : **backlog studio à partir du point 3** (contenu Story, carrousel, IA légende, wiring « Publier », etc. — voir PROCHAINE ÉTAPE).

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
- **Prérequis Netlify** : **Netlify Identity** + **Git Gateway** activés (pour `save-data` via `process.env.URL`) ; **Netlify Blobs** pour les images/connexion Insta, en mode manuel via `SITE_ID` (auto) + `NETLIFY_API_TOKEN`.
- **Stockage médias / connexion** : **Netlify Blobs** — store `photos` (images uploadées) et store `instagram` (connexion OAuth). Fonctions : `upload-image.mjs`, `serve-image.mjs`.
- **Instagram** : `instagram-auth.js` + `auth-callback.mjs` (OAuth, voir section CONNEXION INSTAGRAM) ; `publish-instagram.js` lit la connexion depuis Blobs (fallback env `INSTAGRAM_ACCESS_TOKEN`/`ACCOUNT_ID`).

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
  - **`horaires`** — ✅ rendu **dynamique** : `sassy-cms-loader.js` regroupe les jours consécutifs de mêmes horaires (`lun–mer…`) sur 2 emplacements (`#cms-horaires` + `#cms-horaires-compact`) ; éditeur admin durci (format `HHhMM`, garde-fou ouvert sans heures).
- **🗓️ Reportés au redesign** (touchent à l'affichage) :
  - **`adresse`** — affichée sur 2 lignes (`<br/>`), JSON sur 1 ligne.
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

*(prototypes HTML — ✅ **intégrés dans l'admin puis supprimés du repo** ; conservés ici pour mémoire du rendu cible)*

1. **Dashboard d'accueil LeLab+** — jaune.
2. **Éditeur de site LeLab** (`lelab.html`) — violet → devenu le **shell de `admin/index.html`**.
3. **Studio Instagram LeLab+** (`lelab-studio.html`) → intégré comme **studio enrichi** (`screen-studio`).

---

## PROCHAINE ÉTAPE

- **Éditeur photos LeLab** : ✅ **TERMINÉ** (étapes 1-5, mergé dans `main`). (1) Infra Blobs (`upload-image.mjs`, `serve-image.mjs`, `package.json` ; Blobs en mode manuel `SITE_ID` + `NETLIFY_API_TOKEN`). (2) Affichage des photos actuelles. (3) Upload slider (canvas JPEG + Blobs + auto-save) + fix `object-fit:cover` slider. (4) Galerie : ajout (max 6) / suppression + delete Blob. (5) Garde-fous : verrou anti-upload concurrent (`isUploading`), validation `createImageBitmap` (rejet non-image), cohérence Blob/JSON (rollback du blob orphelin si save échoue ; suppression de l'ancienne image côté client après save), magic bytes serveur (JPEG/PNG/WebP). **Bonus site** : carousel galerie (`index.html`/`sassy-cms-loader.js`) — grille si ≤4, carousel horizontal si >4 (flèches desktop + scroll tactile mobile, scroll-snap).
- **Déverrouillage LeLab+** : ✅ testé (dev `@lestud13` + bascule `config.plan` en prod). Reste : activer pour un **vrai client payant**.
- **Redesign visuel du site public** (charte) : optionnel/à voir — l'**admin** est déjà à la charte LeLab.
- **Éditeur events** : ✅ **FAIT** — éditeur dans l'admin (titre, date, heure, description ; ajout/suppression, max 5 ; save via `saveSection` section `events` → `_data/events.json`). Sans photo. Le site rend la liste via le script inline (`#events-grid`, filtre dates passées).
- **Studio LeLab+** : ✅ **intégré** dans l'admin (`screen-studio`, déverrouillé si `config.plan = lelab_plus`) — thèmes adaptatifs (plat / menu / ambiance / événement → photo vs typo), formats (Story plein écran 9:16, désactivé pour le typo), éditeur de plats, preview Instagram live (téléphone à taille fixe). ⚠️ **Reste une maquette pour la publication** : le bouton « Publier » n'est pas branché (backlog #7).
- **Pass UX Studio LeLab+** : ✅ **FAIT** (mergé dans `main`) —
  - **Navigation simplifiée** (Accueil / Mon site / Studio).
  - **Bouton « Continuer » sticky** (pied de page studio toujours visible).
  - **Preview mobile en sheet depuis le haut** (≈70vh, coins arrondis en bas, croix de fermeture + backdrop ; tap sur le bandeau pour ouvrir/fermer).
  - **Persistance du brouillon** (`sessionStorage` : thème, format, étape, légende, plats ; vidé à la déconnexion ; garde `studioReady` pour ne pas écraser au boot).
  - **Étape 4 « Publier » redesignée** (carte récap : thème / format / extrait de légende, pictos en carrés arrondis suivant l'accent du plan).
  - **Bandeau aperçu Instagram « variante A » jaune** (`#FFF28C`, miniature + sous-titre format/`en direct` + flèche animée qui pivote à l'ouverture).
- **Login admin custom GoTrue** : ✅ **FAIT** (mergé dans `main`) — formulaire maison (`/.netlify/identity/token` password grant + `/user` + refresh), session `localStorage`, auto-refresh. **Remplace le widget Netlify Identity** (cassé sur Safari iOS) ; validé sur iPhone Safari, bouton de déconnexion visible sur mobile.
- **Transitions UX studio** : ✅ **FAIT** — **slide horizontal** du stepper (étapes en `translateX`, hauteur dynamique), **typewriter** sur la légende IA (curseur clignotant), **fade** entre écrans (Accueil / Mon site / Studio), **fondu** photo à l'upload.
- **Bandeau aperçu « cinéma »** : ✅ **FAIT** — bandeau jaune `#FFF28C` (ligne de scan animée, icône Instagram pulse, point « en direct » clignotant, flèche qui pivote) + panneau clair `#fafaf8` (poignée + iPhone + bouton « Fermer ↑ »). Corrige aussi la surcharge `prefers-color-scheme:dark` qui forçait le bandeau en blanc.
- **Hashtags fantômes par thème** : ✅ **FAIT** — quand aucun vrai hashtag, tags grisés (opacity .35) selon le thème, clic → lance l'IA ; remplacés par les vrais tags après génération, jamais publiés.
- **Frictions UX corrigées** : ✅ **FAIT** — caption **vide par défaut** (placeholder) ; champ « Légende du plat » **retiré** de l'étape 2 (hors story) ; **génération IA auto conditionnelle** (one-shot, seulement si photo/plat présent) ; **upload mobile explicite** (« Appuyez pour ajouter une photo ») + choix galerie/appareil (retrait `capture`) ; **compteur de légende** `x/2200` (rouge si dépassé) ; **hashtags éditables** (× pour retirer, persistés) ; **statut Instagram live** (badge « ● Connecté @… » / « Connecter Instagram » via `get-instagram-status.mjs`, dans le studio + l'écran Publier) ; **badge « Exemple »** sur la photo placeholder.

### Backlog Studio LeLab+ (par ordre de priorité)

*(#1 et #2 ✅ faits — le backlog restant commence au point 3.)*

1. ✅ **Stepper fonctionnel** — navigation étapes 1→2→3→4 avec boutons Continuer / Retour. **FAIT.**
2. ✅ **Upload photo réel** — Blobs (`upload-image` / `serve-image`), conversion canvas, vignettes multiples. **FAIT.** Détails techniques conservés pour mémoire :
   - **Input** : `accept="image/*" capture="environment"` → appareil photo direct sur mobile **ou** galerie.
   - **Conversion canvas côté client** (aucune lib externe) :
     - lire le fichier (`FileReader` / `createImageBitmap`),
     - dessiner dans un `<canvas>` au **ratio du format choisi** (1:1 carré, 4:5 portrait, 9:16 story),
     - **recadrage centré automatique** (`cover`),
     - export **JPEG qualité 0.92** (bon compromis qualité/poids),
     - **résolutions cibles** : 1080×1080 (post), 1080×1350 (portrait), 1080×1920 (story).
   - **Loader** pendant la conversion (jamais d'écran figé).
   - **Aperçu instantané** dans la preview iPhone dès la conversion terminée.
   - **Formats acceptés** : HEIC (Apple), PNG, WebP, JPEG → tout converti en **JPEG propre** (Blobs + API Instagram n'acceptent que JPEG). ⚠️ HEIC : décodage canvas OK sur **Safari/iOS** (cas nominal : upload depuis iPhone), non garanti sur Chrome/Firefox desktop → fallback message clair si décodage impossible.
   - **Vignettes multiples** pour le carrousel (jusqu'à **10 photos**).
   - **Priorité** : rapide, sans bug, **sans dépendance externe**.
3. ✅ **Contenu Story adapté** — **FAIT** : en story, champ **« Texte en overlay »** (max 80, compteur) à l'étape 2 ; preview live du texte centré/blanc/ombré sur la photo ; étape 3 → note (ni légende ni hashtags) ; le bouton ✦ génère un **texte court** (max 10 mots) dans l'overlay.
4. ✅ **Carrousel** — **FAIT** : 2 à 10 photos en Post/Portrait → carrousel auto (pas de 4ᵉ format). Preview avec **compteur 1/N + icône carrés empilés**, **dots cliquables**, **swipe tactile**. Bandeau/récap adaptés. `publish-instagram.js` durci (garde 2-10 + polling `status_code`).
5. **Stories successives** — multi-photos en Story → publications séparées automatiques.
6. ✅ **IA légende** — **FAIT** : fonction `generate-caption.mjs` (protégée par JWT Identity, modèle **`claude-sonnet-4-5`**) → `{caption, hashtags}`. Le client remplit `#caption` (légende seule) + rangée `#hashtags` éditable. **Vision (Option C)** : si le champ texte est vide et qu'une photo est présente, la photo est envoyée à Claude (base64) pour identifier le plat/visuel. **Génération auto au passage 2→3** (one-shot, seulement si contenu présent) + bouton ✦ manuel. ⚠️ **Requiert `ANTHROPIC_API_KEY`** (Netlify, clé jamais exposée au client).
7. **Wiring « Publier »** → `publish-instagram` (**OAuth déjà en place**) : générer le visuel (photo, ou typo → image rendue dans la charte) puis POST.
8. **Photos d'événements** — upload dans l'éditeur Events (réutilise `fileToJpegBase64` + `upload-image` + le pattern galerie ; champ `photo` déjà dans le schéma `events.json` et déjà affiché sur le site). Ensuite `themeImage('event')` utilisera la vraie photo de l'événement.
9. **Reels (vidéo MP4)** — nouveau type de média. Contraintes techniques :
   - **Upload MP4**, codec **H.264** (audio AAC), **durée 3-90 s**, **résolution 1080×1920** (9:16).
   - **Publication différente des images** : container vidéo Instagram (`media_type=REELS`, `video_url` = URL **publique**) → le traitement est **asynchrone** : il faut **poller le statut du container** (`status_code` → `FINISHED`) **avant** `media_publish` (l'image, elle, est quasi instantanée).
   - **Hébergement** : stocker le MP4 dans **Blobs** + une fonction de service type `serve-video` (≠ `serve-image`) renvoyant l'URL publique.
   - ⚠️ **Pas de transcodage navigateur** : on ne peut pas convertir une vidéo en JS comme une image (canvas). Si l'iPhone enregistre en **HEVC/H.265** (par défaut sur iOS récent), il faudra soit demander un MP4 H.264, soit prévoir un transcodage serveur — **à cadrer**. Valider durée/format côté client reste limité.

---

## ROADMAP PRODUIT

### Phase 1 — En cours
- **Point 7 — Wiring « Publier »** : génération de l'image finale (canvas, ou typo rendue dans la charte) → **upload Blobs** + URL publique (`serve-image`) → appel `publish-instagram` (post / carrousel) → **feedback** (succès / erreur, lien vers la publication).

### Phase 2 — Après le wiring
- **Point 5 — Stories successives** (multi-photos en Story → publications séparées automatiques).
- **Point 8 — Photos d'événements** (upload dans l'éditeur Events ; `themeImage('event')` utilisera la vraie photo).
- **Refresh token Instagram automatique** (token long-lived ~60 j → `ig_refresh_token` planifié).
- **Mot de passe oublié** (flux GoTrue de récupération).
- **App Review Meta + passage en mode Live** (permissions `instagram_business_basic` + `instagram_business_content_publish`) pour publier sur des comptes non-testeurs.

### Phase 3 — Commercial
- **Domaine** (`lelab.app` ou équivalent).
- **PWA** (installation sur l'écran d'accueil iPhone).
- **Premier client payant onboardé**.
- **Démo commerciale préparée**.

### Phase 4 — Application native
- **Évaluation PWA vs App native** (iOS / Android).
- Si App native : **React Native**, soumission **App Store**.
- **Marque blanche** pour agences partenaires.
- **Interface « Studio seul »** : pour les clients qui ont déjà un site ailleurs (ou n'en veulent pas). Dashboard épuré avec **uniquement le Studio Instagram** — pas de section « Mon site », pas d'éditeur de contenu. **Nouvelle offre tarifaire à définir** (ex. *LeLab+ Studio* à X€/mois, sans le site). **Architecture à prévoir** : `config.json` avec `mode = "studio_only"` qui masque toute la partie site.

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

### Dette technique à traiter lors du premier nouveau client

- **`netlify/functions/upload-image.mjs`** : l'URL Identity de prod est **codée en dur** en fallback — `process.env.IDENTITY_URL || 'https://gorgeous-heliotrope-e2e59d.netlify.app'`. Pour un nouveau site : définir la variable d'env **`IDENTITY_URL`** avec l'URL du nouveau client (ou retirer le fallback). Vérifier au passage qu'aucune autre URL `gorgeous-heliotrope-e2e59d…` ne traîne en dur (ex. `INSTAGRAM_REDIRECT_URI`, config Meta).
- **`admin/index.html`** (bouton « Connecter Instagram ») : l'URL OAuth Instagram est **construite en dur côté client** (App ID `1300156898763730` + `redirect_uri` `…/auth-callback` + scopes) pour contourner un **blocage du redirect 302 sur Safari iOS**. Pour un nouveau client : remplacer **App ID** + **redirect_uri** dans le lien. `instagram-auth.js` (flux 302) reste en place mais n'est **plus utilisé** par le bouton.
