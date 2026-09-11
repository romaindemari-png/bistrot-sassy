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
      studioClavierOuvert = false; studioFootKeyboard();
      return { avant: Math.round(avant), apres: Math.round(apres), ecart: Math.round(Math.abs(apres - avant)) };
    });
    if (bougeSurResize.ecart > 2)
      fails.push(`A/ HORS CLAVIER, le pied BOUGE de ${bougeSurResize.ecart}px quand les barres de Safari se replient (${bougeSurResize.avant} → ${bougeSurResize.apres}) — c'est le DÉTACHEMENT au scroll : le repli des barres émet un `+'`resize`'+` à chaque frame. Le CSS (fixed + safe-area) suffit ; seul le clavier justifie une compensation.`);

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
      champ.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await new Promise(r => setTimeout(r, 450));
      const apresFermeture = foot.getBoundingClientRect().top;
      delete document.documentElement.clientHeight;
      if (vraiCH) Object.defineProperty(document.documentElement, 'clientHeight', vraiCH);
      studioClavierOuvert = false; studioFootKeyboard();
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
    theme: 'custom:' + themeId, kind: 'typo', fmt: 'portrait', step: 4, caption: 'Fournée du matin',
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
      step: currentStep, detailsStep: stepNum('details'),
      bannerGone: !document.getElementById('resumeBanner'),  // le bandeau doit avoir DISPARU du DOM
      canReset: document.body.classList.contains('studio-canreset'),
      // Le CONTENU du brouillon : reprendre à la bonne étape sur du contenu ÉCRASÉ, ce n'est pas reprendre.
      plats: [...document.querySelectorAll('#dishEdit .dish-row')].map(r => (r.querySelector('.d-name') || {}).value),
      caption: (document.getElementById('caption') || {}).value
    };
  });
  /* ⚠️ L'ÉTAPE EXACTE, pas « ≥ détails ». Le brouillon dit step:4 → on revient À 4. Un simple
     « ≥ détails » laissait passer studioResumeStep cassé (retomber à 3 satisfaisait le test) : le
     client repartait à la saisie au lieu de sa légende. « Reprendre » veut dire LÀ OÙ JE L'AI LAISSÉ. */
  if (bb.step !== 4)            fails.push(`B/ reprise à l'étape ${bb.step} au lieu de 4 (l'étape LAISSÉE — « reprendre » n'est pas « revenir vaguement dans le coin »)`);
  if (bb.step < bb.detailsStep) fails.push(`B/ reprise NON directe : atterri à l'étape ${bb.step} (< détails ${bb.detailsStep})`);
  if (!bb.bannerGone)          fails.push('B/ bandeau de reprise encore dans le DOM (devait être supprimé)');
  if (!bb.canReset)            fails.push('B/ « Recommencer » indisponible alors qu\'on a repris à l\'étape 3+');
  // ⚠️ LE BROUILLON DOIT AVOIR SURVÉCU — le prérempli d'un thème ne doit JAMAIS écraser du travail.
  if (!bb.plats.includes('Pain de campagne'))
    fails.push(`B/ les plats du brouillon ont été ÉCRASÉS par un prérempli : [${bb.plats.join(' | ')}] (attendu « Pain de campagne »)`);
  if (bb.caption !== 'Fournée du matin')
    fails.push(`B/ la légende du brouillon a été perdue : « ${bb.caption} » (attendu « Fournée du matin »)`);

  // ── B2. SEUIL = LE TRAVAIL SAISI, JAMAIS L'ÉTAPE. Étape 3 sans saisie → pas de Recommencer ;
  //        dès qu'un champ libre (légende) porte du contenu → Recommencer apparaît. ──
  const b2 = await p.evaluate(() => {
    if (typeof studioReset === 'function') studioReset();       // repartir d'un studio VIERGE
    handlePlusClick();
    goStep(stepNum('details'));                                 // à l'étape 3, SANS rien saisir
    const step3NoWork = document.body.classList.contains('studio-canreset');
    const rowHidden = getComputedStyle(document.querySelector('.studio-reset-row')).display === 'none';
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
    let g = 0; while (currentStepId() !== 'details' && g++ < 6) nextStep();
    const arriveeDetails = document.body.classList.contains('studio-canreset');
    const rows = document.querySelectorAll('#dishEdit .dish-row');
    const n = rows[0] && rows[0].querySelector('.d-name');
    if (n){ n.value = 'MODIF ' + n.value; renderStudio(); }      // UNE modif = du travail incontestable
    return { arriveeStudio, apresChoixTheme, arriveeDetails,
             apresModif: document.body.classList.contains('studio-canreset'), nbRows: rows.length };
  }, FOURNEE ? FOURNEE.id : '');
  if (b3.noCard)          fails.push('B3/ card du thème « fournée » (custom:sassy-dujour) introuvable — setup KO');
  else {
    if (!b3.nbRows)       fails.push('B3/ aucun plat prérempli sur le chemin `produits` — le test ne prouverait rien (setup KO)');
    if (b3.arriveeStudio) fails.push('B3/ « Recommencer » dès l\'ARRIVÉE au studio, rien saisi (le prérempli du thème par défaut n\'est pas du travail)');
    if (b3.apresChoixTheme) fails.push('B3/ « Recommencer » après le seul CHOIX du thème fournée (choisir un thème n\'est pas travailler — la ligne de base doit suivre le prérempli)');
    if (b3.arriveeDetails)  fails.push('B3/ « Recommencer » à l\'arrivée étape 3 avec le PRÉREMPLI de la fournée (bloc `produits` — le chemin de Masa)');
    if (!b3.apresModif)     fails.push('B3/ « Recommencer » absent après modif d\'un plat prérempli (doit apparaître)');
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
    let g = 0; while (currentStepId() !== 'details' && g++ < 6) nextStep();   // jusqu'à la saisie, SANS rien modifier
    const stepAvantSortie = currentStep;
    saveStudioDraft();                                          // ce que fait la sortie : rien saisi → doit PURGER, pas écrire
    applyScreen('home');                                        // sortie vers l'Accueil
    const draftApresSortie = localStorage.getItem('lelab_studio_draft');
    handlePlusClick();                                          // retour via « Publier »
    return { stepAvantSortie, stepRetour: currentStep, minStep: studioMinStep(), draftApresSortie };
  });
  if (b4.stepAvantSortie < 3)              fails.push(`B4/ setup KO : pas monté jusqu'à la saisie avant de sortir (étape ${b4.stepAvantSortie})`);
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
      theme: 'custom:' + themeId, kind: 'typo', fmt: 'portrait', step: 4,
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
    return { step: currentStep, detailsStep: stepNum('details'),
             plats: [...document.querySelectorAll('#dishEdit .dish-row')].map(r => (r.querySelector('.d-name') || {}).value),
             canReset: document.body.classList.contains('studio-canreset') };
  });
  if (b5.step < b5.detailsStep)
    fails.push(`B5/ brouillon PLATS SEULS non repris : atterri à l'étape ${b5.step} (< détails ${b5.detailsStep}) — le travail du boulanger est perdu`);
  else if (b5.step !== 4)
    fails.push(`B5/ brouillon PLATS SEULS repris à l'étape ${b5.step} au lieu de 4 (l'étape laissée)`);
  if (!b5.plats.includes('Pain de campagne'))
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

  // ── D. IA SUR CLIC (plus d'auto) + libellés qui disent la vérité + hashtag inerte ──
  const d = await p.evaluate(() => {
    const label = id => ((document.getElementById(id) || {}).querySelector ? (document.getElementById(id).querySelector('.ia-btn-txt') || {}).textContent : '') || '';
    const autoGone = (typeof autoGenCaption === 'undefined');          // la fonction d'auto-génération n'existe plus
    const cap = document.getElementById('caption');
    if (cap) cap.value = ''; refreshIaButtons(); const capEmpty = label('iaBtn');   // champ vide → « Rédiger… »
    if (cap) cap.value = 'Un texte'; refreshIaButtons(); const capFilled = label('iaBtn');   // rempli → « Régénérer »
    if (typeof applyInfosVariant === 'function') applyInfosVariant(true);           // mode ANNONCE
    const inf = document.getElementById('infosText'); if (inf) inf.value = '';
    refreshIaButtons(); const annonceLabel = label('iaBtnInfos');
    studioHashtags = []; renderHashtagsRow();
    const ghost = document.querySelector('#hashtags .htag.ghost');
    return { autoGone, capEmpty, capFilled, annonceLabel, hasGhost: !!ghost, ghostClickable: ghost ? !!ghost.getAttribute('onclick') : false };
  });
  if (!d.autoGone)                            fails.push('D/ autoGenCaption existe encore — l\'auto-génération n\'a pas été supprimée');
  if (!d.capEmpty.startsWith('Rédiger'))      fails.push(`D/ légende vide : « ${d.capEmpty} » (attendu « Rédiger avec l'IA »)`);
  if (d.capFilled !== 'Régénérer')            fails.push(`D/ légende remplie : « ${d.capFilled} » (attendu « Régénérer »)`);
  if (!d.annonceLabel.startsWith('Mettre en forme')) fails.push(`D/ annonce : « ${d.annonceLabel} » (attendu « Mettre en forme avec l'IA » — « Rédiger » mentirait)`);
  if (d.hasGhost && d.ghostClickable)         fails.push('D/ hashtag fantôme cliquable (doit être inerte — le ✦ est le seul déclencheur)');

  // ── E. VIGNETTE INSTAGRAM : le haut est VIDE, le statut vit dans l'APERÇU. Les DEUX niveaux. ──
  /* La connexion est une info tertiaire : la carte verte et le bouton noir ne sont pas déplacés, ils
     n'existent plus. Le statut se lit dans l'aperçu (point vert + @pseudo · « Connectez votre compte »).
     ⚠️ On teste les DEUX niveaux en MUTANT LA CONFIG EN MÉMOIRE — même patron que C (sliderEditable).
        C'est le seul moyen de garder vivant le chemin `detaillee` (Sassy, App Review Meta), qu'AUCUN
        déploiement du master n'exerce : une branche que rien ne teste pourrit en silence. */
  const igRender = () => {   // ce que fait loadInstagramStatus, sans le réseau (le token n'existe pas hors prod)
    syncPreviewIdentity();
    syncStudioIgMount();
    const s3 = document.getElementById('igStatusSidebar');
    if (s3) s3.innerHTML = igStatusHTML(igStatus);
  };
  const e = await p.evaluate((igRenderSrc) => {
    const render = eval('(' + igRenderSrc + ')');
    /* ⚠️ ON MESURE LE RENDU, ON NE CROIT PAS L'ATTRIBUT. La 1re version testait `!el.hidden` — et elle
       est passée AU VERT sur un écran où le lien « Connecter » s'affichait à un client CONNECTÉ :
       `.mp-connect` portait un `display:inline-flex` d'auteur, qui bat le `hidden` du navigateur.
       L'attribut disait « caché », le pixel disait « visible », le test croyait l'attribut.
       C'est la règle de la maison, appliquée à l'outil lui-même : CONSTATER, NE PAS RE-DÉDUIRE.
       On exige donc une boîte réellement rendue (getBoundingClientRect), pas une intention. */
    const vu = el => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return getComputedStyle(el).visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const lire = () => ({
      studio:   (document.getElementById('igStatusStudio')  || {}).innerHTML || '',
      sidebar:  (document.getElementById('igStatusSidebar') || {}).innerHTML || '',
      carte:    !!document.querySelector('.ig-card'),
      boutonNoir: !!document.querySelector('.ig-status.off'),
      /* ⚠️ LA QUESTION N'EST PAS « la carte a-t-elle disparu » MAIS « LE CLIENT PEUT-IL AGIR ».
         En vidant le haut, j'ai supprimé la SEULE porte de disconnectInstagram() : la fonction est
         restée vivante, injoignable, et le client connecté ne pouvait plus se déconnecter du tout.
         Le garde-fou n'a rien vu — il vérifiait la disparition, jamais l'atteignabilité. Dans un
         fichier dont la 1re ligne dit « dans le DOM ≠ atteignable ». On teste donc l'ACTION. */
      peutDeconnecter: [...document.querySelectorAll('a,button')].some(el =>
        vu(el) && /d[ée]connecter/i.test(el.textContent) && !el.closest('.confirm-overlay')),
      peutConnecter: [...document.querySelectorAll('a,button')].some(el =>
        vu(el) && /^connecter$|connectez/i.test(el.textContent.trim()) && !el.closest('.confirm-overlay')),
      nom:      (document.querySelector('#studio-unlocked .ig-name') || {}).textContent || '',
      // ⚠️ L'APERÇU PORTE LE PSEUDO À DEUX ENDROITS : l'en-tête ET la légende (en gras, comme Instagram).
      //    Le second était en dur — le test ne regardait que le premier et aurait laissé passer le mensonge.
      nomLegende: (document.getElementById('igCapName') || {}).textContent || '',
      pointPseudo: !!document.querySelector('#studio-unlocked .ig-name .ig-live-d'),
      pointBandeau: vu(document.getElementById('mpLive')),
      /* « Le point est SUR le logo » — pas juste « le point existe ». Il s'était échappé au bord droit
         de l'écran (.mp-ig sans position:relative → l'absolu remontait à .mini-preview). Un test qui
         ne mesure que la présence aurait signé ça les yeux fermés. */
      pointSurLogo: (() => {
        const d = document.getElementById('mpLive'), l = document.querySelector('.mp-ig');
        if (!d || !l || !vu(d)) return null;
        const a = d.getBoundingClientRect(), b = l.getBoundingClientRect();
        const cx = a.left + a.width / 2, cy = a.top + a.height / 2;
        return cx >= b.left - 6 && cx <= b.right + 6 && cy >= b.top - 6 && cy <= b.bottom + 6;
      })(),
      lienBandeau:  vu(document.getElementById('mpConnect')),
      teteVisible:  vu(document.querySelector('.compose-head')),
      sortieVisible: vu(document.querySelector('.ch-quit'))
    });
    const cfg = sassyData.config || (sassyData.config = {});
    const out = {};
    handlePlusClick();

    // AVANT tout rendu : l'avatar au repos ne doit tenir AUCUNE image distante (le fond venait du CSS).
    out.avatarNeuf = getComputedStyle(document.querySelector('#studio-unlocked .ig-ava > div')).backgroundImage;
    // Le pied de sidebar ne doit JAMAIS afficher un faux pseudo quand la donnée manque.
    out.pseudoSidebar = (document.querySelector('.user-plan') || {}).textContent || '';

    // ── LÉGER (défaut) ──
    delete cfg.instagram;
    igStatus = { connected: true, username: 'lestud13', user_id: '17841445759764573',
                 profile_picture_url: 'https://example.invalid/a.jpg' };
    render(); out.legerOn = lire();
    igStatus = { connected: false, username: null };
    render(); out.legerOff = lire();
    out.avatarFond = getComputedStyle(document.querySelector('#studio-unlocked .ig-ava > div')).backgroundImage;
    out.ville = (document.querySelector('#studio-unlocked .ig-name .loc') || {}).textContent;

    // ── DÉTAILLÉ (Sassy — App Review Meta) ──
    cfg.instagram = { vignette: 'detaillee' };
    igStatus = { connected: true, username: 'lestud13', user_id: '17841445759764573' };
    render(); out.detOn = lire();
    igStatus = { connected: false, username: null };
    render(); out.detOff = lire();
    delete cfg.instagram;   // on rend la config telle qu'on l'a trouvée
    return out;
  }, igRender.toString());

  // LÉGER — rien en tête, tout dans l'aperçu
  if (e.legerOn.studio.trim() || e.legerOn.sidebar.trim())
    fails.push('E/ LÉGER : un bloc de statut est encore monté en tête/sidebar (le haut doit être VIDE — la carte n\'est pas déplacée, elle est supprimée)');
  if (e.legerOn.carte)        fails.push('E/ LÉGER : la carte verte (.ig-card) est encore rendue');
  if (e.legerOff.boutonNoir)  fails.push('E/ LÉGER : le bouton noir « Connecter Instagram » (.ig-status.off) est encore rendu');
  if (!e.legerOn.pointPseudo) fails.push('E/ LÉGER connecté : pas de point vert collé au @pseudo dans l\'aperçu');
  if (!/lestud13/.test(e.legerOn.nom)) fails.push(`E/ LÉGER connecté : l'aperçu ne porte pas le @pseudo réel (« ${e.legerOn.nom} »)`);
  if (!/lestud13/.test(e.legerOn.nomLegende))
    fails.push(`E/ connecté : la LÉGENDE de l'aperçu n'affiche pas le @pseudo réel (« ${e.legerOn.nomLegende} ») — l'en-tête et la légende doivent dire LA MÊME chose du même compte`);
  if (/votre_compte/.test(e.legerOff.nomLegende))
    fails.push(`E/ déconnecté : la LÉGENDE affiche le faux pseudo « ${e.legerOff.nomLegende} » (un placeholder plausible est un mensonge)`);
  if (!e.legerOn.pointBandeau) fails.push('E/ LÉGER connecté : point vert absent du logo Instagram du bandeau (seule surface visible, tiroir fermé)');
  if (e.legerOn.pointBandeau && e.legerOn.pointSurLogo === false)
    fails.push('E/ LÉGER connecté : le point vert est RENDU AILLEURS que sur le logo (absolu sans ancêtre positionné → il part au bord de l\'écran)');
  if (e.legerOn.lienBandeau)   fails.push('E/ LÉGER connecté : le lien « Connecter » s\'affiche alors que le compte EST connecté');
  if (!/Connectez votre compte/.test(e.legerOff.nom))
    fails.push(`E/ LÉGER déconnecté : l'aperçu doit dire « Connectez votre compte » À LA PLACE du pseudo (« ${e.legerOff.nom} »)`);
  if (e.legerOff.pointBandeau) fails.push('E/ LÉGER déconnecté : point vert affiché alors que le compte n\'est PAS connecté');
  if (!e.legerOff.lienBandeau) fails.push('E/ LÉGER déconnecté : lien « Connecter » absent du bandeau (seul cas qui appelle une action)');

  /* Le prefill démo : plus d'inconnu en guise d'avatar, plus de ville inventée.
     DEUX griefs DISTINCTS, deux mesures — les confondre donnerait un test qui ment sur ce qu'il prouve :
       · au REPOS, le fond venait du CSS (une photo Unsplash en dur → le visage d'un mannequin) ;
       · APRÈS UNE DÉCONNEXION, la photo du compte précédent restait collée (certitude périmée). */
  if (/http/i.test(e.avatarNeuf || ''))
    fails.push(`E/ l'avatar de l'aperçu porte une image DISTANTE EN DUR au repos (prefill démo interdit) : ${e.avatarNeuf}`);
  if (/http/i.test(e.avatarFond || ''))
    fails.push(`E/ l'avatar garde une photo DISTANTE alors que le compte est DÉCONNECTÉ (elle doit être effacée) : ${e.avatarFond}`);
  if ((e.ville || '').trim())
    fails.push(`E/ la localisation de l'aperçu affiche un placeholder (« ${e.ville} ») — du faux montré au client`);
  /* ── E-bis. AUCUNE IMAGE DISTANTE EN DUR DANS LA SOURCE ──────────────────────────────────────
     ⚠️ CE CONTRÔLE LIT LE FICHIER, PAS LE DOM, ET C'EST OBLIGATOIRE : l'image Unsplash de #igPhoto
        était ÉCRASÉE au boot par une photo locale. Au runtime elle n'existait donc nulle part — un
        test du DOM la déclarait « absente » alors qu'elle dormait dans la source, prête à revenir.
        (Écrit d'abord en DOM, ce contrôle était CREUX : vert sur le code fautif. Encore.)
     Une image distante en dur dans un repo client est une dette : le jour où le CDN change ou tombe,
     c'est la page du client qui pointe dans le vide. */
  const CDN_LEGITIMES = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /www\.w3\.org/,
                         /www\.instagram\.com\/oauth/, /maps\.google\.com/];
  const srcAdmin = require('fs').readFileSync(require('path').join(__dirname, '..', 'admin', 'index.html'), 'utf8');
  const imgsDistantes = [...srcAdmin.matchAll(/url\(\s*['"]?(https?:\/\/[^'")\s]+)/g)]
    .map(m => m[1]).filter(u => !CDN_LEGITIMES.some(re => re.test(u)));
  if (imgsDistantes.length)
    fails.push(`E/ image DISTANTE en dur dans la SOURCE de l'admin (dette : le jour où elle bouge, le client pointe dans le vide) : ${[...new Set(imgsDistantes)].join(' · ')}`);

  if (/votre_compte|@\s*$/.test(e.pseudoSidebar))
    fails.push(`E/ le pied de sidebar affiche un FAUX pseudo par défaut (« ${e.pseudoSidebar} ») — pas de donnée doit vouloir dire RIEN, pas un compte plausible`);

  // La sortie « ← Accueil » ne dépend PLUS du contenu de la vignette
  if (!e.legerOn.teteVisible || !e.legerOn.sortieVisible)
    fails.push('E/ « ← Accueil » a disparu en mobile alors que la vignette est vide (la tête ne doit PAS dépendre du mount)');

  /* ── LE CLIENT PEUT AGIR — DANS LES DEUX NIVEAUX ────────────────────────────────────────────
     Le seuil n'est pas « le bloc a disparu » mais « l'action existe et se touche ». Une action
     injoignable est pire qu'un lien discret : le client est coincé sans savoir pourquoi. */
  if (!e.legerOn.peutDeconnecter)
    fails.push('E/ LÉGER connecté : AUCUN « Déconnecter » atteignable — le client ne peut plus déconnecter son compte (la fonction existe, sans porte)');
  if (!e.legerOff.peutConnecter)
    fails.push('E/ LÉGER déconnecté : AUCUN « Connecter » atteignable');
  if (e.legerOff.peutDeconnecter)
    fails.push('E/ LÉGER déconnecté : « Déconnecter » proposé alors qu\'aucun compte n\'est connecté');
  if (!e.detOn.peutDeconnecter)
    fails.push('E/ DÉTAILLÉ connecté : AUCUN « Déconnecter » atteignable');
  if (!e.detOff.peutConnecter)
    fails.push('E/ DÉTAILLÉ déconnecté : AUCUN « Connecter » atteignable');

  // DÉTAILLÉ — Sassy garde sa carte, à l'identique
  if (!e.detOn.carte)   fails.push('E/ DÉTAILLÉ : la carte Meta (avatar + @pseudo + ID) a disparu — l\'App Review de Sassy l\'exige');
  if (!/17841445759764573/.test(e.detOn.studio + e.detOn.sidebar))
    fails.push('E/ DÉTAILLÉ : l\'ID du compte n\'est plus rendu (triplet Meta incomplet)');
  if (!e.detOff.boutonNoir) fails.push('E/ DÉTAILLÉ déconnecté : le bouton « Connecter Instagram » a disparu');
  if (e.detOn.pointBandeau) fails.push('E/ DÉTAILLÉ : point vert du bandeau affiché EN PLUS de la carte (signal doublé — il remplace la carte, il ne s\'y ajoute pas)');

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
