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

- [ ] **🟡 `scan-da` ET `scan-troncature` RENDENT UN VERDICT INTERMITTENT** *(constaté le 11/09/2026,
  bout 6 du re-base — à rattacher au point 32 du backlog master)*.
  **Mesuré, même code et même donnée :**

  | | passe 1 | passe 2 | passe 3 |
  |---|---|---|---|
  | `scan-da` sur Sassy | **14 écarts** (13 × « CONTRASTE 1:1 ») | **0** | **0** |
  | `scan-troncature` sur Sassy | **1 bloc, −442px** | **0 bloc** | — |
  | `scan-da` sur le master (témoin) | **7 écarts**, tous « 1:1 », mais sur un **autre écran** | — | — |

  Un contraste de **1:1** = texte et fond identiques : la sonde lit avant que l'écran ait peint.
  `scan-troncature` a donné **−414px** puis **−442px** puis **0** sur la même cible.

  ⚠️ **LE MOTIF, ET IL EST PLUS UTILE QUE LES CAS : UNE SONDE QUI MESURE TROP TÔT MENT TOUJOURS
  DANS LE MÊME SENS — elle invente un défaut, jamais elle n'en cache un.** Un contraste pas encore
  peint sort à 1:1 (donc « échec »), une hauteur pas encore stable sort trop grande (donc
  « tronqué »). **Le faux POSITIF est le mode d'échec par défaut d'une sonde prématurée**, ce qui
  la rend coûteuse en attention mais jamais dangereuse pour le client.
  **→ Corollaire : un rouge de ces deux scans se REJOUE avant d'être cru.** Trois passes vertes
  valent un vert ; une passe rouge ne vaut rien.

  ⚠️ **TROISIÈME SONDE MENTEUSE DE LA SEMAINE** — après le faux rouge du contrôle ② (03/08, le
  singleton `#igCarteCv`) et le `190` sur la mauvaise API (11/09). Voir le motif *« une sonde qui
  contredit le système doit être vérifiée avant d'être crue »* plus bas.

- [ ] **🟡 `test-contenu-public` — 6 constats sur 7 sont un DÉCALAGE D'ATTENTE, pas un défaut**
  *(constaté le 11/09/2026)*. Le scan cherche les sélecteurs du **master** (`carte-grid`,
  sous-titres pilotés par `config.textes.categories`) ; **l'ardoise littérale de Sassy ne les rend
  pas**. Vérifié sur la page rendue, pas déduit : 2 catégories affichées, 6 plats, 6 descriptifs,
  intitulés présents — `plats` étant vide, elle est auto-masquée, ce qui est le comportement voulu.
  Le master passe le même scan (`exit=0`).
  **→ À EXEMPTER EXPLICITEMENT, AVEC LA RAISON ÉCRITE** — même discipline que la table `VERDICTS`
  de `scan-da`. **Pas à adapter à l'aveugle** : un scan qu'on aligne sur ce qu'il trouve cesse de
  constater quoi que ce soit.

- [ ] **🟡 LES SOUS-TITRES DE CATÉGORIE SONT DÉCLARÉS ET JAMAIS RENDUS** *(introduit le 11/09/2026
  par le bout 2 du re-base)*. `config.json` de Sassy ne portait **aucune clé `textes`** avant ; il
  déclare maintenant `blocs.socle.carte.textes.categories` avec « tartares, verrines, crudités » et
  « maison, de saison ». **`renderCarte()` ne les lit pas.** L'admin s'en sert pour ses libellés
  d'éditeur, donc c'est inoffensif — mais **c'est une déclaration sans effet sur le site**, la
  famille exacte de ce qu'on traque depuis le début (« tout affichage d'état doit dériver des
  DONNÉES », « un manifeste qu'on ne confronte jamais au réel »).
  **→ À trancher : soit `renderCarte` les rend, soit on ne les déclare pas.** Pas de troisième voie.

## ⚠️ `semantic.texte` ET `semantic.encre` SONT DES RELIQUATS — ET LA SONDE 4 EN DÉPEND

*(posé le 11/09/2026, au template `infos`)*

`primitives.color.texte` (#3a3a3a) et `texteDoux` (#6b6b6b) viennent des **anciens tokens**, ceux
de l'époque Bricolage/Inter — quand les posts étaient composés dans la typo du back-office. **Ils
ne figurent nulle part dans le `:root` du site**, qui ne déclare que `--blue`, `--cream`, `--yellow`.

Aujourd'hui ils ne servent plus qu'à **UN seul consommateur : le peintre canvas**
(`semantic.nomProduit.color = 'texte'`, `semantic.prix.color = 'encre'`).

**C'est exactement ce qui fait marcher la sonde 4 du contrôle v2.** Mesuré sur trois rendus réels :

| source | part de `texte` #3a3a3a |
|---|---|
| v2 `carte` | **0,00 %** |
| v2 `infos` | **0,00 %** |
| repli CANVAS | **0,58 %** |

Les templates v2 peignent en `creme` et `accent` ; le canvas peint en `texte`/`encre`. La sonde
compte les pixels **des couleurs du peintre** : zéro ⇒ c'est bien le v2 qui a peint.

⚠️ **LE JOUR OÙ UN TEMPLATE v2 VOUDRA `texte` OU `encre`, LA SONDE 4 DOIT ÊTRE ROUVERTE
CONSCIEMMENT — pas contournée.** Elle deviendrait un faux positif, et le réflexe serait de monter
son seuil : ce serait maquiller la sonde, la faute qu'on a déjà refusée quatre fois aujourd'hui.
Le bon geste sera alors de changer **ce qu'elle mesure**, comme pour la sonde 2.

⚠️ **Et la question de fond restera ouverte : ces deux couleurs devraient-elles encore exister ?**
Le site ne les connaît pas. Les retirer des tokens obligerait à repeindre le canvas dans la charte
— ce qui est souhaitable, mais c'est le **repli** qu'on toucherait, donc à faire avec les mêmes
précautions que le reste.

## 🔴 LE FORMAT `carre` EST DÉCLARÉ SUR LES SIX THÈMES ET INACCESSIBLE — décision reportée

*(constaté le 11/09/2026, au bout v2-débordement. Tranché : on ne touche à rien avant le RDV.)*

⚠️ **LE CONTRÔLE DU MOTEUR v2 RESTE ROUGE À CAUSE DE ÇA, ET CE ROUGE EST COMPRIS.** À ne pas
confondre avec un garde-fou qu'on laisse pourrir :

    5. débordement · carre   sassy-dujour   ROUGE   dépassement 203px — coupable « pied »
    5. débordement · portrait                VERT
    5. débordement · story                   VERT

### Ce qui est mesuré

**Le carré est structurellement INACCESSIBLE dans l'admin — deux barrières indépendantes :**

    const FMT_KEY_MAP = { portrait:'portrait', story:'story' };   ← borne customThemeFormats()
    #fmtRow : DEUX boutons écrits EN DUR (data-fmt="portrait" et "story")
    « carre » dans admin/index.html : 0 occurrence sur 7 100 lignes

Ce n'est donc **pas un défaut d'affichage** qui pourrait se corriger un jour et rouvrir le format :
c'est un format **retiré du produit** (cf. plus haut, « Formats : carré supprimé → Post 4:5 +
Story 9:16 uniquement »).

**L'origine est ANTÉRIEURE au re-base**, et elle vient du master : `2a70a97` / `990e86a`, les
commits qui ont créé les thèmes custom. Le `themes.json` du master la porte aussi. Le re-base n'a
rien introduit — il a apporté deux thèmes de plus qui portent le même vestige.

**Et ce n'est pas un cas `dujour` : LES SIX THÈMES sont concernés.**

| thème | déclare | mort |
|---|---|---|
| `sassy-carte` · `dujour` · `photo` · `infos` · `annonce` · `event` | `carre`, `portrait`, `story` | **`carre`** |

Soit **six formats morts et six habillages carrés** générés, versionnés et servis pour rien
(~100 Ko).

### Pourquoi on ne réduit PAS le rendu

Le débordement de `dujour` en carré pourrait se « corriger » en réduisant le corps des cartes ou en
limitant à 3 plats. **Ce serait abîmer le rendu pour un cas qui n'arrive jamais** — personne ne peut
choisir ce format. Le vrai correctif est de retirer la déclaration ; supprimer un format que
personne ne peut choisir est une **correction de cohérence**, pas un compromis de mise en page.

### À faire, après le RDV

