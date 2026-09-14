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

  /* ⚠️⚠️ LA LARGEUR POUR LAQUELLE `ZONE_SURE` EST ÉCRITE. Les 250 px ci-dessus sont des
     PIXELS D'EXPORT — la story publiée fait 1080 × 1920. Or le moteur rasterise à DEUX
     échelles : 1080 pour l'export, et 540 pour l'aperçu (`apercuV2Canvas` appelle
     `r(540, …)`). Tout le reste des templates est écrit en FRACTIONS de W et suit donc
     l'échelle ; cette table, seule, était en absolu.
     ⚠️ CE QUE ÇA DONNAIT, MESURÉ SUR LE BITMAP (dujour, story, 3 plats) :
          export 1080×1920 ... la bande sûre vaut 13,0 % de la hauteur
          aperçu  540×960 .... la bande sûre vaut 26,0 %          ← LE DOUBLE
        et l'aperçu s'écartait de l'export jusqu'à 19,53 points :
          pastille   export 17,76 → 21,20      aperçu 30,73 → 34,27
          titre      export 23,28 → 29,32      aperçu 36,15 → 48,85
          le logo    export 78,70 → 82,24      aperçu ABSENT (poussé hors de la colonne)
        D'où les deux symptômes rapportés le 14/09 : « le titre est collé à la première
        ligne » (11,71 pt d'air à l'export, 1,25 pt à l'aperçu) et « le logo décroche en
        story » — un SEUL défaut, celui-ci. Carré et portrait ont `Z = 0` : aucune
        distorsion, et c'est pourquoi eux seuls paraissaient justes.
     ⚠️ LA TABLE RESTE EN PIXELS, c'est `zoneSure()` qui la ramène à l'échelle. Une
        fraction de W aurait perdu le lien avec la mesure d'origine (« environ 250 px sur
        1920 », relevé sur l'interface d'Instagram) : le chiffre qu'on vérifie un jour
        contre une capture doit rester lisible dans la table. */
  const W_EXPORT = 1080;

  /** La zone réservée du format, RAMENÉE À L'ÉCHELLE de rendu demandée. `(fmt, W)`. */
  function zoneSure(fmt, W) {
    const Z = ZONE_SURE[fmt] || ZONE_SURE.portrait;
    const k = W / W_EXPORT;
    return { haut: Z.haut * k, bas: Z.bas * k };
  }

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
      /* ⚠️⚠️ LE RESET REMET AUSSI LA TYPOGRAPHIE HÉRITABLE, ET C'EST UN CORRECTIF
         D'INSTRUMENT AUTANT QUE DE RENDU. Ce socle est lu par DEUX mondes :
           · l'EXPORT, dans un `foreignObject` — aucun `body` dont hériter, valeurs
             initiales partout ;
           · les SONDES, qui injectent ce même CSS dans un `<div>` d'une VRAIE page.
         Le `body` de `admin/controle-moteur.html` déclare `font: 15px/1.55 …` — un
         raccourci qui pose `line-height: 1.55`. Le reset ne remettait que les marges et
         `box-sizing` : la hauteur de ligne fuyait donc dans l'hôte de `deborde()`.
         ⚠️ CE QUE ÇA A COÛTÉ, MESURÉ : sur `sassy-dujour`, avec les 4 plats de
            `_data/dujour.json`, `.prix` passait de 48 à 56,9 px et `.pastille` de 64,2 à
            70,4 px. Le détecteur de débordement annonçait alors
              carré ..... 282 px   là où l'export en a .... 256
              portrait ... 12 px   là où l'export en a ...... 0
            Autrement dit un ROUGE INEXISTANT sur un format vivant, et des chiffres
            gonflés lus toute la journée du 14/09. L'instrument mesurait sa propre page.
         ⚠️ DANS LE SVG C'EST UN NO-OP — il n'y a rien à hériter — donc l'export ne change
            pas d'un pixel. VÉRIFIÉ : bandes de contenu des SIX templates × 3 formats,
            18 rendus, avant/après → écart maximum 0,000 pt.
         ⚠️ CE QUI N'EST PAS REMIS, ET POURQUOI : `color` et `font-family`. Les templates
            posent `color` sur `.page` et comptent sur l'héritage pour tout leur texte ;
            le remettre ici casserait les six. `font-family` est déclarée par chaque
            élément qui porte du texte, donc rien n'en dépend — mais la remettre
            n'apporterait rien et coûterait une divergence possible avec le défaut du SVG. */
      + '.page{position:relative;overflow:hidden;-webkit-font-smoothing:antialiased;font-kerning:normal'
        + ';line-height:normal;letter-spacing:normal;word-spacing:normal;text-indent:0'
        + ';text-transform:none;font-style:normal;font-weight:400;font-size:medium'
        + ';white-space:normal}';
  }

  /* ══════════════════════════════════════════════════════════════════════════════
     LA SIGNATURE — LE LOGO, UNE SEULE IMAGE POUR LES SIX TEMPLATES
     ══════════════════════════════════════════════════════════════════════════════
     Les six templates portaient « bistrot sassy » EN TEXTE (`.pied` sur les quatre typo,
     `.sign` sur photo ; event n'en avait aucun). Le logo le remplace — il ne s'y ajoute
     pas.

     ⚠️ UN SEUL FICHIER, COLORÉ PAR `mask-image` DEPUIS LES TOKENS. Déclarer une variante
        par couleur de fond coûterait 17,5 Ko de base64 DE PLUS PAR SLIDE, et
        `chargerAssets()` les embarque TOUTES dans CHAQUE slide — deux variantes portent
        la charge à 187,9 Ko, au-dessus du seul repère validé sur un iPhone réel (180 Ko).
        Avec le masque : 170,4 Ko. La piste a été éprouvée sur le vrai chemin de
        rasterisation (témoin sans masque à 100 %, masques à 28,9 %, préfixé comme non
        préfixé) puis sur un iPhone réel — c'est Safari qui rasterise chez le client, pas
        nos machines.

     ⚠️ LES DEUX PROPRIÉTÉS SONT ÉCRITES, PRÉFIXÉE ET NON PRÉFIXÉE. Safari a longtemps
        exigé `-webkit-mask-image` ; on ne parie pas sur la version de l'appareil du
        client.

     ⚠️ LARGEUR ET HAUTEUR EN PIXELS, PAS D'`aspect-ratio`. On connaît W, donc on calcule :
        une propriété de moins dont dépendre à l'intérieur d'un `foreignObject`.

     ⚠️ PAS D'ASSET ⇒ PAS DE LOGO, ET LE TEXTE REVIENT. Si `CLIENT_TOKENS.logos` n'est pas
        déclaré, `A['logo:creme']` vaut `undefined` et un `url(undefined)` rendrait un
        RECTANGLE PLEIN — un aplat de couleur en bas du visuel, sans un mot. `signature()`
        retombe donc sur le texte. Un fork qui ne déclare pas de logo garde sa signature. */
  const MEP_LOGO = {
    haut:     0.060,   /* × W — hauteur du logo. +20 % le 14/09, décision de DA.
                          L'encre du texte remplacé faisait 22,9 % de W de large et 2,96 %
                          de haut (mesuré) ; le logo fait maintenant 6,0 % de haut et
                          20,3 % de large — soit 64,8 × 202,7 px à W = 1080.

                          ⚠️ LE DÉBORDEMENT A ÉTÉ MESURÉ AVANT D'APPLIQUER, sur les trois
                             formats et les six templates, avec un contenu ATTEIGNABLE PAR
                             L'ADMIN — 5 produits par slide, le plafond de `studioSlides()` :

                               dépassement      texte   .050   .060
                               carre · carte      —      208    219    (format mort)
                               carre · dujour     —      446    457    (format mort)
                               portrait · dujour  —      176    187    ← format VIVANT
                               portrait · carte   —     vert   vert

                             Les trois rouges PRÉEXISTENT ; le +20 % ajoute ~11 px et n'en
                             crée AUCUN nouveau. `story` reste à 6/6.
                          ⚠️ Un premier jet de ce commentaire portait 365/380/391 sous
                             l'étiquette « contenu réaliste » — des chiffres pris avec
                             6 plats dans une slide, ce que l'admin ne produit JAMAIS. Un
                             chiffre juste sous un mauvais nom, corrigé ici.
                          */
    opacite:  1.00,    /* ⚠️ PLUS DE TRANSPARENCE — DÉCISION DE DA DU 14/09. L'opacité
                          coupait le contraste ; à 1 le logo rend la couleur exacte du
                          token. Relevés successifs, sur les templates typo :
                            texte remplacé (.45) ... CARTE 2,25 · INFOS 2,05
                            logo à .62 ............. CARTE 3,06 · INFOS 2,81
                            logo à .70 ............. CARTE 3,51 · INFOS 3,27
                            logo à 1,00 ............ 5,57 partout
                          Table unique : ça vaut pour les six, sans exception. */
    ratio:    1326 / 424,  // le gabarit des quatre variantes, identique

    /* ── LE SIGNE DU THÈME PHOTO ────────────────────────────────────────────────
       Le thème photo ne porte ni le logotype ni un médaillon : le S SEUL, en crème,
       posé directement sur la photo, EN BAS et centré horizontalement. C'est le signe
       qui existe DÉJÀ ailleurs — le favicon et la carte du S du hero — on ne l'invente
       pas. Le contraste sur une photo claire est un PARTI PRIS assumé.
       ⚠️ LE CERCLE A ÉTÉ RETIRÉ LE 14/09, ET SON VOCABULAIRE AVEC LUI : plus de
          `medDiam`, plus de `.rond`, plus de « médaillon » dans les noms. Un nom qui
          décrit une forme disparue est un commentaire qui mentira — c'est le motif
          « le commentaire qui mentait », appliqué aux identifiants.
       ⚠️ LE S NE COÛTE AUCUN ASSET DE PLUS. Sa boîte occupe `x 0→240, y 0→331` du
          fichier `creme.png` (mesuré), donc son origine est exactement (0,0) : un
          `mask-size: 552.5%` (1326/240) avec `mask-position: 0 0` le cadre au pixel.
          Un S en fichier séparé aurait coûté +3,6 Ko de base64 pour rien. */
    signeL:   0.115,       // × W — largeur du S (celle qu'il avait dans le médaillon)
    sRatio:   240 / 331,   // le rapport de la boîte du S, mesuré sur creme.png
    sEchelle: 1326 / 240,  // de combien agrandir le fichier pour n'en montrer que le S
    signeEcart: 0.030      /* × W — l'air laissé sous la bande de texte quand le signe
                              doit lui céder la place. Cf. `signeGeo`. */
  };

  /* Le style du texte de signature, TEL QU'IL ÉTAIT avant le logo. Il ne sert plus qu'au
     repli, mais il doit rester FIDÈLE : un repli qui rend le nom dans la police héritée
     serait pire que pas de repli du tout — il passerait pour un choix. */
  const SIGN_TEXTE = "font-family:'Elms',sans-serif;letter-spacing:.18em"
                   + ';text-transform:uppercase;opacity:.45';

  /** La règle de la signature : le masque du logo si l'asset est là, le style du TEXTE
      sinon. Une seule fonction décide, donc les deux cas ne peuvent pas diverger ni
      s'additionner. Le POSITIONNEMENT reste au template : il diffère d'un template à
      l'autre (`margin-top:auto` ici, un `margin-top` fixe ailleurs). */
  /* `pos` : 'left center' (defaut) ou 'center'. ⚠️ ANNONCE centre sa signature — son
     `.carte` porte `align-items:center` — et un masque ferre a gauche y serait decale. */
  function signatureCSS(A, sel, couleur, W, pos) {
    const P = pos || 'left center';
    const src = A && A['logo:creme'];
    if (!src) return sel + '{' + SIGN_TEXTE + ';font-size:' + (W * 0.023).toFixed(2) + 'px}';
    const h = W * MEP_LOGO.haut;
    /* ⚠️⚠️ `flex-shrink:0`, ET C'EST LA LIGNE LA PLUS IMPORTANTE DE CETTE FONCTION.
       Le pied est un div VIDE a hauteur fixe dans une colonne flex : si le contenu
       deborde, le navigateur a le droit de LE COMPRIMER (`flex-shrink` vaut 1 par defaut),
       alors qu'un div de texte ne descend pas sous sa ligne. MESURE, sur dujour en carre
       avec 3 plats a descriptifs — un debordement leger :

         SANS la garde : pied comprime a 28,3 px (52 % de sa taille)
                         et la colonne rapporte un debordement de ... 0 px
         AVEC la garde : pied a 54 px
                         et la colonne rapporte ....................... 26 px

       Deux consequences, et la seconde est la pire :
         1. la taille de la marque dependrait de la longueur du menu ;
         2. LE LOGO ABSORBAIT LE DEBORDEMENT ET RENDAIT LE DETECTEUR AVEUGLE. Le controle
            rapportait 165 px la ou il y en a 219 — l'ecart valait exactement la hauteur du
            logo. Une garde de mise en page qui desarme une sonde : le motif « une sonde
            qui ment par omission », mais cette fois causee par le code qu'elle surveille.

       ⚠️ Hypothese posee, PUIS verifiee — pas l'inverse. Le debordement de dujour avait
          BAISSE de 203 a 165 px en passant au logo, ce qui etait contre-intuitif. La cause
          n'a pas ete racontee mais eprouvee : ajouter `flex-shrink:0` a fait remonter le
          chiffre a 219, et la mesure directe de la hauteur du pied a confirme. */
    return sel + '{flex-shrink:0;width:' + (h * MEP_LOGO.ratio).toFixed(2) + 'px;height:' + h.toFixed(2) + 'px'
      + ';background:' + couleur + ';opacity:' + MEP_LOGO.opacite
      + ";mask-image:url('" + src + "');mask-size:contain;mask-repeat:no-repeat;mask-position:" + P
      + ";-webkit-mask-image:url('" + src + "');-webkit-mask-size:contain"
      + ';-webkit-mask-repeat:no-repeat;-webkit-mask-position:' + P + '}';
  }

  /** LA GÉOMÉTRIE DU SIGNE, CALCULÉE UNE FOIS POUR DEUX LECTEURS : le template d'export
      (`signeCSS`) et le décor en calques de l'aperçu (`habillerApercuPhoto`).
      `(W, H, Z, zt)` → `{ w, h, gauche, haut }` en pixels de l'export ; l'aperçu n'a
      qu'à ramener à son échelle.

      ⚠️⚠️ C'EST CETTE FONCTION QUI EMPÊCHE LA FAUTE QUE LE MOTEUR EXISTE POUR EMPÊCHER.
         Le 14/09, le signe a été posé dans le template SEUL : l'aperçu a continué de
         peindre le logotype complet pendant que l'export peignait autre chose. MESURÉ,
         pas supposé. Le client aurait vu une image et publié une autre. La cause n'était
         pas l'oubli — c'était que les deux côtés CALCULAIENT chacun leur géométrie. Ils
         la LISENT ici : un chiffre changé se voit des deux côtés, ou d'aucun. */
  function signeGeo(W, H, Z, zt) {
    const w = W * MEP_LOGO.signeL;                     // largeur du S
    const h = w / MEP_LOGO.sRatio;                     // sa hauteur, par son rapport mesuré

    /* ⚠️⚠️ « EN BAS » SE COMPTE DEPUIS LA ZONE SÛRE, PAS DEPUIS LE BORD. Sur une story,
       Instagram superpose son interface DANS l'image : `ZONE_SURE.story` réserve 250 px
       en bas. L'ancienne signature était posée à `W × signY` du bord, soit 59,4 px —
       donc 190 px À L'INTÉRIEUR de la bande recouverte. Elle y était depuis le début et
       personne ne l'avait mesuré : c'est le défaut qui a MASQUÉ un titre chez Georges.
       Les quatre templates typo comptent déjà `bottom: Z.bas + …` ; le thème photo ne le
       faisait pas. Il le fait maintenant — même règle, même table, tous les formats. */
    let haut = H - Z.bas - W * MEP_PHOTO.signY - h;

    /* ⚠️ ET LE SIGNE NE PASSE PAS SOUS LE TEXTE DU CLIENT. La règle de cession de place
       est conservée telle quelle : si la `zoneTexte` déclarée descend jusque sur la boîte
       du S, c'est le S qui bouge — notre marque cède, jamais le contenu. La condition
       porte sur LA DONNÉE, pas sur le format : on ne teste pas « si story ».
       ⚠️ Elle ne se déclenche pas aujourd'hui (la bande de texte de `sassy-photo` finit à
          58 % et le S commence à 86 %) — et c'est bien pour ça qu'elle reste : le jour où
          tu redessines les gabarits, elle est déjà là. Le garde-fou la mesure aux deux
          bouts, présente ET absente. */
    if (zt) {
      const tb = (zt.y + zt.h) * H;                    // le bas de la bande de texte
      if (tb > haut) haut = tb + W * MEP_LOGO.signeEcart;
    }

    /* ⚠️⚠️ LA CESSION EST BORNÉE PAR LA ZONE SÛRE, et cette borne a été trouvée par la
       MESURE, pas prévue. Sans elle, une `zoneTexte` qui descend pousse le S indéfiniment :
       relevé sur des bandes injectées, en story —
         bande finissant à 58 % (le dépôt) .... S y 1439 → 1611   (rien ne bouge)
         bande finissant à 78 % ............... S y 1530 → 1701   SORT de la zone sûre
         bande finissant à 90 % ............... S y 1760 → 1932   HORS DE L'IMAGE (H = 1920)
       Une marque poussée hors du cadre ne cède pas la place, elle disparaît.
       ⚠️ ET LE CONFLIT NE DEVIENT PAS SILENCIEUX POUR AUTANT. Quand la borne mord, le S
          reste au plus bas de la zone sûre et peut alors recouvrir la bande de texte —
          c'est un vrai conflit de mise en page, que le garde-fou D2 rougit (il compare la
          boîte du S à celle du texte). On ne l'absorbe pas en silence : on le rend
          visible. Le jour où ça arrive, c'est le gabarit qu'il faut revoir. */
    const plancher = H - Z.bas - h;
    if (haut > plancher) haut = plancher;

    return { w: w, h: h, gauche: (W - w) / 2, haut: haut };
  }

  /** Le style du S masqué depuis `creme.png`, PARTAGÉ lui aussi : l'export l'embarque en
      base64, l'aperçu le sert par son URL — le reste est identique, donc écrit une fois. */
  function masqueDuS(src) {
    const t = (100 * MEP_LOGO.sEchelle).toFixed(1) + '% auto';
    /* ⚠️ LE MÊME FICHIER, CADRÉ SUR SON PREMIER GLYPHE. `mask-size` agrandit le logo
       entier de 552,5 % et `mask-position: 0 0` en aligne le coin : seul le S tombe dans
       la boîte. Aucun second asset, aucun octet de plus. */
    return ";mask-image:url('" + src + "');mask-size:" + t
         + ';mask-repeat:no-repeat;mask-position:0 0'
         + ";-webkit-mask-image:url('" + src + "');-webkit-mask-size:" + t
         + ';-webkit-mask-repeat:no-repeat;-webkit-mask-position:0 0';
  }

  /** Le signe du thème photo : le S crème seul, en bas, centré. Rend '' si aucun asset
      n'est disponible — auquel cas `signature()` remet le texte, comme partout. */
  function signeCSS(A, W, H, Z, zt) {
    const src = A && A['logo:creme'];
    if (!src) return '';
    const c = window.CLIENT_TOKENS.primitives.color;
    const g = signeGeo(W, H, Z, zt);
    return '.ess{position:absolute;left:' + g.gauche.toFixed(2) + 'px'
         + ';top:' + g.haut.toFixed(2) + 'px'
         + ';width:' + g.w.toFixed(2) + 'px;height:' + g.h.toFixed(2) + 'px'
         + ';background:' + c.creme + ';opacity:' + MEP_LOGO.opacite
         + masqueDuS(src) + '}';
  }

  /** Le corps de la signature : le logo s'il est là, le texte sinon. */
  function signature(A, cls) {
    return (A && A['logo:creme'])
      ? '<div class="' + cls + '"></div>'
      : '<div class="' + cls + '">bistrot sassy</div>';
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
        /* ⚠️ LE LOGO REMPLACE LE TEXTE : les proprietes typographiques de `.pied`
           (font-family, letter-spacing, text-transform) DISPARAISSENT. Les laisser ne se
           verrait pas — un div vide n'affiche rien — mais elles mentiraient sur ce que la
           regle fait, et le prochain qui lit croirait a un texte.
           `margin-top:auto` reste : c'est lui qui colle la signature en bas de la colonne. */
        + '.pied{margin-top:auto}'
        + signatureCSS(A, '.pied', c.creme, W);
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
           +     signature(A, 'pied')
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
        /* Le fond d'INFOS est le CRÈME : la signature y passe donc en ACCENT, comme tout
           le texte de ce template (`.page` porte `color:accent`). Contraste relevé à
           l'inventaire : 5,56 — le seul utilisable des quatre variantes sur ce fond. */
        + '.pied{margin-top:auto}'
        + signatureCSS(A, '.pied', c.accent, W);
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const texte = (slide && slide.texte) || '';
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="col">'
           +     '<span class="lbl">informations</span>'
           +     '<div class="titre">nous trouver</div>'
           +     '<div class="filet"></div>'
           +     '<div class="texte">' + xml(texte) + '</div>'
           +     signature(A, 'pied')
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
        /* ⚠️⚠️ L'AIR SOUS LE TITRE EST STRUCTUREL, ET IL NE L'ÉTAIT PAS. Ce template ne
           portait AUCUNE marge sous `.titre` : l'air venait du `justify-content:center` de
           `.cartes`, donc DU NOMBRE DE PLATS. Mesuré à l'export, en story : 369 px d'air à
           1 plat, 152 px à 3 — et 0 px dès que les cartes remplissent la colonne. Le titre
           se lisait alors comme une ligne de plus de la liste. Un espacement qui dépend du
           contenu n'est pas un espacement, c'est un reste.

           ⚠️⚠️ LE RAPPORT VIENT DE L'ARDOISE DE GEORGES, QUI EST EN PRODUCTION. Même
              structure exactement — un titre, puis une liste de plats — et son
              `.liste{margin-top:52px}` est éprouvé sur des posts publiés. À son W de rendu
              de 1080, ça fait 52/1080, et c'est cette fraction qu'on reprend.
              ⚠️ ON A COMMENCÉ PAR DÉRIVER DU SITE ET C'ÉTAIT LA MAUVAISE SOURCE. Les
                 candidats essayés, tous mesurés sur le bitmap d'export en portrait avec les
                 4 plats de `_data/dujour.json` — le contenu VRAI :
                   0     (la prod) ......... logo entier, 65 px avant le bord
                   3,5 %  (inventé) ........ entier, 27 px      ← sans source, écarté
                   4,81 % ARDOISE Georges .. entier, 13 px      ← retenu
                   5,25 % le site .......... entier,  7 px
                   5,93 % carte fixe Georges entier,  1 px
                   6,2 %  INFOS de Sassy ... touche le bord
                   7,0 %  CARTE de Sassy ... ⚠️ LOGO ROGNÉ DE 7,8 px
                 Le premier choix — 7 %, dérivé de `.liste` de CARTE — coupait la marque.
                 Le rapport de Georges tient, avec la garde la plus large des trois sources
                 réelles. Un chiffre éprouvé en production bat un chiffre redérivé.

           ⚠️ ET LA MARGE N'AJOUTE PAS SA PROPRE VALEUR EN AIR, ELLE EN AJOUTE LA MOITIÉ.
              `margin-bottom` réduit `.cartes` d'autant, et comme les cartes y sont centrées
              le centrage reprend la moitié de ce qu'on vient de donner. Relevé, même
              instrument des deux côtés : +38 px pour 7 % demandés. Le gain est modeste ; ce
              qui change, c'est qu'il ne peut plus TOMBER À ZÉRO — la marge vit hors de
              `.cartes`, donc elle survit quand les cartes débordent.

           ⚠️ CE TEMPLATE RESTE LE SEUL À 4 PLATS DE SON PLAFOND. À 5 plats à descriptifs —
              atteignable, `dujour` n'a aucun plafond — la dernière bande touche le bord
              AVEC OU SANS cette marge. Le plafond est la décision de fond, reportée après
              mardi ; cette marge ne la remplace pas et n'y touche pas. */
        + ".titre{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.105)
          + ';line-height:1.05;text-transform:lowercase;margin-bottom:' + u(52 / 1080) + '}'
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
        /* Le fond de DUJOUR est le JAUNE : la signature y passe en ACCENT, comme le reste
           du texte. Contraste relevé à l'inventaire : 5,36 — et c'est le seul utilisable,
           les trois autres variantes tombent entre 1,00 et 1,16 sur ce jaune.
           ⚠️ Ici le positionnement est un `margin-top` FIXE, pas un `auto` : la colonne de
              dujour n'est pas étirée. C'est lui qu'on garde. */
        + '.pied{margin-top:' + u(0.03) + '}'
        + signatureCSS(A, '.pied', c.accent, W);
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
           +     signature(A, 'pied')
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
        /* ⚠️⚠️ ICI LA SIGNATURE N'EST PAS SUR LE BLEU, ET L'INVENTAIRE S'ETAIT TROMPE.
           Il avait lu le fond de `.page` (accent) et conclu « ANNONCE → creme ». Mais
           `.pied` vit DANS `.carte`, dont le fond est le CREME : un logo creme y serait
           INVISIBLE. Il passe donc en ACCENT — 5,56 de contraste, comme sur infos.
           ⚠️ Et `.carte` porte `align-items:center` : la signature est CENTREE, pas ferree
              a gauche. D'ou `'center'` en position de masque — un masque ferre a gauche
              serait decale de toute la largeur restante.
              `text-indent:.18em` disparait : c'etait la compensation du dernier
              interlettrage du texte, elle n'a pas de sens pour une image. */
        + signatureCSS(A, '.pied', c.accent, W, 'center');
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const texte = (slide && slide.texte) || '';
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   '<div class="carte">'
           +     '<div class="barre"></div>'
           +     '<div class="lbl">annonce</div>'
           +     '<div class="corps"><div class="msg">' + xml(texte) + '</div></div>'
           +     signature(A, 'pied')
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
      const zt = (slide && slide.zoneTexte) || null;
      const txt = (slide && String(slide.texte || '').trim()) || '';
      /* Même rôle sémantique que le canvas : `drawZoneText` lit `semantic.infos`. Une
         seule source pour la police du texte libre, sur les deux chemins. */
      const I = (window.CLIENT_TOKENS.semantic && window.CLIENT_TOKENS.semantic.infos) || {};
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
           🔴 CE COMMENTAIRE A DIT LE CONTRAIRE, ET IL ÉTAIT FAUX. Il affirmait :
              « `sassy-photo` NE DÉCLARE AUCUNE `zoneTexte` — vérifié dans themes.json ».
              La vérification n'avait porté que sur `carre` et `portrait`. En **story**,
              `sassy-photo` déclare bien une zoneTexte (x.10 y.42 w.80 h.16, 46 px, blanc,
              centrée) et l'admin offre le champ `#storyText`. Sans le `.txt` ci-dessous,
              publier une story photo par le v2 aurait JETÉ le texte écrit par le client,
              sans erreur et sans trace — l'export aurait montré une photo nue.
              → Cinquième exemplaire du motif « ne couvrir qu'un cas, et mentir par
                omission » : c'est le même geste que la sonde 5 qui ne testait qu'un
                format sur trois. Une assertion sur `themes.json` se vérifie sur LES TROIS
                FORMATS, jamais sur celui qu'on a sous les yeux.
           ⚠️ `zoneTexte` reste ABSENTE en carre/portrait, et sur les trois formats de
              `sassy-event` : dans ces cas `.txt` n'est pas émis du tout. On ne peint que
              ce que l'admin propose — pas de zone fantôme.
           ⚠️ LA TAILLE EST ABSOLUE DANS themes.json, exprimée en px À 1080. D'où le
              × W/1080 : sans lui l'aperçu à 540 porterait un texte deux fois trop gros.

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
        + (zt && txt
            ? '.txt{position:absolute'
              + ';left:' + (zt.x * W).toFixed(2) + 'px;top:' + (zt.y * H).toFixed(2) + 'px'
              + ';width:' + (zt.w * W).toFixed(2) + 'px;height:' + (zt.h * H).toFixed(2) + 'px'
              + ';display:flex;align-items:center;overflow:hidden'      // = le centrage vertical de drawZoneText
              + ';font-family:' + window.CLIENT_TOKENS.primitives.font[I.font || 'body']
              + ';font-weight:' + (I.weight || 800)
              + ';font-size:' + ((zt.taille || 48) * W / 1080).toFixed(2) + 'px;line-height:1.12'
              + ';color:' + (zt.couleur || '#fff')
              + ';text-align:' + (zt.align || 'center') + '}'
              + '.txt > span{display:block;width:100%;word-break:break-word}'
            : '')
        /* ⚠️⚠️ PAS DE VOILE, ET C'EST UN PARTI PRIS. Le logo crème se pose DIRECTEMENT sur
           la photo, centré en bas. Le dégradé bleu qui protégeait la lisibilité de
           l'ancienne signature a été retiré : la photo reste une photo d'un bord à l'autre.
           ⚠️ `MEP_PHOTO.voileH` et `voileA` RESTENT DANS LA TABLE : EVENT a sa propre règle
              `.voile` qui les lit (voileH × 2,2) et elle est intacte. C'est la règle de CE
              template qui disparaît, pas les valeurs partagées.
           ⚠️ ET L'APERÇU SUIT : `habillerApercuPhoto` branche désormais sur
              `theme.template` — pas de voile et logo centré pour `photo`, voile conservé
              pour `event`. Sans ce branchement l'aperçu aurait montré un voile que l'export
              ne produit plus, et c'est exactement ce que MEP_PHOTO existe pour empêcher.
           Le centrage est calculé, pas obtenu par `transform` : on connaît W et la largeur
           du logo, donc `left` suffit — une propriété de moins dont dépendre dans un
           `foreignObject`. */
        /* ⚠️ LE THÈME PHOTO NE PORTE NI LE LOGOTYPE NI UN MÉDAILLON : le S SEUL, en
           crème, EN BAS et centré. C'est le signe du favicon et de la carte du S du
           hero, pas une invention. Sa géométrie est dans `MEP_LOGO` (`signeL`), donc une
           seule table décide encore.
           ⚠️ ET LE REPLI GARDE SA RÈGLE. Sans asset, `signeCSS` rend '' et `signature()`
              remet le texte — mais un premier jet ne posait alors PLUS AUCUNE règle
              `.sign` : le texte se serait affiché sans style et hors de sa place, en haut
              à gauche de l'image. Les deux branches sont donc écrites, et le repli compte
              lui aussi `Z.bas` depuis le 14/09. */
        + ((A && A['logo:creme'])
            ? signeCSS(A, W, H, Z, zt && txt ? zt : null)
            : '.sign{position:absolute;left:' + (W * MEP_PHOTO.signX).toFixed(2) + 'px'
              + ';bottom:' + (Z.bas + W * MEP_PHOTO.signY).toFixed(2) + 'px;color:' + c.creme + '}'
              + signatureCSS(A, '.sign', c.creme, W));
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const src = (slide && slide.photo) || '';
      const zt = (slide && slide.zoneTexte) || null;
      const txt = (slide && String(slide.texte || '').trim()) || '';
      /* ⚠️ BALISE AUTO-FERMÉE : on est en XML dans un foreignObject. Un `<img>` non
         fermé fait REFUSER le SVG entier, sans message. */
      /* Ordre des couches = celui du canvas : photo, voile, texte, signature. Le texte
         passe AU-DESSUS du voile (c'est le voile qui le rend lisible) et SOUS la
         signature, qui reste la dernière chose posée. */
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   (src ? '<img class="ph" src="' + src + '" alt=""/>' : '')
           +   (zt && txt ? '<div class="txt"><span>' + xml(txt) + '</span></div>' : '')
           /* Le signe : le S seul. Si aucun asset n'est disponible, `signeCSS` rend ''
              et `signature()` remet le TEXTE — le repli du chantier reste entier. */
           +   ((A && A['logo:creme'])
                 ? '<div class="ess"></div>'
                 : signature(A, 'sign'))
           + '</div>';
    }
  };

  /* ══════════════════════════════════════════════════════════════════════════
     TEMPLATE « event » — DÉRIVÉ DE LA SECTION #events DU SITE
     ══════════════════════════════════════════════════════════════════════════
     M5 : la PREUVE DE GÉNÉRICITÉ. Même rasteriseur, même socle, même `MEP_PHOTO` —
     seul le décor change. Aucune ligne de plomberie ajoutée.

     Relevé dans le CSS d'`index.html` :
       #events            background --cream
       .event-card        #fff, border 2px solid --blue
       .event-date-badge  --yellow, border 1.5px solid --blue
       .event-date-day    Canela 1,5rem --blue
       .event-date-monthyear  .65rem, .1em, uppercase, --blue
       .event-date-heure  .65rem, --blue à 70 %
       .event-name        Canela 1,3rem --blue, BAS DE CASSE
       .event-desc        .82rem, --blue à 70 %, line-height 1,55

     ⚠️ UN ÉCART AU SITE, ASSUMÉ, ET VOICI LA RAISON. Le site EMPILE : photo 16/9
        en haut, carte en dessous. Le post SUPERPOSE : photo plein cadre, carte
        posée en bas. Ce n'est pas un choix d'esthétique — `sassy-event` déclare
        `zonePhoto {x:0,y:0,w:1,h:1}`, et cette zone est lue par TROIS chemins :
        le rasteriseur v2, le repli canvas, ET l'aperçu déplaçable de l'admin
        (`composeCustomPreview` positionne `#igPhotoInner` dessus). Mettre la photo
        dans une bande haute obligerait à changer `zonePhoto` — donc à changer le
        rendu du repli ET la surface que le client peut faire glisser.
        On garde la donnée, on adapte la composition.
     ⚠️ ET C'EST AUSSI LE BON CHOIX POUR LE SUJET : pour un bistrot, un événement EST
        une photo. Elle reste dominante ; la carte porte l'information.

     ⚠️ LE VOILE VIENT DE `MEP_PHOTO`, PAS D'UNE VALEUR RECOPIÉE — la carte est plus
        grande qu'une signature, d'où le facteur, mais la table reste la source.
     ══════════════════════════════════════════════════════════════════════════ */
  const EVENT = {
    css: function (A, W, H, fmt, Z, slide) {
      const c = window.CLIENT_TOKENS.primitives.color;
      const zp = (slide && slide.zonePhoto) || { x:0, y:0, w:1, h:1 };
      const f = (slide && slide.focal) || {};
      const fx = (typeof f.x === 'number' ? f.x : 0.5) * 100;
      const fy = (typeof f.y === 'number' ? f.y : 0.5) * 100;
      const u = function (r) { return (W * r).toFixed(2) + 'px'; };
      const M = MEP_PHOTO;
      return '.page{width:' + W + 'px;height:' + H + 'px;background:' + c.creme + '}'
        + '.ph{position:absolute'
          + ';left:' + (zp.x * W).toFixed(2) + 'px;top:' + (zp.y * H).toFixed(2) + 'px'
          + ';width:' + (zp.w * W).toFixed(2) + 'px;height:' + (zp.h * H).toFixed(2) + 'px'
          + ';object-fit:cover;object-position:' + fx.toFixed(4) + '% ' + fy.toFixed(4) + '%'
          + ';display:block}'
        + '.voile{position:absolute;left:0;right:0;bottom:0;height:' + u(M.voileH * 2.2)
          + ';background:linear-gradient(to top,rgba(32,80,231,' + M.voileA + '),rgba(32,80,231,0))}'
        /* .event-card : blanc, filet bleu de 2px — mis à l'échelle de W */
        + '.carte{position:absolute;left:' + u(M.signX) + ';right:' + u(M.signX)
          + ';bottom:' + u(M.signY) + ';background:' + c.blanc
          + ';border:' + u(0.0035) + ' solid ' + c.accent
          + ';padding:' + u(0.038) + ' ' + u(0.036) + ';color:' + c.accent + '}'
        /* .event-date-badge : jaune, filet bleu, aligné à gauche */
        + '.badge{display:inline-flex;align-items:center;gap:' + u(0.016)
          + ';background:' + c.jaune + ';border:' + u(0.0026) + ' solid ' + c.accent
          + ';padding:' + u(0.010) + ' ' + u(0.020) + ';margin-bottom:' + u(0.026) + '}'
        + ".jour{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.042)
          + ';line-height:1}'
        + '.quand{display:flex;flex-direction:column}'
        + ".mois{font-family:'Elms',sans-serif;font-weight:500;font-size:" + u(0.020)
          + ';letter-spacing:.1em;text-transform:uppercase;line-height:1.2}'
        + ".heure{font-family:'Elms',sans-serif;font-size:" + u(0.020) + ';opacity:.7}'
        + ".nom{font-family:'Canela',Georgia,serif;font-weight:900;font-size:" + u(0.052)
          + ';line-height:1.2;text-transform:lowercase;margin-bottom:' + u(0.014) + '}'
        + ".desc{font-family:'Elms',sans-serif;font-size:" + u(0.026)
          + ';line-height:1.55;opacity:.7}'
        /* ⚠️⚠️ EVENT EST LE SEUL DES SIX A N'AVOIR JAMAIS PORTE DE SIGNATURE. Ici le logo
           est un AJOUT, pas un remplacement — et la bande basse est occupee par `.carte`
           sur toute la largeur (left/right a `signX`) : il n'y a pas de « bas a gauche »
           libre sur l'image.
           Deux options ont ete rendues et soumises : DANS la carte, en accent, ou AU-DESSUS
           en creme sur le voile. Retenu DANS LA CARTE, et la raison est mesuree — 7,98 de
           contraste, GARANTI quelle que soit la photo du client, contre 3,29 au-dessus et
           dependant de l'image (sur une photo claire il tombe sous le seuil).
           ⚠️ Le fond REEL sous la signature est le BLANC de la carte, ni le voile ni la
              photo. C'est la lecon d'ANNONCE : lire le fond de l'ELEMENT, pas celui du
              conteneur. D'ou l'accent. */
        + '.pied{margin-top:' + u(0.030) + '}'
        + signatureCSS(A, '.pied', c.accent, W);
    },
    corps: function (A, W, H, fmt, Z, slide) {
      const src = (slide && slide.photo) || '';
      const e = (slide && slide.event) || {};
      const desc = e.desc ? '<div class="desc">' + xml(e.desc) + '</div>' : '';
      const badge = (e.jour || e.mois || e.heure)
        ? '<div class="badge">'
          + (e.jour ? '<span class="jour">' + xml(e.jour) + '</span>' : '')
          + '<span class="quand">'
          +   (e.mois  ? '<span class="mois">'  + xml(e.mois)  + '</span>' : '')
          +   (e.heure ? '<span class="heure">' + xml(e.heure) + '</span>' : '')
          + '</span></div>'
        : '';
      /* ⚠️ CARROUSEL : la carte ne se pose QUE sur la slide qui porte l'événement.
            `renderFinalCustom` ne passe le texte qu'à la 1ʳᵉ slide (`withText`) ; sans ce
            garde, les slides 2+ recevraient une carte BLANCHE VIDE à filet bleu — un
            cartouche vide en plein milieu de la photo, et l'aperçu mentirait à l'export. */
      /* La signature entre DANS la carte, sous la description — et SEULEMENT si la carte
         existe : sur les slides 2+ d'un carrousel il n'y a pas de carte, donc pas de
         signature. Une signature seule sur la photo serait un orphelin. */
      const carte = (badge || e.titre || desc)
        ? '<div class="carte">' + badge
          + (e.titre ? '<div class="nom">' + xml(e.titre) + '</div>' : '')
          + desc
          + signature(A, 'pied')
        + '</div>'
        : '';
      return '<div xmlns="http://www.w3.org/1999/xhtml" class="page">'
           +   (src ? '<img class="ph" src="' + src + '" alt=""/>' : '')
           +   '<div class="voile"></div>'
           +   carte
           + '</div>';
    }
  };

  const TEMPLATES = { carte: CARTE, infos: INFOS, dujour: DUJOUR, annonce: ANNONCE, photo: PHOTO, event: EVENT };

  /* ── LE RASTERISEUR, UNIQUE ET PARAMÉTRÉ ────────────────────────────────────
     `hab` ne sert QU'À donner le rapport du format : le template peint son propre
     fond et n'utilise PAS le PNG d'habillage. C'est ce qui fait disparaître le
     bandeau « GABARIT » par construction, sans redessiner un seul PNG.
     On lit quand même `hab` plutôt que de recopier une table de ratios — une
     connaissance du master en moins à tenir synchronisée. */
  function rasteriser(tpl, W, hab, slide, fmt, sansPolices) {
    const H = Math.round(W * hab.naturalHeight / hab.naturalWidth);
    /* ⚠️ À L'ÉCHELLE, PAS EN ABSOLU. Cf. `zoneSure` : c'est ici que l'aperçu à 540 et
       l'export à 1080 cessent de diverger. */
    const Z = zoneSure(fmt, W);
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
    const vieux = hote.querySelectorAll('.v2-voile,.v2-sign,.v2-rond,.v2-ess');
    const hab = hote.querySelector('.ig-habillage');
    if (!tpl || theme.type !== 'photo') {          // pas notre cas → on efface et on rend la main
      vieux.forEach(function (e) { e.remove(); });
      /* ⚠️ ON NE DÉFAIT QUE CE QU'ON A FAIT. `removeProperty` était FAUX : la feuille de
            style de l'admin déclare `.ig-habillage{display:none}`, donc retirer le style
            en ligne ne « rend pas la main », il CACHE le PNG. Or `composeCustomPreview`
            vient justement de le poser à `block`. Passer d'un thème photo v2 à un thème
            sans template faisait donc disparaître l'habillage — en silence.
            D'où le drapeau : on restitue `block` (la valeur que l'admin emploie) et
            uniquement si c'est nous qui avons masqué. */
      if (hab && hab.dataset.v2Masque) { hab.style.display = 'block'; delete hab.dataset.v2Masque; }
      return;
    }
    if (hab) { hab.style.display = 'none'; hab.dataset.v2Masque = '1'; }
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
    /* ⚠️ LES z-index REPRODUISENT L'ORDRE DES COUCHES DE L'EXPORT : photo, voile,
          texte, signature. Sans eux, `.ig-text` (z-index 4 dans la feuille de l'admin)
          l'emporterait sur un voile en `auto`, et la signature passerait SOUS le texte —
          l'inverse de l'export. Les deux ne se recouvrent pas aujourd'hui (signature en
          bas à gauche, texte à 42 %), mais on ne laisse pas l'aperçu dépendre de ça. */

    /* ⚠️⚠️ ON BRANCHE SUR LE TEMPLATE, PAS SUR LE TYPE. `theme.type` vaut `photo` pour
       `sassy-photo` ET pour `sassy-event` : jusqu'ici l'aperçu leur posait donc le MÊME
       décor. Depuis que PHOTO n'a plus de voile, poser un voile pour lui ferait mentir
       l'aperçu — précisément ce que `MEP_PHOTO` existe pour empêcher.
       ⚠️ Le cas d'EVENT reste divergent et c'est SU : son export porte une carte blanche
          que l'aperçu ne dessine pas, et l'aperçu y pose un `sign` que l'export n'a pas.
          Antérieur (M4/M5), documenté au BACKLOG, autre chantier. On n'y touche pas ici :
          EVENT garde donc exactement le décor qu'il avait. */
    const estPhoto = theme.template === 'photo';

    if (!estPhoto) {
      pose('v2-voile', 'z-index:3;left:0;right:0;bottom:0;height:' + px(M.voileH)
        + ';background:linear-gradient(to top,rgba(32,80,231,' + M.voileA + '),rgba(32,80,231,0))');
    } else {
      const v = hote.querySelector('.v2-voile');
      if (v) v.remove();                        // on retire celui qu'un autre thème a pu laisser
    }

    /* La signature de l'aperçu : le MÉDAILLON pour `photo`, le texte pour le reste.
       ⚠️ ICI LE LOGO PASSE PAR SON URL, pas par le base64 : on est dans le DOM vivant de
          l'admin, pas dans un SVG isolé — donc rien à embarquer, et l'image est déjà en
          cache après le premier rendu. Même fichier, même dessin. Et l'URL vient de
          `CLIENT_TOKENS.logos.creme`, la même entrée que `listeAssets` embarque : elle
          n'est pas réécrite en dur ici.
       ⚠️⚠️ LA GÉOMÉTRIE N'EST PAS RECALCULÉE ICI, ELLE EST LUE dans `signeGeo` — la
          même fonction que le template. C'est la leçon du 14/09 : le médaillon avait été
          posé dans le template SEUL, et ce bloc a continué de peindre le logotype complet
          en bas (93,6 → 96,9 % de la hauteur) pendant que l'export peignait le cercle au
          milieu (59,7 → 72,1 % en story). MESURÉ. Le client aurait vu une image et publié
          une autre — exactement la faute que ce moteur existe pour empêcher.
          La cause n'était pas l'oubli : c'était que les deux côtés CALCULAIENT chacun leur
          géométrie. Tant qu'ils la LISENT au même endroit, l'écart ne peut plus exister.
       ⚠️ LE MÉDAILLON CÈDE LA PLACE AU TEXTE, et la condition est lue DANS LE DOM :
          `#igText` est-il affiché ? C'est exactement ce que l'export décide de son côté
          (`zt && txt`, plus `withText` pour la 1ʳᵉ slide) — mais lu sur ce qui est
          RÉELLEMENT peint plutôt que re-dérivé, donc sans second jeu de conditions à
          garder d'accord avec le premier. */
    if (estPhoto) {
      const zt = (theme.formats && theme.formats[fmt] && theme.formats[fmt].zoneTexte) || null;
      const elTexte = hote.querySelector('.ig-text');
      const texteVisible = !!(elTexte && getComputedStyle(elTexte).display !== 'none');
      /* H EN PIXELS D'EXPORT, ET LU À LA MÊME SOURCE QUE L'EXPORT : `rasteriser` fait
         `H = round(W × hab.naturalHeight / hab.naturalWidth)`, donc c'est le PNG de
         gabarit qui fixe la hauteur — et l'aperçu a ce même PNG sous la main.
         ⚠️ Le rapport du CADRE ne ferait pas l'affaire : `clientWidth`/`clientHeight`
            sont des entiers arrondis, et en portrait ils donnaient 1080×1347,73 au lieu
            de 1080×1350 — 0,08 point d'écart avec le template, mesuré. Petit, mais c'est
            un écart qui vient d'avoir lu autre chose que la source. Le cadre ne sert que
            de repli, si le PNG n'est pas encore décodé. */
      const Hx = (hab && hab.naturalWidth)
        ? Math.round(1080 * hab.naturalHeight / hab.naturalWidth)
        : 1080 * (hote.clientHeight || 1) / (hote.clientWidth || 1);
      /* ⚠️ LA ZONE SÛRE AUSSI EST LUE, PAS DEVINÉE : c'est elle qui décide de « en bas »
         (250 px réservés en story) et le template la reçoit en argument. Sans elle,
         l'aperçu remettrait le S contre le bord et divergerait de nouveau. */
      /* ⚠️ À L'ÉCHELLE DE L'EXPORT, ET C'EST VOLONTAIRE : `signeGeo` travaille en pixels
         d'export (Hx vient du PNG de gabarit) et c'est `e` qui ramène à l'aperçu. On
         passe donc par `zoneSure` avec W_EXPORT — même source que le template, et
         personne ne viendra « corriger » ça en croyant à un oubli. */
      const Zx = zoneSure(fmt, W_EXPORT);
      const g = signeGeo(1080, Hx, Zx, texteVisible ? zt : null);
      /* ⚠️ LA POSITION EN POURCENTAGES, LA TAILLE EN PIXELS, et ce n'est pas un caprice.
         Le cadre de l'aperçu n'est pas exactement au rapport du format : en story il fait
         425 px de haut là où 9:16 en veut 423,1. Or `.ig-text` est posé en POURCENTAGES du
         cadre (cf. `composeCustomPreview`), donc il suit cet écart. Un médaillon placé en
         pixels à l'échelle de la LARGEUR ne le suivait pas : 0,26 point de dérive verticale,
         mesurée — et surtout un jeu qui rognait l'air laissé sous la bande de texte.
         En pourcentages, les deux calques subissent le même cadre et l'écart tombe à zéro
         par construction. La TAILLE reste en pixels : en pourcentages de deux côtés
         différents, le cercle deviendrait une ellipse dès que le cadre dérive. */
      const pct = function (v, tot) { return (100 * v / tot).toFixed(4) + '%'; };
      const ex = function (v) { return (v * e).toFixed(2) + 'px'; };   // export → aperçu
      const url = (window.CLIENT_TOKENS.logos || {}).creme || '';
      pose('v2-ess', 'z-index:5;left:' + pct(g.gauche, 1080) + ';top:' + pct(g.haut, Hx)
        + ';width:' + ex(g.w) + ';height:' + ex(g.h)
        + ';background:' + c.creme + ';opacity:' + MEP_LOGO.opacite
        + masqueDuS(url)).textContent = '';
      const vieuxSign = hote.querySelector('.v2-sign');
      if (vieuxSign) vieuxSign.remove();      // le logotype qu'un autre thème a pu laisser
      const vieuxRond = hote.querySelector('.v2-rond');
      if (vieuxRond) vieuxRond.remove();      // le cercle d'avant le 14/09, s'il traîne
    } else {
      pose('v2-sign', 'z-index:5;left:' + px(M.signX) + ';bottom:' + px(M.signY)
        + ";font-family:'Elms',sans-serif;font-weight:500;font-size:" + px(M.signTail)
        + ';letter-spacing:.1em;text-transform:uppercase;color:' + c.creme + ';opacity:.7'
      ).textContent = 'bistrot sassy';
      /* ⚠️ Et on retire le signe qu'un thème photo aurait laissé : `pose` RÉUTILISE les
         calques en place, donc sans ça EVENT hériterait du S de PHOTO en passant de l'un
         à l'autre. Symétrique exact du `.v2-voile` retiré plus haut. */
      ['.v2-rond', '.v2-ess'].forEach(function (sel) {
        const el = hote.querySelector(sel); if (el) el.remove();
      });
    }
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
      /* ⚠️ Exposée pour que le garde-fou puisse vérifier que l'aperçu et l'export lisent
         la MÊME bande sûre à leurs deux échelles — c'est le défaut du 14/09. */
      zoneSure: zoneSure,
      W_EXPORT: W_EXPORT,
      MEP_PHOTO: MEP_PHOTO,
      MEP_LOGO: MEP_LOGO,
      signatureCSS: signatureCSS,
      signature: signature,
      /* ⚠️ `signeGeo` est exposée POUR QUE LE GARDE-FOU PUISSE COMPARER. C'est la source
         unique de la géométrie du signe : le template et l'aperçu la lisent tous les
         deux, et D2 s'en sert comme RÉFÉRENCE pour vérifier que le calque de l'aperçu
         tombe au même endroit que le template. Sans cette clé, la sonde devrait recopier
         le calcul — et une sonde qui recopie ce qu'elle mesure ne mesure plus rien. */
      signeGeo: signeGeo,
      signeCSS: signeCSS,
      habillerApercuPhoto: habillerApercuPhoto
    }
  };
})();
