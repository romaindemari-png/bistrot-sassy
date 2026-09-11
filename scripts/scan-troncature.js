#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   SCAN TRONCATURE — le contenu coupé en silence.
   ═══════════════════════════════════════════════════════════════════════════
   POURQUOI CET OUTIL EXISTE
   « Un contenu coupé ne crie pas. » C'est la famille de bugs de toute la refonte :
   fitFinalPost (le post rogné), adjustStepsHeight (la légende rognée), la card
   annonce (un sous-titre tronqué pendant des heures sans que personne le voie),
   et surtout — trouvé le 13/07 — le bouton « PUBLIER MAINTENANT », l'action
   principale du produit, **tranché net par sa propre modale**.

   ⚠️ 320 px N'EST PAS UN CAS EXOTIQUE.
   L'app est en px (145 tailles, zéro rem) et ne déclare pas text-size-adjust :
   le réglage « Taille du texte » d'iOS n'a AUCUN effet dessus. Le client qui a
   besoin de lire plus gros utilisera donc le ZOOM DE PAGE de Safari (« Aa » →
   125 %). Or le zoom RÉTRÉCIT le viewport CSS : un iPhone 14 (390 px) à 125 %
   devient **312 px effectifs**. La colonne 320 px, c'est un iPhone normal entre
   les mains d'un commerçant de 55 ans. (Chantier px → rem : cf. BACKLOG.)

   CE QU'IL FAIT
   Il balaie les 14 écrans sur plusieurs largeurs × plusieurs tailles de texte ×
   les 2 plans, avec un jeu de données HOSTILE (nom de commerce long, plat
   interminable, adresse sur deux lignes, @pseudo long, légende de 2200 caractères,
   carte de 20 plats, « du jour » de 10 produits, sous-titre de thème long), et
   signale tout bloc où :
       scrollHeight > clientHeight   (ou scrollWidth > clientWidth)
       ET son overflow ROGNE (hidden/clip)
   → du contenu INATTEIGNABLE. Un overflow auto/scroll ne compte pas : il se
   rattrape au doigt. Et il remonte L'ENFANT COUPABLE, pas seulement le parent
   qui rogne — sinon le rapport n'est pas actionnable.

   ⚠️⚠️ LES TROIS PIÈGES DU MESUREUR — ils sont la vraie valeur de ce script.
   Je suis tombé dans les trois en l'écrivant. Ne les défaites pas.

   1. L'AGRANDISSEMENT DU TEXTE DOIT ÊTRE IDEMPOTENT.
      Première version : à chaque écran, on relisait la taille CALCULÉE (donc déjà
      grossie) et on la re-multipliait. Le mesureur annonçait des hauteurs à SEPT
      MILLIONS de pixels. **Il mentait plus fort que le bug qu'il cherchait.**
      → On REMET À ZÉRO les font-size inline avant de lire la taille de référence.

   2. LE TEXTE LONG DOIT AVOIR DES ESPACES.
      Ma « légende de 2200 caractères » était `'x'.repeat(2200)` — UN SEUL MOT
      INSÉCABLE, qui ne peut pas revenir à la ligne. D'où des débordements
      horizontaux à 20 000 px, et deux fausses alertes que j'ai failli livrer.
      → Le contenu hostile doit être hostile de façon RÉALISTE.

   3. UN <input> DÉBORDE NATIVEMENT À L'HORIZONTALE.
      Son texte défile au caret : ce n'est pas une troncature. Sans l'exclure,
      chaque champ rempli sonne l'alarme.

   4. CHAQUE AXE SE JUGE SÉPARÉMENT.
      Un bloc peut être `overflow-x:hidden; overflow-y:auto` : à l'horizontale il
      ROGNE, à la verticale il DÉFILE. Tester `overflow` globalement (qui vaut alors
      « hidden auto ») y voit le mot « hidden » et crie à la troncature sur un
      contenu parfaitement atteignable au doigt. C'est le cas du mockup de téléphone,
      et ça m'a valu un faux positif de plus.

   EXEMPTIONS ASSUMÉES, documentées (comme scan-da exempte les mockups)
     · .fp-cap  → tronque à 2 lignes AVEC un « … plus » cliquable (expandFinalCaption).
                  Une troncature qui S'ANNONCE et se déplie n'est pas un mensonge :
                  c'est le comportement d'Instagram. (L'aperçu .phone-screen a reçu
                  le MÊME traitement le 13/07 — il rognait 1612 px SANS aucun signe.)
     · line-clamp / text-overflow:ellipsis → troncature explicitement demandée.

   USAGE
     1. servir le site :  python3 -m http.server 8080
     2. lancer le scan :  node scripts/scan-troncature.js 8080
   Sortie non nulle au moindre écart → utilisable en garde-fou.

   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch { console.error('✗ puppeteer-core manquant.  npm i -D puppeteer-core'); process.exit(1); }