- [ ] retirer `carre` des **six** déclarations de `themes.json`
- [ ] décider du sort des **six `sassy-*-carre.png`** devenus orphelins — à grouper avec le redessin
      des 12 gabarits
- [ ] ⚠️ **et le remonter au master**, qui porte le même vestige sur ses six thèmes

## ⚠️ LE FOND REPEINT NEUTRALISE L'ÉCRAN NOIR — ET CRÉE L'ÉCRAN CRÈME

*(posé le 11/09/2026, au morceau M1 du pipeline photo. À REMONTER AU MASTER avec le moteur.)*

**Le défaut d'origine, chez Georges :** un `foreignObject` qui ne peint rien laisse du
**transparent**, que le JPEG rend **NOIR**. Résultat mesuré à l'époque : une image 100 % noire de
9 Ko, bien formée, **sans la moindre erreur**.

**Le correctif, dans `rasteriser()` :** on repeint le fond de la charte AVANT `drawImage`. Au pire
on publie un aplat crème, jamais un rectangle noir.

⚠️ **MAIS LE DÉFAUT N'A PAS DISPARU — IL A CHANGÉ DE VISAGE.** Une photo qui ne s'encode pas ne
donne plus un écran noir : elle donne un **écran CRÈME**. Plus discret, donc **plus dangereux** :
un aplat noir se remarque, un aplat crème ressemble à un post minimaliste.

**→ C'EST LA SONDE 6 QUI LE COUVRE, PAS LE CORRECTIF.** Signature : *« une photographie n'est pas
faite des trois couleurs d'une charte »*. Elle compte les pixels qui ne sont d'AUCUNE couleur de la
charte. Éprouvée au rouge le 11/09 :

