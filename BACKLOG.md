# BACKLOG — LeLab / Studio

> Fichier de suivi. À terme il vit dans le master `lestud-template-food` (doc partagée).
> Dernière mise à jour : session refonte front Sassy (scroll Lenis/GSAP + carte ardoise).

## Contexte repos (attention à la divergence)
- **`lestud-template-food`** = MASTER / source canonique famille food. A l'overlay cinéma. N'a PAS la refonte studio ni la refonte front de ces sessions.
- **`bistrot-sassy`** = fork de TEST + démo Meta. A la refonte studio **et la refonte front** (scroll Lenis/GSAP, carte ardoise). N'a PAS l'overlay cinéma.
- **`masamadre-lelab`** = fork CLIENT (Masa). A l'overlay cinéma. N'a PAS la refonte studio ni la refonte front de ces sessions.

## Fait — session front (scroll + ardoise, en prod sur Sassy)
- **Smooth scroll Lenis** — desktop uniquement (`innerWidth >= 768`), désactivé si `prefers-reduced-motion` ; couplé à `ScrollTrigger.update`.
- **GSAP ScrollTrigger** branché : reveals au scroll (titres `.s-title`, labels `.s-label`), stagger photos (`#about`, `#galerie`), horaires (`.horaires-row`) + infos contact (`.ci-block`), révélation du bloc carte. **Hero reveal au load** (clip-path titre, pas de ScrollTrigger). Tout sous garde `!prefers-reduced-motion`.
- **Section `#carte` refaite en ardoise littérale** : layout une colonne, leader dots (`.plat-dots`), tampon « cette semaine », auto-masquage des catégories vides. Rendu par `renderCarte()` dans `sassy-cms-loader.js` (injecté dans `#cms-carte`).
- **Section `#events` masquée** (`display:none`), réactivable via `_data/config.json` (`blocs.optionnels`).
- **Marquee supprimé.**
- **Année footer dynamique** (`#yr`).
- **`<meta name="color-scheme" content="light">`** ajoutée.