/* 320 = un iPhone 14 avec le zoom Safari à 125 %. 375 = iPhone SE. 390 = iPhone 14. 430 = Pro Max.
   ⚠️ 1280 n'est PAS décoratif : le volet d'aperçu (.preview-pane, avec son mockup de téléphone) est
   MASQUÉ sous 960 px. Sans une largeur desktop, il n'est jamais scanné — et c'est justement là que
   la légende de l'aperçu débordait de 1612 px. Un scan qui ne regarde qu'une famille de largeurs
   croit avoir tout vu. */
const LARGEURS = [320, 375, 390, 430, 1280];
const ECHELLES = [1, 1.3];          // texte à taille normale, puis nettement agrandi
const PLANS    = ['lelab', 'lelab_plus'];

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const ecarts = [];

  for (const W of LARGEURS) for (const E of ECHELLES) for (const PLAN of PLANS) {
    const p = await b.newPage();
    await p.setViewport({ width: W, height: 844, isMobile: W < 960 });
    await p.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });

    const trouves = await p.evaluate(async (PLAN, E) => {
      const pause = ms => new Promise(r => setTimeout(r, ms));

      /* ⚠️ PIÈGE 2 — du contenu hostile, mais RÉALISTE : des mots, des espaces. */
      const NOM   = 'Boulangerie Pâtisserie Artisanale Masa Madre';
      const PLAT  = "Épaule d'agneau confite sept heures au thym et à l'ail rose de Lautrec";
      const DESC  = 'Cuite très lentement, jus corsé réduit au vin rouge, purée de céleri-rave';
      const ADR   = '128 boulevard de la Libération Général de Gaulle, 13001 Marseille';
      const INSTA = '@boulangerie_masa_madre_marseille';
      const SOUS  = 'Fermeture exceptionnelle, congés annuels, une nouvelle importante à annoncer';
      const LEGENDE = ("Ce matin la fournée est sortie plus tôt que d'habitude et le pain a une mie "
                     + 'incroyable, on vous attend jusqu\'à la fermeture. ').repeat(14).slice(0, 2200);

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

      const themes = await fetch('/_data/themes.json').then(r => r.json());
      themes.forEach(t => { if (t.sousTitre) t.sousTitre = SOUS; });
      const plats = Array.from({ length: 20 }, () => ({ nom: PLAT, description: DESC, prix: '19 €' }));
      /* ⚠️ On part de la VRAIE config.json (ses `blocs`), en ne surchargeant que le plan : sans les
      blocs, aucune card n'est générée et le scan ne teste RIEN. */
      const cfgReel = await fetch('/_data/config.json').then(r => r.json()).catch(() => ({}));
      sassyData = { themes, config: { ...cfgReel, plan: PLAN, famille: 'food' },
        general: { nom: NOM, telephone: '06 12 34 56 78', email: 'contact@x.fr', adresse: ADR, instagram: INSTA },
        carte: { entrees: plats, plats, desserts: plats },
        photos: { slider: [], galerie: [] },
        events: Array.from({ length: 6 }, () => ({ date: '2026-08-01', titre: PLAT, description: DESC })),
        ...(await window.__donneesDesBlocs(() => Array.from({ length: 10 }, () => ({ nom: PLAT, desc: DESC, prix: '19 €', dispo: true })))),
        horaires: { jours: [{ jour: 'Lundi', ouvert: true, heures: '7h30 – 19h30' }] } };
      document.body.classList.add('authed');
      applyPlan(PLAN); renderCustomThemes(); studioReady = true;
      /* ⚠️ Les cards de « Mon site » sont GÉNÉRÉES depuis config.json : sans cet appel, la grille
         est VIDE, aucune section n'est découverte — et le scan passerait au VERT en ne testant
         RIEN. Un garde-fou qui ne trouve rien doit HURLER, pas se taire (cf. le contrôle plus bas). */
      renderSiteCards(); enregistrerSourcesDeBlocs();


      /* ⚠️ PIÈGE 1 — IDEMPOTENT. On efface les font-size inline AVANT de lire la référence,
         sinon on relit une taille déjà grossie et on la re-multiplie à chaque écran. */
      const grossir = () => {
        if (E === 1) return;
        const els = [...document.querySelectorAll('*')];
        els.forEach(el => { el.style.fontSize = ''; });
        const base = els.map(el => parseFloat(getComputedStyle(el).fontSize));
        els.forEach((el, i) => { if (base[i]) el.style.fontSize = (base[i] * E) + 'px'; });
      };

      // Troncatures ASSUMÉES : elles S'ANNONCENT (un « … plus » qui déplie) ou sont demandées.
      const ASSUME = el => el.closest('.fp-cap') !== null;
      const nom = el => (el.id ? '#' + el.id : '') + '.' +
        ((el.className || '').toString().trim().split(/\s+/)[0] || el.tagName.toLowerCase());

      const out = [];
      const balayer = (racine, ecran) => {
        document.querySelectorAll(racine + ' *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || ASSUME(el)) return;
          const cs = getComputedStyle(el);
          if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return;
          if (cs.textOverflow === 'ellipsis') return;
          /* ⚠️ PIÈGE 4 — CHAQUE AXE SE JUGE SÉPARÉMENT.
             Un bloc peut être `overflow-x:hidden; overflow-y:auto` : à l'horizontale il ROGNE, à la
             verticale il DÉFILE. Tester `overflow` globalement (qui vaut alors « hidden auto ») y
             voit le mot « hidden » et crie à la troncature sur un contenu parfaitement atteignable
             au doigt. Le mockup de téléphone, exactement. */
          const rogneY = /hidden|clip/.test(cs.overflowY);
          const rogneX = /hidden|clip/.test(cs.overflowX);
          if (!rogneY && !rogneX) return;
          /* ⚠️ PIÈGE 3 — un <input> défile au caret : son débordement horizontal n'est pas une troncature. */
          const champ = /INPUT|TEXTAREA/.test(el.tagName);
          const perteY = rogneY ? (el.scrollHeight - el.clientHeight) : 0;
          const perteX = (rogneX && !champ) ? (el.scrollWidth - el.clientWidth) : 0;
          if (perteY <= 2 && perteX <= 2) return;

          // QUI déborde ? Le parent qui rogne ne dit rien — c'est l'enfant qui sort du cadre.
          let coupable = '(texte direct)', debord = 0;
          el.querySelectorAll('*').forEach(k => {
            const kr = k.getBoundingClientRect();
            const d = Math.max(kr.bottom - r.bottom, kr.right - r.right);
            if (d > debord) { debord = d; coupable = nom(k); }
          });
          out.push({ el: nom(el), ecran, perteY, perteX, coupable,
                     txt: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) });
        });
      };

      const voir = async (fn, ecran, sel) => { fn(); await pause(420); grossir(); await pause(150); balayer(sel, ecran); };
      await voir(() => showScreen('dashboard'), 'accueil', '#screen-dashboard');
      await voir(() => { showScreen('monsite'); injectActuButton(); }, 'Mon site', '#screen-monsite');
      /* ⚠️ UN SCAN QUI NE DÉCOUVRE RIEN N'EST PAS UN SCAN QUI PASSE — c'est un scan CASSÉ.
         Le jour où renderSiteCards() ne tourne pas (amorçage manqué, config illisible), la grille est
         vide, zéro section est découverte, et le scan annonce fièrement « aucun écart ». Il faut qu'il
         CRIE. C'est la même faute que le toast qui confirmait un ajout qui n'avait pas eu lieu. */
      if (!window.__sectionsEditables().length) throw new Error('AUCUNE SECTION DÉCOUVERTE — la grille « Mon site » est vide : le scan ne teste RIEN.');

      for (const id of window.__sectionsEditables())
        await voir(() => openEdit(id), 'section : ' + id, '#screen-edit');
      showScreen('studio'); await pause(300);
      for (const st of ['format', 'type', 'details', 'caption', 'publish'])
        await voir(() => {
          goStep(stepNum(st));
          if (st === 'caption') {
            const c = document.getElementById('caption');
            if (c) { c.value = LEGENDE; c.dispatchEvent(new Event('input', { bubbles: true })); }
          }
        }, 'studio · ' + st, '#screen-studio');
      return out;
    }, PLAN, E);

    trouves.forEach(t => ecarts.push({ ...t, W, E, PLAN }));
    await p.close();
  }

  console.log('\n═══ SCAN TRONCATURE — du contenu coupé, donc INATTEIGNABLE ═══\n');
  const parBloc = new Map();
  ecarts.forEach(x => {
    const e = parBloc.get(x.el) || { max: 0, cas: null, coupable: x.coupable, ecrans: new Set() };
    const perte = Math.max(x.perteY, x.perteX);
    if (perte > e.max) { e.max = perte; e.cas = x; e.coupable = x.coupable; }
    e.ecrans.add(x.ecran);
    parBloc.set(x.el, e);
  });
  if (!parBloc.size) {
    console.log(`  ✓ AUCUNE TRONCATURE — ${LARGEURS.length}×${ECHELLES.length}×${PLANS.length} combinaisons, contenu hostile\n`);
    await b.close(); process.exit(0);
  }
  [...parBloc.entries()].sort((a, c) => c[1].max - a[1].max).forEach(([el, e]) => {
    console.log(`  ✗ ${el}   −${e.max}px`);
    console.log(`      coupable : ${e.coupable}`);
    console.log(`      dès      : ${e.cas.W}px · texte ×${e.cas.E} · plan ${e.cas.PLAN}`);
    console.log(`      écrans   : ${[...e.ecrans].slice(0, 3).join(', ')}`);
    console.log(`      « ${e.cas.txt} »\n`);
  });
  console.log(`──── ${parBloc.size} bloc(s) qui TRONQUENT ────\n`);
  await b.close();
  process.exit(1);
})();