| | hors charte |
|---|---|
| rendu **avec** photo | **96,8 %** |
| rendu **sans** photo (l'écran crème) | **0,0 %** |

Ce n'est pas un seuil ajusté : c'est une propriété de ce qu'est une photographie.

⚠️ **LE CORRECTIF ET SA SONDE VOYAGENT ENSEMBLE À LA REMONTÉE AU MASTER.** Remonter le fond repeint
sans la sonde 6, c'est remonter un correctif qui déplace un mode d'échec silencieux vers un autre,
plus discret, sans rien pour le voir. **C'est exactement le couplage `D` ↔ `test-atteignabilite`**
constaté ce matin : ni Georges (le correctif sans la sonde) ni le master (ni l'un ni l'autre) ne
peuvent voir le problème seuls.

## ✅ « APERÇU == EXPORT » N'EST PLUS UNE DISCIPLINE, C'EST UNE IMPOSSIBILITÉ STRUCTURELLE

*(posé le 11/09/2026, morceau M4 du pipeline photo. À REMONTER AU MASTER avec le moteur.)*

### Le défaut de fond, chez Georges

La règle *« aperçu == export »* était **écrite, datée, expliquée** dans le `LELAB.md` du master. Elle
a été **violée deux fois de suite après sa rédaction** — sur le thème photo, puis sur le thème
annonce — à chaque fois en détournant l'export sans détourner son aperçu. **Le client l'a vu, pas
nous.** D'où le contrôle ②, qui pilote l'admin réel dans une iframe pour la vérifier.

⚠️ **MAIS UN CONTRÔLE VÉRIFIE APRÈS COUP.** Il attrape la divergence, il ne l'empêche pas. Et la
cause profonde n'était pas un oubli de vigilance : c'était que **les mêmes valeurs de mise en page
étaient écrites à DEUX endroits** — une fois pour le rasteriseur, une fois pour l'aperçu.

### Le correctif de fond, ici

`admin/moteur-v2.js` déclare **`MEP_PHOTO`**, une seule table de ratios (fractions de W), lue par les
**deux** chemins :

    PHOTO.css()               -> l'EXPORT (dans le SVG)
    habillerApercuPhoto()     -> l'APERÇU (en calques CSS, échelle clientWidth/1080)

**Il n'y a plus deux valeurs à tenir d'accord : il y en a une.** La divergence cesse d'être une
question de discipline pour devenir **structurellement impossible**.

**Vérifié, valeurs renormalisées à 1080 :**

| | aperçu (260 px) | renormalisé | export déclaré | écart |
|---|---|---|---|---|
| `voile` height | 57,19 | 237,55 | 237,60 | **0,052** |
| `sign` left | 15,60 | 64,80 | 64,80 | **0,000** |
| `sign` bottom | 14,30 | 59,40 | 59,40 | **0,000** |
| `sign` font-size | 6,76 | 28,08 | 28,08 | **0,000** |

**Rouge prouvé** : injection de `0.30` dans l'aperçu là où l'export déclare `0.22` → écart de
**86,4 px** après renormalisation, contrôle rouge. Restauré depuis la copie hors arbre, md5
identiques.

⚠️ **LE CONTRÔLE RESTE UTILE POUR CE QUE LA SOURCE UNIQUE NE COUVRE PAS** : qu'on n'oublie pas de
POSER un calque, et qu'on ne laisse pas l'habillage PNG visible sous le décor.

### ⏳ Deux trous connus, à couvrir au bout des ACCROCHES

- [ ] **`pointer-events:none` n'est testé par AUCUNE sonde.** Il est vérifié par
  `getComputedStyle` dans le contrôle, mais s'il est retiré, **le glissement du point focal cesse
  sans que rien ne casse** — une régression muette : pas d'erreur, pas de rendu faux, juste un geste
  qui ne répond plus. Le tester vraiment demande un `pointerdown`/`pointermove` réel sur l'aperçu
  de l'admin. **À faire au bout des accroches, pas avant** : il n'y a rien à piloter tant que la
  fonction n'est pas branchée.
- [ ] **`habillerApercuPhoto` est écrite et NON BRANCHÉE.** La garantie du point 23 tient :
  `MOTEUR_V2` est à **0 occurrence** dans `admin/index.html`. La fonction existe, personne ne
  l'appelle. ⚠️ À ne pas croire active avant le bout des accroches.

## ⚠️ MOTIF — UNE SONDE QUI NE COUVRE QU'UN CAS MENT PAR OMISSION

*(constaté le 11/09/2026, sonde 5 du contrôle v2)*

Le détecteur de débordement ne testait que **`Object.keys(t.formats)[0]`** — le premier format
déclaré, c'est-à-dire `carre`. Les thèmes en déclarent **trois**.

**Il se trouve que le format fautif était justement celui-là.** `sassy-dujour` déborde de 203 px en
carré et tient en portrait comme en story. La sonde a donc rendu un ROUGE juste — **par hasard**.

⚠️ **L'INVERSE AURAIT DONNÉ UN VERT PARFAIT SUR UN DÉFAUT RÉEL.** Si le débordement avait été en
story, la sonde aurait affiché « aucun — le contenu tient dans le cadre », et le post serait parti
tronqué. **Un vert obtenu en ne regardant qu'un tiers du domaine n'est pas un vert : c'est une
absence de mesure déguisée en résultat.**

⚠️ **ET LE DÉFAUT EST INVISIBLE À LA RELECTURE.** Rien dans la sortie ne disait « je n'ai testé
qu'un format sur trois ». C'est ce qui le rapproche des deux autres :

| | La sonde disait | Ce qu'elle ne disait pas |
|---|---|---|
| `scan-da` (31/07) | « 204 mesurés » | que 5 éléments étaient sortis du décompte |
| contrôle ② (03/08) | ROUGE sur le 1ᵉʳ thème | que le rouge suivait le RANG, pas le thème |
| sonde 5 (11/09) | « aucun débordement » | qu'elle n'avait regardé qu'un format sur trois |

**→ LA RÈGLE : une sonde doit COUVRIR SON DOMAINE, et le DIRE.** La sonde 5 affiche désormais une
ligne par format (`débordement · carre`, `· portrait`, `· story`) : le domaine couvert se lit dans
la sortie, il ne se suppose plus. C'est l'application directe de *« tout compteur affiché doit dire
ce qu'il compte ET ce qu'il exclut »* (backlog master 30.4).

## ⚠️ MOTIF — UNE SONDE QUI NE PEUT RIEN CONCLURE DIT « N/A » AVEC SA RAISON, JAMAIS « VERT »

*(posé le 11/09/2026 — quatrième refus de faux vert dans la même journée)*

### Le cas qui l'a fait écrire : la sonde 3 du contrôle v2

La sonde « les polices de marque sont-elles réellement embarquées ? » rasterise **deux fois**, avec
et sans les `@font-face`, et compare l'encre. Identiques ⇒ la police n'a pas été prise. C'est le
seul moyen d'attraper le **piège iOS n°1**, qui est muet.

**Elle est structurellement AVEUGLE sur le Mac de Romain — mesuré :**

    ~/Library/Fonts : Canela (38 variantes) + ElmsSans (2 variantes)

`font-family:'Canela'` s'y résout donc **par le NOM**, `@font-face` ou pas. Les deux rasterisations
sont identiques (écart 0,5 %), et la sonde ne peut RIEN conclure.

⚠️ **DEUX FAÇONS DE LA FAIRE PASSER, ET AUCUNE N'EST VERTE :**

| | |
|---|---|
| ❌ baisser le seuil sous 0,5 % | elle dirait **« les polices sont embarquées »** alors qu'on n'en sait rien. Un vert obtenu ainsi est pire qu'un rouge : il éteint la question |
| ✅ **rendre `N/A` et dire pourquoi** | l'écran porte *« les polices sont INSTALLÉES sur cette machine, la sonde est aveugle — à juger sur iPhone »* |

**→ Le verdict qui compte est celui de l'iPhone du client, qui n'a NI Canela NI Elms.** C'est là, et
nulle part ailleurs, que l'absence de base64 se verrait. Inscrit à la liste du **BOUT 9**.

### La règle générale

**UNE SONDE QUI NE PEUT STRUCTURELLEMENT RIEN CONCLURE DANS SON ENVIRONNEMENT DOIT DIRE « N/A »
AVEC SA RAISON. Jamais vert.** Un vert dit *« j'ai vérifié et c'est bon »* ; N/A dit *« je n'ai pas
pu vérifier, et voici pourquoi »*. Les deux sont honnêtes ; seul le premier est un mensonge quand
la vérification n'a pas eu lieu.

⚠️ C'est le pendant exact de la règle déjà gravée au `LELAB.md` — *« un scan qui ne découvre rien
est un scan cassé »*. Ici : **un scan qui ne PEUT rien découvrir doit le dire.**

### Le motif : QUATRE refus de faux vert dans la même journée

| | La facilité qui aurait verdi | Ce qui a été fait |
|---|---|---|
| `scan-da` / `scan-troncature` | traiter le rouge intermittent comme un vrai défaut, ou l'ignorer | **rejoué 3×**, verdict déclaré instable, backlog daté |
| `test-atteignabilite` | le renommage en 2 lignes demandé | **refusé** : il transformait un `ReferenceError` en rouge de fond, et le verdir aurait exigé de trafiquer l'assertion |
| sonde 2 (bandeau) | monter le seuil de 12 à 140 | **changé ce qu'elle mesure** — une empreinte, pas un seuil. 15/18 → 18/18 |
| sonde 3 (polices) | baisser le seuil sous 0,5 % | **N/A avec sa raison** |

**→ Le point commun n'est pas la sonde, c'est le geste : à chaque fois, le chemin court était de
toucher le SEUIL, et le bon était de toucher CE QU'ON MESURE — ou d'admettre qu'on ne mesure rien.**

## ✅ EXEMPLE À GARDER — ON CORRIGE LA SONDE, PAS LE SEUIL

*(11/09/2026, écriture de `admin/controle-moteur.html`, sonde « bandeau gabarit »)*

**La première version de la sonde mentait, et elle aurait passé pour bonne.** Elle jugeait sur
*« un écart de luminance entre les 4,5 % du bas et la zone juste au-dessus »*, avec un seuil de 12 :

    15/18 verdicts corrects — et les TROIS `sassy-annonce` declares GABARIT a tort.

Le bas de l'annonce est un **aplat bleu plein cadre**, parfaitement légitime : la sonde mesurait
« il se passe quelque chose en bas » et appelait ça « il y a un bandeau ».

⚠️ **DEUX FAÇONS DE LA FAIRE PASSER AU VERT, ET UNE SEULE EST HONNÊTE :**

| | |
|---|---|
| ❌ monter le seuil de 12 à 140 | les 3 annonces passent… et les `event` (écart 23) deviennent invisibles. **On aurait maquillé la sonde et perdu 3 vrais gabarits.** |
| ✅ changer **ce qu'elle mesure** | le calque gabarit rend TOUJOURS `rgb(211,203,191)` à 95-97 % de la bande, et son texte est **centré** (x 0,36→0,64) là où un aplat de design occupe toute la largeur |

**Résultat : 18/18** — 12 vrais gabarits détectés, 6 propres épargnés, sur les trois formats.

**→ LA LEÇON, ET ELLE EST CONCRÈTE : une sonde testée sur DEUX cas ne prouve rien.** Celle-ci n'a
été prise en défaut que parce qu'elle a été jouée sur **les dix-huit** habillages du dépôt. Deux
échantillons bien choisis lui auraient donné 2/2.

⚠️ **Et la signature est une EMPREINTE, pas un seuil calibré à la main** — une valeur relevée sur
douze fichiers, qui a un sens hors du projet (« la couleur du calque »), là où « écart > 12 » n'est
qu'un nombre ajusté jusqu'à ce que ça passe. C'est la règle du `LELAB.md` : *« chercher une grandeur
qui a un sens hors du projet plutôt qu'un nombre de pixels calibré à la main »*.

⚠️ **La sonde s'auto-éprouve désormais à CHAQUE exécution** : la page rejoue les deux cas connus
(`sassy-carte-portrait` → GABARIT, `sassy-dujour-portrait` → propre) avant de juger un rendu. Une
sonde qui ne sait plus reconnaître un gabarit connu se signale elle-même.

### 🔁 TROIS OCCURRENCES DANS LA MÊME JOURNÉE — LE MOTIF EST ÉTABLI

**Quand une sonde rougit sur un cas LÉGITIME, on change CE QU'ELLE MESURE. Jamais son seuil.**

| Sonde | Le cas légitime qui la faisait rougir | Le seuil qui l'aurait verdie | Ce qu'on a fait |
|---|---|---|---|
| **2 · bandeau** | les 3 `sassy-annonce`, dont le bas est un aplat bleu plein cadre | monter de 12 à 140 | changé **ce qu'elle mesure** : l'empreinte `rgb(211,203,191)` + texte centré. 15/18 → **18/18** |
| **3 · polices** | rien — elle est **aveugle** : Canela (38 variantes) et ElmsSans sont installées dans `~/Library/Fonts`, Chrome les résout par le nom | descendre sous 0,5 % | **N/A avec sa raison**. Verdict renvoyé à l'iPhone, seul appareil sans ces polices |
| **4 · qui a peint** | le rendu **photo** : une photographie contient du gris sombre par nature (6,82 % de `texte`/`encre`, contre 0,00 % sur les 4 templates typo) | monter de 0,1 % à 7 % | **N/A sur les thèmes photo**. Monter le seuil l'aurait rendue aveugle sur les templates typo, **où elle est le seul signal indépendant** |

⚠️ **CE QUI REND LE MOTIF DANGEREUX : le seuil est TOUJOURS le chemin le plus court.** Il est à
portée, il fait passer au vert en un caractère, et le résultat ressemble exactement à une sonde qui
marche. Les trois fois, la bonne réponse a demandé de comprendre **pourquoi** le cas légitime
déclenchait la sonde — et deux fois sur trois, la conclusion a été qu'elle **ne pouvait pas
conclure**, pas qu'elle devait être plus tolérante.

⚠️ **ET LA TOLÉRANCE COÛTE AILLEURS.** Le cas de la sonde 4 est le plus net : monter son seuil à 7 %
pour accommoder les photos l'aurait rendue **muette là où elle est utile**. Un seuil élargi n'est pas
« la même sonde en plus souple » : c'est une autre sonde, qui mesure moins.

### ⏳ Reste à poser sur le contrôle

- [ ] **Sonde 4 — le seuil d'encre `#2050E7`** : à MESURER sur le premier rendu v2 réel, **pas à
  poser d'avance**. En poser un sur du vide serait refaire l'erreur ci-dessus.
- [ ] **Sonde 5 — le repli BRUYANT** : ⚠️ **ce n'est PAS une sonde de cette page**, c'est un
  comportement de l'admin (un bandeau « rendu de secours » dans l'aperçu, pas un `console.warn`).
  Il arrive **avec les accroches** — à ne pas croire fait avant.

