#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   ATTEIGNABILITÉ — deux choses présentes dans le DOM que le client NE VOIT JAMAIS.
   ═══════════════════════════════════════════════════════════════════════════
   Même famille que test-listes : « dans le DOM » ne veut pas dire « atteignable ».

   A. PIED CTA / ROTATION — à la rotation, iOS n'émet QU'UN SEUL visualViewport
      resize, EN PLEINE TRANSITION : la géométrie est incohérente, le pied reçoit un
      transform qui le sort de l'écran, et RIEN ne suit pour le corriger → il reste
      collé hors champ. Studio stabilisé, on SIMULE ce transform périmé, on déclenche
      orientationchange, et on exige que le pied soit REVENU au repos (translateY ≈ 0).

   B. BANNIÈRE REPRISE — un brouillon (localStorage) existe. On entre au studio, la
      bannière s'affiche, on y RÉPOND (dismiss), on sort, on revient : la question
      « Reprendre / Recommencer » DOIT réapparaître. Avant le correctif, resumeOffer
      n'était armé qu'au boot et le brouillon vivait en sessionStorage → jamais au retour.

   B2/B3/B4. « RECOMMENCER » = LE TRAVAIL SAISI, JAMAIS L'ÉTAPE ATTEINTE, JAMAIS LE PRÉREMPLI.
      Les 4 comportements qui doivent tenir ENSEMBLE — aucun ne se prouve sans les trois autres :
        1. arriver sur l'écran (thème prérempli)      → PAS de « Recommencer »   [B3]
        2. modifier un champ                          → « Recommencer » apparaît [B2, B3]
        3. sortir AVEC un vrai travail, revenir       → reprise directe, contenu INTACT [B]
        4. sortir SANS rien modifier, revenir         → étape 1, aucun brouillon écrit [B4]

      ⚠️ B3 NE DOIT JAMAIS APPELER studioReset() — et c'est la leçon la plus chère de ce fichier.
      L'ancien B3 le faisait : ça vidait la liste, ce qui faisait tomber le prérempli DANS nextStep,
      seul cas où la ligne de base était recalée. Il fabriquait les conditions de son succès → vert
      avant le fix comme après, pendant que le bug tournait EN PROD. Un garde-fou incapable de rougir
      ne garde rien. Le client ARRIVE sur l'écran ; il ne « recommence » pas.

   C. SLIDER VERROUILLÉ — le slider (le hero) est du gabarit DA, pas du contenu client.
      L'éditeur Photos ne l'affiche QUE si `photos.admin.sliderEditable: true`. OFF (défaut) →
      `#photos-slider` absent, galerie seule. ON → présent. Un contrôle qui écrirait dans le
      gabarit verrouillé serait pire qu'absent.

   ⚠️ Il DOIT être ROUGE sur le code d'avant les correctifs, VERT après — sinon il ne
   prouve rien. 6e garde-fou permanent (le pied CTA n'en avait aucun).

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-atteignabilite.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait   = ms => new Promise(r => setTimeout(r, ms));
const SETTLE = 450;   // > le fondu d'écran (150 ms) + le layout posé

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  // Le garde-fou contrôle le boot (authed + loadSassyData) lui-même → il désactive le bypass dev localhost.
  await p.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });
  const fails = [];

  /* LE RÉSEAU DE LA SONDE (bout 8) :
     · generate-caption répond une légende témoin numérotée, et chaque appel est COMPTÉ (partie D) ;
     · le chemin `produits` (Masa, la fournée) : Sassy n'a pas de plat du jour en ligne (bloc éteint, sans section),
       et le studio grise un sujet sans matière. La sonde l'ALLUME dans la config servie, pour garder ce chemin
       vivant — c'est le même patron que C (config mutée), en amont du chargement. */
  const appelsLegende = [];
  const cfgSite = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '_data', 'config.json'), 'utf8'));
  for (const g of Object.values(cfgSite.blocs || {})) for (const bl of Object.values(g || {})) if (bl && bl.type === 'produits') bl.actif = true;
  const configAllumee = JSON.stringify(cfgSite);
  await p.setRequestInterception(true);
  p.on('request', r => {
    if (/generate-caption/.test(r.url())){
      appelsLegende.push(JSON.parse(r.postData() || '{}'));
      return r.respond({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ caption: 'LÉGENDE-SONDE ' + appelsLegende.length, hashtags: ['#sonde'] }) });
    }
    if (/\/_data\/config\.json/.test(r.url())) return r.respond({ status: 200, contentType: 'application/json', body: configAllumee });
    r.continue();
  });

  // ── A. PIED CTA au repos après une rotation ─────────────────────────────────
  await p.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });
  await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    studioReady = true;
    handlePlusClick();                                      // entre dans le studio (fondu 150 ms)
  });
  await wait(SETTLE);                                        // studio STABILISÉ (applyScreen a déjà repositionné le pied)
  const inStudio = await p.evaluate(() => {
    const s = document.getElementById('screen-studio');
    const f = document.getElementById('studioFoot');
    return { active: !!(s && s.classList.contains('active')), footDisplay: f ? getComputedStyle(f).display : 'none' };
  });
  if (!inStudio.active || inStudio.footDisplay === 'none'){
    fails.push(`A/ studio non atteint ou pied masqué (active=${inStudio.active}, footDisplay=${inStudio.footDisplay}) — setup KO`);
  } else {
    /* ⚠️ CE TEST MESURAIT LE MÉCANISME, PAS LE RÉSULTAT — et c'est la faute qui revient tout au long
       de ce fichier. Il exigeait « translateY ≈ 0 » : une valeur INTERNE, qui ne dit rien de ce que le
       client voit. Le jour où l'on retire la compensation (le pied n'a plus AUCUN transform, et c'est
       le but), il aurait rougi alors que le pied était parfait — ou l'inverse.
       Ce qui compte, et la seule chose qui compte : LE PIED EST-IL VISIBLE ET CLIQUABLE EN BAS ?
       On le mesure comme le client le vit : sa boîte est-elle dans le viewport, et le tap atterrit-il
       SUR le bouton (elementFromPoint) — pas sur ce qui serait posé par-dessus. */
    const pied = async (quand) => {
      const r = await p.evaluate(() => {
        const f = document.getElementById('studioFoot');
        if (!f) return { absent: true };
        const b = f.getBoundingClientRect();
        const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
        const cta = f.querySelector('.btn:not(.btn--ghost)') || f.querySelector('.btn');
        let touche = null, sousLeDoigt = '';
        if (cta){
          const c = cta.getBoundingClientRect();
          const el = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
          touche = !!(el && (el === cta || cta.contains(el)));
          sousLeDoigt = el ? (el.id || el.className || el.tagName) : '(rien)';
        }
        return { hautPied: Math.round(b.top), basPied: Math.round(b.bottom), hauteurVisible: Math.round(vh),
                 debordeEnBas: Math.round(b.bottom - vh), touche, sousLeDoigt };
      });
      if (r.absent){ fails.push(`A/ ${quand} : le pied a disparu du DOM`); return; }
      // Visible : sa boîte tient dans ce que l'œil voit (tolérance 4px — arrondis de sous-pixel).
      if (r.debordeEnBas > 4)
        fails.push(`A/ ${quand} : le pied DÉBORDE de ${r.debordeEnBas}px sous la zone visible (bas=${r.basPied}, visible=${r.hauteurVisible}) — le client ne le voit pas`);
      if (r.hautPied > r.hauteurVisible)
        fails.push(`A/ ${quand} : le pied est ENTIÈREMENT hors écran (haut=${r.hautPied} > visible=${r.hauteurVisible})`);
      // Cliquable : le tap au centre du CTA atterrit bien SUR le CTA.
      if (r.touche === false)
        fails.push(`A/ ${quand} : le CTA n'est pas cliquable — un tap en son centre atterrit sur « ${r.sousLeDoigt} »`);
    };

    await pied('au repos');

    /* Retour au premier plan (rotation, focus, visibilitychange) : le pied doit rester visible et
       cliquable À TRAVERS ces événements.
       ⚠️ CE TEST INJECTAIT UN `translateY(-400px)` « PÉRIMÉ » ET EXIGEAIT QU'ON LE RATTRAPE. C'était
          la version « mécanisme » : elle simulait un état que le code ne peut PLUS produire — le
          transform n'est posé que clavier ouvert, et focusout l'efface. Tester un état injoignable,
          c'est exactement la fixture `theme:''` de ce matin : le test devient un rituel qui prouve que
          la machinerie tourne, pas que le client voit son bouton. L'injection est retirée avec la
          machinerie qu'elle testait.
       ⚠️ HONNÊTETÉ SUR LA PORTÉE : en Chrome headless il n'y a pas de barres Safari, donc ces trois
          événements ne bougent rien ici. Ce passage est un test de FUMÉE — il attrape une régression
          grossière (pied disparu, CTA recouvert), pas un bug de géométrie iOS. Celui-là ne se prouve
          que sur un vrai iPhone. */
    for (const evt of ['orientationchange', 'focus', 'visibilitychange']){
      await p.evaluate((name) => {
        if (name === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
        else window.dispatchEvent(new Event(name));
      }, evt);
      await wait(400);
      await pied(`après '${evt}'`);
    }

    /* ── LE SCROLL NE DOIT PLUS RIEN BOUGER — le symptôme terrain : le pied se DÉTACHE au scroll ──
       ⚠️ CHROME HEADLESS N'A PAS LES BARRES DE SAFARI. `overlap` y vaut TOUJOURS 0 → le test passait
          au vert quelle que soit la logique : il ne pouvait pas voir le bug. On SIMULE donc la seule
          chose qui compte : un layout viewport PLUS HAUT que la zone visible — exactement ce que
          produit une barre iOS dépliée. Sans cette simulation, ce garde-fou serait décoratif. */
    const bougeSurResize = await p.evaluate(async () => {
      const foot = document.getElementById('studioFoot');
      const vraiClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
      const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      // Barre de Safari dépliée : le layout dépasse la zone visible de 56px.
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => vh + 56 });
      const avant = foot.getBoundingClientRect().top;
      if (window.visualViewport) window.visualViewport.dispatchEvent(new Event('resize'));
      await new Promise(r => setTimeout(r, 250));
      const apres = foot.getBoundingClientRect().top;
      // On rend le DOM tel qu'on l'a trouvé, sinon tout ce qui suit mesure faux.
      delete document.documentElement.clientHeight;
      if (vraiClientHeight) Object.defineProperty(document.documentElement, 'clientHeight', vraiClientHeight);
      studioFootViewport();
      return { avant: Math.round(avant), apres: Math.round(apres), ecart: Math.round(Math.abs(apres - avant)) };
    });
    /* ⚠️ RÉÉCRIT AU BOUT 8 : cette assertion exigeait que le pied NE BOUGE PAS quand les barres se déplient.
       Le code l'a rétablie le 03/08/2026 sur constat iPhone réel (cf. « LE PIED SUIT LE VIEWPORT VISIBLE ») :
       barres dépliées, le pied DOIT remonter de leur hauteur, sinon il tombe sous l'écran. La sonde, elle,
       était restée sur le pari perdu — et rouge depuis (studioFootKeyboard n'existait plus). */
    if (Math.abs(bougeSurResize.ecart - 56) > 2)
      fails.push(`A/ barres de Safari dépliées (56 px) : le pied a bougé de ${bougeSurResize.ecart}px (${bougeSurResize.avant} → ${bougeSurResize.apres}) au lieu de les compenser (56) — il tomberait sous la zone visible`);

    /* ── LE CONTRE-TEST, ET IL EST INDISPENSABLE ────────────────────────────────────────────────
       Sans lui, « le pied ne bouge jamais » se satisferait d'un code qui a supprimé TOUTE compensation
       — et le clavier iOS recouvrirait le CTA sans que rien ne rougisse. On exige donc l'inverse aussi :
       clavier OUVERT → le pied EST remonté. Les deux assertions se tiennent par les épaules : l'une
       interdit de bouger pour rien, l'autre oblige à bouger quand il le faut. */
    const clavier = await p.evaluate(async () => {
      const foot = document.getElementById('studioFoot');
      const vraiCH = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
      const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
      // Clavier iOS monté : il mange ~300px sous la zone visible.
      Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => vh + 300 });
      const avant = foot.getBoundingClientRect().top;
      const champ = document.getElementById('caption') || document.querySelector('#studio-unlocked input, #studio-unlocked textarea');
      if (!champ){ return { pasDeChamp: true }; }
      champ.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      const apres = foot.getBoundingClientRect().top;
      /* Le clavier se FERME : la géométrie revient (layout == visible) PUIS focusout arrive. Garder la fausse
         hauteur pendant le focusout simulait un clavier resté ouvert — la compensation avait raison de rester. */
      delete document.documentElement.clientHeight;
      if (vraiCH) Object.defineProperty(document.documentElement, 'clientHeight', vraiCH);
      champ.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await new Promise(r => setTimeout(r, 450));
      const apresFermeture = foot.getBoundingClientRect().top;
      studioFootViewport();
      return { remonte: Math.round(avant - apres), revenu: Math.round(Math.abs(apresFermeture - avant)) };
    });
    if (clavier.pasDeChamp)      fails.push('A/ aucun champ de saisie trouvé dans le studio — le cas clavier ne peut pas être prouvé (setup KO)');
    else {
      if (clavier.remonte < 200) fails.push(`A/ CLAVIER OUVERT : le pied n'est remonté que de ${clavier.remonte}px (attendu ~300) — le clavier le recouvrirait`);
      if (clavier.revenu > 2)    fails.push(`A/ après fermeture du clavier, le pied n'est pas revenu à sa place (écart ${clavier.revenu}px)`);
    }
  }

  /* ── LE THÈME « FOURNÉE », TROUVÉ PAR LA DONNÉE ────────────────────────────────────────────────
     Le chemin qui porte le bug de Masa est celui d'un thème adossé à un bloc de type `produits`
     (prérempli à la SÉLECTION du thème), par opposition à la carte (préremplie au boot).
     ⚠️ Son id n'est PAS écrit en dur : « sassy-dujour » est le vocabulaire du master ; chez un fork
     la fournée s'appelle autrement. On le déduit de la config, comme le fait le code lui-même. */
  const FOURNEE = await p.evaluate(() => {
    const t = (sassyData.themes || []).find(t => t.prefill &&
      tousLesBlocs().some(b => b.type === 'produits' && b.cle === t.prefill));
    return t ? { id: t.id, prefill: t.prefill } : null;
  });
  if (!FOURNEE) fails.push('setup/ aucun thème adossé à un bloc `produits` dans la config — B3 ne pourrait rien prouver');

  // ── B. Reprise DIRECTE : un vrai brouillon → on revient LÀ OÙ on l'a laissé (plus de bandeau) ──
  /* ⚠️ LE THÈME DU BROUILLON EST UN VRAI THÈME, et c'est un correctif : la fixture portait `theme: ''`,
     un état INJOIGNABLE (un brouillon est toujours enregistré avec le thème courant). Conséquence :
     restoreStudioDraft ne mettait rien en attente, renderCustomThemes sélectionnait le thème par
     DÉFAUT, et son prérempli ÉCRASAIT les plats du brouillon — la légende partait avec. Le test
     passait quand même, par accident : la ligne de base tenait le brouillon, et l'écart « travail »
     détecté était le prérempli de la carte. Bref, il applaudissait pendant qu'un vrai brouillon
     mourait. Avec un vrai thème, la card existe → le brouillon est rejoué → il SURVIT. */
  await p.evaluate((themeId) => localStorage.setItem('lelab_studio_draft', JSON.stringify({
    theme: 'custom:' + themeId, kind: 'typo', fmt: 'portrait', step: 3, caption: 'Fournée du matin',
    dishes: [{ n: 'Pain de campagne', p: '4,50', c: '' }]
  })), FOURNEE ? FOURNEE.id : '');
  await p.reload({ waitUntil: 'networkidle0' });             // boot : restoreStudioDraft restaure + pose studioResumeStep
  const bb = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    studioReady = true;
    handlePlusClick();                                       // retour → reprise DIRECTE (pas de question)
    return {
      step: currentStep, detailsStep: stepNum('page'),
      bannerGone: !document.getElementById('resumeBanner'),  // le bandeau doit avoir DISPARU du DOM
      canReset: document.body.classList.contains('studio-canreset'),
      // Le CONTENU du brouillon : reprendre à la bonne étape sur du contenu ÉCRASÉ, ce n'est pas reprendre.
      plats: [...document.querySelectorAll('#dishEdit .dish-row')].map(r => (r.querySelector('.d-name') || {}).value),
      caption: (document.getElementById('caption') || {}).value
    };
  });
  /* ⚠️ L'ÉTAPE EXACTE, pas « ≥ le visuel ». Le brouillon dit step:3 → on revient À 3 (trois pas depuis le bout 8). Un simple
     « ≥ détails » laissait passer studioResumeStep cassé (retomber à 3 satisfaisait le test) : le
     client repartait à la saisie au lieu de sa légende. « Reprendre » veut dire LÀ OÙ JE L'AI LAISSÉ. */
  if (bb.step !== 3)            fails.push(`B/ reprise au pas ${bb.step} au lieu de 3 (le pas LAISSÉ — « reprendre » n'est pas « revenir vaguement dans le coin »)`);
  if (bb.step < bb.detailsStep) fails.push(`B/ reprise NON directe : atterri à l'étape ${bb.step} (< détails ${bb.detailsStep})`);
  if (!bb.bannerGone)          fails.push('B/ bandeau de reprise encore dans le DOM (devait être supprimé)');
  if (!bb.canReset)            fails.push('B/ « Recommencer » indisponible alors qu\'on a repris un brouillon');
  // ⚠️ LE BROUILLON DOIT AVOIR SURVÉCU — le prérempli d'un thème ne doit JAMAIS écraser du travail.
  /* ⚠️ RÉÉCRIT AU BOUT 8 — obsolète depuis le bout 5 : le studio LIT les plats dans leur source, il ne restaure
     plus ceux d'un brouillon (une carte d'avant-hier qu'on ne pourrait même plus corriger ici). On exige donc
     les produits DISPONIBLES de la source, pas ceux du brouillon. */
  const platsSource = src => (JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '_data', src + '.json'), 'utf8')) || [])
    .filter(x => x && x.nom && x.dispo !== false).map(x => x.nom);
  const attendus = FOURNEE ? platsSource(FOURNEE.prefill) : [];
  if (bb.plats.join('|') !== attendus.join('|'))
    fails.push(`B/ le studio repris ne lit pas les plats de leur source : [${bb.plats.join(' | ')}] (attendu [${attendus.join(' | ')}])`);
  if (bb.caption !== 'Fournée du matin')
    fails.push(`B/ la légende du brouillon a été perdue : « ${bb.caption} » (attendu « Fournée du matin »)`);

  // ── B2. SEUIL = LE TRAVAIL SAISI, JAMAIS L'ÉTAPE. Étape 3 sans saisie → pas de Recommencer ;
  //        dès qu'un champ libre (légende) porte du contenu → Recommencer apparaît. ──
  const b2 = await p.evaluate(() => {
    if (typeof studioReset === 'function') studioReset();       // repartir d'un studio VIERGE
    handlePlusClick();
    goStep(stepNum('page'));                                    // au visuel (pas 2), SANS rien saisir
    const step3NoWork = document.body.classList.contains('studio-canreset');
    const rowHidden = getComputedStyle(document.querySelector('.studio-tete .studio-reset-link')).display === 'none';   // 28/10 : à côté du retour
    const cap = document.getElementById('caption');
    if (cap) cap.value = 'Fournée du matin';                    // un champ LIBRE = travail incontestable
    renderStudio();                                             // rafraîchit refreshStudioCanReset
    const withWork = document.body.classList.contains('studio-canreset');
    return { step3NoWork, rowHidden, withWork };
  });
  if (b2.step3NoWork || !b2.rowHidden) fails.push('B2/ « Recommencer » présent à l\'étape 3 SANS saisie (le seuil doit être le TRAVAIL, pas l\'étape atteinte)');
  if (!b2.withWork)                    fails.push('B2/ « Recommencer » absent malgré un contenu saisi (doit apparaître)');

  // ── B3. Le PRÉREMPLI n'est pas du travail — DANS LE VRAI PARCOURS. ──────────────────────────────
  /* ⚠️ CE TEST NE DOIT JAMAIS APPELER studioReset(). Le client ARRIVE sur l'écran, il ne « recommence »
     pas : studioReset() vide la liste, ce qui fait tomber le prérempli DANS nextStep — le seul cas où
     le recalage de studioDefaults se déclenche. L'ancien B3 fabriquait ainsi les conditions de son
     propre succès : vert avant le fix comme après, aveugle au bug qu'il prétendait garder.
     On teste donc le GESTE RÉEL de Masa : arriver (thème par défaut déjà prérempli au boot), puis
     choisir la FOURNÉE — un bloc `produits`, dont le prérempli tombe à la sélection du thème. */
  await p.evaluate(() => localStorage.clear());                 // aucun brouillon : on teste l'ARRIVÉE nue
  await p.reload({ waitUntil: 'networkidle0' });
  const b3 = await p.evaluate(async (themeId) => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    studioReady = true;
    handlePlusClick();                                          // ARRIVÉE — rien saisi, jamais
    const arriveeStudio = document.body.classList.contains('studio-canreset');
    const card = document.querySelector('.lelab-card[data-theme="custom:' + themeId + '"]');
    if (!card) return { noCard: true };
    selectTheme(card, false);                                   // le geste de Masa : choisir la fournée (bloc `produits`)
    const apresChoixTheme = document.body.classList.contains('studio-canreset');
    let g = 0; while (currentStepId() !== 'page' && g++ < 6) nextStep();
    const arriveeDetails = document.body.classList.contains('studio-canreset');
    const rows = document.querySelectorAll('#dishEdit .dish-row');
    /* ⚠️ Depuis le bout 5 les plats sont LUS (lecture seule) : les modifier n'est plus un geste du studio.
       Le travail incontestable est un champ libre — la légende. */
    const cap = document.getElementById('caption');
    if (cap){ cap.value = 'MODIF'; renderStudio(); }
    return { arriveeStudio, apresChoixTheme, arriveeDetails,
             apresModif: document.body.classList.contains('studio-canreset'), nbRows: rows.length };
  }, FOURNEE ? FOURNEE.id : '');
  if (b3.noCard)          fails.push('B3/ card du thème « fournée » (custom:sassy-dujour) introuvable — setup KO');
  else {
    if (!b3.nbRows)       fails.push('B3/ aucun plat prérempli sur le chemin `produits` — le test ne prouverait rien (setup KO)');
    if (b3.arriveeStudio) fails.push('B3/ « Recommencer » dès l\'ARRIVÉE au studio, rien saisi (le prérempli du thème par défaut n\'est pas du travail)');
    if (b3.apresChoixTheme) fails.push('B3/ « Recommencer » après le seul CHOIX du thème fournée (choisir un thème n\'est pas travailler — la ligne de base doit suivre le prérempli)');
    if (b3.arriveeDetails)  fails.push('B3/ « Recommencer » à l\'arrivée étape 3 avec le PRÉREMPLI de la fournée (bloc `produits` — le chemin de Masa)');
    if (!b3.apresModif)     fails.push('B3/ « Recommencer » absent après une légende écrite (doit apparaître)');
  }

  // ── B4. SORTIR SANS RIEN MODIFIER → REVENIR → ÉTAPE 1. ─────────────────────────────────────────
  //    Le pendant exact de B : B garde la reprise d'un VRAI travail, B4 garde le fait qu'on ne
  //    reprend PAS ce qui n'en est pas. Le code le fait (handlePlusClick → !studioHasWork →
  //    goStep(studioMinStep)), mais rien ne l'affirmait : un comportement non testé finit par régresser.
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  const b4 = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    studioReady = true;
    handlePlusClick();
    let g = 0; while (currentStepId() !== 'page' && g++ < 6) nextStep();      // jusqu'au visuel, SANS rien modifier
    const stepAvantSortie = currentStep;
    saveStudioDraft();                                          // ce que fait la sortie : rien saisi → doit PURGER, pas écrire
    applyScreen('home');                                        // sortie vers l'Accueil
    const draftApresSortie = localStorage.getItem('lelab_studio_draft');
    handlePlusClick();                                          // retour via « Publier »
    return { stepAvantSortie, stepRetour: currentStep, minStep: studioMinStep(), draftApresSortie };
  });
  if (b4.stepAvantSortie < 2)              fails.push(`B4/ setup KO : pas monté jusqu'à la saisie avant de sortir (étape ${b4.stepAvantSortie})`);
  if (b4.draftApresSortie !== null)        fails.push('B4/ un brouillon a été ÉCRIT en sortant sans rien modifier (le prérempli n\'est pas du travail → rien à sauver)');
  if (b4.stepRetour !== b4.minStep)        fails.push(`B4/ retour à l'étape ${b4.stepRetour} après une sortie SANS travail (attendu ${b4.minStep} — on ne reprend que du VRAI travail)`);

  // ── B5. BROUILLON « PLATS SEULS » (sans légende) → reprise à l'étape laissée. LE CAS BENOÎT. ──
  /* Une fournée, c'est des PRODUITS et rien d'autre : le boulanger n'écrit pas de légende. Ce
     brouillon-là ne portait AUCUN des champs libres (caption/infos/story) que studioHasWork teste en
     premier — il ne tenait donc qu'à la comparaison plats vs ligne de base. Or la base avalait le
     brouillon restauré → il s'égalait lui-même → « aucun travail » → retour à l'étape 1, brouillon
     perdu à chaque sortie. Le master n'a jamais vu ce bug : ses fixtures portent toutes une légende. */
  await p.evaluate((themeId) => {
    localStorage.clear();
    localStorage.setItem('lelab_studio_draft', JSON.stringify({
      theme: 'custom:' + themeId, kind: 'typo', fmt: 'portrait', step: 3,
      dishes: [{ n: 'Pain de campagne', p: '4,50', c: '' }, { n: 'Fougasse aux olives', p: '3,80', c: '' }]
    }));   // ⚠️ AUCUNE légende, volontairement : c'est tout l'objet du test.
  }, FOURNEE ? FOURNEE.id : '');
  await p.reload({ waitUntil: 'networkidle0' });
  const b5 = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    studioReady = true;
    handlePlusClick();
    return { step: currentStep, detailsStep: stepNum('page'),
             plats: [...document.querySelectorAll('#dishEdit .dish-row')].map(r => (r.querySelector('.d-name') || {}).value),
             canReset: document.body.classList.contains('studio-canreset') };
  });
  if (b5.step < b5.detailsStep)
    fails.push(`B5/ brouillon PLATS SEULS non repris : atterri à l'étape ${b5.step} (< détails ${b5.detailsStep}) — le travail du boulanger est perdu`);
  else if (b5.step !== 3)
    fails.push(`B5/ brouillon PLATS SEULS repris au pas ${b5.step} au lieu de 3 (le pas laissé)`);
  if (b5.plats.join('|') !== attendus.join('|'))
    fails.push(`B5/ les plats du brouillon « plats seuls » ont disparu : [${b5.plats.join(' | ')}]`);
  if (!b5.canReset)
    fails.push('B5/ « Recommencer » indisponible sur un brouillon PLATS SEULS repris (c\'est bien du travail)');

  // ── C. SLIDER VERROUILLÉ par défaut : l'éditeur Photos ne montre le slider que si ON ──────────
  //    Le slider (le hero) est du gabarit DA, pas du contenu client. On teste les DEUX états en
  //    mémoire (config mutée), indépendamment du config.json du repo servi.
  const c = await p.evaluate(() => {
    const bloc = (typeof blocDeLEcran === 'function') ? blocDeLEcran('photos') : null;
    if (!bloc || !bloc.admin) return { noBloc: true };
    bloc.admin.sliderEditable = false; openEdit('photos');
    const off = { slider: !!document.getElementById('photos-slider'), galerie: !!document.getElementById('photos-galerie') };
    bloc.admin.sliderEditable = true;  openEdit('photos');
    const on  = { slider: !!document.getElementById('photos-slider'), galerie: !!document.getElementById('photos-galerie') };
    return { off, on };
  });
  if (c.noBloc) fails.push('C/ bloc photos introuvable dans la config — setup KO');
  else {
    if (c.off.slider)   fails.push('C/ slider présent dans l\'éditeur alors que sliderEditable=OFF (gabarit DA non protégé)');
    if (!c.off.galerie) fails.push('C/ galerie absente en OFF (elle doit TOUJOURS rester éditable)');
    if (!c.on.slider)   fails.push('C/ slider absent alors que sliderEditable=ON (éditeur cassé)');
  }

  // ── D. LA LÉGENDE : ÉCRITE À L'ARRIVÉE AU PAS 3, UNE FOIS, JAMAIS PAR-DESSUS LE CLIENT (bout 8) ──
  /* ⚠️ RÉÉCRIT AU BOUT 8. L'ancien D exigeait « IA sur clic, plus d'auto » : LELAB-DESIGN §5 point 4 dit
     désormais « Et la légende. Écrite pour vous, à relire », avec « Une autre / Plus court / Modifier ».
     Ce qui reste vrai, et qu'on garde : rien ne s'écrit AILLEURS qu'au pas de la légende, on n'écrase jamais
     un texte du client, « Mettre en forme » pour l'annonce, les hashtags fantômes sont inertes.
     Les appels à generate-caption sont COMPTÉS (interception) : on mesure le réseau, pas une variable. */
  appelsLegende.length = 0;
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  const d = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData(); applyPlan('lelab_plus'); studioReady = true; window.__LELAB_TEMPS = 0.02;
    handlePlusClick();
    const attendre = ms => new Promise(r => setTimeout(r, ms));
    const label = id => ((document.getElementById(id) || {}).querySelector ? (document.getElementById(id).querySelector('.ia-btn-txt') || {}).textContent : '') || '';
    nextStep(); await attendre(300);                               // pas 2 : rien ne doit s'écrire
    const auPas2 = (document.getElementById('caption') || {}).value || '';
    nextStep(); await attendre(2500);                              // pas 3 : la légende s'écrit, une fois
    const auPas3 = (document.getElementById('caption') || {}).value || '';
    const gestes = [...document.querySelectorAll('#legChips .leg-chip')].map(c => c.textContent.trim());
    document.querySelector('#legChips [data-geste="court"]').click(); await attendre(2500);
    const apresCourt = (document.getElementById('caption') || {}).value || '';
    // Le client écrit : revenir au pas 2 puis au 3 ne réécrit rien.
    document.querySelector('#legChips [data-geste="modifier"]').click();
    const modifiable = !document.getElementById('caption').readOnly;
    document.getElementById('caption').value = 'TEXTE DU CLIENT'; renderStudio();
    prevStep(); await attendre(200); nextStep(); await attendre(1200);
    const apresRetour = (document.getElementById('caption') || {}).value || '';
    if (typeof applyInfosVariant === 'function') applyInfosVariant(true);   // mode ANNONCE
    const inf = document.getElementById('infosText'); if (inf) inf.value = '';
    refreshIaButtons(); const annonceLabel = label('iaBtnInfos');
    studioHashtags = []; renderHashtagsRow();
    const ghost = document.querySelector('#hashtags .htag.ghost');
    return { auPas2, auPas3, gestes, apresCourt, modifiable, apresRetour, annonceLabel,
             hasGhost: !!ghost, ghostClickable: ghost ? !!ghost.getAttribute('onclick') : false };
  });
  if (d.auPas2)                               fails.push(`D/ une légende s'est écrite dès le pas 2 (« ${d.auPas2} ») — elle appartient au pas 3`);
  if (!/^LÉGENDE-SONDE 1$/.test(d.auPas3))     fails.push(`D/ arrivée au pas 3 : légende « ${d.auPas3} » (attendu la 1re légende écrite pour le client)`);
  if (d.gestes.join('|') !== 'Une autre|Plus court|Modifier') fails.push(`D/ gestes de la légende : « ${d.gestes.join(' | ')} » (attendu Une autre · Plus court · Modifier)`);
  if (!appelsLegende[1] || appelsLegende[1].court !== true) fails.push('D/ « Plus court » n\'a pas envoyé la consigne court:true à generate-caption');
  if (!/^LÉGENDE-SONDE 2$/.test(d.apresCourt)) fails.push(`D/ après « Plus court » : « ${d.apresCourt} » (attendu la 2e légende)`);
  if (!d.modifiable)                          fails.push('D/ « Modifier » ne rend pas la légende modifiable');
  if (d.apresRetour !== 'TEXTE DU CLIENT')    fails.push(`D/ revenir au pas 3 a réécrit le texte du client (« ${d.apresRetour} ») — jamais par-dessus le client`);
  if (appelsLegende.length !== 2)             fails.push(`D/ ${appelsLegende.length} appels à generate-caption pour 1 arrivée + 1 « Plus court » (attendu 2)`);
  if (!d.annonceLabel.startsWith('Mettre en forme')) fails.push(`D/ annonce : « ${d.annonceLabel} » (attendu « Mettre en forme avec l'IA » — « Rédiger » mentirait)`);
  if (d.hasGhost && d.ghostClickable)         fails.push('D/ hashtag fantôme cliquable (doit être inerte)');

  // ── E. LE COMPTE INSTAGRAM : AUCUN BOUTON TANT QUE L'APP META EST EN DÉVELOPPEMENT (27/10, bout 8) ──
  /* ⚠️ RÉÉCRIT AU BOUT 8. L'ancien E exigeait « Connecter » et « Déconnecter » atteignables : décision du 27/10,
     l'app Meta ne publie que pour les comptes testeurs, donc la connexion reste dans le code SANS BOUTON.
     Ce qui reste vrai, et qu'on garde : l'aperçu dit la vérité du compte (pseudo réel connecté, jamais un faux
     « votre_compte »), aucune image distante au repos ni après déconnexion, aucune image distante en dur. */
  const e = await p.evaluate(() => {
    const vu = el => { if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const actions = re => [...document.querySelectorAll('a,button')].some(el => vu(el) && re.test(el.textContent.trim()) && !el.closest('.confirm-overlay'));
    const lire = () => ({
      connecter: actions(/^connecter|connectez|reconnecter/i), deconnecter: actions(/d[ée]connecter/i),
      sortie: vu(document.getElementById('studioRetour')),
    });
    goStep(1);
    const out = { neuf: lire() };
    igStatus = { connected: true, username: 'lestud13', user_id: '1', profile_picture_url: 'https://example.invalid/a.jpg' };
    syncPreviewIdentity(); out.on = lire();
    igStatus = { connected: false, username: null };
    syncPreviewIdentity(); out.off = lire();
    return out;
  });
  for (const [k, v] of Object.entries({ neuf: e.neuf, connecte: e.on, deconnecte: e.off })){
    if (v.connecter)   fails.push(`E/ ${k} : un « Connecter » est atteignable dans le studio (l'app Meta est en développement : pas de bouton)`);
    if (v.deconnecter) fails.push(`E/ ${k} : un « Déconnecter » est atteignable dans le studio (pas de bouton tant que l'app n'est pas en Live)`);
    if (!v.sortie)     fails.push(`E/ ${k} : le retour vers Mon site n'est pas visible au pas 1`);
  }
  /* ⚠️ LE CADRE INSTAGRAM (28/10, maquette) : sur téléphone, le pas 2 montre le VISUEL SEUL ; sur desktop, un POST
     porte le cadre (pseudo, image, icônes, légende). On le vérifie aux deux largeurs : la sonde passe à 1280 le
     temps de lire le cadre, puis revient à 390. Ce qu'il dit du compte : le pseudo réel connecté, le nom du commerce
     sinon — jamais un faux « votre_compte » — et aucune image distante au repos ni après déconnexion. */
  const cadreTel = await p.evaluate(() => { goStep(2);
    return ['.ig-top', '.ig-actions', '.ig-likes', '.ig-cap'].filter(q => { const el = document.querySelector('#apercu ' + q); return el && el.getBoundingClientRect().height > 0; }); });
  if (cadreTel.length) fails.push(`E/ téléphone, pas 2 : un cadre Instagram est visible (${cadreTel.join(', ')}) — attendu : le visuel seul`);
  /* ⚠️ Une PAGE À PART pour le desktop : changer isMobile sur `p` la recharge (Puppeteer), et le studio n'y serait plus. */
  const pd = await b.newPage();
  await pd.setViewport({ width: 1280, height: 900 });
  await pd.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });
  await pd.goto(`http://localhost:${PORT}/admin/`, { waitUntil: 'networkidle0' });
  const ed = await pd.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData(); applyPlan('lelab_plus'); studioReady = true; handlePlusClick();
    await new Promise(r => setTimeout(r, 400));
    const f = document.querySelector('#fmtRow .fmt[data-fmt="portrait"]'); if (f) f.click();
    goStep(2);
    const lire = () => ({
      cadre: ['.ig-top', '.ig-actions', '.ig-likes', '.ig-cap'].filter(q => { const el = document.querySelector('#apercu ' + q); return el && el.getBoundingClientRect().height > 0; }).length,
      nom: (document.querySelector('#apercu .ig-name') || {}).textContent || '',
      nomLegende: (document.getElementById('igCapName') || {}).textContent || '',
      point: !!document.querySelector('#apercu .ig-name .ig-live-d'),
      avatar: getComputedStyle(document.querySelector('#apercu .ig-ava > div')).backgroundImage,
    });
    const out = { neuf: lire() };
    igStatus = { connected: true, username: 'lestud13', user_id: '1', profile_picture_url: 'https://example.invalid/a.jpg' };
    syncPreviewIdentity(); out.on = lire();
    igStatus = { connected: false, username: null };
    syncPreviewIdentity(); out.off = lire();
    out.commerce = (sassyData.config && sassyData.config.commerce && sassyData.config.commerce.nom) || '';
    return out;
  });
  await pd.close();
  /* 3 parties sans légende (en-tête, icônes, « À l'instant ») : la carte s'arrête là tant qu'il n'y a pas de légende. */
  if (ed.on.cadre < 3)                          fails.push(`E/ desktop, Post : le cadre Instagram n'est pas complet (${ed.on.cadre} parties visibles sur 3 au moins)`);
  if (!/lestud13/.test(ed.on.nom) || !ed.on.point) fails.push(`E/ desktop connecté : l'aperçu ne porte pas le pseudo réel avec son point (« ${ed.on.nom} »)`);
  if (!/lestud13/.test(ed.on.nomLegende))         fails.push(`E/ desktop connecté : la légende de l'aperçu ne porte pas le pseudo réel (« ${ed.on.nomLegende} »)`);
  if (ed.off.nom.trim() !== ed.commerce)          fails.push(`E/ desktop déconnecté : l'aperçu dit « ${ed.off.nom} » au lieu du nom du commerce (« ${ed.commerce} »)`);
  if (/votre_compte/.test(ed.off.nomLegende + ed.neuf.nom)) fails.push(`E/ desktop : un faux pseudo « votre_compte » est affiché`);
  /* ⚠️ « Distante » = hors de l'origine du site. Le navigateur rend le logo LOCAL du commerce (28/10) en adresse
     complète (http://localhost:…/assets/logos/…) : un /http/ seul le prenait pour une image distante. */
  const distante = u => [...String(u || '').matchAll(/url\("?([^")]+)"?\)/g)].some(m => /^https?:/i.test(m[1]) && !m[1].startsWith(`http://localhost:${PORT}/`));
  if (distante(ed.neuf.avatar)) fails.push(`E/ l'avatar de l'aperçu porte une image DISTANTE au repos : ${ed.neuf.avatar}`);
  if (distante(ed.off.avatar))  fails.push(`E/ l'avatar garde une photo DISTANTE après déconnexion : ${ed.off.avatar}`);

  /* ── E-bis. AUCUNE IMAGE DISTANTE EN DUR DANS LA SOURCE (lu dans le FICHIER, pas le DOM) ── */
  const CDN_LEGITIMES = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /www\.w3\.org/,
                         /www\.instagram\.com\/oauth/, /maps\.google\.com/];
  const srcAdmin = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin', 'index.html'), 'utf8');
  const imgsDistantes = [...srcAdmin.matchAll(/url\(\s*['"]?(https?:\/\/[^'")\s]+)/g)]
    .map(m => m[1]).filter(u => !CDN_LEGITIMES.some(re => re.test(u)));
  if (imgsDistantes.length)
    fails.push(`E/ image DISTANTE en dur dans la SOURCE de l'admin : ${[...new Set(imgsDistantes)].join(' · ')}`);

  /* ── F. LE SITE PUBLIC EST ATTEIGNABLE DEPUIS L'ACCUEIL ───────────────────────────────────────
     Le client veut VOIR son site, pas seulement le modifier. Le lien existait — au bas de « Mon site »,
     donc DERRIÈRE le geste « modifier ». Il vit désormais sur l'accueil.
     ⚠️ On vérifie aussi qu'il ne montre PAS l'adresse d'hébergeur par défaut : « bistrot-sassy.netlify.app »
        n'est pas l'adresse que le client donne à ses clients (même famille que l'ID Meta retiré). */
  /* ⚠️ On repart d'une page NEUVE : les sections précédentes laissent le studio ouvert (body.in-studio),
     et l'accueil y est replié — le lien existait mais mesurait 0×0. On teste le vrai geste : le client
     ARRIVE sur son accueil. (Première version : `applyScreen('dashboard')` sur la page polluée → le test
     annonçait « aucun lien » alors que le lien était juste caché par l'état laissé par le test d'avant.) */
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle0' });
  const f = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    applyPlan('lelab_plus');
    applyScreen('dashboard');
    await new Promise(r => setTimeout(r, 300));
    const vu2 = el => { if (!el) return false; const r = el.getBoundingClientRect();
                        return getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const a = document.getElementById('dashSiteLink');
    const out = { present: vu2(a), texte: a ? a.textContent.trim() : '', href: a ? a.getAttribute('href') : '',
                  blank: a ? a.getAttribute('target') : '', rel: a ? (a.getAttribute('rel') || '') : '' };
    // Ferré à gauche : son bord gauche s'aligne sur celui des tuiles (pas centré).
    const tiles = document.querySelector('#screen-dashboard .tiles');
    if (a && tiles) out.decalageGauche = Math.round(a.getBoundingClientRect().left - tiles.getBoundingClientRect().left);
    /* Data-driven : un domaine déclaré → l'adresse s'affiche, sans toucher au code.
       ⚠️ On teste l'EXISTENCE avant d'appeler. Sans ce garde, un `syncSiteLinks is not defined` faisait
          EXPLOSER l'evaluate : exception non capturée, script mort, et les sections suivantes JAMAIS
          jouées. Un garde-fou qui plante ne rapporte rien — et masque tout ce qui vient après lui. */
    if (typeof syncSiteLinks !== 'function'){ out.pasDeSync = true; return out; }
    const cfg = sassyData.config.commerce || (sassyData.config.commerce = {});
    cfg.domaine = 'https://bistrot-sassy.fr/';
    syncSiteLinks();
    out.avecDomaine = (document.getElementById('dashSiteLink') || {}).textContent.trim();
    delete cfg.domaine; syncSiteLinks();
    out.sansDomaine = (document.getElementById('dashSiteLink') || {}).textContent.trim();
    return out;
  });
  if (f.pasDeSync)                      fails.push('F/ syncSiteLinks() absente — le libellé du lien n\'est pas piloté par la donnée (une adresse d\'hébergeur finirait en dur)');
  if (!f.present)                       fails.push('F/ aucun lien vers le site public sur l\'accueil (le client ne peut pas VOIR son site)');
  if (f.blank !== '_blank')             fails.push('F/ le lien du site public ne s\'ouvre pas dans un nouvel onglet (le client perdrait son admin)');
  if (!/noopener/.test(f.rel))          fails.push('F/ lien target=_blank sans rel="noopener"');
  if (f.href !== '/')                   fails.push(`F/ le lien pointe sur « ${f.href} » au lieu de « / » (il doit suivre l'origine — un fork n'a rien à éditer)`);
  if (f.decalageGauche > 2)             fails.push(`F/ le lien du site public n'est pas ferré à gauche (décalé de ${f.decalageGauche}px par rapport aux tuiles)`);
  if (!f.pasDeSync && /netlify\.app|\.app\b/.test(f.sansDomaine))
    fails.push(`F/ le lien affiche une adresse d'HÉBERGEUR par défaut (« ${f.sansDomaine} ») — ce n'est pas l'adresse que le client donne à ses clients`);
  if (!f.pasDeSync && f.sansDomaine !== "Voir mon site en ligne ↗")
    fails.push(`F/ libellé par défaut inattendu : « ${f.sansDomaine} »`);
  if (!f.pasDeSync && f.avecDomaine !== "bistrot-sassy.fr ↗")
    fails.push(`F/ domaine propre déclaré → l'adresse doit s'afficher : « ${f.avecDomaine} » (attendu « bistrot-sassy.fr ↗ »)`);

  /* ── G. LE ROND-FLÈCHE DES TUILES RESTE EN BAS À DROITE ───────────────────────────────────────
     Le pied des tuiles est en `flex-wrap` (voulu : la flèche descend plutôt que d'être coupée). Mais
     SEULE sur sa nouvelle ligne, `justify-content:space-between` n'avait plus rien contre quoi répartir
     → elle partait à GAUCHE. Invisible à 390px en taille normale ; bien réel dès que le client agrandit
     le texte de son iPhone. On teste donc les DEUX conditions qui le déclenchent. */
  for (const [larg, zoom] of [[390, 1], [320, 1], [390, 1.5]]){
    await p.setViewport({ width: larg, height: 844, isMobile: true });
    const g = await p.evaluate(async (z) => {
      applyScreen('dashboard');
      document.querySelectorAll('.tile-act').forEach(el => { el.style.fontSize = (17 * z) + 'px'; });
      await new Promise(r => setTimeout(r, 250));
      return [...document.querySelectorAll('#screen-dashboard .tile')].map(t => {
        const fl = t.querySelector('.tile-arrow'), lb = t.querySelector('.tile-act');
        if (!fl || !lb) return null;
        const tr = t.getBoundingClientRect(), fr = fl.getBoundingClientRect(), lr = lb.getBoundingClientRect();
        return { dDroite: Math.round(tr.right - fr.right), dBas: Math.round(tr.bottom - fr.bottom),
                 /* ⚠️ « À 16px du bord » NE SUFFIT PAS — c'est ce qui rendait ce test aveugle au bug vu
                    sur le terrain. Renvoyée à la ligne, la flèche restait à 16px du bord droit ET du bas
                    (donc verte) tout en quittant le COIN : elle se retrouvait SOUS le libellé, sur une
                    ligne à elle. Le client ne mesure pas des marges, il voit une composition. */
                 surSaPropreLigne: fr.top >= lr.bottom - 1,
                 libelleCoupe: lb.scrollWidth > lb.clientWidth + 1 };
      }).filter(Boolean);
    }, zoom);
    if (!g.length) fails.push(`G/ aucune tuile trouvée à ${larg}px — setup KO`);
    g.forEach((t, i) => {
      if (t.dDroite > 24) fails.push(`G/ ${larg}px texte ×${zoom} — tuile ${i + 1} : le rond-flèche est à ${t.dDroite}px du bord DROIT (il doit rester en bas à droite)`);
      if (t.dBas > 24)    fails.push(`G/ ${larg}px texte ×${zoom} — tuile ${i + 1} : le rond-flèche est à ${t.dBas}px du bord BAS`);
      if (t.surSaPropreLigne) fails.push(`G/ ${larg}px texte ×${zoom} — tuile ${i + 1} : le rond-flèche est passé SOUS le libellé, sur une ligne à lui — il a quitté le coin (les marges sont bonnes, la composition non : c'est ce que le client VOIT)`);
      if (t.libelleCoupe)     fails.push(`G/ ${larg}px texte ×${zoom} — tuile ${i + 1} : le LIBELLÉ est coupé (le `+'`nowrap`'+` doit resserrer le texte, pas le tronquer)`);
    });
  }
  await p.setViewport({ width: 390, height: 844, isMobile: true });   // on rend le viewport tel qu'on l'a trouvé

  /* ── G-bis. LE CORRECTIF DU BUG <button>/flex DE SAFARI EST TOUJOURS LÀ ─────────────────────────
     ⚠️ CE CONTRÔLE LIT LA SOURCE, ET IL LE DOIT : Chrome n'a PAS le bug. Mesurer la position de la
        flèche ici serait DÉCORATIF — vert avec le correctif comme sans. C'est précisément ce qui a
        laissé passer le bug pendant des semaines : le harnais mesurait juste, dans un moteur qui
        n'a pas le défaut. On ne peut pas prouver le symptôme sans Safari ; on peut garder la LIGNE
        qui l'empêche, et dire pourquoi.
     LE BUG : Safari ne fait pas d'un <button> un conteneur flex correct — le contenu est enveloppé
     dans une boîte anonyme qui ne s'étire pas → .tile-in se rétrécit → space-between répartit dans
     une boîte trop étroite → la flèche s'arrête au milieu de la tuile. Les tuiles de l'accueil sont
     les SEULES cards de l'app dans un <button> : c'était toute l'asymétrie. */
  const gs = await p.evaluate(() => {
    const t = document.querySelector('#screen-dashboard .tile');
    return { balise: t ? t.tagName : null };
  });
  const regleTileIn = srcAdmin.match(/^\.tile-in\{[^}]*\}/m);
  const regleTileFoot = srcAdmin.match(/^\.tile-foot\{[^}]*\}/m);
  const regleTileArrow = srcAdmin.match(/^\.tile-arrow\{[^}]*\}/m);
  if (!regleTileIn)  fails.push('G/ règle `.tile-in{…}` introuvable dans la source — le garde-fou ne peut rien prouver (setup KO)');
  else if (gs.balise === 'BUTTON' && !/width:\s*100%/.test(regleTileIn[0]))
    fails.push('G/ `.tile` est un <button> mais `.tile-in` ne déclare PLUS `width:100%` — Safari ne l\'étirera pas (son <button> flex enveloppe le contenu dans une boîte anonyme qui ne s\'étire pas) : la flèche repartira au milieu de la tuile, et Chrome ne le verra jamais');
  /* Les deux pansements historiques ne doivent PAS revenir : ils contournaient ce même bug sans le
     nommer. La cause est corrigée — un pansement de plus la re-cacherait. */
  if (regleTileFoot && /flex-wrap:\s*wrap/.test(regleTileFoot[0]))
    fails.push('G/ `flex-wrap:wrap` est revenu sur `.tile-foot` — c\'était un pansement du bug <button>/flex de Safari (il envoyait la flèche sur une ligne à elle). La cause est corrigée dans .tile-in : ne pas la re-cacher');
  if (regleTileArrow && /margin-left:\s*auto/.test(regleTileArrow[0]))
    fails.push('G/ `margin-left:auto` est revenu sur `.tile-arrow` — second pansement du même bug Safari. La flèche est à droite parce que space-between l\'y met, pas parce qu\'on l\'y pousse');

  /* ── G-ter. `-webkit-text-size-adjust` — l'heuristique de gonflage d'iOS reste neutralisée ──────
     Chrome ne gonfle pas : impossible de prouver l'effet ici, comme pour le bug <button>/flex. On
     garde donc LA LIGNE, dans les DEUX fichiers (l'admin ET la vitrine l'avaient absente).
     ⚠️ Ce n'était PAS la cause des flèches (écartée par deux captures d'un iPhone réel : titres de
        même taille). C'est de l'hygiène : sur une app dont la hiérarchie se fait par la taille et la
        graisse, un moteur qui redimensionne certains blocs et pas d'autres la défait en silence. */
  const srcSite = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  for (const [nom, src] of [['admin/index.html', srcAdmin], ['index.html (vitrine)', srcSite]]){
    if (!/-webkit-text-size-adjust:\s*100%/.test(src))
      fails.push(`G/ \`-webkit-text-size-adjust:100%\` absent de ${nom} — Safari iOS gonflera le texte de certains blocs (inégalement), et aucun test local ne peut le voir`);
  }

  /* ── H. LE CTA DE « MON SITE » EST ATTEIGNABLE — et la garde « carte vide » a survécu au déménagement ──
     Le CTA « Publier les modifications » vivait à 2126px du haut : 1422px de scroll, 18 champs. Le client
     pouvait quitter en croyant avoir enregistré. Il vit désormais dans le pied PARTAGÉ (.lelab-foot,
     le même que le studio — pas un second pied).
     ⚠️ Le déménagement a failli tuer une garde EN SILENCE : `refreshMenuEmptyState` cherchait le bouton
        avec `#edit-body .btn-save`. Le bouton étant monté dans le pied (hors de #edit-body), le sélecteur
        renvoie null → plus de désactivation → un client aurait pu publier une CARTE VIDE. Un sélecteur qui
        ne trouve plus rien ne crie pas. Ce test le tient. */
  const h = await p.evaluate(async () => {
    document.body.classList.remove('in-tunnel');
    openEdit('menu');
    await new Promise(r => setTimeout(r, 400));
    const vu3 = el => { if (!el) return false; const r = el.getBoundingClientRect();
                        return getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const foot = document.getElementById('editFoot');
    const btn  = () => document.querySelector('#screen-edit .btn-save');
    const nav  = document.querySelector('.mobile-nav');
    const fr   = foot ? foot.getBoundingClientRect() : null;
    const out = {
      tunnel:        document.body.classList.contains('in-tunnel'),
      navMasquee:    nav ? getComputedStyle(nav).display === 'none' : null,
      ctaDansLePied: !!(foot && btn() && foot.contains(btn())),
      ctaVu:         vu3(btn()),
      ctaSansScroll: fr ? (fr.bottom <= window.innerHeight + 2 && fr.top < window.innerHeight) : false,
      memePied:      !!(foot && foot.classList.contains('lelab-foot')
                        && document.getElementById('studioFoot')
                        && document.getElementById('studioFoot').classList.contains('lelab-foot')),
      avecPlats:     btn() ? btn().disabled : null
    };
    /* ⚠️ MASQUER LA NAV, C'EST FERMER UNE PORTE — il faut donc prouver qu'il en reste une. Le ‹ de la
       tête EST la sortie du tunnel : s'il disparaissait, le client serait enfermé dans un éditeur. */
    const back = document.querySelector('#screen-edit .btn-back');
    out.sortieVue = vu3(back);
    if (back){
      const r = back.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.sortieCliquable = !!(el && (el === back || back.contains(el)));
    }
    /* Le CTA publie POUR DE VRAI quand la carte est pleine — sans ce contre-test, « le bouton est
       désactivé sur carte vide » se satisferait d'un bouton mort en toutes circonstances. */
    let publie = false; const vrai = window.saveSection;
    window.saveSection = function(){ publie = true; };   // intercepté : aucun appel réseau depuis un test
    if (btn()) btn().click();
    await new Promise(r => setTimeout(r, 150));
    window.saveSection = vrai;
    out.clicPublie = publie;

    // ── Puis on vide la carte PAR LE VRAI GESTE (les ✕ du client), pas en retirant des nœuds ──
    let g = 0;
    while (document.querySelector('.menu-item .btn-delete') && g++ < 40){
      document.querySelector('.menu-item .btn-delete').click();
    }
    out.platsRestants = document.querySelectorAll('.menu-item').length;
    out.carteVide = btn() ? btn().disabled : null;
    out.message   = !!document.getElementById('menu-empty-msg');
    // Et le clic ne doit PLUS rien déclencher.
    let publie2 = false; const vrai2 = window.saveSection;
    window.saveSection = function(){ publie2 = true; };
    if (btn()) btn().click();
    await new Promise(r => setTimeout(r, 150));
    window.saveSection = vrai2;
    out.clicPublieVide = publie2;
    return out;
  });
  if (!h.tunnel)        fails.push('H/ éditer une section ne pose pas `in-tunnel` → pas de pied, la nav reste');
  if (!h.navMasquee)    fails.push('H/ la nav du bas est encore là pendant l\'édition (elle vole la place du CTA et propose de partir au milieu d\'un geste)');
  if (!h.ctaDansLePied) fails.push('H/ le CTA « Publier » n\'est pas monté dans le pied — il est resté au fond du formulaire (1422px de scroll)');
  if (!h.ctaVu)         fails.push('H/ le CTA « Publier » n\'est pas visible');
  if (!h.ctaSansScroll) fails.push('H/ le CTA « Publier » n\'est pas atteignable SANS SCROLLER');
  if (!h.memePied)      fails.push('H/ l\'éditeur et le studio n\'utilisent pas LE MÊME pied (.lelab-foot) — deux implémentations du même geste divergent toujours');
  if (h.avecPlats)      fails.push('H/ le CTA est désactivé alors que la carte a des plats');
  if (!h.sortieVue)     fails.push('H/ le ‹ de sortie n\'est pas visible — masquer la nav sans laisser d\'issue ENFERME le client dans l\'éditeur');
  if (h.sortieCliquable === false) fails.push('H/ le ‹ de sortie est visible mais un tap en son centre n\'atterrit pas dessus (le pied ou autre chose le recouvre)');
  if (!h.clicPublie)    fails.push('H/ carte PLEINE : un clic réel sur le CTA ne déclenche PAS la publication (le bouton est mort)');
  if (h.platsRestants)  fails.push(`H/ setup KO : ${h.platsRestants} plat(s) survivent aux ✕ — la garde ne peut pas être prouvée`);
  if (!h.carteVide)     fails.push('H/ CARTE VIDE : le CTA n\'est PAS désactivé — la garde a été tuée par le déménagement du bouton (sélecteur qui ne trouve plus rien)');
  if (h.clicPublieVide) fails.push('H/ CARTE VIDE : un clic réel PUBLIE QUAND MÊME — le client peut mettre en ligne une carte vide');
  if (!h.message)       fails.push('H/ carte vide : le message « Ajoutez au moins un plat pour publier » n\'apparaît pas');

  /* ── I. LE VERBE VIT SUR LA CARD, ET NULLE PART AILLEURS ─────────────────────────────────────
     La card « Mon site » porte un GESTE (« Modifier la carte ») ; l'écran d'édition et ses groupes de
     champs portent le NOM (« La carte »). Deux champs, deux métiers : `action` et `label`.
     ⚠️ LE PIÈGE EST DE N'EN AVOIR QU'UN. `bloc.label` sert à QUATRE endroits (card, titre d'écran,
        titres de groupe, ecranDe) : y écrire le verbe l'aurait envoyé en tête d'écran (« Modifier la
        carte » à côté d'un ‹ et d'un bouton « Publier ») et au-dessus des champs. Ce test tient la
        frontière : si un jour quelqu'un « simplifie » en fusionnant les deux, il rougit.
     ⚠️ Les verbes ne sont PAS écrits en dur ici : ils sont LUS dans la config. Une liste de verbes
        codée serait le vocabulaire d'UN client — Masa dit « Mettre à jour la fournée ». */
  const i = await p.evaluate(async () => {
    const cartes = (typeof toutesLesCartes === 'function') ? toutesLesCartes() : [];
    const out = { cartes: [], fuites: [], sansAction: [] };
    for (const c of cartes){
      if (!c.editable) continue;
      const verbe = (c.action || '').replace(new RegExp(String(c.label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '').trim();
      out.cartes.push({ edit: c.edit, nom: c.label, action: c.action, verbe });
      /* ⚠️ ON N'INTERROMPT PAS ICI. Première version : `if (!verbe) continue;` — et le trou était
         béant. Le cas qu'on veut attraper (« quelqu'un écrit le verbe dans `label` ») rend justement
         action == label, donc verbe == '' → on sortait AVANT de regarder le titre d'écran. Le contrôle
         de fuite ne pouvait pas voir la fuite. On ouvre l'éditeur pour TOUTE card éditable. */
      openEdit(c.edit);
      await new Promise(r => setTimeout(r, 250));
      const tete = ((document.getElementById('edit-title') || {}).textContent || '').trim();
      const groupes = [...document.querySelectorAll('#edit-body .field-group-title')].map(e => e.textContent.trim());
      /* LA FRONTIÈRE, en une phrase : le titre d'écran DIT LE NOM. Pas approximativement — exactement.
         C'est ce qui tient même quand personne ne sait plus ce qu'est « un verbe ». */
      if (tete !== String(c.label).trim())
        out.fuites.push(`titre d'écran « ${tete} » ≠ le nom « ${c.label} » — l'écran doit porter le NOM, la card le geste`);
      if (verbe){
        const mot = verbe.split(/\s+/)[0];   // « Modifier », « Régler », « Gérer »… lu dans la config, jamais codé en dur
        if (new RegExp('\\b' + mot, 'i').test(tete))
          out.fuites.push(`titre d'écran « ${tete} » porte le verbe « ${mot} » (il doit dire « ${c.label} »)`);
        groupes.forEach(g => {
          if (new RegExp('\\b' + mot, 'i').test(g))
            out.fuites.push(`titre de groupe « ${g} » porte le verbe « ${mot} »`);
        });
      } else {
        out.sansAction.push(c.label);
      }
    }
    // Ce que la card AFFICHE doit être l'action, pas le nom.
    applyScreen('monsite');
    await new Promise(r => setTimeout(r, 300));
    out.affiche = [...document.querySelectorAll('#screen-monsite .site-card')].map(el => ({
      section: el.dataset.section, texte: (el.querySelector('.sc-label') || {}).textContent.trim()
    }));
    return out;
  });
  if (!i.cartes.length) fails.push('I/ aucune card éditable trouvée dans la config — le test ne prouverait rien (setup KO)');
  i.fuites.forEach(f => fails.push(`I/ LE VERBE A FUI : ${f} — le geste appartient à la card, le NOM à l'écran`));
  i.cartes.forEach(c => {
    const vu = (i.affiche.find(a => a.section === c.edit) || i.affiche.find(a => (a.texte || '') === c.action));
    if (vu && vu.texte !== c.action)
      fails.push(`I/ la card de « ${c.nom} » affiche « ${vu.texte} » au lieu de son action « ${c.action} » (elle lit `+'`label`'+` au lieu de `+'`action`'+` ?)`);
  });
  /* Une card éditable SANS verbe (action == label) est un oubli de config : le client voit une
     étiquette là où on lui promet un geste. La Réservation, elle, n'est pas éditable → exclue plus haut. */
  i.sansAction.forEach(n => fails.push(`I/ la card « ${n} » est éditable mais n'a PAS de clé \`action\` — elle affiche un nom là où les autres annoncent un geste (verbe + nom)`));

  await b.close();
  if (fails.length){ console.error('\n❌ ATTEIGNABILITÉ — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ ATTEIGNABILITÉ — pied CTA (rotation/focus/visibilité) · reprise directe · Recommencer=travail · slider verrouillé · IA sur clic · vignette IG (haut vide, les 2 niveaux).\n');
})();
