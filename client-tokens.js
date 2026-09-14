/* ════════════════════════════════════════════════════════════════════════
   CLIENT_TOKENS — LA CHARTE DE BISTROT SASSY. Le SEUL fichier de code qui lui appartienne.
   ⚠️ Le NOM du fichier et le NOM de la constante sont NEUTRES, et doivent le rester : c'est ce qui
      permet à l'admin d'être un `cp` d'un fork à l'autre. Chaque client a SON client-tokens.js —
      mêmes clés, ses valeurs. (Avant : SASSY_TOKENS ici, MASAMADRE_TOKENS chez Masa, et l'admin
      devait être édité pour l'un ou pour l'autre.)

   Remplace `sassy-tokens.js`, resté au nom d'avant la dé-branding : Sassy n'avait jamais reçu
   cette vague (cf. BACKLOG master, point 30.1).

   Miroir du :root d'index.html — relevé à la pipette, jamais supposé :
     accent #2050E7 ↔ --blue   |   creme #FAF1E2 ↔ --cream   |   jaune #FFF08B ↔ --yellow
   ⚠️ `jaune` MANQUAIT dans sassy-tokens.js alors que le site le déclare : les trois couleurs de
      la charte y sont désormais toutes les trois.
   ════════════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════════════
   ⚠️ LES POLICES DE MARQUE — CE QUI EST VRAI, ET CE QUI EST IMPOSÉ PAR LES FICHIERS

   Avant ce fichier, les tokens déclaraient **Bricolage Grotesque et Inter** — les polices de
   l'INTERFACE LeLab, pas celles du client. Canela et Elms n'apparaissaient pas une seule fois
   dans l'admin. Chaque post était donc composé dans la typo du back-office, en silence :
   `ensureStudioFonts()` appelle `document.fonts.load()`, qui **ne lève jamais** quand la famille
   est absente — le peintre retombait sur une police système sans un mot.

   Les deux fichiers ont été EXTRAITS des base64 d'`index.html`, puis CONVERTIS EN WOFF2.
   `index.html` n'est PAS modifié : le site garde ses polices embarquées, l'admin a les siennes.

   ⚠️ POURQUOI WOFF2, ET CE N'EST PAS QUE DU CONFORT. Le moteur v2 embarque les polices EN BASE64
      DANS LE SVG — un SVG en `data:` URI est un document ISOLÉ : il ne voit ni les @font-face de
      la page, ni un fichier par URL. La charge par slide en dépend donc directement :
        OTF + TTF ..... 312 Ko binaire  ->  416 Ko de base64
        WOFF2 ......... 115 Ko binaire  ->  154 Ko de base64
        Georges ....... 180 Ko de base64, VALIDÉ sur iPhone réel
      On passe donc SOUS une configuration déjà éprouvée sur un vrai appareil, au lieu de 2,3× au-dessus.
      Conversion vérifiée : mêmes noms, 494 et 1080 glyphes inchangés, Elms toujours variable.

   ⚠️ LEURS GRAISSES RÉELLES, MESURÉES (fontTools, pas déduites du nom) :
     · canela.woff2 — CFF (`OTTO`), STATIQUE, usWeightClass **900** (« Canela Black »). UNE seule graisse.
       → tout ce qui est en `titre` DOIT demander 900. Demander 700 ferait SYNTHÉTISER un faux
         gras par le navigateur, sans erreur et sans que ça se voie ailleurs qu'à l'œil.
     · elms.woff2 — TrueType **VARIABLE**, axe `wght` 100 → 900 (défaut 100, « Elms Sans Thin »).
       → toute graisse de 100 à 900 est rendue NATIVEMENT. Rien à aligner ici.

   D'où la règle de ce fichier : `titre` ⇒ 900, toujours. `body` ⇒ ce que la DA veut.
   ⚠️ Le jour où une Canela d'une autre graisse arrive, c'est CE commentaire qu'on corrige aussi.
   ════════════════════════════════════════════════════════════════════════ */