## Fait cette session (en prod sur Sassy)
- Formats : carré supprimé → **Post 4:5 (1080×1350)** + **Story 9:16** uniquement.
- Étape 1 : cards thème **miniature rendue + label** (moteur FINAL, canvas isolés).
- Étape 2 : cards format **responsive** (grosses cards à l'échelle mobile / pastilles compactes desktop, breakpoint 960).
- **Barre de navigation 3 ancres** : croix|retour · titre d'étape · Suivant|Publier. Libellés **Type · Détails · Légende · Aperçu**. Bascule desktop/mobile 720/960.
- **`studioReset()`** : reset complet (tous champs + brouillon). `clearStudioDraft()` EN DERNIER (sinon demi-reset). Ne se déclenche jamais seul.
- **Bannière de reprise** (option B, non bloquante) : Reprendre / Recommencer. Détection « vrai progrès » = step>1 OU champ libre non vide OU champ prérempli modifié vs défaut (snapshot au bootstrap).
- **Vignette Insta** compacte + placement responsive (sidebar desktop / tête studio mobile), triplet avatar+@compte+ID préservé.
- Fixes : chevauchements barre (zone intermédiaire), fix preview photo (réf morte `#photoThumb`), alignement cards format.

## Chantiers ARCHITECTURE (à traiter ensemble, à froid)
- [ ] **Réconcilier Sassy ↔ master ↔ Masa** : remonter la refonte studio dans `lestud-template-food` ; redescendre l'overlay cinéma dans Sassy ; puis master à jour → Masa.
- [ ] **Porter l'overlay cinéma** (croix de fermeture + mockup) du master vers Sassy. ⚠️ Mockup = taille FIXE (~210px, ratio 210/462, story 427px). Le dimensionnement dynamique a échoué plusieurs fois — NE PAS y retoucher.
- [ ] **Auditer + remplir `separation`** (shared / client_specific) par fork. Prérequis Cockpit Niveau 2 avant toute propagation auto.
- [ ] **Mettre à jour `LELAB.md`** dans le master, au moment de la consolidation, avec les évolutions studio ci-dessus.

## Chantiers RENDU (à traiter APRÈS le re-base)

- [ ] **🟠 `paintCarte` ROGNE LES PRIX — le `€` est coupé par son propre clip** *(constaté le 11/09/2026,
  pendant le bout 1 du re-base)*.
  `paintCarte` pose `ctx.clip()` sur `rect(zx, dzy, zw, dzh)` puis dessine le prix en
  `textAlign:'right'` **exactement à `zx + zw`** — c'est-à-dire sur la ligne de coupe. Tout
  débordement latéral du glyphe (approche, chasse du `€`) est donc rasé.
  **Mesuré** sur `sassy-carte` portrait 1080×1350, pixels d'encre collés à `x = 950` (`0.88 × 1080`) :

  | | encre au bord du clip |
  |---|---|
  | tokens d'avant (Bricolage 700) | **33 px** |
  | tokens d'après (Canela Black 900) | **42 px** |

  ⚠️ **ANTÉRIEUR AU BOUT 1, PAS UNE RÉGRESSION.** Le défaut existe avec les deux jeux de tokens ;
  Canela Black a un `€` plus large, ce qui le rend un peu plus visible. Le changement de graisse
  n'en est pas la cause — le rendu a été validé à l'œil avec, et les graisses restent en l'état.
  **→ Le correctif est dans `paintCarte`** (marge droite dans le clip, ou prix aligné à
  `zx + zw − marge`), pas dans les tokens ni dans la zone de `themes.json`.

- [ ] **`gen-habillages.py` ne connaît que `dujour` et `annonce`** *(constaté le 11/09/2026, bout 5
  du re-base)*. Le générateur rend les habillages en Chrome headless depuis du HTML/CSS, avec
  `DA = dict(blue='#2050E7', cream='#FAF1E2', yellow='#FFF08B')` et les `@font-face` **Canela et
  Elms extraites d'`index.html`**. C'est lui qui a produit les **6 habillages propres**. Son dict
  `THEMES` ne couvre que ces deux-là ; `carte`, `infos`, `photo` et `event` n'y sont pas.
  **→ C'est le CHEMIN DE SECOURS des 4 thèmes restants si le moteur v2 dérape.** À étendre
  **seulement si on en a besoin** — pas par anticipation.

## Chantiers STUDIO (raffinement)
- [ ] Vignette Insta mobile : dégraisser l'habillage encadré → **ligne fine** sous le bandeau (poids visuel).
- [ ] Vignette Insta : **avatar + popup moderne** (pattern Buffer/Later). ⚠️ **SEULEMENT après validation Meta** — tant que la review n'est pas passée, le triplet avatar+@compte+ID doit rester visible SANS clic.
- [ ] Calage responsive de la vignette en **zone intermédiaire** (désalignement).
- [ ] **Format en étape séparée** (parcours 5 étapes). ⚠️ Touche le moteur (goStep clampe 1→4, stepper 4 pastilles) — gros chantier.
- [ ] Stepper : **pictos + mots** (polish DA). Jamais pictos seuls (cible 40+).
- [ ] Décider du sort du **grisé desktop des étapes** (garder / remplacer par points) — à juger sur pièce.

## ⚠️ MOTIF — UNE SONDE QUI CONTREDIT LE SYSTÈME DOIT ÊTRE VÉRIFIÉE AVANT D'ÊTRE CRUE

**Deux occurrences font un motif, et il faut le nommer** *(le second cas constaté le 11/09/2026)*.

| Date | La sonde disait | La vérité | Ce qui l'a faussée |
|---|---|---|---|
| 03/08/2026 | contrôle ② **ROUGE** sur le 1ᵉʳ thème | le parcours client était **sain** (3/3) | le singleton `#igCarteCv` — le verdict dépendait du **temps de parse** du fichier |
| 11/09/2026 | token Instagram **MORT** (`OAuthException` 190) | le token était **valide** | la sonde interrogeait **`graph.facebook.com`** ; un token Instagram-Login n'y est pas parsable. Le code, lui, n'appelle **que** `graph.instagram.com` |

**Le 190 ne disait pas « expiré », il disait « mauvaise API ».** Et le message (« Cannot parse
access token ») le disait déjà — il a été lu comme une confirmation au lieu d'un signal.

⚠️ **LE COÛT N'EST PAS THÉORIQUE.** Le diagnostic a conduit à déconnecter et reconnecter le compte
Instagram de production pour rien. Et il a détruit la pièce à conviction : l'ancien token n'ayant
jamais été testé sur le bon hôte, **on ne saura jamais s'il était mort**.

**→ LA RÈGLE : quand une sonde contredit le système, on vérifie LA SONDE en premier.**
Concrètement : est-ce qu'elle interroge **le même hôte / le même chemin / le même état** que le code
de production ? Ici, un seul `grep IG_GRAPH` avant de conclure aurait suffi.

⚠️ **Elle existe déjà sous une autre forme au `LELAB.md`** — *« quand l'usage réel contredit le
harnais, c'est le HARNAIS qui ment »*, et *« une sonde doit mesurer ce qui compte, pas un proxy
commode »*. Ce qui manquait n'était pas la règle : c'était de l'appliquer **dans les deux sens**.
Elle avait été appliquée le matin même (vérifier qu'on regardait le bon commit avant de conclure
sur l'admin) et oubliée l'après-midi.

## Rappels techniques (learnings)
- Moteur studio 4 étapes : ne pas toucher `goStep`/`slideToStep`/`adjustStepsHeight`/`currentStep`.
- **Instagram : l'API est `graph.instagram.com`, JAMAIS `graph.facebook.com`.** Les tokens
  Instagram-Login ne sont pas parsables par l'API Facebook, qui répond un `190` trompeur.
- Netlify : Identity KO en deploy preview → tests finaux sur prod main. Admin non testable en local (Identity).
- Meta : triplet visible sans clic tant que review non validée (cause des rejets Policy 1.6 passés).

## Priorité immédiate (hors backlog)
- Démo Masa : vérifier statut Meta, tester studio Masa sur iPhone, décider publication démo (compte testeur Meta vs `@lestud13` + phrase de cadrage).
