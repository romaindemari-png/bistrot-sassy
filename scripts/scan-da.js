#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SCAN DA — le garde-fou de l'unification.
   ═══════════════════════════════════════════════════════════════════════════
   POURQUOI CET OUTIL EXISTE
   L'unification du design s'est arrêtée à mi-chemin TROIS fois : studio refait /
   Mon site laissé ; cards de Mon site refaites / intérieur des sections laissé ;
   sections refaites / écran Publier laissé. À chaque fois on traitait ce qu'on
   REGARDAIT, pas ce qui restait. Ce scan regarde TOUT, écran par écran.

   CE QU'IL FAIT
   Il ouvre l'admin dans un vrai navigateur, parcourt CHAQUE écran (login, accueil,
   Mon site, chaque section, Publier, chaque étape du studio, la popup) et inspecte
   les styles CALCULÉS de chaque élément visible — pas le CSS source, mais ce que le
   client voit réellement.

   IL SIGNALE
     · une OMBRE portée        → le langage est À PLAT. Seuls les objets qui FLOTTENT
                                 vraiment y ont droit : modale, tiroir d'aperçu, mockups
                                 (post Instagram, téléphone). Ils sont exclus du scan.
     · un BLANC PUR            → « le crème est le canvas ». Une carte blanche posée sur
                                 du crème est exactement ce que le principe interdit.
                                 (Les champs de saisie sont exclus : ils sont blancs.)
     · un RADIUS hors échelle  → 10 (petits) · 16 (cards) · 20 (modales) · 999 · 50 %.
     · Bricolage DANS un champ → c'est une police d'AFFICHAGE, pas de saisie.
     · une couleur de PLAN     → dans le domaine « site », l'accent suit le DOMAINE
       dans le domaine site      (violet), jamais le plan (jaune en LeLab+).

     · un CONTRASTE sous AA    → sur TOUT texte de l'app (4,5:1 · 3:1 si ≥24px ou ≥19px gras),
                                 placeholders compris, opacités héritées comprises.
                                 Cible : commerçants de 40-60 ans, souvent dehors. Un texte sous AA
                                 est un texte qu'ils NE LISENT PAS — ils ne le diront jamais, ils
                                 trouveront juste l'app « pas terrible ».
                                 ⚠️ --ink-3 / --ink-4 sont INTERDITS SUR DU TEXTE : ils ne passent
                                 l'AA sur AUCUNE surface (2,86:1 et 1,57:1). Filets et décor
                                 seulement. La hiérarchie se fait par la TAILLE et la GRAISSE.
                                 ⚠️ JAMAIS d'`opacity` sur du texte : posée sur un CONTENEUR, elle
                                 se multiplie avec l'alpha du token, en silence.

   ⚠️ ET LES ÉTATS — pas seulement l'état par défaut.
   Le scan repasse sur chaque CARD (accueil, format, type, Mon site) en état SURVOLÉ et en état
   SÉLECTIONNÉ, et mesure le CONTRASTE RÉEL du texte sur son fond (opacités comprises) : < 4,5:1
   (ou 3:1 pour un gros titre) = écart.
   POURQUOI : deux bugs ont survécu à tout parce qu'AUCUNE mesure ne les regardait. Un :hover
   passait le fond de la card à l'encre, et les règles censées éclaircir le texte visaient des
   noms de classe morts → contraste 1:1, illisible (et sur iOS le hover COLLE après un tap). Un
   sous-titre était à 3,6:1. Les captures de non-régression annonçaient « 0,00 % de pixels
   modifiés » — et disaient VRAI : elles ne photographiaient jamais ces états.
   ⚠️ Ce que le scan ne mesure PAS : le contraste hors des cards (champs, libellés, nav). Une
   règle globale ferait exploser des écarts pré-existants qui n'ont pas été arbitrés.

   USAGE
     1. servir le site :   python3 -m http.server 8080
     2. lancer le scan :   node scripts/scan-da.js 8080          (mode clair)
                           node scripts/scan-da.js 8080 dark     (mode sombre)

   ⚠️ REJOUER APRÈS CHAQUE LOT QUI TOUCHE AU STYLE — et dans LES DEUX MODES : un écart
   qui n'existe qu'en mode sombre est invisible en clair, donc jamais vu (ça s'est
   produit trois fois avec l'ancien bloc @media dark, aujourd'hui supprimé).

   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const SCHEME = process.argv[3] === 'dark' ? 'dark' : 'light';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('✗ puppeteer-core manquant.  npm i -D puppeteer-core'); process.exit(1); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: SCHEME }]);
  await p.setViewport({ width: 430, height: 900, isMobile: true });
  await p.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });

  const R = await p.evaluate(async () => {
    const RADIUS_OK = ['10px', '16px', '20px', '999px', '50%', '0px'];
    // Les objets qui FLOTTENT vraiment gardent leur ombre (arbitrage tranché, cf. LELAB.md).
    const FLOTTANTS = '#finalPost, .mini-preview, .phone, #igPhone, .preview-pane, .preview-close, .toast, .undo-toast';   // .popup / .popup-mini : SUPPRIMÉS (écran « Publier » mort)
    const exclu = el => el.closest(FLOTTANTS) !== null || el.matches(FLOTTANTS);
    /* ⚠️ DEUX exemptions DIFFÉRENTES — ne pas les confondre.
       FLOTTANTS  : dispensés d'OMBRE, de blanc pur, de radius. Mais la modale, le tiroir et les
                    toasts restent de l'INTERFACE : leur texte DOIT être mesuré.
       DÉCORATIF  : dispensés de TOUT, contraste compris. Les mockups Instagram reproduisent les
                    gris d'Instagram — c'est du CONTENU (ce que verra le follower), pas de l'UI. */
    const DECORATIF = '#finalPost, .mini-preview, .phone, #igPhone';
    const decor = el => el.closest(DECORATIF) !== null;
    // Exceptions assumées, documentées :
    // closest() et non classList : le GLYPHE à l'intérieur de la pastille hérite de sa couleur.
    const ASSUME = el => el.closest('.sc-actu, .fmt-shape') !== null;
    //   .sc-actu   : pastille Instagram — JAUNE car elle QUITTE le domaine site pour le domaine
    //                publication (LELAB.md). La couleur dit où le tap emmène.
    //   .fmt-shape : micro-forme illustrative (silhouette Post/Story) — 10px l'arrondirait en bulle.

    const nom = el => {
      const brut = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
      const c = brut.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
      return (el.id ? '#' + el.id : '') + (c ? '.' + c : '') || el.tagName.toLowerCase();
    };

    /* Le dénombrement du scan : combien de textes ont été TROUVÉS, et comment ils se répartissent.
       Sans lui, « ✓ aucun écart » ne distingue pas un scan complet d'un scan aveugle.

       ⚠️ TROIS NOMBRES, PAS DEUX — ET LEUR SOMME EST VÉRIFIÉE PAR LE SCAN LUI-MÊME.
          Un premier jet n'en rendait que deux (mesurés / exemptés). Il a produit un chiffre
          impossible : après le masquage des flèches, les exemptions tombaient de 6 à 1 mais le
          total restait à 204. Explication — les flèches n'avaient JAMAIS été dans ce total :
          elles étaient dans les exemptés, et sont passées dans une TROISIÈME CATÉGORIE SAUTÉE ET
          NON COMPTÉE (`visibility:hidden`). C'était le défaut qu'on venait de fermer, rouvert
          sous un autre nom.
       → On compte donc TROUVÉS = JUGÉS + EXEMPTÉS + IGNORÉS, et l'égalité est une ASSERTION.
         Une catégorie absente de l'égalité est une catégorie qui peut grandir en silence. */
    const BILAN = { trouves: 0, juges: 0, exemptes: [], ignores: [] };

    const scan = (ecran) => {
      const out = [];
      const racine = document.getElementById(ecran);
      if (!racine) return out;
      racine.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || decor(el) || ASSUME(el)) return;   // décoratif → dispensé de TOUT
        const cs = getComputedStyle(el);

        /* ── LE DÉNOMBREMENT, AVANT TOUTE SORTIE ANTICIPÉE ────────────────────────────────────
           On classe d'abord, on juge ensuite. Toute sortie placée AVANT ce bloc créerait une
           catégorie invisible au bilan — l'erreur qu'on vient de corriger.
           Population commune aux trois nombres : un élément qui PORTE DU TEXTE en propre, avec
           une boîte non nulle, ni décoratif ni assumé. */
        const aDuTexte = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        /* ⚠️ `visibility:hidden` garde une BOÎTE (width/height non nuls) mais n'affiche RIEN : le
           filtre de dimension ci-dessus ne l'attrape pas. Un élément invisible n'a ni contraste ni
           ombre à juger — mais il doit être COMPTÉ, sinon il disparaît du bilan. */
        const invisible = cs.visibility === 'hidden';
        const inactif = el.disabled === true;
        const etiquette = nom(el) + ' <' + el.tagName + '> « ' + el.textContent.trim().slice(0, 22) + ' »';
        if (aDuTexte) {
          BILAN.trouves++;
          if (invisible)    BILAN.ignores.push(etiquette);      // retiré de la vue → rien à juger
          else if (inactif) BILAN.exemptes.push(etiquette);     // visible mais inerte → WCAG 1.4.3
          else              BILAN.juges++;                      // jugé pour de vrai
        }
        if (invisible) return;                                  // ni forme ni contraste à juger
        const pb = [];
        const flottant = exclu(el);                                     // flottant → dispensé de la FORME, pas du texte
        if (!flottant) {
          if (cs.boxShadow && cs.boxShadow !== 'none' && !/inset/.test(cs.boxShadow)
              && !/^rgba?\([^)]*\) 0px 0px 0px [0-9.]+px/.test(cs.boxShadow))   // halo de focus = OK
            pb.push('OMBRE : ' + cs.boxShadow.slice(0, 38));
          if (!/INPUT|TEXTAREA|SELECT/.test(el.tagName) && cs.backgroundColor === 'rgb(255, 255, 255)')
            pb.push('BLANC PUR');
          const rad = cs.borderTopLeftRadius;
          if (rad && rad !== '0px' && !RADIUS_OK.includes(rad)) pb.push('RADIUS hors échelle : ' + rad);
        }
        const champ = /INPUT|TEXTAREA|SELECT/.test(el.tagName);
        if (champ && /Bricolage/.test(cs.fontFamily)) pb.push('BRICOLAGE dans un champ');
        if (!flottant && /monsite|edit/.test(ecran) &&
            /255, 242, 140|232, 194, 0|74, 64, 0|138, 122, 26/.test(cs.color + cs.backgroundColor))
          pb.push('couleur de PLAN (jaune) dans le domaine SITE');
        /* CONTRASTE — sur TOUT texte, pas seulement les cards. Un texte sous AA est un texte que
           le client NE LIT PAS : il ne le dira jamais, il trouvera juste l'app « pas terrible ».
           Cible : commerçants de 40-60 ans, souvent dehors, en plein soleil. */
        /* ⚠️ EXEMPTION — UN CONTRÔLE DÉSACTIVÉ N'A PAS D'EXIGENCE DE CONTRASTE.
           WCAG 2.1, SC 1.4.3 Contrast (Minimum), note « Incidental » :
             « Text or images of text that are part of an INACTIVE user interface component […]
               have no contrast requirement. »
           On teste la propriété `disabled` du DOM — l'état RÉEL d'un <button>, pas une classe ni
           une opacité. Un bouton natif désactivé est inerte par construction : il ne reçoit ni
           clic ni focus. Un élément seulement GRISÉ en CSS, lui, reste actif et n'est PAS exempté.
           ⚠️ POURQUOI CETTE LIGNE EXISTE : sans elle, la flèche « slide précédente » du carrousel,
              désactivée sur la 1re slide, sortait 5 écarts (un par écran du studio) et `scan-da`
              était ROUGE EN PERMANENCE depuis le 16/07/2026. Un garde-fou toujours rouge ne garde
              plus rien : on s'habitue à sa couleur, et le prochain VRAI écart passe inaperçu au
              milieu. Mesuré avant exemption : `disabled:true`, <BUTTON>, sur les 5 écrans.
           ⚠️ CE N'EST PAS UN SEUIL QU'ON BAISSE. Le seuil reste 4,5:1 pour tout le reste ; c'est
              le PÉRIMÈTRE qu'on rend explicite, avec sa référence. (cf. LELAB.md : « quand une
              sonde échoue sur un rendu validé, on corrige ce qu'elle MESURE, jamais son seuil ».)

           ⚠️ `disabled` NATIF UNIQUEMENT — PAS `aria-disabled`. Un `aria-disabled="true"` reste le
              plus souvent FOCUSABLE et CLIQUABLE : il annonce l'inactivité aux technologies
              d'assistance sans la faire respecter au clavier ni à la souris. Exempter du contraste
              un contrôle réellement OPÉRABLE serait un vrai trou. Vérifié : l'app n'emploie
              `aria-disabled` NULLE PART (0 occurrence) — la branche ne couvrait donc rien et
              n'ouvrait qu'un risque. Le jour où un cas l'exige, prouver d'abord que l'élément est
              aussi inerte (`tabindex="-1"` + `pointer-events:none`) avant de l'ajouter ici.

           ⚠️ ON COMPTE CE QU'ON ÉCARTE, ET CHAQUE EXEMPTION PORTE UN VERDICT ÉCRIT (table plus
              bas). Sans verdict, une ligne s'installe pour toujours, plus personne ne la lit, et
              le compteur ne veut plus rien dire — c'est exactement ce qui est arrivé aux 5 écarts
              de la flèche entre le 16/07 et le 31/07. */
        const porteDuTexte = aDuTexte && !inactif;
        if (porteDuTexte) { const c = window.__contraste(el);
          if (!c.ok) pb.push(`CONTRASTE ${c.ratio}:1 (seuil ${c.seuil}) — « ${el.textContent.trim().slice(0,20)} »`); }
        if (champ && el.placeholder) { const c = window.__contraste(el, '::placeholder');
          if (!c.ok) pb.push(`CONTRASTE du placeholder ${c.ratio}:1 (seuil ${c.seuil})`); }
        if (pb.length) out.push({ el: nom(el), pb });
      });
      return out;
    };

    /* ── CONTRASTE : la couleur EFFECTIVE du texte (alpha × opacités héritées) contre son fond. ──
       ⚠️ L'opacité d'un ANCÊTRE se multiplie avec l'alpha du token, en silence : c'est invisible à
       la lecture du CSS. On remonte donc toute la chaîne. C'est ce qui faisait tomber un tiret à
       1,46:1 alors que son token affichait fièrement .62. */
    window.__contraste = (el, pseudo) => {
      const LUM = ([r, g, b]) => {
        const f = v => (v /= 255) <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
        return .2126 * f(r) + .7152 * f(g) + .0722 * f(b);
      };
      const RGBA = c => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]; };
      /* ⚠️ LE FOND SE COMPOSITE, il ne se LIT pas.
         Un fond peut être semi-transparent (--red-soft = un rouge à 10 % d'alpha) : prendre son RGB
         brut donnerait « rouge sur rouge » = 1,11:1, un faux positif spectaculaire. On empile donc
         tous les fonds peints jusqu'au premier opaque, et on les fusionne du bas vers le haut. */
      const pile = []; let n = el;
      while (n && n !== document.documentElement) {
        const c = RGBA(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) { pile.push(c); if (c[3] >= 1) break; }
        n = n.parentElement;
      }
      let fond = [239, 235, 231];                       // --bg, sous toute la pile
      for (let i = pile.length - 1; i >= 0; i--) {
        const c = pile[i];
        fond = [0, 1, 2].map(k => c[3] * c[k] + (1 - c[3]) * fond[k]);
      }
      let op = 1; n = el;
      while (n && n !== document.body) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
      const cs = getComputedStyle(el, pseudo || undefined), [r, g, b, a] = RGBA(cs.color), A = a * op;
      const eff = [0, 1, 2].map(i => A * [r, g, b][i] + (1 - A) * fond[i]);
      const [hi, lo] = [LUM(eff), LUM(fond)].sort((x, y) => y - x);
      const ratio = (hi + .05) / (lo + .05);
      const px = parseFloat(cs.fontSize), gras = parseInt(cs.fontWeight, 10) >= 700;
      const seuil = (px >= 24 || (px >= 18.66 && gras)) ? 3 : 4.5;   // WCAG « gros texte »
      return { ratio: Math.round(ratio * 100) / 100, seuil, ok: ratio >= seuil };
    };
    /* Les cards, dans TOUS leurs états — c'est là que le langage se joue, et là qu'il a cassé. */
    window.__cards = () => [...document.querySelectorAll(
      '.tile:not([hidden]), #fmtRow .fmt, #themeGrid .lelab-card, #screen-monsite .site-card')]
      .filter(c => c.getBoundingClientRect().width);
    window.__textes = (card) => [...card.querySelectorAll('*')]
      .filter(e => e.getBoundingClientRect().width && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));

    /* ⚠️ LES SECTIONS SONT DÉCOUVERTES, PLUS ÉCRITES EN DUR.
       Les scripts listaient « dujour » en dur — or c'est un NOM DE BLOC, donc de la DONNÉE CLIENT
       (chez Masa il s'appelle « cematin »). Un garde-fou qui connaît le nom des blocs d'un client
       ne tourne que chez lui. On les lit dans config.json, et on les confronte à ce que l'écran
       « Mon site » propose RÉELLEMENT (les onclick openEdit) : c'est la seule source qui ne peut
       pas mentir. Le garde-fou devient GÉNÉRIQUE — il tournera sur n'importe quel fork. */
    window.__blocsDeConfig = async () => {
      const cfg = await fetch('/_data/config.json').then(r => r.ok ? r.json() : null).catch(() => null);
      const b = (cfg && cfg.blocs) || {};
      return Object.keys({ ...(b.socle || {}), ...(b.optionnels || {}) });
    };
    /* ⚠️ LE PORTEUR DE L'ACTION EST CHERCHÉ DANS LA CARD, JAMAIS À UN EMPLACEMENT FIGÉ.
       Cette sonde lisait `card.getAttribute('onclick')` : elle supposait que la CARD portait
       l'ouverture. Le jour où l'action est descendue sur un <button> interne (une card <div> n'est
       pas focusable — la nav était injoignable au clavier), la découverte a rendu une liste VIDE,
       donc ZÉRO écran testé. Le scan a refusé de passer et c'est ce qui l'a fait voir ; il n'en
       reste pas moins qu'il a fallu le réparer pour une raison qui ne le concernait pas.
       → On interroge la CARD PUIS ses descendants, et on prend le premier `openEdit(...)` trouvé.
         La card d'abord, et ce n'est pas cosmétique : un fork non encore porté la garde sur le
         <div>. La sonde tourne sur les DEUX formes sans avoir à savoir laquelle elle regarde.
       → RÈGLE : une sonde nomme CE QU'ELLE CHERCHE (une action `openEdit` dans une card), jamais
         OÙ ça se trouve. Le prochain déplacement ne doit plus la casser. */
    window.__sectionsEditables = () => [...document.querySelectorAll('#screen-monsite .site-card')]
      .map(c => {
        const m = [c, ...c.querySelectorAll('[onclick]')]
          .map(el => (el.getAttribute('onclick') || '').match(/openEdit\('([^']+)'\)/))
          .find(Boolean);
        return m && m[1];
      })
      .filter(Boolean);
    /* Le jeu d'essai suit les blocs déclarés : chaque _data/<bloc>.json qui existe est chargé.
       Un bloc sans fichier (infos, reservation) est simplement absent — comme en vrai. */
    window.__donneesDesBlocs = async (fabrique) => {
      const out = {};
      for (const cle of await window.__blocsDeConfig()){
        const reel = await fetch('/_data/' + cle + '.json').then(r => r.ok ? r.json() : null).catch(() => null);
        if (reel !== null) out[cle] = fabrique ? fabrique(cle, reel) : reel;
      }
      return out;
    };

    sassyData = { themes: await fetch('/_data/themes.json').then(r => r.json()),
      /* ⚠️ On part de la VRAIE config.json (ses `blocs`), en ne surchargeant que le plan : sans les
      blocs, aucune card n'est générée et le scan ne teste RIEN. */
      config: { ...(await fetch('/_data/config.json').then(r => r.json()).catch(() => ({}))), plan: 'lelab_plus', famille: 'food' },
      general: { telephone: '06 12 34 56 78', email: 'a@b.fr', adresse: '12 rue X, 13001 Marseille' },
      carte: { entrees: [{ nom: 'Tartare', description: 'x', prix: '12€' }], plats: [], desserts: [] },
      photos: { slider: [], galerie: [] }, events: [{ date: '2026-08-01', titre: 'Soirée', description: 'x' }],
      ...(await window.__donneesDesBlocs(() => [{ nom: 'Épaule', desc: 'x', prix: '19 €', dispo: true }])),
      horaires: { jours: [{ jour: 'Lundi', ouvert: true, heures: '9h – 18h' }] } };

    const out = {};
    out['login'] = scan('login-gate');
    document.body.classList.add('authed');
    applyPlan('lelab_plus'); renderCustomThemes(); studioReady = true;
    /* ⚠️ Les cards de « Mon site » sont GÉNÉRÉES depuis config.json : sans cet appel, la grille
       est VIDE, aucune section n'est découverte — et le scan passerait au VERT en ne testant
       RIEN. Un garde-fou qui ne trouve rien doit HURLER, pas se taire (cf. le contrôle plus bas). */
    renderSiteCards(); enregistrerSourcesDeBlocs();


    showScreen('dashboard'); await new Promise(r => setTimeout(r, 400));
    out['accueil'] = scan('screen-dashboard');
    showScreen('monsite'); await new Promise(r => setTimeout(r, 400));
    injectActuButton();
    /* ⚠️ UN SCAN QUI NE DÉCOUVRE RIEN N'EST PAS UN SCAN QUI PASSE — c'est un scan CASSÉ.
       Le jour où renderSiteCards() ne tourne pas (amorçage manqué, config illisible), la grille est
       vide, zéro section est découverte, et le scan annonce fièrement « aucun écart ». Il faut qu'il
       CRIE. C'est la même faute que le toast qui confirmait un ajout qui n'avait pas eu lieu. */
    if (!window.__sectionsEditables().length) throw new Error('AUCUNE SECTION DÉCOUVERTE — la grille « Mon site » est vide : le scan ne teste RIEN.');

    out['Mon site'] = scan('screen-monsite');
    for (const id of window.__sectionsEditables()) {
      openEdit(id); await new Promise(r => setTimeout(r, 450));
      out['section : ' + id] = scan('screen-edit');
    }
    showScreen('studio'); await new Promise(r => setTimeout(r, 400));
    for (const st of ['format', 'type', 'details', 'caption', 'publish']) {
      goStep(stepNum(st)); await new Promise(r => setTimeout(r, 500));
      out['studio · ' + st] = scan('screen-studio');
    }
    return { ecrans: out, bilan: BILAN };
  });
  const r = R.ecrans, bilan = R.bilan;

  /* ══ PASSE D'ÉTATS — au repos ET au survol, contraste mesuré. ═════════════════════════════
     Un état jamais capturé est un état jamais testé : c'est la faille par laquelle sont passés
     le hover-encre-texte-noir et le sous-titre à 3,6:1. */
  const SEL = '.tile, #fmtRow .fmt, #themeGrid .lelab-card, #screen-monsite .site-card';
  const lire = (h, etat) => p.evaluate((el, etat) => window.__textes(el).map(t => {
    const c = window.__contraste(t);
    return c.ok ? null : { el: (t.className || t.tagName).toString().split(' ')[0],
                           txt: (t.textContent || '').trim().slice(0, 24), ...c, etat };
  }).filter(Boolean), h, etat);

  const etats = {};
  for (const [lbl, prep] of [
    ['accueil',        () => showScreen('dashboard')],
    ['Mon site',       () => { showScreen('monsite'); injectActuButton(); }],
    ['studio · étape 1 (format)', () => { showScreen('studio'); goStep(stepNum('format')); }],
    ['studio · étape 2 (type)',   () => { showScreen('studio'); goStep(stepNum('type')); }],
  ]) {
    await p.evaluate(prep);
    await new Promise(r => setTimeout(r, 500));
    const cards = [];
    for (const h of await p.$$(SEL)) if (await h.boundingBox()) cards.push(h);
    const ec = [];
    // ⚠️ On ÉCARTE la souris, puis on laisse le fondu se terminer. La souris reste posée au même
    // endroit d'un écran à l'autre (hover collant — le mécanisme même du bug iOS) : sans cette
    // pause on mesure une couleur EN COURS DE TRANSITION, et le scan ment sur l'état qu'il rapporte.
    await p.mouse.move(0, 0);
    await new Promise(r => setTimeout(r, 600));                // AU REPOS (couvre le SÉLECTIONNÉ non survolé)
    for (const h of cards) ec.push(...await lire(h, 'au repos'));
    for (const h of cards) {                                   // AU SURVOL, card par card
      await h.hover(); await new Promise(r => setTimeout(r, 600));
      ec.push(...await lire(h, 'au survol'));
    }
    etats[lbl] = { cards: cards.length, ec };
  }

  console.log(`\n═══ SCAN DA — mode ${SCHEME.toUpperCase()} ═══`);
  let total = 0;
  for (const [ecran, liste] of Object.entries(r)) {
    const vus = new Map();
    liste.forEach(x => vus.set(x.el + '|' + x.pb.join(','), x));
    const uniq = [...vus.values()];
    if (!uniq.length) { console.log(`  ✓ ${ecran}`); continue; }
    console.log(`\n  ✗ ${ecran.toUpperCase()} — ${uniq.length} écart(s)`);
    uniq.forEach(x => { console.log(`      ${x.el.padEnd(28)} ${x.pb.join(' · ')}`); total++; });
  }
  console.log('\n  ── contraste des cards, au repos ET au survol ──');
  for (const [ecran, { cards, ec }] of Object.entries(etats)) {
    if (!ec.length) { console.log(`  ✓ ${ecran.padEnd(28)} ${cards} card(s) × 2 états`); continue; }
    console.log(`\n  ✗ ${ecran.toUpperCase()}`);
    const vus = new Set();
    ec.forEach(x => {
      const k = x.el + x.txt + x.etat; if (vus.has(k)) return; vus.add(k);
      console.log(`      « ${x.txt} » ${x.etat.padEnd(10)} ${x.ratio}:1  (seuil ${x.seuil})`); total++;
    });
  }
  /* ══════════════════════════════════════════════════════════════════════════════════════════
     LE DÉNOMBREMENT — sans lui, un vert ne dit pas s'il a tout vu ou presque rien vu.
     ══════════════════════════════════════════════════════════════════════════════════════════
     TROUVÉS = JUGÉS + EXEMPTÉS + IGNORÉS, et l'égalité est vérifiée plus bas.

     ⚠️ « EXEMPTÉS » N'EST PAS « ENTORSES » — c'est le nombre de contrôles désactivés VISIBLES,
        dont certains sont LÉGITIMES. **La dette de DA = exemptés − exceptions assumées.** La règle
        maison est plus stricte que WCAG (« pour signifier inactif, on RETIRE le contenu, on ne le
        GRISE pas », LELAB.md), mais elle a une exception connue — et un compteur qui traiterait
        l'exception comme une faute redeviendrait le feu rouge permanent qu'on vient d'éteindre.

     ⚠️ TOUTE EXEMPTION DOIT PORTER UN VERDICT ÉCRIT, et une exemption SANS verdict FAIT ÉCHOUER
        le scan. Sans ça, une ligne s'installe dans la liste pour toujours et plus personne ne la
        lit : c'est exactement ce qui est arrivé aux 5 écarts de la flèche, du 16/07 au 31/07. */
  const VERDICTS = {
    '.btn.btn--block|Publier les modificati': {
      statut: 'EXCEPTION ASSUMÉE',
      raison: 'CTA principal désactivé tant que rien n\'a changé. Un bouton d\'ACTION PRINCIPALE doit '
            + 'rester VISIBLE même inerte : le retirer ferait ignorer son existence à l\'utilisateur, '
            + 'qui ne saurait plus comment publier. La règle « on retire, on ne grise pas » vise le '
            + 'CONTENU (un jour fermé, un prix indisponible), pas l\'action principale d\'un écran. '
            + '(Tranché le 31/07/2026 — seule exception connue, cf. LELAB.md.)'
    }
  };
  const cle = e => { const m = e.match(/^(\S+) <[^>]+> « (.*) »$/); return m ? m[1] + '|' + m[2] : e; };

  const uniqExempt = [...new Set(bilan.exemptes)], uniqIgnore = [...new Set(bilan.ignores)];
  console.log('\n  ── dénombrement ──');
  console.log(`  ${bilan.trouves} texte(s) TROUVÉ(S) = ${bilan.juges} jugé(s) + ${bilan.exemptes.length} exempté(s) + ${bilan.ignores.length} ignoré(s)`);

  console.log(`\n  EXEMPTÉS — désactivés mais VISIBLES (WCAG 1.4.3 « Incidental ») : ${bilan.exemptes.length} occurrence(s), ${uniqExempt.length} élément(s)`);
  let sansVerdict = 0, dette = 0;
  uniqExempt.forEach(e => {
    const v = VERDICTS[cle(e)];
    if (!v){ sansVerdict++; console.log(`      ✗ ${e}\n          SANS VERDICT — à trancher : dette de DA, ou exception assumée avec sa raison ?`); return; }
    if (v.statut !== 'EXCEPTION ASSUMÉE') dette++;
    console.log(`      · ${e}\n          ${v.statut} — ${v.raison}`);
  });
  console.log(`  → DETTE DE DA = ${dette} (exemptés moins exceptions assumées)`);

  console.log(`\n  IGNORÉS — retirés de la vue (visibility:hidden), rien à juger : ${bilan.ignores.length} occurrence(s), ${uniqIgnore.length} élément(s)`);
  uniqIgnore.forEach(e => console.log('      · ' + e));

  /* ⚠️ L'ÉGALITÉ EST UNE ASSERTION, PAS UN COMMENTAIRE. Une catégorie absente de la somme peut
     grandir en silence — c'est la définition même du scan qui ment. */
  const somme = bilan.juges + bilan.exemptes.length + bilan.ignores.length;
  if (somme !== bilan.trouves)
    throw new Error(`DÉNOMBREMENT INCOHÉRENT — ${bilan.trouves} trouvés ≠ ${somme} classés : une catégorie échappe au bilan.`);

  if (sansVerdict)
    throw new Error(`${sansVerdict} exemption(s) SANS VERDICT — trancher « dette de DA » ou « exception assumée », et l'écrire dans VERDICTS (scan-da.js) + LELAB.md.`);

  /* ⚠️ UN PLANCHER NE SUFFIT PAS — IL FAUT UN ÉCART À LA LIGNE DE BASE.
     Un premier jet exigeait « au moins 50 textes mesurés ». Il aurait laissé passer une chute de
     210 à 51 : les trois quarts de l'interface cessant d'être scannés, sans un mot. Un scan qui
     mesure soudain beaucoup moins doit CRIER, pas passer.
     ⚠️ CE NOMBRE SE MET À JOUR DÉLIBÉRÉMENT, jamais « pour faire passer le scan ». Si l'interface
        a réellement grandi ou maigri, on change la constante DANS UN COMMIT QUI LE DIT.
     Relevé le 31/07/2026, modes clair ET sombre : 210 = 204 jugés + 1 exempté + 5 ignorés.
     ⚠️ C'est le total TROUVÉ qui fait référence, pas le nombre de jugés : sinon un élément qui
        glisse de « jugé » vers « exempté » ferait baisser la référence sans alerte, et la
        couverture pourrait fondre catégorie par catégorie. */
  const BASE_TROUVES = 210;
  const TOLERANCE = 0.05;
  const ecart = Math.abs(bilan.trouves - BASE_TROUVES) / BASE_TROUVES;
  if (ecart > TOLERANCE)
    throw new Error(`PÉRIMÈTRE DU SCAN MODIFIÉ — ${bilan.trouves} textes trouvés contre ${BASE_TROUVES} attendus `
      + `(${(ecart * 100).toFixed(1)} % d'écart, seuil ${TOLERANCE * 100} %). Soit l'amorçage a échoué et le vert `
      + `ne vaut rien, soit l'interface a changé : confirmer explicitement en ajustant BASE_TROUVES.`);

  console.log(`\n──── ${total === 0 ? '✓ AUCUN ÉCART' : total + ' écart(s)'} ────\n`);
  await b.close();
  process.exit(total ? 1 : 0);   // sortie non nulle → utilisable en garde-fou
})();
