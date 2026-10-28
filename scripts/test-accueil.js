#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   LA PHRASE D'ACCUEIL — elle dit l'état RÉEL du site, et elle suit les données (LELAB-DESIGN §4).
   ═══════════════════════════════════════════════════════════════════════════
   Au 26/10, AUCUNE donnée de Sassy ne fait passer une section « à voir » (relevé champ par champ :
   pas de date d'ardoise, pas de date de fin) : SOURCES_A_VOIR est vide, la phrase est donc fixe. Mais la
   mécanique 0 / 1 / n est câblée, et c'est elle qu'on prouve ici, sur une SOURCE SIMULÉE branchée en
   mémoire — jamais en écrivant dans _data.

   1. LE RÉEL : sans source, « Votre site est à jour. » et pas de chip « à voir ».
   2. 0 / 1 / 2 sections à voir → la phrase et la chip changent (« Une carte vous attend. », « 2 cartes
      vous attendent. », chip « 2 à voir »).
   3. MASQUÉE GAGNE : un bloc `actif:false` (dujour chez Sassy) ne compte JAMAIS « à voir », même si une
      source le désigne. Masquée = strictement actif:false (§2).
   4. LE SALUT : « Bonjour » jusqu'à 17 h 59, « Bonsoir » dès 18 h 00 ; le prénom s'ajoute s'il est rempli ; une
      virgule (« Bonsoir Vincent, »). C'est un SURTITRE (28/10) : hors du <h1>, au-dessus, Instrument Serif italique,
      24 px (téléphone) / 36 px (desktop), couleur --texte ; le <h1> ne porte que l'état.
   5. L'AVATAR NE DÉCONNECTE PAS : il ouvre un volet ; dehors, Échap, second toucher le ferment ; seul
      « Se déconnecter » déconnecte.
   6. LE BOUTON PUBLIER (§6) : « Tout est en ligne » en contour, non cliquable, tant que rien ne change ;
      « Publier » en --a-voir et « n changement(s) · en ligne en moins d'une minute » dès qu'un
      interrupteur bascule ; retour à l'état 1 quand on le rebascule. VRAIS clics. Envoi réussi (save-data
      SIMULÉ, 200) → « ✓ Envoyé » sur papier, « En ligne dans moins d'une minute. », JAMAIS le jaune
      « C'est en ligne » (réservé au déploiement constaté) ; retour au repos après 3 s.
   7. PAS DE FLASH DE LA PORTE DE LOGIN : avec un jeton valide (Identity SIMULÉ, réponse en 500 ms), la
      porte n'est visible sur AUCUNE image, du premier rAF jusqu'à l'app. Sans session, ou jeton refusé,
      elle apparaît — l'écran d'attente ne reste jamais collé.
   8. LES FLOUS SE VOIENT : en nuit, au cœur du flou violet (contenu masqué), le pixel moyen est plus clair
      que --fond #1A1526 d'au moins 10 niveaux SUR CHAQUE CANAL. (Le fond de <body> les recouvrait.)
   9. LES TUILES (bout 4) : autant de tuiles que d'éditeurs dont la section EXISTE dans index.html (calculé
      ICI, indépendamment du code testé) ; ordre = ordre des sections dans le DOM ; plat du jour absent ;
      un bloc passé en actif:false sur une COPIE de config.json (interceptée, l'original n'est pas touché)
      devient contour sans grain et la phrase reste juste ; une bascule ne navigue pas, passe la tuile en
      contour et allume Publier.

   ⚠️ Il DOIT être ROUGE sur le code d'avant le bout 3 (renderAccueil n'existe pas), VERT après.

   USAGE :  python3 -m http.server 8080   puis   node scripts/test-accueil.js 8080
   PRÉREQUIS : puppeteer-core + un Chrome installé.
   ═══════════════════════════════════════════════════════════════════════════ */
const PORT   = process.argv[2] || '8080';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE   = `http://localhost:${PORT}/admin/`;

