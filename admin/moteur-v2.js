/* ══════════════════════════════════════════════════════════════════════════════
   MOTEUR DE POSTS v2 — HTML/CSS rasterisé en image PAR LE NAVIGATEUR
   ══════════════════════════════════════════════════════════════════════════════
   `foreignObject` → SVG en `data:` URI → `canvas` → JPEG. Le blob naît au même
   endroit qu'avant et tout l'aval est inchangé : upload-image → Blobs →
   serve-image → publish-instagram.

   ⚠️ LA GARANTIE QUI PROTÈGE TOUT LE RESTE, ET ELLE EST LITTÉRALE :
      UN THÈME QUI NE DÉCLARE PAS `template` N'EXÉCUTE AUCUNE LIGNE DE CE FICHIER.
      Pas « aucune ligne visible », pas « rien d'observable » : aucune. `rasteriseur()`
      rend `null` et l'admin garde son chemin canvas, intact. C'est ce qui permet de
      s'arrêter à tout moment sans rien casser — et c'est à re-mesurer à CHAQUE bout,
      jamais à supposer.

   ⚠️ REGISTRE DÉCLARATIF DÈS LE DÉPART — AUCUN `theme.id` DANS CE FICHIER.
      Georges code ses cinq `theme.id` en dur dans son registre, et le plan de
      remontée (backlog master, point 23, bout 3) doit précisément les faire tomber.
      On ne recopie pas la dette : un thème dit `"template": "carte"` dans
      themes.json, et c'est TEMPLATES qui décide. Ajouter un thème ne touche pas
      ce fichier.

   ⚠️ UN SEUL RASTERISEUR, PAS UN PAR TEMPLATE. Chez Georges le squelette est
      recopié CINQ fois (~27 lignes chacune) — c'est le bout 2 du point 23, jamais
      fait. `rasteriser()` est paramétré : un template ne fournit que son CSS et
      son corps.

   ══════════════════════════════════════════════════════════════════════════════
   LES TROIS PIÈGES foreignObject, TOUS SILENCIEUX
   ══════════════════════════════════════════════════════════════════════════════
   1. LES POLICES. Un SVG en `data:` URI est un document ISOLÉ : il ne voit ni les
      @font-face de la page, ni un `.woff2` par URL. Sans base64 DANS le SVG,
      Safari rend en police système SANS AUCUNE ERREUR. Le seul moyen de le prendre
      en flagrant délit est de rasteriser DEUX FOIS, avec et sans les @font-face, et
      de comparer la quantité d'encre. `font-display:block` et non `swap` : aucun
      repli ne doit s'intercaler.
   2. LE `xmlns` DES SVG INLINE. Dans du HTML, un `<svg>` s'en passe ; dans un
      `foreignObject` on est en XML, et sans lui il n'est pas reconnu. Symptômes :
      `naturalWidth = 0`, `drawImage` muet, `onerror` silencieux.
   3. XML STRICT. Racine en `xmlns` XHTML, balises vides auto-fermées (`<img/>`),
      CSS en CDATA, et AUCUNE entité nommée — l'apostrophe s'écrit U+2019 en clair,
      jamais `&rsquo;`. Tout texte venant d'une saisie client passe par `xml()`.
   ══════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── LES ASSETS ─────────────────────────────────────────────────────────────
     ⚠️ AUCUN CHEMIN DE POLICE NI DE LOGO N'EST ÉCRIT ICI. Tout est déclaré par le
        client dans `client-tokens.js` : on charge ce qu'il liste. Ajouter une
        variante de logo ne demande pas une ligne de moteur.
     ⚠️ PAS DE GRAIN, ET C'EST MESURÉ, PAS OUBLIÉ. Georges embarque un
        `grain.webp` de 47 Ko parce que sa DA en a un. `grep grain|texture|noise|
        mix-blend-mode|filter` sur l'index.html de Sassy → 0 occurrence. On ne
        transporte pas la texture d'un autre client : marges, grille et typo. */
  function listeAssets() {
    const T = window.CLIENT_TOKENS || {};
    const out = [];
    (T.fontFaces || []).forEach(function (f) {
      const m = /url\('([^']+)'\)/.exec(f.src || '');
      if (m) out.push({ cle: 'font:' + f.family, url: m[1], mime: 'font/woff2' });
    });
    const L = T.logos || {};
    Object.keys(L).forEach(function (nom) {
      out.push({ cle: 'logo:' + nom, url: L[nom], mime: 'image/png' });
    });
    if (T.photoAnnonce) out.push({ cle: 'annonce', url: T.photoAnnonce, mime: 'image/jpeg' });
    return out;
  }

  /* base64 UNE FOIS puis gardé. On reconstruit le préfixe `data:` avec NOTRE type
     MIME plutôt que celui du blob : selon le serveur, un .woff2 arrive parfois en
     application/octet-stream — et Safari refuse alors la police, sans un mot. */
  let _assets = null;
  function chargerAssets() {
    if (!_assets) {
      _assets = Promise.all(listeAssets().map(function (a) {
        return fetch(a.url).then(function (r) {
          if (!r.ok) throw new Error(a.url + ' : HTTP ' + r.status);
          return r.blob();
        }).then(function (b) {
          return new Promise(function (ok, ko) {
            const f = new FileReader();
            f.onload = function () { ok([a.cle, 'data:' + a.mime + ';base64,' + String(f.result).split(',')[1]]); };
            f.onerror = function () { ko(new Error('lecture de ' + a.url)); };
            f.readAsDataURL(b);
          });
        });
      })).then(function (paires) {
        const o = {}; paires.forEach(function (p) { o[p[0]] = p[1]; }); return o;
      })['catch'](function (e) {
        _assets = null;               // ⚠️ un échec ne se met PAS en cache
        throw e;
      });
    }
    return _assets;
  }

  /* ⚠️ Le contenu vient de la SAISIE du client : TOUT passe par ici. Un `&` non
     échappé dans un nom de plat (« Cookie chocolat & amandes ») ferait refuser le
     SVG en entier — et donc, sans le repli, échouer la publication. */
  function xml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ── LES ZONES RÉSERVÉES D'INSTAGRAM ────────────────────────────────────────
     Sur une STORY, l'application superpose son interface À L'INTÉRIEUR de l'image :
     nom du compte et actions en haut, réponse et partage en bas — environ 250 px de
     chaque côté sur 1920. Un titre publié là s'est retrouvé MASQUÉ chez Georges.
     ⚠️ CE N'EST PAS UN DÉFAUT DE MISE EN PAGE, C'EST UNE CONTRAINTE DE SURFACE.
        Elle appartient au FORMAT, pas au template : tout futur thème story la
        rencontrera. D'où une table, et pas un padding rectifié à la main.
     Le POST portrait n'a pas ce problème — son interface est HORS de l'image. */
  const ZONE_SURE = {
    carre:    { haut: 0,   bas: 0   },
    portrait: { haut: 0,   bas: 0   },
    story:    { haut: 250, bas: 250 }
  };

  /* ── LE SOCLE CSS, ÉCRIT UNE FOIS ───────────────────────────────────────────
     Les @font-face embarquées et le reset. Chez Georges ce bloc est recopié dans
     les cinq `css*()` : c'est ce qui a permis à un `str.replace` de frapper deux
     templates au lieu d'un, le 31/07, et de publier en canvas dégradé pendant deux
     jours. Un template n'écrit plus que CE QUI LUI EST PROPRE. */
  /* ⚠️ `sansPolices` N'EST PAS UNE OPTION DE PRODUCTION : elle n'existe que pour la
     SONDE 3 du contrôle, qui rasterise deux fois — avec et sans les @font-face — et
     compare la quantité d'encre. C'est le seul moyen de prendre Safari en flagrant
     délit quand il rend en police système SANS lever d'erreur (piège iOS n°1).
     Aucun chemin de l'admin ne la passe. */
  function socleCSS(A, sansPolices) {
    const T = window.CLIENT_TOKENS;
    return (sansPolices ? [] : (T.fontFaces || [])).map(function (f) {
      const cle = 'font:' + f.family;
      if (!A[cle]) return '';
      return "@font-face{font-family:'" + f.family + "';src:url('" + A[cle] + "') format('woff2')"
           + ';font-weight:' + (f.weight || 400)
           + ';font-style:' + (f.style || 'normal')
           + ';font-display:block}';          // ⚠️ block, PAS swap : aucun repli ne s'intercale
    }).join('')
      + '*{margin:0;padding:0;box-sizing:border-box}'
      + '.page{position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;font-kerning:normal}';
  }

  /* ── LE REGISTRE ────────────────────────────────────────────────────────────
     Un template fournit deux fonctions PURES :
       css(A, W, H, fmt, Z)     → la feuille de style, SANS le socle
       corps(A, W, H, fmt, Z, slide) → le corps XHTML, déjà échappé
     ⚠️ LA DONNÉE ENTRE PAR LES ARGUMENTS, JAMAIS PAR LE DOCUMENT. Un template qui
        irait lire `#dishEdit` lui-même ne serait éprouvable que dans l'admin ; celui
        à qui l'on PASSE le slide se teste partout — y compris dans le contrôle.
     ⚠️ VIDE AUJOURD'HUI, ET C'EST LA GARANTIE : aucun thème ne déclare `template`,
        donc `rasteriseur()` rend null pour tous, donc aucune ligne de v2 ne
        s'exécute. Le contrôle doit dire « RIEN À TESTER » et virer au ROUGE —
        jamais au vert. */
  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « carte » — DÉRIVÉ DE LA SECTION #carte DU SITE, PAS RÉINVENTÉ
     ══════════════════════════════════════════════════════════════════════════
     Chaque valeur ci-dessous est relevée dans le CSS d'`index.html`. Les rapports
     sont convertis en fraction de W pour que le rendu suive le format ; les
     couleurs viennent des tokens, jamais d'un hex écrit ici.

       #carte            background --blue, color --cream
       .carte-inner      max-width 760 sur 1366 ≈ 0,556 W, padding 2,5rem
       .s-label          Elms 500, .2em, uppercase, --blue à 55 %  → ici CRÈME à 55 %
       .s-title          Canela 900, bas de casse, line-height 1,05 → ici CRÈME
       .carte-stamp      Elms 500, .18em, uppercase, --blue sur --yellow, rotate(-4deg)
       .ardoise          flex colonne, gap 2,6rem
       .ardoise-cat-title Elms 500, .22em, uppercase, --yellow, filet crème 18 %
       .plat-nom         Canela 900, cream
       .plat-dots        pointillé crème 35 %, translateY(-.28em)
       .plat-prix        Elms, cream
       .plat-desc        Elms, cream 60 %, line-height 1,5

     ⚠️ LE FOND EST BLEU, ET C'EST LE SITE QUI LE DIT. `#carte { background: var(--blue) }` —
        la section entière est bleue, texte crème. Un post « à la charte » n'est donc pas
        crème sur blanc : c'est l'inverse. C'est aussi ce qui donne à la sonde 4 son sens,
        le bleu étant massivement présent.

     ⚠️ AUCUNE TEXTURE. `grep grain|texture|noise|mix-blend-mode|filter` sur index.html → 0.
        Marges, grille, typo. On ne transporte pas le grain de Georges.

     ⚠️ LE TITRE EST EN BAS DE CASSE, comme `.s-title` du site (« la carte »). Pas de
        `text-transform` : c'est la règle de DA de Sassy, à l'inverse de Georges.
     ══════════════════════════════════════════════════════════════════════════ */
  const CARTE = {
    css: function (A, W, H, fmt, Z) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const u = function (r) { return (W * r).toFixed(2) + 'px'; };   // fraction de W → px
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.accent + ';color:' + c.creme + '}'
        + '.col{position:absolute;top:' + (Z.haut + W * 0.085) + 'px;left:' + u(0.085)
          + ';right:' + u(0.085) + ';bottom:' + (Z.bas + W * 0.085) + 'px;display:flex;flex-direction:column}'
        + '.tete{display:flex;align-items:flex-start;justify-content:space-between;gap:' + u(0.03) + '}'
        + ".lbl{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.026)
          + ';letter-spacing:.2em;text-transform:uppercase;opacity:.55;display:block;margin-bottom:' + u(0.02) + '}'
        + ".titre{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.105)
          + ';line-height:1.05}'
        + ".tampon{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.024)
          + ';letter-spacing:.18em;text-transform:uppercase;color:' + c.accent + ';background:' + c.jaune
          + ';padding:' + u(0.016) + ' ' + u(0.024) + ';transform:rotate(-4deg);white-space:nowrap}'
        + '.liste{display:flex;flex-direction:column;gap:' + u(0.062) + ';margin-top:' + u(0.07) + '}'
        + '.cat{display:flex;flex-direction:column;gap:' + u(0.026) + '}'
        + ".cat-t{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.026)
          + ';letter-spacing:.22em;text-transform:uppercase;color:' + c.jaune
          + ';padding-bottom:' + u(0.017) + ';border-bottom:1px solid rgba(250,241,226,.18)}'
        + '.plat{display:flex;flex-direction:column}'
        + '.ligne{display:flex;align-items:baseline}'
        + ".nom{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.040) + ';line-height:1.1}'
        /* ⚠️ LES LEADER DOTS : impossibles au canvas, une règle CSS ici. `flex:1` mange
           l'espace, le pointillé le remplit, et le `translateY` les aligne sur la ligne de
           base — les trois valeurs viennent de `.plat-dots`. */
        + '.dots{flex:1;margin:0 ' + u(0.014) + ';border-bottom:1px dotted ' + c.creme
          + ';opacity:.35;transform:translateY(-.28em)}'
        + ".prix{font-family:'Elms',sans-serif;font-size:" + u(0.030) + ';white-space:nowrap}'
        + ".desc{font-family:'Elms',sans-serif;font-size:" + u(0.025)
          + ';line-height:1.5;opacity:.6;margin-top:' + u(0.008) + '}'
        + '.pied{margin-top:auto;font-family:\'Elms\',sans-serif;font-size:' + u(0.023)
          + ';letter-spacing:.18em;text-transform:uppercase;opacity:.45}';
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const plats = ((slide && slide.dishes) || []).filter(function (d) { return d.n; });
      const label = (slide && slide.label) || '';
      const rangees = plats.map(function (d) {
        const desc = d.desc ? '<p class="desc">' + xml(d.desc) + '</p>' : '';
        return '<div class="plat"><div class="ligne">'
             + '<span class="nom">' + xml(d.n) + '</span>'
             + '<span class="dots"></span>'
             + '<span class="prix">' + xml(d.p) + '</span>'
             + '</div>' + desc + '</div>';
      }).join('');
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="col">'
           +     '<div class="tete"><div>'
           +       '<span class="lbl">l\u2019ardoise</span>'
           +       '<div class="titre">la carte</div>'
           +     '</div><span class="tampon">cette semaine</span></div>'
           +     '<div class="liste"><div class="cat">'
           +       (label ? '<div class="cat-t">' + xml(label) + '</div>' : '')
           +       rangees
           +     '</div></div>'
           +     '<div class="pied">bistrot sassy</div>'
           +   '</div>'
           + '</div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « infos » — DÉRIVÉ DE LA SECTION #horaires DU SITE
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ C'EST L'INVERSE EXACT DE « carte », ET C'EST LE SITE QUI LE DIT.
        `#carte { background: var(--blue) }` · `#horaires { background: var(--cream) }`
        Les deux sections alternent. Le post `infos` est donc BLEU SUR CRÈME, là où
        la carte est crème sur bleu. Ce n'est pas un choix, c'est une transposition.

       #horaires        background --cream, texte --blue
       .s-label         « informations »  (Elms .2em uppercase, blue 55 %)
       .s-title         « nous trouver »  (Canela 900, BAS DE CASSE, blue)
       .horaires-row    filet rgba(32,80,231,.12) — le bleu à 12 %
       .horaires-addr   Elms, blue à 70 %, line-height 1,7

     ⚠️ LE CONTENU EST UN TEXTE LIBRE, écrit par le client (220 car. max, cf.
        `#infosText` du master). Il arrive par `slide.texte` — PAR ARGUMENT, jamais
        lu dans le DOM : c'est ce qui rend le template testable hors de l'admin.

     ⚠️ MÊME SOCLE, MÊME RASTERISEUR. Ce template ne redéclare ni @font-face ni
        reset : `socleCSS()` s'en charge. C'est tout l'objet du bout 2 du point 23 —
        et la raison pour laquelle un `str.replace` ne peut plus frapper deux
        templates à la fois.
     ══════════════════════════════════════════════════════════════════════════ */
  const INFOS = {
    css: function (A, W, H, fmt, Z) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const u = function (r) { return (W * r).toFixed(2) + 'px'; };
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.creme + ';color:' + c.accent + '}'
        + '.col{position:absolute;top:' + (Z.haut + W * 0.085) + 'px;left:' + u(0.085)
          + ';right:' + u(0.085) + ';bottom:' + (Z.bas + W * 0.085) + 'px;display:flex;flex-direction:column}'
        + ".lbl{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.026)
          + ';letter-spacing:.2em;text-transform:uppercase;opacity:.55;display:block;margin-bottom:' + u(0.02) + '}'
        + ".titre{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.105) + ';line-height:1.05}'
        /* le filet de `.horaires-row` : le bleu à 12 %, converti en rgba */
        + '.filet{height:1px;background:rgba(32,80,231,.12);margin:' + u(0.062) + ' 0 ' + u(0.055) + '}'
        /* ⚠️ CENTRÉ VERTICALEMENT, et c'est le SEUL écart au site — assumé. `#horaires`
           est en `align-items:start` parce qu'il vit dans une grille à côté d'une carte,
           avec une hauteur libre. Le post est un CADRE FIXE, et le texte y est borné à
           220 caractères par le master (`#infosText maxlength`) : il sera TOUJOURS court.
           Calé en haut, il laisserait toujours une moitié morte. `flex:1` + `center`. */
        + ".texte{flex:1;display:flex;align-items:center;font-family:'Elms',sans-serif;font-size:" + u(0.046)
          + ';line-height:1.7;opacity:.85}'
        + ".pied{margin-top:auto;font-family:'Elms',sans-serif;font-size:" + u(0.023)
          + ';letter-spacing:.18em;text-transform:uppercase;opacity:.45}';
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const texte = (slide && slide.texte) || '';
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="col">'
           +     '<span class="lbl">informations</span>'
           +     '<div class="titre">nous trouver</div>'
           +     '<div class="filet"></div>'
           +     '<div class="texte">' + xml(texte) + '</div>'
           +     '<div class="pied">bistrot sassy</div>'
           +   '</div>'
           + '</div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « dujour » — DÉRIVÉ DE LA SECTION #dujour DU MASTER
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ SASSY N'A PAS CETTE SECTION SUR SON SITE. Le bloc `dujour` est optionnel et
        `actif:false` — `index.html` ne le porte pas. La source de vérité est donc
        le `#dujour` de `lestud-template-food`, écrit dans la MÊME charte et les
        MÊMES polices, plus l'habillage propre (`sassy-dujour-*.png`) qui fixe les
        mots. Ce n'est pas une invention : c'est la seule dérivation disponible.

       #dujour        background --yellow          → le TROISIÈME fond de la charte
       .dujour-card   #fff, border 2px solid --blue
       .dujour-dispo  Elms .18em uppercase         → la pastille « aujourd'hui »
       .dujour-nom    Canela 900, BAS DE CASSE, --blue
       .dujour-desc   Elms, --blue à 70 %, lh 1,55
       .dujour-prix   margin-top:auto, Canela 900, --blue

     ⚠️ LE JAUNE EN FOND, ET C'EST VOULU. `carte` est bleu, `infos` est crème,
        `dujour` est jaune : les trois couleurs de la charte, une par thème. C'est
        le site qui alterne ainsi ses sections, pas une décoration.
     ⚠️ `dispo:false` ⇒ la carte s'efface (opacité) plutôt que de disparaître. Un plat
        épuisé est une information ; le retirer la supprimerait.
     ══════════════════════════════════════════════════════════════════════════ */
  const DUJOUR = {
    css: function (A, W, H, fmt, Z) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const u = function (r) { return (W * r).toFixed(2) + 'px'; };
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.jaune + ';color:' + c.accent + '}'
        + '.col{position:absolute;top:' + (Z.haut + W * 0.085) + 'px;left:' + u(0.085)
          + ';right:' + u(0.085) + ';bottom:' + (Z.bas + W * 0.085) + 'px;display:flex;flex-direction:column}'
        + ".pastille{align-self:flex-start;font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.024)
          + ';letter-spacing:.18em;text-transform:uppercase;background:' + c.accent + ';color:' + c.jaune
          + ';padding:' + u(0.014) + ' ' + u(0.022) + ';margin-bottom:' + u(0.028) + '}'
        + ".titre{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.105)
          + ';line-height:1.05;text-transform:lowercase}'
        + '.cartes{flex:1;display:flex;flex-direction:column;justify-content:center;gap:' + u(0.028) + '}'
        + '.c{background:' + c.blanc + ';border:' + u(0.0035) + ' solid ' + c.accent
          + ';padding:' + u(0.034) + ' ' + u(0.032) + '}'
        + '.c.epuise{opacity:.45}'
        + '.tete{display:flex;align-items:baseline;gap:' + u(0.02) + '}'
        + ".nom{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.042)
          + ';line-height:1.15;text-transform:lowercase;flex:1}'
        + ".prix{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.034) + ';white-space:nowrap}'
        + ".desc{font-family:'Elms',sans-serif;font-size:" + u(0.025)
          + ';line-height:1.55;opacity:.7;margin-top:' + u(0.012) + '}'
        + ".pied{font-family:'Elms',sans-serif;font-size:" + u(0.023)
          + ';letter-spacing:.18em;text-transform:uppercase;opacity:.45;margin-top:' + u(0.03) + '}';
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const plats = ((slide && slide.dishes) || []).filter(function (d) { return d.n; });
      const cartes = plats.map(function (d) {
        const desc = d.desc ? '<div class="desc">' + xml(d.desc) + '</div>' : '';
        return '<div class="c' + (d.epuise ? ' epuise' : '') + '">'
             +   '<div class="tete"><span class="nom">' + xml(d.n) + '</span>'
             +   '<span class="prix">' + xml(d.p) + '</span></div>'
             +   desc
             + '</div>';
      }).join('');
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="col">'
           +     '<span class="pastille">aujourd\u2019hui</span>'
           +     '<div class="titre">le plat du jour</div>'
           +     '<div class="cartes">' + cartes + '</div>'
           +     '<div class="pied">bistrot sassy</div>'
           +   '</div>'
           + '</div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « annonce » — DÉRIVÉ DE L'HABILLAGE PROPRE sassy-annonce-*.png
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ SOURCE DIFFÉRENTE DES TROIS AUTRES, ET C'EST ASSUMÉ. `carte` et `infos`
        viennent de sections du site ; `dujour` du `#dujour` du master. L'annonce
        n'existe nulle part sur un site : c'est un message ponctuel. Sa seule
        référence est l'habillage que `gen-habillages.py` a produit — relevé au
        pixel plutôt que décrit de mémoire :

          fond      #2050E7 (20,3 % de l'image)  → le CADRE
          carte     #FAF1E2 (79,5 %)             → encartée, marges ~5 %
          trait     #FFF08B (0,1 %)              → petite barre centrée
          « ANNONCE »  Elms, capitales espacées, bleu, CENTRÉ
          pied      « BISTROT SASSY », centré

     ⚠️ LE CADRE EST LA FORME, ET ELLE PORTE LE SENS : une affiche épinglée. C'est
        ce qui distingue l'annonce des trois autres thèmes, qui sont des aplats.

     ⚠️ LE MESSAGE EST EN CANELA, pas en Elms. C'est la voix de l'annonce — l'idiome
        `.s-title` du site (Canela 900, bas de casse). Un texte de fermeture ou de
        congés doit se lire d'un coup d'œil dans un fil ; le sans-serif fin le
        dilue. Écart assumé au texte libre d'`infos`, qui est de l'information
        pratique et non une déclaration.

     ⚠️ TOUT EST CENTRÉ, comme l'habillage. Les trois autres templates sont ferrés
        à gauche : c'est ce qui fait qu'une annonce ne ressemble pas à une carte.
     ══════════════════════════════════════════════════════════════════════════ */
  const ANNONCE = {
    css: function (A, W, H, fmt, Z) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const u = function (r) { return (W * r).toFixed(2) + 'px'; };
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.accent + '}'
        /* la carte encartée : marges relevées sur l'habillage (~5 % de W) */
        + '.carte{position:absolute;top:' + (Z.haut + W * 0.05) + 'px;left:' + u(0.05)
          + ';right:' + u(0.05) + ';bottom:' + (Z.bas + W * 0.05) + 'px;background:' + c.creme
          + ';color:' + c.accent + ';display:flex;flex-direction:column;align-items:center'
          + ';padding:' + u(0.085) + ' ' + u(0.075) + '}'
        + '.barre{width:' + u(0.125) + ';height:' + u(0.014) + ';background:' + c.jaune
          + ';border:1px solid ' + c.accent + ';margin-bottom:' + u(0.036) + '}'
        + ".lbl{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.028)
          + ';letter-spacing:.28em;text-transform:uppercase;text-indent:.28em}'
        + '.corps{flex:1;display:flex;align-items:center;justify-content:center}'
        + ".msg{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.072)
          + ';line-height:1.18;text-align:center;text-transform:lowercase}'
        + ".pied{font-family:'Elms',sans-serif;font-size:" + u(0.023)
          + ';letter-spacing:.18em;text-transform:uppercase;text-indent:.18em;opacity:.45}';
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const texte = (slide && slide.texte) || '';
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="carte">'
           +     '<div class="barre"></div>'
           +     '<div class="lbl">annonce</div>'
           +     '<div class="corps"><div class="msg">' + xml(texte) + '</div></div>'
           +     '<div class="pied">bistrot sassy</div>'
           +   '</div>'
           + '</div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « photo » — M1 : LA PHOTO ENTRE DANS LE SVG, ET RIEN D'AUTRE
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ VOLONTAIREMENT NU. Pas de point focal (M2), pas de décor (M3). M1 ne prouve
        qu'une chose, et c'est celle qui décide du chantier : le pipeline encaisse-t-il
        une photo, et COMBIEN ÇA PÈSE.

     ⚠️ LA PHOTO DOIT VIVRE **DANS** LE SVG, pas être peinte au canvas en dessous.
        Un SVG en `data:` URI est un document isolé : il ne voit aucune ressource
        externe. Elle arrive donc en base64 par `slide.photo`.

     ⚠️ ET ELLE DOIT ÊTRE RAMENÉE À LA RÉSOLUTION DU CADRE AVANT D'ÊTRE ENCODÉE.
        Une photo d'iPhone de 4032 px partirait en base64 avec des pixels que le
        cadre ne montrera jamais. Mesuré sur la photo de démo :
          1080 px → 265 Ko de base64 · 810 px → 162 Ko · 540 px → 87 Ko
        À quoi s'ajoutent les 153 Ko des polices. Aucune des trois options ne passe
        sous les 180 Ko de Georges — mais 180 Ko n'est pas un plafond MESURÉ, c'est
        une configuration validée une fois. Le plafond réel se constate sur un iPhone.

     ⚠️ LE FOND EST REPEINT EN CRÈME, comme pour les autres templates — c'est ce qui
        neutralise l'écran NOIR (un foreignObject qui ne peint rien laisse du
        transparent, que le JPEG rend noir). ⚠️ Mais ça crée l'écran CRÈME : même
        défaut, visage différent. C'est la SONDE 6 qui le couvre, pas ce commentaire.
     ══════════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════════
     LA MISE EN PAGE DU DÉCOR PHOTO — ÉCRITE UNE SEULE FOIS
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ ELLE EST LUE PAR DEUX CHEMINS : `PHOTO.css()` pour l'EXPORT, et
        `habillerApercuPhoto()` pour l'APERÇU. C'est précisément le genre de valeur
        qu'on recopie « juste une fois » et qui divergent ensuite — la faute que le
        LELAB.md grave sous « aperçu == export ». Un ratio, un endroit.
     Fractions de W (la largeur du cadre, 1080 à l'export). */
  const MEP_PHOTO = {
    voileH:   0.22,    // hauteur du dégradé, depuis le bas
    voileA:   0.78,    // opacité du bleu au plus bas
    signX:    0.06,    // ferrage gauche de la signature
    signY:    0.055,   // hauteur depuis le bas
    signTail: 0.026    // corps de la signature
  };

  const PHOTO = {
    css: function (A, W, H, fmt, Z, slide) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const zp = (slide && slide.zonePhoto) || { x:0, y:0, w:1, h:1 };
      const f = (slide && slide.focal) || {};
      const fx = (typeof f.x === 'number' ? f.x : 0.5) * 100;
      const fy = (typeof f.y === 'number' ? f.y : 0.5) * 100;
      /* ══════════════════════════════════════════════════════════════════════
         LE POINT FOCAL — `object-position`, ET C'EST L'ÉQUIVALENT EXACT DU CANVAS
         ══════════════════════════════════════════════════════════════════════
         `renderFinalCustom` calcule :
             scale = max(dw/bw, dh/bh)            (cover)
             sw = dw/scale · sh = dh/scale        (portion source prélevée)
             sx = (bw − sw) · fx · sy = (bh − sh) · fy
         `object-fit:cover` + `object-position: fx% fy%` a exactement cette
         sémantique : le point fx% de l'image s'aligne sur le point fx% du cadre,
         donc le décalage vaut (imageMiseÀL'Échelle − cadre) × fx.
         ⚠️ L'ÉQUIVALENCE EST MESURÉE, ET SA LIMITE AUSSI. Les deux chemins ont été
            comparés au pixel sur 13 cas (9 focales dont les 4 coins, débord en X seul,
            en Y seul, sur les deux axes, et une zonePhoto partielle). Résultat, et il
            n'est PAS « identique partout » :

              décalage ENTIER        → 0 % de pixels divergents, écart moyen 0,15-0,24
                                        par canal (le bruit de fond du JPEG)
              décalage FRACTIONNAIRE → jusqu'à 8,5 % de pixels, écart moyen 2,8/canal

            **LE CADRAGE EST DONC ÉQUIVALENT — la formule est la même, et elle rend un
            résultat identique dès que le décalage tombe juste.** Ce qui diverge est le
            RE-ÉCHANTILLONNAGE : `drawImage` avec un rectangle source fractionnaire
            interpole, `object-position` arrondit autrement. Un demi-pixel.

            ⚠️ NE PAS ÉCRIRE « identique au pixel » : c'est faux à décalage
               fractionnaire, et c'est le cas le plus courant (`sy = 358,5` sur la photo
               de démo en 1080×600). La borne mesurée est UN DEMI-PIXEL, et elle est
               invisible à l'œil — les deux rendus ont été comparés visuellement. Mais
               une borne connue vaut mieux qu'une égalité supposée.
            ⚠️ ET CE N'EST PAS RATTRAPABLE EN ARRONDISSANT `object-position` : le
               décalage naît du rapport photo/cadre, pas de la valeur qu'on écrit. */
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.creme + '}'
        + '.ph{position:absolute'
          + ';left:' + (zp.x * W).toFixed(2) + 'px;top:' + (zp.y * H).toFixed(2) + 'px'
          + ';width:' + (zp.w * W).toFixed(2) + 'px;height:' + (zp.h * H).toFixed(2) + 'px'
          + ';object-fit:cover;object-position:' + fx.toFixed(4) + '% ' + fy.toFixed(4) + '%'
          + ';display:block}'
        /* ══════════════════════════════════════════════════════════════════════
           M3 — LE DÉCOR, DÉRIVÉ DU `.stack-hint` DU HERO
           ══════════════════════════════════════════════════════════════════════
           ⚠️ `sassy-photo` NE DÉCLARE AUCUNE `zoneTexte` — vérifié dans themes.json.
              Le post photo ne porte donc PAS de texte de contenu : son décor est une
              SIGNATURE, rien de plus. Y ajouter un titre serait inventer un champ que
              l'admin ne propose pas, et l'aperçu mentirait à l'export (c'est la « zone
              fantôme » que le LELAB.md du master nomme déjà).

           Le site traite ses photos ainsi (hero, stack) :
             .stack-hint  crème, Elms, .1em, uppercase, à 70 %, EN BAS, sur la photo
             .hero-right / .galerie-cell  le bleu comme fond derrière la photo

           ⚠️ LE VOILE N'EST PAS UN EFFET, C'EST UNE CONDITION DE LISIBILITÉ. Du crème
              posé sur une photo quelconque est illisible dès qu'elle est claire — et on
              ne sait pas d'avance quelle zone tombera sous la signature. Un dégradé
              depuis le bas, pas un aplat : la photo reste une photo partout ailleurs.
              (Même raisonnement que le voile de l'annonce chez Georges, dosé pour le
              PIRE cas et non pour le cas moyen.)
           ⚠️ PAS DE `mix-blend-mode`, PAS DE GRAIN : Sassy n'a aucune texture. */
        + '.voile{position:absolute;left:0;right:0;bottom:0;height:' + (W * MEP_PHOTO.voileH).toFixed(2) + 'px'
          + ';background:linear-gradient(to top,rgba(32,80,231,' + MEP_PHOTO.voileA + '),rgba(32,80,231,0))}'
        + ".sign{position:absolute;left:" + (W * MEP_PHOTO.signX).toFixed(2) + 'px;bottom:' + (W * MEP_PHOTO.signY).toFixed(2) + 'px'
          + ";font-family:'Elms',sans-serif;font-weight:500;font-size:" + (W * MEP_PHOTO.signTail).toFixed(2) + 'px'
          + ';letter-spacing:.1em;text-transform:uppercase;color:' + c.creme + ';opacity:.7}';
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const src = (slide && slide.photo) || '';
      /* ⚠️ BALISE AUTO-FERMÉE : on est en XML dans un foreignObject. Un `<img>` non
         fermé fait REFUSER le SVG entier, sans message. */
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   (src ? '<img class="ph" src="' + src + '" alt=""/>' : '')
           +   '<div class="voile"></div>'
           +   '<div class="sign">bistrot sassy</div>'
           + '</div>';
    }
  };

  const TEMPLATES = { carte: CARTE, infos: INFOS, dujour: DUJOUR, annonce: ANNONCE, photo: PHOTO };

  /* ── LE RASTERISEUR, UNIQUE ET PARAMÉTRÉ ────────────────────────────────────
     `hab` ne sert QU'À donner le rapport du format : le template peint son propre
     fond et n'utilise PAS le PNG d'habillage. C'est ce qui fait disparaître le
     bandeau « GABARIT » par construction, sans redessiner un seul PNG.
     On lit quand même `hab` plutôt que de recopier une table de ratios — une
     connaissance du master en moins à tenir synchronisée. */
  function rasteriser(tpl, W, hab, slide, fmt, sansPolices) {
    const H = Math.round(W * hab.naturalHeight / hab.naturalWidth);
    const Z = ZONE_SURE[fmt] || ZONE_SURE.portrait;
    return chargerAssets().then(function (A) {
      const css = socleCSS(A, sansPolices) + tpl.css(A, W, H, fmt, Z, slide);
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
                + '<defs><style type="text/css"><![CDATA[' + css + ']]></style></defs>'
                + '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">'
                + tpl.corps(A, W, H, fmt, Z, slide)
                + '</foreignObject></svg>';
      return new Promise(function (ok, ko) {
        const im = new Image();
        let fini = false;
        const stop = function (fn, v) { if (!fini) { fini = true; fn(v); } };
        im.onload = function () {
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const ctx = cv.getContext('2d');
          /* ⚠️ LE FOND EST REPEINT AVANT. Un foreignObject qui n'a rien peint laisse
             du TRANSPARENT, que le JPEG rend NOIR — une image 100 % noire, bien
             formée, sans la moindre erreur. On peint donc la couleur de fond de la
             charte : au pire on publie un aplat crème, jamais un rectangle noir. */
          ctx.fillStyle = window.CLIENT_TOKENS.semantic.fond;
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(im, 0, 0, W, H);
          stop(ok, cv.toDataURL('image/jpeg', window.CLIENT_TOKENS.render.jpegQuality));
        };
        im.onerror = function () { stop(ko, new Error('SVG refusé par le navigateur')); };
        setTimeout(function () { stop(ko, new Error('rasterisation : délai dépassé')); }, 8000);
        im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    });
  }

  /* ── L'INTERFACE ────────────────────────────────────────────────────────────
     `admin/index.html` ne porte que des appels GARDÉS : il teste `window.MOTEUR_V2`
     avant tout, et `rasteriseur()` avant d'appeler. Dans un dépôt sans ce fichier,
     ou pour un thème sans `template`, rien ne s'exécute. */
  /* ══════════════════════════════════════════════════════════════════════════
     M4 — L'APERÇU EN CALQUES : L'EXCEPTION DOCUMENTÉE À « APERÇU == EXPORT »
     ══════════════════════════════════════════════════════════════════════════
     ⚠️ LE THÈME PHOTO EST LE SEUL CAS OÙ L'APERÇU NE PEUT PAS ÊTRE LE MÊME
        RASTERISEUR QUE L'EXPORT, ET CE N'EST PAS UN CONTOURNEMENT. L'aperçu du
        thème photo est celui qu'on FAIT GLISSER pour déplacer le point focal
        (`#igPhotoInner`, `background-position`, classe `ph-draggable`). Le
        remplacer par une image rasterisée TUERAIT LE GESTE. La règle « aperçu ==
        export » a donc ici une exception, écrite au LELAB.md du master, et la
        forme qu'elle prend est : le décor est posé EN CALQUES CSS par-dessus la
        photo déplaçable, avec les MÊMES tokens et les valeurs mises à l'échelle.

     ⚠️ CE QUI SE VÉRIFIE ALORS N'EST PLUS « 0,00 par pixel », MAIS : les calques
        EXISTENT, et leurs valeurs RENORMALISÉES À 1080 égalent celles de l'export.
        C'est le contrôle ② de Georges appliqué à ce cas.

     ⚠️ `pointer-events:none` SUR CHAQUE CALQUE. Sans ça, le décor intercepte le
        glissement et le point focal devient immobile — une régression muette : rien
        ne casse, le geste cesse simplement de fonctionner.

     ⚠️ L'HABILLAGE PNG EST MASQUÉ. Le v2 peint son propre fond ; laisser
        `#igHabillage` visible superposerait le gabarit au décor, et l'aperçu
        montrerait un bandeau que l'export n'a pas.

     ⚠️ ET L'ÉCHELLE EST LUE, PAS SUPPOSÉE : `hote.clientWidth / 1080`. L'aperçu
        fait ~260 px de large, l'export 1080. Les longueurs absolues recopiées
        telles quelles paraîtraient quatre fois trop grandes. */
  function habillerApercuPhoto(hote, theme, fmt) {
    if (!hote) return;
    const tpl = theme && theme.template && TEMPLATES[theme.template];
    const vieux = hote.querySelectorAll('.v2-voile,.v2-sign');
    const hab = hote.querySelector('.ig-habillage');
    if (!tpl || theme.type !== 'photo') {          // pas notre cas → on efface et on rend la main
      vieux.forEach(function (e) { e.remove(); });
      if (hab) hab.style.removeProperty('display');
      return;
    }
    if (hab) hab.style.display = 'none';
    const c = window.CLIENT_TOKENS.primitives.color;
    const e = (hote.clientWidth || 260) / 1080;    // l'échelle, LUE
    const M = MEP_PHOTO;
    const px = function (r) { return (1080 * r * e).toFixed(2) + 'px'; };
    const pose = function (cls, css) {
      let el = hote.querySelector('.' + cls);
      if (!el) { el = document.createElement('div'); el.className = cls; hote.appendChild(el); }
      else hote.appendChild(el);                   // réinséré en dernier : le décor reste AU-DESSUS
      el.style.cssText = 'position:absolute;pointer-events:none;' + css;
      return el;
    };
    pose('v2-voile', 'left:0;right:0;bottom:0;height:' + px(M.voileH)
      + ';background:linear-gradient(to top,rgba(32,80,231,' + M.voileA + '),rgba(32,80,231,0))');
    pose('v2-sign', 'left:' + px(M.signX) + ';bottom:' + px(M.signY)
      + ";font-family:'Elms',sans-serif;font-weight:500;font-size:" + px(M.signTail)
      + ';letter-spacing:.1em;text-transform:uppercase;color:' + c.creme + ';opacity:.7'
    ).textContent = 'bistrot sassy';
  }

  window.MOTEUR_V2 = {
    /** Pose le décor du thème photo EN CALQUES sur l'aperçu déplaçable, ou l'efface.
        `(hote, theme, fmt)`. Ne touche rien si le thème n'est pas un photo en v2. */
    habillerApercuPhoto: habillerApercuPhoto,

    /** Le rasteriseur d'un thème, ou null si le canvas garde la main.
        `(W, hab, slide, fmt) → Promise<dataURL>`. Un rejet fait retomber l'admin
        sur son peintre canvas : le filet reste tendu. */
    rasteriseur: function (theme) {
      const tpl = theme && theme.template && TEMPLATES[theme.template];
      if (!tpl) return null;                       // ← LA GARANTIE, en une ligne
      return function (W, hab, slide, fmt) { return rasteriser(tpl, W, hab, slide, fmt); };
    },

    /* Exposé POUR LE CONTRÔLE, et pour lui seul : il appelle le rasteriseur
       DIRECTEMENT, sans passer par le repli, pour qu'une erreur remonte au lieu
       d'être avalée. Rien dans l'admin ne lit ces clés. */
    _interne: {
      TEMPLATES: TEMPLATES,
      chargerAssets: chargerAssets,
      listeAssets: listeAssets,
      socleCSS: socleCSS,
      rasteriser: rasteriser,
      xml: xml,
      ZONE_SURE: ZONE_SURE,
      MEP_PHOTO: MEP_PHOTO,
      habillerApercuPhoto: habillerApercuPhoto
    }
  };
})();