const CLIENT_TOKENS = {

  /* Polices de MARQUE à injecter (@font-face) — lues par `injecterPolicesDeMarque()` au démarrage
     de l'admin. Le CSS de l'admin reste commun : plus aucun @font-face en dur dans le code.
     ⚠️ `weight:'100 900'` sur Elms n'est pas une coquette : c'est ce qui autorise le navigateur à
        employer l'axe variable au lieu de synthétiser. Une valeur unique le priverait de l'axe. */
  fontFaces: [
    { family:'Canela', src:"url('/assets/fonts/canela.woff2') format('woff2')", weight:900 },
    { family:'Elms',   src:"url('/assets/fonts/elms.woff2') format('woff2')",   weight:'100 900' }
  ],

  /* Les LOGOS de marque, lus par `listeAssets()` du moteur v2 et embarqués en base64
     dans chaque SVG. Chaque entrée coûte ~17,5 Ko de base64 PAR SLIDE.
     ⚠️ UNE SEULE VARIANTE EST DÉCLARÉE, ET C'EST MESURÉ. Le moteur la colore par
        `mask-image` depuis les tokens, donc un fichier suffit pour les six templates :
          polices seules ......... 152,8 Ko
          + 1 variante (masque) .. 170,4 Ko  ← ici, 5,4 % SOUS le repère
          + 2 variantes .......... 187,9 Ko  → 4,4 % au-dessus
          repère iPhone validé chez Georges : 180 Ko
        La piste a été éprouvée sur le vrai chemin de rasterisation (témoin sans masque à
        100 %, masques à 28,9 %) ET sur un iPhone réel — c'est Safari qui rasterise, pas
        nos machines. Banc : `BANC-mask-image-iphone.html`.
     ⚠️ DÉCLARER UNE SECONDE VARIANTE FAIT PASSER CHAQUE SLIDE AU-DESSUS DU REPÈRE.
        `chargerAssets()` embarque TOUS les logos déclarés dans CHAQUE slide, même ceux
        qu'un template n'emploie pas. Ce n'est donc pas gratuit : à ne faire que mesure
        en main sur un appareil réel. */
  logos: { creme: '/assets/logos/creme.png' },

  /* La PHOTO DE DÉMO du thème photo — montrée avant tout upload, JAMAIS publiée.
     C'est un asset du client : le chemin se déclare ici, pas dans le code de l'admin.
     '' ou absent → thème photo vide. (Le fichier est arrivé au bout 5 du re-base.) */
  demoPhoto: '/_data/demo/photo-demo.jpg',

  // ── Niveau 1 : PRIMITIVES (valeurs brutes = miroir du :root du site) ──
  primitives: {
    color: {
      creme:'#FAF1E2', blanc:'#FFFFFF', encre:'#211f1e', accent:'#2050E7',
      jaune:'#FFF08B',                       // --yellow : la 3ᵉ couleur de la charte
      texte:'#3a3a3a', texteDoux:'#6b6b6b'
    },
    font: {
      titre: "'Canela', Georgia, serif",     // Canela Black — 900 UNIQUEMENT
      body:  "'Elms', sans-serif"            // Elms Sans variable — 100 à 900
    }
  },

  /* ── Niveau 2 : SÉMANTIQUE (rôles → réfèrent les primitives par CLÉ).
     Les templates ne lisent QUE ce niveau. ── */
  semantic: {
    // nom de produit — Elms, graisse libre (police variable)
    nomProduit: { font:'body',  color:'texte', sizeRatio:0.036, sizeMin:0.028, weight:600, baselineOffset:0.4, letterSpacing:0, uppercase:false },

    /* prix — Canela. ⚠️ 700 → 900 : IMPOSÉ PAR LA POLICE, pas un choix de DA. Canela n'existe
       qu'en Black ; 700 aurait été synthétisé. Le rendu à l'écran est le même ou meilleur. */
    prix:       { font:'titre', color:'encre', weight:900, sizeScale:0.70, align:'right', letterSpacing:0 },

    /* align: 'left' | 'center' | 'right' — absent = 'left'. (Masa centre ses catégories.)
       ⚠️ Même contrainte de graisse que le prix : Canela ⇒ 900. */
    categorie:  { font:'titre', color:'accent', sizeRatio:0.030, weight:900, letterSpacing:0.12, uppercase:true, gapRatio:0.55, align:'left' },

    /* Habillage dont le titre est CUIT dans le PNG juste au-dessus de la zone : la bande est
       repeinte avant d'y poser la catégorie. color = le fond RÉEL du PNG (échantillonné à la
       pipette, ≠ le token crème). null = rien à masquer.
       ⚠️ Les habillages de Sassy portent bien un titre cuit, mais AU-DESSUS de la zone de liste,
          pas dedans — rien à masquer aujourd'hui. À rouvrir quand les 12 gabarits seront redessinés. */
    masqueTitreCuit: null,

    separateur: { color:'encre', alpha:0.15, thicknessRatio:0.0019 },   // × W (≈2px@1080)

    // texte libre (thème infos) — Elms, graisse libre
    infos:      { font:'body', color:'encre', sizeRatio:0.050, sizeMin:0.032, lineHeight:1.35, maxLines:4, weight:500, letterSpacing:0 },

    blockVAlign: 0.50, rowHeight: 1.8, fond: '#FAF1E2'
  },

  // ── Constantes de rendu (non-charte) — inchangées depuis sassy-tokens.js ──
  render: {
    canvasW: 1080, jpegQuality: 0.92,
    zoneDefault: { x:.08, y:.25, w:.84, h:.55 },
    fit: { startRatio:0.085, startMin:8, startMax:20, floor:5, step:0.5 }
  }
};

if (typeof window !== 'undefined') window.CLIENT_TOKENS = CLIENT_TOKENS;