let puppeteer;
try { puppeteer = require('puppeteer-core'); }
catch (e){ console.error('puppeteer-core manquant → npm install'); process.exit(2); }

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, isMobile: true });
  await p.evaluateOnNewDocument(() => { window.__NO_DEV_BYPASS = true; });
  await p.goto(BASE, { waitUntil: 'networkidle0' });
  const pret = await p.evaluate(async () => {
    if (typeof renderAccueil !== 'function' || typeof SOURCES_A_VOIR === 'undefined') return false;
    document.body.classList.add('authed');
    await loadSassyData();
    return true;
  });
  if (!pret){ console.error('\n❌ ACCUEIL — renderAccueil / SOURCES_A_VOIR absents : la phrase d\'accueil n\'existe pas\n'); await b.close(); process.exit(1); }

  const fails = [];
  /* Rend l'accueil avec une source simulée (les clés désignées sont « à voir ») et une heure donnée. */
  const rendre = (cles, heure, prenom) => p.evaluate((cles, heure, prenom) => {
    SOURCES_A_VOIR.length = 0;
    if (cles) SOURCES_A_VOIR.push(bloc => cles.includes(bloc.cle) ? 'simulé' : null);
    sassyData.config.commerce.prenom = prenom || '';
    const d = new Date(2026, 9, 26, heure[0], heure[1]);
    renderAccueil(d);
    const chip = document.getElementById('chipAVoir');
    return {
      salut: document.getElementById('accueilSalut').textContent,
      etat:  document.getElementById('accueilEtat').textContent,
      chip:  chip.hidden ? null : chip.textContent,
      blocs: tousLesBlocs().map(x => x.cle + (x.actif === false ? ':off' : '')).join(' '),
    };
  }, cles, heure, prenom);

  const lignes = [];
  const verifier = (nom, r, etat, chip) => {
    const ok = r.etat === etat && r.chip === chip;
    lignes.push(`| ${nom} | ${r.etat} | ${r.chip === null ? '(masquée)' : r.chip} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${nom} : « ${r.etat} » / chip ${r.chip} — attendu « ${etat} » / chip ${chip}`);
  };

  // 1. Le réel : aucune source
  verifier('réel (aucune source)', await rendre(null, [10, 0]), 'Votre site est à jour.', null);
  // 2. Source simulée : 0, 1, 2 sections à voir (blocs ACTIFS de Sassy)
  verifier('simulé · 0 à voir', await rendre([], [10, 0]), 'Votre site est à jour.', null);
  verifier('simulé · 1 à voir (carte)', await rendre(['carte'], [10, 0]), 'Une carte vous attend.', '1 à voir');
  const r2 = await rendre(['carte', 'events'], [10, 0]);
  verifier('simulé · 2 à voir (carte, events)', r2, '2 cartes vous attendent.', '2 à voir');
  // 3. Masquée gagne : dujour est actif:false chez Sassy
  if (!/dujour:off/.test(r2.blocs)) fails.push(`setup/ dujour n'est pas actif:false dans la config lue (${r2.blocs}) — le cas 3 ne prouverait rien`);
  verifier('masquée désignée (dujour)', await rendre(['dujour'], [10, 0]), 'Votre site est à jour.', null);
  verifier('masquée + 1 active (dujour, carte)', await rendre(['dujour', 'carte'], [10, 0]), 'Une carte vous attend.', '1 à voir');

  // 4. Le salut
  const saluts = [
    [[17, 59], '', 'Bonjour,'], [[18, 0], '', 'Bonsoir,'],
    [[9, 0], 'Vincent', 'Bonjour Vincent,'], [[21, 30], 'Vincent', 'Bonsoir Vincent,'],
  ];
  for (const [h, prenom, attendu] of saluts){
    const r = await rendre(null, h, prenom);
    const ok = r.salut === attendu;
    lignes.push(`| salut ${String(h[0]).padStart(2, '0')}:${String(h[1]).padStart(2, '0')}${prenom ? ' · ' + prenom : ''} | ${r.salut} | — | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`salut à ${h.join(':')} (prénom « ${prenom} ») : « ${r.salut} » au lieu de « ${attendu} »`);
  }

  // 4bis. Le salut est un surtitre
  {
    const s = await p.evaluate(() => {
      const e = document.getElementById('accueilSalut'), h = document.querySelector('#screen-monsite h1.accueil');
      const cs = e && getComputedStyle(e), texte = getComputedStyle(document.documentElement).getPropertyValue('--texte').trim();
      const rgb = x => 'rgb(' + x.replace('#', '').match(/../g).map(v => parseInt(v, 16)).join(', ') + ')';
      return { horsH1: !!e && !!h && !h.contains(e), avant: !!e && !!h && !!(e.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING),
               italique: cs && cs.fontStyle, serif: cs && /Instrument Serif/.test(cs.fontFamily), taille: cs && parseFloat(cs.fontSize),
               attendue: innerWidth <= 960 ? 24 : 36, couleur: cs && cs.color === rgb(texte), h1: h && h.textContent.trim() };
    });
    const ok = s.horsH1 && s.avant && s.italique === 'italic' && s.serif && s.taille === s.attendue && s.couleur && !/^Bon(jour|soir)/.test(s.h1 || '');
    lignes.push(`| salut en surtitre | ${JSON.stringify(s)} | — | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push('salut en surtitre : ' + JSON.stringify(s));
  }

  /* 6. LE BOUTON PUBLIER — vrais clics sur les interrupteurs de Mon site. */
  await p.evaluate(() => applyScreen('monsite'));
  const pub = () => p.evaluate(() => {
    const b = document.getElementById('btn-publish-sections');
    return { txt: b.textContent.trim(), off: b.disabled, cls: [...b.classList].filter(c => c.startsWith('pub--')).join(' '),
             phrase: (document.getElementById('publierPhrase') || { textContent: '(phrase absente)' }).textContent };
  });
  const verifPub = (nom, r, txt, off, cls, phrase) => {
    const ok = r.txt === txt && r.off === off && r.cls === cls && r.phrase === phrase;
    lignes.push(`| publier · ${nom} | ${r.txt} (${r.off ? 'non cliquable' : 'cliquable'}) | ${r.phrase} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`publier · ${nom} : « ${r.txt} », désactivé=${r.off}, ${r.cls}, « ${r.phrase} » — attendu « ${txt} », ${off}, ${cls}, « ${phrase} »`);
  };
  const interrupteurs = await p.$$('#screen-monsite .lelab-mini-toggle[data-bloc]');
  if (interrupteurs.length < 2) fails.push(`setup/ ${interrupteurs.length} interrupteur(s) sur Mon site — il en faut 2 pour le cas « 2 changements »`);
  verifPub('repos', await pub(), 'Tout est en ligne', true, 'pub--en-ligne', 'Modifiez une section et le bouton s’allume.');
  await interrupteurs[0].click();
  verifPub('1 bascule', await pub(), 'Publier', false, 'pub--a-voir', '1 changement · en ligne en moins d’une minute');
  if (interrupteurs[1]){ await interrupteurs[1].click();
    verifPub('2 bascules', await pub(), 'Publier', false, 'pub--a-voir', '2 changements · en ligne en moins d’une minute');
    await interrupteurs[1].click(); }
  await interrupteurs[0].click();
  verifPub('rebasculé', await pub(), 'Tout est en ligne', true, 'pub--en-ligne', 'Modifiez une section et le bouton s’allume.');

  /* Envoi réussi : une session factice en mémoire (getToken la lit), save-data intercepté (200). Le
     contenu envoyé n'est écrit NULLE PART — on lit seulement ce que le bouton annonce. */
  await p.setRequestInterception(true);
  let envois = 0;
  const intercepte = r => {
    if (r.url().includes('/.netlify/functions/save-data')){ envois++; r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    else r.continue();
  };
  p.on('request', intercepte);
  await p.evaluate(() => { session = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3 }; });
  await interrupteurs[0].click();
  await p.click('#btn-publish-sections');
  await new Promise(r => setTimeout(r, 400));
  const env = await pub();
  const fondEnvoye = await p.evaluate(() => getComputedStyle(document.getElementById('btn-publish-sections')).backgroundColor);
  const jaune = await p.evaluate(() => { const t = document.createElement('i'); t.style.color = 'var(--en-ligne)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return c; });
  /* Bout 6 : au 200 de save-data, « Envoyé · mise en ligne… » ; le « en ligne » ne vient qu'avec la relecture
     du fichier public (test-publier). Ici config.json n'a pas changé : le bouton ne doit JAMAIS conclure. */
  verifPub('envoi réussi', env, 'Envoyé · mise en ligne…', true, 'pub--envoye', 'En ligne dans moins d’une minute.');
  if (envois !== 1) fails.push(`publier · envoi réussi : ${envois} appel(s) à save-data au lieu d'un`);
  if (fondEnvoye === jaune) fails.push(`publier · « Envoyé » sur le jaune ${jaune} — le jaune plein est réservé au déploiement constaté`);
  const ditEnLigne = t => /C’est en ligne|Tout est en ligne/.test(t);
  if (ditEnLigne(env.txt)) fails.push(`publier · le bouton annonce « ${env.txt} » au 200 de save-data : c'est écrit, pas encore en ligne`);
  await new Promise(r => setTimeout(r, 3100));
  const apres = await pub();
  if (ditEnLigne(apres.txt)) fails.push(`publier · 3 s après l’envoi, « ${apres.txt} » sans que le fichier public ait changé`);
  lignes.push(`| publier · 3 s après l’envoi (fichier public inchangé) | ${apres.txt} | ${apres.phrase} | ${ditEnLigne(apres.txt) ? '❌' : '✅'} |`);
  p.off('request', intercepte);
  await p.setRequestInterception(false);

  /* 5. L'AVATAR NE DÉCONNECTE PAS. Un toucher ouvre le volet (nom du commerce + « Se déconnecter ») ;
     dehors, Échap ou un second toucher le referment ; SEUL le bouton du volet déconnecte.
     ⚠️ De VRAIS clics (p.click / p.mouse) et une vraie touche : appeler les fonctions prouverait les
        fonctions, pas le geste. */
  const compte = () => p.evaluate(() => ({
    authed: document.body.classList.contains('authed'),
    ouvert: !document.getElementById('voletCompte').hidden,
    expanded: document.getElementById('avatarInit').getAttribute('aria-expanded'),
    nom: document.getElementById('voletNom').textContent,
  }));
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const etape = async (nom, geste, attendu) => {
    await geste(); await pause(150);
    const c = await compte();
    const ok = c.authed === attendu.authed && c.ouvert === attendu.ouvert;
    lignes.push(`| ${nom} | ${c.authed ? 'connecté' : 'DÉCONNECTÉ'} | volet ${c.ouvert ? 'ouvert' : 'fermé'} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${nom} : connecté=${c.authed}, volet ouvert=${c.ouvert} — attendu connecté=${attendu.authed}, ouvert=${attendu.ouvert}`);
    return c;
  };
  const dehors = async () => { const r = await p.evaluate(() => { const b = document.getElementById('accueilEtat').getBoundingClientRect(); return [b.left + 10, b.top + 10]; }); await p.mouse.click(r[0], r[1]); };
  const c1 = await etape('avatar · 1er toucher', () => p.click('#avatarInit'), { authed: true, ouvert: true });
  if (c1.expanded !== 'true') fails.push(`aria-expanded vaut « ${c1.expanded} » volet ouvert`);
  if (c1.nom !== 'Bistrot Sassy') fails.push(`le volet affiche « ${c1.nom} » au lieu du nom du commerce`);
  /* Le premier toucher a déconnecté → l'app est masquée, aucun geste suivant n'a de sens : on s'arrête
     ici avec CE verdict, au lieu de planter sur un clic impossible. */
  if (!c1.authed) fails.push('un SEUL toucher sur l\'avatar déconnecte le client — c\'est le geste accidentel que le volet doit empêcher');
  else {
    await etape('toucher dehors', dehors, { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('Échap', () => p.keyboard.press('Escape'), { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('avatar · 2e toucher', () => p.click('#avatarInit'), { authed: true, ouvert: false });
    await etape('avatar · rouvre', () => p.click('#avatarInit'), { authed: true, ouvert: true });
    await etape('« Se déconnecter »', () => p.click('#voletCompte .vc-sortie'), { authed: false, ouvert: false });
  }

  /* 7. PAS DE FLASH DE LA PORTE DE LOGIN. Une page neuve par cas : la session vit en localStorage AVANT
     tout script, Identity est simulé par interception (réponse en 500 ms, le temps d'un vrai réseau), et
     chaque image (requestAnimationFrame, dès le premier) note si la porte est visible. */
  const chargement = async (session, identite) => {
    const q = await b.newPage();
    await q.setViewport({ width: 390, height: 844, isMobile: true });
    await q.evaluateOnNewDocument(sess => {
      window.__NO_DEV_BYPASS = true;
      try { if (sess) localStorage.setItem('lelab_session', JSON.stringify(sess)); else localStorage.removeItem('lelab_session'); } catch (e){}
      window.__images = 0; window.__porteVue = 0; window.__attenteVue = 0;
      const tic = () => {
        const g = document.getElementById('login-gate'), a = document.getElementById('attente');
        if (g){ window.__images++; if (getComputedStyle(g).display !== 'none') window.__porteVue++; }
        if (a && getComputedStyle(a).display !== 'none') window.__attenteVue++;
        if (window.__images < 240) requestAnimationFrame(tic);
      };
      requestAnimationFrame(tic);
    }, session);
    await q.setRequestInterception(true);
    q.on('request', r => {
      if (r.url().includes('/.netlify/identity/user'))
        setTimeout(() => r.respond(identite === 'ok'
          ? { status: 200, contentType: 'application/json', body: JSON.stringify({ email: 'sonde@exemple.fr', user_metadata: {} }) }
          : { status: 401, contentType: 'application/json', body: '{"msg":"invalide"}' }), 500);
      else r.continue();
    });
    await q.goto(BASE, { waitUntil: 'networkidle0' });
    await pause(1500);
    const r = await q.evaluate(() => ({ images: window.__images, porte: window.__porteVue, attente: window.__attenteVue,
      authed: document.body.classList.contains('authed'), verif: document.body.classList.contains('verif-session'),
      porteFin: getComputedStyle(document.getElementById('login-gate')).display !== 'none' }));
    await q.close();
    return r;
  };
  const jeton = { access_token: 'sonde', refresh_token: 'sonde', expires_at: Date.now() + 3600e3, user: { email: 'sonde@exemple.fr' } };
  const v = await chargement(jeton, 'ok');
  const okV = v.authed && v.porte === 0 && !v.verif && v.images > 20;
  lignes.push(`| connexion · jeton valide | porte vue sur ${v.porte}/${v.images} images · attente ${v.attente} images | ${v.authed ? 'app' : 'pas d\'app'} | ${okV ? '✅' : '❌'} |`);
  if (!okV) fails.push(`jeton valide : porte visible sur ${v.porte} image(s) sur ${v.images}, connecté=${v.authed}, attente collée=${v.verif} — la porte de login ne doit JAMAIS apparaître à un client connecté`);
  for (const [nom, sess, id] of [['sans session', null, 'ok'], ['jeton refusé (401)', jeton, 'refus']]){
    const r = await chargement(sess, id);
    const ok = !r.authed && r.porteFin && !r.verif;
    lignes.push(`| connexion · ${nom} | porte affichée à la fin : ${r.porteFin ? 'oui' : 'non'} | ${r.verif ? 'attente COLLÉE' : 'attente levée'} | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`${nom} : porte affichée=${r.porteFin}, connecté=${r.authed}, attente collée=${r.verif} — la porte doit apparaître, l'attente se lever`);
  }

  /* 8. LES FLOUS SE VOIENT. Page en nuit, contenu masqué (visibility), animations figées au repos : on lit
     la moyenne d'un carré 9×9 au cœur du flou violet, ramené dans l'écran. */
  {
    const q = await b.newPage();
    await q.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await q.setViewport({ width: 390, height: 844, isMobile: true });
    await q.goto(BASE, { waitUntil: 'networkidle0' });   // bypass dev localhost : boot réel, Mon site
    await q.waitForFunction(() => document.body.classList.contains('ecran-site'), { timeout: 10000 });
    const pt = await q.evaluate(() => {
      document.querySelectorAll('.flou-violet,.flou-jaune').forEach(e => { e.style.animation = 'none'; });
      document.querySelector('.app').style.visibility = 'hidden';
      const r = document.querySelector('.flou-violet').getBoundingClientRect();
      return { x: Math.min(innerWidth - 10, Math.max(10, r.left + r.width / 2)), y: Math.min(innerHeight - 10, Math.max(10, r.top + r.height / 2)) };
    });
    await pause(300);
    const png = await q.screenshot({ encoding: 'base64', clip: { x: pt.x - 4, y: pt.y - 4, width: 9, height: 9 } });
    const moy = await q.evaluate(src => new Promise(ok => {
      const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
        const t = [0, 0, 0]; for (let i = 0; i < d.length; i += 4){ t[0] += d[i]; t[1] += d[i + 1]; t[2] += d[i + 2]; }
        ok(t.map(v => Math.round(v / (d.length / 4)))); };
      im.src = 'data:image/png;base64,' + src;
    }), png);
    await q.close();
    const fond = [0x1A, 0x15, 0x26], ecart = moy.map((v, i) => v - fond[i]);
    const ok = ecart.every(e => e >= 10);
    lignes.push(`| flou violet · nuit (${Math.round(pt.x)}, ${Math.round(pt.y)}) | rgb(${moy.join(', ')}) | écart ${ecart.map(e => (e >= 0 ? '+' : '') + e).join(' / ')} vs #1A1526 | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`flou violet invisible : rgb(${moy.join(', ')}) au cœur, écart ${ecart.join('/')} au fond — il en faut ≥ 10 sur chaque canal`);
  }

  /* 9. LES TUILES. Une page neuve par cas, bypass dev localhost (le vrai boot). */
  const pageTuiles = async (configModifiee) => {
    const q = await b.newPage();
    await q.setViewport({ width: 390, height: 844, isMobile: true });
    if (configModifiee){
      await q.setRequestInterception(true);
      q.on('request', r => {
        if (r.url().endsWith('/_data/config.json')) r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(configModifiee) });
        else r.continue();
      });
    }
    await q.goto(BASE, { waitUntil: 'networkidle0' });
    /* Pas de tuile au bout de 10 s → on continue : les cas ci-dessous ROUGISSENT avec leur verdict, au lieu
       que la sonde plante sur une attente (vécu sur le code d'avant le bout 4). */
    await q.waitForFunction(() => document.querySelectorAll('#siteGrid .tuile[data-bloc]').length > 0, { timeout: 10000 }).catch(() => {});
    return q;
  };
  const lireTuiles = q => q.evaluate(() => [...document.querySelectorAll('#siteGrid .tuile[data-bloc]')].map(t => ({
    bloc: t.dataset.bloc, section: t.dataset.section, masquee: t.classList.contains('tuile--masquee'),
    grain: t.classList.contains('grain-papier'), sur: (t.querySelector('.t-sur') || {}).textContent })));
  {
    const q = await pageTuiles(null);
    /* L'attendu, calculé ICI : les sections de index.html (DOM) et les blocs de config.json. */
    const attendu = await q.evaluate(async () => {
      const html = await (await fetch('/')).text();
      const dom = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section[id]')].map(x => x.id);
      const cfg = await (await fetch('/_data/config.json')).json();
      const blocs = Object.entries({ ...cfg.blocs.socle, ...cfg.blocs.optionnels });
      let n = 0; const sansSection = [];
      for (const [cle, b] of blocs){
        const secs = (b.sections || []).filter(id => dom.includes(id));
        if (!secs.length){ sansSection.push(cle); continue; }
        n += Array.isArray(b.admin) ? b.admin.filter((a, i) => dom.includes((b.sections || [])[i])).length : 1;
      }
      return { n, dom, sansSection };
    });
    const t = await lireTuiles(q);
    const okN = t.length === attendu.n;
    lignes.push(`| tuiles · nombre | ${t.length} tuiles | attendu ${attendu.n} (blocs sans section : ${attendu.sansSection.join(', ') || 'aucun'}) | ${okN ? '✅' : '❌'} |`);
    if (!okN) fails.push(`tuiles : ${t.length} au lieu de ${attendu.n}`);
    const rangs = t.map(x => attendu.dom.indexOf(x.section));
    const okOrdre = t.length > 0 && rangs.every((r, i) => r >= 0 && (i === 0 || r > rangs[i - 1]));
    lignes.push(`| tuiles · ordre | ${t.map(x => x.section).join(' · ')} | rangs DOM ${rangs.join(' < ')} | ${okOrdre ? '✅' : '❌'} |`);
    if (!okOrdre) fails.push(`tuiles : ordre ${t.map(x => x.section).join(',')} ≠ ordre du DOM (rangs ${rangs.join(',')})`);
    /* Le surtitre d'une tuile à jour ne porte que son numéro (« 01 ») : pas de mot d'état. */
    const surAJour = t.filter(x => !x.masquee).map(x => x.sur);
    const okSur = surAJour.length > 0 && surAJour.every(x => /^\d\d$/.test(x));
    lignes.push(`| tuiles · surtitre à jour | ${surAJour.join(' · ')} | numéro seul | ${okSur ? '✅' : '❌'} |`);
    if (!okSur) fails.push(`tuiles : surtitres à jour « ${surAJour.join(' / ')} » — une tuile à jour ne porte que son numéro`);
    const okDujour = t.length > 0 && !t.some(x => x.bloc === 'dujour') && attendu.sansSection.includes('dujour');
    lignes.push(`| tuiles · plat du jour | ${t.some(x => x.bloc === 'dujour') ? 'PRÉSENT' : 'absent'} | sans section dans index.html | ${okDujour ? '✅' : '❌'} |`);
    if (!okDujour) fails.push('tuiles : le plat du jour a une tuile alors qu\'il n\'a aucune section sur le site');

    /* La bascule : un VRAI clic sur l'interrupteur des événements. */
    if (!(await q.$('#siteGrid .tuile[data-bloc="events"] .lelab-mini-toggle'))) fails.push('tuiles · bascule : pas d\'interrupteur sur une tuile « events »');
    else {
    const avant = await q.evaluate(() => ({ hash: location.hash }));
    await q.click('#siteGrid .tuile[data-bloc="events"] .lelab-mini-toggle');
    await pause(400);
    const apres = await q.evaluate(() => ({
      hash: location.hash, ecran: [...document.querySelectorAll('.screen.active')].map(s => s.id).join(','),
      btn: document.getElementById('btn-publish-sections').textContent.trim(),
      phrase: document.getElementById('publierPhrase').textContent,
      evt: document.querySelector('#siteGrid .tuile[data-bloc="events"]').classList.contains('tuile--masquee'),
    }));
    const okBascule = apres.ecran === 'screen-monsite' && apres.hash === avant.hash && apres.btn === 'Publier'
      && /^1 changement/.test(apres.phrase) && apres.evt;
    lignes.push(`| tuiles · bascule « Événements » | écran ${apres.ecran}, ${apres.hash} | ${apres.btn} · ${apres.phrase} · tuile ${apres.evt ? 'contour' : 'papier'} | ${okBascule ? '✅' : '❌'} |`);
    if (!okBascule) fails.push(`tuiles · bascule : écran ${apres.ecran}, hash ${apres.hash}, bouton « ${apres.btn} », « ${apres.phrase} », tuile masquée=${apres.evt} — la bascule ne doit pas naviguer, elle passe la tuile en contour et allume Publier`);
    }
    await q.close();
  }
  {
    /* Une COPIE de config.json, events en actif:false, servie à la place de l'originale. */
    const fs = require('fs'), path = require('path');
    const copie = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_data', 'config.json'), 'utf8'));
    copie.blocs.optionnels.events.actif = false;
    const q = await pageTuiles(copie);
    const t = (await lireTuiles(q)).find(x => x.bloc === 'events');
    const phrase = await q.evaluate(() => document.getElementById('accueilEtat').textContent);
    const ok = t && t.masquee && !t.grain && /^\d\d · Masquée$/.test(t.sur) && phrase === 'Votre site est à jour.';
    lignes.push(`| tuiles · events actif:false (copie) | ${t ? (t.masquee ? 'contour' : 'papier') + (t.grain ? ' + grain' : ' sans grain') + ' · « ' + t.sur + ' »' : 'ABSENTE'} | phrase « ${phrase} » | ${ok ? '✅' : '❌'} |`);
    if (!ok) fails.push(`tuiles · actif:false : tuile ${JSON.stringify(t)}, phrase « ${phrase} » — attendu contour sans grain, « Masquée », phrase « Votre site est à jour. »`);
    await q.close();
  }

  console.log('\n| cas | phrase | chip | |\n|---|---|---|---|');
  lignes.forEach(l => console.log(l));
  await b.close();
  if (fails.length){ console.error('\n❌ ACCUEIL — ' + fails.length + ' échec(s)\n   ' + fails.join('\n   ') + '\n'); process.exit(1); }
  console.log('\n✅ ACCUEIL — la phrase et la chip suivent l\'état des sections (0 / 1 / n), une section masquée ne compte jamais, le salut suit l\'heure et le prénom, l\'avatar ouvre un volet et seul son bouton déconnecte, le bouton Publier suit les changements, la porte de login ne clignote jamais, les flous se voient, les tuiles suivent le site.\n');
})();
