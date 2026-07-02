# BACKLOG — LeLab / Studio

> Fichier de suivi. À terme il vit dans le master `lestud-template-food` (doc partagée).
> Dernière mise à jour : session refonte studio Sassy.

## Contexte repos (attention à la divergence)
- **`lestud-template-food`** = MASTER / source canonique famille food. A l'overlay cinéma. N'a PAS la refonte studio de cette session.
- **`bistrot-sassy`** = fork de TEST + démo Meta. A la refonte studio de cette session. N'a PAS l'overlay cinéma.
- **`masamadre-lelab`** = fork CLIENT (Masa). A l'overlay cinéma. N'a PAS la refonte studio de cette session.

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

## Chantiers STUDIO (raffinement)
- [ ] Vignette Insta mobile : dégraisser l'habillage encadré → **ligne fine** sous le bandeau (poids visuel).
- [ ] Vignette Insta : **avatar + popup moderne** (pattern Buffer/Later). ⚠️ **SEULEMENT après validation Meta** — tant que la review n'est pas passée, le triplet avatar+@compte+ID doit rester visible SANS clic.
- [ ] Calage responsive de la vignette en **zone intermédiaire** (désalignement).
- [ ] **Format en étape séparée** (parcours 5 étapes). ⚠️ Touche le moteur (goStep clampe 1→4, stepper 4 pastilles) — gros chantier.
- [ ] Stepper : **pictos + mots** (polish DA). Jamais pictos seuls (cible 40+).
- [ ] Décider du sort du **grisé desktop des étapes** (garder / remplacer par points) — à juger sur pièce.

## Rappels techniques (learnings)
- Moteur studio 4 étapes : ne pas toucher `goStep`/`slideToStep`/`adjustStepsHeight`/`currentStep`.
- Netlify : Identity KO en deploy preview → tests finaux sur prod main. Admin non testable en local (Identity).
- Meta : triplet visible sans clic tant que review non validée (cause des rejets Policy 1.6 passés).

## Priorité immédiate (hors backlog)
- Démo Masa : vérifier statut Meta, tester studio Masa sur iPhone, décider publication démo (compte testeur Meta vs `@lestud13` + phrase de cadrage).