## 🔺 LE MOTEUR v2 DE SASSY EST EN AVANCE SUR CELUI DE GEORGES — c'est LUI la référence

*(posé le 11/09/2026, au bout v2-1)*

`admin/moteur-v2.js` de Sassy n'est pas un `cp` de `admin/editeurs-georges.js` : il est écrit
**déjà corrigé** sur deux bouts du plan de remontée (backlog master, point 23) que Georges n'a pas.

| | `georges-site` | `bistrot-sassy` |
|---|---|---|
| **Bout 2** — pipeline unique | ❌ le squelette de rasteriseur est recopié **5 fois** (~27 l. chacune) | ✅ **UN** rasteriseur paramétré ; un template ne fournit que son CSS et son corps |
| **Bout 3** — registre déclaratif | ❌ les `theme.id` sont **en dur** dans `rasteriseur()` | ✅ un thème déclare `"template": "…"` dans `themes.json` ; **aucun `theme.id` dans le moteur** |
| Socle CSS | ❌ recopié dans les 5 `css*()` | ✅ `socleCSS()`, écrit une fois |

⚠️ **CE N'EST PAS DE LA COQUETTERIE : c'est la duplication du bout 2 qui a coûté deux jours à
Georges.** Le 31/07, un `str.replace` visant la règle `.col{…}` a frappé `cssArdoise` ET `cssCarte`
— identiques parce que recopiées — et l'ardoise a publié en canvas dégradé jusqu'à ce que le client
le voie.

**→ QUAND LA REMONTÉE AU MASTER SE FERA, LA RÉFÉRENCE EST LA VERSION DE SASSY, PAS CELLE DE
GEORGES.** Remonter Georges obligerait à refaire les bouts 2 et 3 au master ; remonter Sassy les
apporte déjà faits. Et les templates de Georges se réécrivent alors contre le rasteriseur unique —
c'est le travail que le point 23 planifiait de toute façon.

⚠️ Reste chez Georges et pas ici : les cinq templates écrits, le peintre canvas dédié de l'ardoise,
et `controle-moteur.html` (réarmé sur les signatures de Sassy, pas recopié).

## 🔴 `test-atteignabilite` EST ROUGE, ET ON SAIT POURQUOI — à réécrire après le test iPhone

*(constaté le 11/09/2026, au cherry-pick de D)*

⚠️ **CE ROUGE N'EST PAS UN ROUGE IGNORÉ.** Il est constaté, compris, daté, et sa réparation est
planifiée après une mesure qui n'existe pas encore. À ne pas confondre avec un garde-fou qu'on
laisse pourrir — c'est précisément ce que `scan-da` est devenu depuis le 16/07, et qu'on refuse.

    ❌ ATTEIGNABILITÉ — 2 échec(s)
       A/ HORS CLAVIER, le pied BOUGE de 56px quand les barres se replient (775 → 719)
       A/ après fermeture du clavier, le pied n'est pas revenu à sa place (écart 300px)

### Ce qui s'est passé

`scripts/test-atteignabilite.js` appelle `studioFootKeyboard()` et `studioClavierOuvert`
(lignes 153 et 181) — **deux symboles que D a supprimés**. Le scan levait donc un
`ReferenceError` avant de rien juger.

⚠️ **ET LE RENOMMAGE NE SUFFIT PAS — mesuré, pas supposé.** Remplacer par `studioFootSettle()`
fait passer le scan du `ReferenceError` au **rouge de fond** ci-dessus : son assertion A affirme
*« Le CSS (fixed + safe-area) suffit ; seul le clavier justifie une compensation »* — **c'est la
doctrine d'avant D, et D la renverse.** Le verdir en baissant un seuil serait la faute gravée trois
fois au `LELAB.md`.

### 🔗 LE COUPLAGE : `D` ↔ `test-atteignabilite.js` — ils voyagent ENSEMBLE

**Ni Georges ni le master ne pouvaient voir ce défaut :**

| Dépôt | a D ? | a les garde-fous ? | pouvait le voir ? |
|---|---|---|---|
| `georges-site` | ✅ | ❌ aucun | non |
| `lestud-template-food` | ❌ | ✅ les 9 | non |
| **`bistrot-sassy`** | ✅ | ✅ | **OUI — premier dépôt à avoir les deux** |

**→ À ne pas oublier quand D remontera au master** (backlog master, point 31) : le correctif et la
réécriture du garde-fou partent ensemble, sinon le master hérite d'un scan qui lève.

### La réécriture — la prescription existe depuis le 16/07, et elle est juste

Le commit qui a CRÉÉ ce garde-fou (`5abfbb9`, master, 16/07/2026) l'avait écrit d'avance :

> *« LE CSS PUR N'EST PAS FAIT, ET C'EST DÉLIBÉRÉ : `studioFootKeyboard` compense un comportement
> d'iOS Safari que le harnais (Chrome headless) NE SAIT PAS reproduire. Le supprimer serait un pari
> qu'aucun test local ne peut arbitrer — décision après un vrai passage iPhone. **Et si on y va, le
> garde-fou A devra être RÉÉCRIT : il mesure « translateY vaut 0 » (le mécanisme), pas « le pied est
> visible et cliquable » (le résultat).** »*

**→ A doit mesurer LE RÉSULTAT — « le pied est visible et cliquable dans la zone visible » — et non
LE MÉCANISME — « translateY vaut 0 ».** Une assertion sur le résultat reste vraie avant D, après D,
et après le prochain changement de mécanique. C'est la règle *« une sonde doit mesurer ce qui
compte, pas un proxy commode »*, appliquée à une sonde qu'on savait provisoire.

⚠️ **ORDRE ARRÊTÉ : on réécrit APRÈS le test iPhone**, pas avant. Le comportement que l'assertion
doit juger n'est arbitrable que sur un vrai appareil ; écrire l'assertion d'abord reviendrait à
figer une intention au lieu de constater un résultat. Voir la section « BOUT 9 » ci-dessous.

## 🚪 BOUT 9 — CE QUI DOIT PASSER PAR L'iPHONE RÉEL (à faire APRÈS fusion sur `main`)

*(posé le 11/09/2026, au cherry-pick de D)*

**Le banc headless prouve que le code réagit correctement à une géométrie DONNÉE. Il ne prouve pas
que Safari produit cette géométrie, ni qu'il l'annonce au bon moment.** Quatre points, à vérifier
et non à improviser :

1. **L'écart existe vraiment.** Les 45 px (`layoutH 714` / visible qui s'arrête à `669`) sont un
   relevé d'époque, pas une mesure d'aujourd'hui. À reconstater.
2. **Safari émet bien `visualViewport.resize` quand les BARRES bougent** — pas seulement le clavier.
   ⚠️ D n'a **aucun listener `scroll`** (il produisait le rebond) : toute la compensation dépend de
   ce `resize`. S'il n'arrive pas, rien ne se déclenche.
3. **La remesure à 350 ms attrape l'état FINAL.** iOS anime ses barres en ~300 ms et n'émet pas
   toujours d'événement sur l'état stabilisé.
4. **Aucun rebond.** C'est exactement ce que le listener `scroll` retiré provoquait.

**LE GESTE :** ouvrir `/admin/` sur iPhone → entrer dans le studio → **scroller vers le bas puis
vers le haut** (les barres se replient puis se redéploient) → « Suivant / Publier » doit rester
visible → puis toucher un champ texte (clavier monte) et le refermer.

⚠️ **Identity est KO en deploy preview** : ce test n'est possible qu'APRÈS fusion sur `main`.

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

## 🔴 11/09/2026 — LE BOUT DES ACCROCHES A DÉTERRÉ QUATRE DÉFAUTS RÉELS

Brancher le moteur, c'est le seul geste qui pouvait révéler ceux-là : jusqu'ici rien ne l'appelait.
Les quatre ont été trouvés **en relisant le contrat du module contre celui de l'admin**, pas par une
sonde — et les sondes ne les auraient pas tous vus.

