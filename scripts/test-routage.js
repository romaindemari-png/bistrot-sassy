#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   ROUTAGE — « REVENIR OÙ ON ÉTAIT » AU REFRESH, SANS JAMAIS MARCHER SUR L'AUTH.
   ═══════════════════════════════════════════════════════════════════════════
   L'admin est une page unique : sans hash, un refresh dans « La carte » ramenait à l'accueil et le
   client cherchait son écran. Le hash porte donc l'écran. Mais le fragment est DÉJÀ occupé : Netlify
   Identity y fait arriver invite_token / recovery_token, l'OAuth Instagram y renvoie access_token.
   Deux locataires pour une seule adresse — d'où les quatre propriétés tenues ici.

   1. CHAQUE ROUTE MÈNE À SON ÉCRAN. Les clés d'édition sont lues DANS LA PAGE (toutesLesCartes),
      jamais écrites ici : chez un fork ce sont les siennes (Masa : #edit/cematin). Une liste en dur
      testerait le vocabulaire du master sur le site d'un autre.

   2. LES CAS INVALIDES RETOMBENT SUR L'ACCUEIL, ET L'URL EST RÉÉCRITE. #nawak, #edit/inexistant,
      #edit/reservation (la carte existe, mais elle n'est pas éditable) → accueil. ⚠️ L'URL doit
      SUIVRE : laisser « #edit/nawak » dans la barre d'adresse d'un client posé sur l'accueil, c'est
      une URL qui ment — et qu'il peut mettre en favori.

   2bis. #studio/N — LA PLACE, INDÉPENDANTE DU CONTENU. Le studio est un tunnel de 5 écrans : « où on
      est » n'y est pas « le studio », c'est « le studio, étape 4 ». Deux questions qu'on a confondues
      et qui ont coûté la journée du 16/07 :
        · LA PLACE   → le hash, écrit à chaque goStep, sans rien demander au seuil ;
        · LE CONTENU → le brouillon, qui suit le seuil (avancer n'est pas travailler).
      Brancher la place sur le seuil renvoyait à l'étape 1 tout client qui avait avancé sans taper —
      et il n'avait rien perdu, mais il avait perdu sa place.

   3. UN HASH PORTEUR DE JETON N'ACTIVE JAMAIS LE ROUTEUR. C'est la propriété la plus chère : écraser
      le fragment, c'est détruire le lien d'activation que le client vient d'ouvrir dans son mail, ou
      le retour OAuth d'Instagram. Le routeur se tait, handleAuthHash tranche.

   4. LA DÉCONNEXION REPART PROPRE. customLogout efface DÉJÀ le brouillon du studio : l'intention
      « se déconnecter = repartir propre » est écrite dans le code depuis toujours. Mais il laissait
      le hash et l'écran d'édition en place → le relogin rouvrait « La carte », brouillon effacé mais
      position restaurée. Les deux moitiés du même geste ne disaient pas la même chose.
      ⚠️ ET LA PROPRIÉTÉ 3 VAUT AUSSI ICI : se déconnecter pendant qu'un #access_token arrive ne doit
        pas l'écraser.

   ⚠️ Il DOIT être ROUGE sur le code d'avant le correctif (propriété 4), VERT après.

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-routage.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;
const wait   = ms => new Promise(r => setTimeout(r, ms));
const SETTLE = 450;   // > le fondu d'écran (150 ms) + le layout posé

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  /* Le garde-fou contrôle le boot lui-même → il désactive le bypass dev localhost. Sans ça, boot()
     tournerait tout seul et appliquerait la route avant qu'on ait posé le hash à tester. */
  await p.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });
  const fails = [];

  /* Rejoue boot() À L'IDENTIQUE (authed → await loadSassyData → appliquerRoute). ⚠️ Si boot change,
     ceci doit changer : un garde-fou qui simule un boot périmé garde un code qui n'existe plus. */
  const arriverSur = async (hash) => {
    await p.goto(BASE + (hash ? '#' + hash : ''), { waitUntil: 'networkidle0' });
    await p.evaluate(async () => {
      document.body.classList.add('authed');
      await loadSassyData();
      appliquerRoute();
    });
    await wait(SETTLE);
    return p.evaluate(() => ({
      ecran: [...document.querySelectorAll('.screen.active')].map(s => s.id).join(',') || '(aucun)',
      hash:  location.hash || '',
      titre: (document.querySelector('#edit-title') || {}).textContent || '',
    }));
  };

  // ── 0. LE VOCABULAIRE DU DÉPÔT — lu dans la page, jamais écrit ici ─────────────────────────
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  await p.evaluate(async () => { document.body.classList.add('authed'); await loadSassyData(); });
  const toutes = await p.evaluate(() =>
    (typeof toutesLesCartes === 'function' ? toutesLesCartes() : [])
      .filter(c => c.edit).map(c => ({ edit: c.edit, label: c.label, editable: !!c.editable })));
  const cartes = toutes.filter(c => c.editable);
  /* ⚠️ LA NUANCE QUI COMPTE, et qu'une liste de clés bidon (#edit/nexistepas) ne teste PAS : une carte
     peut EXISTER et porter une clé `edit` sans être éditable — « Réservation » est exactement ça.
     appliquerRoute filtre sur `c.editable && c.edit === m[1]`. Mutation faite pour le vérifier, en
     retirant le `editable &&` : le hash « #edit/reservation » RESTE dans la barre d'adresse pendant
     que le client regarde l'accueil. Pas d'écran fantôme — openEdit ne trouve rien (ecranDe rend
     undefined), ne jette pas, n'ouvre rien —, mais appliquerRoute fait son `return` avant de
     réécrire, et l'URL ment. Une clé inexistante ne prouve pas ça : elle est rejetée par le
     `c.edit === m[1]` seul, donc elle reste verte sous la mutation.
     On les dérive de la config, jamais en dur (chez un fork la carte non éditable est une autre — ou
     il n'y en a aucune : la liste vide est tolérée, elle ne retire rien aux autres cas). */
  const nonEditables = toutes.filter(c => !c.editable);
  if (!cartes.length){
    console.error('❌ aucune carte éditable trouvée — le test ne prouverait rien (toutesLesCartes absent ?)');
    await b.close(); process.exit(2);
  }

  // ── 1. CHAQUE ROUTE MÈNE À SON ÉCRAN ───────────────────────────────────────────────────────
  for (const [hash, ecranAttendu] of [['accueil', 'screen-dashboard'], ['monsite', 'screen-monsite']]){
    const r = await arriverSur(hash);
    if (r.ecran !== ecranAttendu)
      fails.push(`ROUTE/ #${hash} ouvre « ${r.ecran} » au lieu de « ${ecranAttendu} » — un refresh ne ramène pas le client où il était`);
    if (r.hash !== '#' + hash)
      fails.push(`ROUTE/ #${hash} : l'URL est devenue « ${r.hash || '(vide)'} » — le hash doit survivre à l'écran qu'il désigne`);
  }
  for (const c of cartes){
    const r = await arriverSur('edit/' + c.edit);
    if (r.ecran !== 'screen-edit')
      fails.push(`ROUTE/ #edit/${c.edit} (« ${c.label} ») ouvre « ${r.ecran} » au lieu de l'éditeur — un refresh dans cette section perd le client`);
    if (r.hash !== '#edit/' + c.edit)
      fails.push(`ROUTE/ #edit/${c.edit} : l'URL est devenue « ${r.hash || '(vide)'} »`);
  }

  // ── 2. LES CAS INVALIDES RETOMBENT SUR L'ACCUEIL, URL RÉÉCRITE ─────────────────────────────
  /* ⚠️ `studio` N'EST PLUS ICI — il l'était tant que le studio restait hors routage. Il a sa propre
     section (2bis) : il ne retombe plus sur l'accueil, il rouvre le studio par le seuil. */
  const invalides = ['nawak', 'edit/', 'edit/nexistepas', 'edit/menu/extra', 'EDIT/MENU/../..']
    .concat(nonEditables.map(c => 'edit/' + c.edit));
  for (const h of invalides){
    const r = await arriverSur(h);
    const nonEdit = nonEditables.find(c => 'edit/' + c.edit === h);
    const pourquoi = nonEdit
      ? ` — « ${nonEdit.label} » porte bien cette clé mais n'est PAS éditable : la route ne doit pas ouvrir un éditeur pour elle`
      : ' — un hash invalide doit retomber sur l\'accueil, jamais sur un écran fantôme';
    if (r.ecran !== 'screen-dashboard')
      fails.push(`ROUTE/ #${h} ouvre « ${r.ecran} »${pourquoi}`);
    if (r.hash !== '#accueil')
      fails.push(`ROUTE/ #${h} laisse « ${r.hash || '(vide)'} » dans la barre d'adresse alors que le client est sur l'accueil — une URL qui ment, et qu'il peut mettre en favori`);
  }

  // ── 2bis. #studio/N — LA PLACE, INDÉPENDANTE DU CONTENU ────────────────────────────────────
  /* ⚠️ CE BLOC A DÉJÀ MENTI UNE FOIS, ET IL FAUT SAVOIR COMMENT POUR NE PAS RECOMMENCER.
     Sa version du 16/07 tapait une légende avant de recharger. Ça crée du travail → un brouillon →
     une reprise : il prouvait le seul cas qui marchait, et se disait « parcours réel ». Le cas du
     client — avancer d'étape en étape SANS rien taper — n'écrit AUCUN brouillon (saveStudioDraft
     purge si !studioHasWork(), et le seuil a raison : avancer n'est pas travailler). Le rechargement
     renvoyait donc à l'étape 1, en prod, pendant que le test était vert.
     → C'EST le cas (a) ci-dessous. S'il disparaît un jour, ce fichier ne garde plus rien.

     Deux questions, deux mécaniques, testées séparément :
       · LA PLACE   → le hash (#studio/4), écrit à chaque goStep, sans rien demander au seuil ;
       · LE CONTENU → le brouillon, qui suit le seuil.

     ⚠️ TROIS PIÈGES DE SONDE, payés comptant le 16/07 :
       1. reload() RÉEL, jamais goto(#studio) : au même hash c'est une navigation SAME-DOCUMENT — la
          page ne recharge pas, l'état en mémoire survit, et on lit l'écran d'AVANT en croyant lire
          celui d'APRÈS ;
       2. localStorage vidé AVANT le chargement, pas après : restoreStudioDraft s'exécute AU PARSING
          et pose studioRestoredWork EN MÉMOIRE. Un removeItem d'après nettoie le stock mais pas la
          variable → le cas suivant hérite du « travail » du précédent (c'est ce résidu qui a fait
          croire que le bug n'existait pas) ;
       3. le brouillon se pose par le PARCOURS (entrer, taper), jamais forgé à la main : un brouillon
          forgé prouve qu'on sait forger un brouillon. */
  const TEMOIN = 'ZZ-TEMOIN-REPRISE';
  const etatStudio = () => p.evaluate(() => ({
    ecran: [...document.querySelectorAll('.screen.active')].map(s => s.id).join(','),
    step:  typeof currentStep !== 'undefined' ? currentStep : null,
    legende: (document.getElementById('caption') || {}).value || '',
    brouillon: !!localStorage.getItem('lelab_studio_draft'),
    hash: location.hash || '',
  }));
  /* Page VIERGE : on vide le stock, PUIS on recharge → restoreStudioDraft repart de zéro, en mémoire
     comme en stock. Sans ce second chargement, cf. piège 2. */
  const studioVierge = async () => {
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate(() => localStorage.clear());
    await p.goto(BASE, { waitUntil: 'networkidle0' });
    await p.evaluate(async () => { document.body.classList.add('authed'); await loadSassyData(); handlePlusClick(); });
    await wait(SETTLE);
  };
  /* Rejoue boot() À L'IDENTIQUE après un VRAI reload (cf. piège 1). */
  const rechargeEtBoote = async () => {
    await p.reload({ waitUntil: 'networkidle0' });
    await p.evaluate(async () => { document.body.classList.add('authed'); await loadSassyData(); appliquerRoute(); });
    await wait(SETTLE);
  };

  /* ── (a) LE CAS DU CLIENT : avancer sans rien taper, recharger → on revient À SON ÉTAPE ──
     Rouge sur le code d'avant (#studio nu → handlePlusClick → étape 1). */
  await studioVierge();
  await p.evaluate(() => goStep(4));
  await wait(SETTLE);
  const a0 = await etatStudio();
  if (a0.step !== 4) fails.push(`setup/ impossible d'atteindre l'étape 4 (étape ${a0.step}) — le test ne prouverait rien`);
  if (a0.brouillon)  fails.push('setup/ un brouillon existe alors que RIEN n\'a été tapé — le cas du client n\'est pas celui-là, et le test retomberait dans le piège de sa version précédente');
  if (a0.hash !== '#studio/4') fails.push(`STUDIO/ à l'étape 4, l'URL dit « ${a0.hash || '(vide)'} » au lieu de « #studio/4 » — la place n'est pas écrite, donc rien ne pourra la relire`);
  await rechargeEtBoote();
  const a1 = await etatStudio();
  if (a1.ecran !== 'screen-studio')
    fails.push(`STUDIO/ #studio/4 ouvre « ${a1.ecran} » au lieu du studio`);
  if (a1.step !== 4)
    fails.push(`STUDIO/ rechargement à l'étape 4 SANS avoir rien tapé → le studio rouvre à l'étape ${a1.step}. C'EST LE BUG DU 16/07 : sans travail il n'y a pas de brouillon (le seuil a raison), donc la PLACE doit venir du hash, pas de la reprise. Le client n'a rien perdu — il n'y avait rien à perdre — mais il a perdu sa place, et un refresh n'est pas une sortie`);

  /* ── (b) AVEC du travail : la place ET le contenu reviennent ── */
  await studioVierge();
  await p.evaluate(() => goStep(3));
  await wait(SETTLE);
  await p.evaluate((t) => {
    const c = document.getElementById('caption');
    if (c){ c.value = t; c.dispatchEvent(new Event('input', { bubbles: true })); }
  }, TEMOIN);
  await wait(SETTLE);
  const b0 = await etatStudio();
  if (!b0.brouillon) fails.push('setup/ une légende a été tapée mais aucun brouillon n\'est écrit — le seuil ou la sauvegarde est cassé (et le cas (b) ne prouverait rien)');
  await rechargeEtBoote();
  const b1 = await etatStudio();
  if (b1.step !== 3)
    fails.push(`STUDIO/ rechargement à l'étape 3 AVEC du travail → étape ${b1.step} au lieu de 3`);
  if (b1.legende !== TEMOIN)
    fails.push(`STUDIO/ le contenu n'est pas repris : légende « ${b1.legende} » au lieu du témoin. La place vient du hash, le CONTENU vient du brouillon — si celui-ci tombe, la reprise est cassée`);

  /* ── (c) LES CAS TORDUS : jamais d'URL qui ment, jamais d'écran surprise ──
     ⚠️ #studio/9 mérite son test à lui : goStep clampe (Math.max(minStep, Math.min(STEP_COUNT, n))),
        donc un `goStep(9)` non validé atterrirait sur la DERNIÈRE étape — le client se retrouverait à
        l'écran final sans avoir rien demandé, et l'URL le lui promettrait. */
  for (const h of ['studio', 'studio/0', 'studio/abc', 'studio/9', 'studio/-1', 'studio/2.5']){
    await studioVierge();
    await p.evaluate((hh) => { history.replaceState(null, '', location.pathname + '#' + hh); }, h);
    await rechargeEtBoote();
    const r = await etatStudio();
    if (r.ecran !== 'screen-studio')
      fails.push(`STUDIO/ #${h} ouvre « ${r.ecran} » au lieu du studio`);
    if (r.step !== 1)
      fails.push(`STUDIO/ #${h} ouvre le studio à l'étape ${r.step} au lieu de l'entrée — une étape invalide ne doit pas téléporter le client (9 → dernière étape si goStep clampe au lieu qu'on valide)`);
    if (r.hash !== '#studio/1')
      fails.push(`STUDIO/ #${h} laisse « ${r.hash || '(vide)'} » dans la barre d'adresse alors que le client est à l'étape 1 — une URL qui ment, et qu'il peut mettre en favori`);
  }


  // ── 3. UN HASH PORTEUR DE JETON N'ACTIVE JAMAIS LE ROUTEUR ─────────────────────────────────
  /* Les quatre familles qu'Identity et l'OAuth Instagram font arriver dans le fragment. Le routeur
     ne doit NI ouvrir un écran depuis ce hash, NI le réécrire : handleAuthHash en a besoin INTACT. */
  const jetons = [
    'invite_token=INV42',
    'recovery_token=REC7',
    'access_token=abc123&refresh_token=xyz&expires_in=3600',
    'error=access_denied&error_description=le+client+a+refus%C3%A9',
  ];
  for (const j of jetons){
    const r = await p.evaluate((j) => {
      history.replaceState(null, '', location.pathname + '#' + j);
      const avant = location.hash;
      appliquerRoute();                     // le routeur DOIT se taire
      ecrireRoute('accueil');               // et l'écriture directe aussi
      applyScreen('dashboard');             // et le chemin qu'emprunte la déconnexion
      return { avant, apres: location.hash };
    }, j);
    if (r.apres !== r.avant)
      fails.push(`AUTH/ le hash porteur d'un jeton « ${j.split('=')[0]} » a été réécrit en « ${r.apres} » — c'est le lien d'activation reçu par mail (ou le retour OAuth Instagram) qu'on vient de détruire`);
  }

  // ── 4. LA DÉCONNEXION REPART PROPRE ────────────────────────────────────────────────────────
  const cle = cartes[0].edit;
  await arriverSur('edit/' + cle);
  const apresLogout = await p.evaluate(() => {
    customLogout();
    return {
      ecran:  [...document.querySelectorAll('.screen.active')].map(s => s.id).join(',') || '(aucun)',
      hash:   location.hash || '(vide)',
      authed: document.body.classList.contains('authed'),
    };
  });
  await wait(SETTLE);
  if (apresLogout.authed)
    fails.push('LOGOUT/ le corps porte encore « authed » après customLogout — la porte de login ne se referme pas');
  if (apresLogout.hash !== '#accueil')
    fails.push(`LOGOUT/ le hash reste « ${apresLogout.hash} » après la déconnexion → le relogin rouvrira cet éditeur. customLogout efface DÉJÀ le brouillon (clearStudioDraft) : effacer le travail mais restaurer la position, c'est le même geste qui se contredit`);
  if (apresLogout.ecran !== 'screen-dashboard')
    fails.push(`LOGOUT/ l'écran « ${apresLogout.ecran} » reste actif derrière la porte de login après la déconnexion — une nouvelle session doit commencer à l'accueil`);

  /* Et le relogin le prouve pour de bon : c'est CE parcours que le client fait, pas l'inspection du
     DOM ci-dessus. */
  const apresRelogin = await p.evaluate(async () => {
    document.body.classList.add('authed');
    await loadSassyData();
    appliquerRoute();
    return [...document.querySelectorAll('.screen.active')].map(s => s.id).join(',') || '(aucun)';
  });
  await wait(SETTLE);
  if (apresRelogin !== 'screen-dashboard')
    fails.push(`LOGOUT/ après déconnexion PUIS relogin, le client atterrit sur « ${apresRelogin} » au lieu de l'accueil — une session neuve ne reprend pas la position de la précédente`);

  await b.close();
  if (fails.length){ console.error('\n❌ ROUTAGE — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log(`\n✅ ROUTAGE — ${cartes.length} éditeurs joignables au refresh · #studio/N rend LA PLACE sans rien demander au seuil (étape 4 sans frappe → étape 4) et LE CONTENU vient du brouillon · 6 étapes tordues → l'entrée, URL réécrite · ${invalides.length} cas invalides → accueil · ${jetons.length} familles de jetons intactes · déconnexion = repartir de l'accueil.\n`);
})();
