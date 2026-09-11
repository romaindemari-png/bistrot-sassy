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

## Rappels techniques (learnings)
- Moteur studio 4 étapes : ne pas toucher `goStep`/`slideToStep`/`adjustStepsHeight`/`currentStep`.
- **Instagram : l'API est `graph.instagram.com`, JAMAIS `graph.facebook.com`.** Les tokens
  Instagram-Login ne sont pas parsables par l'API Facebook, qui répond un `190` trompeur.
- Netlify : Identity KO en deploy preview → tests finaux sur prod main. Admin non testable en local (Identity).
- Meta : triplet visible sans clic tant que review non validée (cause des rejets Policy 1.6 passés).

## Priorité immédiate (hors backlog)
- Démo Masa : vérifier statut Meta, tester studio Masa sur iPhone, décider publication démo (compte testeur Meta vs `@lestud13` + phrase de cadrage).