**1. `sassy-photo` DÉCLARE BIEN UNE `zoneTexte`, EN STORY — et le template la jetait.**
Le commentaire de `PHOTO.css` affirmait : *« `sassy-photo` NE DÉCLARE AUCUNE `zoneTexte` — vérifié
dans themes.json »*. La vérification n'avait porté que sur `carre` et `portrait`. En **story**, le
thème déclare `{x:.10, y:.42, w:.80, h:.16, taille:46, couleur:#fff, align:center}` et l'admin offre
le champ `#storyText`. Publier une story photo par le v2 aurait **jeté le texte écrit par le
client**, sans erreur et sans trace : une photo nue.
→ **Cinquième exemplaire du motif « ne couvrir qu'un cas, et mentir par omission »** (cf. ligne 276),
  et le premier où c'est un COMMENTAIRE qui mentait, pas une sonde. Une assertion sur `themes.json`
  se vérifie sur LES TROIS FORMATS. Corrigé : `.txt` émis quand `zoneTexte` ET texte existent, taille
  mise à l'échelle (`× W/1080` — la valeur de themes.json est en px à 1080), police lue dans
  `semantic.infos` comme le fait `drawZoneText`.

**2. LE THÈME ÉVÉNEMENT POSAIT UNE CARTE BLANCHE VIDE SUR LES SLIDES 2+ D'UN CARROUSEL.**
`renderFinalCustom` ne passe le texte qu'à la 1ʳᵉ slide (`withText`). Le template `EVENT` émettait
`<div class="carte">` inconditionnellement : sur un carrousel de 3 photos, les photos 2 et 3
recevaient un cartouche blanc à filet bleu, vide, en plein milieu. Corrigé des deux côtés :
`event: withText ? slideEvenement() : null` à l'accroche, et garde `(badge || titre || desc)` au
template.

**3. `habillerApercuPhoto` CACHAIT UN HABILLAGE QU'ELLE N'AVAIT PAS CACHÉ.**
Sa branche « pas notre cas » faisait `hab.style.removeProperty('display')` — or la feuille de l'admin
déclare `.ig-habillage{display:none}`. Retirer le style en ligne ne « rend pas la main » : ça CACHE
le PNG que `composeCustomPreview` vient de poser à `block`. Passer d'un thème photo v2 à un thème
sans template faisait donc **disparaître l'habillage, en silence**. Corrigé par un drapeau
(`dataset.v2Masque`) : on ne restitue que si c'est nous qui avons masqué.
→ **Le correctif et sa sonde voyagent ensemble** (comme D ↔ `test-atteignabilite`, comme l'écran
  crème ↔ sonde 6) : c'est le critère **D2** de `test-accroches-v2`, et il teste les DEUX SENS —
  masqué sur les thèmes photo v2, `block` sur un thème sans template.

**4. LE BANDEAU DE REPLI NOMMAIT LE CHEMIN DE RENDU, PAS LE THÈME.**
`renderFinalCarte` sert carte ET dujour ; `renderFinalInfos` sert infos ET annonce (cf.
`RENDER_KIND`). Le client sur *Plat du jour* lisait « rendu de secours — carte », et sur *Annonce*,
« — infos » : **deux noms de thèmes qui existent dans son écran et qui désignaient autre chose**.
Corrigé : `nomDuTheme(theme)`, le seul repère que le client partage avec nous.

## ⚠️ 11/09/2026 — `pointer-events:none` N'EST PAS CE QUI GARDE LE GLISSEMENT VIVANT

La note du bout M4 disait : *« pointer-events:none non testé par une sonde »*. La sonde a été écrite,
et **elle a démenti l'hypothèse qu'elle devait confirmer**. Première version : « on retire
`pointer-events:none` des calques, le glissement doit mourir ». Il n'est pas mort — **Δfocal 0,5000
dans les deux cas**, geste de confiance (`page.mouse`), doigt posé sur le voile.

Raison mesurée : les écouteurs `pointerdown/pointermove` vivent sur **`#igPhoto`**, et les calques
sont ses **ENFANTS**. L'événement remonte, quelle que soit la cible du test de survol.

