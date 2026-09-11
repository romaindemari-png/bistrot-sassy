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
  function socleCSS(A) {
    const T = window.CLIENT_TOKENS;
    return (T.fontFaces || []).map(function (f) {
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
  const TEMPLATES = {};

  /* ── LE RASTERISEUR, UNIQUE ET PARAMÉTRÉ ────────────────────────────────────
     `hab` ne sert QU'À donner le rapport du format : le template peint son propre
     fond et n'utilise PAS le PNG d'habillage. C'est ce qui fait disparaître le
     bandeau « GABARIT » par construction, sans redessiner un seul PNG.
     On lit quand même `hab` plutôt que de recopier une table de ratios — une
     connaissance du master en moins à tenir synchronisée. */
  function rasteriser(tpl, W, hab, slide, fmt) {
    const H = Math.round(W * hab.naturalHeight / hab.naturalWidth);
    const Z = ZONE_SURE[fmt] || ZONE_SURE.portrait;
    return chargerAssets().then(function (A) {
      const css = socleCSS(A) + tpl.css(A, W, H, fmt, Z);
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
  window.MOTEUR_V2 = {
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
      ZONE_SURE: ZONE_SURE
    }
  };
})();