→ **LA GARANTIE PORTANTE EST LA PARENTÉ, PAS LE CSS.** C'est elle qu'un remaniement peut rompre, en
  posant le décor ailleurs que dans l'hôte — et c'est ce que mesure le critère **B1** (éprouvé au
  rouge avec un décor posé à côté de l'hôte : geste mort, Δ 0,0000).
→ `pointer-events:none` achète autre chose, réel mais de moindre portée : le calque reste
  **transparent au test de survol** — curseur `grab` conservé, pas de sélection de texte sur la
  signature. C'est le critère **B2**, et lui rougit bien quand on retire la garde.
→ Même geste que pour les sondes 2 et 4 : **on change ce que la sonde mesure, jamais son seuil.**
  Ici on a changé ce qu'elle mesure parce que l'épreuve au rouge a montré qu'elle mesurait une
  propriété que la garde ne contrôle pas.

## 🔧 11/09/2026 — CE QU'IL FAUT SAVOIR POUR ÉCRIRE UNE SONDE SUR L'ADMIN

Quatre pièges rencontrés en écrivant `test-accroches-v2`, tous ayant produit un résultat FAUX avant
d'être compris. À lire avant d'en écrire une autre.

- **`Profiler.takePreciseCoverage` REMET LES COMPTEURS À ZÉRO** à chaque lecture : une lecture est un
  DELTA depuis la précédente. La première version calculait `après − avant` et rapportait des
  comptes **négatifs** (`rasteriser ×−2`). On purge avant, on lit après, on ne soustrait pas.
- **V8 compile paresseusement** : une fonction jamais exécutée peut être **absente** du rapport de
  couverture, pas à zéro. « Absente » doit être interprétée comme « zéro appel ».
- **`let` en portée globale n'est PAS une propriété de `window`.** Lire `window.currentCustomTheme`
  renvoie `undefined` : la sonde concluait « aucun thème sélectionné » alors qu'il l'était. Il faut
  lire l'identifiant nu. Même piège à l'épreuve au rouge du garde de course : `window.v2ApercuGen =
  undefined` **ne désarmait rien** et l'épreuve « passait » sans avoir rien désarmé. Ce qui EST sur
  `window`, c'est une **déclaration de fonction** — d'où le remplacement de `apercuV2Canvas`.
- **L'aperçu est un VOLET GARÉ HORS ÉCRAN.** En mobile, `.preview-pane` est `position:fixed` avec
  `translateY(-900px)` jusqu'à ce que le client touche la mini-vignette. Sans `togglePreview()`,
  `getBoundingClientRect` renvoie **y = −628** : la souris tape 600 px au-dessus de la fenêtre et la
  sonde conclut « le glissement ne marche pas ». **Rouge pour une raison étrangère à ce qu'elle
  mesure.**

⚠️ **ET UN CINQUIÈME, QUI EST LE MOTIF DU « CHIFFRE JUSTE SOUS UN MAUVAIS NOM » — 5ᵉ exemplaire.**
La sonde du point 23 injectait le thème sans `template` **en queue** de `themes.json`. Or l'admin
auto-sélectionne le thème **n° 1** à l'ouverture du studio (`renderCustomThemes`) — `sassy-carte`,
qui A un template : son aperçu se rasterisait, et la couverture comptait CE rendu-là. La sonde
annonçait « le moteur s'est réveillé » en affichant `socleCSS`, `css`, `corps`, `xml` et six requêtes
`.woff2` — **des comptes exacts, appartenant à un autre thème**. Corrigé en plaçant le thème en TÊTE :
rien qui porte un template n'est alors touché de tout le parcours, et l'absence de requête `.woff2`
redevient un critère valide (les polices sont mises en cache dans `_assets` dès le premier rendu v2 ;
après lui, leur absence ne prouve plus rien).

## ✅ 11/09/2026 — LE 10ᵉ GARDE-FOU : `test-accroches-v2`

`npm run test-accroches-v2 [port]` — 8 critères, chacun **vu rouge avant d'être cru vert**, et six
drapeaux d'épreuve qui reproduisent chaque rouge à la demande :

| critère | ce qu'il mesure | son épreuve au rouge |
|---|---|---|
| A1 | le v2 peint les 6 thèmes, bandeau caché | `--rouge-sans-moteur` |
| A2 | la panne crie À L'ÉCRAN, la publication tient | `--rouge-muet` (19 `console.warn` émis, **et la sonde reste rouge**) |
| B1 | le geste de cadrage aboutit (la parenté) | `--rouge-hors-hote` |
| B2 | le calque est transparent au survol | `--rouge-sans-garde` |
| C  | un thème sans `template` n'exécute aucune ligne | `--rouge-avec-template` |
| D1 | l'aperçu typo passe par le rasteriseur | `--rouge-sans-moteur` |
| D2 | gabarit masqué seulement quand il le faut | `--rouge-sans-moteur` + test destructif |
| D3 | pas de rendu périmé affiché | `--rouge-sans-compteur` |

La panne employée par A2 est **réelle, pas un monkeypatch** : les `.woff2` répondent 404 — la panne la
plus probable en production (un chemin d'asset qui bouge).

⚠️ **PRÉREQUIS NON ÉVIDENT** : ce garde-fou, comme les 9 autres, exige que le site soit servi
**localement** (le bypass `DEV_LOCAL` de `restoreSession` démarre l'admin sans Netlify Identity — en
prod le hostname n'y est pas). Contrairement aux 9 autres il est **immunisé contre le faux rouge du
serveur mono-thread** (cf. section dédiée plus bas) : il intercepte lui-même les `/.netlify/*` et
répond 404 immédiatement, au lieu d'attendre `networkidle0`.

## ⚠️ MOTIF — UN COMMENTAIRE EST UNE SONDE, ET PERSONNE NE LE RELANCE

*(11/09/2026, au bout des accroches)*

Le motif « une sonde qui ne couvre qu'un cas ment par omission » (cf. plus haut) a un **premier
exemplaire où le menteur est un COMMENTAIRE**, pas une sonde :

> `⚠️ sassy-photo NE DÉCLARE AUCUNE zoneTexte — vérifié dans themes.json.`

Écrit dans `PHOTO.css` du moteur, avec la mention explicite d'une vérification. La vérification
avait eu lieu — sur `carre` et `portrait`. Pas sur **story**, où le thème déclare bien une
`zoneTexte` et où l'admin offre le champ `#storyText`. Le template ne peignait donc pas ce texte :
publier une story photo par le v2 aurait **jeté ce que le client a écrit**, sans erreur, sans trace.

**→ LA RÈGLE : un commentaire est une sonde comme une autre. Il affirme sans mesurer, et
personne ne le relance.**

C'est ce dernier point qui le rend PIRE qu'une sonde fausse :

| | une sonde fausse | un commentaire faux |
|---|---|---|
| se rejoue | à chaque `npm run` | **jamais** |
| est confrontée au code | en permanence | **une fois, le jour où on l'écrit** |
| vieillit | visiblement (elle rougit) | **en silence** |

Conséquences pratiques, à appliquer :
- une affirmation du type « vérifié dans `themes.json` » se vérifie sur **les trois formats**, jamais
  sur celui qu'on a sous les yeux. Idem pour « sur les six thèmes », « partout dans l'admin ».
- un commentaire qui affirme un FAIT doit dire **comment on le reconstate** (le chemin, la commande,
  le champ) — sinon il n'est pas re-vérifiable, donc il n'est pas une sonde, juste une croyance.
- quand un commentaire est démenti, **on le réécrit en disant qu'il était faux** (c'est ce qui a été
  fait : le bloc porte maintenant un 🔴 et raconte l'erreur). Le supprimer effacerait la leçon.

## ⚠️ MOTIF — UNE SONDE PEUT VÉRIFIER LA MAUVAISE GARANTIE

*(11/09/2026, au bout des accroches)*

Les trois occurrences précédentes disaient : *quand une sonde rougit sur un cas légitime, on change
ce qu'elle mesure, jamais son seuil.* En voici une **quatrième, d'une autre espèce** : la sonde était
VERTE, et c'est son épreuve au rouge qui a révélé qu'elle ne mesurait pas ce qu'elle croyait.

**La sonde `pointer-events` de l'aperçu photo.** Hypothèse : les calques du décor v2 sont posés
par-dessus la photo déplaçable, donc `pointer-events:none` est ce qui laisse passer le geste de
cadrage. Épreuve : on retire la garde, le glissement doit mourir.

**Il n'est pas mort. Δfocal = 0,5000 dans les deux cas** — geste de confiance (`page.mouse`), doigt
posé sur le voile. Raison mesurée : les écouteurs `pointerdown`/`pointermove` vivent sur `#igPhoto`,
et les calques sont ses **ENFANTS**. L'événement remonte, quelle que soit la cible du survol.

→ **La garantie portante est LA PARENTÉ, pas le CSS.** C'est elle qu'un remaniement peut rompre, en
  posant le décor ailleurs que dans l'hôte. Critère **B1** de `test-accroches-v2`, éprouvé au rouge
  avec un décor posé à côté de l'hôte : geste mort, Δ 0,0000.
→ `pointer-events:none` achète autre chose, réel mais de moindre portée : le calque reste
  **transparent au test de survol** (curseur `grab` conservé, pas de sélection sur la signature).
  Critère **B2**, qui rougit bien quand on retire la garde.
→ **La note du bout M4 est corrigée** : elle disait « `pointer-events:none` non testé par une
  sonde », ce qui supposait une garde qui ne garde pas ça. Deux critères ont remplacé la sonde
  fausse, au lieu de la garder verte sur un mauvais motif.

⚠️ **CE QUE ÇA AJOUTE À LA DOCTRINE : une sonde verte n'est pas une sonde valide.** Seule l'épreuve
au rouge dit ce qu'elle mesure vraiment. Celle-ci serait restée verte pour toujours, en donnant
l'impression de garder une propriété qu'elle ne gardait pas — et le jour où quelqu'un aurait sorti
le décor de l'hôte, elle n'aurait rien vu.

## 🔴 LE FAUX ROUGE DU SERVEUR MONO-THREAD — À LIRE AVANT DE CONCLURE À UNE RÉGRESSION

*(11/09/2026, au bout des accroches)*

**LE SYMPTÔME.** Un garde-fou s'arrête sur `TimeoutError: Navigation timeout of 30000 ms exceeded`,
dans `CdpFrame.goto`, **avant d'avoir rien testé**. Pas un critère rouge : un plantage. Ça ressemble
à une régression de l'admin. Ce n'en est pas une.

**LA CAUSE, MESURÉE.** Les **neuf** garde-fous naviguent en `waitUntil: 'networkidle0'`. L'admin
appelle `/.netlify/functions/get-instagram-status` au démarrage. Sur un serveur statique **qui ne
traite qu'une requête à la fois**, cet appel reste **en vol 8 s et plus** (mesuré) : `networkidle0`
n'arrive jamais, et `goto` expire. Les neuf y sont exposés — lesquels tombent dépend de ce qui se
trouve en vol au moment de la navigation, pas du script.

⚠️ **CE N'EST PAS LA COMMANDE DOCUMENTÉE QUI EST EN CAUSE, ET J'AI DIT LE CONTRAIRE.**
J'ai d'abord rapporté que *« deux garde-fous expirent sur `python3 -m http.server` »*. **C'est faux,
et la mesure le dit :** `python3 -m http.server` emploie **`ThreadingHTTPServer` depuis Python 3.7**
(vérifié dans la source du module, Python 3.9.6), et sur lui `scan-troncature` et `test-allerretour`
passent tous les deux au vert. Le serveur fautif était **le mien** — un `socketserver.TCPServer`
écrit à la main pour le harnais des sondes, mono-thread par défaut.
→ Encore un « chiffre juste sous un mauvais nom » : le timeout était réel, la cause diagnostiquée
  ne l'était pas. Et je l'avais écrit dans un rapport avant de l'avoir vérifié.

**CE QU'IL FAUT FAIRE.**
- Lancer les garde-fous avec la commande documentée : `python3 -m http.server 8080`. Elle va bien.
- Si tu écris un serveur à la main pour une sonde : **`ThreadingHTTPServer`, jamais
  `socketserver.TCPServer`.** Ou bien intercepter les `/.netlify/*` côté client, ce que fait
  `test-accroches-v2` (404 immédiat) — c'est pourquoi lui seul est immunisé.
- Devant un `Navigation timeout` dans `goto` : **vérifier le serveur avant de soupçonner l'admin.**
  La requête en vol se lit en quelques lignes (`p.on('request')` / `requestfinished`, puis afficher
  ce qui reste après 8 s).

## 📌 CHANTIER LOGO — CE QUI EST CONSTATÉ ET NON TRAITÉ (14/09/2026)

**1 · Les logos s'écartent des tokens d'un bit, sur deux des quatre.**
Relevé à la pipette sur l'encre opaque :

| | encre du fichier | token de la charte | écart |
|---|---|---|---|
| `blanc.png` | `#FFFFFF` | `#FFFFFF` | — |
| `jaune.png` | `#FFF08B` | `#FFF08B` | — |
| `creme.png` | `#FBF2E2` | `#FAF1E2` | **R+1 V+1** |
| `bleu.png` | `#2050E8` | `#2050E7` | **B+1** |

Invisible à l'œil, et très probablement un arrondi d'export. On ne touche pas aux
fichiers du client sur un bit. À rouvrir **seulement** si un jour on génère les logos
depuis les tokens plutôt que l'inverse.

**2 · 5,2 Mo récupérables sur les images DÉJÀ en ligne.**
Trois PNG non compressés servent des photographies, et portent un canal alpha entièrement
opaque (25 % d'octets inutiles) :

| | PNG | webp q82 | |
|---|---|---|---|
| `galerie1.png` | 1 800 Ko | **76 Ko** | 4 % |
| `galerie4.png` | 2 555 Ko | **152 Ko** | 6 % |
| `hero1.png` | 976 Ko | **99 Ko** | 10 % |

Total des images du site aujourd'hui : **5 857 Ko** (5 626 de fichiers + 231 de base64
inline). Indépendant du chantier photos : c'est de l'existant.

**3 · La piste `mask-image` pour les logos du moteur v2 — NON VÉRIFIÉE.**
L'encre des logos est plate et leur alpha quasi binaire (3 valeurs distinctes). Un **seul**
PNG employé en `mask-image`, coloré par un token, servirait donc les six templates pour
17,4 Ko de base64 au lieu de 69,8 — ce qui garderait la charge par slide à 170 Ko, sous le
repère de 180 Ko validé sur iPhone réel chez Georges.

⚠️ **RÉSERVE, ET ELLE EST SÉRIEUSE : on ne sait pas si `mask-image` survit à la
rasterisation dans un `foreignObject`.** C'est exactement la famille des trois pièges
silencieux de ce chemin (polices non embarquées, `xmlns` manquant, XML strict) — un SVG
refusé ne dit rien. **À éprouver avant d'y compter**, sur le banc de `controle-moteur.html`
et pas en production.

⚠️ Et le chiffre qui a fait écarter le branchement direct : **deux variantes déclarées
mettent chaque slide à 188 Ko**, au-dessus du repère. Les six templates portent déjà
« bistrot sassy » **en texte** en bas (`.pied` à opacité .45 sur les quatre typo, `.sign` à
.7 sur photo ; EVENT n'en a aucun). Remplacer un texte propre par une image plus lourde
n'a pas de gain établi. À rouvrir après le RDV.

**4 · `.on-cream` n'a pas d'appel initial.**
`index.html` ne bascule la classe que dans l'écouteur de scroll :

```js
window.addEventListener('scroll', () => {
  nav.classList.toggle('on-cream', window.scrollY > heroH() - 80);
}, { passive: true });
```

Au **rechargement en milieu de page** — Safari restaure la position — la barre reste donc
bleue jusqu'au premier scroll. **Antérieur au chantier logo**, et ça ne crée aucun défaut
nouveau : le logo suit la même classe que le fond, donc il reste cohérent avec lui dans
tous les cas. Un appel unique au `load` suffirait ; ce n'est pas une décision à prendre de
notre initiative.

## 🔴 « 7,50 Mo → 344 Ko » EST JUSTE ET TROMPEUR — le vrai chiffre de page est +327 Ko

*(14/09/2026, au chantier photos)*

Le message du commit `600b912` annonce *« les 3 photos converties en webp — 7,50 Mo devient
344 Ko »*. **C'est exact, et ça ne décrit pas ce que le visiteur télécharge.** Les 7,50 Mo
sont le poids des **masters PNG** déposés à la racine, que la page n'a jamais servis.

Ce que la page charge **réellement**, mesuré au réseau sur la prod puis en local :

| | images chargées |
|---|---|
| avant le chantier photos | **5 872 Ko** |
| après | **6 199 Ko** |
| | **+327 Ko** |

Parce que les deux devantures (61 + 93 = 154 Ko) remplacent deux blobs qui ne pesaient que
30 Ko — les emplacements 1 et 2 portaient des **graphismes plats**, très légers — et que les
piments **ajoutent** 190 Ko.

**→ Énième exemplaire du motif « un chiffre juste sous un mauvais nom ».** Le nombre est bon,
son étiquette dit « la conversion a fait maigrir » quand elle a fait **grossir la page**. Les
deux chiffres doivent voyager avec leur nom :

- **niveau FICHIER** : 7,50 Mo de masters PNG → 344 Ko de webp. Vrai, et sans effet sur la page.
- **niveau PAGE** : 5 872 → 6 199 Ko, soit **+327 Ko**. C'est celui qui compte pour le visiteur.

⚠️ On ne réécrit pas le message de `600b912` : l'historique ne se retouche pas pour rendre un
   message plus joli — c'est la règle posée le 11/09. La correction vit ici.

⚠️ Et le contexte qui rend le +327 Ko acceptable : **galerie4 (2 555 Ko) + galerie1 (1 800) +
   hero1 (976) font 5 331 des 6 199 Ko**. Le levier n'est pas dans les photos ajoutées.

## 🔴 135 Ko TÉLÉCHARGÉS PUIS JETÉS À CHAQUE VISITE

*(14/09/2026, mesuré au réseau pendant le chantier photos)*

`hero2.png` (87 Ko) et `hero3.png` (48 Ko) sont **récupérés par le navigateur puis remplacés**
sans jamais être affichés. Ce sont les `src` écrits **en dur** dans `index.html` sur les cartes
`card-1` et `card-2` ; `sassy-cms-loader.js` écrase leur `src` depuis `_data/photos.json` après
le chargement — mais la requête est déjà partie.

**135 Ko perdus par visiteur.** Antérieur au chantier photos : ça existait déjà quand les
emplacements portaient les deux blobs.

⚠️ **Ce n'est pas un bug, c'est le coût du repli sûr** : ces `src` en dur sont ce qui s'affiche
   si `photos.json` tombe ou tarde. Les retirer rendrait le hero vide en cas d'échec. Le
   corriger veut donc dire **remplacer** les `src` de repli par les webp désormais servis
   (`devanture-vitrine` 61 Ko, `devanture-enseigne` 93 Ko) — le repli reste, et il devient
   l'image juste au lieu d'une ancienne.

→ **À régler dans le même chantier que les 5,2 Mo récupérables** (section plus haut) : les deux
  sont du poids d'images sur des fichiers déjà en ligne, et les deux se mesurent au réseau, pas
  sur le disque.

## 🔴 14/09/2026 — LE CODE SURVEILLÉ PEUT AVEUGLER SA PROPRE SONDE

*(nouvelle forme du motif « une sonde qui ment par omission » — celle-ci ne vient pas de
la sonde)*

Au passage du logo dans `dujour`, le détecteur de débordement a **baissé** : 203 → 165 px
sur `carre`. Contre-intuitif — le logo est plus haut que le texte qu'il remplace, le
chiffre devait monter.

**LA CAUSE, ÉPROUVÉE ET NON RACONTÉE.** Le pied est devenu un div **VIDE à hauteur fixe**
dans une colonne flex, et `flex-shrink` vaut **1 par défaut** : le navigateur avait le
droit de le comprimer, alors qu'un div de texte ne descend pas sous sa ligne. Mesure
directe, `dujour · carre` avec 3 plats à descriptifs (débordement léger) :

| | hauteur du pied | débordement rapporté |
|---|---|---|
| **sans** `flex-shrink:0` | **28,3 px** — 52 % de sa taille | **0 px** |
| **avec** `flex-shrink:0` | 54 px | **26 px** |

**→ Le logo absorbait le débordement et rendait le détecteur aveugle.** Il annonçait 0 là
où il y a 26, et 165 là où il y a 219.

⚠️ **CE QUE ÇA AJOUTE À LA DOCTRINE.** Jusqu'ici le motif « une sonde qui ment par
omission » désignait toujours un défaut **de la sonde** : elle ne couvrait qu'un format,
elle mesurait un proxy commode, elle était muette par `contain:strict`. **Ici la sonde est
juste ; c'est le code surveillé qui la désarme.** Une garde de mise en page — un
`flex-shrink` implicite — a suffi à faire disparaître un symptôme que le garde-fou existait
précisément pour voir.

→ **La règle : quand une sonde baisse alors qu'elle devait monter, chercher qui ABSORBE.**
  Un élément compressible, un `overflow` qui rogne, un `min-height` qui plafonne : tout ce
  qui peut encaisser silencieusement le symptôme au lieu de le laisser paraître.
→ Et la méthode qui a marché : **remesurer l'état d'avant dans les mêmes conditions**
  (203 px reproduit) pour comparer deux mesures et non deux souvenirs, **puis** poser
  l'hypothèse et la tester — `flex-shrink:0` a fait remonter le chiffre à 219, soit
  exactement la hauteur du logo.

## ⚠️ 14/09/2026 — UN CORPS VIDE DEVRAIT SE VOIR (fragilité de mes sondes)

Trois fois dans la même journée, une sonde a employé **une mauvaise clé de slide** :

| sonde | clé employée | clé attendue |
|---|---|---|
| options EVENT | — | *(correcte)* |
| CARTE, 1ᵉʳ rendu | `nom` / `prix` | **`n` / `p`** |
| DUJOUR, 2 rendus | `produits` | **`dishes`** |

Chaque fois, `corps` **filtre sur `d.n`** et rend donc une liste **VIDE, sans le moindre
message**. Le visuel produit a l'air correct : titre, tampon, habillage, signature — tout
est là sauf le contenu. **Une sonde mal formée produit un rendu plausible**, et c'est
exactement la famille de défauts que ce projet traque.

⚠️ Ce n'est pas une fragilité du moteur : un template qui ne reçoit rien ne doit rien
   inventer. C'est une fragilité **des sondes**, et elle se corrige de leur côté.

→ **Piste, non traitée :** que le rasteriseur ou le banc de contrôle **compte ce qu'il a
  peint** et le dise — nombre de lignes, de plats, de caractères rendus. Un rendu qui
  annonce « 0 plat » à côté d'un slide qui en déclarait 4 se verrait immédiatement. La
  sonde 4 (« qui a peint ») fait déjà ça pour les couleurs ; il manque l'équivalent pour
  le CONTENU.

## 🔴 14/09/2026 — LA SIGNATURE DU THÈME PHOTO EST ILLISIBLE SUR UNE PHOTO CLAIRE

**Elle échoue depuis M3, avant le logo.** Le texte « bistrot sassy » du thème photo donne
**1,66 de contraste** sur une photo claire — relevé sur le rendu, pas calculé. Le logo
**n'aggrave pas** : 1,68. Il hérite du défaut.

**LA GÉOMÉTRIE, CALCULÉE À W = 1080.** Le voile monte de 0 à 237,6 px depuis le bas, en
dégradé linéaire de `.78` à `0`. La signature vit à 59,4 px du bas :

| | occupe | α du voile en bas | α en haut |
|---|---|---|---|
| le texte (`signTail` .026) | 59,4 → 87,5 px | .585 | .493 |
| le logo (`MEP_LOGO.haut` .050) | 59,4 → 113,4 px | .585 | **.408** |

Le logo reste **dans** le voile, mais plus haut — donc là où le voile est plus faible.

**AUCUN RÉGLAGE SIMPLE N'Y SUFFIT**, chiffré au pire cas (haut de la signature, photo
blanche) :

| levier | contraste |
|---|---|
| rien | 1,49 |
| logo à opacité 1,00 | 1,74 |
| `voileA` 0,95 | 1,68 |
| `voileH` 0,34 | 1,78 |
| `voileA` 0,95 **et** opacité 1,00 | 2,06 |

Du crème sur un bleu éclairci par du blanc, ce sont **deux valeurs claires** : la densité
maximale du voile en bas ne change rien à sa faiblesse là où la signature se trouve.

**LA CORRECTION MESURÉE : UN VOILE À BANDE SOLIDE.** Le voile tient `.78` jusqu'à un peu
au-dessus de la signature, puis s'éteint — un dégradé à palier au lieu d'un dégradé pur.
Avec le logo à `.85` : **3,44 relevé sur le rendu**. Sur une photo noire, 4,62.

⚠️ **POURQUOI CE N'EST PAS FAIT** (décidé le 14/09, la veille du RDV) :
- ça change **le décor de tous les thèmes photo, `event` compris, ET l'aperçu** —
  `MEP_PHOTO` est partagée, c'est ce qui rend « aperçu == export » indéfectible. Le bas de
  l'image deviendrait une bande bleue franche sur ~113 px au lieu d'un dégradé continu ;
- l'opacité `.85` remonterait **aussi les quatre templates typo** (CARTE 3,51 → 4,46,
  INFOS et ANNONCE 3,27 → 4,31, DUJOUR 3,30 → 4,30) : plus lisible, **moins discret** ;
- ou bien il faut une exception pour PHOTO seul — et `MEP_LOGO` cesse d'être une table
  unique, ce qu'on a construit exprès pour qu'aucun réglage ne puisse diverger.

→ **PHOTO garde donc son TEXTE** pour l'instant : c'est le seul des six à ne pas porter le
  logo. Inconséquence assumée, visible et documentée, plutôt qu'un changement de DA sur six
  templates la veille d'une démonstration, pour un défaut antérieur au chantier.
→ **À traiter mercredi**, avec la passe du backlog. Trois voies chiffrées ci-dessus : B
  intégral, B avec exception, ou statu quo assumé.

## 🔴 14/09/2026 — L'APERÇU DU THÈME ÉVÉNEMENT NE MONTRE PAS CE QUI PART

**Mesuré dans l'admin réel**, sur les deux thèmes de type `photo` :

| thème | l'APERÇU dessine | l'EXPORT produit | |
|---|---|---|---|
| `sassy-photo` | voile ✓ · `sign` « bistrot sassy » ✓ | voile 1 · sign 1 | cohérent |
| `sassy-event` | voile ✓ · `sign` « bistrot sassy » ✓ | voile 1 · **sign 0** · **carte 1** | **divergent** |

**LA CAUSE.** `habillerApercuPhoto` branche sur `theme.type`, **jamais sur
`theme.template`** — et `sassy-photo` comme `sassy-event` sont tous deux de type `photo`.
L'aperçu leur pose donc le même décor : voile + signature en bas à gauche. Or le corps
d'EVENT n'a **jamais** contenu de `.sign` : il porte une **carte blanche** que l'aperçu ne
dessine pas du tout.

**CE QUE LE CLIENT VOIT, CONCRÈTEMENT.** À l'écran : la photo, un voile bleu, et « bistrot
sassy » en petites capitales crème en bas à gauche. Ce qui partirait sur Instagram : la même
photo, le même voile, mais **une carte blanche en bas** portant le badge de date, le titre,
la description et le logo. L'aperçu affiche une signature qui n'existera pas, et cache
entièrement la carte qui existera.

⚠️ **ANTÉRIEURE, ET ÉLARGIE D'UN ÉLÉMENT.** Relevé sur l'historique : **avant** le commit
du logo dans EVENT, le corps donnait `sign=0 carte=1 pied=0` ; **après**, `sign=0 carte=1
pied=1`. La divergence date de M4/M5 — `pose('v2-sign')` est apparu au commit `c5ae09e`
(« l'apercu en calques ») et le template `event` n'a jamais eu de `.sign`. Le commit du logo
ne l'a pas créée ; il a ajouté un élément de plus que l'aperçu ne montre pas.

→ **Non traité, autre chantier.** La corriger proprement veut dire que l'aperçu **dessine la
  carte blanche** — badge, titre, description, logo — et non qu'il se contente de retirer le
  `sign`. C'est le seul cas où « aperçu == export » n'est pas tenu par `MEP_PHOTO`, parce que
  la carte n'est pas dans la table : elle est dans le template.
→ ⚠️ À ne pas confondre avec le branchement sur `theme.template` fait le 14/09 pour le
  thème photo : celui-là garantit que PHOTO, privé de son voile, n'est pas dessiné avec un
  voile dans l'aperçu. Il ne touche pas au cas d'EVENT.

## Rappels techniques (learnings)
- Moteur studio 4 étapes : ne pas toucher `goStep`/`slideToStep`/`adjustStepsHeight`/`currentStep`.
- **Instagram : l'API est `graph.instagram.com`, JAMAIS `graph.facebook.com`.** Les tokens
  Instagram-Login ne sont pas parsables par l'API Facebook, qui répond un `190` trompeur.
- Netlify : Identity KO en deploy preview → tests finaux sur prod main. Admin non testable en local (Identity).
- Meta : triplet visible sans clic tant que review non validée (cause des rejets Policy 1.6 passés).

## Priorité immédiate (hors backlog)
- Démo Masa : vérifier statut Meta, tester studio Masa sur iPhone, décider publication démo (compte testeur Meta vs `@lestud13` + phrase de cadrage).
